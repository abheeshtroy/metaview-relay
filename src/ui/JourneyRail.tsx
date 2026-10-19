import { stageOf, type Stage, type Step } from '../relay/reduce';

const stages: { id: Stage | 'reconnect'; name: string }[] = [
  { id: 'apply', name: 'Apply' },
  { id: 'interview', name: 'Interview' },
  { id: 'offer', name: 'Offer' },
  { id: 'reconnect', name: 'Reconnect' },
];
const order: (Stage | 'reconnect')[] = stages.map((s) => s.id);

/** Current position in the candidate relationship. Without a step, it shows the full path. */
export function JourneyRail({ step }: { step?: Step }) {
  const current = step ? stageOf[step] : undefined;
  return (
    <ol className="journey" aria-label="Candidate journey">
      {stages.map((s) => {
        const state =
          s.id === 'reconnect'
            ? 'later'
            : !current
              ? 'later'
              : s.id === current
                ? step === 'held'
                  ? 'held'
                  : step === 'done'
                    ? 'done'
                    : 'live'
                : order.indexOf(s.id) < order.indexOf(current)
                  ? 'done'
                  : 'later';
        const meta =
          s.id === 'reconnect'
            ? 'Future'
            : state === 'live'
              ? 'Now'
              : state === 'held'
                ? 'Held for another round'
                : state === 'done'
                  ? 'Done'
                  : step === 'held'
                    ? 'Not yet'
                    : current
                      ? 'Up next'
                      : 'In this flow';
        return (
          <li
            key={s.id}
            className={state}
            aria-current={state === 'live' ? 'step' : undefined}
          >
            <span className="journey-name">
              {s.name}
              {state === 'live' && <span className="journey-live">Live</span>}
            </span>
            <span className="journey-meta">{meta}</span>
          </li>
        );
      })}
    </ol>
  );
}
