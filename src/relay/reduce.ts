import type { AckOutcome, Actor, RelayEvent } from './events';
import {
  answerEffects,
  callSlot,
  claimTemplates,
  clarification,
  interviewPlans,
  interviewSlots,
  offerDay,
  offerFacts,
  openQuestionAtStart,
  ownWordsEffect,
  scriptedNote,
  unlinkedNote,
  type AnswerId,
  type ClaimId,
  type DebriefOutcome,
  type FollowUp,
  type InterviewPlan,
  type QuestionId,
  type ReadingBasis,
} from './fixtures';
import {
  excerptBelongsTo,
  notesFit,
  type Coverage,
  type TranscriptExcerpt,
} from './interviewAssist';
import {
  checkOfferAssist,
  concernLabel,
  replyDraft,
  scriptedOfferAssist,
  type OfferAssist,
  type ReplyMode,
} from './offerAssist';

// Both sides are rebuilt from one event log. A person acts, Relay does its work
// inside the same event, and the other side changes. Nothing is hidden state, so
// the demo replays identically.

export type Step =
  | 'share'
  | 'clarify'
  | 'brief'
  | 'book'
  | 'call'
  | 'recap'
  | 'debrief'
  | 'held'
  | 'offer'
  | 'done';

export type Stage = 'apply' | 'interview' | 'offer';
export type Side = 'jeremy' | 'james';

export const stageOf: Record<Step, Stage> = {
  share: 'apply',
  clarify: 'apply',
  brief: 'apply',
  book: 'interview',
  call: 'interview',
  recap: 'interview',
  debrief: 'interview',
  held: 'interview',
  offer: 'offer',
  done: 'offer',
};

export interface TrailEntry {
  seq: number;
  time: string;
  actor: Actor;
  text: string;
  /** Hiring-team only: never shown on Jeremy's side. */
  internal?: boolean;
}

/** Relay's reading of one phrase in Jeremy's note, and what it rests on. */
export interface Reading {
  id: ClaimId;
  skill: string;
  roleNeed: string;
  evidence: string;
  basis: ReadingBasis;
}

export interface Words {
  text: string;
  time: string;
  /** Jeremy changed the suggested wording. Relay quotes it and never interprets it. */
  edited: boolean;
}

export type Slot = (typeof interviewSlots)[number];

export interface Interview {
  plan: InterviewPlan;
  slot?: Slot;
  excerpt?: TranscriptExcerpt;
  coverage?: Coverage;
  followUp?: FollowUp;
  /** Jeremy's reply to the follow-up. `null` means he had nothing to add. */
  reply?: Words | null;
  decision?: { outcome: DebriefOutcome; note?: string; time: string };
}

export interface OfferQuestion {
  id: string;
  text: string;
  time: string;
  assist: OfferAssist;
  /** Who answers it. Jeremy can move a Relay answer to James. */
  owner: 'relay' | 'james';
  movedByJeremy?: boolean;
  reply?: { mode: ReplyMode; text: string; time: string; editedByJames: boolean };
  outcome?: AckOutcome;
}

export interface RelayState {
  step: Step;
  note?: Words;
  answer?: Words & { id: AnswerId };
  readings: Reading[];
  openQuestion: string;
  /** Why the open question is still open, for James. */
  openBecause?: string;
  interview?: Interview;
  offer?: { questions: OfferQuestion[] };
  /** Demo clock: each event advances three minutes from the latest anchor. */
  clock: { seq: number; day: string; minutes: number };
  trail: TrailEntry[];
}

export const initialState: RelayState = {
  step: 'share',
  readings: [],
  openQuestion: openQuestionAtStart,
  clock: { seq: 0, day: 'Mon 5 Oct', minutes: 10 * 60 + 2 },
  trail: [],
};

const MAX_OFFER_QUESTIONS = 4;

/** Case-insensitive position of an evidence phrase in Jeremy's words, or -1. */
export function findEvidence(text: string, evidence: string): number {
  return text.toLowerCase().indexOf(evidence.toLowerCase());
}

function clockTime(clock: RelayState['clock'], seq: number): string {
  const total = clock.minutes + (seq - clock.seq) * 3;
  return `${clock.day} ${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * The interview questions James can choose from. When Jeremy picked a suggested
 * answer, Relay knows which one fits. When he wrote his own, or Relay had nothing
 * to ask, James chooses.
 */
export function planOptions(state: RelayState): QuestionId[] {
  if (state.answer && !state.answer.edited) return [answerEffects[state.answer.id].plan];
  return ['shared-gpu-translation', 'runtime-split'];
}

/** Questions that need James and have no reply yet. */
export function awaitingJames(state: RelayState): OfferQuestion[] {
  return state.offer?.questions.filter((q) => q.owner === 'james' && !q.reply) ?? [];
}

/** James's replies Jeremy hasn't responded to yet. */
export function awaitingJeremy(state: RelayState): OfferQuestion[] {
  return state.offer?.questions.filter((q) => q.reply && !q.outcome) ?? [];
}

/** Whose move it is. One side at a time has the primary task. */
export function turnOf(state: RelayState): Side | null {
  switch (state.step) {
    case 'share':
    case 'clarify':
    case 'book':
    case 'recap':
      return 'jeremy';
    case 'brief':
    case 'call':
    case 'debrief':
      return 'james';
    case 'offer':
      if (awaitingJeremy(state).length) return 'jeremy';
      return awaitingJames(state).length ? 'james' : 'jeremy';
    default:
      return null;
  }
}

function step(state: RelayState, event: RelayEvent, seq: number): RelayState | null {
  // Anchor the clock at the moments that happen on other days.
  const slot = state.interview?.slot;
  const clock =
    event.type === 'interview-booked'
      ? anchorAtSlot(event.slotId, seq, 18)
      : event.type === 'call-question-asked' && slot
        ? { seq: seq + 1, day: slot.day, minutes: slot.startsAt + 45 }
        : event.type === 'debrief-decided' && event.outcome === 'advance'
          ? { seq: seq + 1, day: offerDay, minutes: 9 * 60 }
          : state.clock;
  const time = clockTime(state.clock, seq);
  const entries: TrailEntry[] = [];
  const add = (actor: Actor, text: string, internal = false) =>
    entries.push({ seq, time, actor, text, internal: internal || undefined });
  const done = (next: Partial<RelayState>): RelayState => ({
    ...state,
    ...next,
    clock: clock ?? state.clock,
    trail: [...state.trail, ...entries],
  });

  switch (event.type) {
    case 'note-shared': {
      const text = event.text.trim();
      if (state.step !== 'share' || !text || text.length > 2000) return null;
      const readings = claimTemplates
        .filter((t) => findEvidence(text, t.evidence) >= 0)
        .map((t): Reading => ({
          id: t.id,
          skill: t.skill,
          roleNeed: t.roleNeed,
          evidence: t.evidence,
          basis: 'note',
        }));
      const note = { text, time, edited: text !== scriptedNote };
      add('jeremy', 'Jeremy told James what his résumé misses');
      // Relay asks only about a phrase it actually found.
      if (readings.some((r) => r.id === clarification.target)) {
        add(
          'relay',
          `Linked ${readings.length} phrase${readings.length === 1 ? '' : 's'} in his note to the role`,
          true,
        );
        add('relay', 'Asked Jeremy about the one point James could read two ways');
        return done({ step: 'clarify', note, readings });
      }
      add(
        'relay',
        readings.length
          ? `Linked ${readings.length} phrase${readings.length === 1 ? '' : 's'} to the role; found nothing to clarify`
          : 'Found nothing in his note to link to the role, and left the reading to James',
        true,
      );
      return done({
        step: 'brief',
        note,
        readings,
        openBecause: readings.length ? undefined : unlinkedNote,
      });
    }

    case 'clarification-answered': {
      const effect = answerEffects[event.answerId];
      const text = event.text.trim();
      if (state.step !== 'clarify' || !effect || !text || text.length > 1000) return null;
      const suggested = clarification.answers.find((a) => a.id === event.answerId)!;
      const edited = text !== suggested.text;
      add('jeremy', 'Jeremy answered Relay’s question');
      if (edited) {
        // His own words: quoted for James, never interpreted.
        add('relay', 'Quoted his answer for James without interpreting it', true);
        add('relay', 'Left the choice of interview question to James', true);
        return done({
          step: 'brief',
          answer: { id: event.answerId, text, time, edited },
          readings: state.readings.map((r) =>
            r.id === clarification.target ? { ...r, basis: 'unread' as const } : r,
          ),
          openQuestion: ownWordsEffect.openQuestion,
          openBecause: ownWordsEffect.openBecause,
        });
      }
      const readings = state.readings.map((r) => ({
        ...r,
        basis: effect.basis[r.id],
        skill: effect.skillOverride?.[r.id] ?? r.skill,
      }));
      add('relay', 'Updated the brief and re-scoped the open question', true);
      add('relay', 'Drafted an interview question and a topic note for Jeremy', true);
      return done({
        step: 'brief',
        answer: { id: event.answerId, text, time, edited },
        readings,
        openQuestion: effect.openQuestion,
        openBecause: effect.openBecause,
      });
    }

    case 'interview-invited': {
      if (state.step !== 'brief' || !planOptions(state).includes(event.questionId))
        return null;
      const plan = interviewPlans[event.questionId];
      add('james', 'James invited Jeremy to interview');
      add('relay', 'Sent Jeremy the topic and three open times from James’s calendar');
      return done({ step: 'book', interview: { plan } });
    }

    case 'interview-booked': {
      const picked = interviewSlots.find((s) => s.id === event.slotId);
      if (state.step !== 'book' || !state.interview || !picked) return null;
      add('jeremy', `Jeremy booked ${picked.day}`);
      add('relay', 'Put the call in both calendars, with notes switched on');
      return done({ step: 'call', interview: { ...state.interview, slot: picked } });
    }

    case 'call-question-asked': {
      const interview = state.interview;
      if (
        state.step !== 'call' ||
        !interview?.slot ||
        interview.excerpt ||
        !excerptBelongsTo(interview.plan, event.excerpt)
      )
        return null;
      add('james', 'James asked his planned question');
      add(
        'relay',
        `Marked the moment (${event.excerpt.lines[0].at}) and quoted Jeremy’s answer`,
        true,
      );
      return done({ interview: { ...interview, excerpt: event.excerpt } });
    }

    case 'call-ended': {
      const interview = state.interview;
      const notes = { coverage: event.coverage, followUp: event.followUp };
      if (
        state.step !== 'call' ||
        !interview?.excerpt ||
        !notesFit(interview.excerpt, notes)
      )
        return null;
      const { addresses, notAddressed } = notes.coverage;
      add('james', 'James ended the call');
      add(
        'relay',
        `Checked his answer against the open question: ${addresses.length} points covered, ${notAddressed.length} left open`,
        true,
      );
      add('relay', 'Sent Jeremy a recap and one follow-up on what there wasn’t time for');
      return done({ step: 'recap', interview: { ...interview, ...notes } });
    }

    case 'follow-up-answered': {
      const interview = state.interview;
      if (state.step !== 'recap' || !interview?.followUp) return null;
      const text = event.text?.trim();
      const reply = text
        ? { text, time, edited: text !== interview.followUp.scriptedReply.trim() }
        : null;
      add(
        'jeremy',
        reply ? 'Jeremy answered the follow-up' : 'Jeremy had nothing to add',
      );
      add(
        'relay',
        'Finished James’s debrief, with Jeremy’s reply quoted as written',
        true,
      );
      return done({ step: 'debrief', interview: { ...interview, reply } });
    }

    case 'debrief-decided': {
      const interview = state.interview;
      if (state.step !== 'debrief' || !interview) return null;
      if (event.outcome !== 'advance' && event.outcome !== 'hold') return null;
      const note = event.note?.trim() || undefined;
      const decision = { outcome: event.outcome, note, time };
      if (event.outcome === 'advance') {
        add('james', 'James decided to extend the offer');
        add('relay', 'Sent Jeremy AutoFarm’s approved offer');
        return done({
          step: 'offer',
          interview: { ...interview, decision },
          offer: { questions: [] },
        });
      }
      add('james', 'James held Jeremy for another round');
      add('relay', 'Carried what’s still open into the next round’s plan', true);
      add('relay', 'Told Jeremy that James would like one more conversation');
      return done({ step: 'held', interview: { ...interview, decision } });
    }

    case 'offer-question-asked': {
      const offer = state.offer;
      const question = event.question.trim();
      if (
        state.step !== 'offer' ||
        !offer ||
        !question ||
        question.length > 500 ||
        offer.questions.length >= MAX_OFFER_QUESTIONS
      )
        return null;
      // The reducer re-checks every provider output. Anything unsafe is re-triaged.
      const checked = checkOfferAssist(question, event.assist);
      const assist: OfferAssist = checked
        ? { ...checked, mode: event.assist.mode, status: event.assist.status }
        : scriptedOfferAssist(question, 'provider-error');
      const owner = assist.route === 'answer' ? 'relay' : 'james';
      add('jeremy', `Jeremy asked: “${question}”`);
      if (owner === 'relay')
        add(
          'relay',
          `Answered from the approved offer (${assist.factsUsed.map((f) => offerFacts[f].label.toLowerCase()).join(', ')})`,
        );
      else
        add(
          'relay',
          `Sent it to James with a draft: ${assist.concerns.map((c) => concernLabel[c].toLowerCase()).join(', ')}`,
        );
      return done({
        offer: {
          questions: [
            ...offer.questions,
            { id: `q${offer.questions.length + 1}`, text: question, time, assist, owner },
          ],
        },
      });
    }

    case 'offer-sent-to-james': {
      const q = state.offer?.questions.find((x) => x.id === event.questionId);
      if (state.step !== 'offer' || !q || q.owner !== 'relay') return null;
      add('jeremy', 'Jeremy asked James to answer instead');
      add('relay', 'Sent the question to James, with Relay’s answer as a draft');
      return done({
        offer: {
          questions: state.offer!.questions.map((x) =>
            x.id === q.id ? { ...x, owner: 'james' as const, movedByJeremy: true } : x,
          ),
        },
      });
    }

    case 'offer-reply-sent': {
      const q = state.offer?.questions.find((x) => x.id === event.questionId);
      const text = event.text.trim();
      if (
        state.step !== 'offer' ||
        !q ||
        q.owner !== 'james' ||
        q.reply ||
        (event.mode !== 'written' && event.mode !== 'call') ||
        !text ||
        text.length > 2000
      )
        return null;
      const reply = {
        mode: event.mode,
        text,
        time,
        editedByJames: text !== replyDraft(q.assist, event.mode).trim(),
      };
      add(
        'james',
        event.mode === 'call'
          ? 'James offered Jeremy a call'
          : reply.editedByJames
            ? 'James wrote his reply'
            : 'James sent Relay’s draft as his reply',
      );
      add('relay', 'Delivered James’s reply to Jeremy, exactly as he sent it');
      return done({
        offer: {
          questions: state.offer!.questions.map((x) =>
            x.id === q.id ? { ...x, reply } : x,
          ),
        },
      });
    }

    case 'offer-reply-acknowledged': {
      const q = state.offer?.questions.find((x) => x.id === event.questionId);
      if (state.step !== 'offer' || !q?.reply || q.outcome) return null;
      const allowed: AckOutcome[] =
        q.reply.mode === 'call' ? ['call-accepted'] : ['answered', 'wants-call'];
      if (!allowed.includes(event.outcome)) return null;
      if (event.outcome === 'answered')
        add('jeremy', 'Jeremy said James’s reply answers it');
      if (event.outcome === 'wants-call') {
        add('jeremy', 'Jeremy asked to talk it through');
        add('relay', `Booked James’s held slot, ${callSlot}; the question stays open`);
      }
      if (event.outcome === 'call-accepted') {
        add('jeremy', 'Jeremy accepted the call');
        add('relay', `Booked the call for ${callSlot}`);
      }
      return done({
        offer: {
          questions: state.offer!.questions.map((x) =>
            x.id === q.id ? { ...x, outcome: event.outcome } : x,
          ),
        },
      });
    }

    case 'offer-finished': {
      if (
        state.step !== 'offer' ||
        !state.offer?.questions.length ||
        awaitingJames(state).length ||
        awaitingJeremy(state).length
      )
        return null;
      add('jeremy', 'Jeremy has what he needs for now');
      return done({ step: 'done' });
    }
  }
}

function anchorAtSlot(slotId: string, seq: number, minutesIn: number) {
  const slot = interviewSlots.find((s) => s.id === slotId);
  return slot && { seq: seq + 1, day: slot.day, minutes: slot.startsAt + minutesIn };
}

export function reduce(events: RelayEvent[]): RelayState {
  let state = initialState;
  events.forEach((event, i) => {
    state = step(state, event, i + 1) ?? state;
  });
  return state;
}

/** Relay's most recent work that this side can see. Jeremy never sees team-only work. */
export function latestRelayWork(state: RelayState, side: Side): TrailEntry[] {
  const visible = state.trail.filter(
    (e) => e.actor === 'relay' && (side === 'james' || !e.internal),
  );
  const last = visible[visible.length - 1];
  return last ? visible.filter((e) => e.seq === last.seq) : [];
}

/** Honest totals from the log: what Relay handled and what people did. */
export function tally(state: RelayState) {
  const count = (actor: Actor) => state.trail.filter((e) => e.actor === actor).length;
  return { relay: count('relay'), james: count('james'), jeremy: count('jeremy') };
}

/** Where an offer question stands, in words. Nothing is "resolved" without an answer. */
export function questionStatus(q: OfferQuestion): string {
  if (q.owner === 'relay') return 'Answered by Relay from the approved offer';
  if (!q.reply) return 'With James';
  if (q.reply.mode === 'call')
    return q.outcome === 'call-accepted'
      ? `Still open · call booked for ${callSlot}`
      : 'Call offered';
  if (q.outcome === 'answered') return 'Answered by James';
  if (q.outcome === 'wants-call') return `Still open · call booked for ${callSlot}`;
  return 'James replied · waiting for Jeremy';
}
