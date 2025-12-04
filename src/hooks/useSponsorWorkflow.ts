import { useState, useCallback } from "react";
import type {
  EventDetails,
  DiscoveredEvent,
  EnrichedSponsor,
  EmailDraft,
  WorkflowStep,
  ExportFormat,
} from "@/types/sponsor";

// Sample data for demo mode
const sampleEvents: DiscoveredEvent[] = [
  {
    id: "1",
    name: "TechCrunch Disrupt 2024",
    date: "Oct 28-30, 2024",
    location: "San Francisco, CA",
    url: "https://techcrunch.com/events/disrupt-2024",
    source: "sample",
    sponsorCount: 45,
  },
  {
    id: "2",
    name: "Web Summit 2024",
    date: "Nov 11-14, 2024",
    location: "Lisbon, Portugal",
    url: "https://websummit.com",
    source: "sample",
    sponsorCount: 120,
  },
  {
    id: "3",
    name: "SaaStr Annual 2024",
    date: "Sep 10-12, 2024",
    location: "San Francisco, CA",
    url: "https://saastr.com/annual",
    source: "sample",
    sponsorCount: 85,
  },
  {
    id: "4",
    name: "Collision 2024",
    date: "Jun 17-20, 2024",
    location: "Toronto, Canada",
    url: "https://collisionconf.com",
    source: "sample",
    sponsorCount: 65,
  },
  {
    id: "5",
    name: "SXSW Interactive 2024",
    date: "Mar 8-16, 2024",
    location: "Austin, TX",
    url: "https://sxsw.com",
    source: "sample",
    sponsorCount: 200,
  },
];

const sampleSponsors: EnrichedSponsor[] = [
  {
    id: "s1",
    name: "Stripe",
    tier: "platinum",
    website: "https://stripe.com",
    domain: "stripe.com",
    events: ["1", "2", "3"],
    emails: ["partnerships@stripe.com", "events@stripe.com"],
    linkedinUrl: "https://linkedin.com/company/stripe",
    enrichmentStatus: "complete",
  },
  {
    id: "s2",
    name: "Salesforce",
    tier: "platinum",
    website: "https://salesforce.com",
    domain: "salesforce.com",
    events: ["1", "2", "4"],
    emails: ["sponsorships@salesforce.com"],
    linkedinUrl: "https://linkedin.com/company/salesforce",
    enrichmentStatus: "complete",
  },
  {
    id: "s3",
    name: "HubSpot",
    tier: "gold",
    website: "https://hubspot.com",
    domain: "hubspot.com",
    events: ["2", "3"],
    emails: ["events@hubspot.com", "marketing@hubspot.com"],
    linkedinUrl: "https://linkedin.com/company/hubspot",
    enrichmentStatus: "complete",
  },
  {
    id: "s4",
    name: "MongoDB",
    tier: "gold",
    website: "https://mongodb.com",
    domain: "mongodb.com",
    events: ["1", "5"],
    emails: ["partnerships@mongodb.com"],
    linkedinUrl: "https://linkedin.com/company/mongodb",
    enrichmentStatus: "complete",
  },
  {
    id: "s5",
    name: "Notion",
    tier: "silver",
    website: "https://notion.so",
    domain: "notion.so",
    events: ["3"],
    emails: ["hello@notion.so"],
    linkedinUrl: "https://linkedin.com/company/notion",
    enrichmentStatus: "complete",
  },
  {
    id: "s6",
    name: "Figma",
    tier: "silver",
    website: "https://figma.com",
    domain: "figma.com",
    events: ["4", "5"],
    emails: ["partnerships@figma.com"],
    linkedinUrl: "https://linkedin.com/company/figma",
    enrichmentStatus: "complete",
  },
];

const generateSampleEmail = (sponsor: EnrichedSponsor, eventName: string): EmailDraft => ({
  sponsorId: sponsor.id,
  sponsorName: sponsor.name,
  subject: `Partnership Opportunity: ${eventName} - ${sponsor.name} Collaboration`,
  subjectVariations: [
    `Let's Partner: ${eventName} Sponsorship`,
    `${sponsor.name} + ${eventName}: A Perfect Match`,
    `Sponsorship Inquiry for ${eventName}`,
  ],
  body: `Dear ${sponsor.name} Events Team,

I hope this message finds you well. I'm reaching out regarding a sponsorship opportunity for ${eventName}.

Having seen ${sponsor.name}'s impressive presence at similar industry events, I believe there's a strong alignment between our audience and your brand's objectives.

Our event offers:
• Access to 5,000+ qualified attendees
• Premium brand visibility across all marketing channels
• Speaking opportunities and workshop sessions
• Exclusive networking events with industry leaders

I'd love to schedule a brief call to discuss how we can create a mutually beneficial partnership.

Would you be available for a 15-minute call next week?

Best regards,
[Your Name]
[Your Title]
[Contact Information]`,
  generatedWith: "template",
});

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

    // Simulate API call with demo data
    await new Promise((resolve) => setTimeout(resolve, 1500));

    setDiscoveredEvents(sampleEvents);
    setSelectedEventIds(sampleEvents.map((e) => e.id));
    setDataSource("sample");
    updateStepStatus(2, "complete");
    setIsLoading(false);
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

    // Simulate sponsor identification
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const filteredSponsors = sampleSponsors.filter((s) =>
      s.events.some((e) => selectedEventIds.includes(e))
    );
    setSponsors(filteredSponsors);
    updateStepStatus(3, "complete");
    setIsLoading(false);
  }, [selectedEventIds, updateStepStatus]);

  const handleGenerateEmails = useCallback(async () => {
    setIsLoading(true);
    updateStepStatus(4, "active");
    setCurrentStep(3);

    // Simulate email generation
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const generatedEmails = sponsors.map((sponsor) =>
      generateSampleEmail(sponsor, eventDetails?.name || "Your Event")
    );
    setEmails(generatedEmails);
    updateStepStatus(4, "complete");
    setIsLoading(false);
  }, [sponsors, eventDetails, updateStepStatus]);

  const handleProceedToExport = useCallback(() => {
    updateStepStatus(5, "active");
    setCurrentStep(4);
  }, [updateStepStatus]);

  const handleExport = useCallback(async (format: ExportFormat) => {
    setExportingFormat(format);

    // Simulate export
    await new Promise((resolve) => setTimeout(resolve, 1000));

    setCompletedExports((prev) =>
      prev.includes(format) ? prev : [...prev, format]
    );
    setExportingFormat(null);
    
    if (!completedExports.includes(format)) {
      updateStepStatus(5, "complete");
    }
  }, [completedExports, updateStepStatus]);

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
