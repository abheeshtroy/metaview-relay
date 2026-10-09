import { describe, expect, it } from 'vitest';
import type { RelayEvent } from './events';
import {
  clarification,
  claimTemplates,
  openQuestionAtStart,
  people,
  interviewQuestion,
  scriptedInterviewAnswer,
  scriptedNote,
} from './fixtures';
import {
  candidateView,
  initialState,
  lastCrossing,
  recruiterView,
  reduce,
} from './reduce';

const note: RelayEvent = { type: 'context-submitted', text: scriptedNote };
const unrelatedContext =
  'I volunteer as a community robotics mentor and enjoy translating technical ideas for new builders.';
const answer = (i: 0 | 1): RelayEvent => ({
  type: 'clarification-answered',
  answerId: clarification.answers[i].id,
  text: clarification.answers[i].text,
});

describe('fixture', () => {
  it('uses the canonical synthetic candidate, employer and role', () => {
    expect(people.candidate.name).toBe('Jeremy Clarkson');
    expect(people.recruiter.name).toBe('James May');
    expect(people.employer).toBe('AutoFarm');
    expect(people.role).toBe('Staff Software Engineer, AI Infrastructure');
  });

  it('keeps every evidence phrase inside the scripted note', () => {
    for (const t of claimTemplates) {
      expect(scriptedNote.toLowerCase()).toContain(t.evidence.toLowerCase());
    }
  });
});

describe('reduce', () => {
  it('starts with the open question from the application', () => {
    const state = reduce([]);
    expect(state.stage).toBe('invite');
    expect(state.claims).toEqual([]);
    expect(state.openQuestion.status).toBe('from-application');
  });

  it('infers claims only from phrases present in Jeremy’s words and asks one question', () => {
    const state = reduce([note]);
    expect(state.stage).toBe('clarify');
    expect(state.claims.map((c) => c.id)).toEqual(['latency', 'rollout', 'validation']);
    expect(state.claims.every((c) => c.status === 'drafting')).toBe(true);
    expect(state.claims.every((c) => c.confidence === 'unclarified')).toBe(true);
  });

  it('drops a claim when Jeremy edits its evidence out', () => {
    const edited = scriptedNote.replace('staged canaries', 'small batches');
    const state = reduce([{ type: 'context-submitted', text: edited }]);
    expect(state.claims.map((c) => c.id)).toEqual(['latency', 'validation']);
    expect(state.note?.edited).toBe(true);
  });

  it('routes unrelated edited context to James without asking the fixed clarification', () => {
    const state = reduce([{ type: 'context-submitted', text: unrelatedContext }]);
    expect(state.stage).toBe('review');
    expect(state.claims).toEqual([]);
    expect(state.answer).toBeUndefined();
    expect(state.openQuestion).toEqual({
      text: 'Relay did not map this context to a role-specific claim.',
      status: 'unmapped-context',
    });
    expect(state.unmappedContext?.status).toBe('needs-human-reading');
    expect(state.trail.map((entry) => entry.text).join(' ')).not.toContain(
      'asked one clarifying question',
    );
  });

  it('still asks the intended clarification when the target evidence is present', () => {
    const state = reduce([note]);
    expect(state.stage).toBe('clarify');
    expect(state.claims.map((claim) => claim.id)).toContain(clarification.target);
    expect(state.unmappedContext).toBeUndefined();
  });

  it('keeps unrelated context available for James’s human review without changing Jeremy’s words', () => {
    const shared = reduce([{ type: 'context-submitted', text: unrelatedContext }]);
    expect(candidateView(shared).words).toEqual([
      expect.objectContaining({ text: unrelatedContext, edited: true }),
    ]);
    expect(recruiterView(shared).toReview).toBe(1);

    const accepted = reduce([
      { type: 'context-submitted', text: unrelatedContext },
      { type: 'unmapped-context-accepted' },
    ]);
    expect(accepted.unmappedContext?.status).toBe('accepted');
    expect(candidateView(accepted).words[0].text).toBe(unrelatedContext);
  });

  it('answer A clarifies runtime ownership and re-scopes the open question', () => {
    const state = reduce([note, answer(0)]);
    const latency = state.claims.find((c) => c.id === 'latency');
    expect(state.stage).toBe('review');
    expect(latency?.confidence).toBe('clarified');
    expect(state.openQuestion.status).toBe('rescoped');
    expect(state.openQuestion.text).toContain('multi-tenant GPU serving');
    expect(recruiterView(state).toReview).toBe(3);
    expect(lastCrossing(state)?.crossing).toBe('to-james');
  });

  it('answer B narrows the latency claim instead of inflating it', () => {
    const state = reduce([note, answer(1)]);
    const latency = state.claims.find((c) => c.id === 'latency');
    expect(latency?.confidence).toBe('narrowed');
    expect(latency?.skill).toBe('Tooling around latency-bounded inference');
    expect(state.openQuestion.text).toContain('directly');
  });

  it('accepting a claim adds it to the brief and tells Jeremy', () => {
    const state = reduce([
      note,
      answer(0),
      { type: 'claim-accepted', claimId: 'rollout' },
    ]);
    expect(recruiterView(state).brief).toContainEqual({
      kind: 'strength',
      text: 'Staged model rollout to a fleet',
    });
    const item = candidateView(state).understood.find((u) => u.id === 'rollout');
    expect(item?.state).toBe('in-brief');
    expect(lastCrossing(state)?.crossing).toBe('to-jeremy');
  });

  it('a correction becomes a human note and a soft update for Jeremy', () => {
    const state = reduce([
      note,
      answer(0),
      { type: 'claim-corrected', claimId: 'validation', note: 'Closer to QA here.' },
    ]);
    const claim = state.claims.find((c) => c.id === 'validation');
    expect(claim?.humanNote).toBe('Closer to QA here.');
    const item = candidateView(state).understood.find((u) => u.id === 'validation');
    expect(item?.state).toBe('to-discuss');
    expect(item?.message).toContain('Nothing you wrote has changed');
  });

  it('a sent question reaches Jeremy, and his reply returns the claim to review', () => {
    const asked = reduce([
      note,
      answer(0),
      { type: 'clarification-sent', claimId: 'latency', question: 'Tell me more?' },
    ]);
    expect(candidateView(asked).questions).toEqual([
      { claimId: 'latency', question: 'Tell me more?' },
    ]);

    const replied = reduce([
      note,
      answer(0),
      { type: 'clarification-sent', claimId: 'latency', question: 'Tell me more?' },
      {
        type: 'followup-answered',
        claimId: 'latency',
        text: 'Here is more.',
      },
    ]);
    const claim = replied.claims.find((c) => c.id === 'latency');
    expect(claim?.status).toBe('needs-review');
    expect(claim?.followUp?.text).toBe('Here is more.');
    expect(candidateView(replied).questions).toEqual([]);
  });

  it('never lets a recruiter action change Jeremy’s words', () => {
    const recruiterEvents: RelayEvent[] = [
      { type: 'claim-corrected', claimId: 'latency', note: 'Different scale.' },
      { type: 'claim-accepted', claimId: 'rollout' },
      { type: 'clarification-sent', claimId: 'validation', question: 'How?' },
    ];
    const before = candidateView(reduce([note, answer(1)])).words;
    const after = candidateView(reduce([note, answer(1), ...recruiterEvents])).words;
    expect(after).toEqual(before);
    expect(after[0].text).toBe(scriptedNote);
  });

  it('ignores out-of-order and repeated events', () => {
    const state = reduce([
      { type: 'claim-accepted', claimId: 'latency' },
      answer(0),
      note,
      note,
      answer(0),
      { type: 'claim-accepted', claimId: 'latency' },
      { type: 'claim-corrected', claimId: 'latency', note: 'Too late.' },
    ]);
    expect(state.claims.find((c) => c.id === 'latency')?.status).toBe('accepted');
    expect(state.trail).toHaveLength(5);
  });

  it('is deterministic', () => {
    const events = [
      note,
      answer(1),
      { type: 'claim-accepted', claimId: 'latency' } as const,
    ];
    expect(reduce(events)).toEqual(reduce(events));
  });
});

describe('edited clarification answers', () => {
  const ownWords =
    'Bit of both, honestly. I owned the runtime for the first year, then handed it to the platform team and moved to release tooling.';
  const custom = (i: 0 | 1, text = ownWords): RelayEvent => ({
    type: 'clarification-answered',
    answerId: clarification.answers[i].id,
    text,
  });
  const target = (events: RelayEvent[]) =>
    reduce(events).claims.find((c) => c.id === clarification.target);

  it('preserves the exact edited text and marks it custom', () => {
    const state = reduce([note, custom(0)]);
    expect(state.answer?.text).toBe(ownWords);
    expect(state.answer?.custom).toBe(true);
    expect(state.answer?.basedOn).toBe('owned-runtime');
  });

  it('does not let the starting A/B choice decide anything', () => {
    for (const i of [0, 1] as const) {
      const state = reduce([note, custom(i)]);
      const latency = state.claims.find((c) => c.id === 'latency');
      expect(latency?.confidence).toBe('uninterpreted');
      expect(latency?.skill).toBe('Inference under hard latency budgets');
      expect(
        state.claims.filter((c) => c.id !== 'latency').map((c) => c.confidence),
      ).toEqual(['unclarified', 'unclarified']);
      expect(state.openQuestion).toEqual({
        text: openQuestionAtStart,
        status: 'needs-human-reading',
      });
      expect(JSON.stringify(state.signals)).not.toMatch(/says he (operated|built)/);
      expect(state.claims.every((c) => c.status === 'needs-review')).toBe(true);
    }
  });

  it('treats an unchanged scripted answer as scripted, even after opening the editor', () => {
    const state = reduce([note, custom(0, `  ${clarification.answers[0].text}  `)]);
    expect(state.answer?.custom).toBe(false);
    expect(state.claims.find((c) => c.id === 'latency')?.confidence).toBe('clarified');
  });

  it('blocks accepting or correcting it as if Relay had read it', () => {
    const latency = target([
      note,
      custom(0),
      { type: 'claim-accepted', claimId: 'latency' },
      { type: 'claim-corrected', claimId: 'latency', note: 'x' },
    ]);
    expect(latency?.status).toBe('needs-review');
    expect(latency?.confidence).toBe('uninterpreted');
  });

  it('lets James accept the answer as written', () => {
    const state = reduce([
      note,
      custom(1),
      { type: 'custom-answer-accepted', claimId: 'latency' },
    ]);
    const latency = state.claims.find((c) => c.id === 'latency');
    expect(latency?.status).toBe('accepted');
    expect(latency?.confidence).toBe('accepted-as-written');
    expect(state.openQuestion.status).toBe('resolved-by-james');
    expect(recruiterView(state).brief).toContainEqual({
      kind: 'strength',
      text: 'Inference under hard latency budgets (on Jeremy’s own account)',
    });
    expect(candidateView(state).understood[0].state).toBe('accepted-as-written');
  });

  it('only accepts own-words answers through the dedicated event', () => {
    const state = reduce([
      note,
      answer(0),
      { type: 'custom-answer-accepted', claimId: 'latency' },
    ]);
    expect(state.claims.find((c) => c.id === 'latency')?.status).toBe('needs-review');
  });

  it('lets James leave it unresolved, then come back to it', () => {
    const left = reduce([
      note,
      custom(0),
      { type: 'claim-left-unresolved', claimId: 'latency' },
    ]);
    expect(left.claims.find((c) => c.id === 'latency')?.status).toBe('unresolved');
    expect(left.openQuestion.status).toBe('unresolved');
    expect(recruiterView(left).toReview).toBe(2);
    expect(recruiterView(left).brief).toContainEqual({
      kind: 'open',
      text: openQuestionAtStart,
    });
    const message = candidateView(left).understood[0];
    expect(message.state).toBe('unresolved');
    expect(message.message).toContain('Nothing has been decided');

    const later = target([
      note,
      custom(0),
      { type: 'claim-left-unresolved', claimId: 'latency' },
      { type: 'custom-answer-accepted', claimId: 'latency' },
    ]);
    expect(later?.status).toBe('accepted');
  });

  it('keeps a follow-up reply uninterpreted', () => {
    const state = reduce([
      note,
      custom(0),
      { type: 'claim-left-unresolved', claimId: 'latency' },
      { type: 'clarification-sent', claimId: 'latency', question: 'Which year?' },
      { type: 'followup-answered', claimId: 'latency', text: 'The first one.' },
    ]);
    const latency = state.claims.find((c) => c.id === 'latency');
    expect(latency?.status).toBe('needs-review');
    expect(latency?.confidence).toBe('uninterpreted');
    expect(state.openQuestion.status).toBe('needs-human-reading');
  });

  it('only allows leaving own-words claims unresolved', () => {
    const state = reduce([
      note,
      answer(0),
      { type: 'claim-left-unresolved', claimId: 'latency' },
    ]);
    expect(state.claims.find((c) => c.id === 'latency')?.status).toBe('needs-review');
  });
});

describe('interview stage', () => {
  const ownWords =
    'Bit of both, honestly. I owned the runtime for the first year, then handed it to the platform team and moved to release tooling.';
  const reviewed: RelayEvent[] = [
    note,
    answer(0),
    { type: 'claim-accepted', claimId: 'latency' },
    { type: 'claim-accepted', claimId: 'rollout' },
    { type: 'claim-accepted', claimId: 'validation' },
  ];
  const started: RelayEvent[] = [...reviewed, { type: 'interview-started' }];

  it('enters Interview only after Apply & Context has human-reviewed every claim', () => {
    expect(reduce([...reviewed.slice(0, -1), { type: 'interview-started' }]).stage).toBe(
      'review',
    );
    const state = reduce(started);
    expect(state.stage).toBe('interview');
    expect(state.interview?.status).toBe('ready');
    expect(lastCrossing(state)?.text).toContain('moved Jeremy into the interview stage');
  });

  it('generates the interview brief from accepted and unresolved context', () => {
    const state = reduce(started);
    expect(recruiterView(state).brief).toContainEqual({
      kind: 'strength',
      text: 'Inference under hard latency budgets',
    });

    const unresolved = reduce([
      note,
      {
        type: 'clarification-answered',
        answerId: clarification.answers[0].id,
        text: ownWords,
      },
      { type: 'claim-left-unresolved', claimId: 'latency' },
      { type: 'claim-accepted', claimId: 'rollout' },
      { type: 'claim-accepted', claimId: 'validation' },
      { type: 'interview-started' },
    ]);
    expect(recruiterView(unresolved).brief).toContainEqual({
      kind: 'open',
      text: openQuestionAtStart,
    });
  });

  it('sends James’s focused question to Jeremy', () => {
    const state = reduce([
      ...started,
      { type: 'interview-question-sent', question: interviewQuestion },
    ]);
    expect(state.interview).toMatchObject({
      status: 'awaiting-jeremy',
      question: interviewQuestion,
    });
    expect(lastCrossing(state)?.crossing).toBe('to-jeremy');
  });

  it('keeps Jeremy’s scripted interview response exact for James', () => {
    const state = reduce([
      ...started,
      { type: 'interview-question-sent', question: interviewQuestion },
      { type: 'interview-answer-submitted', text: scriptedInterviewAnswer },
    ]);
    expect(state.interview?.answer).toMatchObject({
      text: scriptedInterviewAnswer,
      edited: false,
    });
    expect(state.interview?.status).toBe('needs-james-reading');
    expect(lastCrossing(state)?.crossing).toBe('to-james');
  });

  it('keeps an edited interview response as own words without interpreting it', () => {
    const ownInterviewWords =
      'I slowed the canary, paired with safety, and documented the trade-off.';
    const state = reduce([
      ...started,
      { type: 'interview-question-sent', question: interviewQuestion },
      { type: 'interview-answer-submitted', text: ownInterviewWords },
    ]);
    expect(state.interview?.answer).toMatchObject({
      text: ownInterviewWords,
      edited: true,
    });
    expect(state.trail.map((entry) => entry.text).join(' ')).toContain(
      'without interpreting it',
    );
  });

  it('lets James accept, follow up on, or leave an interview answer unresolved', () => {
    const answered: RelayEvent[] = [
      ...started,
      { type: 'interview-question-sent', question: interviewQuestion },
      { type: 'interview-answer-submitted', text: scriptedInterviewAnswer },
    ];
    expect(
      reduce([...answered, { type: 'interview-answer-accepted' }]).interview?.status,
    ).toBe('accepted');
    expect(
      reduce([
        ...answered,
        { type: 'interview-followup-sent', question: 'What did you measure next?' },
      ]).interview,
    ).toMatchObject({
      status: 'awaiting-jeremy',
      followUp: 'What did you measure next?',
    });
    expect(
      reduce([...answered, { type: 'interview-answer-left-unresolved' }]).interview
        ?.status,
    ).toBe('unresolved');
  });

  it('resets the interview flow back to the deterministic initial state', () => {
    const beforeReset = reduce([
      ...started,
      { type: 'interview-question-sent', question: interviewQuestion },
    ]);
    expect(beforeReset.stage).toBe('interview');
    expect(reduce([])).toEqual(initialState);
  });
});
