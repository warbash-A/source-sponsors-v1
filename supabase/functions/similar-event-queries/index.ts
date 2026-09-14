import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, json } from "../_shared/scrape.ts";
import { aiExtract, AiGatewayError } from "../_shared/ai-extract.ts";

interface QueryRequest {
  name: string;
  type: string;
  industry: string;
  location: string;
  description?: string;
  focusTags?: string[];
}

interface QueryResult {
  queries: string[];
}

const QUERIES_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['queries'],
  properties: {
    queries: {
      type: 'array',
      items: { type: 'string' },
      minItems: 3,
      maxItems: 6,
    },
  },
} as const;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({})) as Partial<QueryRequest>;
    const name = (body.name ?? '').toString().trim();
    const type = (body.type ?? '').toString().trim();
    const industry = (body.industry ?? '').toString().trim();
    const location = (body.location ?? '').toString().trim();
    const description = (body.description ?? '').toString().trim();
    const focusTags = Array.isArray(body.focusTags) ? body.focusTags.filter((t) => typeof t === 'string') : [];

    if (!name || !type || !industry || !location) {
      return json({ queries: [], status: 'empty', message: 'Event details are required.' });
    }

    const tagsText = focusTags.length > 0 ? `Focus on these complementary event formats: ${focusTags.join(', ')}.` : '';
    const descText = description ? `Event description: "${description}".` : '';

    const instructions = [
      'You are a market-research assistant for event sponsorship.',
      `The user runs "${name}", a ${type} in the ${industry} industry, located in ${location}.`,
      descText,
      tagsText,
      'Generate 3-6 short Meetup search queries that will find COMPLEMENTARY events — events that attract the same audience but are not direct competitors.',
      'Each query should be 1-4 words, suitable for a Meetup keyword search.',
      'Prefer specific community formats: hackathons, demo days, meetups, workshops, founder nights, conferences, etc.',
      'Return the queries as a JSON array of strings.',
    ].filter(Boolean).join(' ');

    const content = `Generate Meetup search queries for finding complementary events to "${name}".`;

    const result = await aiExtract<QueryResult>({
      name: 'similar_event_queries',
      schema: QUERIES_SCHEMA as unknown as Record<string, unknown>,
      instructions,
      content,
    });

    const queries = (result.queries ?? [])
      .map((q) => q.trim())
      .filter((q) => q.length > 0)
      .slice(0, 6);

    if (queries.length === 0) {
      return json({ queries: [], status: 'no_results', message: 'Could not generate search queries.' });
    }

    return json({ queries, status: 'ok' });
  } catch (err) {
    if (err instanceof AiGatewayError) {
      const message =
        err.status === 402
          ? 'AI credits are exhausted, so query generation could not run.'
          : err.status === 429
            ? 'Too many requests right now. Please retry in a moment.'
            : 'Could not generate similar-event queries.';
      return json({ queries: [], status: 'error', message });
    }
    console.error('Error in similar-event-queries:', err);
    return json({ queries: [], status: 'error', message: err instanceof Error ? err.message : 'Unknown error' });
  }
});
