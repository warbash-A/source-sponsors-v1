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
  'tier must be one of: platinum, gold, silver, bronze, unknown.',
  'When the page groups sponsors under headings with custom names (for example "Super Admin", "Admin", "Diamond", "Community", "Lead Partner"), rank the groups in the order they appear and map them to platinum, gold, silver, bronze in that order; any further groups are bronze. Use "unknown" only when the page shows no grouping at all.',
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
        let found = (extracted.sponsors ?? []).filter((s) => isLikelyCompany(s.name));

        // Many sponsor pages show logos as images with little or no text, so always
        // read the logo wall as well and merge what it finds with the text results.
        const logos = await collectLogoUrls(pages);
        if (logos.length > 0) {
          console.log(`Trying logo vision for ${event.name} with ${logos.length} image(s)`);
          const fromLogos = await readLogosInBatches(logos, event.name);
          console.log(`Logo vision returned ${fromLogos.length} sponsors for ${event.name}`);
          found = mergeSponsors(found, fromLogos);
        }

        // Some sponsor pages render their logo walls entirely in the browser, so neither
        // the reader text nor the HTML holds any sponsor. Those pages usually load the
        // list from a separate data endpoint — read it directly.
        if (found.length === 0) {
          const fromData = await collectSponsorsFromDataEndpoints(pages[0].url);
          if (fromData.length > 0) {
            console.log(`Data endpoints returned ${fromData.length} sponsors for ${event.name}`);
            found = mergeSponsors(found, fromData);
          }
        }

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

const LOGO_INSTRUCTIONS = [
  'You read company logos from sponsor walls and return the organisations they belong to.',
  'For each image, return the company or organisation name written in or represented by the logo.',
  'Skip images that are not company logos: decorative art, photos of people, banners, icons, arrows or the event\'s own branding.',
  'If you cannot confidently read a logo, omit it. Never invent a sponsor.',
  'tier must be "unknown" unless the ordering clearly indicates a tier; website must be an empty string.',
].join(' ');

const LOGO_SKIP = /(favicon|sprite|arrow|icon|banner|instagram|youtube|linkedin|twitter|facebook|placeholder|avatar|headshot|profile)/i;

const MAX_LOGOS = 40;
const LOGO_BATCH = 10;

/** Reads the logo wall in small batches so one unreadable image can't lose the rest. */
async function readLogosInBatches(
  logos: string[],
  eventName: string,
): Promise<{ name: string; tier: string; website: string }[]> {
  const out: { name: string; tier: string; website: string }[] = [];
  for (let i = 0; i < logos.length; i += LOGO_BATCH) {
    const batch = logos.slice(i, i + LOGO_BATCH);
    try {
      const res = await aiExtract<ExtractedSponsors>({
        name: 'event_sponsors',
        schema: SPONSORS_SCHEMA as unknown as Record<string, unknown>,
        instructions: LOGO_INSTRUCTIONS,
        content: `These images are the sponsor/partner logos shown on the page for the event "${eventName}". Name each sponsoring organisation you can read.`,
        imageUrls: batch,
      });
      out.push(...(res.sponsors ?? []).filter((s) => isLikelyCompany(s.name)));
    } catch (err) {
      console.error('Logo batch failed', eventName, i, err instanceof Error ? err.message : err);
    }
  }
  return out;
}

/** Normalises an image URL to a fetchable original, or null when it isn't a usable logo. */
function normaliseImageUrl(raw: string, alt = ''): string | null {
  if (LOGO_SKIP.test(alt) || LOGO_SKIP.test(raw)) return null;
  // Wix/Squarespace style transforms: keep the original asset (avif/webp variants are rejected upstream).
  const url = raw.replace(/\/v1\/(fill|crop|fit)\/[^?]*$/, '').replace(/[?#].*$/, '');
  // SVG is not an accepted vision format.
  if (!/\.(png|jpe?g|webp)$/i.test(url)) return null;
  return url;
}

/**
 * Collects sponsor-logo image URLs from the scraped pages. Markdown first; when a page
 * yields few images (logo walls are often rendered as bare <img> tags the reader drops)
 * the raw HTML is fetched and scanned too.
 */
async function collectLogoUrls(pages: Page[]): Promise<string[]> {
  const urls: string[] = [];
  const seen = new Set<string>();

  const add = (raw: string, alt = '') => {
    const url = normaliseImageUrl(raw, alt);
    if (!url) return;
    const key = url.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    urls.push(url);
  };

  for (const page of pages) {
    for (const match of page.content.matchAll(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g)) {
      add(match[2], match[1]);
      if (urls.length >= MAX_LOGOS) return urls;
    }
  }

  if (urls.length < MAX_LOGOS && pages.length > 0) {
    const html = await fetchHtml(pages[0].url);
    if (html) {
      for (const match of html.matchAll(/<img[^>]+>/gi)) {
        const tag = match[0];
        const src = tag.match(/(?:data-src|srcset|src)=["']([^"'\s]+)/i)?.[1];
        const alt = tag.match(/alt=["']([^"']*)["']/i)?.[1] ?? '';
        if (src && /^https?:\/\//i.test(src)) add(src, alt);
        if (urls.length >= MAX_LOGOS) break;
      }
    }
  }

  return urls;
}

/** Fetches a page's raw HTML directly (no reader) so lazy <img> markup is visible. */
async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SponsorScout/1.0)' },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;
    return (await res.text()).substring(0, 400000);
  } catch (err) {
    console.log('Raw HTML fetch failed', url, err instanceof Error ? err.message : err);
    return null;
  }
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
