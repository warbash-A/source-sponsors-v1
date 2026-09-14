import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, json, generateId, readPage } from "../_shared/scrape.ts";
import { aiExtract, AiGatewayError } from "../_shared/ai-extract.ts";

interface EventFromUrlResult {
  event: {
    name: string;
    url: string;
    date: string;
    location: string;
  } | null;
}

const EVENT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['event'],
  properties: {
    event: {
      type: ['object', 'null'],
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
} as const;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const url: string = (body.url ?? '').toString().trim();

    if (!url || !/^https?:\/\//i.test(url)) {
      return json({ event: null, status: 'empty', message: 'A valid event URL is required.' });
    }

    console.log('Reading event URL:', url);
    const content = await readPage(url, 35000);

    if (!content) {
      return json({ event: null, status: 'error', message: 'Could not read that page. It may block scraping.' });
    }

    const result = await aiExtract<EventFromUrlResult>({
      name: 'event_from_url',
      schema: EVENT_SCHEMA as unknown as Record<string, unknown>,
      instructions: [
        'You extract basic event details from the markdown of an event page.',
        'Return the event name, the canonical event URL, the date/time as shown (or "TBD"), and the location (city/venue or "Online" or "TBD").',
        'If the page is clearly not an event page, return null for the event object.',
        'Never invent information. Use empty strings for missing fields.',
      ].join(' '),
      content,
    });

    const raw = result.event;
    if (!raw || !raw.name) {
      return json({ event: null, status: 'no_results', message: 'Could not identify an event on that page.' });
    }

    const event = {
      id: generateId(),
      name: raw.name.trim(),
      url: raw.url?.trim() || url,
      date: raw.date?.trim() || 'TBD',
      location: raw.location?.trim() || 'TBD',
      source: 'manual' as const,
    };

    return json({ event, status: 'ok' });
  } catch (err) {
    if (err instanceof AiGatewayError) {
      const message =
        err.status === 402
          ? 'AI credits are exhausted, so the event could not be read.'
          : err.status === 429
            ? 'Too many requests right now. Please retry in a moment.'
            : 'Could not read the event page.';
      return json({ event: null, status: 'error', message });
    }
    console.error('Error in event-from-url:', err);
    return json({ event: null, status: 'error', message: err instanceof Error ? err.message : 'Unknown error' });
  }
});
