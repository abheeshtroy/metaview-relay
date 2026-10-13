import type { ReactNode } from 'react';
import { people } from '../relay/fixtures';
import { latestRelayWork, type RelayState, type Side } from '../relay/reduce';
import { Mark } from './Mark';

interface Props {
  side: Side;
  state: RelayState;
  /** This side has the move. */
  active: boolean;
  /** On narrow screens only one side shows at a time. */
  shown: boolean;
  children: ReactNode;
}

const heads = {
  jeremy: { person: people.candidate, where: `Candidate portal · ${people.employer}` },
  james: { person: people.recruiter, where: `Recruiter workspace · ${people.employer}` },
};

/** One side of the product: whose it is, what Relay last did for James, and its content. */
export function Pane({ side, state, active, shown, children }: Props) {
  const { person, where } = heads[side];
  // Jeremy's cards already say what Relay sent him. James's side shows the work
  // Relay did for him between his actions.
  const work = side === 'james' ? latestRelayWork(state, side) : [];
  return (
    <section
      id={`pane-${side}`}
      className={`pane ${side} ${active ? 'active' : ''} ${shown ? 'shown' : ''}`}
      aria-label={`${person.first}’s side`}
    >
      <header className="pane-head">
        <span className="initials">{person.initials}</span>
        <div>
          <h2>{person.name}</h2>
          <p className="pane-where">{where}</p>
        </div>
        {active && <span className="turn">Your move</span>}
      </header>
      {work.length > 0 && (
        <p key={work[0].seq} className="relay-line" role="status">
          <Mark size={16} />
          <span>{work.map((e) => e.text).join(' · ')}</span>
        </p>
      )}
      <div className="pane-body">{children}</div>
    </section>
  );
}

/** A small provenance label: whose words or work this is. */
export function Who({
  who,
  children,
}: {
  who: 'jeremy' | 'james' | 'relay';
  children: ReactNode;
}) {
  const { candidate: jeremy, recruiter: james } = people;
  return (
    <span className={`who ${who}`}>
      {who === 'relay' ? (
        <Mark size={16} />
      ) : (
        <span className="initials">
          {who === 'jeremy' ? jeremy.initials : james.initials}
        </span>
      )}
      {children}
    </span>
  );
}

/** A card. `task` marks the one thing this side should do now. */
export function Card({
  task,
  tone,
  children,
}: {
  task?: boolean;
  tone?: 'open' | 'quiet';
  children: ReactNode;
}) {
  return (
    <article
      className={`card ${task ? 'task' : ''} ${tone ?? ''}`}
      data-task={task || undefined}
    >
      {children}
    </article>
  );
}
