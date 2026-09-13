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
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: { 'Accept': 'text/plain' },
      signal: AbortSignal.timeout(45000),
    });
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
    return null;
  }
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
