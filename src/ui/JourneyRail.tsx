import type { InterviewPhase, Stage } from '../relay/reduce';

type Step = 'apply' | 'interview';

const stages: { name: string; product: string; step?: Step }[] = [
  { name: 'Apply & context', product: 'Concierge · Potential', step: 'apply' },
  { name: 'Interview', product: 'Concierge', step: 'interview' },
  { name: 'Offer', product: 'Close' },
  { name: 'Reconnect', product: 'Reconnect' },
];

export function JourneyRail({
  stage = 'invite',
  interviewPhase,
}: {
  stage?: Stage;
  interviewPhase?: InterviewPhase;
}) {
  const active: Step = stage === 'interview' ? 'interview' : 'apply';
  // Once James saves the debrief, Interview stays the current stage but is no longer live.
  const complete = active === 'interview' && interviewPhase === 'closed';
  return (
    <ol className="journey" aria-label="Candidate journey">
      {stages.map((s) => {
        const live = s.step === active;
        const meta = live
          ? s.product
          : s.step === 'apply'
            ? `Done · ${s.product}`
            : s.step
              ? `Next · ${s.product}`
              : 'Later · not built yet';
        return (
          <li
            key={s.name}
            className={live ? `live${complete ? ' complete' : ''}` : 'later'}
          >
            <span className="journey-dot" aria-hidden="true" />
            <span className="journey-name">
              {s.name}
              {live && (
                <span className="journey-live">{complete ? 'Complete' : 'Live'}</span>
              )}
            </span>
            <span className="journey-meta">{meta}</span>
          </li>
        );
      })}
    </ol>
  );
}
