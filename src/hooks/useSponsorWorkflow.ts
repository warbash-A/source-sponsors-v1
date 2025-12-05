import { useState, useCallback } from "react";
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

const initialSteps: WorkflowStep[] = [
  { id: 1, name: "Input", description: "Event details", status: "active" },
  { id: 2, name: "Discovery", description: "Find events", status: "pending" },
  { id: 3, name: "Sponsors", description: "Identify sponsors", status: "pending" },
  { id: 4, name: "Emails", description: "Generate outreach", status: "pending" },
  { id: 5, name: "Export", description: "Download data", status: "pending" },
];

export function useSponsorWorkflow() {
  const [currentStep, setCurrentStep] = useState(0);
  const [steps, setSteps] = useState<WorkflowStep[]>(initialSteps);
  const [eventDetails, setEventDetails] = useState<EventDetails | null>(null);
  const [discoveredEvents, setDiscoveredEvents] = useState<DiscoveredEvent[]>([]);
  const [selectedEventIds, setSelectedEventIds] = useState<string[]>([]);
  const [sponsors, setSponsors] = useState<EnrichedSponsor[]>([]);
  const [emails, setEmails] = useState<EmailDraft[]>([]);
  const [dataSource, setDataSource] = useState<'eventbrite' | 'apify' | 'sample'>('sample');
  const [isLoading, setIsLoading] = useState(false);
  const [exportingFormat, setExportingFormat] = useState<ExportFormat | null>(null);
  const [completedExports, setCompletedExports] = useState<ExportFormat[]>([]);

  const updateStepStatus = useCallback((stepId: number, status: WorkflowStep['status']) => {
    setSteps((prev) =>
      prev.map((step) => (step.id === stepId ? { ...step, status } : step))
    );
  }, []);

  const handleEventSubmit = useCallback(async (details: EventDetails) => {
    setIsLoading(true);
    setEventDetails(details);
    updateStepStatus(1, "complete");
    updateStepStatus(2, "active");
    setCurrentStep(1);

    try {
      const { data, error } = await supabase.functions.invoke('event-discovery', {
        body: {
          keywords: `${details.name} ${details.industry} ${details.type}`,
          location: details.location,
        }
      });

      if (error) throw error;

      const events: DiscoveredEvent[] = data.events.map((e: any) => ({
        id: e.id,
        name: e.name,
        date: e.date,
        location: e.location,
        url: e.url,
        source: e.source,
        sponsorCount: e.sponsorCount,
      }));

      setDiscoveredEvents(events);
      setSelectedEventIds(events.map((e) => e.id));
      setDataSource(data.source || 'sample');
      updateStepStatus(2, "complete");
      toast.success(`Found ${events.length} events`);
    } catch (error) {
      console.error('Event discovery error:', error);
      toast.error('Failed to discover events. Using demo data.');
      // Fallback to sample data
      setDiscoveredEvents(getSampleEvents());
      setSelectedEventIds(getSampleEvents().map((e) => e.id));
      setDataSource("sample");
      updateStepStatus(2, "complete");
    } finally {
      setIsLoading(false);
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

    const selectedEvents = discoveredEvents.filter((e) =>
      selectedEventIds.includes(e.id)
    );

    try {
      // Step 1: Identify sponsors
      const { data: sponsorData, error: sponsorError } = await supabase.functions.invoke('sponsor-identification', {
        body: { events: selectedEvents }
      });

      if (sponsorError) throw sponsorError;

      // Step 2: Enrich contacts
      const { data: enrichedData, error: enrichError } = await supabase.functions.invoke('contact-enrichment', {
        body: { sponsors: sponsorData.sponsors }
      });

      if (enrichError) throw enrichError;

      const enrichedSponsors: EnrichedSponsor[] = enrichedData.sponsors.map((s: any) => ({
        id: s.id,
        name: s.name,
        tier: s.tier,
        website: s.website,
        domain: s.domain,
        events: s.eventIds || [],
        emails: s.emails || [],
        linkedinUrl: s.linkedinUrl,
        enrichmentStatus: s.enrichmentStatus === 'enriched' ? 'complete' : 
                         s.enrichmentStatus === 'partial' ? 'partial' : 'pending',
      }));

      setSponsors(enrichedSponsors);
      updateStepStatus(3, "complete");
      toast.success(`Identified ${enrichedSponsors.length} sponsors`);
    } catch (error) {
      console.error('Sponsor identification error:', error);
      toast.error('Failed to identify sponsors. Using demo data.');
      setSponsors(getSampleSponsors());
      updateStepStatus(3, "complete");
    } finally {
      setIsLoading(false);
    }
  }, [selectedEventIds, discoveredEvents, updateStepStatus]);

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
            events: discoveredEvents.filter(e => selectedEventIds.includes(e.id)),
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
  }, [discoveredEvents, selectedEventIds, sponsors, emails, eventDetails, completedExports, updateStepStatus]);

  const resetWorkflow = useCallback(() => {
    setCurrentStep(0);
    setSteps(initialSteps);
    setEventDetails(null);
    setDiscoveredEvents([]);
    setSelectedEventIds([]);
    setSponsors([]);
    setEmails([]);
    setDataSource("sample");
    setIsLoading(false);
    setExportingFormat(null);
    setCompletedExports([]);
  }, []);

  return {
    currentStep,
    steps,
    eventDetails,
    discoveredEvents,
    selectedEventIds,
    sponsors,
    emails,
    dataSource,
    isLoading,
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

// Fallback sample data
function getSampleEvents(): DiscoveredEvent[] {
  return [
    { id: "1", name: "TechCrunch Disrupt 2024", date: "Oct 28-30, 2024", location: "San Francisco, CA", url: "https://techcrunch.com/events/disrupt-2024", source: "sample", sponsorCount: 45 },
    { id: "2", name: "Web Summit 2024", date: "Nov 11-14, 2024", location: "Lisbon, Portugal", url: "https://websummit.com", source: "sample", sponsorCount: 120 },
    { id: "3", name: "SaaStr Annual 2024", date: "Sep 10-12, 2024", location: "San Francisco, CA", url: "https://saastr.com/annual", source: "sample", sponsorCount: 85 },
  ];
}

function getSampleSponsors(): EnrichedSponsor[] {
  return [
    { id: "s1", name: "Stripe", tier: "platinum", website: "https://stripe.com", domain: "stripe.com", events: ["1", "2"], emails: ["partnerships@stripe.com"], linkedinUrl: "https://linkedin.com/company/stripe", enrichmentStatus: "complete" },
    { id: "s2", name: "Salesforce", tier: "gold", website: "https://salesforce.com", domain: "salesforce.com", events: ["1"], emails: ["sponsorships@salesforce.com"], linkedinUrl: "https://linkedin.com/company/salesforce", enrichmentStatus: "complete" },
    { id: "s3", name: "HubSpot", tier: "silver", website: "https://hubspot.com", domain: "hubspot.com", events: ["2", "3"], emails: ["events@hubspot.com"], linkedinUrl: "https://linkedin.com/company/hubspot", enrichmentStatus: "complete" },
  ];
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
