import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { RelayEvent } from '../relay/events';
import {
  answerEffects,
  clarification,
  interviewPlans,
  interviewScripts,
  scriptedNote,
} from '../relay/fixtures';
import { scriptedAssist } from '../relay/interviewAssist';
import { scriptedOfferAssist } from '../relay/offerAssist';
import { reduce } from '../relay/reduce';
import { ColdOpen, introPages } from './ColdOpen';
import { JamesSide } from './JamesSide';
import { JeremySide } from './JeremySide';
import { JourneyRail } from './JourneyRail';
import { Record } from './Record';

const noop = () => {};
const plan = interviewPlans['shared-gpu-translation'];
const [ranIt] = clarification.answers;
const shared: RelayEvent[] = [{ type: 'note-shared', text: scriptedNote }];
const apply: RelayEvent[] = [
  ...shared,
  { type: 'clarification-answered', answerId: ranIt.id, text: ranIt.text },
];
const book: RelayEvent[] = [...apply, { type: 'interview-invited', questionId: plan.id }];
const call: RelayEvent[] = [...book, { type: 'interview-booked', slotId: 'tue' }];
const inCall: RelayEvent[] = [
  ...call,
  { type: 'call-question-asked', excerpt: scriptedAssist.excerptFor(plan) },
];
const recap: RelayEvent[] = [
  ...inCall,
  { type: 'call-ended', ...scriptedAssist.notesFor(plan) },
];
const debrief: RelayEvent[] = [
  ...recap,
  { type: 'follow-up-answered', text: interviewScripts[plan.id].followUp.scriptedReply },
];
const offer: RelayEvent[] = [...debrief, { type: 'debrief-decided', outcome: 'advance' }];
const ask = (question: string) =>
  ({
    type: 'offer-question-asked',
    question,
    assist: scriptedOfferAssist(question),
  }) as const;

const jeremyHtml = (events: RelayEvent[]) =>
  renderToStaticMarkup(
    <JeremySide state={reduce(events)} onEvent={noop} onAsk={noop} asking={false} />,
  );
const jamesHtml = (events: RelayEvent[]) =>
  renderToStaticMarkup(<JamesSide state={reduce(events)} onEvent={noop} onUndo={noop} />);
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');
const primaries = (html: string) => html.match(/class="pill"/g)?.length ?? 0;

describe('one move at a time', () => {
  it('only the side with the move has a primary action', () => {
    const cases: [RelayEvent[], 'jeremy' | 'james'][] = [
      [[], 'jeremy'],
      [shared, 'jeremy'],
      [apply, 'james'],
      [book, 'jeremy'],
      [call, 'james'],
      [inCall, 'james'],
      [recap, 'jeremy'],
      [debrief, 'james'],
    ];
    for (const [events, mover] of cases) {
      const [mine, theirs] =
        mover === 'jeremy'
          ? [jeremyHtml(events), jamesHtml(events)]
          : [jamesHtml(events), jeremyHtml(events)];
      expect(primaries(mine), `${mover} at ${events.length}`).toBe(1);
      expect(primaries(theirs), `other side at ${events.length}`).toBe(0);
    }
  });

  it('when the offer arrives, Jeremy’s move is to ask, and James has nothing to do', () => {
    expect(jeremyHtml(offer)).toContain('class="chip"');
    expect(primaries(jamesHtml(offer))).toBe(0);
  });
});

describe('Apply', () => {
  it('James sees the note arrive with Relay’s links while Relay asks Jeremy', () => {
    const html = text(jamesHtml(shared));
    expect(html).toContain('Inference under hard latency budgets');
    expect(html).toContain('Relay is checking one thing');
  });

  it('gives James a brief with the open question and a suggested interview question', () => {
    const html = text(jamesHtml(apply));
    expect(html).toContain(answerEffects['owned-runtime'].openQuestion);
    expect(html).toContain(plan.question);
    expect(html).toContain('Invite Jeremy to interview');
  });

  it('keeps the hiring team’s reading off Jeremy’s side', () => {
    const html = text(jeremyHtml(apply));
    expect(html).not.toContain('Latency targets for model serving');
    expect(html).not.toContain(answerEffects['owned-runtime'].openQuestion);
  });
});

describe('Interview', () => {
  it('tells Jeremy only the topic, never James’s exact question', () => {
    for (const events of [book, call, inCall, recap]) {
      const html = text(jeremyHtml(events));
      expect(html).not.toContain(plan.question);
      expect(html).not.toContain('Leaves open');
    }
    expect(text(jeremyHtml(book))).toContain(plan.prep);
  });

  it('plays the quoted answer for James once he asks', () => {
    expect(text(jamesHtml(call))).toContain('Ask it');
    const html = text(jamesHtml(inCall));
    expect(html).toContain(scriptedAssist.excerptFor(plan).lines[1].text);
    expect(html).toContain('End the call');
  });

  it('shows James the excerpt, coverage and Jeremy’s quoted follow-up', () => {
    const html = text(jamesHtml(debrief));
    expect(html).toContain('Leaves open');
    expect(html).toContain('His reply · word for word');
    expect(html).toContain(interviewScripts[plan.id].followUp.scriptedReply);
  });

  it('a held candidate sees no offer', () => {
    const held: RelayEvent[] = [...debrief, { type: 'debrief-decided', outcome: 'hold' }];
    expect(text(jamesHtml(held))).toContain('No offer goes out');
    expect(text(jeremyHtml(held))).not.toContain('$245,000');
  });
});

describe('Offer / Close', () => {
  it('shows the approved terms and answers a routine question with its source', () => {
    const html = text(jeremyHtml([...offer, ask('How flexible is the start date?')]));
    expect(html).toContain('$245,000 a year');
    expect(html).toContain('from your offer: start date');
    expect(html).toContain('Ask James instead');
  });

  it('labels a live model answer', () => {
    const question = 'Is the role hybrid?';
    const html = text(
      jeremyHtml([
        ...offer,
        {
          type: 'offer-question-asked',
          question,
          assist: { ...scriptedOfferAssist(question), mode: 'live', status: 'success' },
        },
      ]),
    );
    expect(html).toContain('live model triage · checked against approved offer facts');
    expect(html).toContain('from your offer: work model');
  });

  it('routes pay to James immediately, with a draft from approved facts', () => {
    const events = [
      ...offer,
      ask('How flexible is the start date?'),
      ask('Is there any room on the base salary?'),
    ];
    expect(text(jeremyHtml(events))).toContain('Pay questions always go to James.');
    const html = text(jamesHtml(events));
    expect(html).toContain('fixed for this level');
    expect(html).toContain('Answered by Relay from the approved offer');
  });

  it('never calls a question answered until Jeremy says so', () => {
    const events: RelayEvent[] = [
      ...offer,
      ask('Is there any room on the base salary?'),
      {
        type: 'offer-reply-sent',
        questionId: 'q1',
        mode: 'written',
        text: 'It’s fixed.',
      },
    ];
    expect(text(jeremyHtml(events))).toContain('That answers it');
    const open = text(
      jeremyHtml([
        ...events,
        { type: 'offer-reply-acknowledged', questionId: 'q1', outcome: 'wants-call' },
      ]),
    );
    expect(open).toContain('Still open');
    expect(open).not.toMatch(/resolved/i);
  });

  it('the record keeps open questions open', () => {
    const state = reduce([
      ...offer,
      ask('Is there any room on the base salary?'),
      {
        type: 'offer-reply-sent',
        questionId: 'q1',
        mode: 'written',
        text: 'It’s fixed.',
      },
      { type: 'offer-reply-acknowledged', questionId: 'q1', outcome: 'wants-call' },
      { type: 'offer-finished' },
    ]);
    const html = text(renderToStaticMarkup(<Record state={state} onReplay={noop} />));
    expect(html).toContain('still open, with a call booked');
  });
});

describe('framing', () => {
  it('the intro describes the journey that is actually built', () => {
    const copy = introPages.map((p) => `${p.title} ${p.body}`).join(' ');
    expect(copy).not.toMatch(/not built/i);
    const html = text(renderToStaticMarkup(<ColdOpen onClose={noop} />));
    expect(html).toContain('synthetic');
  });

  it('the rail marks Reconnect as future work without implying the current flow is incomplete', () => {
    const html = text(renderToStaticMarkup(<JourneyRail step="offer" />));
    expect(html).toContain('Future');
    expect(html).not.toMatch(/not built/i);
    expect(html).toContain('Offer');
  });
});
