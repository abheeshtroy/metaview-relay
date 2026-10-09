import type { TrailEntry } from '../relay/reduce';

/** The track between the two surfaces. On each hand-off it flows and a baton crosses. */
export function Seam({ crossing }: { crossing?: TrailEntry }) {
  return (
    <div className={`seam ${crossing?.crossing ?? 'idle'}`} aria-hidden="true">
      <span className="seam-line" />
      {crossing && <span key={`flow-${crossing.seq}`} className="seam-flow" />}
      {crossing && (
        <span key={`baton-${crossing.seq}`} className="seam-baton">
          {crossing.crossing === 'to-james' ? '→' : '←'}
        </span>
      )}
    </div>
  );
}

/** A one-line, human-readable account of the latest hand-off. */
export function Handoff({ crossing }: { crossing?: TrailEntry }) {
  if (!crossing) {
    return (
      <p className="handoff idle" role="status">
        <span className="handoff-route">Relay</span>
        Standing by. Nothing has passed between Jeremy and James yet.
      </p>
    );
  }
  const toJames = crossing.crossing === 'to-james';
  return (
    <p key={crossing.seq} className={`handoff ${crossing.crossing}`} role="status">
      <span className="handoff-route">
        {toJames ? 'Jeremy → James' : 'James → Jeremy'}
      </span>
      {crossing.text}
    </p>
  );
}
