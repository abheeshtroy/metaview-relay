import { describe, expect, it } from 'vitest';
import type { RelayEvent } from './events';
import {
  clarification,
  claimTemplates,
  openQuestionAtStart,
  people,
  interviewScripts,
  scriptedAddendum,
  scriptedNote,
  type QuestionId,
} from './fixtures';
import {
  excerptBelongsTo,
  scriptedAssist,
  type QuestionSuggestion,
} from './interviewAssist';
import {
  candidateView,
  claimBadge,
  initialState,
  interviewTransitions,
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

describe('claim badge after a human decision', () => {
  const claim = (events: RelayEvent[], id = 'rollout') =>
    reduce(events).claims.find((c) => c.id === id)!;

  it('says inferred only while the claim is still waiting on review', () => {
    expect(claimBadge(claim([note, answer(0)])).label).toBe(
      'Inferred · not yet clarified',
    );
  });

  it('stops saying inferred once James accepts or corrects it', () => {
    const accepted = claim([
      note,
      answer(0),
      { type: 'claim-accepted', claimId: 'rollout' },
    ]);
    expect(claimBadge(accepted)).toEqual({
      label: 'Accepted by James · not clarified by Jeremy',
      tone: 'decided',
    });
    const corrected = claim([
      note,
      answer(0),
      { type: 'claim-corrected', claimId: 'rollout', note: 'Release engineering.' },
    ]);
    expect(claimBadge(corrected).label).toBe('Relay’s reading replaced by James');
  });

  it('keeps Jeremy’s clarification visible on an accepted claim', () => {
    const accepted = claim(
      [note, answer(0), { type: 'claim-accepted', claimId: 'latency' }],
      'latency',
    );
    expect(claimBadge(accepted).label).toBe('Clarified by Jeremy');
  });
});

// ---------- Interview: Prepare → Interview → Recap → Debrief ----------

const decideAll = (corrected = false): RelayEvent[] => [
  { type: 'claim-accepted', claimId: 'latency' },
  { type: 'claim-accepted', claimId: 'rollout' },
  corrected
    ? {
        type: 'claim-corrected',
        claimId: 'validation',
        note: 'Closer to QA here; probe it.',
      }
    : { type: 'claim-accepted', claimId: 'validation' },
];

function prepOpened(before: RelayEvent[]): RelayEvent {
  return {
    type: 'interview-prep-opened',
    suggestions: scriptedAssist.suggestQuestions({
      openQuestion: reduce(before).openQuestion.text,
    }),
  };
}

function held(before: RelayEvent[]): RelayEvent {
  const interview = reduce(before).interview!;
  const question = interview.suggestions.find((s) => s.id === interview.questionId)!;
  return { type: 'interview-held', ...scriptedAssist.extractExcerpt({ question })! };
}

/** Apply path A, then the interview up to (and including) the given step. */
function flow(
  until: 'prepare' | 'scheduled' | 'call' | 'recap' | 'debrief' | 'closed',
  options: { pick?: 'targeted' | 'broad'; addendum?: string; corrected?: boolean } = {},
): RelayEvent[] {
  const events: RelayEvent[] = [note, answer(0), ...decideAll(options.corrected)];
  events.push(prepOpened(events));
  if (until === 'prepare') return events;
  const suggestions = reduce(events).interview!.suggestions;
  const pick = suggestions.find((s) => s.kind === (options.pick ?? 'targeted'))!;
  events.push({ type: 'interview-plan-approved', questionId: pick.id });
  if (until === 'scheduled') return events;
  events.push({ type: 'interview-call-started' });
  if (until === 'call') return events;
  events.push(held(events));
  if (until === 'recap') return events;
  events.push({ type: 'interview-recap-confirmed', addendum: options.addendum });
  if (until === 'debrief') return events;
  events.push({
    type: 'interview-debriefed',
    outcome: 'still-open',
    note: 'Want the hiring manager’s view on shared GPU scheduling.',
  });
  return events;
}

describe('interview phase transitions', () => {
  it('moves strictly forward, one step per event', () => {
    expect(Object.values(interviewTransitions)).toEqual([
      { from: 'prepare', to: 'scheduled' },
      { from: 'scheduled', to: 'call' },
      { from: 'call', to: 'recap' },
      { from: 'recap', to: 'debrief' },
      { from: 'debrief', to: 'closed' },
    ]);
    const order = ['prepare', 'scheduled', 'call', 'recap', 'debrief', 'closed'] as const;
    expect(order.map((p) => reduce(flow(p)).interview?.phase)).toEqual([...order]);
    // Each step adds exactly one event, and each event is accepted.
    for (let i = 1; i < order.length; i++) {
      const before = flow(order[i - 1]);
      const after = flow(order[i]);
      expect(after).toHaveLength(before.length + 1);
      expect(reduce(after).trail.length).toBeGreaterThan(reduce(before).trail.length);
    }
  });

  it('has exactly one valid next event in every phase', () => {
    const all = flow('closed', { addendum: scriptedAddendum });
    const steps = all.slice(-5);
    const order = ['prepare', 'scheduled', 'call', 'recap', 'debrief', 'closed'] as const;
    order.slice(1).forEach((phase, i) => {
      const before = flow(order[i], { addendum: scriptedAddendum });
      const accepted = steps.filter(
        (event) =>
          reduce([...before, event]).interview?.phase !== reduce(before).interview?.phase,
      );
      expect(accepted).toEqual([steps[i]]);
      expect(reduce([...before, steps[i]]).interview?.phase).toBe(phase);
    });
  });

  it('never moves backwards', () => {
    const order = ['prepare', 'scheduled', 'call', 'recap', 'debrief', 'closed'] as const;
    const all = flow('closed');
    const interviewEvents = all.slice(-5);
    for (const at of order) {
      const before = flow(at);
      for (const event of interviewEvents) {
        const next = reduce([...before, event]).interview!.phase;
        expect(order.indexOf(next)).toBeGreaterThanOrEqual(order.indexOf(at));
      }
    }
  });

  it('starts the call at the scheduled time, with Relay outside it', () => {
    const state = reduce(flow('call'));
    expect(state.trail.at(-1)).toMatchObject({ actor: 'jeremy', time: 'Thu 14:00' });
    expect(state.trail.at(-1)?.text).toContain('Relay is not in the call');
    expect(candidateView(state).interview?.excerpt).toBeUndefined();
    expect(recruiterView(state).interview?.excerpt).toBeUndefined();
    expect(candidateView(state).status.detail).toContain('Relay isn’t in the call');
  });

  it('opens prep only after every Apply claim has a human decision', () => {
    const undecided: RelayEvent[] = [note, answer(0), decideAll()[0]];
    const state = reduce([...undecided, prepOpened(undecided)]);
    expect(state.stage).toBe('review');
    expect(state.interview).toBeUndefined();

    const opened = reduce(flow('prepare'));
    expect(opened.stage).toBe('interview');
    expect(opened.interview?.openQuestion).toBe(opened.openQuestion.text);
    expect(opened.interview?.suggestions).toHaveLength(2);
  });

  it('rejects malformed suggestions', () => {
    const before: RelayEvent[] = [note, answer(0), ...decideAll()];
    const [one] = scriptedAssist.suggestQuestions({
      openQuestion: reduce(before).openQuestion.text,
    });
    for (const suggestions of [[one], [one, one], [one, { ...one, id: 'x', prep: ' ' }]])
      expect(
        reduce([...before, { type: 'interview-prep-opened', suggestions }]).interview,
      ).toBeUndefined();
  });

  it('ignores each step out of order', () => {
    const prepare = flow('prepare');
    const id = reduce(prepare).interview!.suggestions[0].id;
    const recap = flow('recap');
    const heldEvent = recap.at(-1)!;
    const tooEarly: [RelayEvent[], RelayEvent][] = [
      [prepare, heldEvent],
      [prepare, { type: 'interview-recap-confirmed' }],
      [prepare, { type: 'interview-debriefed', outcome: 'still-open', note: 'x' }],
      [flow('scheduled'), { type: 'interview-recap-confirmed' }],
      [flow('scheduled'), heldEvent],
      [prepare, { type: 'interview-call-started' }],
      [recap, { type: 'interview-call-started' }],
      [recap, { type: 'interview-debriefed', outcome: 'answered-for-now', note: 'x' }],
      [recap, { type: 'interview-plan-approved', questionId: id }],
    ];
    for (const [before, event] of tooEarly)
      expect(reduce([...before, event])).toEqual(reduce(before));
  });

  it('ignores a plan for a question Relay did not suggest', () => {
    const before = flow('prepare');
    const state = reduce([
      ...before,
      { type: 'interview-plan-approved', questionId: 'made-up' },
    ]);
    expect(state).toEqual(reduce(before));
  });

  it('allows no loops: repeating any step changes nothing', () => {
    const all = flow('closed', { addendum: scriptedAddendum });
    const closed = reduce(all);
    const replayed = reduce([...all, ...all.slice(5)]);
    expect(replayed).toEqual(closed);
    expect(replayed.trail).toHaveLength(closed.trail.length);
  });

  it('continues the demo clock from the end of the call', () => {
    const state = reduce(flow('debrief'));
    const times = state.trail.slice(-3).map((e) => e.time);
    expect(times).toEqual(['Thu 14:45', 'Thu 14:48', 'Thu 14:48']);
  });
});

describe('interview excerpt pairing', () => {
  const branches: [string, RelayEvent[]][] = [
    ['operated the runtime', [note, answer(0), ...decideAll()]],
    ['built the tooling', [note, answer(1), ...decideAll()]],
    [
      'own words, accepted as written',
      [
        note,
        {
          type: 'clarification-answered',
          answerId: clarification.answers[0].id,
          text: 'Bit of both, honestly.',
        },
        { type: 'custom-answer-accepted', claimId: 'latency' },
        { type: 'claim-accepted', claimId: 'rollout' },
        { type: 'claim-accepted', claimId: 'validation' },
      ],
    ],
  ];

  it.each(branches)(
    'suggests a targeted question for the open question Apply left (%s)',
    (_, before) => {
      const state = reduce([...before, prepOpened(before)]);
      const [targeted, broad] = state.interview!.suggestions;
      expect(targeted.kind).toBe('targeted');
      expect(broad.kind).toBe('broad');
      expect(
        new Set(
          branches.map(
            ([, b]) => reduce([...b, prepOpened(b)]).interview!.suggestions[0].id,
          ),
        ).size,
      ).toBe(3);
    },
  );

  it('ships a fixture excerpt that belongs to every question it can suggest', () => {
    for (const [, before] of branches) {
      for (const question of reduce([...before, prepOpened(before)]).interview!
        .suggestions) {
        const script = interviewScripts[question.id as QuestionId];
        expect(excerptBelongsTo(question, script.excerpt, script.coverage)).toBe(true);
      }
    }
  });

  it('shows the excerpt for the chosen question, opening with James asking it verbatim', () => {
    for (const pick of ['targeted', 'broad'] as const) {
      const interview = reduce(flow('recap', { pick })).interview!;
      const chosen = interview.suggestions.find((s) => s.id === interview.questionId)!;
      expect(chosen.kind).toBe(pick);
      expect(interview.excerpt?.questionId).toBe(chosen.id);
      expect(interview.excerpt?.lines[0]).toMatchObject({
        speaker: 'james',
        text: chosen.question,
      });
    }
  });

  it('rejects an excerpt that belongs to the other question', () => {
    const before = flow('call', { pick: 'targeted' });
    const other = reduce(before).interview!.suggestions.find((s) => s.kind === 'broad')!;
    const wrong: RelayEvent = {
      type: 'interview-held',
      ...scriptedAssist.extractExcerpt({ question: other })!,
    };
    expect(reduce([...before, wrong])).toEqual(reduce(before));
  });

  it('rejects an excerpt whose question was reworded, or whose coverage cites nothing', () => {
    const before = flow('call');
    const good = held(before) as Extract<RelayEvent, { type: 'interview-held' }>;
    const reworded: RelayEvent = {
      ...good,
      excerpt: {
        ...good.excerpt,
        lines: good.excerpt.lines.map((l, i) =>
          i === 0 ? { ...l, text: 'A different question?' } : l,
        ),
      },
    };
    const uncited: RelayEvent = {
      ...good,
      coverage: { ...good.coverage, addresses: [{ point: 'Something', at: '99:99' }] },
    };
    for (const bad of [reworded, uncited])
      expect(reduce([...before, bad]).interview?.phase).toBe('call');
    expect(reduce([...before, good]).interview?.phase).toBe('recap');
  });
});

describe('interview recap addenda', () => {
  const ownWords =
    'I also wrote the scheduler for our simulation cluster, which shared GPUs across three teams.';

  it('keeps an unchanged suggested addition as candidate-provided, unedited', () => {
    const addendum = reduce(flow('debrief', { addendum: scriptedAddendum })).interview
      ?.recap?.addendum;
    expect(addendum).toMatchObject({ text: scriptedAddendum, edited: false });
  });

  it('keeps an edited addition exactly as written and does not interpret it', () => {
    const recap = reduce(flow('recap'));
    const state = reduce(flow('debrief', { addendum: ownWords }));
    expect(state.interview?.recap?.addendum).toMatchObject({
      text: ownWords,
      edited: true,
      label: 'Your addition, in your own words',
    });
    // Relay's coverage is untouched by anything Jeremy adds.
    expect(state.interview?.coverage).toEqual(recap.interview?.coverage);
    expect(state.trail.at(-1)?.text).toContain('without interpreting the addition');
    expect(recruiterView(state).interview?.recap?.addendum?.text).toBe(ownWords);
  });

  it('treats a blank addition as nothing to add', () => {
    const state = reduce(flow('debrief', { addendum: '   ' }));
    expect(state.interview?.phase).toBe('debrief');
    expect(state.interview?.recap?.addendum).toBeUndefined();
  });
});

describe('interview projections', () => {
  const steps = ['prepare', 'scheduled', 'call', 'recap', 'debrief', 'closed'] as const;

  it('never shows Jeremy James’s suggestions, coverage, notes or brief', () => {
    for (const step of steps) {
      for (const pick of ['targeted', 'broad'] as const) {
        const state = reduce(
          flow(step, { pick, corrected: true, addendum: scriptedAddendum }),
        );
        const view = candidateView(state);
        const seen = JSON.stringify(view);
        const interview = state.interview!;
        const hidden = [
          interview.openQuestion,
          ...interview.suggestions.map((s: QuestionSuggestion) => s.why),
          ...interview.suggestions
            .filter((s) => s.id !== interview.questionId)
            .map((s) => s.question),
          ...(interview.coverage?.addresses.map((a) => a.point) ?? []),
          ...(interview.coverage?.notAddressed ?? []),
          'Closer to QA here',
          'hiring manager’s view',
          'still-open',
          'strength',
        ];
        for (const text of hidden) expect(seen).not.toContain(text);
        expect(view).not.toHaveProperty('interviewBrief');
      }
    }
  });

  it('shows Jeremy the approved topic only once the plan is sent', () => {
    expect(candidateView(reduce(flow('prepare'))).interview?.prep).toBeUndefined();
    const scheduled = reduce(flow('scheduled'));
    const chosen = scheduled.interview!.suggestions[0];
    expect(candidateView(scheduled).interview?.prep).toBe(chosen.prep);
  });

  it('quotes Jeremy’s words identically on both sides, exactly as the transcript has them', () => {
    const state = reduce(flow('debrief', { addendum: scriptedAddendum }));
    const chosen = state.interview!.suggestions.find(
      (s) => s.id === state.interview!.questionId,
    )!;
    const transcript = interviewScripts[chosen.id as QuestionId].excerpt;
    expect(candidateView(state).interview?.excerpt).toEqual(transcript);
    expect(recruiterView(state).interview?.excerpt).toEqual(transcript);
    expect(recruiterView(state).interview?.recap?.addendum?.text).toBe(scriptedAddendum);
  });

  it('lets Jeremy check the excerpt before James sees it', () => {
    const recap = reduce(flow('recap'));
    expect(candidateView(recap).interview?.excerpt).toEqual(recap.interview?.excerpt);
    expect(recruiterView(recap).interview?.excerpt).toBeUndefined();
    expect(recruiterView(recap).interview?.coverage).toBeUndefined();

    const debrief = reduce(flow('debrief'));
    expect(recruiterView(debrief).interview?.excerpt).toEqual(debrief.interview?.excerpt);
    expect(recruiterView(debrief).interview?.coverage).toEqual(
      debrief.interview?.coverage,
    );
  });
});

describe('interview debrief', () => {
  it('requires James’s note before closing', () => {
    const before = flow('debrief');
    const blank = reduce([
      ...before,
      { type: 'interview-debriefed', outcome: 'answered-for-now', note: '  ' },
    ]);
    expect(blank.interview?.phase).toBe('debrief');
  });

  it('closes with James’s outcome and note, and a soft update for Jeremy', () => {
    const state = reduce(flow('closed'));
    expect(state.interview?.phase).toBe('closed');
    expect(state.interview?.debrief).toMatchObject({
      outcome: 'still-open',
      note: 'Want the hiring manager’s view on shared GPU scheduling.',
    });
    expect(recruiterView(state).interview?.debrief?.outcome).toBe('still-open');
    expect(candidateView(state).status.headline).toBe(
      'James has finished his interview notes',
    );
    expect(lastCrossing(state)).toMatchObject({ actor: 'relay', crossing: 'to-jeremy' });
    // The open question itself is never rewritten.
    expect(state.openQuestion).toEqual(reduce(flow('prepare')).openQuestion);
  });

  it('never changes Jeremy’s words', () => {
    const before = candidateView(reduce(flow('prepare'))).words;
    expect(candidateView(reduce(flow('closed'))).words).toEqual(before);
  });

  it('resets to the deterministic initial state and replays identically', () => {
    const events = flow('closed', { addendum: scriptedAddendum });
    expect(reduce(events)).toEqual(reduce(events));
    expect(reduce([])).toEqual(initialState);
  });
});
