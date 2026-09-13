import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, json, readPage } from "../_shared/scrape.ts";

interface Sponsor {
  id: string;
  name: string;
  tier: string;
  website?: string;
  eventIds: string[];
  eventNames?: string[];
  eventCount: number;
  sourceUrl?: string;
}

interface EmailRecord {
  email: string;
  /** true = published on the company's own site; false = pattern guess */
  verified: boolean;
  sourceUrl?: string;
}

interface EnrichedSponsor extends Sponsor {
  domain?: string;
  emails: string[];
  emailDetails: EmailRecord[];
  linkedinUrl?: string;
  enrichmentStatus: 'enriched' | 'partial' | 'failed';
}

const GUESS_PREFIXES = ['partnerships', 'sponsorship', 'info', 'contact', 'hello'];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const sponsors: Sponsor[] = Array.isArray(body.sponsors) ? body.sponsors : [];
    console.log('Contact enrichment for sponsors:', sponsors.length);

    const enrichedSponsors: EnrichedSponsor[] = [];

    for (const sponsor of sponsors) {
      const enriched: EnrichedSponsor = {
        ...sponsor,
        emails: [],
        emailDetails: [],
        enrichmentStatus: 'failed',
      };

      try {
        const domain = extractDomain(sponsor.website);
        enriched.domain = domain;

        if (domain) {
          const base = `https://${domain}`;
          const candidates = [
            `${base}/contact`,
            `${base}/partnerships`,
            `${base}/about`,
            base,
          ];

          for (const pageUrl of candidates) {
            const content = await readPage(pageUrl, 20000);
            if (!content) continue;

            for (const email of extractEmails(content, domain)) {
              if (enriched.emailDetails.some((e) => e.email === email)) continue;
              enriched.emailDetails.push({ email, verified: true, sourceUrl: pageUrl });
            }

            if (!enriched.linkedinUrl) {
              const found = content.match(/https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/company\/[A-Za-z0-9._-]+/i);
              if (found) enriched.linkedinUrl = found[0];
            }

            if (enriched.emailDetails.length > 0) break;
            await new Promise((r) => setTimeout(r, 200));
          }

          // Only if nothing real was published, offer clearly-labelled guesses.
          if (enriched.emailDetails.length === 0) {
            for (const prefix of GUESS_PREFIXES.slice(0, 3)) {
              enriched.emailDetails.push({ email: `${prefix}@${domain}`, verified: false });
            }
          }
        }

        enriched.emails = enriched.emailDetails.map((e) => e.email);

        const hasVerified = enriched.emailDetails.some((e) => e.verified);
        enriched.enrichmentStatus = hasVerified
          ? 'enriched'
          : enriched.emailDetails.length > 0
            ? 'partial'
            : 'failed';
      } catch (error) {
        console.error('Error enriching sponsor:', sponsor.name, error);
        enriched.enrichmentStatus = 'failed';
      }

      enrichedSponsors.push(enriched);
      await new Promise((r) => setTimeout(r, 200));
    }

    return json({
      sponsors: enrichedSponsors,
      totalEnriched: enrichedSponsors.filter((s) => s.enrichmentStatus === 'enriched').length,
      totalPartial: enrichedSponsors.filter((s) => s.enrichmentStatus === 'partial').length,
      totalFailed: enrichedSponsors.filter((s) => s.enrichmentStatus === 'failed').length,
    });
  } catch (error) {
    console.error('Error in contact-enrichment:', error);
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

/** Only uses a real website; never invents a domain from the company name. */
function extractDomain(website?: string): string | undefined {
  if (!website) return undefined;
  try {
    const url = website.startsWith('http') ? website : `https://${website}`;
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return undefined;
  }
}

function extractEmails(content: string, domain: string): string[] {
  const matches = content.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g) || [];
  const filtered = matches.filter((email) => {
    const lower = email.toLowerCase();
    if (!lower.endsWith(`@${domain}`) && !lower.endsWith(`.${domain}`)) return false;
    return !['example', 'test@', 'noreply', 'no-reply', 'sentry', 'wixpress', '.png', '.jpg'].some((bad) =>
      lower.includes(bad),
    );
  });
  return [...new Set(filtered)].slice(0, 5);
}
