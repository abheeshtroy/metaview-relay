import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OfferAssist } from '../src/relay/offerAssist';
import {
  handleOfferAssist,
  OpenAIResponsesProvider,
  type OfferAssistProvider,
} from './offer-assist';

const question = 'When can I start?';
const live: OfferAssist = {
  concerns: ['start-date'],
  route: 'answer',
  answer: 'Any Monday from 2 November to 30 November 2026 works.',
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
      async () => new Response(JSON.stringify({ output_text: JSON.stringify(output) })),
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
    vi.stubEnv('OPENAI_API_KEY', '');
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

  it('parses Responses output and labels it live', async () => {
    const { mode: _m, status: _s, ...output } = live;
    modelReturns(output);
    const response = await handleOfferAssist(
      request(),
      new OpenAIResponsesProvider('test-key'),
    );
    expect(await response.json()).toMatchObject({ mode: 'live', status: 'success' });
  });

  it('rejects model output that invents a number, and falls back', async () => {
    modelReturns({ ...live, answer: 'Start on 9 November with a bonus.' });
    const response = await handleOfferAssist(
      request(),
      new OpenAIResponsesProvider('test-key'),
    );
    expect(await response.json()).toMatchObject({
      mode: 'replay',
      status: 'provider-error',
    });
  });

  it('validates the request', async () => {
    expect((await handleOfferAssist(request({ question: '' }))).status).toBe(400);
    expect(
      (await handleOfferAssist(new Request('http://test', { method: 'GET' }))).status,
    ).toBe(405);
  });
});
