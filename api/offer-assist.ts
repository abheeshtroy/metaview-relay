import {
  checkOfferAssist,
  offerAssistInput,
  offerAssistInstructions,
  scriptedOfferAssist,
  type OfferAssist,
} from '../src/relay/offerAssist.js';

// Server-side only. The key never reaches the browser, and the browser never
// receives model output that hasn't passed `checkOfferAssist`.

export interface OfferAssistProvider {
  assist(question: string): Promise<OfferAssist>;
}

type OfferAssistDiagnostic =
  | { category: 'missing-key' }
  | { category: 'provider-http'; providerStatus: number }
  | { category: 'timeout' }
  | { category: 'malformed-response' }
  | { category: 'validation-rejection' }
  | { category: 'provider-error' };

class OfferAssistProviderError extends Error {
  constructor(readonly diagnostic: OfferAssistDiagnostic) {
    super(diagnostic.category);
  }
}

function logOfferAssistDiagnostic(diagnostic: OfferAssistDiagnostic) {
  // Keep deployment diagnostics useful without logging credentials, request
  // headers, the candidate's question, or Anthropic's response body.
  console.error({ event: 'offer-assist-fallback', ...diagnostic });
}

function diagnosticFor(error: unknown): OfferAssistDiagnostic {
  return error instanceof OfferAssistProviderError
    ? error.diagnostic
    : { category: 'provider-error' };
}

function responseJson(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export class AnthropicMessagesProvider implements OfferAssistProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
    private readonly timeoutMs = 8_000,
  ) {}

  async assist(question: string): Promise<OfferAssist> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      try {
        const upstream = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: this.model,
            max_tokens: 400,
            system: `${offerAssistInstructions} Return only a JSON object with the required Offer Assist fields.`,
            messages: [{ role: 'user', content: offerAssistInput(question) }],
          }),
        });
        if (!upstream.ok)
          throw new OfferAssistProviderError({
            category: 'provider-http',
            providerStatus: upstream.status,
          });
        let payload: { content?: { type: string; text?: string }[] };
        try {
          payload = (await upstream.json()) as typeof payload;
        } catch {
          throw new OfferAssistProviderError({ category: 'malformed-response' });
        }
        const text = payload.content?.find((part) => part.type === 'text')?.text;
        if (typeof text !== 'string')
          throw new OfferAssistProviderError({ category: 'malformed-response' });
        let output: unknown;
        try {
          output = JSON.parse(text);
        } catch {
          throw new OfferAssistProviderError({ category: 'malformed-response' });
        }
        const checked = checkOfferAssist(question, output);
        if (!checked)
          throw new OfferAssistProviderError({ category: 'validation-rejection' });
        return { ...checked, mode: 'live', status: 'success' };
      } catch (error) {
        if (error instanceof OfferAssistProviderError) throw error;
        if (controller.signal.aborted)
          throw new OfferAssistProviderError({ category: 'timeout' });
        throw error;
      }
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
  const key = process.env.ANTHROPIC_API_KEY;
  if (!provider && !key) {
    logOfferAssistDiagnostic({ category: 'missing-key' });
    return responseJson(scriptedOfferAssist(question, 'fallback'));
  }
  try {
    const result = await (provider ?? new AnthropicMessagesProvider(key!)).assist(
      question,
    );
    // Providers are never trusted with candidate-visible text or provenance.
    // Recreate both from the checked contract at the HTTP boundary.
    const checked = checkOfferAssist(question, result);
    if (!checked) throw new Error('provider result failed checks');
    return responseJson({ ...checked, mode: 'live', status: 'success' });
  } catch (error) {
    logOfferAssistDiagnostic(diagnosticFor(error));
    return responseJson(scriptedOfferAssist(question, 'provider-error'));
  }
}

// Vercel discovers files in /api and invokes this Web Standard handler in its
// Node.js runtime. Keeping this adapter at the edge of the module means Vite's
// local middleware and production use the exact same guarded implementation.
export default { fetch: handleOfferAssist };
