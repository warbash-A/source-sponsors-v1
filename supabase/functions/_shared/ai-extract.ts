/**
 * Structured extraction through the Lovable AI Gateway chat completions API.
 * Returns parsed JSON matching the supplied schema.
 */

const GATEWAY_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';
const MODEL = 'google/gemini-2.5-flash';

export class AiGatewayError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'AiGatewayError';
  }
}

interface ExtractArgs {
  /** Name for the JSON schema (letters, numbers, underscores). */
  name: string;
  /** Strict-compatible JSON schema: object root, all props required, additionalProperties false. */
  schema: Record<string, unknown>;
  instructions: string;
  content: string;
  /** Optional image URLs (e.g. sponsor logos) sent alongside the text. */
  imageUrls?: string[];
  /** Abort the gateway call after this many milliseconds. */
  timeoutMs?: number;
}

export async function aiExtract<T>({ name, schema, instructions, content, imageUrls, timeoutMs }: ExtractArgs): Promise<T> {
  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!apiKey) throw new AiGatewayError(401, 'LOVABLE_API_KEY is not configured');

  const userContent: unknown[] = [
    { type: 'text', text: content },
    ...(imageUrls ?? []).map((url) => ({ type: 'image_url', image_url: { url } })),
  ];

  const res = await fetch(GATEWAY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'X-Lovable-AIG-SDK': 'fetch',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: instructions },
        { role: 'user', content: userContent },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name, schema, strict: true },
      },
    }),
    signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.error('AI gateway error', res.status, detail.substring(0, 500));
    throw new AiGatewayError(res.status, detail || `AI gateway returned ${res.status}`);
  }

  const data = await res.json();
  const output: string = data?.choices?.[0]?.message?.content ?? '';

  if (!output.trim()) throw new AiGatewayError(502, 'AI returned an empty response');
  return JSON.parse(output) as T;
}
