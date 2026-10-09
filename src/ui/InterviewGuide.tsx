import type { RelayEvent } from '../relay/events';
import { interviewCall, people } from '../relay/fixtures';
import { scriptedAssist } from '../relay/interviewAssist';
import {
  chosenQuestion,
  type CandidateView,
  type InterviewPhase,
  type RecruiterView,
  type RelayState,
} from '../relay/reduce';
import { CheckScreen, PrepNoteScreen } from './CandidateInterview';
import { GuideScreen } from './GuideScreen';
import { ChooseScreen, DebriefScreen, SavedScreen } from './RecruiterInterview';
import { Trail } from './Trail';

interface Props {
  state: RelayState;
  candidate: CandidateView;
  recruiter: RecruiterView;
  onEvent: (event: RelayEvent) => void;
  onReplay: () => void;
}

type Actor = 'james' | 'jeremy' | 'both';

const STEPS = 5;
const steps: Record<
  Exclude<InterviewPhase, 'closed'>,
  { n: number; actor: Actor; label: string }
> = {
  prepare: { n: 1, actor: 'james', label: 'Choose what to learn' },
  scheduled: { n: 2, actor: 'jeremy', label: 'The interview note' },
  call: { n: 3, actor: 'both', label: 'The interview, off screen' },
  recap: { n: 4, actor: 'jeremy', label: 'Check the record' },
  debrief: { n: 5, actor: 'james', label: 'Review the debrief' },
};

const { candidate: jeremy, recruiter: james } = people;

function clock(minutes: number) {
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
}

/** The Interview stage as one guided surface: one step, one actor, one action. */
export function InterviewGuide({
  state,
  candidate,
  recruiter,
  onEvent,
  onReplay,
}: Props) {
  const interview = state.interview;
  const mine = recruiter.interview;
  const theirs = candidate.interview;
  if (!interview || !mine || !theirs) return null;

  const { phase } = interview;
  const step = phase === 'closed' ? undefined : steps[phase];
  const peek = peekAt(phase, candidate, recruiter);

  // The call itself is off screen; the demo loads its synthetic transcript fixture.
  const afterCall = () => {
    const question = chosenQuestion(interview);
    const found = question && scriptedAssist.extractExcerpt({ question });
    if (found) onEvent({ type: 'interview-held', ...found });
  };

  return (
    <div className="guide" data-phase={phase}>
      <header className="guide-head">
        <ActorBadge actor={step?.actor} />
        <p className="guide-step" aria-live="polite">
          <span>
            {step ? `Step ${step.n} of ${STEPS}` : 'Complete'}
            <span className="guide-step-label"> · {step?.label ?? 'Debrief saved'}</span>
          </span>
          <span className="guide-ticks" aria-hidden="true">
            {Array.from({ length: STEPS }, (_, i) => (
              <span
                key={i}
                className={
                  !step || i < step.n - 1 ? 'done' : i === step.n - 1 ? 'now' : ''
                }
              />
            ))}
          </span>
        </p>
        {peek && (
          <details className="peek" key={phase}>
            <summary>Peek at {peek.side}’s side</summary>
            <p>
              <strong>{peek.headline}</strong> {peek.detail}
            </p>
          </details>
        )}
      </header>

      <div className="guide-stage" key={phase}>
        {phase === 'prepare' && <ChooseScreen interview={mine} onEvent={onEvent} />}
        {phase === 'scheduled' && <PrepNoteScreen interview={theirs} onEvent={onEvent} />}
        {phase === 'call' && <CallTransition onContinue={afterCall} />}
        {phase === 'recap' && <CheckScreen interview={theirs} onEvent={onEvent} />}
        {phase === 'debrief' && <DebriefScreen interview={mine} onEvent={onEvent} />}
        {phase === 'closed' && <SavedScreen interview={mine} onReplay={onReplay} />}
      </div>

      {phase === 'closed' && (
        <Trail
          entries={state.trail}
          title="How Relay got here"
          intro="Every step from Jeremy’s first note to James’s debrief, in order. Both sides were rebuilt from this log."
        />
      )}
    </div>
  );
}

function ActorBadge({ actor }: { actor?: Actor }) {
  if (!actor)
    return (
      <p className="guide-actor done">
        <span className="initials">✓</span> Interview stage complete
      </p>
    );
  if (actor === 'both')
    return (
      <p className="guide-actor both">
        <span className="initials">{jeremy.initials}</span>
        <span className="initials">{james.initials}</span>
        {jeremy.first} &amp; {james.first} · in conversation
      </p>
    );
  const who = actor === 'james' ? james : jeremy;
  return (
    <p className={`guide-actor ${actor}`}>
      <span className="initials">{who.initials}</span>
      {who.first} · {actor === 'james' ? 'recruiter' : 'candidate'}
    </p>
  );
}

/** One line on what the other side sees right now. None during the call itself. */
function peekAt(
  phase: InterviewPhase,
  candidate: CandidateView,
  recruiter: RecruiterView,
): { side: string; headline: string; detail: string } | undefined {
  const jeremySees = {
    side: jeremy.first,
    headline: `${jeremy.first} sees: “${candidate.status.headline}.”`,
    detail: candidate.status.detail,
  };
  switch (phase) {
    case 'prepare':
    case 'debrief':
    case 'closed':
      return jeremySees;
    case 'scheduled':
      return {
        side: james.first,
        headline: `${james.first} has the full plan.`,
        detail:
          'The open question, both suggested questions and why he chose this one. None of it is in your note.',
      };
    case 'recap':
      return {
        side: james.first,
        headline: recruiter.interview?.excerpt
          ? `${james.first} has the excerpt.`
          : `${james.first} has nothing from the interview yet.`,
        detail: 'The excerpt reaches him only after you check it.',
      };
    case 'call':
      return undefined;
  }
}

/** Step 3: a deliberate pause. The conversation is between people. */
function CallTransition({ onContinue }: { onContinue: () => void }) {
  return (
    <GuideScreen
      tone="transition"
      eyebrow={`${interviewCall.when} · ${interviewCall.length} · off screen`}
      headline={`The conversation happens between ${jeremy.first} and ${james.first}. Relay is not in the call.`}
      why="This prototype doesn’t simulate the interview. Relay picks up afterwards, when the record needs checking."
      relay={`will review the conversation afterwards for one moment, when ${james.first} asked his question, and quote it exactly. ${jeremy.first} sees it first.`}
      next={`${jeremy.first} checks the excerpt before ${james.first} sees anything.`}
      actions={
        <button className="pill" onClick={onContinue}>
          See what Relay found
        </button>
      }
    >
      <ol className="call-line" aria-label="The interview">
        <li>
          <time>{clock(interviewCall.startsAt)}</time> Call starts
        </li>
        <li className="talk">
          {jeremy.first} and {james.first} talk. Nothing is shared during the call.
        </li>
        <li>
          <time>{clock(interviewCall.endsAt)}</time> Call ends · Relay reviews the
          transcript
        </li>
      </ol>
      <p className="demo-note">
        For this demo, the transcript is a synthetic fixture. It is the same every time.
      </p>
    </GuideScreen>
  );
}
