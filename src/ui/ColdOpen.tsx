import { useEffect, useState, type ReactNode } from 'react';
import { people } from '../relay/fixtures';
import { JourneyRail } from './JourneyRail';
import { Mark } from './Mark';

const { candidate, recruiter } = people;

export interface IntroPage {
  label: string;
  title: string;
  body: string;
}

/** The three intro pages: what Relay is, how context is shared, what the viewer will do. */
export const introPages: IntroPage[] = [
  {
    label: 'What Relay is',
    title: 'Most hiring software is about the candidate. Relay works with them.',
    body: 'A concept for a candidate relationship layer: the candidate’s side of an agentic recruiting platform, from application to the next role.',
  },
  {
    label: 'How context is shared',
    title: `${candidate.first} brings the context. ${recruiter.first} brings the judgment.`,
    body: `${candidate.first} explains what his résumé misses. Relay carries his words to ${recruiter.first}, asks only what is still unclear, and keeps the decision with a person.`,
  },
  {
    label: 'What you’ll do',
    title: 'Try the first stage in about a minute.',
    body: 'You’ll play both sides. Later stages are on the map but not built in this prototype.',
  },
];

const roles = [
  { who: candidate.first, kind: 'jeremy', does: 'Adds context in his own words' },
  { who: 'Relay', kind: 'relay', does: 'Connects, asks and carries it forward' },
  { who: recruiter.first, kind: 'james', does: 'Decides what counts' },
];

const tasks = [
  `Share ${candidate.first}’s note about his automotive work.`,
  'Answer Relay’s one question, or edit it into your own words.',
  `Switch to ${recruiter.first} and accept, correct or ask.`,
];

function PageExtra({ page }: { page: number }): ReactNode {
  if (page === 1) {
    return (
      <ol className="cold-roles">
        {roles.map((r) => (
          <li key={r.who} className={r.kind}>
            <span className="cold-role-name">
              {r.kind === 'relay' && <Mark size={16} />}
              {r.who}
            </span>
            <span className="cold-role-does">{r.does}</span>
          </li>
        ))}
      </ol>
    );
  }
  if (page === 2) {
    return (
      <>
        <ol className="cold-tasks">
          {tasks.map((t, i) => (
            <li key={t}>
              <span className="cold-task-n">{String(i + 1).padStart(2, '0')}</span>
              {t}
            </li>
          ))}
        </ol>
        <JourneyRail />
      </>
    );
  }
  return null;
}

interface Props {
  /** `start` is true when the viewer finished the intro rather than skipping it. */
  onClose: (start: boolean) => void;
}

export function ColdOpen({ onClose }: Props) {
  const [page, setPage] = useState(0);
  const last = page === introPages.length - 1;
  const current = introPages[page];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="cold-open"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cold-title"
    >
      <div className="cold-card">
        <header className="cold-top">
          <div className="cold-brand">
            <Mark size={28} />
            <span>
              Relay <em>a concept for Metaview</em>
            </span>
          </div>
          <button
            className="cold-close"
            onClick={() => onClose(false)}
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        <div key={page} className="cold-page">
          <p className="cold-label">
            {String(page + 1).padStart(2, '0')} · {current.label}
          </p>
          <h1 id="cold-title">{current.title}</h1>
          <p className="cold-body-text">{current.body}</p>
          <PageExtra page={page} />
        </div>

        <footer className="cold-nav">
          <div
            className="cold-progress"
            role="progressbar"
            aria-valuemin={1}
            aria-valuemax={introPages.length}
            aria-valuenow={page + 1}
            aria-label="Intro progress"
          >
            {introPages.map((p, i) => (
              <span key={p.label} className={i <= page ? 'on' : ''} />
            ))}
          </div>
          <button className="text-button" onClick={() => onClose(false)}>
            Skip
          </button>
          <button
            className="pill"
            autoFocus
            onClick={() => (last ? onClose(true) : setPage(page + 1))}
          >
            {last ? `Start as ${candidate.first}` : 'Next'}
          </button>
        </footer>

        <p className="cold-legal">
          Independent concept prototype, not affiliated with or endorsed by Metaview. All
          people, companies and data are synthetic; {candidate.name} and {recruiter.name}{' '}
          are fictional here, unrelated to any real person.
        </p>
      </div>
    </div>
  );
}
