# Metaview Relay

**[View the public demo](https://metaview-relay.vercel.app)**

Metaview Relay is an independent concept prototype for a candidate relationship
layer, inspired by Metaview's public recruiting product direction. It is not a
Metaview product or a production recruiting system.

The canonical demo follows Jeremy Clarkson, a fictional candidate, as he moves
toward a **Staff Software Engineer, AI Infrastructure** role. All people,
company details, facts, and conversations in the prototype are synthetic.

## What the prototype demonstrates

Relay follows one bounded journey:

1. **Apply and context.** Jeremy can add context that a résumé does not make
   obvious. Relay connects explicit evidence to role needs, makes uncertainty
   visible, and identifies the one question that still needs clarification.
2. **Interview.** James, the recruiter, reviews and approves a focused
   question. Jeremy receives candidate-safe preparation context, answers it,
   and James makes the next judgment: accept the answer, ask one follow-up, or
   leave it unresolved.
3. **Offer / Close.** Jeremy chooses or writes an offer question. Routine
   questions grounded in approved offer facts can receive an immediate,
   labelled answer. Compensation, equity, immigration, relocation, benefits,
   unclear questions, and other consequential topics always go to James for a
   human-approved response.

This is deliberately not an ATS, an automatic hiring decision-maker, an
evaluation harness, or a generic chatbot. **Reconnect**—respectful rejection,
consent, future interests, and future-role re-engagement—is future work and is
not implemented in this prototype.

## Candidate and recruiter interaction model

The experience is a turn-based, shared record rather than a hidden recruiter
workflow. Jeremy supplies his own context, chooses interview times, receives
process updates, asks offer questions, and can request a human conversation.
James retains the decisions that matter: reviewing ambiguous evidence,
approving the interview question, deciding the interview outcome, and
approving any sensitive or consequential offer response before Jeremy sees it.

Candidate-provided words remain distinguishable from Relay's observations.
Relay identifies evidence and uncertainty, but it does not silently convert a
candidate's own words into an evaluation or make a hiring decision.

## Reducing routine recruiter work

Relay turns the repeatable coordination around a candidate journey into a
small, deterministic flow: it surfaces relevant résumé context, tracks what is
known versus unanswered, prepares a focused interview trail, and answers only
the narrow set of routine offer questions covered by approved facts. This
reduces chasing, copying context between steps, and responding to routine
questions—while keeping recruiters active wherever judgment or approval is
needed.

## Offer Assist: server-side boundary

Offer Assist is an optional, guarded server-side helper for an offer question
written in Jeremy's own words. The browser sends a question to
`POST /api/offer-assist`; the server may call the Anthropic Messages API and
validates its result before anything is returned to the browser. The result is
checked again by Relay's state model.

The guard only permits exact approved answers for complete routine questions
about start date, work model, role scope, or response timeline. It preserves
combined-question context and routes every sensitive, unsupported, uncertain,
or invalid response to James. A model proposal never replaces James's approval
authority.

### Configure live AI safely

Live provider attempts are optional. Copy `.env.example` to `.env.local` for
local development and set the secret there:

```sh
ANTHROPIC_API_KEY=your_server_side_key
# Optional; defaults to claude-haiku-4-5-20251001
ANTHROPIC_MODEL=claude-haiku-4-5-20251001
```

Never commit `.env.local`, put the key in client code, or use a `VITE_`-prefixed
environment variable such as `VITE_ANTHROPIC_API_KEY`: Vite makes `VITE_`
variables available to the browser. For Vercel, configure `ANTHROPIC_API_KEY` in
**Project Settings → Environment Variables** for the environments that need
live attempts. See [DEPLOYMENT.md](DEPLOYMENT.md) for deployment details.

When a valid key and provider are available, a verified response is labelled as
a live assist. When no key is configured, the provider times out or fails, or
its output does not pass Relay's checks, the app uses a deterministic offline
replay/fallback instead. That fallback is explicitly labelled; it is not
presented as a live AI result.

## Run locally

```sh
npm install
npm run dev
```

The application works without an API key using its deterministic offline
fallback. `npm run build` produces the Vite client bundle; `api/offer-assist.ts`
is the Vercel serverless endpoint for production.

## Development checks

```sh
npx prettier --check .
npm run typecheck
npm test
npm run build
git diff --check
```

## Disclaimer

This independent concept prototype is inspired by Metaview's public product
direction. It does not represent Metaview's current product, capabilities, or
roadmap. It uses only fictional, synthetic demo data; it must not be read as a
claim about any real candidate or person.
