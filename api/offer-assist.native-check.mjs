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
  const oldKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = '';
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
  } finally {
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = oldKey;
  }
} finally {
  await rm(output, { recursive: true, force: true });
}
