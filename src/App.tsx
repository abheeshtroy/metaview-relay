import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RelayEvent } from './relay/events';
import { people } from './relay/fixtures';
import { scriptedOfferAssist, type OfferAssist } from './relay/offerAssist';
import { reduce, turnOf, type Side } from './relay/reduce';
import { ColdOpen } from './ui/ColdOpen';
import { JamesSide } from './ui/JamesSide';
import { JeremySide } from './ui/JeremySide';
import { JourneyRail } from './ui/JourneyRail';
import { Mark } from './ui/Mark';
import { Pane } from './ui/Pane';
import { Record } from './ui/Record';
import './styles.css';

async function liveOfferAssist(question: string): Promise<OfferAssist> {
  const response = await fetch('/api/offer-assist', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ question }),
  });
  if (!response.ok) throw new Error('Offer assist unavailable');
  return response.json() as Promise<OfferAssist>;
}

function App() {
  const [events, setEvents] = useState<RelayEvent[]>([]);
  const [introOpen, setIntroOpen] = useState(true);
  const [asking, setAsking] = useState(false);
  const [side, setSide] = useState<Side>('jeremy');

  const state = useMemo(() => reduce(events), [events]);
  const turn = turnOf(state);

  // On narrow screens one side shows at a time, and the view follows the move.
  const [followed, setFollowed] = useState(turn);
  if (turn !== followed) {
    setFollowed(turn);
    if (turn) setSide(turn);
  }
  // When the move passes, bring the new mover's task into view if it isn't.
  useEffect(() => {
    if (!turn) return;
    const target =
      document.querySelector(`#pane-${turn} [data-task]`) ??
      document.getElementById(`pane-${turn}`);
    const box = target?.getBoundingClientRect();
    if (box && (box.top < 64 || box.top > window.innerHeight - 120))
      target?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
  }, [turn]);

  const dispatch = (event: RelayEvent) => setEvents((prev) => [...prev, event]);
  const reset = () => {
    setEvents([]);
    setSide('jeremy');
    window.scrollTo({ top: 0 });
  };
  const undo = () => setEvents((prev) => prev.slice(0, -1));
  const closeIntro = useCallback(() => setIntroOpen(false), []);

  // Suggested questions use deterministic triage. Jeremy's own words go to the live
  // model when a key is configured; the reducer re-checks whatever comes back.
  const ask = async (question: string, suggested: boolean) => {
    if (suggested) {
      dispatch({
        type: 'offer-question-asked',
        question,
        assist: scriptedOfferAssist(question),
      });
      return;
    }
    setAsking(true);
    let assist: OfferAssist;
    try {
      assist = await liveOfferAssist(question);
    } catch {
      assist = scriptedOfferAssist(question, 'provider-error');
    }
    setAsking(false);
    dispatch({ type: 'offer-question-asked', question, assist });
  };

  const { candidate: jeremy, recruiter: james } = people;

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Relay, a concept for Metaview">
          <Mark />
          <span>
            Relay <em>a concept for Metaview</em>
          </span>
        </a>
        <div className="topbar-actions">
          <button className="ghost" onClick={() => setIntroOpen(true)}>
            What is this?
          </button>
          <button className="ghost" onClick={reset} disabled={!events.length}>
            Start over
          </button>
        </div>
      </header>

      <main id="top" className="stage" inert={introOpen}>
        <JourneyRail step={state.step} />

        {state.step === 'done' ? (
          <Record state={state} onReplay={reset} />
        ) : (
          <>
            <div className="side-tabs" role="tablist" aria-label="Whose side to show">
              {(['jeremy', 'james'] as const).map((s) => (
                <button
                  key={s}
                  role="tab"
                  aria-selected={side === s}
                  aria-controls={`pane-${s}`}
                  onClick={() => setSide(s)}
                >
                  {s === 'jeremy'
                    ? `${jeremy.first} · candidate`
                    : `${james.first} · recruiter`}
                  {turn === s && <span className="dot" aria-label="has the move" />}
                </button>
              ))}
            </div>
            <div id="duet" className="duet">
              <Pane
                side="jeremy"
                state={state}
                active={turn === 'jeremy'}
                shown={side === 'jeremy'}
              >
                <JeremySide
                  state={state}
                  onEvent={dispatch}
                  onAsk={ask}
                  asking={asking}
                />
              </Pane>
              <Pane
                side="james"
                state={state}
                active={turn === 'james'}
                shown={side === 'james'}
              >
                <JamesSide state={state} onEvent={dispatch} onUndo={undo} />
              </Pane>
            </div>
            {state.step === 'held' && (
              <div className="actions center">
                <button className="pill" onClick={reset}>
                  Start again
                </button>
              </div>
            )}
          </>
        )}
      </main>

      {introOpen && <ColdOpen onClose={closeIntro} />}
    </div>
  );
}

export default App;
