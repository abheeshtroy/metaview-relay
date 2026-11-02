import { strict as assert } from 'node:assert';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const output = await mkdtemp(join(tmpdir(), 'metaview-relay-offer-assist-'));

try {
  // Compile and load the route with Node itself, not Vite's transform pipeline.
  execFileSync(
    'npx',
    ['tsc', '-p', 'tsconfig.production-test.json', '--outDir', output],
    {
      stdio: 'inherit',
    },
  );
  await writeFile(join(output, 'package.json'), '{"type":"module"}\n');
  const { default: offerAssistFunction } = await import(
    pathToFileURL(join(output, 'api/offer-assist.js')).href
  );
  const oldKey = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = '';
  try {
    const get = await offerAssistFunction.fetch(
      new Request('https://relay.example/api/offer-assist'),
    );
    assert.equal(get.status, 405);
    const post = await offerAssistFunction.fetch(
      new Request('https://relay.example/api/offer-assist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: 'When can I start?' }),
      }),
    );
    assert.equal(post.status, 200);
    assert.deepEqual(await post.json(), {
      concerns: ['start-date'],
      route: 'answer',
      answer:
        'Any Monday from 2 November to 30 November 2026 works. Tell James which one suits you.',
      factsUsed: ['startWindow'],
      reason: 'Answered from the approved offer: start date.',
      mode: 'replay',
      status: 'fallback',
    });

    // Live path with a mocked Anthropic Messages response. Anthropic only
    // classifies; Relay writes the approved answer, whether the model omits
    // answer text or paraphrases it.
    const firstYear =
      'In the first year you’d lead GPU scheduling for the shared inference platform and mentor two engineers. The first six weeks are a ramp, paired with the inference platform lead.';
    const realFetch = globalThis.fetch;
    process.env.ANTHROPIC_API_KEY = 'native-check-key';
    try {
      for (const extra of [
        {},
        { answer: "In the first year you'd lead GPU scheduling and mentor engineers." },
      ]) {
        let sentBody;
        globalThis.fetch = async (_url, init) => {
          sentBody = JSON.parse(init.body);
          return new Response(
            JSON.stringify({
              id: 'msg_native_check',
              type: 'message',
              role: 'assistant',
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    concerns: ['role-scope'],
                    route: 'answer',
                    factsUsed: ['firstYear', 'onboarding'],
                    ...extra,
                  }),
                },
              ],
              stop_reason: 'end_turn',
            }),
            { headers: { 'content-type': 'application/json' } },
          );
        };
        const live = await offerAssistFunction.fetch(
          new Request('https://relay.example/api/offer-assist', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              question: 'What is the first-year scope of this role?',
            }),
          }),
          { waitUntil: () => undefined },
        );
        assert.equal(live.status, 200);
        assert.deepEqual(await live.json(), {
          concerns: ['role-scope'],
          route: 'answer',
          answer: firstYear,
          factsUsed: ['firstYear', 'onboarding'],
          reason: 'Answered from the approved offer: first year, onboarding.',
          mode: 'live',
          status: 'success',
        });
        assert.equal(sentBody.output_config.format.type, 'json_schema');
        assert.deepEqual(sentBody.output_config.format.schema.required, [
          'concerns',
          'route',
          'factsUsed',
        ]);
      }
    } finally {
      globalThis.fetch = realFetch;
    }
  } finally {
    if (oldKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = oldKey;
  }
} finally {
  await rm(output, { recursive: true, force: true });
}
