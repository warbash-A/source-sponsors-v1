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
  eventbriteEvents: DiscoveredEvent[];
  meetupEvents: DiscoveredEvent[];
  selectedEventIds: string[];
  sponsors: EnrichedSponsor[];
  currentStep: number;
}

const STORAGE_KEY = 'sponsorscout_workflow';

const STORAGE_DEFAULTS: PersistedWorkflow = {
  eventDetails: null,
  eventbriteEvents: [],
  meetupEvents: [],
  selectedEventIds: [],
  sponsors: [],
  currentStep: 0,
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
      // eventDetails may legitimately be null (not yet submitted); the check below
      // falls through to STORAGE_DEFAULTS.eventDetails (also null) in that case.
      eventDetails: typeof parsed.eventDetails === 'object' && parsed.eventDetails !== null &&
        typeof parsed.eventDetails.name === 'string' &&
        typeof parsed.eventDetails.type === 'string' &&
        typeof parsed.eventDetails.industry === 'string' &&
        typeof parsed.eventDetails.location === 'string'
        ? parsed.eventDetails as EventDetails
        : STORAGE_DEFAULTS.eventDetails,
      eventbriteEvents: Array.isArray(parsed.eventbriteEvents)
        ? parsed.eventbriteEvents
        : STORAGE_DEFAULTS.eventbriteEvents,
      meetupEvents: Array.isArray(parsed.meetupEvents)
        ? parsed.meetupEvents
        : STORAGE_DEFAULTS.meetupEvents,
      selectedEventIds: Array.isArray(parsed.selectedEventIds)
        ? parsed.selectedEventIds
        : STORAGE_DEFAULTS.selectedEventIds,
      sponsors: Array.isArray(parsed.sponsors)
        ? parsed.sponsors
        : STORAGE_DEFAULTS.sponsors,
      currentStep: typeof parsed.currentStep === 'number' && Number.isFinite(parsed.currentStep)
        ? Math.max(0, Math.min(initialSteps.length - 1, Math.round(parsed.currentStep)))
        : STORAGE_DEFAULTS.currentStep,
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
  const [eventbriteEvents, setEventbriteEvents] = useState<DiscoveredEvent[]>(stored.eventbriteEvents);
  const [meetupEvents, setMeetupEvents] = useState<DiscoveredEvent[]>(stored.meetupEvents);
  const [isLoadingEventbrite, setIsLoadingEventbrite] = useState(false);
  const [isLoadingMeetup, setIsLoadingMeetup] = useState(false);
  // Keep a separate isLoading for downstream steps (sponsors, emails, export)
  const [isLoading, setIsLoading] = useState(false);
  const [selectedEventIds, setSelectedEventIds] = useState<string[]>(stored.selectedEventIds);
  const [sponsors, setSponsors] = useState<EnrichedSponsor[]>(stored.sponsors);
  const [emails, setEmails] = useState<EmailDraft[]>([]);
  const [exportingFormat, setExportingFormat] = useState<ExportFormat | null>(null);
  const [completedExports, setCompletedExports] = useState<ExportFormat[]>([]);

  const updateStepStatus = useCallback((stepId: number, status: WorkflowStep['status']) => {
    setSteps((prev) =>
      prev.map((step) => (step.id === stepId ? { ...step, status } : step))
    );
  }, []);

  // Persist workflow state to localStorage on every relevant change.
  // Single effect (not one per slice) to avoid read-modify-write races
  // when multiple slices update in the same render cycle (React 18 batching).
  useEffect(() => {
    writeToStorage({ eventDetails, eventbriteEvents, meetupEvents, selectedEventIds, sponsors, currentStep });
  }, [eventDetails, eventbriteEvents, meetupEvents, selectedEventIds, sponsors, currentStep]);

  const handleEventSubmit = useCallback(async (details: EventDetails) => {
    setEventDetails(details);
    setEventbriteEvents([]);
    setMeetupEvents([]);
    setSelectedEventIds([]);
    updateStepStatus(1, "complete");
    updateStepStatus(2, "active");
    setCurrentStep(1);

    const wantsEventbrite = details.sources?.includes('eventbrite') ?? true;
    const wantsMeetup = details.sources?.includes('meetup') ?? false;

    if (wantsEventbrite) setIsLoadingEventbrite(true);
    if (wantsMeetup) setIsLoadingMeetup(true);

    const keywords = `${details.name} ${details.industry} ${details.type}`;

    try {
      const [ebrResult, meetupResult] = await Promise.allSettled([
        wantsEventbrite
          ? supabase.functions.invoke('event-discovery', {
              body: { keywords, location: details.location },
            })
          : Promise.resolve({ data: { events: [] }, error: null }),
        wantsMeetup
          ? supabase.functions.invoke('meetup-discovery', {
              body: { keywords, location: details.location },
            })
          : Promise.resolve({ data: { events: [] }, error: null }),
      ]);

      let totalFound = 0;

      // --- Eventbrite result ---
      // Use inline narrowing (not a pre-evaluated boolean) so TypeScript narrows
      // ebrResult to PromiseFulfilledResult inside the if-block.
      if (wantsEventbrite) {
        if (ebrResult.status === 'fulfilled' && !ebrResult.value.error) {
          const payload = ebrResult.value.data ?? {};
          const events: DiscoveredEvent[] = (payload.events ?? []).map((e: any) => ({
            id: e.id,
            name: e.name,
            date: e.date,
            location: e.location,
            url: e.url,
            source: 'eventbrite' as const,
            sponsorCount: e.sponsorCount,
          }));
          setEventbriteEvents(events);
          totalFound += events.length;
          if (events.length === 0 && payload.message) {
            toast.warning(payload.message);
          }
        } else {
          setEventbriteEvents([]);
          toast.error('Eventbrite search failed — no Eventbrite results.');
        }
      }

      // --- Meetup result ---
      // Same pattern: inline narrowing for TypeScript to recognise .value
      if (wantsMeetup) {
        if (meetupResult.status === 'fulfilled' && !meetupResult.value.error) {
          const payload = meetupResult.value.data ?? {};
          const events: DiscoveredEvent[] = (payload.events ?? []).map((e: any) => ({
            id: e.id,
            name: e.name,
            date: e.date,
            location: e.location,
            url: e.url,
            source: 'meetup' as const,
            sponsorCount: e.sponsorCount,
          }));
          setMeetupEvents(events);
          totalFound += events.length;
          if (events.length === 0 && payload.message) {
            toast.warning(payload.message);
          }
        } else {
          setMeetupEvents([]);
          toast.error('Could not reach Meetup — no Meetup results.');
        }
      }

      updateStepStatus(2, "complete");
      if (totalFound > 0) {
        toast.success(`Found ${totalFound} event${totalFound === 1 ? '' : 's'}`);
      } else {
        toast.warning('No events found. Try broader keywords or a different location.');
      }
    } finally {
      setIsLoadingEventbrite(false);
      setIsLoadingMeetup(false);
    }
  }, [updateStepStatus]);

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

    const selectedEvents = [...eventbriteEvents, ...meetupEvents].filter((e) =>
      selectedEventIds.includes(e.id)
    );

    try {
      // Step 1: Identify sponsors
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

      // Step 2: Enrich contacts
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
  }, [selectedEventIds, eventbriteEvents, meetupEvents, updateStepStatus]);

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
          senderName: 'Your Name',
          senderOrganization: eventDetails?.name,
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
        body: generateFallbackEmail(sponsor, eventDetails?.name || 'Your Event'),
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
          format: format === 'excel' ? 'csv' : format,
          data: {
            events: [...eventbriteEvents, ...meetupEvents].filter(e => selectedEventIds.includes(e.id)),
            sponsors,
            emails,
          },
          eventName: eventDetails?.name,
        }
      });

      if (error) throw error;

      // Download the file
      const blob = new Blob([data.content], { type: data.contentType });
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
  }, [eventbriteEvents, meetupEvents, selectedEventIds, sponsors, emails, eventDetails, completedExports, updateStepStatus]);

  const resetWorkflow = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setCurrentStep(0);
    setSteps(initialSteps);
    setEventDetails(null);
    setEventbriteEvents([]);
    setMeetupEvents([]);
    setIsLoadingEventbrite(false);
    setIsLoadingMeetup(false);
    setIsLoading(false);
    setSelectedEventIds([]);
    setSponsors([]);
    setEmails([]);
    setExportingFormat(null);
    setCompletedExports([]);
  }, []);

  return {
    currentStep,
    steps,
    eventDetails,
    eventbriteEvents,
    meetupEvents,
    isLoadingEventbrite,
    isLoadingMeetup,
    isLoading,
    selectedEventIds,
    sponsors,
    emails,
    exportingFormat,
    completedExports,
    handleEventSubmit,
    handleToggleEvent,
    handleProceedToSponsors,
    handleGenerateEmails,
    handleProceedToExport,
    handleExport,
    resetWorkflow,
  };
}


function generateFallbackEmail(sponsor: EnrichedSponsor, eventName: string): string {
  return `Dear ${sponsor.name} Team,

I hope this message finds you well. I'm reaching out regarding a potential partnership opportunity for ${eventName}.

Having seen ${sponsor.name}'s impressive presence at industry events, I believe there's a strong alignment between our audience and your brand's objectives.

Our event offers premium brand visibility and access to qualified attendees in our industry.

Would you be available for a brief call to discuss further?

Best regards,
[Your Name]`;
}
