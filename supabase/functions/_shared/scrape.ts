export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}

/**
 * Fetch a page as markdown through the JinaAI Reader (free, no API key).
 * Returns null when the page is unreachable or protected by a bot check.
 */
export async function readPage(url: string, maxChars = 30000): Promise<string | null> {
  // The free reader rate-limits bursts with 429s; back off and retry instead of
  // treating a throttled request as "page has no content".
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`https://r.jina.ai/${url}`, {
        headers: { 'Accept': 'text/plain' },
        signal: AbortSignal.timeout(45000),
      });
      if (res.status === 429 || res.status === 503) {
        await res.body?.cancel();
        console.log('Reader throttled, retrying', res.status, url);
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      if (!res.ok) {
        console.log('Reader failed', res.status, url);
        return null;
      }
      const text = await res.text();
      if (isBlocked(text)) {
        console.log('Reader blocked by bot check:', url);
        return null;
      }
      return text.substring(0, maxChars);
    } catch (err) {
      console.error('Reader error', url, err);
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  return null;
}

/** Detects CAPTCHA / human-verification interstitials returned instead of content. */
export function isBlocked(content: string): boolean {
  const head = content.substring(0, 1200).toLowerCase();
  return (
    head.includes("confirm you are human") ||
    head.includes('human verification') ||
    head.includes('requiring captcha') ||
    head.includes('access denied') ||
    head.includes('just a moment...') ||
    head.includes('enable javascript and cookies to continue')
  );
}
