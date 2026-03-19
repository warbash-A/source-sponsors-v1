import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MeetupSearchParams {
  keywords: string;
  location?: string;
}

// Local type — only 'meetup' is valid here
interface DiscoveredEvent {
  id: string;
  name: string;
  url: string;
  date: string;
  location: string;
  sponsorCount?: number;
  source: 'meetup';
}

const SPONSOR_INDICATORS = [
  'sponsored by',
  'our sponsors',
  'thank our sponsors',
  'gold sponsor',
  'silver sponsor',
  'bronze sponsor',
  'platinum sponsor',
  'presenting sponsor',
  'title sponsor',
  'sponsors & partners',
  'sponsors:',
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let keywords: string;
    let location: string | undefined;
    try {
      const params: MeetupSearchParams = await req.json();
      keywords = params.keywords;
      location = params.location;
    } catch (err) {
      console.error('Invalid request body:', err);
      return new Response(JSON.stringify({ events: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!keywords?.trim()) {
      console.log('Empty keywords provided');
      return new Response(JSON.stringify({ events: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Meetup discovery request:', { keywords, location });

    const events: DiscoveredEvent[] = [];

    const searchQuery = encodeURIComponent(keywords.trim());
    const locationQuery = location ? encodeURIComponent(location) : '';
    const meetupSearchUrl = locationQuery
      ? `https://www.meetup.com/find/?keywords=${searchQuery}&location=${locationQuery}&source=EVENTS`
      : `https://www.meetup.com/find/?keywords=${searchQuery}&source=EVENTS`;

    console.log('Fetching Meetup search via JinaAI:', meetupSearchUrl);

    const jinaResponse = await fetch(`https://r.jina.ai/${meetupSearchUrl}`, {
      headers: { 'Accept': 'text/plain' },
    });

    if (!jinaResponse.ok) {
      console.log('JinaAI request failed:', jinaResponse.status);
      return new Response(JSON.stringify({ events: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const content = await jinaResponse.text();
    console.log('JinaAI response length:', content.length);

    const meetupUrls = extractMeetupEventUrls(content);
    console.log('Found Meetup event URLs:', meetupUrls.length);

    // Fetch each event page and filter to only those with explicit sponsor info
    for (const { url, name } of meetupUrls.slice(0, 10)) {
      try {
        const eventResponse = await fetch(`https://r.jina.ai/${url}`, {
          headers: { 'Accept': 'text/plain' },
        });
        if (!eventResponse.ok) continue;

        const eventContent = await eventResponse.text();
        if (!hasSponsorInfo(eventContent)) continue;

        const snippet = eventContent.substring(0, 1000);
        const date = extractDateFromContext(snippet);
        const loc = extractLocationFromContext(snippet);

        events.push({
          id: generateId(),
          name,
          url,
          date: date || 'TBD',
          location: loc || location || 'See event page',
          source: 'meetup',
        });
      } catch (err) {
        console.error('Error fetching event page:', url, err);
      }
    }

    console.log('Meetup events with sponsors found:', events.length);

    return new Response(JSON.stringify({ events }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in meetup-discovery:', error);
    // Always return empty array — no sample data fallback for Meetup
    return new Response(JSON.stringify({ events: [] }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

/** Returns true if content contains explicit sponsor mentions */
export function hasSponsorInfo(content: string): boolean {
  const lower = content.toLowerCase();
  return SPONSOR_INDICATORS.some(indicator => lower.includes(indicator));
}

function extractMeetupEventUrls(content: string): { url: string; name: string }[] {
  const results: { url: string; name: string }[] = [];
  const seen = new Set<string>();
  const linkPattern = /\[([^\]]{5,120})\]\((https?:\/\/(?:www\.)?meetup\.com\/[^)]+\/events\/[^)]+)\)/g;
  for (const match of content.matchAll(linkPattern)) {
    const [, name, url] = match;
    if (seen.has(url)) continue;
    seen.add(url);
    const cleanName = name.replace(/\s+/g, ' ').trim();
    if (cleanName.length > 5) results.push({ url, name: cleanName });
  }
  return results;
}

function extractDateFromContext(context: string): string | null {
  const patterns = [
    /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:\s*[-–]\s*\d{1,2})?,?\s*\d{4}\b/i,
    /\b\d{1,2}(?:\s*[-–]\s*\d{1,2})?\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4}\b/i,
  ];
  for (const pattern of patterns) {
    const match = context.match(pattern);
    if (match) return match[0];
  }
  return null;
}

function extractLocationFromContext(context: string): string | null {
  const patterns = [
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?),\s*([A-Z]{2})\b/,
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?),\s*([A-Z][a-z]+)\b/,
  ];
  for (const pattern of patterns) {
    const match = context.match(pattern);
    if (match) return match[0];
  }
  if (/\b(online|virtual|remote)\b/i.test(context)) return 'Online';
  return null;
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}
