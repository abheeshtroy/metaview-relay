import type { Actor } from '../relay/events';
import type { TrailEntry } from '../relay/reduce';
import { Mark } from './Mark';

const actors: Record<Actor, { name: string; badge: string }> = {
  jeremy: { name: 'Jeremy', badge: 'J' },
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

const defaultIntro =
  'Every step between Jeremy, Relay and James, in order. Both sides are rebuilt from this log, so the demo replays the same way every time.';

export function Trail({
  entries,
  title = 'Relay trail',
  intro = defaultIntro,
}: {
  entries: TrailEntry[];
  title?: string;
  intro?: string;
}) {
  const groups = groupBySeq(entries);

  return (
    <section className="trail" aria-label={title}>
      <header className="trail-head">
        <h3 className="trail-title">{title}</h3>
        <p>{intro}</p>
      </header>

      {groups.length === 0 ? (
        <p className="trail-empty">
          <span className="trail-node" aria-hidden="true" />
          The trail starts when Jeremy shares something.
        </p>
      ) : (
        <ol className="trail-moments">
          {groups.map((group, i) => {
            const latest = i === groups.length - 1;
            const crossing = group.find((e) => e.crossing)?.crossing;
            return (
              <li key={group[0].seq} className={`trail-moment ${latest ? 'latest' : ''}`}>
                <span className="trail-node" aria-hidden="true" />
                <time>{group[0].time}</time>
                <ul className="trail-entries">
                  {group.map((e, j) => (
                    <li key={j}>
                      <span className={`trail-actor ${e.actor}`}>
                        <span className="trail-badge" aria-hidden="true">
                          {e.actor === 'relay' ? (
                            <Mark size={18} />
                          ) : (
                            actors[e.actor].badge
                          )}
                        </span>
                        {actors[e.actor].name}
                      </span>
                      <span className="trail-text">{e.text}</span>
                    </li>
                  ))}
                </ul>
                {crossing && (
                  <span className="trail-crossing">
                    {crossing === 'to-james' ? 'Handed to James' : 'Handed to Jeremy'}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
