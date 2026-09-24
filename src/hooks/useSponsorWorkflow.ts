import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { toast } from "sonner";
import type {
  EventDetails,
  DiscoveredEvent,
  EnrichedSponsor,
  EmailDraft,
  WorkflowStep,
  ExportFormat,
  EventSource,
} from "@/types/sponsor";

// ─── localStorage persistence ────────────────────────────────────────────────

interface PersistedWorkflow {
  eventDetails: EventDetails | null;
  events: DiscoveredEvent[];
  selectedEventIds: string[];
  sponsors: EnrichedSponsor[];
  currentStep: number;
  researchMode?: 'mine' | 'similar';
  searchQueries?: string[];
}

const STORAGE_KEY = 'sponsorscout_workflow';

const STORAGE_DEFAULTS: PersistedWorkflow = {
  eventDetails: null,
  events: [],
  selectedEventIds: [],
  sponsors: [],
  currentStep: 0,
  researchMode: 'mine',
  searchQueries: [],
};

function readFromStorage(): PersistedWorkflow {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return STORAGE_DEFAULTS;
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return STORAGE_DEFAULTS;
    }
    return {
      eventDetails: typeof parsed.eventDetails === 'object' && parsed.eventDetails !== null &&
        typeof parsed.eventDetails.name === 'string' &&
        typeof parsed.eventDetails.type === 'string' &&
        typeof parsed.eventDetails.industry === 'string' &&
        typeof parsed.eventDetails.location === 'string'
        ? parsed.eventDetails as EventDetails
        : STORAGE_DEFAULTS.eventDetails,
      events: Array.isArray(parsed.events)
        ? parsed.events
        : STORAGE_DEFAULTS.events,
      selectedEventIds: Array.isArray(parsed.selectedEventIds)
        ? parsed.selectedEventIds
        : STORAGE_DEFAULTS.selectedEventIds,
      sponsors: Array.isArray(parsed.sponsors)
        ? parsed.sponsors
        : STORAGE_DEFAULTS.sponsors,
      currentStep: typeof parsed.currentStep === 'number' && Number.isFinite(parsed.currentStep)
        ? Math.max(0, Math.min(initialSteps.length - 1, Math.round(parsed.currentStep)))
        : STORAGE_DEFAULTS.currentStep,
      researchMode: parsed.researchMode === 'similar' ? 'similar' : 'mine',
      searchQueries: Array.isArray(parsed.searchQueries)
        ? parsed.searchQueries
        : STORAGE_DEFAULTS.searchQueries,
    };
  } catch {
    return STORAGE_DEFAULTS;
  }
}

function writeToStorage(data: PersistedWorkflow): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Quota exceeded or storage disabled — fail silently
  }
}

// Identifies this browser's saved workflow in the database, so results can be
// restored after a refresh.
const WORKSPACE_KEY = 'sponsorscout_workspace_id';

function readWorkspaceId(): string {
  try {
    const existing = localStorage.getItem(WORKSPACE_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem(WORKSPACE_KEY, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

// ─────────────────────────────────────────────────────────────────────────────

const initialSteps: WorkflowStep[] = [
  { id: 1, name: "Input", description: "Event details", status: "active" },
  { id: 2, name: "Discovery", description: "Find events", status: "pending" },
  { id: 3, name: "Sponsors", description: "Identify sponsors", status: "pending" },
];

function deriveSteps(currentStep: number): WorkflowStep[] {
  return initialSteps.map((s) => ({
    ...s,
    status: s.id < currentStep + 1
      ? 'complete'
      : s.id === currentStep + 1
        ? 'active'
        : 'pending',
  }));
}

export function useSponsorWorkflow() {
  const stored = readFromStorage();

  const [currentStep, setCurrentStep] = useState<number>(stored.currentStep);
  const [steps, setSteps] = useState<WorkflowStep[]>(() => deriveSteps(stored.currentStep));
  const [eventDetails, setEventDetails] = useState<EventDetails | null>(stored.eventDetails);
  const [events, setEvents] = useState<DiscoveredEvent[]>(stored.events);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedEventIds, setSelectedEventIds] = useState<string[]>(stored.selectedEventIds);
  const [sponsors, setSponsors] = useState<EnrichedSponsor[]>(stored.sponsors);
  const [emails, setEmails] = useState<EmailDraft[]>([]);
  const [exportingFormat, setExportingFormat] = useState<ExportFormat | null>(null);
  const [completedExports, setCompletedExports] = useState<ExportFormat[]>([]);
  const [maxStepReached, setMaxStepReached] = useState<number>(stored.currentStep);
  const [researchMode, setResearchMode] = useState<'mine' | 'similar'>(stored.researchMode ?? 'mine');
  const [searchQueries, setSearchQueries] = useState<string[]>(stored.searchQueries ?? []);
  const [isPrescanning, setIsPrescanning] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<{
    currentEvent: number;
    totalEvents: number;
    eventName: string;
    status: 'idle' | 'processing' | 'complete' | 'error';
  } | null>(null);
  const workspaceId = readWorkspaceId();
  const [isCloudSynced, setIsCloudSynced] = useState(false);

  useEffect(() => {
    setMaxStepReached((prev) => (currentStep > prev ? currentStep : prev));
  }, [currentStep]);

  const updateStepStatus = useCallback((stepId: number, status: WorkflowStep['status']) => {
    setSteps((prev) =>
      prev.map((step) => (step.id === stepId ? { ...step, status } : step))
    );
  }, []);

  useEffect(() => {
    writeToStorage({ eventDetails, events, selectedEventIds, sponsors, currentStep, researchMode, searchQueries });
  }, [eventDetails, events, selectedEventIds, sponsors, currentStep, researchMode, searchQueries]);

  // Restore the saved workflow from the database once when the app loads.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('sponsor_workflows')
          .select('state')
          .eq('workspace_id', workspaceId)
          .maybeSingle();
        if (!cancelled && !error && data?.state && typeof data.state === 'object') {
          const s = data.state as unknown as PersistedWorkflow;
          setEventDetails(s.eventDetails ?? null);
          setEvents(Array.isArray(s.events) ? s.events : []);
          setSelectedEventIds(Array.isArray(s.selectedEventIds) ? s.selectedEventIds : []);
          setSponsors(Array.isArray(s.sponsors) ? s.sponsors : []);
          setResearchMode(s.researchMode === 'similar' ? 'similar' : 'mine');
          setSearchQueries(Array.isArray(s.searchQueries) ? s.searchQueries : []);
          const step = typeof s.currentStep === 'number' && Number.isFinite(s.currentStep)
            ? Math.max(0, Math.min(initialSteps.length - 1, Math.round(s.currentStep)))
            : 0;
          setCurrentStep(step);
          setMaxStepReached(step);
          setSteps(deriveSteps(step));
        }
      } catch (err) {
        console.error('Workflow restore error:', err);
      } finally {
        if (!cancelled) setIsCloudSynced(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  // Mirror every workflow change to the database (debounced) so it survives refreshes.
  useEffect(() => {
    if (!isCloudSynced) return;
    const timer = setTimeout(() => {
      void supabase
        .from('sponsor_workflows')
        .upsert(
          {
            workspace_id: workspaceId,
            state: {
              eventDetails, events, selectedEventIds, sponsors,
              currentStep, researchMode, searchQueries,
            } as unknown as Json,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'workspace_id' },
        );
    }, 1000);
    return () => clearTimeout(timer);
  }, [isCloudSynced, workspaceId, eventDetails, events, selectedEventIds, sponsors, currentStep, researchMode, searchQueries]);

  /**
   * Reads sponsor pages for every discovered event, in small batches, so the user can
   * see how many sponsors each event has before choosing which ones to work with.
   */
  const prescanSponsorCounts = useCallback(async (candidates: DiscoveredEvent[]) => {
    if (candidates.length === 0) return;
    setIsPrescanning(true);
    try {
      const BATCH = 4;
      for (let i = 0; i < candidates.length; i += BATCH) {
        const batch = candidates.slice(i, i + BATCH);
        try {
          const { data, error } = await supabase.functions.invoke('sponsor-identification', {
            body: { events: batch },
          });
          if (error) throw error;

          const counts = new Map<string, number>();
          for (const id of batch.map((c) => c.id)) counts.set(id, 0);
          for (const sponsor of data?.sponsors ?? []) {
            for (const eventId of sponsor.eventIds ?? []) {
              counts.set(eventId, (counts.get(eventId) || 0) + 1);
            }
          }

          setEvents((prev) =>
            prev.map((event) =>
              counts.has(event.id) ? { ...event, sponsorCount: counts.get(event.id) } : event
            )
          );
        } catch (err) {
          console.error('Sponsor pre-scan batch error:', err);
        }
      }
    } finally {
      setIsPrescanning(false);
    }
  }, []);


  const handleEventSubmit = useCallback(async (details: EventDetails) => {
    setEventDetails(details);
    setEvents([]);
    setSelectedEventIds([]);
    setSearchQueries([]);
    setResearchMode(details.researchMode ?? 'mine');
    updateStepStatus(1, "complete");
    updateStepStatus(2, "active");
    setCurrentStep(1);
    setIsLoadingEvents(true);

    const mode = details.researchMode ?? 'mine';
    const eventCount = details.eventCount ?? 10;

    try {
      let queries: string[] = [];

      if (mode === 'similar') {
        const { data: queryData, error: queryError } = await supabase.functions.invoke('similar-event-queries', {
          body: {
            name: details.name,
            type: details.type,
            industry: details.industry,
            location: details.location,
            description: details.description,
            focusTags: details.focusTags,
          },
        });

        if (queryError) throw queryError;
        queries = (queryData?.queries ?? []).filter((q: unknown) => typeof q === 'string');
        setSearchQueries(queries);

        if (queries.length === 0) {
          setEvents([]);
          updateStepStatus(2, "complete");
          toast.warning('Could not generate similar-event queries. Try adding a description or focus tags.');
          setIsLoadingEvents(false);
          return;
        }
      } else {
        queries = [`${details.name} ${details.industry} ${details.type}`];
        setSearchQueries(queries);
      }

      const seen = new Set<string>();
      const found: DiscoveredEvent[] = [];
      let lastMessage: string | undefined;
      const sources: EventSource[] = details.sources?.length ? details.sources : ['web', 'luma'];

      for (const query of queries) {
        if (found.length >= eventCount) break;

        for (const source of sources) {
          if (found.length >= eventCount) break;

          const remaining = eventCount - found.length;
          const { data, error } = source === 'luma'
            ? await supabase.functions.invoke('luma-discovery', {
                body: { keywords: query, location: details.location, eventCount: Math.min(remaining, 50) },
              })
            : await supabase.functions.invoke('web-event-discovery', {
                body: {
                  keywords: query,
                  location: details.location,
                  channel: source === 'web' ? 'web' : source,
                  eventCount: Math.min(remaining, 25),
                },
              });

          if (error) {
            console.error('Event discovery error:', source, query, error);
            continue;
          }

          const payload = data ?? {};
          if (payload.message) lastMessage = payload.message;

          for (const e of payload.events ?? []) {
            const url = (e.url ?? '').trim();
            const name = (e.name ?? '').trim();
            if (!name || !url.startsWith('http') || seen.has(url)) continue;
            seen.add(url);
            found.push({
              id: crypto.randomUUID(),
              name,
              url,
              date: e.date?.trim() || 'TBD',
              location: e.location?.trim() || details.location || 'See event page',
              source,
              query: mode === 'similar' ? query : undefined,
            });
            if (found.length >= eventCount) break;
          }
        }
      }

      setEvents(found);
      updateStepStatus(2, "complete");

      if (found.length === 0) {
        toast.warning(
          lastMessage ??
          'No events found. Try broader keywords like "tech conference" or manually paste event URLs.',
          { duration: 6000 }
        );
      } else if (found.length > 0) {
        toast.success(`Found ${found.length} event${found.length === 1 ? '' : 's'}`);
        void prescanSponsorCounts(found);
      }
    } catch (err) {
      console.error('Event discovery error:', err);
      setEvents([]);
      updateStepStatus(2, "complete");

      const errorMessage = err instanceof Error ? err.message : 'Unknown error';

      if (errorMessage.includes('timeout')) {
        toast.error(
          'Event search timed out. Try broader keywords or manually paste event URLs.',
          { duration: 6000 }
        );
      } else {
        toast.error(
          'Could not find events. Try different keywords or use the "Paste Event URL" option.',
          { duration: 5000 }
        );
      }
    } finally {
      setIsLoadingEvents(false);
    }
  }, [updateStepStatus, prescanSponsorCounts]);

  const handleAddEventFromUrl = useCallback(async (url: string) => {
    setIsLoadingEvents(true);
    try {
      const { data, error } = await supabase.functions.invoke('event-from-url', {
        body: { url },
      });

      if (error) throw error;

      const raw = data?.event;
      if (!raw) {
        toast.warning(data?.message ?? 'Could not read that event URL.');
        return;
      }

      const event: DiscoveredEvent = {
        id: crypto.randomUUID(),
        name: raw.name,
        url: raw.url,
        date: raw.date,
        location: raw.location,
        source: 'manual',
      };

      let isDuplicate = false;
      setEvents((prev) => {
        if (prev.some((e) => e.url === event.url)) {
          isDuplicate = true;
          toast.info('That event is already in your list.');
          return prev;
        }
        return [...prev, event];
      });
      if (!isDuplicate) {
        toast.success(`Added "${event.name}"`);
        void prescanSponsorCounts([event]);
      }
    } catch (err) {
      console.error('Add event from URL error:', err);
      toast.error('Could not add event from URL.');
    } finally {
      setIsLoadingEvents(false);
    }
  }, [prescanSponsorCounts]);


  const handleToggleEvent = useCallback((eventId: string) => {
    setSelectedEventIds((prev) =>
      prev.includes(eventId)
        ? prev.filter((id) => id !== eventId)
        : [...prev, eventId]
    );
  }, []);

  const handleProceedToSponsors = useCallback(async () => {
    setIsLoading(true);
    updateStepStatus(3, "active");
    setCurrentStep(2);

    const selectedEvents = events.filter((e) =>
      selectedEventIds.includes(e.id)
    );

    setProcessingStatus({
      currentEvent: 0,
      totalEvents: selectedEvents.length,
      eventName: 'Starting...',
      status: 'processing',
    });

    try {
      // Update progress - starting sponsor identification
      setProcessingStatus({
        currentEvent: 1,
        totalEvents: selectedEvents.length,
        eventName: selectedEvents.length > 1
          ? `${selectedEvents.length} events`
          : selectedEvents[0].name,
        status: 'processing',
      });

      const { data: sponsorData, error: sponsorError } = await supabase.functions.invoke('sponsor-identification', {
        body: { events: selectedEvents }
      });

      if (sponsorError) throw sponsorError;

      const identified = sponsorData?.sponsors ?? [];
      const skipped: string[] = sponsorData?.eventsWithoutSponsors ?? [];

      // Update each selected event with how many sponsors were found on it.
      const sponsorCounts = new Map<string, number>();
      for (const sponsor of identified) {
        for (const eventId of sponsor.eventIds ?? []) {
          sponsorCounts.set(eventId, (sponsorCounts.get(eventId) || 0) + 1);
        }
      }
      setEvents((prev) =>
        prev.map((event) =>
          selectedEventIds.includes(event.id)
            ? { ...event, sponsorCount: sponsorCounts.get(event.id) || 0 }
            : event
        )
      );

      if (identified.length === 0) {
        setSponsors([]);
        updateStepStatus(3, "complete");
        toast.warning(
          sponsorData?.message ??
            'No sponsors were listed on the selected event pages. Try events that publish a sponsors page.'
        );
        return;
      }


      // Show the sponsor list straight away; contact details fill in afterwards.
      const baseSponsors: EnrichedSponsor[] = identified.map((s: any) => ({
        id: s.id,
        name: s.name,
        tier: s.tier,
        website: s.website,
        events: s.eventNames?.length ? s.eventNames : (s.eventIds || []),
        emails: [],
        emailDetails: [],
        sourceUrl: s.sourceUrl,
        enrichmentStatus: 'processing',
        eventCount: s.eventCount ?? (s.eventIds?.length ?? 1),
      }));

      setSponsors(baseSponsors);
      updateStepStatus(3, "complete");
      setProcessingStatus({
        currentEvent: selectedEvents.length,
        totalEvents: selectedEvents.length,
        eventName: 'Complete',
        status: 'complete',
      });

      // Clear status after 2 seconds
      setTimeout(() => setProcessingStatus(null), 2000);

      setIsLoading(false);
      toast.success(
        `Found ${baseSponsors.length} sponsor${baseSponsors.length === 1 ? '' : 's'}` +
          (skipped.length > 0 ? ` — ${skipped.length} event page(s) listed none` : '')
      );

      // Enrich in small batches so a slow or failing batch can't wipe the list.
      const BATCH = 5;
      for (let i = 0; i < identified.length; i += BATCH) {
        const batch = identified.slice(i, i + BATCH);
        try {
          const { data: enrichedData, error: enrichError } = await supabase.functions.invoke(
            'contact-enrichment',
            { body: { sponsors: batch } },
          );
          if (enrichError) throw enrichError;

          const byId = new Map<string, any>(
            (enrichedData?.sponsors ?? []).map((s: any) => [s.id, s]),
          );
          setSponsors((prev) =>
            prev.map((sponsor) => {
              const s = byId.get(sponsor.id);
              if (!s) return sponsor;
              return {
                ...sponsor,
                website: s.website ?? sponsor.website,
                domain: s.domain,
                emails: s.emails || [],
                emailDetails: s.emailDetails || [],
                linkedinUrl: s.linkedinUrl,
                enrichmentStatus:
                  s.enrichmentStatus === 'enriched'
                    ? 'complete'
                    : s.enrichmentStatus === 'partial'
                      ? 'partial'
                      : 'failed',
              };
            }),
          );
        } catch (err) {
          console.error('Contact enrichment batch error:', err);
          const ids = new Set(batch.map((s: any) => s.id));
          setSponsors((prev) =>
            prev.map((sponsor) =>
              ids.has(sponsor.id) && sponsor.enrichmentStatus === 'processing'
                ? { ...sponsor, enrichmentStatus: 'failed' }
                : sponsor,
            ),
          );
        }
      }
    } catch (error) {
      console.error('Sponsor identification error:', error);

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (errorMessage.includes('timeout') || errorMessage.includes('fetch')) {
        toast.error(
          'Sponsor extraction timed out. Try selecting fewer events or use the "Paste Event URL" option for specific events.',
          { duration: 6000 }
        );
      } else if (errorMessage.includes('429')) {
        toast.error(
          'Too many requests. Please wait a moment and try again.',
          { duration: 5000 }
        );
      } else {
        toast.error(
          'Could not read sponsors from the selected events. Try manually pasting event URLs instead.',
          { duration: 5000 }
        );
      }

      setSponsors([]);
      updateStepStatus(3, "complete");
      setProcessingStatus({
        currentEvent: 0,
        totalEvents: 0,
        eventName: 'Error',
        status: 'error',
      });
      setTimeout(() => setProcessingStatus(null), 3000);
      setIsLoading(false);
    }
  }, [selectedEventIds, events, updateStepStatus]);

  const handleGenerateEmails = useCallback(async () => {
    setIsLoading(true);
    updateStepStatus(4, "active");
    setCurrentStep(3);

    try {
      const { data, error } = await supabase.functions.invoke('email-generation', {
        body: {
          sponsors: sponsors.map(s => ({
            id: s.id,
            name: s.name,
            tier: s.tier,
            website: s.website,
            domain: s.domain,
            emails: s.emails,
            eventIds: s.events,
            eventCount: s.events.length,
          })),
          eventName: eventDetails?.name || 'Your Event',
          senderName: eventDetails?.senderName?.trim() || 'Your Name',
          senderOrganization: eventDetails?.senderOrganization?.trim() || undefined,
          template: 'partnership',
        }
      });

      if (error) throw error;

      const generatedEmails: EmailDraft[] = data.emails.map((e: any) => ({
        sponsorId: e.sponsorId,
        sponsorName: e.sponsorName,
        subject: e.subject,
        subjectVariations: [],
        body: e.body,
        generatedWith: data.usedAI ? 'ai' : 'template',
      }));

      setEmails(generatedEmails);
      updateStepStatus(4, "complete");
      toast.success(`Generated ${generatedEmails.length} email drafts`);
    } catch (error) {
      console.error('Email generation error:', error);
      toast.error('Failed to generate emails. Using templates.');
      const fallbackEmails = sponsors.map((sponsor) => ({
        sponsorId: sponsor.id,
        sponsorName: sponsor.name,
        subject: `Partnership Opportunity: ${eventDetails?.name} - ${sponsor.name}`,
        subjectVariations: [],
        body: generateFallbackEmail(
          sponsor,
          eventDetails?.name || 'Your Event',
          eventDetails?.senderName?.trim() || 'Your Name',
          eventDetails?.senderOrganization?.trim() || undefined,
        ),
        generatedWith: 'template' as const,
      }));
      setEmails(fallbackEmails);
      updateStepStatus(4, "complete");
    } finally {
      setIsLoading(false);
    }
  }, [sponsors, eventDetails, updateStepStatus]);

  const handleProceedToExport = useCallback(() => {
    updateStepStatus(5, "active");
    setCurrentStep(4);
  }, [updateStepStatus]);

  const handleExport = useCallback(async (format: ExportFormat) => {
    setExportingFormat(format);

    try {
      const { data, error } = await supabase.functions.invoke('export-data', {
        body: {
          format,
          data: {
            events: events.filter(e => selectedEventIds.includes(e.id)),
            sponsors,
            emails,
          },
          eventName: eventDetails?.name,
        }
      });

      if (error) throw error;

      const payload =
        data.encoding === 'base64'
          ? Uint8Array.from(atob(data.content), (c) => c.charCodeAt(0))
          : data.content;
      const blob = new Blob([payload], { type: data.contentType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = data.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setCompletedExports((prev) =>
        prev.includes(format) ? prev : [...prev, format]
      );
      toast.success(`Exported ${format.toUpperCase()} file`);
      
      if (!completedExports.includes(format)) {
        updateStepStatus(5, "complete");
      }
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export data');
    } finally {
      setExportingFormat(null);
    }
  }, [events, selectedEventIds, sponsors, emails, eventDetails, completedExports, updateStepStatus]);

  const resetWorkflow = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    void supabase.from('sponsor_workflows').delete().eq('workspace_id', workspaceId);
    setCurrentStep(0);
    setSteps(initialSteps);
    setEventDetails(null);
    setEvents([]);
    setIsLoadingEvents(false);
    setIsLoading(false);
    setSelectedEventIds([]);
    setSponsors([]);
    setEmails([]);
    setExportingFormat(null);
    setCompletedExports([]);
    setMaxStepReached(0);
    setResearchMode('mine');
    setSearchQueries([]);
  }, []);

  const goToStep = useCallback((step: number) => {
    if (step < 0 || step > maxStepReached) return;
    setCurrentStep(step);
    setSteps((prev) =>
      prev.map((s) => ({
        ...s,
        status:
          s.id === step + 1
            ? 'active'
            : s.id <= maxStepReached + 1
              ? 'complete'
              : 'pending',
      }))
    );
  }, [maxStepReached]);

  const handleGoBack = useCallback(() => {
    goToStep(Math.max(0, currentStep - 1));
  }, [currentStep, goToStep]);

  return {
    currentStep,
    steps,
    eventDetails,
    events,
    isLoadingEvents,
    isPrescanning,
    isLoading,
    selectedEventIds,
    sponsors,
    emails,
    exportingFormat,
    completedExports,
    researchMode,
    searchQueries,
    processingStatus,
    handleEventSubmit,
    handleAddEventFromUrl,
    handleToggleEvent,
    handleProceedToSponsors,
    handleGenerateEmails,
    handleProceedToExport,
    handleExport,
    resetWorkflow,
    maxStepReached,
    goToStep,
    handleGoBack,
  };
}

function generateFallbackEmail(
  sponsor: EnrichedSponsor,
  eventName: string,
  senderName = 'Your Name',
  senderOrganization?: string,
): string {
  const from = senderOrganization ? `${senderName}, ${senderOrganization}` : senderName;
  return `Dear ${sponsor.name} Team,

I hope this message finds you well. I'm reaching out regarding a potential partnership opportunity for ${eventName}.

Having seen ${sponsor.name}'s impressive presence at industry events, I believe there's a strong alignment between our audience and your brand's objectives.

Our event offers premium brand visibility and access to qualified attendees in our industry.

Would you be available for a brief call to discuss further?

Best regards,
${from}`;
}
