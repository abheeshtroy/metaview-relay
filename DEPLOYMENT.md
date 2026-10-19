# Deploying Metaview Relay to Vercel

Relay deploys as a Vite single-page application with one Vercel Node.js Function:
`api/offer-assist.ts` is served at `POST /api/offer-assist`. The function uses
the same guarded `handleOfferAssist` implementation as the local Vite middleware.

## Environment variables

Set these in **Vercel Project Settings → Environment Variables** for every
environment where you want live provider attempts:

| Variable         | Required | Purpose                                                                                                   |
| ---------------- | -------- | --------------------------------------------------------------------------------------------------------- |
| `OPENAI_API_KEY` | No       | Server-only Responses API credential. If absent, Offer Assist returns its deterministic offline fallback. |
| `OPENAI_MODEL`   | No       | Optional Responses model override. Defaults to `gpt-4.1-mini`.                                            |

Do not create variables named `VITE_OPENAI_API_KEY` or otherwise add this
credential to a `VITE_`-prefixed variable. Vite exposes only `VITE_` variables
to the client bundle; this project reads `OPENAI_API_KEY` only inside the server
function and local Vite middleware.

## Deployment steps

1. Import the repository into Vercel (the Vite framework and `npm run build`
   are detected from the project files).
2. Add `OPENAI_API_KEY` only if live provider attempts are desired. Add it to
   Preview and Production separately when those environments need it.
3. Deploy. Vercel discovers the default web handler in `api/offer-assist.ts`
   and maps it to `/api/offer-assist`; static client assets are emitted to
   `dist/`.
4. Exercise an Offer Assist question in the deployed app. A response labelled
   as a replay/fallback remains expected when the key is absent or the provider
   is unavailable.

The deployment boundary validates provider output before it becomes
candidate-visible and falls back deterministically for missing credentials,
provider failures, malformed output, or invalid output. This repository’s tests
mock provider responses; they do not verify a live OpenAI provider response.

## Local development

Copy `.env.example` to `.env.local` only when testing a local provider attempt,
then run `npm run dev`. Vite routes `/api/offer-assist` to the same server-side
handler used by Vercel. Do not commit `.env.local`.
