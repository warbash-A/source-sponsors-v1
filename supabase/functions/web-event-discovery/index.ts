import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, json, generateId, readPage } from "../_shared/scrape.ts";
import { aiExtract, AiGatewayError } from "../_shared/ai-extract.ts";

type Channel = 'luma' | 'directory' | 'web';

interface DiscoveredEvent {
  id: string;
  name: string;
  url: string;
  date: string;
  location: string;
  source: Channel;
}

interface ExtractedEvents {
  events: {
    name: string;
    url: string;
    date: string;
    location: string;
  }[];
}

const EVENTS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['events'],
  properties: {
    events: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'url', 'date', 'location'],
        properties: {
          name: { type: 'string' },
          url: { type: 'string' },
          date: { type: 'string' },
          location: { type: 'string' },
        },
      },
    },
  },
} as const;

/** Build the DuckDuckGo query for a channel. */
function buildQuery(channel: Channel, keywords: string, location?: string): string {
  const place = location ? ` ${location}` : '';
  const year = new Date().getFullYear();
  if (channel === 'directory') {
    return `top ${keywords} conferences and summits ${year} ${year + 1} list`;
  }
  return `${keywords} conference${place} ${year} ${year + 1} sponsors`;
}

/** DuckDuckGo wraps every result link in a redirect — decode back to the real URL. */
function decodeRedirects(markdown: string): string {
  return markdown.replace(
    /https:\/\/duckduckgo\.com\/l\/\?uddg=([^)\s"&]+)(?:&amp;|&)?[^)\s"]*/g,
    (_match, encoded) => {
      try {
        return decodeURIComponent(encoded);
      } catch {
        return _match;
      }
    },
  );
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const keywords: string = (body.keywords ?? '').toString().trim();
    const location: string | undefined = body.location?.toString().trim() || undefined;
    const channel: Channel = ['luma', 'directory', 'web'].includes(body.channel) ? body.channel : 'web';
    const eventCount: number = typeof body.eventCount === 'number' ? Math.min(body.eventCount, 25) : 10;

    if (!keywords) {
      return json({ events: [], status: 'empty', message: 'No search keywords provided.' });
    }

    const searchUrl = channel === 'luma'
      ? lumaUrl(keywords, location)
      : `https://duckduckgo.com/html/?q=${encodeURIComponent(buildQuery(channel, keywords, location))}`;
    console.log('Searching the web:', channel, searchUrl);

    const raw = await readPage(searchUrl, 45000);
    if (!raw) {
      return json({
        events: [],
        status: 'error',
        message: 'Web search could not be read right now. Try again in a moment.',
      });
    }

    const content = decodeRedirects(raw);

    let extracted: ExtractedEvents;
    try {
      extracted = await aiExtract<ExtractedEvents>({
        name: 'web_events',
        schema: EVENTS_SCHEMA as unknown as Record<string, unknown>,
        instructions: [
          'You extract real, specific events (conferences, summits, meetups, hackathons) from the markdown of a web search results page.',
          `Return at most ${eventCount} events that genuinely match the topic: "${keywords}".`,
          location ? `Prefer events held in or near ${location}. Also allow major well-known events elsewhere in the same industry.` : '',
          channel === 'luma'
            ? 'Only include links on lu.ma that point to a specific event or a city/community calendar.'
            : channel === 'directory'
              ? 'Results come from conference directories; extract the individual conferences they list, not the directory homepage itself.'
              : 'Only include pages that are the official website of a specific event (its homepage, sponsors page or registration page).',
          'For each event give: name (the event title, not the page title boilerplate), url (the real destination URL, never a duckduckgo.com link), date (year or dates if shown, otherwise empty string), location (city, or "Online", otherwise empty string).',
          'Reject: search engine chrome, ads, login pages, news articles about an industry, listicles without a named event, vendor marketing pages, ticket-reseller aggregator search pages.',
          'Never invent an event or a URL. If there are no genuine matching events, return an empty list.',
        ].filter(Boolean).join(' '),
        content,
      });
    } catch (err) {
      if (err instanceof AiGatewayError) {
        const message =
          err.status === 402
            ? 'AI credits are exhausted, so web results could not be read.'
            : err.status === 429
              ? 'Too many requests right now. Please retry in a moment.'
              : 'Could not read the web search results.';
        return json({ events: [], status: 'error', message });
      }
      throw err;
    }

    const seen = new Set<string>();
    const events: DiscoveredEvent[] = [];
    for (const e of extracted.events ?? []) {
      const url = (e.url ?? '').trim();
      const name = (e.name ?? '').trim();
      if (!name || !url.startsWith('http') || url.includes('duckduckgo.com') || seen.has(url)) continue;
      if (channel === 'luma' && !url.includes('lu.ma')) continue;
      seen.add(url);
      events.push({
        id: generateId(),
        name,
        url,
        date: e.date?.trim() || 'TBD',
        location: e.location?.trim() || location || 'See event page',
        source: channel,
      });
      if (events.length >= eventCount) break;
    }

    console.log('Web events extracted:', channel, events.length);

    return json({
      events,
      status: events.length > 0 ? 'ok' : 'no_results',
      message: events.length === 0 ? `No matching events found via ${channel} search.` : undefined,
    });
  } catch (error) {
    console.error('Error in web-event-discovery:', error);
    return json({
      events: [],
      status: 'error',
      message: error instanceof Error ? error.message : 'Unexpected error.',
    });
  }
});
