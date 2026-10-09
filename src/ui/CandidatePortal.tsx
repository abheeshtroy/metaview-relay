import type { RelayEvent } from '../relay/events';
import {
  claimTemplates,
  clarification,
  conciergePrompt,
  people,
  scriptedNote,
} from '../relay/fixtures';
import type { CandidateView, RelayState } from '../relay/reduce';
import { AnnotatedQuote } from './AnnotatedQuote';
import { ChoiceComposer } from './ChoiceComposer';
import { Mark } from './Mark';

interface Props {
  state: RelayState;
  view: CandidateView;
  myTurn: boolean;
  /** Changes when the viewer starts from the intro; the Concierge pulses once. */
  nudge?: number;
  onEvent: (event: RelayEvent) => void;
}

const answerLabels = ['I operated it', 'I built the tooling'];

export function CandidatePortal({ state, view, myTurn, nudge = 0, onEvent }: Props) {
  const phrases = state.claims.map((c) => c.evidence);
  // The note itself is shown in the Concierge card; list everything else here.
  const otherWords = view.words.filter((w) => w !== state.note);
  // Deep green while Relay is working with Jeremy; quiet otherwise.
  const working = view.stage === 'invite' || view.stage === 'clarify';

  return (
    <section className="surface jeremy" aria-label="Jeremy’s candidate portal">
      <header className="surface-head">
        <div>
          <p className="eyebrow">Candidate portal · {people.employer}</p>
          <h2>Hi {people.candidate.first}</h2>
          <p className="sub">{people.role}</p>
        </div>
        {myTurn && <span className="turn">Your turn</span>}
      </header>

      <div
        key={view.status.headline}
        className={`status ${view.questions.length ? 'attention' : ''}`}
      >
        <span className="status-dot" aria-hidden="true" />
        <div>
          <strong>{view.status.headline}</strong>
          <p>{view.status.detail}</p>
        </div>
      </div>

      <article
        key={`concierge-${nudge}`}
        className={`concierge ${working ? 'working' : ''} ${nudge ? 'nudge' : ''}`}
      >
        <p className="tag relay-tag">
          <Mark size={16} /> Concierge
        </p>

        {view.stage === 'invite' && (
          <>
            <h3>{conciergePrompt}</h3>
            <p className="muted">
              Whatever you share goes to {people.recruiter.name} in your own words. Relay
              won’t rewrite it.
            </p>
            <ChoiceComposer
              choices={[{ id: 'note', text: scriptedNote }]}
              submitLabel="Share with James"
              hint="Suggested note for this demo"
              onSubmit={(_, text) => onEvent({ type: 'context-submitted', text })}
            />
          </>
        )}

        {view.stage === 'clarify' && state.note && (
          <>
            <AnnotatedQuote text={state.note.text} phrases={phrases} />
            {state.claims.length > 0 && (
              <ul className="noticed" aria-label="What Relay noticed">
                {state.claims.map((c, i) => (
                  <li key={c.id} style={{ animationDelay: `${300 + i * 260}ms` }}>
                    <span className="noticed-phrase">“{c.evidence}”</span>
                    <span className="arrow" aria-hidden="true">
                      →
                    </span>
                    {c.roleNeed}
                  </li>
                ))}
              </ul>
            )}
            <h3 className="question">{clarification.question}</h3>
            <ChoiceComposer
              choices={clarification.answers.map((a, i) => ({
                ...a,
                label: answerLabels[i],
              }))}
              submitLabel="Send answer"
              hint="Either answer is a good answer"
              editNote="If you change the wording, Relay won’t interpret your answer. James will read it himself, exactly as you wrote it."
              onSubmit={(answerId, text) =>
                onEvent({ type: 'clarification-answered', answerId, text })
              }
            />
          </>
        )}

        {view.stage === 'review' && state.note && (
          <>
            <h3>Shared with {people.recruiter.first}, exactly as you wrote it.</h3>
            <p className="muted">Recruiters can’t edit your words.</p>
            <AnnotatedQuote text={state.note.text} phrases={phrases} />
          </>
        )}
      </article>

      {view.questions.map((q) => {
        const unmapped = 'unmapped' in q;
        const template = unmapped
          ? undefined
          : claimTemplates.find((t) => t.id === q.claimId);
        return (
          <article
            key={unmapped ? 'unmapped-context' : q.claimId}
            className="human-question"
          >
            <p className="tag human-tag">
              <span className="initials">{people.recruiter.initials}</span>
              {people.recruiter.name} · written and approved by a person
            </p>
            <h3>{q.question}</h3>
            <ChoiceComposer
              choices={[
                {
                  id: unmapped ? 'unmapped-context' : q.claimId,
                  text: template?.scriptedFollowUp ?? '',
                },
              ]}
              submitLabel="Reply to James"
              hint={
                unmapped ? 'Reply in your own words' : 'Suggested reply for this demo'
              }
              freeform={unmapped}
              onSubmit={(_, text) => {
                if (unmapped) {
                  onEvent({ type: 'unmapped-context-followup-answered', text });
                } else {
                  onEvent({ type: 'followup-answered', claimId: q.claimId, text });
                }
              }}
            />
          </article>
        );
      })}

      {view.understood.length > 0 && (
        <section className="block">
          <h4 className="block-title">How the team understood you</h4>
          <ul className="understood">
            {view.understood.map((u) => (
              <li key={`${u.id}-${u.state}`} className={u.state}>
                <strong>{u.skill}</strong>
                <span>{u.message}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {otherWords.length > 0 && (
        <section className="block">
          <h4 className="block-title">
            Your other replies{' '}
            <span className="muted">· recruiters can’t edit these</span>
          </h4>
          <ul className="words">
            {otherWords.map((w) => (
              <li key={`${w.label}-${w.time}`}>
                <p className="meta">
                  {w.label} · {w.time}
                  {w.edited && ' · edited by you'}
                </p>
                <p className="voice">{w.text}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}
