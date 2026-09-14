/**
 * Structured extraction through the Lovable AI Gateway Responses API.
 * Streams the response (required for reasoning models) and returns parsed JSON.
 */

const GATEWAY_URL = 'https://ai.gateway.lovable.dev/v1/responses';
const MODEL = 'openai/gpt-6-astra';

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
}

export async function aiExtract<T>({ name, schema, instructions, content, imageUrls }: ExtractArgs): Promise<T> {
  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!apiKey) throw new AiGatewayError(401, 'LOVABLE_API_KEY is not configured');

  const res = await fetch(GATEWAY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Lovable-API-Key': apiKey,
      'X-Lovable-AIG-SDK': 'fetch',
    },
    body: JSON.stringify({
      model: MODEL,
      input: [
        { role: 'developer', content: [{ type: 'input_text', text: instructions }] },
        {
          role: 'user',
          content: [
            { type: 'input_text', text: content },
            ...(imageUrls ?? []).map((url) => ({ type: 'input_image', image_url: url })),
          ],
        },
      ],
      stream: true,
      reasoning: { effort: 'low' },
      text: {
        format: { type: 'json_schema', name, schema, strict: true },
      },
    }),
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '');
    console.error('AI gateway error', res.status, detail.substring(0, 500));
    throw new AiGatewayError(res.status, detail || `AI gateway returned ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let output = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const event = JSON.parse(payload);
        if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') {
          output += event.delta;
        } else if (event.type === 'response.completed' && !output) {
          output = event.response?.output_text ?? '';
        }
      } catch {
        // partial or non-JSON keepalive line — ignore
      }
    }
  }

  if (!output.trim()) throw new AiGatewayError(502, 'AI returned an empty response');
  return JSON.parse(output) as T;
}
