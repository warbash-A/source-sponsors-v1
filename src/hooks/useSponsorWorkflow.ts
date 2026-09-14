import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type {
  EventDetails,
  DiscoveredEvent,
  EnrichedSponsor,
  EmailDraft,
  WorkflowStep,
  ExportFormat,
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

// ─────────────────────────────────────────────────────────────────────────────

const initialSteps: WorkflowStep[] = [
  { id: 1, name: "Input", description: "Event details", status: "active" },
  { id: 2, name: "Discovery", description: "Find events", status: "pending" },
  { id: 3, name: "Sponsors", description: "Identify sponsors", status: "pending" },
  { id: 4, name: "Emails", description: "Generate outreach", status: "pending" },
  { id: 5, name: "Export", description: "Download data", status: "pending" },
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

      for (const query of queries) {
        if (found.length >= eventCount) break;

        const { data, error } = await supabase.functions.invoke('meetup-discovery', {
          body: {
            keywords: query,
            location: details.location,
            eventCount: Math.min(eventCount - found.length, 50),
          },
        });

        if (error) {
          console.error('Meetup discovery error for query:', query, error);
          continue;
        }

        const payload = data ?? {};
        lastMessage = payload.message;

        for (const e of payload.events ?? []) {
          const url = (e.url ?? '').trim();
          const name = (e.name ?? '').trim();
          if (!name || !url.includes('meetup.com') || seen.has(url)) continue;
          seen.add(url);
          found.push({
            id: crypto.randomUUID(),
            name,
            url,
            date: e.date?.trim() || 'TBD',
            location: e.location?.trim() || details.location || 'See event page',
            source: 'meetup' as const,
            query: mode === 'similar' ? query : undefined,
          });
          if (found.length >= eventCount) break;
        }
      }

      setEvents(found);
      updateStepStatus(2, "complete");

      if (found.length > 0) {
        toast.success(`Found ${found.length} event${found.length === 1 ? '' : 's'}`);
      } else {
        toast.warning(
          lastMessage ?? 'No events found. Try broader keywords, a different location, or paste event URLs directly.'
        );
      }
    } catch (err) {
      console.error('Event discovery error:', err);
      setEvents([]);
      updateStepStatus(2, "complete");
      toast.error('Could not reach event discovery. Try again in a moment.');
    } finally {
      setIsLoadingEvents(false);
    }
  }, [updateStepStatus]);

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

      setEvents((prev) => {
        if (prev.some((e) => e.url === event.url)) {
          toast.info('That event is already in your list.');
          return prev;
        }
        return [...prev, event];
      });
      toast.success(`Added "${event.name}"`);
    } catch (err) {
      console.error('Add event from URL error:', err);
      toast.error('Could not add event from URL.');
    } finally {
      setIsLoadingEvents(false);
    }
  }, []);

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

    try {
      const { data: sponsorData, error: sponsorError } = await supabase.functions.invoke('sponsor-identification', {
        body: { events: selectedEvents }
      });

      if (sponsorError) throw sponsorError;

      const identified = sponsorData?.sponsors ?? [];
      const skipped: string[] = sponsorData?.eventsWithoutSponsors ?? [];

      if (identified.length === 0) {
        setSponsors([]);
        updateStepStatus(3, "complete");
        toast.warning(
          sponsorData?.message ??
            'No sponsors were listed on the selected event pages. Try events that publish a sponsors page.'
        );
        return;
      }

      const { data: enrichedData, error: enrichError } = await supabase.functions.invoke('contact-enrichment', {
        body: { sponsors: identified }
      });

      if (enrichError) throw enrichError;

      const enrichedSponsors: EnrichedSponsor[] = enrichedData.sponsors.map((s: any) => ({
        id: s.id,
        name: s.name,
        tier: s.tier,
        website: s.website,
        domain: s.domain,
        events: s.eventNames?.length ? s.eventNames : (s.eventIds || []),
        emails: s.emails || [],
        emailDetails: s.emailDetails || [],
        sourceUrl: s.sourceUrl,
        linkedinUrl: s.linkedinUrl,
        enrichmentStatus: s.enrichmentStatus === 'enriched' ? 'complete' :
                         s.enrichmentStatus === 'partial' ? 'partial' : 'failed',
        eventCount: s.eventCount ?? (s.eventIds?.length ?? 1),
      }));

      setSponsors(enrichedSponsors);
      updateStepStatus(3, "complete");
      toast.success(
        `Found ${enrichedSponsors.length} sponsor${enrichedSponsors.length === 1 ? '' : 's'}` +
          (skipped.length > 0 ? ` — ${skipped.length} event page(s) listed none` : '')
      );
    } catch (error) {
      console.error('Sponsor identification error:', error);
      setSponsors([]);
      toast.error('Could not read sponsors from the selected events.');
      updateStepStatus(3, "complete");
    } finally {
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
    isLoading,
    selectedEventIds,
    sponsors,
    emails,
    exportingFormat,
    completedExports,
    researchMode,
    searchQueries,
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
