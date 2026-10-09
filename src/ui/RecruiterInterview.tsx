import { useState } from 'react';
import type { RelayEvent } from '../relay/events';
import {
  debriefNoteStarters,
  debriefOutcomeLabel,
  interviewCall,
  people,
  type DebriefOutcome,
} from '../relay/fixtures';
import type { RecruiterInterviewView } from '../relay/reduce';
import { GuideScreen } from './GuideScreen';
import { Mark } from './Mark';
import { TranscriptQuote } from './TranscriptQuote';

interface Props {
  interview: RecruiterInterviewView;
  onEvent: (event: RelayEvent) => void;
}

const jeremy = people.candidate.first;

const kindLabel = {
  targeted: 'Aimed at the open question',
  broad: 'Broad opener',
};

/** Step 1: James chooses what he wants to learn; Jeremy gets only the topic. */
export function ChooseScreen({ interview, onEvent }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const chosen = interview.suggestions.find((s) => s.id === selected);

  return (
    <GuideScreen
      eyebrow="The open question Apply left you"
      headline={interview.openQuestion}
      why="Apply couldn’t settle this. Choosing one question now means the interview is spent learning it."
      relay="suggested both questions from the open question. It sends Jeremy nothing until you approve."
      next={`${jeremy} receives the topic only, never the open question or your reasons.`}
      actions={
        <button
          className="pill"
          disabled={!chosen}
          onClick={() =>
            chosen && onEvent({ type: 'interview-plan-approved', questionId: chosen.id })
          }
        >
          Send {jeremy} his interview note
        </button>
      }
    >
      <div className="plan-options" role="radiogroup" aria-label="Interview question">
        {interview.suggestions.map((s) => (
          <button
            key={s.id}
            role="radio"
            aria-checked={selected === s.id}
            className={`plan-option ${selected === s.id ? 'selected' : ''}`}
            onClick={() => setSelected(s.id)}
          >
            <span className="choice-label">{kindLabel[s.kind]}</span>
            <strong>{s.question}</strong>
            <span className="plan-why">{s.why}</span>
          </button>
        ))}
      </div>

      {chosen ? (
        <div className="privacy-split" aria-label="What each side sees">
          <div className="prep-preview">
            <p className="tag">{jeremy} will see</p>
            <p className="prep-topic">{chosen.prep}</p>
          </div>
          <div className="private-preview">
            <p className="tag">Only you see</p>
            <ul>
              <li>The open question</li>
              <li>The question you’ll ask, word for word</li>
              <li>Why Relay suggested it</li>
            </ul>
          </div>
        </div>
      ) : (
        <p className="prep-preview empty">
          Choose a question to see what {jeremy} will receive.
        </p>
      )}
    </GuideScreen>
  );
}

/** ① Jeremy's exact words, as he checked them, with his addition labelled. */
function JeremysWords({ interview }: { interview: RecruiterInterviewView }) {
  const { excerpt, recap } = interview;
  const addendum = recap?.addendum;
  return (
    <section className="debrief-part words" aria-label={`${jeremy}’s exact words`}>
      <header>
        <span className="part-n">1</span>
        <h3>{jeremy}’s exact words</h3>
        {recap && (
          <p className="meta">
            Checked by {jeremy} · {recap.time}
          </p>
        )}
      </header>
      {excerpt && <TranscriptQuote excerpt={excerpt} />}
      {addendum ? (
        <figure className="evidence addendum">
          <figcaption>
            {jeremy}’s addition · candidate-provided · not interpreted by Relay
            {addendum.edited && ` · edited by ${jeremy}`} · {addendum.time}
          </figcaption>
          <blockquote className="voice">{addendum.text}</blockquote>
        </figure>
      ) : (
        <p className="muted">{jeremy} confirmed the excerpt with nothing to add.</p>
      )}
    </section>
  );
}

/** ② What the excerpt does and doesn't address. Never a verdict. */
function RelaysCoverage({ interview }: { interview: RecruiterInterviewView }) {
  const { coverage } = interview;
  if (!coverage) return null;
  return (
    <section className="debrief-part coverage" aria-label="Relay’s coverage">
      <header>
        <span className="part-n">2</span>
        <h3>Relay’s coverage</h3>
        <p className="tag relay-tag">
          <Mark size={16} /> Coverage, not a decision
        </p>
      </header>
      <div className="coverage-cols">
        <div>
          <p className="coverage-head">Addresses</p>
          <ul>
            {coverage.addresses.map((a) => (
              <li key={a.point}>
                {a.point} <time>{a.at}</time>
              </li>
            ))}
          </ul>
        </div>
        <div className="gaps">
          <p className="coverage-head">Does not address</p>
          <ul>
            {coverage.notAddressed.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

const outcomeHelp: Record<DebriefOutcome, string> = {
  'answered-for-now': 'Enough to move forward. The gaps stay on record.',
  'still-open': 'Not enough yet. Keep the question open.',
};

/** James can save only with his own outcome and a note he has written or kept. */
export function debriefReady(outcome: DebriefOutcome | null, note: string): boolean {
  return outcome !== null && note.trim().length > 0;
}

/** Step 5: the evidence, Relay's bounded reading, and James's own conclusion. */
export function DebriefScreen({ interview, onEvent }: Props) {
  const [outcome, setOutcome] = useState<DebriefOutcome | null>(null);
  const [note, setNote] = useState('');
  const ready = debriefReady(outcome, note);

  return (
    <GuideScreen
      eyebrow="Debrief · your open question"
      headline={interview.openQuestion}
      why={`Relay can show what ${jeremy}’s answer covers. Only you can decide what it means.`}
      relay="listed what Jeremy’s words do and don’t address, each point linked to a timestamp. It doesn’t score, rank or recommend."
      next={`The debrief is saved for the hiring team. ${jeremy} hears that your notes are finished, not what they say.`}
      actions={
        <button
          className="pill"
          disabled={!ready}
          onClick={() =>
            outcome && onEvent({ type: 'interview-debriefed', outcome, note })
          }
        >
          Save debrief
        </button>
      }
    >
      <JeremysWords interview={interview} />
      <RelaysCoverage interview={interview} />

      <section className="debrief-part conclusion" aria-label="Your conclusion">
        <header>
          <span className="part-n">3</span>
          <h3>Your conclusion</h3>
          <p className="tag human-tag">
            <span className="initials">{people.recruiter.initials}</span> Yours to decide
          </p>
        </header>
        <div className="outcomes" role="radiogroup" aria-label="Debrief outcome">
          {(Object.keys(debriefOutcomeLabel) as DebriefOutcome[]).map((o) => (
            <button
              key={o}
              role="radio"
              aria-checked={outcome === o}
              className={`choice ${outcome === o ? 'selected' : ''}`}
              onClick={() => setOutcome(o)}
            >
              <strong>{debriefOutcomeLabel[o]}</strong>
              <span className="plan-why">{outcomeHelp[o]}</span>
            </button>
          ))}
        </div>
        <div className="editor">
          <label className="meta" htmlFor="debrief-note">
            Your note · required
          </label>
          <textarea
            id="debrief-note"
            value={note}
            rows={3}
            placeholder="What did you learn, and what should the next interviewer pick up?"
            onChange={(e) => setNote(e.target.value)}
          />
          {outcome && !note.trim() && (
            <button
              className="text-button"
              onClick={() => setNote(debriefNoteStarters[outcome])}
            >
              Use demo wording
            </button>
          )}
        </div>
      </section>
    </GuideScreen>
  );
}

/** Step 6: the one artifact the Interview stage leaves behind. */
export function SavedScreen({
  interview,
  onReplay,
}: {
  interview: RecruiterInterviewView;
  onReplay: () => void;
}) {
  const debrief = interview.debrief;
  if (!debrief) return null;
  return (
    <GuideScreen
      eyebrow={`Debrief saved · ${debrief.time}`}
      headline="One record, every voice labelled."
      why="Everything the hiring team needs on this question, in one place, and nothing decided for them."
      relay="kept each voice separate: Jeremy’s checked words, its own coverage note, and James’s conclusion."
      next="Offer and Reconnect are later stages in this concept. They aren’t built yet."
      actions={
        <button className="pill" onClick={onReplay}>
          Replay from the start
        </button>
      }
    >
      <article className="debrief-card" aria-label="Interview debrief">
        <header>
          <p className="eyebrow">
            Interview debrief · {people.candidate.name} · {interviewCall.when}
          </p>
          <span className={`outcome ${debrief.outcome}`}>
            {debriefOutcomeLabel[debrief.outcome]}
          </span>
        </header>
        <div className="debrief-question">
          <p className="tag uncertainty-tag">Open question · carried from Apply</p>
          <h3>{interview.openQuestion}</h3>
        </div>
        <div className="human-note">
          <span className="initials">{people.recruiter.initials}</span>
          <div>
            <p className="meta">
              {people.recruiter.name}’s conclusion · {debrief.time}
            </p>
            <p>{debrief.note}</p>
          </div>
        </div>
        <JeremysWords interview={interview} />
        <RelaysCoverage interview={interview} />
        <footer className="no-decision">
          Relay made no hiring decision. {jeremy}’s words are quoted exactly as he checked
          them; the conclusion is {people.recruiter.first}’s.
        </footer>
      </article>
    </GuideScreen>
  );
}
