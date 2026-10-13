import { offerFacts, people } from '../relay/fixtures';
import { questionStatus, tally, type RelayState } from '../relay/reduce';
import { Trail } from './Trail';

const { candidate: jeremy, recruiter: james } = people;

/** The end of the journey: where each question stands, and who did the work. */
export function Record({ state, onReplay }: { state: RelayState; onReplay: () => void }) {
  const questions = state.offer?.questions ?? [];
  const open = questions.filter(
    (q) => q.outcome === 'wants-call' || q.outcome === 'call-accepted',
  ).length;
  const totals = tally(state);
  return (
    <section className="record-view" aria-labelledby="record-title">
      <div className="card">
        <h2 id="record-title">
          {open
            ? `${open === 1 ? 'One question is' : `${open} questions are`} still open, with a call booked.`
            : `${jeremy.first} has an answer to everything he asked.`}
        </h2>
        <p className="small">
          The offer is open until {offerFacts.replyBy.value}. The decision is{' '}
          {jeremy.first}’s.
        </p>
        <ul className="record" aria-label="Offer questions">
          {questions.map((q) => (
            <li key={q.id}>
              <span className="voice">{q.text}</span>
              <span
                className={`status ${q.outcome && q.outcome !== 'answered' ? 'open' : ''}`}
              >
                {questionStatus(q)}
              </span>
            </li>
          ))}
        </ul>
        <div className="totals" aria-label="Who did the work">
          <div>
            <strong>{totals.relay}</strong>
            <span>things Relay did between conversations</span>
          </div>
          <div>
            <strong>{totals.james}</strong>
            <span>actions {james.first} took</span>
          </div>
          <div>
            <strong>{totals.jeremy}</strong>
            <span>times {jeremy.first} answered or asked</span>
          </div>
        </div>
        <div className="actions">
          <button className="pill" onClick={onReplay}>
            Replay from the start
          </button>
        </div>
      </div>
      <Trail entries={state.trail} />
    </section>
  );
}
