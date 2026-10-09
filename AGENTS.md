# Metaview Relay

## Product thesis

Metaview Relay is an independent concept prototype for a candidate relationship layer inspired by Metaview's public recruiting product direction.

The product explores how a recruiting platform could support a candidate across application, interviews, offer or rejection, and future opportunities—not only evaluate candidates.

## Canonical demo

- Candidate: Jeremy Clarkson, a fictional technical candidate unrelated to the public figure.
- Role: Staff Software Engineer, AI Infrastructure.
- Use only synthetic data. Do not use a real person's image, biography, profile, or personal information.

## Product areas

The planned experience combines:

- Candidate Concierge: process guidance, preferences, updates, corrections, and human escalation.
- Metaview Potential: transferable skills, candidate context, evidence, uncertainty, and unanswered questions.
- Metaview Close: approved offer-stage questions, concerns, updates, and human escalation.
- Metaview Reconnect: respectful rejection, consent, future interests, and future-role re-engagement.

## Non-goals

Do not turn this project into:

- an evaluation harness;
- a comparison dashboard;
- an ATS;
- an automatic hiring decision-maker;
- a generic chatbot;
- a claim that Metaview currently lacks a capability;
- a system using real candidate data;
- a production replacement for Metaview.

Initially do not add authentication, billing, voice, external ATS integrations, or unnecessary infrastructure.

## Product rules

- Candidates are participants, not merely records.
- Candidate-provided information must be distinguishable from AI observations.
- Uncertainty must be visible.
- Human judgment must remain active.
- Sensitive or consequential actions require human approval.
- The product should remove recruiter work, not create configuration work.
- The interface may be inspired by Metaview's public visual language, but must clearly identify this as an independent concept prototype and must not copy proprietary assets.

## Engineering rules

- Prefer typed domain models and small, understandable modules.
- Keep demo behavior deterministic and reproducible.
- Add focused tests for meaningful domain behavior.
- Use synthetic fixtures instead of real candidate information.
- Implement in small, reviewable milestones.
- Avoid large planning documents and speculative abstractions.
- Run formatting, type checking, tests, production build, and a local render check before reporting a milestone complete.
- Do not commit, push, deploy, or add external services unless explicitly requested by the user.

## Working protocol

1. Read this file before making changes.
2. State the current milestone and the files that will change.
3. Preserve the product thesis, candidate, role, and non-goals.
4. Do not silently expand scope.
5. At the end, report changed files, checks run, decisions, limitations, and exact next work.
