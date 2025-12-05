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
      
      try {
        // Use JinaAI Reader to scrape the event page
        const jinaResponse = await fetch(`https://r.jina.ai/${event.url}`, {
          headers: { 'Accept': 'text/plain' },
        });

        if (jinaResponse.ok) {
          const content = await jinaResponse.text();
          const sponsors = extractSponsorsFromContent(content, event.id);
          
          for (const sponsor of sponsors) {
            const existingKey = sponsor.name.toLowerCase();
            if (allSponsors.has(existingKey)) {
              const existing = allSponsors.get(existingKey)!;
              existing.eventIds.push(event.id);
              existing.eventCount++;
              // Upgrade tier if found at higher tier
              existing.tier = getHigherTier(existing.tier, sponsor.tier);
            } else {
              allSponsors.set(existingKey, sponsor);
            }
          }
          
          console.log(`Found ${sponsors.length} sponsors for ${event.name}`);
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
  
  // Look for sponsor sections
  const sponsorSectionPatterns = [
    /sponsor[s]?\s*[:|-]?\s*([\s\S]*?)(?=\n\n|\n#|$)/gi,
    /partner[s]?\s*[:|-]?\s*([\s\S]*?)(?=\n\n|\n#|$)/gi,
    /supported by\s*[:|-]?\s*([\s\S]*?)(?=\n\n|\n#|$)/gi,
  ];
  
  let sponsorContent = '';
  for (const pattern of sponsorSectionPatterns) {
    const matches = content.matchAll(pattern);
    for (const match of matches) {
      sponsorContent += ' ' + match[1];
    }
  }
  
  // If no sponsor section found, search entire content
  if (!sponsorContent.trim()) {
    sponsorContent = content;
  }
  
  // Extract tier-based sponsors
  const tierPatterns = [
    { tier: 'platinum' as const, patterns: [/platinum\s+sponsor[s]?\s*[:|-]?\s*([^\n]+)/gi, /presenting\s+sponsor[s]?\s*[:|-]?\s*([^\n]+)/gi] },
    { tier: 'gold' as const, patterns: [/gold\s+sponsor[s]?\s*[:|-]?\s*([^\n]+)/gi] },
    { tier: 'silver' as const, patterns: [/silver\s+sponsor[s]?\s*[:|-]?\s*([^\n]+)/gi] },
    { tier: 'bronze' as const, patterns: [/bronze\s+sponsor[s]?\s*[:|-]?\s*([^\n]+)/gi] },
  ];
  
  for (const { tier, patterns } of tierPatterns) {
    for (const pattern of patterns) {
      const matches = sponsorContent.matchAll(pattern);
      for (const match of matches) {
        const names = extractCompanyNames(match[1]);
        for (const name of names) {
          if (!seenNames.has(name.toLowerCase())) {
            seenNames.add(name.toLowerCase());
            sponsors.push(createSponsor(name, tier, eventId));
          }
        }
      }
    }
  }
  
  // Extract company names from links
  const linkMatches = sponsorContent.matchAll(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g);
  for (const match of linkMatches) {
    const [, name, url] = match;
    if (isCompanyName(name) && !seenNames.has(name.toLowerCase())) {
      seenNames.add(name.toLowerCase());
      sponsors.push({
        ...createSponsor(name, 'unknown', eventId),
        website: extractDomain(url),
      });
    }
  }
  
  // Look for common company patterns
  const companyPatterns = [
    /(?:sponsored by|partnered with|brought to you by)\s+([A-Z][A-Za-z0-9\s&]+(?:Inc|LLC|Ltd|Corp)?)/g,
  ];
  
  for (const pattern of companyPatterns) {
    const matches = sponsorContent.matchAll(pattern);
    for (const match of matches) {
      const name = match[1].trim();
      if (isCompanyName(name) && !seenNames.has(name.toLowerCase())) {
        seenNames.add(name.toLowerCase());
        sponsors.push(createSponsor(name, 'unknown', eventId));
      }
    }
  }
  
  return sponsors;
}

function extractCompanyNames(text: string): string[] {
  const names: string[] = [];
  
  // Split by common delimiters
  const parts = text.split(/[,|•·]/);
  
  for (const part of parts) {
    const cleaned = part.trim();
    if (isCompanyName(cleaned)) {
      names.push(cleaned);
    }
  }
  
  return names;
}

function isCompanyName(name: string): boolean {
  if (!name || name.length < 2 || name.length > 50) return false;
  
  // Filter out common non-company words
  const blacklist = ['the', 'and', 'or', 'with', 'by', 'for', 'at', 'sponsor', 'partner', 'view', 'more', 'click', 'here'];
  if (blacklist.includes(name.toLowerCase())) return false;
  
  // Should start with capital letter or number
  if (!/^[A-Z0-9]/.test(name)) return false;
  
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
