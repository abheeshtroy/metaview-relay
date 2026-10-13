import { useState } from 'react';
import type { RelayEvent } from '../relay/events';
import {
  clarification,
  interviewPlans,
  offerFacts,
  people,
  resumeSummary,
  slotLabel,
  type DebriefOutcome,
  type OfferFactId,
  type QuestionId,
  type ReadingBasis,
} from '../relay/fixtures';
import { scriptedAssist } from '../relay/interviewAssist';
import {
  concernLabel,
  defaultReplyMode,
  replyDraft,
  type ReplyMode,
} from '../relay/offerAssist';
import {
  awaitingJames,
  planOptions,
  questionStatus,
  type OfferQuestion,
  type RelayState,
} from '../relay/reduce';
import { AnnotatedQuote } from './AnnotatedQuote';
import { Card, Who } from './Pane';
import { TranscriptQuote } from './TranscriptQuote';

interface Props {
  state: RelayState;
  onEvent: (event: RelayEvent) => void;
  onUndo: () => void;
}

const { candidate: jeremy } = people;

/** James's workspace. It shows only what needs him, with the evidence behind it. */
export function JamesSide(props: Props) {
  const { state } = props;
  switch (state.step) {
    case 'share':
      return <Application state={state} />;
    case 'clarify':
      return <Reading state={state} />;
    case 'brief':
      return <Brief {...props} />;
    case 'book':
      return <Invited state={state} />;
    case 'call':
      return <Call {...props} />;
    case 'recap':
      return <Drafting state={state} />;
    case 'debrief':
      return <Debrief {...props} />;
    case 'held':
      return <Held {...props} />;
    default:
      return <Close {...props} />;
  }
}

function OpenQuestion({ state }: { state: RelayState }) {
  return (
    <div className="open-q">
      <p className="meta">Still open</p>
      <p className="open-q-text">{state.openQuestion}</p>
      {state.openBecause && <p className="small">{state.openBecause}</p>}
    </div>
  );
}

function Application({ state }: { state: RelayState }) {
  return (
    <Card>
      <Who who="relay">New application</Who>
      <h3>
        {jeremy.name} applied for {people.role}.
      </h3>
      <p className="small">{resumeSummary}</p>
      <OpenQuestion state={state} />
      <p className="waiting">
        Relay asked {jeremy.first} what his résumé misses. Nothing needs you yet.
      </p>
    </Card>
  );
}

const basisLabel: Record<ReadingBasis, string> = {
  note: 'From his note',
  answer: 'Confirmed by his answer',
  narrowed: 'Narrowed by his answer',
  unread: 'Read his answer',
};

function Readings({ state }: { state: RelayState }) {
  if (!state.readings.length) return null;
  return (
    <ul className="readings" aria-label="What his words support">
      {state.readings.map((r) => (
        <li key={r.id}>
          <strong>{r.skill}</strong>
          <span className={`basis ${r.basis}`}>{basisLabel[r.basis]}</span>
          <span className="small">
            {r.roleNeed} · “…{r.evidence}…”
          </span>
        </li>
      ))}
    </ul>
  );
}

function NoteQuote({ state }: { state: RelayState }) {
  if (!state.note) return null;
  return (
    <div className="quote-block">
      <Who who="jeremy">
        {jeremy.first}’s note · word for word
        {state.note.edited ? ' · his own wording' : ''}
      </Who>
      <AnnotatedQuote
        text={state.note.text}
        phrases={state.readings.map((r) => r.evidence)}
      />
    </div>
  );
}

function Reading({ state }: { state: RelayState }) {
  return (
    <Card>
      <NoteQuote state={state} />
      <Readings state={state} />
      <p className="waiting">
        Relay is checking one thing with {jeremy.first} first: “{clarification.question}”
      </p>
    </Card>
  );
}

function Brief({ state, onEvent }: Props) {
  const options = planOptions(state);
  const [picked, setPicked] = useState<QuestionId | null>(
    options.length === 1 ? options[0] : null,
  );
  const plan = picked ? interviewPlans[picked] : undefined;
  return (
    <Card task>
      <Who who="relay">Brief · built from {jeremy.first}’s words</Who>
      <h3>
        {options.length === 1
          ? 'Brief ready. One thing for the interview to settle.'
          : 'Brief ready. Choose what to ask in the interview.'}
      </h3>
      <OpenQuestion state={state} />

      <div className="field">
        <Who who="relay">
          {options.length === 1 ? 'Suggested interview question' : 'Pick a question'}
        </Who>
        <div className="options" role="radiogroup" aria-label="Interview question">
          {options.map((id) => (
            <button
              key={id}
              role="radio"
              aria-checked={picked === id}
              className={`option ${picked === id ? 'selected' : ''}`}
              onClick={() => setPicked(id)}
            >
              <strong>“{interviewPlans[id].question}”</strong>
              <span className="small">{interviewPlans[id].why}</span>
            </button>
          ))}
        </div>
        {plan && (
          <p className="small">
            <strong>{jeremy.first} sees only the topic:</strong> {plan.prep}
          </p>
        )}
      </div>
      <div className="actions">
        <button
          className="pill"
          disabled={!picked}
          onClick={() =>
            picked && onEvent({ type: 'interview-invited', questionId: picked })
          }
        >
          Invite {jeremy.first} to interview
        </button>
      </div>
      <div className="evidence">
        <p className="meta">What the brief rests on</p>
        <NoteQuote state={state} />
        {state.answer && (
          <div className="quote-block">
            <Who who="jeremy">
              His answer to Relay
              {state.answer.edited ? ' · his own words, not interpreted' : ''}
            </Who>
            <p className="voice">{state.answer.text}</p>
          </div>
        )}
        <Readings state={state} />
      </div>
    </Card>
  );
}

function Invited({ state }: { state: RelayState }) {
  const plan = state.interview?.plan;
  if (!plan) return null;
  return (
    <Card>
      <h3>Invite sent.</h3>
      <p className="waiting">Waiting for {jeremy.first} to pick a time.</p>
      <div className="quote-block">
        <Who who="james">Your planned question</Who>
        <p className="planned">“{plan.question}”</p>
      </div>
    </Card>
  );
}

function Call({ state, onEvent }: Props) {
  const interview = state.interview;
  if (!interview?.slot) return null;
  const { plan, excerpt } = interview;
  return (
    <Card task>
      <p className="live-dot">In the call · {slotLabel(interview.slot)}</p>
      <h3>
        {excerpt ? 'End the call when you’re ready.' : 'Ask your question when it fits.'}
      </h3>
      {!excerpt && (
        <>
          <p className="planned">“{plan.question}”</p>
          <p className="small">Relay is taking notes, so you can just listen.</p>
          <div className="actions">
            <button
              className="pill"
              onClick={() =>
                onEvent({
                  type: 'call-question-asked',
                  excerpt: scriptedAssist.excerptFor(plan),
                })
              }
            >
              Ask it
            </button>
          </div>
        </>
      )}
      {excerpt && (
        <>
          <TranscriptQuote excerpt={excerpt} day={interview.slot.day} live />
          <div className="actions">
            <button
              className="pill"
              onClick={() =>
                onEvent({ type: 'call-ended', ...scriptedAssist.notesFor(plan) })
              }
            >
              End the call
            </button>
          </div>
        </>
      )}
    </Card>
  );
}

function Coverage({ state }: { state: RelayState }) {
  const coverage = state.interview?.coverage;
  if (!coverage) return null;
  return (
    <div className="coverage-cols">
      <div>
        <p className="coverage-head">His answer covers</p>
        <ul>
          {coverage.addresses.map((a) => (
            <li key={a.point}>
              {a.point}
              <time>{a.at}</time>
            </li>
          ))}
        </ul>
      </div>
      <div className="gaps">
        <p className="coverage-head">Leaves open</p>
        <ul>
          {coverage.notAddressed.map((g) => (
            <li key={g}>{g}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Drafting({ state }: { state: RelayState }) {
  const interview = state.interview;
  if (!interview?.excerpt || !interview.slot || !interview.followUp) return null;
  return (
    <Card>
      <h3>Your debrief is almost ready.</h3>
      <TranscriptQuote excerpt={interview.excerpt} day={interview.slot.day} />
      <Coverage state={state} />
      <p className="waiting">
        Relay asked {jeremy.first} about the gap: “{interview.followUp.question}” His
        reply goes into your debrief word for word.
      </p>
    </Card>
  );
}

function Debrief({ state, onEvent }: Props) {
  const interview = state.interview;
  const [outcome, setOutcome] = useState<DebriefOutcome | null>(null);
  const [note, setNote] = useState('');
  if (!interview?.excerpt || !interview.slot || !interview.followUp) return null;
  const { reply } = interview;
  return (
    <Card task>
      <Who who="relay">Debrief · from the call and his follow-up</Who>
      <h3>Did the interview answer your open question?</h3>
      <OpenQuestion state={state} />
      <Coverage state={state} />
      <div className="quote-block">
        <Who who="relay">Relay asked after the call</Who>
        <p>{interview.followUp.question}</p>
        {reply ? (
          <>
            <Who who="jeremy">
              His reply · word for word{reply.edited ? ' · his own wording' : ''}
            </Who>
            <p className="voice">{reply.text}</p>
          </>
        ) : (
          <p className="small">{jeremy.first} had nothing to add.</p>
        )}
      </div>

      <div className="field">
        <Who who="james">Your call</Who>
        <div className="options two" role="radiogroup" aria-label="Debrief outcome">
          <button
            role="radio"
            aria-checked={outcome === 'advance'}
            className={`option ${outcome === 'advance' ? 'selected' : ''}`}
            onClick={() => setOutcome('advance')}
          >
            <strong>Extend the offer</strong>
            <span className="small">Sends AutoFarm’s approved offer.</span>
          </button>
          <button
            role="radio"
            aria-checked={outcome === 'hold'}
            className={`option ${outcome === 'hold' ? 'selected' : ''}`}
            onClick={() => setOutcome('hold')}
          >
            <strong>Hold for another round</strong>
            <span className="small">Relay plans it around what’s still open.</span>
          </button>
        </div>
        <textarea
          rows={2}
          value={note}
          placeholder="Optional note for the hiring team"
          aria-label="Optional note for the hiring team"
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
      <div className="actions">
        <button
          className="pill"
          disabled={!outcome}
          onClick={() => outcome && onEvent({ type: 'debrief-decided', outcome, note })}
        >
          {outcome === 'hold' ? 'Hold' : 'Extend the offer'}
        </button>
      </div>
      <div className="evidence">
        <TranscriptQuote excerpt={interview.excerpt} day={interview.slot.day} />
      </div>
    </Card>
  );
}

function Held({ state, onUndo }: Props) {
  const interview = state.interview;
  return (
    <Card>
      <h3>Held for another round. No offer goes out.</h3>
      <div className="open-q">
        <p className="meta">For the next round</p>
        <ul className="gap-list">
          {interview?.coverage?.notAddressed.map((g) => (
            <li key={g}>{g}</li>
          ))}
        </ul>
      </div>
      {interview?.decision?.note && (
        <div className="quote-block">
          <Who who="james">Your note</Who>
          <p>{interview.decision.note}</p>
        </div>
      )}
      <div className="actions">
        <button className="ghost" onClick={onUndo}>
          Change the decision
        </button>
      </div>
    </Card>
  );
}

// ---------- Offer / Close ----------

/** Approved facts that cover the routine parts of a question James is answering. */
const routineFacts = (q: OfferQuestion): OfferFactId[] => {
  const byConcern: Partial<Record<string, OfferFactId>> = {
    'start-date': 'startWindow',
    'work-model': 'workModel',
    'role-scope': 'firstYear',
    timeline: 'replyBy',
  };
  return q.assist.concerns.flatMap((c) => byConcern[c] ?? []);
};

function Close({ state, onEvent }: Props) {
  const pending = awaitingJames(state);
  const questions = state.offer?.questions ?? [];
  const handled = questions.filter((q) => !pending.includes(q));
  const byRelay = questions.filter((q) => q.owner === 'relay').length;
  const openGap = state.interview?.coverage?.notAddressed[0];

  return (
    <>
      {pending.map((q) => (
        <Exception key={q.id} q={q} onEvent={onEvent} />
      ))}

      {pending.length === 0 && (
        <Card>
          <h3>{questions.length ? 'Nothing needs you.' : 'Nothing needs you yet.'}</h3>
          <p className="waiting">
            {questions.length
              ? `Relay answered ${byRelay} of ${jeremy.first}’s ${questions.length} question${questions.length === 1 ? '' : 's'} from the approved offer. Pay and anything personal come to you.`
              : `Relay answers ${jeremy.first}’s routine questions from the approved offer. Pay and anything personal come to you.`}
          </p>
        </Card>
      )}

      {handled.length > 0 && (
        <Card tone="quiet">
          <p className="meta">{jeremy.first}’s questions</p>
          <ul className="record">
            {handled.map((q) => (
              <li key={q.id}>
                <span className="voice">{q.text}</span>
                <span
                  className={`status ${q.outcome === 'wants-call' || q.outcome === 'call-accepted' ? 'open' : ''}`}
                >
                  {questionStatus(q)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {openGap && (
        <Card tone="open">
          <p className="meta">Carried from the interview</p>
          <p className="small">
            Still open: {openGap.charAt(0).toLowerCase() + openGap.slice(1)}. The approved
            onboarding pairs him with the inference platform lead for six weeks.
          </p>
        </Card>
      )}
    </>
  );
}

function Exception({ q, onEvent }: { q: OfferQuestion; onEvent: Props['onEvent'] }) {
  const [mode, setMode] = useState<ReplyMode>(() => defaultReplyMode(q.assist));
  const [text, setText] = useState(() =>
    replyDraft(q.assist, defaultReplyMode(q.assist)),
  );
  const pay = q.assist.concerns.includes('compensation');
  const facts = routineFacts(q);
  const choose = (m: ReplyMode) => {
    setMode(m);
    setText(replyDraft(q.assist, m));
  };
  return (
    <Card task>
      <Who who="jeremy">{jeremy.first} asked · his exact words</Who>
      <h3 className="voice question">{q.text}</h3>
      <p className="small">
        <strong>{q.assist.concerns.map((c) => concernLabel[c]).join(' · ')}.</strong>{' '}
        {q.movedByJeremy
          ? `${jeremy.first} asked for your answer rather than Relay’s.`
          : q.assist.reason}
        {pay && ` The approved base is ${offerFacts.base.value}.`}
      </p>
      {facts.length > 0 && (
        <p className="small">
          <strong>Approved facts that apply:</strong>{' '}
          {facts.map((f) => `${offerFacts[f].label}: ${offerFacts[f].value}`).join(' · ')}
        </p>
      )}
      <div className="mode" role="group" aria-label="How to reply">
        {(['written', 'call'] as const).map((m) => (
          <button key={m} aria-pressed={mode === m} onClick={() => choose(m)}>
            {m === 'written' ? 'Reply in writing' : 'Offer a call'}
          </button>
        ))}
      </div>
      <textarea
        rows={3}
        value={text}
        maxLength={2000}
        aria-label={`Your reply to: ${q.text}`}
        placeholder="The approved offer doesn’t cover this. Write your answer, or offer a call."
        onChange={(e) => setText(e.target.value)}
      />
      {mode === 'written' && pay && (
        <p className="caution">
          Relay’s draft says the base is fixed. Change it if that isn’t your answer.
        </p>
      )}
      <div className="actions">
        <button
          className="pill"
          disabled={!text.trim()}
          onClick={() =>
            onEvent({ type: 'offer-reply-sent', questionId: q.id, mode, text })
          }
        >
          Send to {jeremy.first}
        </button>
      </div>
    </Card>
  );
}
