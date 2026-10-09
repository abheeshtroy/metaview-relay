import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { RelayEvent } from '../relay/events';
import { clarification, scriptedNote } from '../relay/fixtures';
import { candidateView, recruiterView, reduce } from '../relay/reduce';
import { CandidatePortal } from './CandidatePortal';
import { ColdOpen, introPages } from './ColdOpen';
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
