import type { Actor, RelayEvent } from './events';
import {
  answerEffects,
  claimTemplates,
  clarification,
  confidenceLabel,
  dayStart,
  debriefOutcomeLabel,
  demoTime,
  interviewCall,
  openQuestionAtStart,
  people,
  scriptedAddendum,
  scriptedNote,
  type AnswerId,
  type ClaimId,
  type ClockAnchor,
  type Confidence,
  type DebriefOutcome,
} from './fixtures';
import {
  excerptBelongsTo,
  validSuggestions,
  type Coverage,
  type QuestionSuggestion,
  type TranscriptExcerpt,
} from './interviewAssist';

export type Stage = 'invite' | 'clarify' | 'review' | 'interview';
export type ClaimStatus =
  | 'drafting'
  | 'needs-review'
  | 'accepted'
  | 'corrected'
  | 'awaiting-jeremy'
  | 'unresolved';
export type Crossing = 'to-james' | 'to-jeremy';
export type OpenQuestionStatus =
  | 'from-application'
  | 'rescoped'
  | 'needs-human-reading'
  | 'unmapped-context'
  | 'unresolved'
  | 'resolved-by-james';
export type UnmappedContextStatus =
  'needs-human-reading' | 'accepted' | 'awaiting-jeremy' | 'unresolved';

export interface TrailEntry {
  seq: number;
  time: string;
  actor: Actor;
  text: string;
  crossing?: Crossing;
}

export interface Words {
  label: string;
  text: string;
  time: string;
  edited: boolean;
}

export interface Answer extends Words {
  /** The scripted option Jeremy started from. Only drives logic when `custom` is false. */
  basedOn: AnswerId;
  /** Jeremy changed the scripted wording, so Relay does not interpret it. */
  custom: boolean;
}

export interface Claim {
  id: ClaimId;
  evidence: string;
  skill: string;
  roleNeed: string;
  confidence: Confidence;
  status: ClaimStatus;
  humanNote?: string;
  question?: string;
  followUp?: Words;
  history: TrailEntry[];
}

/** Context Relay could not responsibly map to a role-specific claim. */
export interface UnmappedContext {
  status: UnmappedContextStatus;
  question?: string;
  followUp?: Words;
}

export type InterviewPhase =
  'prepare' | 'scheduled' | 'call' | 'recap' | 'debrief' | 'closed';

export interface Interview {
  phase: InterviewPhase;
  /** The open question as Apply left it, carried into the interview. */
  openQuestion: string;
  suggestions: QuestionSuggestion[];
  questionId?: string;
  excerpt?: TranscriptExcerpt;
  coverage?: Coverage;
  /** When the call ended; the demo clock continues from here. */
  heldAt?: ClockAnchor;
  recap?: { time: string; addendum?: Words };
  debrief?: { outcome: DebriefOutcome; note: string; time: string };
}

type PhaseEvent = Exclude<
  Extract<RelayEvent, { type: `interview-${string}` }>['type'],
  'interview-prep-opened'
>;

/** The only moves the Interview stage allows: each step once, forward. */
export const interviewTransitions: Record<
  PhaseEvent,
  { from: InterviewPhase; to: InterviewPhase }
> = {
  'interview-plan-approved': { from: 'prepare', to: 'scheduled' },
  'interview-call-started': { from: 'scheduled', to: 'call' },
  'interview-held': { from: 'call', to: 'recap' },
  'interview-recap-confirmed': { from: 'recap', to: 'debrief' },
  'interview-debriefed': { from: 'debrief', to: 'closed' },
};

/** The interview, if the event is allowed in its current phase. */
function interviewAt(state: RelayState, type: PhaseEvent): Interview | null {
  const interview = state.interview;
  return state.stage === 'interview' &&
    interview?.phase === interviewTransitions[type].from
    ? interview
    : null;
}

function advance(
  interview: Interview,
  type: PhaseEvent,
  change: Partial<Interview>,
): Interview {
  return { ...interview, ...change, phase: interviewTransitions[type].to };
}

export function chosenQuestion(interview: Interview): QuestionSuggestion | undefined {
  return interview.suggestions.find((s) => s.id === interview.questionId);
}

export interface RelayState {
  stage: Stage;
  note?: Words;
  answer?: Answer;
  claims: Claim[];
  unmappedContext?: UnmappedContext;
  interview?: Interview;
  openQuestion: { text: string; status: OpenQuestionStatus };
  signals: TrailEntry[];
  trail: TrailEntry[];
}

export const initialState: RelayState = {
  stage: 'invite',
  claims: [],
  openQuestion: { text: openQuestionAtStart, status: 'from-application' },
  signals: [],
  trail: [],
};

/** Case-insensitive position of an evidence phrase in Jeremy's words, or -1. */
export function findEvidence(text: string, evidence: string): number {
  return text.toLowerCase().indexOf(evidence.toLowerCase());
}

/** True when submitted text differs from the scripted wording (ignoring outer whitespace). */
export function differsFromScript(text: string, scripted: string): boolean {
  return text.trim() !== scripted.trim();
}

function updateClaim(
  state: RelayState,
  id: ClaimId,
  allowed: (claim: Claim) => boolean,
  change: (claim: Claim) => Claim,
): RelayState | null {
  const claim = state.claims.find((c) => c.id === id);
  if (!claim || !allowed(claim)) return null;
  return { ...state, claims: state.claims.map((c) => (c.id === id ? change(c) : c)) };
}

const reviewable = (c: Claim) => c.status === 'needs-review';
// An own-words answer can't be accepted or corrected as if Relay had read it.
const interpretedAndReviewable = (c: Claim) =>
  reviewable(c) && c.confidence !== 'uninterpreted';
const awaitingHumanReading = (c: Claim) =>
  c.confidence === 'uninterpreted' &&
  (c.status === 'needs-review' || c.status === 'unresolved');

function log(state: RelayState, entries: TrailEntry[], claimIds: ClaimId[] = []) {
  return {
    ...state,
    trail: [...state.trail, ...entries],
    claims: state.claims.map((c) =>
      claimIds.includes(c.id) ? { ...c, history: [...c.history, ...entries] } : c,
    ),
  };
}

function apply(state: RelayState, event: RelayEvent, seq: number): RelayState | null {
  const anchor =
    event.type === 'interview-call-started'
      ? { seq, minutes: interviewCall.startsAt }
      : event.type === 'interview-held'
        ? { seq, minutes: interviewCall.endsAt }
        : (state.interview?.heldAt ?? dayStart);
  const time = demoTime(seq, anchor);
  const entry = (actor: Actor, text: string, crossing?: Crossing): TrailEntry => ({
    seq,
    time,
    actor,
    text,
    crossing,
  });
  const skillOf = (id: ClaimId) => state.claims.find((c) => c.id === id)?.skill ?? id;

  switch (event.type) {
    case 'context-submitted': {
      if (state.stage !== 'invite' || !event.text.trim()) return null;
      const edited = differsFromScript(event.text, scriptedNote);
      const claims: Claim[] = claimTemplates
        .filter((t) => findEvidence(event.text, t.evidence) >= 0)
        .map((t) => ({
          id: t.id,
          evidence: t.evidence,
          skill: t.skill,
          roleNeed: t.roleNeed,
          confidence: 'unclarified',
          status: 'drafting',
          history: [],
        }));
      const next: RelayState = {
        ...state,
        stage: claims.some((claim) => claim.id === clarification.target)
          ? 'clarify'
          : 'review',
        note: { label: 'Your note', text: event.text, time, edited },
        claims,
      };
      if (claims.length === 0) {
        const signal = entry(
          'relay',
          'Jeremy added context Relay could not map. It needs James’s reading.',
        );
        return log(
          {
            ...next,
            unmappedContext: { status: 'needs-human-reading' },
            openQuestion: {
              text: 'Relay did not map this context to a role-specific claim.',
              status: 'unmapped-context',
            },
            signals: [signal, ...state.signals],
          },
          [
            entry('jeremy', `Jeremy added context${edited ? ' (edited by Jeremy)' : ''}`),
            entry(
              'relay',
              'Relay sent Jeremy’s context to James without interpreting it',
              'to-james',
            ),
          ],
        );
      }
      if (next.stage === 'review') {
        const reviewableClaims = claims.map((claim) => ({
          ...claim,
          status: 'needs-review' as const,
        }));
        const signal = entry(
          'relay',
          'Jeremy added context. Relay mapped it but did not ask a clarifying question.',
        );
        return log(
          { ...next, claims: reviewableClaims, signals: [signal, ...state.signals] },
          [
            entry('jeremy', `Jeremy added context${edited ? ' (edited by Jeremy)' : ''}`),
            entry(
              'relay',
              'Relay sent its mapped context to James for review',
              'to-james',
            ),
          ],
          reviewableClaims.map((claim) => claim.id),
        );
      }
      const signal = entry(
        'relay',
        'Jeremy is adding context. Relay asked him one question.',
      );
      return log(
        { ...next, signals: [signal, ...state.signals] },
        [
          entry('jeremy', `Jeremy added context${edited ? ' (edited by Jeremy)' : ''}`),
          entry(
            'relay',
            `Relay linked ${claims.length} phrase${claims.length === 1 ? '' : 's'} in his words to the role and asked one clarifying question`,
          ),
        ],
        claims.map((c) => c.id),
      );
    }

    case 'clarification-answered': {
      if (state.stage !== 'clarify' || !event.text.trim()) return null;
      const scripted = clarification.answers.find((a) => a.id === event.answerId);
      if (!scripted) return null;
      const custom = differsFromScript(event.text, scripted.text);
      const answer: Answer = {
        basedOn: event.answerId,
        custom,
        label: custom ? 'Your answer, in your own words' : 'Your answer',
        text: event.text,
        time,
        edited: custom,
      };

      if (custom) {
        // No scripted effect applies. The target claim waits for a person to read it.
        const claims = state.claims.map((c) => ({
          ...c,
          confidence:
            c.id === clarification.target ? ('uninterpreted' as const) : c.confidence,
          status: 'needs-review' as const,
        }));
        const signal = entry(
          'relay',
          'Jeremy answered in his own words. Relay hasn’t interpreted it; it needs your reading.',
        );
        return log(
          {
            ...state,
            stage: 'review',
            answer,
            claims,
            openQuestion: { ...state.openQuestion, status: 'needs-human-reading' },
            signals: [signal, ...state.signals],
          },
          [
            entry('jeremy', 'Jeremy answered the clarifying question in his own words'),
            entry(
              'relay',
              'Relay did not interpret the edited answer and sent it to James as written',
              'to-james',
            ),
          ],
          claims.map((c) => c.id),
        );
      }

      const effect = answerEffects[event.answerId];
      const claims = state.claims.map((c) => ({
        ...c,
        confidence: effect.confidence[c.id],
        skill: effect.skillOverride?.[c.id] ?? c.skill,
        status: 'needs-review' as const,
      }));
      const signal = entry(
        'relay',
        `New context changes an open question. ${effect.signal}`,
      );
      return log(
        {
          ...state,
          stage: 'review',
          answer,
          claims,
          openQuestion: { text: effect.openQuestion, status: 'rescoped' },
          signals: [signal, ...state.signals],
        },
        [
          entry('jeremy', 'Jeremy answered the clarifying question'),
          entry(
            'relay',
            'Relay updated its interpretation, re-scoped the open question and sent both to James',
            'to-james',
          ),
        ],
        claims.map((c) => c.id),
      );
    }

    case 'claim-accepted': {
      const next = updateClaim(state, event.claimId, interpretedAndReviewable, (c) => ({
        ...c,
        status: 'accepted',
      }));
      return (
        next &&
        log(
          next,
          [
            entry(
              'james',
              `James accepted “${skillOf(event.claimId)}” into the interview brief`,
              'to-jeremy',
            ),
          ],
          [event.claimId],
        )
      );
    }

    case 'claim-corrected': {
      if (!event.note.trim()) return null;
      const next = updateClaim(state, event.claimId, interpretedAndReviewable, (c) => ({
        ...c,
        status: 'corrected',
        humanNote: event.note,
      }));
      return (
        next &&
        log(
          next,
          [
            entry(
              'james',
              `James replaced Relay’s reading of “${skillOf(event.claimId)}” with his own note`,
              'to-jeremy',
            ),
          ],
          [event.claimId],
        )
      );
    }

    case 'custom-answer-accepted': {
      const next = updateClaim(state, event.claimId, awaitingHumanReading, (c) => ({
        ...c,
        status: 'accepted',
        confidence: 'accepted-as-written',
      }));
      return (
        next &&
        log(
          {
            ...next,
            openQuestion: { ...next.openQuestion, status: 'resolved-by-james' },
          },
          [
            entry(
              'james',
              `James read Jeremy’s own answer and accepted “${skillOf(event.claimId)}” on that basis`,
              'to-jeremy',
            ),
          ],
          [event.claimId],
        )
      );
    }

    case 'claim-left-unresolved': {
      const next = updateClaim(
        state,
        event.claimId,
        (c) => c.confidence === 'uninterpreted' && reviewable(c),
        (c) => ({ ...c, status: 'unresolved' }),
      );
      return (
        next &&
        log(
          { ...next, openQuestion: { ...next.openQuestion, status: 'unresolved' } },
          [
            entry(
              'james',
              `James left “${skillOf(event.claimId)}” unresolved for now`,
              'to-jeremy',
            ),
          ],
          [event.claimId],
        )
      );
    }

    case 'clarification-sent': {
      if (!event.question.trim()) return null;
      const next = updateClaim(
        state,
        event.claimId,
        (c) => reviewable(c) || awaitingHumanReading(c),
        (c) => ({ ...c, status: 'awaiting-jeremy', question: event.question }),
      );
      const confidence = state.claims.find((c) => c.id === event.claimId)?.confidence;
      return (
        next &&
        log(
          confidence === 'uninterpreted'
            ? {
                ...next,
                openQuestion: { ...next.openQuestion, status: 'needs-human-reading' },
              }
            : next,
          [
            entry(
              'james',
              `James approved and sent a question about “${skillOf(event.claimId)}”`,
              'to-jeremy',
            ),
          ],
          [event.claimId],
        )
      );
    }

    case 'followup-answered': {
      if (!event.text.trim()) return null;
      const scripted = claimTemplates.find(
        (t) => t.id === event.claimId,
      )?.scriptedFollowUp;
      const edited = scripted === undefined || differsFromScript(event.text, scripted);
      const words: Words = {
        label: 'Your reply to James',
        text: event.text,
        time,
        edited,
      };
      // A follow-up never changes confidence: an own-words claim stays uninterpreted.
      const next = updateClaim(
        state,
        event.claimId,
        (c) => c.status === 'awaiting-jeremy',
        (c) => ({ ...c, status: 'needs-review', followUp: words }),
      );
      if (!next) return null;
      const signal = entry(
        'relay',
        `Jeremy answered your question about “${skillOf(event.claimId)}”.`,
      );
      return log(
        { ...next, signals: [signal, ...next.signals] },
        [
          entry(
            'jeremy',
            `Jeremy answered James’s question${edited ? ' (edited)' : ''}`,
            'to-james',
          ),
        ],
        [event.claimId],
      );
    }

    case 'unmapped-context-accepted': {
      if (state.unmappedContext?.status !== 'needs-human-reading') return null;
      return log(
        {
          ...state,
          unmappedContext: { ...state.unmappedContext, status: 'accepted' },
        },
        [entry('james', 'James accepted Jeremy’s context as written', 'to-jeremy')],
      );
    }

    case 'unmapped-context-left-unresolved': {
      if (state.unmappedContext?.status !== 'needs-human-reading') return null;
      return log(
        {
          ...state,
          unmappedContext: { ...state.unmappedContext, status: 'unresolved' },
        },
        [entry('james', 'James left Jeremy’s context unresolved for now', 'to-jeremy')],
      );
    }

    case 'unmapped-context-followup-sent': {
      if (
        !event.question.trim() ||
        state.unmappedContext?.status !== 'needs-human-reading'
      )
        return null;
      return log(
        {
          ...state,
          unmappedContext: {
            ...state.unmappedContext,
            status: 'awaiting-jeremy',
            question: event.question,
          },
        },
        [
          entry(
            'james',
            'James approved and sent a question about Jeremy’s context',
            'to-jeremy',
          ),
        ],
      );
    }

    case 'unmapped-context-followup-answered': {
      if (!event.text.trim() || state.unmappedContext?.status !== 'awaiting-jeremy')
        return null;
      const followUp: Words = {
        label: 'Your reply to James',
        text: event.text,
        time,
        edited: true,
      };
      const signal = entry(
        'relay',
        'Jeremy answered James’s question about his context.',
      );
      return log(
        {
          ...state,
          unmappedContext: {
            ...state.unmappedContext,
            status: 'needs-human-reading',
            question: undefined,
            followUp,
          },
          signals: [signal, ...state.signals],
        },
        [
          entry(
            'jeremy',
            'Jeremy answered James’s question in his own words',
            'to-james',
          ),
        ],
      );
    }

    case 'interview-prep-opened': {
      if (
        state.stage !== 'review' ||
        !readyForInterview(state) ||
        !validSuggestions(event.suggestions)
      )
        return null;
      return log(
        {
          ...state,
          stage: 'interview',
          interview: {
            phase: 'prepare',
            openQuestion: state.openQuestion.text,
            suggestions: event.suggestions,
          },
        },
        [
          entry('james', 'James opened interview prep'),
          entry(
            'relay',
            'Relay suggested two questions to James and told Jeremy his interview is being prepared',
            'to-jeremy',
          ),
        ],
      );
    }

    case 'interview-plan-approved': {
      const interview = interviewAt(state, event.type);
      const chosen = interview?.suggestions.find((s) => s.id === event.questionId);
      if (!interview || !chosen) return null;
      return log(
        {
          ...state,
          interview: advance(interview, event.type, { questionId: chosen.id }),
        },
        [
          entry(
            'james',
            `James chose ${chosen.kind === 'targeted' ? 'the question aimed at the open question' : 'the broad opener'} and sent Jeremy his interview prep`,
            'to-jeremy',
          ),
        ],
      );
    }

    case 'interview-call-started': {
      const interview = interviewAt(state, event.type);
      if (!interview) return null;
      return log({ ...state, interview: advance(interview, event.type, {}) }, [
        entry(
          'jeremy',
          `Jeremy and James started the interview, ${interviewCall.when}. Relay is not in the call`,
        ),
      ]);
    }

    case 'interview-held': {
      const interview = interviewAt(state, event.type);
      const chosen = interview && chosenQuestion(interview);
      // Never show an excerpt that does not belong to the question James chose.
      if (
        !interview ||
        !chosen ||
        !excerptBelongsTo(chosen, event.excerpt, event.coverage)
      )
        return null;
      return log(
        {
          ...state,
          interview: advance(interview, event.type, {
            excerpt: event.excerpt,
            coverage: event.coverage,
            heldAt: anchor,
          }),
        },
        [
          entry(
            'relay',
            'After the call, Relay quoted the moment James asked his question and sent it to Jeremy to check first',
            'to-jeremy',
          ),
        ],
      );
    }

    case 'interview-recap-confirmed': {
      const interview = interviewAt(state, event.type);
      if (!interview) return null;
      const text = event.addendum?.trim() ? event.addendum : undefined;
      const edited = text !== undefined && differsFromScript(text, scriptedAddendum);
      // Candidate-provided, scripted or not; Relay never interprets it.
      const addendum: Words | undefined =
        text === undefined
          ? undefined
          : {
              label: edited ? 'Your addition, in your own words' : 'Your addition',
              text,
              time,
              edited,
            };
      const signal = entry(
        'relay',
        addendum
          ? 'Jeremy checked the interview excerpt and added context in his own words.'
          : 'Jeremy checked the interview excerpt. Nothing to add.',
      );
      return log(
        {
          ...state,
          interview: advance(interview, event.type, { recap: { time, addendum } }),
          signals: [signal, ...state.signals],
        },
        [
          entry(
            'jeremy',
            addendum
              ? `Jeremy confirmed the excerpt and added context${edited ? ' (edited by Jeremy)' : ''}`
              : 'Jeremy confirmed the excerpt with nothing to add',
          ),
          entry(
            'relay',
            addendum
              ? 'Relay sent the excerpt and his addition to James, without interpreting the addition'
              : 'Relay sent the excerpt to James',
            'to-james',
          ),
        ],
      );
    }

    case 'interview-debriefed': {
      const interview = interviewAt(state, event.type);
      if (!interview || !event.note.trim() || !(event.outcome in debriefOutcomeLabel))
        return null;
      return log(
        {
          ...state,
          interview: advance(interview, event.type, {
            debrief: { outcome: event.outcome, note: event.note, time },
          }),
        },
        [
          entry(
            'james',
            `James marked the open question “${debriefOutcomeLabel[event.outcome].toLowerCase()}” and saved the interview debrief`,
          ),
          entry(
            'relay',
            'Relay told Jeremy that James has finished his interview notes',
            'to-jeremy',
          ),
        ],
      );
    }
  }
}

function readyForInterview(state: RelayState): boolean {
  return (
    state.claims.length > 0 &&
    state.claims.every((claim) =>
      ['accepted', 'corrected', 'unresolved'].includes(claim.status),
    ) &&
    state.unmappedContext?.status !== 'needs-human-reading' &&
    state.unmappedContext?.status !== 'awaiting-jeremy'
  );
}

/** Pure: the same events always produce the same state. Invalid events are ignored. */
export function reduce(events: RelayEvent[]): RelayState {
  let state = initialState;
  let seq = 0;
  for (const event of events) {
    const next = apply(state, event, seq);
    if (next) {
      state = next;
      seq += 1;
    }
  }
  return state;
}

// ---------- Views ----------

export type CandidateClaimState =
  | 'with-james'
  | 'reading-as-written'
  | 'in-brief'
  | 'accepted-as-written'
  | 'to-discuss'
  | 'question'
  | 'unresolved';

export interface CandidateView {
  stage: Stage;
  status: { headline: string; detail: string };
  words: Words[];
  understood: {
    id: ClaimId;
    skill: string;
    state: CandidateClaimState;
    message: string;
  }[];
  questions: (
    { claimId: ClaimId; question: string } | { unmapped: true; question: string }
  )[];
  interview?: CandidateInterviewView;
}

/** Jeremy's side of the interview. Never carries James's suggestions, coverage or notes. */
export interface CandidateInterviewView {
  phase: InterviewPhase;
  call: string;
  /** The topic James approved for Jeremy, once the plan is sent. */
  prep?: string;
  /** From recap on: exactly what Relay plans to share, or has shared. */
  excerpt?: TranscriptExcerpt;
  addendum?: Words;
}

const james = people.recruiter.first;
const candidateClaimMessage: Record<CandidateClaimState, string> = {
  'with-james': `With ${james} for review`,
  'reading-as-written': `${james} will read your answer himself. Relay hasn’t interpreted it.`,
  'in-brief': 'Added to your interview brief',
  'accepted-as-written': `${james} read your answer and accepted it as you wrote it`,
  'to-discuss': `${james} would like to talk this through with you. Nothing you wrote has changed.`,
  question: `${james} has a question for you`,
  unresolved: `${james} hasn’t drawn a conclusion yet. Nothing has been decided.`,
};

function candidateClaimState(c: Claim): CandidateClaimState {
  if (c.status === 'accepted')
    return c.confidence === 'accepted-as-written' ? 'accepted-as-written' : 'in-brief';
  if (c.status === 'corrected') return 'to-discuss';
  if (c.status === 'awaiting-jeremy') return 'question';
  if (c.status === 'unresolved') return 'unresolved';
  if (c.confidence === 'uninterpreted') return 'reading-as-written';
  return 'with-james';
}

export function candidateView(state: RelayState): CandidateView {
  const recruiter = people.recruiter.name;
  const words = [
    state.note,
    state.answer,
    ...state.claims.map((c) => c.followUp),
    state.unmappedContext?.followUp,
  ].filter((w): w is Words => Boolean(w));

  const questions: CandidateView['questions'] = state.claims
    .filter((c) => c.status === 'awaiting-jeremy' && c.question)
    .map((c) => ({ claimId: c.id, question: c.question as string }));
  if (
    state.unmappedContext?.status === 'awaiting-jeremy' &&
    state.unmappedContext.question
  )
    questions.push({ unmapped: true, question: state.unmappedContext.question });

  let status: CandidateView['status'];
  if (state.stage === 'invite') {
    status = {
      headline: 'Your application is with a person',
      detail: `${recruiter} at ${people.employer} is reviewing it. You’ll hear from a person by Friday.`,
    };
  } else if (state.stage === 'clarify') {
    status = {
      headline: 'One quick question',
      detail: 'Answer it so your note is read the way you meant it.',
    };
  } else if (state.stage === 'interview') {
    status = interviewCandidateStatus(state.interview?.phase);
  } else if (questions.length > 0) {
    status = {
      headline: `${james} has a question for you`,
      detail: 'Written and approved by James. Answer whenever suits you.',
    };
  } else if (state.unmappedContext?.status === 'needs-human-reading') {
    status = {
      headline: `Your context is with ${james}`,
      detail: `${james} will read it himself. Relay hasn’t interpreted it.`,
    };
  } else if (state.claims.some((c) => c.status === 'needs-review')) {
    status = {
      headline: `Your context is with ${james}`,
      detail: 'A person is reviewing it. Relay doesn’t make decisions.',
    };
  } else {
    status = {
      headline: `${james} has read your context`,
      detail:
        'Your next conversation will start from it. James will be in touch to schedule.',
    };
  }

  return {
    stage: state.stage,
    status,
    words,
    understood:
      state.stage === 'review'
        ? state.claims.map((c) => {
            const s = candidateClaimState(c);
            return {
              id: c.id,
              skill: c.skill,
              state: s,
              message: candidateClaimMessage[s],
            };
          })
        : [],
    questions,
    interview: state.interview && candidateInterview(state.interview),
  };
}

function candidateInterview(interview: Interview): CandidateInterviewView {
  return {
    phase: interview.phase,
    call: `${interviewCall.when} · ${interviewCall.length} with ${people.recruiter.name}`,
    prep: interview.phase === 'prepare' ? undefined : chosenQuestion(interview)?.prep,
    excerpt: interview.excerpt,
    addendum: interview.recap?.addendum,
  };
}

export interface BriefItem {
  kind: 'strength' | 'discuss' | 'ask' | 'open';
  text: string;
}

export interface RecruiterView {
  claims: Claim[];
  unmappedContext?: UnmappedContext;
  toReview: number;
  answer?: Answer;
  /** The claim the clarifying question was about. */
  answerTarget: ClaimId;
  openQuestion: RelayState['openQuestion'];
  signals: TrailEntry[];
  brief: BriefItem[];
  canStartInterview: boolean;
  interview?: RecruiterInterviewView;
}

/** James's side of the interview. */
export interface RecruiterInterviewView {
  phase: InterviewPhase;
  openQuestion: string;
  suggestions: QuestionSuggestion[];
  chosen?: QuestionSuggestion;
  /** Withheld until Jeremy has checked what will be shared. */
  excerpt?: TranscriptExcerpt;
  coverage?: Coverage;
  recap?: Interview['recap'];
  debrief?: Interview['debrief'];
}

export function recruiterView(state: RelayState): RecruiterView {
  const brief: BriefItem[] = [];
  for (const c of state.claims) {
    if (c.status === 'accepted')
      brief.push({
        kind: 'strength',
        text:
          c.confidence === 'accepted-as-written'
            ? `${c.skill} (on Jeremy’s own account)`
            : c.skill,
      });
    if (c.status === 'corrected' && c.humanNote)
      brief.push({ kind: 'discuss', text: c.humanNote });
  }
  if (state.openQuestion.status === 'rescoped')
    brief.push({ kind: 'ask', text: state.openQuestion.text });
  if (state.openQuestion.status === 'unresolved')
    brief.push({ kind: 'open', text: state.openQuestion.text });
  return {
    claims: state.claims,
    unmappedContext: state.unmappedContext,
    toReview:
      state.claims.filter((c) => c.status === 'needs-review').length +
      (state.unmappedContext?.status === 'needs-human-reading' ? 1 : 0),
    answer: state.answer,
    answerTarget: clarification.target,
    openQuestion: state.openQuestion,
    signals: state.signals,
    brief,
    canStartInterview: state.stage === 'review' && readyForInterview(state),
    interview: state.interview && recruiterInterview(state.interview),
  };
}

function recruiterInterview(interview: Interview): RecruiterInterviewView {
  const checked = interview.phase === 'debrief' || interview.phase === 'closed';
  return {
    phase: interview.phase,
    openQuestion: interview.openQuestion,
    suggestions: interview.suggestions,
    chosen: chosenQuestion(interview),
    excerpt: checked ? interview.excerpt : undefined,
    coverage: checked ? interview.coverage : undefined,
    recap: interview.recap,
    debrief: interview.debrief,
  };
}

/** The badge on a claim card. Once James decides, it says so instead of "inferred". */
export function claimBadge(c: Claim): { label: string; tone: Confidence | 'decided' } {
  if (c.status === 'corrected')
    return { label: 'Relay’s reading replaced by James', tone: 'decided' };
  if (c.status === 'accepted' && c.confidence === 'unclarified')
    return { label: 'Accepted by James · not clarified by Jeremy', tone: 'decided' };
  return { label: confidenceLabel[c.confidence], tone: c.confidence };
}

function interviewCandidateStatus(phase?: InterviewPhase): CandidateView['status'] {
  switch (phase) {
    case 'scheduled':
      return {
        headline: `Interview with ${james} · ${interviewCall.when}`,
        detail:
          'Here’s what he’d like to talk about. There’s nothing to write beforehand.',
      };
    case 'call':
      return {
        headline: `In your interview with ${james}`,
        detail: 'Relay isn’t in the call. Nothing is shared until you’ve checked it.',
      };
    case 'recap':
      return {
        headline: `Check what ${james} will see`,
        detail:
          'Relay quoted your exact words from the interview. Confirm them, or add context in your own words.',
      };
    case 'debrief':
      return {
        headline: `Your recap is with ${james}`,
        detail: 'He’ll read it exactly as you checked it. Relay doesn’t make decisions.',
      };
    case 'closed':
      return {
        headline: `${james} has finished his interview notes`,
        detail:
          'You’ll hear from a person by Friday. Nothing you said or wrote has been changed.',
      };
    default:
      return {
        headline: `${james} is preparing your interview`,
        detail: 'Nothing for you to do yet. Relay doesn’t make decisions.',
      };
  }
}

/** The most recent hand-off between the two sides, used by the seam. */
export function lastCrossing(state: RelayState): TrailEntry | undefined {
  return [...state.trail].reverse().find((e) => e.crossing);
}
