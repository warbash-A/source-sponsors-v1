import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, json, generateId, readPage } from "../_shared/scrape.ts";
import { aiExtract, AiGatewayError } from "../_shared/ai-extract.ts";

interface DiscoveredEvent {
  id: string;
  name: string;
  url: string;
  date: string;
  location: string;
  source: 'luma';
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

    // Try multiple Luma search strategies
    const searchStrategies = [
      // Direct search on Luma
      `https://lu.ma/discover?q=${encodeURIComponent(keywords)}`,
      // Category-based search (tech events)
      `https://lu.ma/discover/tech`,
    ];

    const allEvents: DiscoveredEvent[] = [];
    const seen = new Set<string>();

    for (const searchUrl of searchStrategies) {
      if (allEvents.length >= eventCount) break;

      console.log('Searching Luma:', searchUrl);
      const content = await readPage(searchUrl, 40000);

      if (!content) {
        console.log('Could not read Luma page:', searchUrl);
        continue;
      }

      let extracted: ExtractedEvents;
      try {
        extracted = await aiExtract<ExtractedEvents>({
          name: 'luma_events',
          schema: EVENTS_SCHEMA as unknown as Record<string, unknown>,
          instructions: [
            'You extract real events from the markdown of a Luma (lu.ma) search or discover page.',
            `Return at most ${eventCount} professional tech, startup, or business events that match: "${keywords}".`,
            location
              ? `Prioritize events held in or near ${location}, plus online events. Skip events in other regions unless no local matches.`
              : 'Include both in-person and online events.',
            'For each event give: name (the event title), url (the full lu.ma event link starting with https://lu.ma/), date (as shown, e.g. "Mon, Jan 15 · 6:00 PM EST" or "TBD"), location (city/venue or "Online").',
            'Ignore navigation links, calendar pages, adverts, and community profiles without events.',
            'If a field is not present, use an empty string. Never invent an event or URL.',
            'Only return events with valid lu.ma URLs. Skip anything that is not a specific event.',
            'If there are no genuine matching events, return an empty list.',
          ].join(' '),
          content,
        });
      } catch (err) {
        if (err instanceof AiGatewayError) {
          const message =
            err.status === 402
              ? 'AI credits are exhausted, so Luma results could not be read.'
              : err.status === 429
                ? 'Rate limited by the AI service right now. Please retry in a moment.'
                : 'Could not read Luma events.';
          console.error('AI extraction blocked:', err.status, err.message);
          if (allEvents.length === 0) {
            return json({ events: [], status: 'error', message });
          }
          break;
        }
        throw err;
      }

      for (const e of extracted.events ?? []) {
        const url = (e.url ?? '').trim();
        const name = (e.name ?? '').trim();

        // Validate it's a real Luma event URL
        if (!name || !url.startsWith('https://lu.ma/') || seen.has(url)) continue;

        // Skip calendar/profile pages
        if (url.includes('/@') || url.includes('/calendar')) continue;

        seen.add(url);
        allEvents.push({
          id: generateId(),
          name,
          url,
          date: e.date?.trim() || 'TBD',
          location: e.location?.trim() || location || 'See event page',
          source: 'luma',
        });

        if (allEvents.length >= eventCount) break;
      }
    }

    if (allEvents.length === 0) {
      return json({
        events: [],
        status: 'no_results',
        message: `No Luma events found for "${keywords}". Try broader keywords or search Conference sites instead.`,
      });
    }

    return json({ events: allEvents, status: 'ok' });
  } catch (err) {
    console.error('Error in luma-discovery:', err);
    return json(
      {
        events: [],
        status: 'error',
        message: err instanceof Error ? err.message : 'Unknown error',
      },
      500
    );
  }
});
