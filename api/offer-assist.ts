import {
  checkOfferAssist,
  offerAssistInput,
  offerAssistInstructions,
  offerAssistSchema,
  scriptedOfferAssist,
  type OfferAssist,
} from '../src/relay/offerAssist';

// Server-side only. The key never reaches the browser, and the browser never
// receives model output that hasn't passed `checkOfferAssist`.

export interface OfferAssistProvider {
  assist(question: string): Promise<OfferAssist>;
}

function responseJson(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export class OpenAIResponsesProvider implements OfferAssistProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model = process.env.OPENAI_MODEL || 'gpt-4.1-mini',
    private readonly timeoutMs = 8_000,
  ) {}

  async assist(question: string): Promise<OfferAssist> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const upstream = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          store: false,
          max_output_tokens: 400,
          instructions: offerAssistInstructions,
          input: offerAssistInput(question),
          text: {
            format: {
              type: 'json_schema',
              name: 'offer_triage',
              strict: true,
              schema: offerAssistSchema,
            },
          },
        }),
      });
      if (!upstream.ok) throw new Error(`provider status ${upstream.status}`);
      const payload = (await upstream.json()) as {
        output_text?: string;
        output?: { content?: { type: string; text?: string }[] }[];
      };
      const text =
        payload.output_text ??
        payload.output
          ?.flatMap((item) => item.content ?? [])
          .find((part) => part.type === 'output_text')?.text;
      const checked = text ? checkOfferAssist(question, JSON.parse(text)) : null;
      if (!checked) throw new Error('provider output failed checks');
      return { ...checked, mode: 'live', status: 'success' };
    } finally {
      clearTimeout(timeout);
    }
  }
}

export async function handleOfferAssist(
  request: Request,
  provider?: OfferAssistProvider,
): Promise<Response> {
  if (request.method !== 'POST')
    return responseJson({ error: 'method not allowed' }, 405);
  let question: unknown;
  try {
    question = ((await request.json()) as { question?: unknown }).question;
  } catch {
    return responseJson({ error: 'invalid request' }, 400);
  }
  if (typeof question !== 'string' || !question.trim() || question.length > 500)
    return responseJson({ error: 'invalid question' }, 400);
  const key = process.env.OPENAI_API_KEY;
  if (!provider && !key) return responseJson(scriptedOfferAssist(question, 'fallback'));
  try {
    const result = await (provider ?? new OpenAIResponsesProvider(key!)).assist(question);
    // Providers are never trusted with candidate-visible text or provenance.
    // Recreate both from the checked contract at the HTTP boundary.
    const checked = checkOfferAssist(question, result);
    if (!checked) throw new Error('provider result failed checks');
    return responseJson({ ...checked, mode: 'live', status: 'success' });
  } catch {
    return responseJson(scriptedOfferAssist(question, 'provider-error'));
  }
}
