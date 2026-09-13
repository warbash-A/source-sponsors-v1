export interface EventDetails {
  name: string;
  type: string;
  industry: string;
  location: string;
  /** Who the outreach emails are signed by. */
  senderName?: string;
  /** The company the sender represents. */
  senderOrganization?: string;
  sources?: ('eventbrite' | 'meetup')[];
  eventCount?: number;
}

export interface DiscoveredEvent {
  id: string;
  name: string;
  date: string;
  location: string;
  url: string;
  source: 'eventbrite' | 'apify' | 'sample' | 'meetup';
  sponsorCount?: number;
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
