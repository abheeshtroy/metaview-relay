import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OfferAssist } from '../src/relay/offerAssist';
import {
  handleOfferAssist,
  AnthropicMessagesProvider,
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

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('offer assist server boundary', () => {
  it('returns a provider’s checked output', async () => {
    const provider: OfferAssistProvider = { assist: vi.fn(async () => live) };
    const response = await handleOfferAssist(request(), provider);
    expect(await response.json()).toMatchObject({ mode: 'live', route: 'answer' });
    expect(provider.assist).toHaveBeenCalledWith(question);
  });

  it('uses offline triage when no key is configured', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    const response = await handleOfferAssist(request());
    expect(await response.json()).toMatchObject({ mode: 'replay', status: 'fallback' });
  });

  it('falls back when the provider fails', async () => {
    const provider: OfferAssistProvider = {
      assist: vi.fn(async () => {
        throw new Error('timeout');
      }),
    };
    const response = await handleOfferAssist(request(), provider);
    expect(await response.json()).toMatchObject({
      mode: 'replay',
      status: 'provider-error',
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
  });

  it('rejects model output that invents a number, and falls back', async () => {
    modelReturns({ ...live, answer: 'Start on 9 November with a bonus.' });
    const response = await handleOfferAssist(
      request(),
      new AnthropicMessagesProvider('test-key'),
    );
    expect(await response.json()).toMatchObject({
      mode: 'replay',
      status: 'provider-error',
    });
  });

  it('falls back after an Anthropic provider failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('unavailable', { status: 503 })),
    );
    const response = await handleOfferAssist(
      request(),
      new AnthropicMessagesProvider('test-key'),
    );
    expect(await response.json()).toMatchObject({
      mode: 'replay',
      status: 'provider-error',
      answer: live.answer,
    });
  });

  it.each([
    ['malformed output', 'not JSON'],
    ['empty output', undefined],
  ])('falls back after %s from Anthropic', async (_name, output) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ content: [{ type: 'text', text: output }] })),
      ),
    );
    const response = await handleOfferAssist(
      request(),
      new AnthropicMessagesProvider('test-key'),
    );
    expect(await response.json()).toMatchObject({
      mode: 'replay',
      status: 'provider-error',
      answer: live.answer,
    });
  });

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
  });

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
