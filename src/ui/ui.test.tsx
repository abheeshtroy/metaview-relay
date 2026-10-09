import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { RelayEvent } from '../relay/events';
import { clarification, scriptedAddendum, scriptedNote } from '../relay/fixtures';
import { scriptedAssist } from '../relay/interviewAssist';
import { candidateView, recruiterView, reduce } from '../relay/reduce';
import { CandidatePortal } from './CandidatePortal';
import { ColdOpen, introPages } from './ColdOpen';
import { InterviewGuide } from './InterviewGuide';
import { JourneyRail } from './JourneyRail';
import { debriefReady } from './RecruiterInterview';
import { RecruiterWorkspace } from './RecruiterWorkspace';

const ownWords =
  'Bit of both, honestly. I owned the runtime for the first year, then moved to release tooling.';
const base: RelayEvent[] = [
  { type: 'context-submitted', text: scriptedNote },
  {
    type: 'clarification-answered',
    answerId: clarification.answers[0].id,
    text: ownWords,
  },
];
const noop = () => {};
const unrelatedContext =
  'I volunteer as a community robotics mentor and enjoy translating technical ideas for new builders.';

function recruiterHtml(events: RelayEvent[]) {
  const state = reduce(events);
  return renderToStaticMarkup(
    <RecruiterWorkspace
      state={state}
      view={recruiterView(state)}
      myTurn={false}
      onEvent={noop}
    />,
  );
}

function candidateHtml(events: RelayEvent[]) {
  const state = reduce(events);
  return renderToStaticMarkup(
    <CandidatePortal
      state={state}
      view={candidateView(state)}
      myTurn={false}
      onEvent={noop}
    />,
  );
}

/** The markup of one claim card, found by its skill title. */
function card(html: string, title: string) {
  const cards = html.split('<article class="claim ').slice(1);
  const found = cards.find((c) => c.includes(`>${title}</h3>`));
  if (!found) throw new Error(`No claim card titled ${title}`);
  return found.split('</article>')[0];
}

const latencyTitle = 'Inference under hard latency budgets';

describe('recruiter workspace with an own-words answer', () => {
  it('shows Jeremy’s exact text, labelled as not interpreted', () => {
    const latency = card(recruiterHtml(base), latencyTitle);
    expect(latency).toContain(ownWords);
    expect(latency).toContain('not interpreted by Relay');
    expect(latency).toContain('Needs your reading');
  });

  it('offers accept, follow-up and leave-unresolved, but not Relay’s actions', () => {
    const latency = card(recruiterHtml(base), latencyTitle);
    expect(latency).toContain('Accept his answer');
    expect(latency).toContain('Ask a follow-up');
    expect(latency).toContain('Leave unresolved');
    expect(latency).not.toContain('>Accept</button>');
    expect(latency).not.toContain('>Correct</button>');
  });

  it('never presents a clarified or narrowed reading', () => {
    const html = recruiterHtml(base);
    expect(card(html, latencyTitle)).not.toMatch(/Clarified by Jeremy|Narrowed/);
    expect(html).not.toContain('says he operated');
    expect(html).toContain('Relay hasn’t interpreted it');
  });

  it('keeps the other claims on the normal review path', () => {
    const rollout = card(recruiterHtml(base), 'Staged model rollout to a fleet');
    expect(rollout).toContain('>Accept</button>');
    expect(rollout).not.toContain('Accept his answer');
  });

  it('shows an unresolved claim as left open, with no unresolve button', () => {
    const html = recruiterHtml([
      ...base,
      { type: 'claim-left-unresolved', claimId: 'latency' },
    ]);
    const latency = card(html, latencyTitle);
    expect(latency).toContain('Left unresolved');
    expect(latency).toContain('Accept his answer');
    expect(latency).not.toContain('Leave unresolved');
    expect(html).toContain('>Unresolved</span>');
  });
});

describe('candidate portal with an own-words answer', () => {
  it('shows his answer exactly as written and says Relay will not interpret it', () => {
    const html = candidateHtml(base);
    expect(html).toContain(ownWords);
    expect(html).toContain('Your answer, in your own words');
    expect(html).toContain('Relay hasn’t interpreted it');
    expect(html).not.toContain('Clarified');
  });

  it('gets a soft update when James leaves it unresolved', () => {
    const html = candidateHtml([
      ...base,
      { type: 'claim-left-unresolved', claimId: 'latency' },
    ]);
    expect(html).toContain('Nothing has been decided');
  });
});

describe('unmapped candidate context', () => {
  const events: RelayEvent[] = [{ type: 'context-submitted', text: unrelatedContext }];

  it('does not render the fixed clarification question for unrelated context', () => {
    const html = candidateHtml(events);
    expect(html).toContain(unrelatedContext);
    expect(html).not.toContain(clarification.question);
    expect(html).toContain('James will read it himself. Relay hasn’t interpreted it.');
  });

  it('gives James human-only review actions for the exact candidate-provided context', () => {
    const html = recruiterHtml(events);
    expect(html).toContain('Unmapped context · needs human reading');
    expect(html).toContain('Accept as candidate-provided context');
    expect(html).toContain('Ask a follow-up');
    expect(html).toContain('Leave unresolved');
    expect(html).toContain('Not interpreted by Relay');
    expect(html).toContain(unrelatedContext);
  });

  it('continues to render the intended clarification when its target evidence is present', () => {
    const state = reduce([{ type: 'context-submitted', text: scriptedNote }]);
    const html = renderToStaticMarkup(
      <CandidatePortal
        state={state}
        view={candidateView(state)}
        myTurn={true}
        onEvent={noop}
      />,
    );
    expect(html).toContain(clarification.question);
  });
});

describe('cold open', () => {
  const html = renderToStaticMarkup(<ColdOpen onClose={noop} />);

  it('has three pages: what Relay is, how context is shared, what you will do', () => {
    expect(introPages.map((p) => p.label)).toEqual([
      'What Relay is',
      'How context is shared',
      'What you’ll do',
    ]);
  });

  it('opens on page one as a labelled modal with Next, Skip and close', () => {
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain(introPages[0].title);
    expect(html).toContain('aria-valuenow="1"');
    expect(html).toContain('>Next</button>');
    expect(html).toContain('>Skip</button>');
    expect(html).toContain('aria-label="Close"');
  });

  it('keeps the independence and synthetic-data disclaimer visible', () => {
    expect(html).toContain('not affiliated with or endorsed by Metaview');
    expect(html).toContain('All people, companies and data are synthetic');
    expect(html).toContain('unrelated to any real person');
  });
});

describe('Apply badge after James decides', () => {
  it('no longer calls an accepted claim inferred', () => {
    const html = recruiterHtml([
      { type: 'context-submitted', text: scriptedNote },
      {
        type: 'clarification-answered',
        answerId: clarification.answers[0].id,
        text: clarification.answers[0].text,
      },
      { type: 'claim-accepted', claimId: 'rollout' },
    ]);
    const rollout = card(html, 'Staged model rollout to a fleet');
    expect(rollout).toContain('Accepted by James · not clarified by Jeremy');
    expect(rollout).not.toContain('Inferred');
    // Undecided claims still say so.
    expect(card(html, 'Pre-release model validation')).toContain(
      'Inferred · not yet clarified',
    );
  });
});

// ---------- Interview ----------

const applied: RelayEvent[] = [
  { type: 'context-submitted', text: scriptedNote },
  {
    type: 'clarification-answered',
    answerId: clarification.answers[0].id,
    text: clarification.answers[0].text,
  },
  { type: 'claim-accepted', claimId: 'latency' },
  { type: 'claim-accepted', claimId: 'rollout' },
  { type: 'claim-corrected', claimId: 'validation', note: 'Closer to QA; probe it.' },
];
const suggestions = scriptedAssist.suggestQuestions({
  openQuestion: reduce(applied).openQuestion.text,
});
const [targeted, broad] = suggestions;
const script = scriptedAssist.extractExcerpt({ question: targeted })!;
const debriefNote = 'Shared GPU scheduling is new to him; take it to the hiring manager.';
const at = {
  prepare: [...applied, { type: 'interview-prep-opened', suggestions }],
} as Record<string, RelayEvent[]>;
at.scheduled = [
  ...at.prepare,
  { type: 'interview-plan-approved', questionId: targeted.id },
];
const jeremyLines = script.excerpt.lines.filter((l) => l.speaker === 'jeremy');

/** The text of a button, and whether it is disabled. */
function button(html: string, label: string) {
  const match = html.match(new RegExp(`<button[^>]*>${label}</button>`));
  return match && { disabled: match[0].includes('disabled') };
}

function guideHtml(events: RelayEvent[]) {
  const state = reduce(events);
  return renderToStaticMarkup(
    <InterviewGuide
      state={state}
      candidate={candidateView(state)}
      recruiter={recruiterView(state)}
      onEvent={noop}
      onReplay={noop}
    />,
  );
}

/** The peek disclosure: what the other side sees right now. */
function peek(html: string) {
  return html.match(/<details class="peek"[^]*?<\/details>/)?.[0] ?? '';
}

const phases = ['prepare', 'scheduled', 'call', 'recap', 'debrief', 'closed'] as const;
at.call = [...at.scheduled, { type: 'interview-call-started' }];
at.recap = [...at.call, { type: 'interview-held', ...script }];
at.debrief = [
  ...at.recap,
  { type: 'interview-recap-confirmed', addendum: scriptedAddendum },
];
at.closed = [
  ...at.debrief,
  { type: 'interview-debriefed', outcome: 'still-open', note: debriefNote },
];
const html = Object.fromEntries(phases.map((p) => [p, guideHtml(at[p])])) as Record<
  (typeof phases)[number],
  string
>;
const openQuestion = reduce(at.prepare).interview!.openQuestion;

describe('interview guide: every step', () => {
  it.each(phases)(
    '%s shows who acts, why, what Relay does, one action and what’s next',
    (p) => {
      const step = html[p];
      expect(step.match(/class="pill"/g)).toHaveLength(1);
      expect(step).toContain('class="guide-actor');
      expect(step).toContain('class="guide-why"');
      expect(step).toContain('class="guide-relay"');
      expect(step).toContain('class="guide-next"');
    },
  );

  it('numbers the steps in one compact header', () => {
    expect(html.prepare).toContain('James · recruiter');
    expect(html.prepare).toContain('Step 1 of 5');
    expect(html.scheduled).toContain('Jeremy · candidate');
    expect(html.scheduled).toContain('Step 2 of 5');
    expect(html.call).toContain('Jeremy &amp; James · in conversation');
    expect(html.call).toContain('Step 3 of 5');
    expect(html.recap).toContain('Step 4 of 5');
    expect(html.debrief).toContain('Step 5 of 5');
    expect(html.closed).toContain('Complete');
  });

  it('is one focused surface: no Duet, Apply history or full brief', () => {
    for (const p of phases) {
      expect(html[p]).not.toMatch(
        /surface jeremy|surface james|What changed|Your other replies|Interview brief|Potential/,
      );
    }
  });

  it('keeps the Relay trail out of view until the debrief is saved', () => {
    for (const p of phases.slice(0, -1)) expect(html[p]).not.toContain('class="trail"');
    expect(html.closed).toContain('How Relay got here');
  });

  it('never says skip, accept answer, or offers follow-up loops', () => {
    for (const p of phases)
      expect(html[p]).not.toMatch(/Skip|Accept answer|follow-up|Send answer to James/i);
  });
});

describe('interview guide: 1 · James chooses what to learn', () => {
  it('heads with the open question and explains both options in one sentence', () => {
    expect(html.prepare).toContain(`>${openQuestion}</h2>`);
    for (const s of suggestions) {
      expect(html.prepare).toContain(s.question);
      expect(html.prepare).toContain(s.why);
      expect(s.why.split(/[.!?]\s/)).toHaveLength(1);
    }
    expect(button(html.prepare, 'Send Jeremy his interview note')).toEqual({
      disabled: true,
    });
  });

  it('lets James peek at Jeremy, who sees no options', () => {
    const p = peek(html.prepare);
    expect(p).toContain('James is preparing your interview');
    for (const s of suggestions) expect(p).not.toContain(s.question);
  });
});

describe('interview guide: 2 · Jeremy’s note', () => {
  it('shows a topic, not a verdict, in candidate-safe language only', () => {
    expect(html.scheduled).toContain('a topic, not a verdict');
    expect(html.scheduled).toContain(targeted.prep);
    for (const hidden of [targeted.why, targeted.question, broad.question, openQuestion])
      expect(html.scheduled).not.toContain(hidden);
    expect(button(html.scheduled, 'Continue to the interview')).toEqual({
      disabled: false,
    });
  });
});

describe('interview guide: 3 · the call, off screen', () => {
  it('is a deliberate transition that says Relay is not in the call', () => {
    expect(html.call).toContain('guide-screen transition');
    expect(html.call).toContain(
      'The conversation happens between Jeremy and James. Relay is not in the call.',
    );
    expect(html.call).toContain('review the conversation afterwards');
    expect(html.call).toContain('synthetic fixture');
    expect(button(html.call, 'See what Relay found')).toEqual({ disabled: false });
    expect(peek(html.call)).toBe('');
  });
});

describe('interview guide: 4 · Jeremy checks the record', () => {
  it('shows the exact timestamped excerpt that James will receive', () => {
    for (const l of jeremyLines) {
      expect(html.recap).toContain(l.text);
      expect(html.recap).toContain(`<time>${l.at}</time>`);
    }
    expect(html.recap).toContain('Check what James will receive.');
    expect(button(html.recap, 'Looks right')).toEqual({ disabled: false });
    expect(button(html.recap, 'Add context')).toEqual({ disabled: false });
  });

  it('keeps Relay’s coverage and James’s reasons off Jeremy’s screen', () => {
    for (const a of script.coverage.addresses) expect(html.recap).not.toContain(a.point);
    for (const g of script.coverage.notAddressed) expect(html.recap).not.toContain(g);
    expect(html.recap).not.toContain(targeted.why);
    expect(peek(html.recap)).toContain('James has nothing from the interview yet');
  });

  it('renders the broad opener’s own excerpt on that branch', () => {
    const broadScript = scriptedAssist.extractExcerpt({ question: broad })!;
    const recap = guideHtml([
      ...at.prepare,
      { type: 'interview-plan-approved', questionId: broad.id },
      { type: 'interview-call-started' },
      { type: 'interview-held', ...broadScript },
    ]);
    expect(recap).toContain(broad.question);
    expect(recap).not.toContain(jeremyLines[0].text);
  });
});

describe('interview guide: 5 · James reviews the debrief', () => {
  it('separates Jeremy’s words, Relay’s coverage and James’s conclusion', () => {
    const d = html.debrief;
    const words = d.indexOf('Jeremy’s exact words');
    const coverage = d.indexOf('Relay’s coverage');
    const conclusion = d.indexOf('Your conclusion');
    expect(words).toBeGreaterThan(-1);
    expect(coverage).toBeGreaterThan(words);
    expect(conclusion).toBeGreaterThan(coverage);
    expect(d).toContain('Coverage, not a decision');
    expect(d).toContain('Addresses');
    expect(d).toContain('Does not address');
    for (const l of jeremyLines) expect(d).toContain(l.text);
    expect(d).toContain(scriptedAddendum);
    expect(d).toContain('candidate-provided · not interpreted by Relay');
  });

  it('offers exactly two outcomes and requires a note before saving', () => {
    expect(html.debrief.match(/role="radio"/g)).toHaveLength(2);
    expect(html.debrief).toContain('Answered for now');
    expect(html.debrief).toContain('Still open');
    expect(html.debrief).toContain('Your note · required');
    expect(button(html.debrief, 'Save debrief')).toEqual({ disabled: true });
    expect(debriefReady(null, '')).toBe(false);
    expect(debriefReady(null, debriefNote)).toBe(false);
    expect(debriefReady('still-open', '   ')).toBe(false);
    expect(debriefReady('still-open', debriefNote)).toBe(true);
  });

  it('never pre-writes James’s note', () => {
    expect(html.debrief).toMatch(/<textarea[^>]*><\/textarea>/);
  });

  it('keeps an edited addition in Jeremy’s exact words, labelled as edited', () => {
    const own = 'I also scheduled jobs on a shared simulation cluster.';
    const d = guideHtml([
      ...at.recap,
      { type: 'interview-recap-confirmed', addendum: own },
    ]);
    expect(d).toContain(own);
    expect(d).toContain('edited by Jeremy');
    expect(d).not.toContain(scriptedAddendum);
    // Relay's coverage is the same as without the addition.
    for (const g of script.coverage.notAddressed) expect(d).toContain(g);
  });
});

describe('interview guide: 6 · saved debrief', () => {
  it('is one artifact with the question, evidence, coverage, addition and conclusion', () => {
    const card = html.closed.match(/<article class="debrief-card"[^]*<\/article>/)![0];
    expect(card).toContain(openQuestion);
    expect(card).toContain(jeremyLines[0].text);
    expect(card).toContain('Coverage, not a decision');
    expect(card).toContain(scriptedAddendum);
    expect(card).toContain(debriefNote);
    expect(card).toContain('Still open');
    expect(card).toContain('Relay made no hiring decision');
    expect(button(html.closed, 'Replay from the start')).toEqual({ disabled: false });
  });

  it('shows Jeremy a soft update without James’s note or outcome', () => {
    const p = peek(html.closed);
    expect(p).toContain('James has finished his interview notes');
    expect(p).not.toContain(debriefNote);
    expect(p).not.toContain('Still open');
  });
});

describe('interview guide: replay', () => {
  it('renders the same events identically, and nothing once reset', () => {
    expect(guideHtml(at.closed)).toBe(html.closed);
    expect(guideHtml([])).toBe('');
  });
});

describe('Apply panes after the Interview redesign', () => {
  it('carry no Interview screens of their own', () => {
    expect(recruiterHtml(applied)).not.toContain('guide-screen');
    expect(candidateHtml(applied)).not.toContain('guide-screen');
  });

  it('marks Interview live on the rail, and as next while in Apply', () => {
    expect(renderToStaticMarkup(<JourneyRail stage="interview" />)).toMatch(
      /Interview<span class="journey-live">Live/,
    );
    const apply = renderToStaticMarkup(<JourneyRail stage="review" />);
    expect(apply).toContain('Next · Concierge');
    expect(apply.match(/not built yet/g)).toHaveLength(2);
  });

  it('marks Interview complete on the rail once James saves the debrief', () => {
    const rail = (events: RelayEvent[]) => {
      const state = reduce(events);
      return renderToStaticMarkup(
        <JourneyRail stage={state.stage} interviewPhase={state.interview?.phase} />,
      );
    };
    const before = rail(at.debrief);
    expect(before).toMatch(
      /<li class="live">.*?Interview<span class="journey-live">Live/,
    );
    expect(before).not.toContain('Complete');

    const after = rail(at.closed);
    expect(after).toMatch(
      /<li class="live complete">.*?Interview<span class="journey-live">Complete/,
    );
    expect(after).not.toContain('>Live<');
    expect(after).toContain('Done · Concierge · Potential');
  });
});
