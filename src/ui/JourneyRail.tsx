const stages = [
  { name: 'Apply & context', product: 'Concierge · Potential', live: true },
  { name: 'Interview', product: 'Concierge', live: false },
  { name: 'Offer', product: 'Close', live: false },
  { name: 'Reconnect', product: 'Reconnect', live: false },
];

export function JourneyRail() {
  return (
    <ol className="journey" aria-label="Candidate journey">
      {stages.map((s) => (
        <li key={s.name} className={s.live ? 'live' : 'later'}>
          <span className="journey-dot" aria-hidden="true" />
          <span className="journey-name">
            {s.name}
            {s.live && <span className="journey-live">Live</span>}
          </span>
          <span className="journey-meta">
            {s.live ? s.product : 'Later · not built yet'}
          </span>
        </li>
      ))}
    </ol>
  );
}
