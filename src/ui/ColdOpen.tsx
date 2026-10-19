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

/** The opening context: what Relay is, how responsibility stays with people, and the workspace. */
export const introPages: IntroPage[] = [
  {
    label: 'What Relay is',
    title: 'Recruiting runs on conversations. Relay keeps them connected.',
    body: 'An independent concept for a candidate relationship layer. Relay handles routine work between conversations so candidates and recruiters can focus on what needs a person.',
  },
  {
    label: 'Who does what',
    title: 'Relay does the routine work. People make the calls.',
    body: `Relay coordinates, takes notes and answers routine offer questions from approved facts. ${recruiter.first} decides the interview, offer and pay. ${candidate.first}’s words remain his own.`,
  },
  {
    label: 'The workspace',
    title: 'Candidate and recruiter stay in sync from application through offer.',
    body: `${candidate.first}’s portal and ${recruiter.first}’s workspace sit side by side. Continue from the side marked “Your move”; the other side updates with the shared context.`,
  },
];

const roles = [
  { who: candidate.first, kind: 'jeremy', does: 'Answers in his own words' },
  { who: 'Relay', kind: 'relay', does: 'Handles the routine work' },
  { who: recruiter.first, kind: 'james', does: 'Makes the decisions' },
];

const tasks = [
  `Apply: ${candidate.first} says what his résumé misses. Relay clears up one point with him and writes ${recruiter.first}’s brief.`,
  `Interview: ${candidate.first} books a time. Relay quotes the answer that matters and follows up on what the call missed.`,
  `Offer: Relay answers routine questions from the offer. Pay comes to ${recruiter.first}, with a draft.`,
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
            {last ? 'Open workspace' : 'Continue'}
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
