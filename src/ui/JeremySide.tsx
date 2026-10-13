import { useState } from 'react';
import type { RelayEvent } from '../relay/events';
import {
  callSlot,
  clarification,
  conciergePrompt,
  interviewCall,
  interviewSlots,
  offerFacts,
  offerPresets,
  people,
  scriptedNote,
  slotLabel,
  type OfferFactId,
  type SlotId,
} from '../relay/fixtures';
import {
  awaitingJames,
  awaitingJeremy,
  type OfferQuestion,
  type RelayState,
} from '../relay/reduce';
import { Card, Who } from './Pane';

interface Props {
  state: RelayState;
  onEvent: (event: RelayEvent) => void;
  onAsk: (question: string, suggested: boolean) => void;
  asking: boolean;
}

const { recruiter: james } = people;

/** Jeremy's portal. He sees his own words, the process, and never the team's reading. */
export function JeremySide(props: Props) {
  const { state } = props;
  switch (state.step) {
    case 'share':
      return <Share {...props} />;
    case 'clarify':
      return <Clarify {...props} />;
    case 'brief':
      return (
        <Status
          title={`Shared with ${james.first}, exactly as you wrote it.`}
          next={`${james.first} is reading it now. You’ll hear from him, not a bot, by Friday.`}
          state={state}
        />
      );
    case 'book':
      return <Book {...props} />;
    case 'call':
      return <InCall state={state} />;
    case 'recap':
      return <Recap {...props} />;
    case 'debrief':
      return (
        <Status
          title="Thanks. Your reply is with James."
          next={`He’ll be in touch by ${interviewCall.decisionBy}.`}
          state={state}
        />
      );
    case 'held':
      return (
        <Status
          title={`${james.first} would like one more conversation.`}
          next="It’s not a no. He’ll send times for a second interview this week."
          state={state}
        />
      );
    default:
      return <Offer {...props} />;
  }
}

function Share({ onEvent }: Props) {
  const [text, setText] = useState(scriptedNote);
  return (
    <Card task>
      <Who who="relay">Relay, for {people.employer}</Who>
      <h3>{conciergePrompt}</h3>
      <p className="small">
        {james.name} reads this himself, word for word. Edit it however you like.
      </p>
      <textarea
        className="voice"
        rows={7}
        value={text}
        maxLength={2000}
        aria-label="Your note to James"
        onChange={(e) => setText(e.target.value)}
      />
      <div className="actions">
        <button
          className="pill"
          disabled={!text.trim()}
          onClick={() => onEvent({ type: 'note-shared', text })}
        >
          Share with {james.first}
        </button>
      </div>
    </Card>
  );
}

function Clarify({ onEvent }: Props) {
  const [choice, setChoice] = useState<(typeof clarification.answers)[number] | null>(
    null,
  );
  const [text, setText] = useState('');
  const [editing, setEditing] = useState(false);
  const pick = (a: (typeof clarification.answers)[number]) => {
    setChoice(a);
    setText(a.text);
    setEditing(false);
  };
  return (
    <Card task>
      <Who who="relay">One question from Relay</Who>
      <h3>{clarification.question}</h3>
      <p className="small">So James reads your note the way you meant it.</p>
      <div className="options" role="radiogroup" aria-label="Your answer">
        {clarification.answers.map((a) => (
          <button
            key={a.id}
            role="radio"
            aria-checked={choice?.id === a.id}
            className={`option ${choice?.id === a.id ? 'selected' : ''}`}
            onClick={() => pick(a)}
          >
            <span className="option-label">{a.label}</span>
            <span className="voice">{a.text}</span>
          </button>
        ))}
      </div>
      {editing && (
        <textarea
          className="voice"
          rows={3}
          value={text}
          maxLength={1000}
          aria-label="Your answer in your own words"
          autoFocus
          onChange={(e) => setText(e.target.value)}
        />
      )}
      <div className="actions">
        {choice && !editing && (
          <button className="text-button" onClick={() => setEditing(true)}>
            Put it in my own words
          </button>
        )}
        <button
          className="pill"
          disabled={!choice || !text.trim()}
          onClick={() =>
            choice &&
            onEvent({ type: 'clarification-answered', answerId: choice.id, text })
          }
        >
          Send
        </button>
      </div>
    </Card>
  );
}

function Book({ state, onEvent }: Props) {
  const [slot, setSlot] = useState<SlotId | null>(null);
  const plan = state.interview?.plan;
  if (!plan) return null;
  return (
    <Card task>
      <Who who="james">
        {james.first} would like to talk · {interviewCall.length}
      </Who>
      <h3>Pick a time for your interview.</h3>
      <p className="topic">
        <span className="meta">What it’s about</span>
        {plan.prep}
      </p>
      <div className="slots" role="radiogroup" aria-label="Interview times">
        {interviewSlots.map((s) => (
          <button
            key={s.id}
            role="radio"
            aria-checked={slot === s.id}
            className={`option slot ${slot === s.id ? 'selected' : ''}`}
            onClick={() => setSlot(s.id)}
          >
            {slotLabel(s)}
          </button>
        ))}
      </div>
      <p className="small">
        Relay takes notes in the call so {james.first} can listen. You’ll get the recap.
      </p>
      <div className="actions">
        <button
          className="pill"
          disabled={!slot}
          onClick={() => slot && onEvent({ type: 'interview-booked', slotId: slot })}
        >
          Book it
        </button>
      </div>
    </Card>
  );
}

function InCall({ state }: { state: RelayState }) {
  const interview = state.interview;
  if (!interview?.slot) return null;
  return (
    <Card>
      <p className="live-dot">In the call · {slotLabel(interview.slot)}</p>
      <h3>You’re talking with {james.first}.</h3>
      <p className="topic">
        <span className="meta">What it’s about</span>
        {interview.plan.prep}
      </p>
      <p className="small">
        Relay is taking notes. Nothing is shared until the call ends.
      </p>
    </Card>
  );
}

function Recap({ state, onEvent }: Props) {
  const followUp = state.interview?.followUp;
  const [choice, setChoice] = useState<'reply' | 'none' | null>(null);
  const [text, setText] = useState(followUp?.scriptedReply ?? '');
  if (!followUp) return null;
  return (
    <Card task>
      <Who who="relay">Recap from Relay</Who>
      <h3>Thanks for talking with {james.first}.</h3>
      <p className="small">
        He’ll decide by {interviewCall.decisionBy}. One thing there wasn’t time for:
      </p>
      <p className="ask">{followUp.question}</p>
      <div className="options" role="radiogroup" aria-label="Your reply">
        <button
          role="radio"
          aria-checked={choice === 'reply'}
          className={`option ${choice === 'reply' ? 'selected' : ''}`}
          onClick={() => setChoice('reply')}
        >
          <span className="option-label">Reply · edit it below if you like</span>
          {choice !== 'reply' && <span className="voice">{text}</span>}
        </button>
        {choice === 'reply' && (
          <textarea
            className="voice"
            rows={4}
            value={text}
            maxLength={1000}
            aria-label="Your reply to James"
            onChange={(e) => setText(e.target.value)}
          />
        )}
        <button
          role="radio"
          aria-checked={choice === 'none'}
          className={`option ${choice === 'none' ? 'selected' : ''}`}
          onClick={() => setChoice('none')}
        >
          <span className="option-label">Nothing to add</span>
        </button>
      </div>
      <div className="actions">
        <button
          className="pill"
          disabled={!choice || (choice === 'reply' && !text.trim())}
          onClick={() =>
            onEvent(
              choice === 'reply'
                ? { type: 'follow-up-answered', text }
                : { type: 'follow-up-answered' },
            )
          }
        >
          {choice === 'none' ? 'Done' : `Send to ${james.first}`}
        </button>
      </div>
    </Card>
  );
}

/** Between tasks: what happened, what's next, and his own words as James has them. */
function Status({
  title,
  next,
  state,
}: {
  title: string;
  next: string;
  state: RelayState;
}) {
  return (
    <>
      <Card>
        <h3>{title}</h3>
        <p className="small">{next}</p>
      </Card>
      <YourWords state={state} />
    </>
  );
}

function YourWords({ state }: { state: RelayState }) {
  const words = [
    state.note && { label: 'Your note', text: state.note.text },
    state.answer && { label: 'Your answer', text: state.answer.text },
    state.interview?.reply && {
      label: 'After the call',
      text: state.interview.reply.text,
    },
  ].filter((w): w is { label: string; text: string } => !!w);
  if (!words.length) return null;
  return (
    <details className="card quiet words">
      <summary>What {james.first} has from you · word for word</summary>
      {words.map((w) => (
        <div key={w.label}>
          <p className="meta">{w.label}</p>
          <p className="voice">{w.text}</p>
        </div>
      ))}
    </details>
  );
}

// ---------- Offer ----------

const sheet: { id: OfferFactId; wide?: boolean }[] = [
  { id: 'base' },
  { id: 'equity' },
  { id: 'startWindow' },
  { id: 'workModel' },
  { id: 'firstYear', wide: true },
  { id: 'onboarding', wide: true },
];

function Offer({ state, onEvent, onAsk, asking }: Props) {
  const [own, setOwn] = useState('');
  const questions = state.offer?.questions ?? [];
  const asked = new Set(questions.map((q) => q.text));
  const full = questions.length >= 4;
  const waiting = awaitingJames(state).length + awaitingJeremy(state).length;
  const done = state.step === 'done';

  return (
    <>
      <Card>
        <Who who="relay">From {people.employer}</Who>
        <h3>Your offer is here.</h3>
        <dl className="offer-sheet" aria-label="Offer terms">
          <div className="wide">
            <dt>Role</dt>
            <dd>{offerFacts.role.value}</dd>
          </div>
          {sheet.map(({ id, wide }) => (
            <div key={id} className={wide ? 'wide' : ''}>
              <dt>{offerFacts[id].label}</dt>
              <dd>{offerFacts[id].value}</dd>
            </div>
          ))}
        </dl>
        <p className="small">Reply by {offerFacts.replyBy.value}.</p>
      </Card>

      {questions.length > 0 && (
        <ol className="thread" aria-label="Your questions">
          {questions.map((q) => (
            <QuestionThread key={q.id} q={q} onEvent={onEvent} />
          ))}
        </ol>
      )}

      {!done && (
        <Card task={!waiting}>
          <h3 className="ask-title">
            {questions.length ? 'Anything else?' : 'Questions about the offer?'}
          </h3>
          <p className="small">
            Relay answers from the offer itself, straight away. {james.first} answers pay
            and anything personal.
          </p>
          {!full && (
            <div className="ask-box">
              <div className="suggested">
                {offerPresets
                  .filter((p) => !asked.has(p.question))
                  .map((p) => (
                    <button
                      key={p.id}
                      className="chip"
                      disabled={asking}
                      onClick={() => onAsk(p.question, true)}
                    >
                      {p.question}
                    </button>
                  ))}
              </div>
              <div className="field-row">
                <textarea
                  rows={1}
                  value={own}
                  maxLength={500}
                  placeholder="Or ask in your own words"
                  aria-label="Ask in your own words"
                  onChange={(e) => setOwn(e.target.value)}
                />
                <button
                  className="ghost"
                  disabled={!own.trim() || asking}
                  onClick={() => {
                    onAsk(own, false);
                    setOwn('');
                  }}
                >
                  {asking ? 'Checking…' : 'Ask'}
                </button>
              </div>
            </div>
          )}
          {questions.length > 0 && !waiting && !asking && (
            <div className="actions">
              <button
                className="pill"
                onClick={() => onEvent({ type: 'offer-finished' })}
              >
                I have what I need for now
              </button>
            </div>
          )}
        </Card>
      )}
    </>
  );
}

const sourceNote = (q: OfferQuestion) =>
  q.assist.mode === 'live'
    ? 'checked live'
    : q.assist.status === 'provider-error'
      ? 'live check unavailable, offline triage'
      : 'offline triage';

function QuestionThread({ q, onEvent }: { q: OfferQuestion; onEvent: Props['onEvent'] }) {
  const ack = (outcome: 'answered' | 'wants-call' | 'call-accepted') =>
    onEvent({ type: 'offer-reply-acknowledged', questionId: q.id, outcome });
  return (
    <li className="qa" data-task={(q.reply && !q.outcome) || undefined}>
      <p className="voice">{q.text}</p>
      {q.owner === 'relay' ? (
        <div className="qa-answer">
          <Who who="relay">
            Relay · from your offer:{' '}
            {q.assist.factsUsed.map((f) => offerFacts[f].label.toLowerCase()).join(', ')}
          </Who>
          <p>{q.assist.answer}</p>
          <p className="qa-meta">
            <span className="meta">{sourceNote(q)}</span>
            <button
              className="text-button"
              onClick={() => onEvent({ type: 'offer-sent-to-james', questionId: q.id })}
            >
              Ask {james.first} instead
            </button>
          </p>
        </div>
      ) : !q.reply ? (
        <div className="qa-answer pending">
          <Who who="james">With {james.first} · he’ll answer himself</Who>
          <p className="small">
            {q.movedByJeremy ? 'You asked for James’s answer.' : q.assist.reason}
          </p>
          {!q.movedByJeremy && <p className="meta">{sourceNote(q)}</p>}
        </div>
      ) : (
        <div className="qa-answer james">
          <Who who="james">{james.first} replied</Who>
          <p className="voice">{q.reply.text}</p>
          {q.outcome ? (
            <p className={`status ${q.outcome === 'answered' ? '' : 'open'}`}>
              {q.outcome === 'answered'
                ? 'You said this answers it'
                : `Still open · call booked for ${callSlot}`}
            </p>
          ) : q.reply.mode === 'call' ? (
            <div className="actions">
              <button className="pill" onClick={() => ack('call-accepted')}>
                Accept · {callSlot}
              </button>
            </div>
          ) : (
            <div className="actions">
              <button className="ghost" onClick={() => ack('wants-call')}>
                I’d like to talk it through
              </button>
              <button className="pill" onClick={() => ack('answered')}>
                That answers it
              </button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}
