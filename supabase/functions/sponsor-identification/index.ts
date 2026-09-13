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
        const pages = await collectSponsorPages(event.url);

        if (pages.length === 0) {
          console.log('Could not read any page for event:', event.name);
          eventsWithoutSponsors.push(event.name);
          continue;
        }

        const pageUrl = pages[0].url;
        const content = pages
          .map((p) => `--- SOURCE: ${p.url} ---\n${p.content}`)
          .join('\n\n')
          .substring(0, 45000);

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

        console.log(`AI returned ${(extracted.sponsors ?? []).length} sponsors for ${event.name} from ${pages.length} page(s)`);
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

const SPONSOR_SLUGS = ['sponsors', 'sponsorship', 'partners', 'our-sponsors', 'sponsors-partners', 'exhibitors'];

interface Page { url: string; content: string }

/**
 * Gathers the pages most likely to list sponsors: dedicated sponsor/partner pages
 * linked from the event page, common sponsor URLs, and the event page itself.
 */
async function collectSponsorPages(eventUrl: string): Promise<Page[]> {
  const pages: Page[] = [];
  const tried = new Set<string>();

  const home = await readPage(eventUrl, 30000);
  if (home) {
    tried.add(eventUrl);
    pages.push({ url: eventUrl, content: home });
  }

  let origin = '';
  let base = '';
  try {
    const parsed = new URL(eventUrl);
    origin = parsed.hostname.replace(/^www\./, '');
    base = `${parsed.origin}${parsed.pathname.replace(/\/[^/]*$/, '')}`;
  } catch {
    return pages;
  }

  const candidates: string[] = [];

  // 1. Links on the event page whose label or URL mentions sponsors/partners.
  if (home) {
    const linkPattern = /\[([^\]]{2,80})\]\((https?:\/\/[^)\s]+)\)/g;
    for (const match of home.matchAll(linkPattern)) {
      const [, label, url] = match;
      const haystack = `${label} ${url}`.toLowerCase();
      if (!['sponsor', 'partner', 'exhibitor', 'supporter'].some((k) => haystack.includes(k))) continue;
      try {
        if (!new URL(url).hostname.replace(/^www\./, '').endsWith(origin)) continue;
      } catch {
        continue;
      }
      candidates.push(url.replace(/#.*$/, ''));
    }
  }

  // 2. Common sponsor URLs, relative to the event path and to the site root.
  for (const slug of SPONSOR_SLUGS) {
    candidates.push(`${base}/${slug}/`);
    candidates.push(`https://${origin}/${slug}/`);
  }

  // Probe candidates in parallel — sequential probing exceeds the function time budget.
  const unique = candidates.filter((url) => {
    if (tried.has(url)) return false;
    tried.add(url);
    return true;
  }).slice(0, 10);

  const probed = await Promise.all(
    unique.map(async (url) => {
      const content = await readPage(url, 20000);
      if (!content) return null;
      if (isNotFound(content)) return null;
      console.log('Sponsor page found:', url);
      return { url, content } as Page;
    }),
  );

  // Dedicated sponsor pages come first — they drive the extraction.
  return [...probed.filter((p): p is Page => p !== null).slice(0, 2), ...pages];
}

function isNotFound(content: string): boolean {
  const head = content.substring(0, 600).toLowerCase();
  return head.includes('error 404') || head.includes('page not found') || head.includes('404 not found');
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
