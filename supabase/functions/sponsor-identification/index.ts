import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, json, generateId, readPage } from "../_shared/scrape.ts";
import { aiExtract, AiGatewayError } from "../_shared/ai-extract.ts";

interface EventInput {
  id: string;
  name: string;
  url: string;
}

interface Sponsor {
  id: string;
  name: string;
  tier: 'platinum' | 'gold' | 'silver' | 'bronze' | 'unknown';
  website?: string;
  eventIds: string[];
  eventNames: string[];
  eventCount: number;
  sourceUrl?: string;
}

interface ExtractedSponsors {
  sponsors: { name: string; tier: string; website: string }[];
}

const SPONSORS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['sponsors'],
  properties: {
    sponsors: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'tier', 'website'],
        properties: {
          name: { type: 'string' },
          tier: { type: 'string', enum: ['platinum', 'gold', 'silver', 'bronze', 'unknown'] },
          website: { type: 'string' },
        },
      },
    },
  },
} as const;

const VALID_TIERS = ['platinum', 'gold', 'silver', 'bronze', 'unknown'];

const INSTRUCTIONS = [
  'You extract sponsoring organisations from the markdown of an event website.',
  'Return ONLY companies, brands or organisations that the page explicitly presents as sponsors, partners, supporters or exhibitors of this event.',
  'Never return a person\'s name, a speaker, an organiser, a job title, a navigation label, a legal/cookie link, a social network, a ticket or venue label, or the event itself.',
  'tier must be one of: platinum, gold, silver, bronze, unknown. Use the tier heading the sponsor appears under; use "unknown" when the page states no tier.',
  'website: the sponsor\'s own website URL if the page links to it, otherwise an empty string.',
  'If the page contains no explicit sponsor or partner section, return an empty list. Never guess or invent sponsors.',
].join(' ');

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const events: EventInput[] = Array.isArray(body.events) ? body.events : [];

    if (events.length === 0) {
      return json({ sponsors: [], totalFound: 0, eventsWithoutSponsors: [], status: 'empty' });
    }

    console.log('Sponsor identification for events:', events.length);

    const byKey = new Map<string, Sponsor>();
    const eventsWithoutSponsors: string[] = [];
    let aiBlockedMessage: string | undefined;

    for (const event of events) {
      if (!event?.url || !/^https?:\/\//i.test(event.url)) {
        eventsWithoutSponsors.push(event?.name ?? 'Unnamed event');
        continue;
      }

      try {
        const pageUrl = await findSponsorPage(event.url);
        const content = await readPage(pageUrl, 30000);

        if (!content) {
          console.log('Could not read page for event:', event.name);
          eventsWithoutSponsors.push(event.name);
          continue;
        }

        let extracted: ExtractedSponsors;
        try {
          extracted = await aiExtract<ExtractedSponsors>({
            name: 'event_sponsors',
            schema: SPONSORS_SCHEMA as unknown as Record<string, unknown>,
            instructions: `${INSTRUCTIONS} The event is "${event.name}".`,
            content,
          });
        } catch (err) {
          if (err instanceof AiGatewayError) {
            aiBlockedMessage =
              err.status === 402
                ? 'AI credits are exhausted, so sponsor extraction stopped.'
                : err.status === 429
                  ? 'Rate limited while reading sponsor pages.'
                  : 'Sponsor extraction failed.';
            console.error('AI extraction blocked:', err.status, err.message);
            eventsWithoutSponsors.push(event.name);
            if (err.status === 402 || err.status === 403) break;
            continue;
          }
          throw err;
        }

        const found = (extracted.sponsors ?? []).filter((s) => isLikelyCompany(s.name));
        if (found.length === 0) {
          eventsWithoutSponsors.push(event.name);
          continue;
        }

        for (const s of found) {
          const name = s.name.trim();
          const key = name.toLowerCase();
          const tier = (VALID_TIERS.includes(s.tier) ? s.tier : 'unknown') as Sponsor['tier'];
          const existing = byKey.get(key);
          if (existing) {
            if (!existing.eventIds.includes(event.id)) {
              existing.eventIds.push(event.id);
              existing.eventNames.push(event.name);
              existing.eventCount = existing.eventIds.length;
            }
            if (existing.tier === 'unknown' && tier !== 'unknown') existing.tier = tier;
            if (!existing.website && s.website) existing.website = s.website;
          } else {
            byKey.set(key, {
              id: generateId(),
              name,
              tier,
              website: s.website?.trim() || undefined,
              eventIds: [event.id],
              eventNames: [event.name],
              eventCount: 1,
              sourceUrl: pageUrl,
            });
          }
        }
      } catch (err) {
        console.error('Error processing event', event.name, err);
        eventsWithoutSponsors.push(event.name);
      }
    }

    const sponsors = [...byKey.values()];
    console.log('Sponsors identified:', sponsors.length, 'events without sponsors:', eventsWithoutSponsors.length);

    return json({
      sponsors,
      totalFound: sponsors.length,
      eventsWithoutSponsors,
      status: sponsors.length > 0 ? 'ok' : 'no_results',
      message: aiBlockedMessage,
    });
  } catch (error) {
    console.error('Error in sponsor-identification:', error);
    return json({
      sponsors: [],
      totalFound: 0,
      eventsWithoutSponsors: [],
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/** Looks for a dedicated sponsors/partners page linked from the event page. */
async function findSponsorPage(eventUrl: string): Promise<string> {
  const home = await readPage(eventUrl, 30000);
  if (!home) return eventUrl;

  const linkPattern = /\[([^\]]{2,80})\]\((https?:\/\/[^)\s]+)\)/g;
  const keywords = ['sponsor', 'partner', 'exhibitor', 'supporter'];
  let origin = '';
  try {
    origin = new URL(eventUrl).hostname.replace(/^www\./, '');
  } catch {
    return eventUrl;
  }

  for (const match of home.matchAll(linkPattern)) {
    const [, label, url] = match;
    const haystack = `${label} ${url}`.toLowerCase();
    if (!keywords.some((k) => haystack.includes(k))) continue;
    try {
      if (!new URL(url).hostname.replace(/^www\./, '').endsWith(origin)) continue;
    } catch {
      continue;
    }
    console.log('Found sponsor page:', url);
    return url;
  }

  return eventUrl;
}

/** Rejects obvious non-company strings the model may still return. */
function isLikelyCompany(raw: string): boolean {
  const name = (raw ?? '').trim();
  if (name.length < 2 || name.length > 60) return false;
  if (/^\d+$/.test(name)) return false;
  if (/^(image|photo|logo|icon|link|button)\b/i.test(name)) return false;
  if (/(privacy|cookie|terms|copyright|read more|learn more|sign up|log in|contact us)/i.test(name)) return false;

  // Two capitalised words with no company marker is usually a person's name.
  const personLike = /^[A-Z][a-z]{1,15}\s[A-Z][a-z]{1,15}$/.test(name);
  const companyMarker = /(inc|llc|ltd|corp|gmbh|co|group|labs|technologies|systems|ventures|capital|partners|media|bank|studio|software|solutions|university|foundation|institute)\b/i.test(name);
  if (personLike && !companyMarker) return false;

  return true;
}
