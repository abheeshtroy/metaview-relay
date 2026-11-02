import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OfferAssist } from '../src/relay/offerAssist';
import offerAssistFunction, {
  handleOfferAssist,
  AnthropicMessagesProvider,
  type OfferAssistHttpDependencies,
  type OfferAssistProvider,
} from './offer-assist';

const question = 'When can I start?';
const live: OfferAssist = {
  concerns: ['start-date'],
  route: 'answer',
  answer:
    'Any Monday from 2 November to 30 November 2026 works. Tell James which one suits you.',
  factsUsed: ['startWindow'],
  reason: 'From the start date in the offer.',
  mode: 'live',
  status: 'success',
};
const request = (body: unknown = { question }) =>
  new Request('http://test/api/offer-assist', {
    method: 'POST',
    body: JSON.stringify(body),
  });
const modelReturns = (output: unknown) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            content: [{ type: 'text', text: JSON.stringify(output) }],
          }),
        ),
    ),
  );
const captureDiagnostics = () =>
  vi.spyOn(console, 'error').mockImplementation(() => undefined);

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('offer assist server boundary', () => {
  it('reaches the live path through the production handler with a real Anthropic response', async () => {
    // Vercel invokes `fetch(request, context)`; the context must not be
    // mistaken for an injected provider.
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    const upstream = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            id: 'msg_test',
            type: 'message',
            role: 'assistant',
            model: 'claude-haiku-4-5-20251001',
            content: [{ type: 'text', text: JSON.stringify(live) }],
            stop_reason: 'end_turn',
            stop_sequence: null,
            usage: { input_tokens: 512, output_tokens: 96 },
          }),
          { headers: { 'content-type': 'application/json' } },
        ),
    );
    vi.stubGlobal('fetch', upstream);
    const diagnostic = captureDiagnostics();
    const response = await offerAssistFunction.fetch(request(), {
      waitUntil: () => undefined,
    });
    expect(await response.json()).toMatchObject({
      mode: 'live',
      status: 'success',
      route: 'answer',
      answer: live.answer,
    });
    expect(upstream).toHaveBeenCalledOnce();
    expect(diagnostic).not.toHaveBeenCalled();
  });

  // Real Anthropic responses commonly wrap the requested JSON object in a
  // Markdown code fence. Bare-JSON mocks hid the production SyntaxError.
  const anthropicMessage = (text: string) =>
    new Response(
      JSON.stringify({
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        model: 'claude-haiku-4-5-20251001',
        content: [{ type: 'text', text }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 512, output_tokens: 96 },
      }),
      { headers: { 'content-type': 'application/json' } },
    );
  const { mode: _liveMode, status: _liveStatus, ...modelOutput } = live;

  it('reaches live success when Anthropic fences its JSON answer', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        anthropicMessage('```json\n' + JSON.stringify(modelOutput, null, 2) + '\n```'),
      ),
    );
    const diagnostic = captureDiagnostics();
    const response = await offerAssistFunction.fetch(request());
    expect(await response.json()).toMatchObject({
      mode: 'live',
      status: 'success',
      route: 'answer',
      answer: live.answer,
      factsUsed: ['startWindow'],
    });
    expect(diagnostic).not.toHaveBeenCalled();
  });

  it.each([
    ['prose around a fence', 'Here you go:\n```json\n{}\n```'],
    ['an unclosed fence', '```json\n{"route": "answer"}'],
    ['malformed JSON inside a fence', '```json\n{not json}\n```'],
    ['plain prose', 'Any Monday in November works.'],
  ])('still falls back safely on %s', async (_name, text) => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => anthropicMessage(text)),
    );
    const diagnostic = captureDiagnostics();
    const response = await offerAssistFunction.fetch(request());
    expect(await response.json()).toMatchObject({
      mode: 'replay',
      status: 'provider-error',
      answer: live.answer,
    });
    expect(diagnostic).toHaveBeenCalledWith({
      event: 'offer-assist-fallback',
      category: 'json-parsing-failure',
      errorName: 'SyntaxError',
    });
  });

  it('still rejects a fenced answer that fails Relay validation', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        anthropicMessage(
          '```json\n' +
            JSON.stringify({ ...modelOutput, answer: 'Start whenever, with a bonus.' }) +
            '\n```',
        ),
      ),
    );
    const diagnostic = captureDiagnostics();
    const response = await offerAssistFunction.fetch(request());
    expect(await response.json()).toMatchObject({
      mode: 'replay',
      status: 'provider-error',
    });
    expect(diagnostic).toHaveBeenCalledWith({
      event: 'offer-assist-fallback',
      category: 'validation-rejection',
    });
  });

  it('returns a provider’s checked output', async () => {
    const provider: OfferAssistProvider = { assist: vi.fn(async () => live) };
    const response = await handleOfferAssist(request(), provider);
    expect(await response.json()).toMatchObject({ mode: 'live', route: 'answer' });
    expect(provider.assist).toHaveBeenCalledWith(question);
  });

  it('uses offline triage when no key is configured', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    const diagnostic = captureDiagnostics();
    const response = await handleOfferAssist(request());
    expect(await response.json()).toMatchObject({ mode: 'replay', status: 'fallback' });
    expect(diagnostic).toHaveBeenCalledWith({
      event: 'offer-assist-fallback',
      category: 'missing-key',
    });
  });

  it('classifies an unexpected provider runtime failure', async () => {
    const provider: OfferAssistProvider = {
      assist: vi.fn(async () => {
        throw new Error('timeout');
      }),
    };
    const diagnostic = captureDiagnostics();
    const response = await handleOfferAssist(request(), provider);
    expect(await response.json()).toMatchObject({
      mode: 'replay',
      status: 'provider-error',
    });
    expect(diagnostic).toHaveBeenCalledWith({
      event: 'offer-assist-fallback',
      category: 'unexpected-runtime-error',
      errorName: 'Error',
      stage: 'http-revalidation',
    });
  });

  it.each([
    ['timeout', new Error('timeout')],
    ['quota failure', new Error('provider status 429')],
  ])('uses deterministic offline triage after a %s', async (_name, error) => {
    const provider: OfferAssistProvider = {
      assist: vi.fn(async () => Promise.reject(error)),
    };
    const response = await handleOfferAssist(request(), provider);
    expect(await response.json()).toMatchObject({
      mode: 'replay',
      status: 'provider-error',
      route: 'answer',
      answer: live.answer,
    });
  });

  it('parses a successful Anthropic Messages response and labels it live', async () => {
    const { mode: _m, status: _s, ...output } = live;
    modelReturns(output);
    const response = await handleOfferAssist(
      request(),
      new AnthropicMessagesProvider('test-key'),
    );
    expect(await response.json()).toMatchObject({ mode: 'live', status: 'success' });
    expect(fetch).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-api-key': 'test-key',
          'anthropic-version': '2023-06-01',
        }),
      }),
    );
    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(JSON.parse(init!.body as string)).toMatchObject({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system: expect.any(String),
      messages: [{ role: 'user', content: expect.any(String) }],
    });
  });

  it('logs Relay validation rejection without candidate data, and falls back', async () => {
    modelReturns({ ...live, answer: 'Start on 9 November with a bonus.' });
    const diagnostic = captureDiagnostics();
    const response = await handleOfferAssist(
      request(),
      new AnthropicMessagesProvider('test-key'),
    );
    expect(await response.json()).toMatchObject({
      mode: 'replay',
      status: 'provider-error',
    });
    expect(diagnostic).toHaveBeenCalledWith({
      event: 'offer-assist-fallback',
      category: 'validation-rejection',
    });
  });

  it('logs Anthropic HTTP status without response data, and falls back', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('unavailable', { status: 503 })),
    );
    const diagnostic = captureDiagnostics();
    const response = await handleOfferAssist(
      request(),
      new AnthropicMessagesProvider('test-key'),
    );
    expect(await response.json()).toMatchObject({
      mode: 'replay',
      status: 'provider-error',
      answer: live.answer,
    });
    expect(diagnostic).toHaveBeenCalledWith({
      event: 'offer-assist-fallback',
      category: 'provider-http',
      providerStatus: 503,
    });
  });

  it('classifies a network fetch failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('offline'))),
    );
    const diagnostic = captureDiagnostics();
    const response = await handleOfferAssist(
      request(),
      new AnthropicMessagesProvider('test-key'),
    );
    expect(await response.json()).toMatchObject({
      mode: 'replay',
      status: 'provider-error',
    });
    expect(diagnostic).toHaveBeenCalledWith({
      event: 'offer-assist-fallback',
      category: 'network-fetch-failure',
      errorName: 'TypeError',
    });
  });

  it('classifies invalid JSON from the Anthropic HTTP response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{not json')),
    );
    const diagnostic = captureDiagnostics();
    const response = await handleOfferAssist(
      request(),
      new AnthropicMessagesProvider('test-key'),
    );
    expect(await response.json()).toMatchObject({
      mode: 'replay',
      status: 'provider-error',
      answer: live.answer,
    });
    expect(diagnostic).toHaveBeenCalledWith({
      event: 'offer-assist-fallback',
      category: 'json-parsing-failure',
      errorName: 'SyntaxError',
    });
  });

  it.each([
    [
      'request-build',
      new AnthropicMessagesProvider('test-key', undefined, undefined, {
        buildRequest: () => {
          throw new TypeError('private build failure');
        },
      }),
    ],
    [
      'response-json',
      new AnthropicMessagesProvider('test-key', undefined, undefined, {
        fetch: vi.fn(async () => ({
          ok: true,
          json: () => Promise.reject(new TypeError()),
        })),
      }),
    ],
    [
      'response-shape',
      new AnthropicMessagesProvider('test-key', undefined, undefined, {
        fetch: vi.fn(async () => ({
          ok: true,
          json: async () => ({
            content: new Proxy([], {
              get: () => {
                throw new TypeError();
              },
            }),
          }),
        })),
      }),
    ],
    [
      'model-text-json',
      new AnthropicMessagesProvider('test-key', undefined, undefined, {
        fetch: vi.fn(async () => ({
          ok: true,
          json: async () => ({ content: [{ type: 'text', text: '{}' }] }),
        })),
        parseModelText: () => {
          throw new TypeError();
        },
      }),
    ],
    [
      'relay-validation',
      new AnthropicMessagesProvider('test-key', undefined, undefined, {
        fetch: vi.fn(async () => ({
          ok: true,
          json: async () => ({ content: [{ type: 'text', text: '{}' }] }),
        })),
        validate: () => {
          throw new TypeError();
        },
      }),
    ],
  ] as const)(
    'adds the fixed stage for a TypeError during %s',
    async (stage, provider) => {
      const diagnostic = captureDiagnostics();
      const response = await handleOfferAssist(request(), provider);
      expect(await response.json()).toMatchObject({
        mode: 'replay',
        status: 'provider-error',
      });
      expect(diagnostic).toHaveBeenCalledWith({
        event: 'offer-assist-fallback',
        category: 'unexpected-runtime-error',
        errorName: 'TypeError',
        stage,
      });
    },
  );

  it('classifies invalid JSON inside Anthropic text output', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ content: [{ type: 'text', text: 'not JSON' }] })),
      ),
    );
    const diagnostic = captureDiagnostics();
    await handleOfferAssist(request(), new AnthropicMessagesProvider('test-key'));
    expect(diagnostic).toHaveBeenCalledWith({
      event: 'offer-assist-fallback',
      category: 'json-parsing-failure',
      errorName: 'SyntaxError',
    });
  });

  it.each([null, { content: {} }, { content: [null] }])(
    'classifies an unexpected Anthropic response shape',
    async (payload) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response(JSON.stringify(payload))),
      );
      const diagnostic = captureDiagnostics();
      await handleOfferAssist(request(), new AnthropicMessagesProvider('test-key'));
      expect(diagnostic).toHaveBeenCalledWith({
        event: 'offer-assist-fallback',
        category: 'response-shape-failure',
      });
    },
  );

  it('falls back when the Anthropic request times out', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url, init: RequestInit) =>
          new Promise<Response>((_resolve, reject) =>
            init.signal?.addEventListener('abort', () => reject(new Error('aborted'))),
          ),
      ),
    );
    const diagnostic = captureDiagnostics();
    const responsePromise = handleOfferAssist(
      request(),
      new AnthropicMessagesProvider('test-key', undefined, 1),
    );
    await vi.advanceTimersByTimeAsync(1);
    const response = await responsePromise;
    vi.useRealTimers();
    expect(await response.json()).toMatchObject({
      mode: 'replay',
      status: 'provider-error',
      answer: live.answer,
    });
    expect(diagnostic).toHaveBeenCalledWith({
      event: 'offer-assist-fallback',
      category: 'abort-timeout',
      errorName: 'AbortError',
    });
  });

  it('never includes secrets or the question in fallback diagnostics', async () => {
    const privateQuestion = 'private candidate question that must not be logged';
    const privateResponse = 'private provider response that must not be logged';
    const diagnostic = captureDiagnostics();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(privateResponse, { status: 401 })),
    );
    await handleOfferAssist(
      request({ question: privateQuestion }),
      new AnthropicMessagesProvider('test-key-that-must-not-be-logged'),
    );
    const logged = JSON.stringify(diagnostic.mock.calls);
    expect(logged).not.toContain(privateQuestion);
    expect(logged).not.toContain('test-key-that-must-not-be-logged');
    expect(logged).not.toContain(privateResponse);
    expect(logged).not.toContain('x-api-key');
  });

  it('never includes an unexpected error message in fallback diagnostics', async () => {
    const diagnostic = captureDiagnostics();
    const privateFailure = 'private exception detail that must not be logged';
    await handleOfferAssist(request(), {
      assist: vi.fn(async () => {
        throw new TypeError(privateFailure);
      }),
    });
    const logged = JSON.stringify(diagnostic.mock.calls);
    expect(logged).not.toContain(privateFailure);
    expect(logged).toContain('http-revalidation');
  });

  it.each([
    [
      'http-revalidation',
      {
        revalidate: () => {
          throw new TypeError('private revalidation failure');
        },
      },
    ],
    [
      'http-response-build',
      {
        buildCandidateResponse: () => {
          throw new TypeError('private response build failure');
        },
      },
    ],
    [
      'http-response-serialization',
      {
        serializeCandidateResponse: () => {
          throw new TypeError('private serialization failure');
        },
      },
    ],
  ] as const)(
    'adds the fixed HTTP stage for a TypeError during %s without logging private details',
    async (stage, dependencies: OfferAssistHttpDependencies) => {
      const diagnostic = captureDiagnostics();
      const response = await handleOfferAssist(
        request(),
        { assist: vi.fn(async () => live) },
        dependencies,
      );
      expect(await response.json()).toMatchObject({
        mode: 'replay',
        status: 'provider-error',
      });
      expect(diagnostic).toHaveBeenCalledWith({
        event: 'offer-assist-fallback',
        category: 'unexpected-runtime-error',
        errorName: 'TypeError',
        stage,
      });
      expect(JSON.stringify(diagnostic.mock.calls)).not.toContain('private');
    },
  );

  it.each([
    [
      'sensitive question',
      'What is the base salary?',
      { ...live, concerns: ['compensation'] },
    ],
    ['unsupported question', 'Can I bring my dog to work?', live],
  ])('falls back when Anthropic tries to answer a %s', async (_name, ask, output) => {
    modelReturns(output);
    const response = await handleOfferAssist(
      request({ question: ask }),
      new AnthropicMessagesProvider('test-key'),
    );
    expect(await response.json()).toMatchObject({
      mode: 'replay',
      status: 'provider-error',
      route: 'james',
    });
  });

  it('does not trust an injected provider result that bypasses the model validator', async () => {
    const provider: OfferAssistProvider = {
      assist: vi.fn(async () => ({ ...live, answer: 'Start whenever you like.' })),
    };
    const response = await handleOfferAssist(request(), provider);
    expect(await response.json()).toMatchObject({
      mode: 'replay',
      status: 'provider-error',
      answer: live.answer,
    });
  });

  it('validates the request', async () => {
    expect((await handleOfferAssist(request({ question: '' }))).status).toBe(400);
    expect(
      (await handleOfferAssist(new Request('http://test', { method: 'GET' }))).status,
    ).toBe(405);
  });
});
