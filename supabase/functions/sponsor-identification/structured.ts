/**
 * Deterministic (no-AI) sponsor extraction layers.
 *
 * Modern conference sites rarely ship sponsor names as plain text. They either
 * hydrate them from an embedded JSON payload (__NEXT_DATA__, JSON-LD, Nuxt /
 * Remix / Gatsby state) or render a logo wall of <img>/<a> tags inside a
 * container whose class or id mentions sponsors. Both are parsed here without
 * spending an AI call, so extraction keeps working even when AI is rate
 * limited or out of credits.
 */

export type Found = { name: string; tier: string; website: string };

const TIER_ORDER = ['platinum', 'gold', 'silver', 'bronze'] as const;
const TIER_WORDS: Record<string, string> = {
  platinum: 'platinum',
  diamond: 'platinum',
  headline: 'platinum',
  title: 'platinum',
  presenting: 'platinum',
  elite: 'platinum',
  gold: 'gold',
  premier: 'gold',
  lead: 'gold',
  silver: 'silver',
  supporting: 'silver',
  bronze: 'bronze',
  community: 'bronze',
  startup: 'bronze',
  media: 'bronze',
  supporter: 'bronze',
};

/** Maps a heading like "Gold Sponsors" or "Diamond Partners" onto a tier. */
export function tierFromHeading(heading: string, fallbackRank = -1): string {
  const text = (heading ?? '').toLowerCase();
  for (const [word, tier] of Object.entries(TIER_WORDS)) {
    if (new RegExp(`\\b${word}\\b`).test(text)) return tier;
  }
  if (fallbackRank >= 0) return TIER_ORDER[Math.min(fallbackRank, TIER_ORDER.length - 1)];
  return 'unknown';
}

/* ------------------------------------------------------------------ */
/* Layer A — embedded JSON payloads                                     */
/* ------------------------------------------------------------------ */

const SPONSOR_KEY = /(sponsor|partner|exhibitor|supporter|funder)/i;
const NAME_KEYS = ['name', 'title', 'companyName', 'company', 'sponsorName', 'displayName', 'logoImageAltText', 'alt', 'label'];
const SITE_KEYS = ['website', 'url', 'link', 'href', 'websiteUrl', 'site'];
const TIER_KEYS = ['tier', 'level', 'category', 'sponsorshipLevel', 'type', 'group'];

/** Pulls every <script> JSON blob out of the HTML that may carry hydration state. */
function embeddedJsonBlobs(html: string): unknown[] {
  const blobs: unknown[] = [];

  const push = (raw: string) => {
    const text = raw.trim();
    if (text.length < 20 || text.length > 3_000_000) return;
    try {
      blobs.push(JSON.parse(text));
    } catch {
      /* not JSON — ignore */
    }
  };

  // <script type="application/json"> / ld+json / __NEXT_DATA__ / __NUXT_DATA__
  for (const m of html.matchAll(/<script[^>]*type=["'](?:application\/(?:ld\+)?json)["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    push(m[1]);
  }
  for (const m of html.matchAll(/<script[^>]*id=["'][^"']*(?:__NEXT_DATA__|__NUXT_DATA__|__remixContext|sanity|apollo)[^"']*["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    push(m[1]);
  }
  // window.__X__ = {...};  (Nuxt, Gatsby, custom SPAs)
  for (const m of html.matchAll(/window\.(?:__[A-Z_]+__|__INITIAL_STATE__|__DATA__)\s*=\s*(\{[\s\S]{40,600000}?\})\s*[;<]/g)) {
    push(m[1]);
  }

  return blobs;
}

function firstString(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

/**
 * Walks an arbitrary JSON payload and collects entries that sit under a
 * sponsor-ish key and look like organisations.
 */
function walkJson(node: unknown, ctxKey: string, out: Found[], depth = 0): void {
  if (depth > 10 || node === null || typeof node !== 'object' || out.length > 400) return;

  if (Array.isArray(node)) {
    for (const item of node) walkJson(item, ctxKey, out, depth + 1);
    return;
  }

  const record = node as Record<string, unknown>;
  const inSponsorContext = SPONSOR_KEY.test(ctxKey);

  if (inSponsorContext) {
    const name = firstString(record, NAME_KEYS).replace(/\s+logo$/i, '');
    if (name) {
      const website = firstString(record, SITE_KEYS);
      const tierRaw = firstString(record, TIER_KEYS) || ctxKey;
      out.push({
        name,
        tier: tierFromHeading(tierRaw),
        website: /^https?:\/\//i.test(website) ? website : '',
      });
    }
  }

  for (const [key, value] of Object.entries(record)) {
    const nextCtx = SPONSOR_KEY.test(key) ? key : inSponsorContext ? ctxKey : '';
    walkJson(value, nextCtx, out, depth + 1);
  }
}

/** Layer A: sponsors from Next.js / Nuxt / JSON-LD / CMS hydration payloads. */
export function extractFromEmbeddedJson(html: string): Found[] {
  const out: Found[] = [];
  for (const blob of embeddedJsonBlobs(html)) {
    walkJson(blob, '', out);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Layer B — sponsor containers in raw HTML                             */
/* ------------------------------------------------------------------ */

const SKIP_IMG = /(favicon|sprite|arrow|icon|banner|placeholder|avatar|headshot|profile|instagram|youtube|linkedin|twitter|facebook|logo-white|site-logo|header|footer)/i;

const IGNORED_HOSTS = new Set([
  'twitter.com', 'x.com', 'facebook.com', 'linkedin.com', 'instagram.com', 'youtube.com',
  'eventbrite.com', 'meetup.com', 'lu.ma', 'google.com', 'goo.gl', 'bit.ly', 'medium.com',
]);

/** Turns https://www.stripe.com/partners → "Stripe". */
export function brandFromUrl(href: string): string {
  try {
    const host = new URL(href).hostname.replace(/^www\./, '').toLowerCase();
    if (IGNORED_HOSTS.has(host)) return '';
    const parts = host.split('.');
    const core = parts.length > 2 && parts[parts.length - 2].length <= 3
      ? parts[parts.length - 3]
      : parts[0];
    if (!core || core.length < 2) return '';
    return core
      .split(/[-_]/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  } catch {
    return '';
  }
}

function cleanName(raw: string): string {
  return (raw ?? '')
    .replace(/\s+/g, ' ')
    .replace(/\b(logo|logotype|image|icon)\b/gi, '')
    .replace(/[|•–-]\s*$/, '')
    .trim();
}

/**
 * Layer B: scan raw HTML for sponsor sections and read each logo's alt/title
 * text, falling back to the brand implied by the link that wraps it.
 */
export function extractFromHtmlSections(html: string, pageUrl = ''): Found[] {
  const out: Found[] = [];
  if (!html) return out;

  let pageHost = '';
  try {
    pageHost = new URL(pageUrl).hostname.replace(/^www\./, '').toLowerCase();
  } catch { /* unknown host */ }

  // Split the document on headings and sponsor-ish container openings so each
  // chunk carries the tier label that precedes its logos.
  const markers: { index: number; label: string }[] = [];

  for (const m of html.matchAll(/<h[1-4][^>]*>([\s\S]{0,300}?)<\/h[1-4]>/gi)) {
    const label = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (label) markers.push({ index: m.index ?? 0, label });
  }
  for (const m of html.matchAll(/<(?:div|section|ul)[^>]*(?:class|id)=["'][^"']*(sponsor|partner|exhibitor|supporter)[^"']*["'][^>]*>/gi)) {
    markers.push({ index: m.index ?? 0, label: m[1] });
  }
  if (markers.length === 0) return out;

  markers.sort((a, b) => a.index - b.index);

  let sponsorRank = -1;
  for (let i = 0; i < markers.length; i++) {
    const { index, label } = markers[i];
    if (!SPONSOR_KEY.test(label)) continue;
    sponsorRank += 1;
    const end = markers[i + 1]?.index ?? Math.min(index + 12000, html.length);
    const chunk = html.slice(index, Math.min(end, index + 12000));
    const tier = tierFromHeading(label, sponsorRank);

    // Only anchors that wrap a logo image count — plain text links inside a
    // sponsor block are navigation, categories or "read more" links.
    for (const a of chunk.matchAll(/<a[^>]+href=["'](https?:\/\/[^"']+)["'][^>]*>([\s\S]{0,400}?)<\/a>/gi)) {
      const href = a[1];
      const inner = a[2];
      if (!/<img/i.test(inner)) continue;
      let host = '';
      try {
        host = new URL(href).hostname.replace(/^www\./, '').toLowerCase();
      } catch { /* ignore */ }
      const alt = inner.match(/alt=["']([^"']+)["']/i)?.[1]
        ?? inner.match(/title=["']([^"']+)["']/i)?.[1]
        ?? '';
      // A link back to the event's own site tells us nothing about the sponsor.
      const fromHref = host && host !== pageHost ? brandFromUrl(href) : '';
      const name = cleanName(alt) || fromHref;
      if (!name || SKIP_IMG.test(name)) continue;
      out.push({ name, tier, website: fromHref ? href : '' });
    }


    // Bare logo images with alt text but no link.
    for (const img of chunk.matchAll(/<img[^>]+>/gi)) {
      const tag = img[0];
      const src = tag.match(/(?:data-src|src)=["']([^"'\s]+)/i)?.[1] ?? '';
      if (SKIP_IMG.test(src)) continue;
      const alt = tag.match(/alt=["']([^"']+)["']/i)?.[1] ?? '';
      const name = cleanName(alt);
      if (!name || SKIP_IMG.test(name)) continue;
      out.push({ name, tier, website: '' });
    }
  }

  return out;
}
