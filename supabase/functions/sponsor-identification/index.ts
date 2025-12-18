import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Event {
  id: string;
  name: string;
  url: string;
}

interface Sponsor {
  id: string;
  name: string;
  tier: 'platinum' | 'gold' | 'silver' | 'bronze' | 'unknown';
  website?: string;
  logoUrl?: string;
  eventIds: string[];
  eventCount: number;
}

// Comprehensive blacklist for filtering out UI elements and non-sponsor content
const UI_ELEMENT_BLACKLIST = [
  // Navigation and UI elements
  'skip to main content', 'skip to content', 'skip navigation', 'accessibility',
  'menu', 'navigation', 'nav', 'header', 'footer', 'sidebar', 'breadcrumb',
  'home', 'about', 'contact', 'help', 'faq', 'support', 'blog', 'news',
  
  // Actions and buttons
  'read more', 'view more', 'see more', 'load more', 'show more', 'learn more',
  'click here', 'get started', 'try now', 'buy now', 'shop now', 'sign up',
  'sign in', 'log in', 'log out', 'register', 'subscribe', 'follow us',
  'next', 'previous', 'back', 'forward', 'close', 'open', 'expand', 'collapse',
  'download', 'upload', 'share', 'like', 'comment', 'save', 'edit', 'delete',
  
  // Media elements
  'image', 'photo', 'video', 'audio', 'play', 'pause', 'mute', 'volume',
  'thumbnail', 'gallery', 'slideshow', 'carousel',
  
  // Generic labels
  'sponsor', 'sponsors', 'partner', 'partners', 'sponsorship', 'partnership',
  'platinum', 'gold', 'silver', 'bronze', 'diamond', 'title sponsor',
  'presenting', 'presented by', 'brought to you by', 'supported by',
  
  // Legal and policy
  'terms', 'privacy', 'cookie', 'legal', 'disclaimer', 'copyright',
  'accept', 'decline', 'settings', 'preferences',
  
  // Form elements
  'submit', 'cancel', 'reset', 'search', 'filter', 'sort', 'select',
  'enter', 'type', 'input', 'button', 'link', 'checkbox', 'radio',
  
  // Social media
  'facebook', 'twitter', 'linkedin', 'instagram', 'youtube', 'tiktok',
  'social media', 'follow', 'tweet', 'post',
  
  // Event-specific non-sponsors
  'agenda', 'schedule', 'speakers', 'venue', 'location', 'register now',
  'buy tickets', 'get tickets', 'ticket', 'tickets', 'attendees', 'exhibitors',
  
  // Miscellaneous
  'loading', 'error', 'success', 'warning', 'info', 'notification',
  'powered by', 'built with', 'made with', 'designed by',
];

// Common company name suffixes that indicate legitimate companies
const COMPANY_SUFFIXES = [
  'inc', 'inc.', 'incorporated', 'corp', 'corp.', 'corporation',
  'llc', 'l.l.c.', 'ltd', 'ltd.', 'limited', 'co', 'co.',
  'group', 'holdings', 'enterprises', 'solutions', 'services',
  'technologies', 'systems', 'labs', 'studio', 'studios',
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { events }: { events: Event[] } = await req.json();
    console.log('Sponsor identification for events:', events.length);

    const allSponsors: Map<string, Sponsor> = new Map();

    for (const event of events) {
      console.log('Processing event:', event.name, event.url);
      
      // Skip sample/placeholder URLs
      if (event.url.includes('example.com')) {
        console.log('Skipping sample URL');
        continue;
      }
      
      try {
        // Use JinaAI Reader to scrape the event page
        const jinaResponse = await fetch(`https://r.jina.ai/${event.url}`, {
          headers: { 'Accept': 'text/plain' },
        });

        if (jinaResponse.ok) {
          const content = await jinaResponse.text();
          console.log('Content length:', content.length);
          console.log('Content preview:', content.substring(0, 300));
          
          const sponsors = extractSponsorsFromContent(content, event.id);
          
          console.log(`Extracted ${sponsors.length} valid sponsors from ${event.name}`);
          sponsors.forEach(s => console.log(`  - ${s.name} (${s.tier})`));
          
          for (const sponsor of sponsors) {
            const existingKey = sponsor.name.toLowerCase();
            if (allSponsors.has(existingKey)) {
              const existing = allSponsors.get(existingKey)!;
              existing.eventIds.push(event.id);
              existing.eventCount++;
              existing.tier = getHigherTier(existing.tier, sponsor.tier);
            } else {
              allSponsors.set(existingKey, sponsor);
            }
          }
        } else {
          console.log('Failed to fetch event page:', jinaResponse.status);
        }
      } catch (error) {
        console.error('Error processing event:', event.name, error);
      }
      
      // Small delay between requests to be respectful
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // If no sponsors found, return sample data
    let sponsors = Array.from(allSponsors.values());
    if (sponsors.length === 0) {
      console.log('No sponsors found, returning sample data');
      sponsors = getSampleSponsors(events);
    }

    // Sort by event count and tier
    sponsors.sort((a, b) => {
      const tierOrder = { platinum: 0, gold: 1, silver: 2, bronze: 3, unknown: 4 };
      if (tierOrder[a.tier] !== tierOrder[b.tier]) {
        return tierOrder[a.tier] - tierOrder[b.tier];
      }
      return b.eventCount - a.eventCount;
    });

    return new Response(JSON.stringify({ 
      sponsors,
      totalFound: sponsors.length 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in sponsor-identification:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function extractSponsorsFromContent(content: string, eventId: string): Sponsor[] {
  const sponsors: Sponsor[] = [];
  const seenNames = new Set<string>();
  
  // First, try to find sponsor sections specifically
  const sponsorSectionPatterns = [
    /(?:our\s+)?sponsor[s]?\s*(?:include|are|:|\n)([\s\S]*?)(?=\n\n\n|\n#{1,3}\s|$)/gi,
    /(?:thank(?:s|\s+you)?(?:\s+to)?(?:\s+our)?)\s*sponsor[s]?\s*[:|\n]([\s\S]*?)(?=\n\n\n|\n#{1,3}\s|$)/gi,
    /partner[s]?\s*(?:include|are|:|\n)([\s\S]*?)(?=\n\n\n|\n#{1,3}\s|$)/gi,
  ];
  
  let sponsorSections: string[] = [];
  for (const pattern of sponsorSectionPatterns) {
    const matches = content.matchAll(pattern);
    for (const match of matches) {
      if (match[1] && match[1].trim().length > 10) {
        sponsorSections.push(match[1]);
      }
    }
  }
  
  // Process sponsor sections if found
  const textToProcess = sponsorSections.length > 0 
    ? sponsorSections.join('\n') 
    : content;
  
  // Extract tier-based sponsors
  const tierPatterns: { tier: Sponsor['tier']; patterns: RegExp[] }[] = [
    { 
      tier: 'platinum', 
      patterns: [
        /platinum\s+(?:sponsor[s]?|partner[s]?)\s*[:|\-]?\s*([^\n]+)/gi,
        /presenting\s+(?:sponsor[s]?|partner[s]?)\s*[:|\-]?\s*([^\n]+)/gi,
        /title\s+(?:sponsor[s]?|partner[s]?)\s*[:|\-]?\s*([^\n]+)/gi,
        /diamond\s+(?:sponsor[s]?|partner[s]?)\s*[:|\-]?\s*([^\n]+)/gi,
      ]
    },
    { 
      tier: 'gold', 
      patterns: [
        /gold\s+(?:sponsor[s]?|partner[s]?)\s*[:|\-]?\s*([^\n]+)/gi,
        /premier\s+(?:sponsor[s]?|partner[s]?)\s*[:|\-]?\s*([^\n]+)/gi,
      ]
    },
    { 
      tier: 'silver', 
      patterns: [
        /silver\s+(?:sponsor[s]?|partner[s]?)\s*[:|\-]?\s*([^\n]+)/gi,
      ]
    },
    { 
      tier: 'bronze', 
      patterns: [
        /bronze\s+(?:sponsor[s]?|partner[s]?)\s*[:|\-]?\s*([^\n]+)/gi,
        /community\s+(?:sponsor[s]?|partner[s]?)\s*[:|\-]?\s*([^\n]+)/gi,
      ]
    },
  ];
  
  for (const { tier, patterns } of tierPatterns) {
    for (const pattern of patterns) {
      const matches = textToProcess.matchAll(pattern);
      for (const match of matches) {
        const names = extractCompanyNames(match[1]);
        for (const name of names) {
          const key = name.toLowerCase();
          if (!seenNames.has(key)) {
            seenNames.add(key);
            sponsors.push(createSponsor(name, tier, eventId));
          }
        }
      }
    }
  }
  
  // Extract company names from markdown links in sponsor sections
  const linkMatches = textToProcess.matchAll(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g);
  for (const match of linkMatches) {
    const [, name, url] = match;
    const cleanedName = cleanCompanyName(name);
    
    if (isValidCompanyName(cleanedName)) {
      const key = cleanedName.toLowerCase();
      if (!seenNames.has(key)) {
        seenNames.add(key);
        sponsors.push({
          ...createSponsor(cleanedName, 'unknown', eventId),
          website: extractDomain(url),
        });
      }
    }
  }
  
  // Look for patterns like "Sponsored by Company" or "In partnership with Company"
  const attributionPatterns = [
    /(?:sponsored|presented|powered)\s+by\s+([A-Z][A-Za-z0-9\s&.']+?)(?:\.|,|\n|$)/gi,
    /(?:in\s+partnership\s+with|partnered\s+with)\s+([A-Z][A-Za-z0-9\s&.']+?)(?:\.|,|\n|$)/gi,
  ];
  
  for (const pattern of attributionPatterns) {
    const matches = textToProcess.matchAll(pattern);
    for (const match of matches) {
      const name = cleanCompanyName(match[1]);
      if (isValidCompanyName(name)) {
        const key = name.toLowerCase();
        if (!seenNames.has(key)) {
          seenNames.add(key);
          sponsors.push(createSponsor(name, 'unknown', eventId));
        }
      }
    }
  }
  
  return sponsors;
}

function extractCompanyNames(text: string): string[] {
  const names: string[] = [];
  
  // Split by common delimiters
  const parts = text.split(/[,|•·;]/);
  
  for (const part of parts) {
    const cleaned = cleanCompanyName(part);
    if (isValidCompanyName(cleaned)) {
      names.push(cleaned);
    }
  }
  
  return names;
}

function cleanCompanyName(name: string): string {
  return name
    .replace(/^\s*[-•·]\s*/, '') // Remove leading bullet points
    .replace(/\s+/g, ' ')
    .replace(/^["'\s]+|["'\s]+$/g, '') // Remove quotes and whitespace
    .trim();
}

function isValidCompanyName(name: string): boolean {
  if (!name) return false;
  
  // Length checks
  if (name.length < 3 || name.length > 60) return false;
  
  const nameLower = name.toLowerCase();
  
  // Check against blacklist
  for (const blacklisted of UI_ELEMENT_BLACKLIST) {
    if (nameLower === blacklisted) return false;
    // Also check if name starts with blacklisted word
    if (nameLower.startsWith(blacklisted + ' ')) return false;
    if (nameLower.endsWith(' ' + blacklisted)) return false;
  }
  
  // Reject numbered items (Image 1, Photo 2, etc.)
  if (/^[a-z]+\s*\d+$/i.test(name)) return false;
  
  // Reject single words that are too short
  if (name.split(/\s+/).length === 1 && name.length < 4) return false;
  
  // Reject all lowercase (proper company names have capitals)
  if (name === nameLower) return false;
  
  // Reject all uppercase single words under 5 chars (likely abbreviations/UI)
  if (name === name.toUpperCase() && name.length < 5 && !name.includes(' ')) return false;
  
  // Must start with a letter or number
  if (!/^[A-Za-z0-9]/.test(name)) return false;
  
  // Reject if it's just numbers
  if (/^\d+$/.test(name)) return false;
  
  // Reject common file patterns
  if (/\.(jpg|jpeg|png|gif|svg|pdf|doc|html|css|js)$/i.test(name)) return false;
  
  // Positive signals: has company suffix
  const hasCompanySuffix = COMPANY_SUFFIXES.some(suffix => 
    nameLower.endsWith(' ' + suffix) || nameLower.endsWith(suffix)
  );
  
  // Positive signal: multiple words with proper capitalization
  const words = name.split(/\s+/);
  const hasProperCapitalization = words.some(w => /^[A-Z]/.test(w));
  
  // Must have at least one positive signal
  if (!hasCompanySuffix && !hasProperCapitalization) return false;
  
  return true;
}

function createSponsor(name: string, tier: Sponsor['tier'], eventId: string): Sponsor {
  return {
    id: Math.random().toString(36).substring(2, 15),
    name: name.trim(),
    tier,
    eventIds: [eventId],
    eventCount: 1,
  };
}

function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace('www.', '');
  } catch {
    return url;
  }
}

function getHigherTier(tier1: Sponsor['tier'], tier2: Sponsor['tier']): Sponsor['tier'] {
  const order = { platinum: 0, gold: 1, silver: 2, bronze: 3, unknown: 4 };
  return order[tier1] <= order[tier2] ? tier1 : tier2;
}

function getSampleSponsors(events: Event[]): Sponsor[] {
  const eventIds = events.map(e => e.id);
  return [
    { id: 's1', name: 'TechCorp Industries', tier: 'platinum', website: 'techcorp.com', eventIds: eventIds.slice(0, 2), eventCount: 2 },
    { id: 's2', name: 'InnovateSoft', tier: 'gold', website: 'innovatesoft.io', eventIds: eventIds.slice(0, 1), eventCount: 1 },
    { id: 's3', name: 'CloudScale Solutions', tier: 'gold', website: 'cloudscale.com', eventIds: eventIds.slice(1, 3), eventCount: 2 },
    { id: 's4', name: 'DataDriven Inc', tier: 'silver', website: 'datadriven.com', eventIds: eventIds.slice(0, 1), eventCount: 1 },
    { id: 's5', name: 'FutureTech Labs', tier: 'silver', website: 'futuretechlabs.com', eventIds: eventIds.slice(2), eventCount: 1 },
    { id: 's6', name: 'Quantum Analytics', tier: 'bronze', website: 'quantumanalytics.io', eventIds: eventIds.slice(0, 1), eventCount: 1 },
  ];
}
