import { useState } from 'react';
import type { RelayEvent } from '../relay/events';
import { claimTemplates, confidenceLabel, people } from '../relay/fixtures';
import type {
  Answer,
  Claim,
  OpenQuestionStatus,
  RecruiterView,
  RelayState,
} from '../relay/reduce';
import { Mark } from './Mark';

interface Props {
  state: RelayState;
  view: RecruiterView;
  myTurn: boolean;
  onEvent: (event: RelayEvent) => void;
}

const briefLabel = {
  strength: 'Strength',
  discuss: 'Discuss',
  ask: 'Ask',
  open: 'Unresolved',
};

const openQuestionTag: Record<OpenQuestionStatus, string> = {
  'from-application': 'Open question · from the application',
  rescoped: 'Open question · re-scoped by Jeremy’s answer',
  'needs-human-reading':
    'Open question · Jeremy answered in his own words; Relay hasn’t interpreted it',
  'unmapped-context': 'Unmapped context · needs human reading',
  unresolved: 'Open question · left unresolved by James',
  'resolved-by-james': 'Open question · James accepted Jeremy’s own answer',
};

export function RecruiterWorkspace({ state, view, myTurn, onEvent }: Props) {
  const drafting = state.stage === 'clarify';

  return (
    <section className="surface james" aria-label="James’s recruiter workspace">
      <header className="surface-head">
        <div>
          <p className="eyebrow">
            Recruiter workspace · {people.employer} · {people.recruiter.name}
          </p>
          <h2>{people.candidate.name}</h2>
          <p className="sub">
            {people.role} · {people.location}
          </p>
        </div>
        {myTurn && <span className="turn">Your turn · {view.toReview} to review</span>}
      </header>

      <section className="block">
        <h4 className="block-title">What changed</h4>
        {view.signals.length === 0 ? (
          <p className="empty">Nothing new from Jeremy since you last looked.</p>
        ) : (
          <ul className="signals">
            {view.signals.map((s, i) => (
              <li key={`${s.seq}-${i}`} className={i === 0 ? 'fresh' : ''}>
                <time>{s.time}</time>
                <span>{s.text}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={`open-question ${view.openQuestion.status}`}>
        <p className="tag uncertainty-tag">{openQuestionTag[view.openQuestion.status]}</p>
        <p>{view.openQuestion.text}</p>
      </section>

      <section className="block">
        <h4 className="block-title">
          Potential{' '}
          <span className="muted">· transferable skills from Jeremy’s words</span>
        </h4>
        {view.claims.length === 0 && !drafting && !view.unmappedContext && (
          <p className="empty">
            When Jeremy shares context, Relay links his words to this role here. You
            decide what counts.
          </p>
        )}
        {drafting && (
          <div className="drafting">
            <p className="tag relay-tag">
              <Mark size={16} /> Relay is waiting on one answer from Jeremy
            </p>
            <ul>
              {view.claims.map((c) => (
                <li key={c.id}>{c.skill}</li>
              ))}
            </ul>
          </div>
        )}
        {state.stage === 'review' && (
          <div className="ledger">
            {view.unmappedContext && (
              <UnmappedContextCard
                context={view.unmappedContext}
                note={state.note}
                onEvent={onEvent}
              />
            )}
            {view.claims.map((c) => (
              <ClaimCard
                key={`${c.id}-${c.status}`}
                claim={c}
                answer={c.id === view.answerTarget ? view.answer : undefined}
                onEvent={onEvent}
              />
            ))}
          </div>
        )}
      </section>

      {view.brief.length > 0 && (
        <section className="block brief">
          <h4 className="block-title">Interview brief</h4>
          <ul>
            {view.brief.map((b, i) => (
              <li key={`${b.kind}-${b.text}`} className={b.kind}>
                <span className="brief-kind">{briefLabel[b.kind]}</span>
                <span>{b.text}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}

function UnmappedContextCard({
  context,
  note,
  onEvent,
}: {
  context: NonNullable<RecruiterView['unmappedContext']>;
  note: RelayState['note'];
  onEvent: (event: RelayEvent) => void;
}) {
  const [asking, setAsking] = useState(false);
  const [question, setQuestion] = useState('');
  const needsReading = context.status === 'needs-human-reading';

  return (
    <article className={`claim ${context.status} uninterpreted`}>
      <div className="claim-top">
        <p className={`tag ${needsReading ? 'relay-tag' : 'human-tag'}`}>
          {needsReading && 'Candidate-provided context · needs your reading'}
          {context.status === 'accepted' && 'Accepted by James as written'}
          {context.status === 'unresolved' && 'Left unresolved by James'}
          {context.status === 'awaiting-jeremy' && 'Question sent · waiting for Jeremy'}
        </p>
        <span className="confidence uninterpreted">Not interpreted by Relay</span>
      </div>
      <h3>Unmapped context</h3>
      <p className="maps">Relay did not map this to a role-specific claim.</p>
      {note && (
        <figure className="evidence">
          <figcaption>Jeremy’s words · not interpreted by Relay</figcaption>
          <blockquote className="voice">{note.text}</blockquote>
        </figure>
      )}
      {context.question && (
        <p className="sent-question">
          <span className="meta">James asked</span> {context.question}
        </p>
      )}
      {context.followUp && (
        <figure className="evidence reply">
          <figcaption>Jeremy replied · {context.followUp.time}</figcaption>
          <blockquote className="voice">{context.followUp.text}</blockquote>
        </figure>
      )}
      {needsReading && !asking && (
        <div className="claim-actions">
          <button
            className="pill"
            onClick={() => onEvent({ type: 'unmapped-context-accepted' })}
          >
            Accept as candidate-provided context
          </button>
          <button className="ghost" onClick={() => setAsking(true)}>
            Ask a follow-up
          </button>
          <button
            className="ghost"
            onClick={() => onEvent({ type: 'unmapped-context-left-unresolved' })}
          >
            Leave unresolved
          </button>
        </div>
      )}
      {asking && (
        <div className="editor">
          <p className="meta">
            Written and approved by you. Relay will send it as written.
          </p>
          <textarea
            value={question}
            rows={3}
            onChange={(event) => setQuestion(event.target.value)}
            aria-label="Question for Jeremy about his context"
          />
          <div className="claim-actions">
            <button className="ghost" onClick={() => setAsking(false)}>
              Cancel
            </button>
            <button
              className="pill"
              disabled={!question.trim()}
              onClick={() => {
                onEvent({ type: 'unmapped-context-followup-sent', question });
                setAsking(false);
              }}
            >
              Approve & send to Jeremy
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

type Mode = 'idle' | 'correct' | 'ask';

function ClaimCard({
  claim,
  answer,
  onEvent,
}: {
  claim: Claim;
  /** Jeremy's answer to the clarifying question, when this claim was its subject. */
  answer?: Answer;
  onEvent: (e: RelayEvent) => void;
}) {
  const template = claimTemplates.find((t) => t.id === claim.id);
  const [mode, setMode] = useState<Mode>('idle');
  const [draft, setDraft] = useState('');
  const open = (next: Mode) => {
    setDraft(
      next === 'correct'
        ? (template?.correctionNote ?? '')
        : (template?.draftQuestion ?? ''),
    );
    setMode(next);
  };
  const decided =
    claim.status === 'accepted' ||
    claim.status === 'corrected' ||
    claim.status === 'unresolved';
  // Jeremy's own-words answer: only a person can read it, so Relay's actions are withheld.
  const ownWords = claim.confidence === 'uninterpreted';
  const awaitingReading =
    ownWords && (claim.status === 'needs-review' || claim.status === 'unresolved');
  const canEdit = claim.status === 'needs-review' || awaitingReading;

  return (
    <article className={`claim ${claim.status} ${claim.confidence}`}>
      <div className="claim-top">
        <p className={`tag ${decided ? 'human-tag' : 'relay-tag'}`}>
          {claim.status === 'accepted' && (
            <>
              <span className="initials">{people.recruiter.initials}</span> Accepted by
              James
            </>
          )}
          {claim.status === 'corrected' && (
            <>
              <span className="initials">{people.recruiter.initials}</span> James’s note
              replaces Relay’s reading
            </>
          )}
          {claim.status === 'unresolved' && (
            <>
              <span className="initials">{people.recruiter.initials}</span> Left
              unresolved by James
            </>
          )}
          {claim.status === 'awaiting-jeremy' && 'Question sent · waiting for Jeremy'}
          {claim.status === 'needs-review' &&
            (ownWords ? 'Needs your reading' : 'Relay inference · needs your review')}
        </p>
        <span className={`confidence ${claim.confidence}`}>
          {confidenceLabel[claim.confidence]}
        </span>
      </div>

      <h3 className={claim.status === 'corrected' ? 'replaced' : ''}>{claim.skill}</h3>
      <p className="maps">
        <span aria-hidden="true">→</span> {claim.roleNeed}
      </p>

      <figure className="evidence">
        <figcaption>Jeremy’s words</figcaption>
        <blockquote className="voice">“…{claim.evidence}…”</blockquote>
      </figure>

      {answer && (
        <figure className={`evidence answer ${answer.custom ? 'custom' : ''}`}>
          <figcaption>
            {answer.custom
              ? 'Jeremy’s answer, in his own words · not interpreted by Relay'
              : 'Jeremy’s answer to Relay’s question'}{' '}
            · {answer.time}
          </figcaption>
          <blockquote className="voice">{answer.text}</blockquote>
        </figure>
      )}

      {claim.humanNote && (
        <div className="human-note">
          <span className="initials">{people.recruiter.initials}</span>
          <p>{claim.humanNote}</p>
        </div>
      )}

      {claim.question && (
        <p className="sent-question">
          <span className="meta">James asked</span> {claim.question}
        </p>
      )}

      {claim.followUp && (
        <figure className="evidence reply">
          <figcaption>Jeremy replied · {claim.followUp.time}</figcaption>
          <blockquote className="voice">{claim.followUp.text}</blockquote>
        </figure>
      )}

      {awaitingReading && mode === 'idle' && (
        <div className="claim-actions">
          <button
            className="pill"
            onClick={() => onEvent({ type: 'custom-answer-accepted', claimId: claim.id })}
          >
            Accept his answer
          </button>
          <button className="ghost" onClick={() => open('ask')}>
            Ask a follow-up
          </button>
          {claim.status === 'needs-review' && (
            <button
              className="ghost"
              onClick={() =>
                onEvent({ type: 'claim-left-unresolved', claimId: claim.id })
              }
            >
              Leave unresolved
            </button>
          )}
        </div>
      )}

      {claim.status === 'needs-review' && !ownWords && mode === 'idle' && (
        <div className="claim-actions">
          <button
            className="pill"
            onClick={() => onEvent({ type: 'claim-accepted', claimId: claim.id })}
          >
            Accept
          </button>
          <button className="ghost" onClick={() => open('correct')}>
            Correct
          </button>
          <button className="ghost" onClick={() => open('ask')}>
            Ask Jeremy
          </button>
        </div>
      )}

      {mode !== 'idle' && canEdit && (
        <div className="editor">
          <p className="meta">
            {mode === 'correct'
              ? 'Your note replaces Relay’s reading. Jeremy’s words stay as written.'
              : ownWords
                ? 'A starting draft only. Relay hasn’t interpreted his answer, so edit it to fit.'
                : 'Drafted by Relay. Edit it, then approve to send.'}
          </p>
          <textarea
            value={draft}
            rows={3}
            onChange={(e) => setDraft(e.target.value)}
            aria-label={mode === 'correct' ? 'Correction note' : 'Question for Jeremy'}
          />
          <div className="claim-actions">
            <button className="ghost" onClick={() => setMode('idle')}>
              Cancel
            </button>
            <button
              className="pill"
              disabled={!draft.trim()}
              onClick={() => {
                onEvent(
                  mode === 'correct'
                    ? { type: 'claim-corrected', claimId: claim.id, note: draft }
                    : { type: 'clarification-sent', claimId: claim.id, question: draft },
                );
                setMode('idle');
              }}
            >
              {mode === 'correct' ? 'Save note' : 'Approve & send to Jeremy'}
            </button>
          </div>
        </div>
      )}

      <details className="provenance">
        <summary>How Relay got here</summary>
        <ol>
          {claim.history.map((h, i) => (
            <li key={i} className={h.actor}>
              <time>{h.time}</time> {h.text}
            </li>
          ))}
        </ol>
      </details>
    </article>
  );
}
