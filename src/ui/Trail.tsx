import type { Actor } from '../relay/events';
import type { TrailEntry } from '../relay/reduce';
import { Mark } from './Mark';

const actors: Record<Actor, { name: string; badge: string }> = {
  jeremy: { name: 'Jeremy', badge: 'JC' },
  relay: { name: 'Relay', badge: '' },
  james: { name: 'James', badge: 'JM' },
};

/** Entries produced by one event share a seq; show them as one moment. */
function groupBySeq(entries: TrailEntry[]): TrailEntry[][] {
  const groups: TrailEntry[][] = [];
  for (const e of entries) {
    const last = groups[groups.length - 1];
    if (last && last[0].seq === e.seq) last.push(e);
    else groups.push([e]);
  }
  return groups;
}

/** Every step from the event log, including what only the hiring team saw. */
export function Trail({ entries }: { entries: TrailEntry[] }) {
  const groups = groupBySeq(entries);
  return (
    <section className="trail" aria-label="Every step">
      <header className="trail-head">
        <h3 className="trail-title">Every step</h3>
        <p>
          The whole journey from the log both sides are built from. It replays the same
          way every time. Steps marked “team only” never reached Jeremy.
        </p>
      </header>
      <ol className="trail-moments">
        {groups.map((group, i) => (
          <li
            key={group[0].seq}
            className={`trail-moment ${i === groups.length - 1 ? 'latest' : ''}`}
          >
            <span className="trail-node" aria-hidden="true" />
            <time>{group[0].time}</time>
            <ul className="trail-entries">
              {group.map((e, j) => (
                <li key={j}>
                  <span className={`trail-actor ${e.actor}`}>
                    <span className="trail-badge" aria-hidden="true">
                      {e.actor === 'relay' ? <Mark size={18} /> : actors[e.actor].badge}
                    </span>
                    {actors[e.actor].name}
                  </span>
                  <span className="trail-text">
                    {e.text}
                    {e.internal && <span className="trail-internal"> · team only</span>}
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </section>
  );
}
