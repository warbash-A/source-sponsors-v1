export interface EventDetails {
  name: string;
  type: string;
  industry: string;
  location: string;
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

export interface EnrichedSponsor extends Sponsor {
  domain?: string;
  emails: string[];
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
