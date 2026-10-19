import { describe, expect, it } from 'vitest';
import type { RelayEvent } from './events';
import {
  clarification,
  interviewPlans,
  interviewScripts,
  offerFacts,
  ownWordsEffect,
  scriptedNote,
} from './fixtures';
import { scriptedAssist } from './interviewAssist';
import { scriptedOfferAssist, type OfferAssist } from './offerAssist';
import {
  awaitingJames,
  latestRelayWork,
  planOptions,
  questionStatus,
  reduce,
  tally,
  turnOf,
} from './reduce';

const [ranIt, builtTooling] = clarification.answers;
const plan = interviewPlans['shared-gpu-translation'];

const apply: RelayEvent[] = [
  { type: 'note-shared', text: scriptedNote },
  { type: 'clarification-answered', answerId: ranIt.id, text: ranIt.text },
];
const booked: RelayEvent[] = [
  ...apply,
  { type: 'interview-invited', questionId: plan.id },
  { type: 'interview-booked', slotId: 'thu' },
];
const called: RelayEvent[] = [
  ...booked,
  { type: 'call-question-asked', excerpt: scriptedAssist.excerptFor(plan) },
  { type: 'call-ended', ...scriptedAssist.notesFor(plan) },
];
const debrief: RelayEvent[] = [
  ...called,
  {
    type: 'follow-up-answered',
    text: interviewScripts[plan.id].followUp.scriptedReply,
  },
];
const toOffer: RelayEvent[] = [
  ...debrief,
  { type: 'debrief-decided', outcome: 'advance' },
];
const asked = (question: string, assist: OfferAssist = scriptedOfferAssist(question)) =>
  ({ type: 'offer-question-asked', question, assist }) as const;

const turnsOf = (events: RelayEvent[]) =>
  events.map((_, i) => turnOf(reduce(events.slice(0, i + 1))));

describe('two sides, one move at a time', () => {
  it('passes the move between Jeremy and James as each acts', () => {
    expect(turnOf(reduce([]))).toBe('jeremy');
    expect(turnsOf(toOffer)).toEqual([
      'jeremy', // Relay asks Jeremy one question
      'james', // brief ready
      'jeremy', // pick a time
      'james', // the call
      'james', // question asked; still in the call
      'jeremy', // follow-up
      'james', // debrief
      'jeremy', // offer arrives
    ]);
  });

  it('keeps team-only work off Jeremy’s side', () => {
    const state = reduce(apply.slice(0, 1));
    expect(
      latestRelayWork(state, 'james')
        .map((e) => e.text)
        .join(' '),
    ).toMatch(/Linked 3 phrases/);
    expect(
      latestRelayWork(state, 'jeremy')
        .map((e) => e.text)
        .join(' '),
    ).not.toMatch(/Linked/);
  });
});

describe('Apply', () => {
  it('links the note, asks one question, and hands James a brief with one suggested question', () => {
    const state = reduce(apply);
    expect(state.step).toBe('brief');
    expect(state.note).toMatchObject({ text: scriptedNote, edited: false });
    expect(state.readings.map((r) => [r.id, r.basis])).toEqual([
      ['latency', 'answer'],
      ['rollout', 'note'],
      ['validation', 'note'],
    ]);
    expect(planOptions(state)).toEqual(['shared-gpu-translation']);
  });

  it('narrows the reading when Jeremy built the tooling, and suggests a different question', () => {
    const state = reduce([
      apply[0],
      {
        type: 'clarification-answered',
        answerId: builtTooling.id,
        text: builtTooling.text,
      },
    ]);
    expect(state.readings.find((r) => r.id === 'latency')?.basis).toBe('narrowed');
    expect(planOptions(state)).toEqual(['runtime-split']);
  });

  it('quotes an own-words answer without interpreting it, and leaves the question to James', () => {
    const text = 'Bit of both, honestly. I was on the runtime team for a year.';
    const state = reduce([
      apply[0],
      { type: 'clarification-answered', answerId: ranIt.id, text },
    ]);
    expect(state.answer).toMatchObject({ text, edited: true });
    expect(state.readings.find((r) => r.id === 'latency')?.basis).toBe('unread');
    expect(state.openQuestion).toBe(ownWordsEffect.openQuestion);
    expect(planOptions(state)).toHaveLength(2);
  });

  it('skips the clarifying question when the note has nothing to ask about', () => {
    const state = reduce([
      { type: 'note-shared', text: 'I am keen on this role and love infrastructure.' },
    ]);
    expect(state.step).toBe('brief');
    expect(state.readings).toEqual([]);
    expect(state.openBecause).toMatch(/Read it yourself/);
    expect(planOptions(state)).toHaveLength(2);
  });

  it('refuses an interview question that isn’t one of the options', () => {
    const state = reduce([
      ...apply,
      { type: 'interview-invited', questionId: 'runtime-split' },
    ]);
    expect(state.step).toBe('brief');
  });
});

describe('Interview', () => {
  it('books the slot Jeremy picked and times the call from it', () => {
    const state = reduce(booked);
    expect(state.step).toBe('call');
    expect(state.interview?.slot?.day).toBe('Thu 8 Oct');
    const later = reduce(called);
    expect(later.trail.at(-1)?.time).toBe('Thu 8 Oct 14:45');
  });

  it('ignores an excerpt that doesn’t open with James’s question word for word', () => {
    const excerpt = scriptedAssist.excerptFor(plan);
    const tampered = {
      ...excerpt,
      lines: [{ ...excerpt.lines[0], text: 'Something else' }, ...excerpt.lines.slice(1)],
    };
    const state = reduce([...booked, { type: 'call-question-asked', excerpt: tampered }]);
    expect(state.interview?.excerpt).toBeUndefined();
  });

  it('can’t end the call before the question is asked, or with notes citing unsaid lines', () => {
    expect(
      reduce([...booked, { type: 'call-ended', ...scriptedAssist.notesFor(plan) }]).step,
    ).toBe('call');
    const notes = scriptedAssist.notesFor(plan);
    const bad = {
      ...notes,
      coverage: { ...notes.coverage, addresses: [{ point: 'Invented', at: '99:99' }] },
    };
    expect(reduce([...called.slice(0, -1), { type: 'call-ended', ...bad }]).step).toBe(
      'call',
    );
  });

  it('marks an edited follow-up reply as his own wording', () => {
    const state = reduce([
      ...called,
      { type: 'follow-up-answered', text: 'Not really.' },
    ]);
    expect(state.interview?.reply).toMatchObject({ text: 'Not really.', edited: true });
  });

  it('a hold sends no offer and gives nobody the move', () => {
    const state = reduce([...debrief, { type: 'debrief-decided', outcome: 'hold' }]);
    expect(state.step).toBe('held');
    expect(state.offer).toBeUndefined();
    expect(turnOf(state)).toBeNull();
  });
});

describe('Offer / Close', () => {
  it('answers a routine question itself and keeps the move with Jeremy', () => {
    const state = reduce([...toOffer, asked('How flexible is the start date?')]);
    expect(state.offer?.questions[0]).toMatchObject({ owner: 'relay' });
    expect(turnOf(state)).toBe('jeremy');
  });

  it('routes pay to James straight away with a draft from approved facts', () => {
    const state = reduce([...toOffer, asked('Is there any room on the base salary?')]);
    expect(awaitingJames(state)).toHaveLength(1);
    expect(turnOf(state)).toBe('james');
  });

  it('keeps James’s edited response separate from Relay’s interpretation', () => {
    const edited = 'I can’t confirm sponsorship in writing. Let’s discuss it together.';
    const state = reduce([
      ...toOffer,
      asked('Can we discuss base salary and H-1B sponsorship?'),
      { type: 'offer-reply-sent', questionId: 'q1', mode: 'written', text: edited },
    ]);
    const question = state.offer!.questions[0];
    expect(question.text).toBe('Can we discuss base salary and H-1B sponsorship?');
    expect(question.assist.concerns).toEqual(['compensation', 'immigration']);
    expect(question.reply).toMatchObject({ text: edited, editedByJames: true });
    expect(questionStatus(question)).toBe('James replied · waiting for Jeremy');
  });

  it('re-triages unsafe model output instead of trusting it', () => {
    const question = 'Is the base salary negotiable?';
    const unsafe: OfferAssist = {
      concerns: ['start-date'],
      route: 'answer',
      answer: 'Yes, we can go to $300,000.',
      factsUsed: ['startWindow'],
      reason: 'From the offer',
      mode: 'live',
      status: 'success',
    };
    const state = reduce([...toOffer, asked(question, unsafe)]);
    expect(state.offer?.questions[0]).toMatchObject({ owner: 'james' });
    expect(state.offer?.questions[0].assist.status).toBe('provider-error');
  });

  it('lets Jeremy move a Relay answer to James', () => {
    const state = reduce([
      ...toOffer,
      asked('Is the role hybrid?'),
      { type: 'offer-sent-to-james', questionId: 'q1' },
    ]);
    expect(awaitingJames(state)[0]).toMatchObject({ movedByJeremy: true });
  });

  it('never calls a question answered until Jeremy says so', () => {
    const replied: RelayEvent[] = [
      ...toOffer,
      asked('Is there any room on the base salary?'),
      {
        type: 'offer-reply-sent',
        questionId: 'q1',
        mode: 'written',
        text: 'It’s fixed.',
      },
    ];
    const state = reduce(replied);
    expect(questionStatus(state.offer!.questions[0])).toBe(
      'James replied · waiting for Jeremy',
    );
    expect(turnOf(state)).toBe('jeremy');
    // Jeremy can't finish while a reply waits on him.
    expect(reduce([...replied, { type: 'offer-finished' }]).step).toBe('offer');

    const open = reduce([
      ...replied,
      { type: 'offer-reply-acknowledged', questionId: 'q1', outcome: 'wants-call' },
    ]);
    expect(questionStatus(open.offer!.questions[0])).toMatch(/^Still open/);
  });

  it('only accepts the acknowledgement that fits the reply', () => {
    const state = reduce([
      ...toOffer,
      asked('Can I get a visa?'),
      { type: 'offer-reply-sent', questionId: 'q1', mode: 'call', text: 'Let’s talk.' },
      { type: 'offer-reply-acknowledged', questionId: 'q1', outcome: 'answered' },
    ]);
    expect(state.offer?.questions[0].outcome).toBeUndefined();
  });

  it('finishes with honest totals from the log', () => {
    const state = reduce([
      ...toOffer,
      asked('How flexible is the start date?'),
      asked('Is there any room on the base salary?'),
      {
        type: 'offer-reply-sent',
        questionId: 'q2',
        mode: 'written',
        text: `The base is ${offerFacts.base.value}.`,
      },
      { type: 'offer-reply-acknowledged', questionId: 'q2', outcome: 'answered' },
      { type: 'offer-finished' },
    ]);
    expect(state.step).toBe('done');
    const totals = tally(state);
    expect(totals.relay).toBeGreaterThan(totals.james);
    expect(totals.james).toBe(5);
  });

  it('replays identically', () => {
    const events: RelayEvent[] = [...toOffer, asked('How flexible is the start date?')];
    expect(reduce(events)).toEqual(reduce(events));
  });
});
