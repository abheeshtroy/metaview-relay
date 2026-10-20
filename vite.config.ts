import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { handleOfferAssist } from './api/offer-assist';

export default defineConfig(({ mode }) => {
  // Server-only secrets from .env.local reach the dev API, never the client bundle.
  const env = loadEnv(mode, process.cwd(), 'ANTHROPIC_');
  for (const key of ['ANTHROPIC_API_KEY', 'ANTHROPIC_MODEL'])
    if (env[key] && !process.env[key]) process.env[key] = env[key];

  return {
    plugins: [
      react(),
      {
        name: 'offer-assist-dev-api',
        configureServer(server) {
          server.middlewares.use('/api/offer-assist', async (req, res) => {
            const body: Uint8Array[] = [];
            for await (const chunk of req) body.push(chunk);
            const response = await handleOfferAssist(
              new Request('http://localhost/api/offer-assist', {
                method: req.method,
                headers: req.headers as HeadersInit,
                body: body.length ? Buffer.concat(body) : undefined,
              }),
            );
            res.statusCode = response.status;
            response.headers.forEach((value, key) => res.setHeader(key, value));
            res.end(await response.text());
          });
        },
      },
    ],
    test: {
      environment: 'node',
    },
  };
});
