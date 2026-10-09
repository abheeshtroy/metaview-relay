import { useCallback, useMemo, useState } from 'react';
import type { RelayEvent } from './relay/events';
import { people } from './relay/fixtures';
import { candidateView, lastCrossing, recruiterView, reduce } from './relay/reduce';
import { CandidatePortal } from './ui/CandidatePortal';
import { ColdOpen } from './ui/ColdOpen';
import { JourneyRail } from './ui/JourneyRail';
import { Mark } from './ui/Mark';
import { RecruiterWorkspace } from './ui/RecruiterWorkspace';
import { Handoff, Seam } from './ui/Seam';
import { Trail } from './ui/Trail';
import './styles.css';

type Side = 'jeremy' | 'james';

function App() {
  const [events, setEvents] = useState<RelayEvent[]>([]);
  const [introOpen, setIntroOpen] = useState(true);
  const [side, setSide] = useState<Side>('jeremy');
  // Bumped when the viewer starts from the intro, so the Concierge draws the eye once.
  const [nudge, setNudge] = useState(0);

  const state = useMemo(() => reduce(events), [events]);
  const candidate = candidateView(state);
  const recruiter = recruiterView(state);
  const crossing = lastCrossing(state);

  const jeremyTurn =
    state.stage === 'invite' ||
    state.stage === 'clarify' ||
    candidate.questions.length > 0 ||
    state.interview?.status === 'awaiting-jeremy';
  const jamesTurn =
    (state.stage === 'review' && !jeremyTurn && recruiter.toReview > 0) ||
    (state.stage === 'interview' &&
      (state.interview?.status === 'ready' ||
        state.interview?.status === 'needs-james-reading'));

  // On mobile, point at the other side when something just landed there.
  const otherSide: Side = side === 'jeremy' ? 'james' : 'jeremy';
  const landedOnOther =
    crossing && (crossing.crossing === 'to-james' ? 'james' : 'jeremy') === otherSide;
  const otherTurn = otherSide === 'james' ? jamesTurn : jeremyTurn;

  const dispatch = (event: RelayEvent) => setEvents((prev) => [...prev, event]);
  const closeIntro = useCallback((start: boolean) => {
    setIntroOpen(false);
    if (start) {
      setSide('jeremy');
      setNudge((n) => n + 1);
    }
  }, []);

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Relay, a concept for Metaview">
          <Mark />
          <span>
            Relay <em>a concept for Metaview</em>
          </span>
        </a>
        <span className="disclaimer">Independent concept · synthetic data</span>
        <div className="topbar-actions">
          <button className="ghost" onClick={() => setIntroOpen(true)}>
            What is this?
          </button>
          <button
            className="ghost"
            onClick={() => setEvents([])}
            disabled={!events.length}
          >
            Reset demo
          </button>
        </div>
      </header>

      <main id="top" className="stage" inert={introOpen}>
        <JourneyRail stage={state.stage} />

        <div className="side-switch" role="tablist" aria-label="Choose a side">
          {(['jeremy', 'james'] as const).map((s) => (
            <button
              key={s}
              role="tab"
              aria-selected={side === s}
              className={side === s ? 'active' : ''}
              onClick={() => setSide(s)}
            >
              {s === 'jeremy'
                ? `${people.candidate.first} · candidate`
                : `${people.recruiter.first} · recruiter`}
              {(s === 'jeremy' ? jeremyTurn : jamesTurn) && (
                <span className="dot" aria-label="needs action" />
              )}
            </button>
          ))}
        </div>

        {landedOnOther && otherTurn && (
          <button className="meanwhile" onClick={() => setSide(otherSide)}>
            <span className="dot" aria-hidden="true" />
            Meanwhile, on {otherSide === 'james' ? 'James' : 'Jeremy'}’s side:{' '}
            {crossing.text}
            <span aria-hidden="true"> →</span>
          </button>
        )}

        <Handoff crossing={crossing} />

        <div className="duet" data-side={side}>
          <CandidatePortal
            state={state}
            view={candidate}
            myTurn={jeremyTurn}
            nudge={nudge}
            onEvent={dispatch}
          />
          <Seam crossing={crossing} />
          <RecruiterWorkspace
            state={state}
            view={recruiter}
            myTurn={jamesTurn}
            onEvent={dispatch}
          />
        </div>

        <Trail entries={state.trail} />

        <footer>
          Relay is an independent concept prototype and is not affiliated with or endorsed
          by Metaview. Every person, company and sentence in it is synthetic.
        </footer>
      </main>

      {introOpen && <ColdOpen onClose={closeIntro} />}
    </div>
  );
}

export default App;
