import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, json, generateId, readPage } from "../_shared/scrape.ts";
import { aiExtract, AiGatewayError } from "../_shared/ai-extract.ts";

interface DiscoveredEvent {
  id: string;
  name: string;
  url: string;
  date: string;
  location: string;
  source: 'meetup';
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const keywords: string = (body.keywords ?? '').toString().trim();
    const location: string | undefined = body.location?.toString().trim() || undefined;
    const eventCount: number = typeof body.eventCount === 'number' ? Math.min(body.eventCount, 50) : 10;

    if (!keywords) {
      return json({ events: [], status: 'empty', message: 'No search keywords provided.' });
    }

    const searchQuery = encodeURIComponent(keywords);
    const locationSlug = location ? toMeetupLocation(location) : undefined;
    const searchUrl = locationSlug
      ? `https://www.meetup.com/find/?keywords=${searchQuery}&location=${encodeURIComponent(locationSlug)}&source=EVENTS`
      : `https://www.meetup.com/find/?keywords=${searchQuery}&source=EVENTS`;

    console.log('Reading Meetup search:', searchUrl);
    const content = await readPage(searchUrl, 40000);

    if (!content) {
      return json({
        events: [],
        status: 'error',
        message: 'Meetup could not be read right now. Try again in a moment.',
      });
    }

    let extracted: ExtractedEvents;
    try {
      extracted = await aiExtract<ExtractedEvents>({
        name: 'meetup_events',
        schema: EVENTS_SCHEMA as unknown as Record<string, unknown>,
        instructions: [
          'You extract real events from the markdown of a Meetup search results page.',
          `Return at most ${eventCount} events that genuinely match the search topic: "${keywords}".`,
          location
            ? `Only include events held in or near ${location}, plus online events run by groups based there. Skip events in other regions.`
            : '',
          'For each event give: name (the event title), url (the full meetup.com event link), date (as shown, e.g. "Wed, Sep 23 · 6:00 PM PDT"), location (city or venue, or "Online").',
          'Ignore navigation links, group pages without events, adverts, cookie notices and photo captions.',
          'If a field is not present on the page, use an empty string. Never invent an event or a URL.',
          'If there are no genuine matching events, return an empty list.',
        ].join(' '),
        content,
      });
    } catch (err) {
      if (err instanceof AiGatewayError) {
        const message =
          err.status === 402
            ? 'AI credits are exhausted, so Meetup results could not be read.'
            : err.status === 429
              ? 'Too many requests right now. Please retry in a moment.'
              : 'Could not read the Meetup results.';
        return json({ events: [], status: 'error', message });
      }
      throw err;
    }

    const seen = new Set<string>();
    const events: DiscoveredEvent[] = [];
    for (const e of extracted.events ?? []) {
      const url = (e.url ?? '').trim();
      const name = (e.name ?? '').trim();
      if (!name || !url.includes('meetup.com') || seen.has(url)) continue;
      seen.add(url);
      events.push({
        id: generateId(),
        name,
        url,
        date: e.date?.trim() || 'TBD',
        location: e.location?.trim() || location || 'See event page',
        source: 'meetup',
      });
      if (events.length >= eventCount) break;
    }

    console.log('Meetup events extracted:', events.length);

    return json({
      events,
      status: events.length > 0 ? 'ok' : 'no_results',
      message: events.length === 0 ? 'Meetup returned no matching events.' : undefined,
    });
  } catch (error) {
    console.error('Error in meetup-discovery:', error);
    return json({
      events: [],
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Meetup's search only honours its own location slugs ("us--ca--San Francisco").
 * Plain free text is ignored and returns results from anywhere.
 */
function toMeetupLocation(input: string): string {
  const raw = input.trim();
  if (raw.includes('--')) return raw;

  const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
  const city = parts[0];
  if (!city) return raw;

  const region = parts[1];
  if (region && /^[A-Za-z]{2}$/.test(region)) {
    return `us--${region.toLowerCase()}--${city}`;
  }
  return `us--${city}`;
}
