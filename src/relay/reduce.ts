import type { Actor, RelayEvent } from './events';
import {
  answerEffects,
  claimTemplates,
  clarification,
  demoTime,
  openQuestionAtStart,
  people,
  scriptedNote,
  scriptedInterviewAnswer,
  type AnswerId,
  type ClaimId,
  type Confidence,
} from './fixtures';

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

export type InterviewStatus =
  'ready' | 'awaiting-jeremy' | 'needs-james-reading' | 'accepted' | 'unresolved';

export interface Interview {
  status: InterviewStatus;
  question?: string;
  answer?: Words;
  followUp?: string;
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
  const time = demoTime(seq);
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

    case 'interview-started': {
      if (state.stage !== 'review' || !readyForInterview(state)) return null;
      return log({ ...state, stage: 'interview', interview: { status: 'ready' } }, [
        entry('james', 'James moved Jeremy into the interview stage', 'to-jeremy'),
        entry(
          'relay',
          'Relay assembled the interview brief from James’s accepted and unresolved context',
        ),
      ]);
    }

    case 'interview-question-sent': {
      if (
        state.stage !== 'interview' ||
        state.interview?.status !== 'ready' ||
        !event.question.trim()
      )
        return null;
      return log(
        {
          ...state,
          interview: {
            ...state.interview,
            status: 'awaiting-jeremy',
            question: event.question,
          },
        },
        [
          entry(
            'james',
            'James approved and sent one focused interview question',
            'to-jeremy',
          ),
        ],
      );
    }

    case 'interview-answer-submitted': {
      if (
        state.stage !== 'interview' ||
        state.interview?.status !== 'awaiting-jeremy' ||
        !event.text.trim()
      )
        return null;
      const edited = differsFromScript(event.text, scriptedInterviewAnswer);
      const answer: Words = {
        label: edited
          ? 'Your interview answer, in your own words'
          : 'Your interview answer',
        text: event.text,
        time,
        edited,
      };
      return log(
        {
          ...state,
          interview: { ...state.interview, status: 'needs-james-reading', answer },
        },
        [
          entry(
            'jeremy',
            `Jeremy answered James’s interview question${edited ? ' in his own words' : ''}`,
            'to-james',
          ),
          entry(
            'relay',
            edited
              ? 'Relay sent Jeremy’s edited answer to James without interpreting it'
              : 'Relay sent Jeremy’s answer to James exactly as written',
          ),
        ],
      );
    }

    case 'interview-followup-sent': {
      if (
        state.stage !== 'interview' ||
        state.interview?.status !== 'needs-james-reading' ||
        !event.question.trim()
      )
        return null;
      return log(
        {
          ...state,
          interview: {
            ...state.interview,
            status: 'awaiting-jeremy',
            followUp: event.question,
          },
        },
        [entry('james', 'James approved and sent an interview follow-up', 'to-jeremy')],
      );
    }

    case 'interview-answer-accepted': {
      if (
        state.stage !== 'interview' ||
        state.interview?.status !== 'needs-james-reading'
      )
        return null;
      return log({ ...state, interview: { ...state.interview, status: 'accepted' } }, [
        entry(
          'james',
          'James accepted Jeremy’s interview answer as written',
          'to-jeremy',
        ),
      ]);
    }

    case 'interview-answer-left-unresolved': {
      if (
        state.stage !== 'interview' ||
        state.interview?.status !== 'needs-james-reading'
      )
        return null;
      return log({ ...state, interview: { ...state.interview, status: 'unresolved' } }, [
        entry(
          'james',
          'James left Jeremy’s interview answer unresolved for now',
          'to-jeremy',
        ),
      ]);
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
  interview?: Interview;
  interviewBrief: BriefItem[];
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
    status = interviewCandidateStatus(state.interview);
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
    interview: state.interview,
    interviewBrief: recruiterView(state).brief,
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
  interview?: Interview;
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
    interview: state.interview,
  };
}

function interviewCandidateStatus(interview?: Interview): CandidateView['status'] {
  if (interview?.status === 'awaiting-jeremy')
    return {
      headline: `${james} has an interview question for you`,
      detail:
        'Written and approved by James. Answer in your own words whenever suits you.',
    };
  if (interview?.status === 'needs-james-reading')
    return {
      headline: `Your interview answer is with ${james}`,
      detail: interview.answer?.edited
        ? 'Relay has not interpreted your edited answer.'
        : `${james} will read it exactly as you wrote it.`,
    };
  if (interview?.status === 'accepted')
    return {
      headline: `${james} accepted your interview answer`,
      detail: 'Accepted as written by a person. Relay has not made a decision.',
    };
  if (interview?.status === 'unresolved')
    return {
      headline: 'Your interview answer remains open',
      detail: `${james} has not drawn a conclusion yet. Nothing has been decided.`,
    };
  return {
    headline: 'Your interview brief is ready',
    detail: `${james} will send one focused question when ready.`,
  };
}

/** The most recent hand-off between the two sides, used by the seam. */
export function lastCrossing(state: RelayState): TrailEntry | undefined {
  return [...state.trail].reverse().find((e) => e.crossing);
}
