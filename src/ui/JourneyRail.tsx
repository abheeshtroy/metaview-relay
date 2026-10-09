import type { Stage } from '../relay/reduce';

const stages = [
  { name: 'Apply & context', product: 'Concierge · Potential', stage: 'apply' },
  { name: 'Interview', product: 'Concierge', stage: 'interview' },
  { name: 'Offer', product: 'Close', live: false },
  { name: 'Reconnect', product: 'Reconnect', live: false },
];

export function JourneyRail({ stage = 'invite' }: { stage?: Stage }) {
  const active = stage === 'interview' ? 'interview' : 'apply';
  return (
    <ol className="journey" aria-label="Candidate journey">
      {stages.map((s) => {
        const live = s.stage === active;
        return (
          <li key={s.name} className={live ? 'live' : 'later'}>
            <span className="journey-dot" aria-hidden="true" />
            <span className="journey-name">
              {s.name}
              {live && <span className="journey-live">Live</span>}
            </span>
            <span className="journey-meta">
              {live ? s.product : 'Later · not built yet'}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
