export interface EventDetails {
  name: string;
  type: string;
  industry: string;
  location: string;
  /** Who the outreach emails are signed by. */
  senderName?: string;
  /** The company the sender represents. */
  senderOrganization?: string;
  eventCount?: number;
  /** Which research mode this workflow is running in. */
  researchMode?: 'mine' | 'similar';
  /** Free-form description of the event and its audience. Used to find similar events. */
  description?: string;
  /** Tags that describe complementary event types the user wants to discover. */
  focusTags?: string[];
  /** Which discovery sources to search. */
  sources?: EventSource[];
}

/** Where a discovered event came from. */
export type EventSource = 'luma' | 'web';

export interface DiscoveredEvent {
  id: string;
  name: string;
  date: string;
  location: string;
  url: string;
  source: EventSource | 'manual';
  sponsorCount?: number;
  /** The search query that produced this event, when discovered automatically. */
  query?: string;
}

export interface Sponsor {
  id: string;
  name: string;
  tier: 'platinum' | 'gold' | 'silver' | 'bronze' | 'unknown';
  logo?: string;
  website?: string;
  events: string[];
}

export interface EmailRecord {
  email: string;
  /** true = published on the company's own site; false = an unverified pattern guess */
  verified: boolean;
  sourceUrl?: string;
}

export interface EnrichedSponsor extends Sponsor {
  domain?: string;
  emails: string[];
  emailDetails?: EmailRecord[];
  sourceUrl?: string;
  linkedinUrl?: string;
  enrichmentStatus: 'pending' | 'processing' | 'complete' | 'partial' | 'failed';
  /** Number of selected events this sponsor appears in. */
  eventCount?: number;
}

export interface EmailDraft {
  sponsorId: string;
  sponsorName: string;
  subject: string;
  subjectVariations: string[];
  body: string;
  generatedWith: 'ai' | 'template';
}

export interface WorkflowStep {
  id: number;
  name: string;
  description: string;
  status: 'pending' | 'active' | 'complete' | 'error';
}

export type ExportFormat = 'csv' | 'excel' | 'email-templates';
