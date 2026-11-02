import {
  checkOfferAssist,
  composeOfferAssist,
  offerAssistInput,
  offerAssistInstructions,
  offerAssistSchema,
  scriptedOfferAssist,
  type OfferAssist,
} from '../src/relay/offerAssist.js';

// Server-side only. The key never reaches the browser. Anthropic only classifies
// the question; Relay writes the candidate-facing answer from approved wording,
// and the browser never receives a result that hasn't passed `checkOfferAssist`.

export interface OfferAssistProvider {
  assist(question: string): Promise<OfferAssist>;
}

type CheckedOfferAssist = Exclude<ReturnType<typeof checkOfferAssist>, null>;

type OfferAssistDiagnostic =
  | { category: 'missing-key' }
  | { category: 'provider-http'; providerStatus: number }
  | { category: 'abort-timeout'; errorName: 'AbortError' }
  | { category: 'network-fetch-failure'; errorName: SafeErrorName }
  | { category: 'json-parsing-failure'; errorName: 'SyntaxError' }
  | { category: 'response-shape-failure' }
  | { category: 'validation-rejection' }
  | {
      category: 'unexpected-runtime-error';
      errorName: SafeErrorName;
      stage: OfferAssistStage;
    };

type SafeErrorName = 'Error' | 'TypeError' | 'RangeError' | 'UnknownError';
type OfferAssistStage =
  | 'request-build'
  | 'outbound-fetch'
  | 'response-json'
  | 'response-shape'
  | 'model-text-json'
  | 'relay-validation'
  | 'http-revalidation'
  | 'http-response-build'
  | 'http-response-serialization';

export interface OfferAssistProviderDependencies {
  buildRequest?: (question: string, apiKey: string, model: string) => RequestInit;
  fetch?: typeof fetch;
  parseModelText?: typeof JSON.parse;
  validate?: typeof composeOfferAssist;
}

export interface OfferAssistHttpDependencies {
  revalidate?: typeof checkOfferAssist;
  buildCandidateResponse?: (checked: CheckedOfferAssist) => OfferAssist;
  serializeCandidateResponse?: (body: OfferAssist) => Response;
}

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

function diagnosticFor(error: unknown, stage: OfferAssistStage): OfferAssistDiagnostic {
  return error instanceof OfferAssistProviderError
    ? error.diagnostic
    : {
        category: 'unexpected-runtime-error',
        errorName: safeErrorName(error),
        stage,
      };
}

function safeErrorName(error: unknown): SafeErrorName {
  if (!(error instanceof Error)) return 'UnknownError';
  if (error.name === 'TypeError') return 'TypeError';
  if (error.name === 'RangeError') return 'RangeError';
  return 'Error';
}

function isSyntaxError(error: unknown): error is SyntaxError {
  return (
    error instanceof SyntaxError ||
    (error instanceof Error && error.name === 'SyntaxError')
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// Claude often returns the requested JSON object inside one Markdown code fence
// (```json … ```). Unwrap only when the fence is the whole text block; anything
// else, including prose around a fence, is parsed as-is and so still rejected.
const wholeFencedBlock = /^```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n?```$/i;

function modelJsonText(text: string) {
  const trimmed = text.trim();
  return wholeFencedBlock.exec(trimmed)?.[1] ?? trimmed;
}

function responseJson(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function buildCandidateResponse(checked: CheckedOfferAssist): OfferAssist {
  return { ...checked, mode: 'live', status: 'success' };
}

function buildAnthropicRequest(
  question: string,
  apiKey: string,
  model: string,
): RequestInit {
  return {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 400,
      system: `${offerAssistInstructions} Return only a JSON object with the required Offer Assist classification fields.`,
      messages: [{ role: 'user', content: offerAssistInput(question) }],
      // Structured outputs: Anthropic constrains the reply to the Offer Assist
      // classification schema (enums for concerns, route and fact ids). Relay
      // writes the answer itself and still validates.
      output_config: { format: { type: 'json_schema', schema: offerAssistSchema } },
    }),
  };
}

export class AnthropicMessagesProvider implements OfferAssistProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
    private readonly timeoutMs = 8_000,
    private readonly dependencies: OfferAssistProviderDependencies = {},
  ) {}

  async assist(question: string): Promise<OfferAssist> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      let stage: OfferAssistStage = 'request-build';
      try {
        const request = (this.dependencies.buildRequest ?? buildAnthropicRequest)(
          question,
          this.apiKey,
          this.model,
        );
        let upstream: Response;
        stage = 'outbound-fetch';
        try {
          upstream = await (this.dependencies.fetch ?? fetch)(
            'https://api.anthropic.com/v1/messages',
            { ...request, signal: controller.signal },
          );
        } catch (error) {
          if (controller.signal.aborted)
            throw new OfferAssistProviderError({
              category: 'abort-timeout',
              errorName: 'AbortError',
            });
          throw new OfferAssistProviderError({
            category: 'network-fetch-failure',
            errorName: safeErrorName(error),
          });
        }
        if (!upstream.ok)
          throw new OfferAssistProviderError({
            category: 'provider-http',
            providerStatus: upstream.status,
          });
        let payload: unknown;
        stage = 'response-json';
        try {
          payload = await upstream.json();
        } catch (error) {
          if (!isSyntaxError(error)) throw error;
          throw new OfferAssistProviderError({
            category: 'json-parsing-failure',
            errorName: 'SyntaxError',
          });
        }
        stage = 'response-shape';
        if (!isRecord(payload) || !Array.isArray(payload.content))
          throw new OfferAssistProviderError({ category: 'response-shape-failure' });
        const text = payload.content.find(
          (part): part is Record<string, unknown> =>
            isRecord(part) && part.type === 'text',
        )?.text;
        if (typeof text !== 'string')
          throw new OfferAssistProviderError({ category: 'response-shape-failure' });
        let output: unknown;
        stage = 'model-text-json';
        try {
          output = (this.dependencies.parseModelText ?? JSON.parse)(modelJsonText(text));
        } catch (error) {
          if (!isSyntaxError(error)) throw error;
          throw new OfferAssistProviderError({
            category: 'json-parsing-failure',
            errorName: 'SyntaxError',
          });
        }
        stage = 'relay-validation';
        // Relay writes the answer from approved wording, then checks the result.
        const checked = (this.dependencies.validate ?? composeOfferAssist)(
          question,
          output,
        );
        if (!checked)
          throw new OfferAssistProviderError({ category: 'validation-rejection' });
        return { ...checked, mode: 'live', status: 'success' };
      } catch (error) {
        if (error instanceof OfferAssistProviderError) throw error;
        throw new OfferAssistProviderError(diagnosticFor(error, stage));
      }
    } finally {
      clearTimeout(timeout);
    }
  }
}

export async function handleOfferAssist(
  request: Request,
  provider?: OfferAssistProvider,
  dependencies: OfferAssistHttpDependencies = {},
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
  let result: OfferAssist;
  try {
    result = await (provider ?? new AnthropicMessagesProvider(key!)).assist(question);
  } catch (error) {
    logOfferAssistDiagnostic(diagnosticFor(error, 'http-revalidation'));
    return responseJson(scriptedOfferAssist(question, 'provider-error'));
  }

  let checked: CheckedOfferAssist;
  try {
    // Providers are never trusted with candidate-visible text or provenance.
    // Recreate both from the checked contract at the HTTP boundary.
    const revalidated = (dependencies.revalidate ?? checkOfferAssist)(question, result);
    if (!revalidated) throw new Error('provider result failed checks');
    checked = revalidated;
  } catch (error) {
    logOfferAssistDiagnostic(diagnosticFor(error, 'http-revalidation'));
    return responseJson(scriptedOfferAssist(question, 'provider-error'));
  }

  let candidateResponse: OfferAssist;
  try {
    candidateResponse = (dependencies.buildCandidateResponse ?? buildCandidateResponse)(
      checked,
    );
  } catch (error) {
    logOfferAssistDiagnostic(diagnosticFor(error, 'http-response-build'));
    return responseJson(scriptedOfferAssist(question, 'provider-error'));
  }

  try {
    return (dependencies.serializeCandidateResponse ?? responseJson)(candidateResponse);
  } catch (error) {
    logOfferAssistDiagnostic(diagnosticFor(error, 'http-response-serialization'));
    return responseJson(scriptedOfferAssist(question, 'provider-error'));
  }
}

// Vercel discovers files in /api and invokes this Web Standard handler in its
// Node.js runtime. Keeping this adapter at the edge of the module means Vite's
// local middleware and production use the exact same guarded implementation.
// Vercel calls `fetch(request, context)`, so only the request is forwarded:
// the runtime context must never be mistaken for an injected provider.
export default { fetch: (request: Request) => handleOfferAssist(request) };
