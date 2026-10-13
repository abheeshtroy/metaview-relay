import type { AnswerId, DebriefOutcome, QuestionId, SlotId } from './fixtures';
import type { CallNotes, TranscriptExcerpt } from './interviewAssist';
import type { OfferAssist, ReplyMode } from './offerAssist';

// Events carry only what a person did, or what Relay produced. AI output travels
// in the event that delivers it, so replay never depends on a provider. Whether
// text differs from a suggestion is derived by the reducer, never asserted here.
export type RelayEvent =
  // Apply
  | { type: 'note-shared'; text: string }
  | { type: 'clarification-answered'; answerId: AnswerId; text: string }
  | { type: 'interview-invited'; questionId: QuestionId }
  // Interview
  | { type: 'interview-booked'; slotId: SlotId }
  | { type: 'call-question-asked'; excerpt: TranscriptExcerpt }
  | ({ type: 'call-ended' } & CallNotes)
  | { type: 'follow-up-answered'; text?: string }
  | { type: 'debrief-decided'; outcome: DebriefOutcome; note?: string }
  // Offer / Close
  | { type: 'offer-question-asked'; question: string; assist: OfferAssist }
  | { type: 'offer-sent-to-james'; questionId: string }
  | { type: 'offer-reply-sent'; questionId: string; mode: ReplyMode; text: string }
  | { type: 'offer-reply-acknowledged'; questionId: string; outcome: AckOutcome }
  | { type: 'offer-finished' };

/** What Jeremy says about James's reply. A call is booked, never "resolved". */
export type AckOutcome = 'answered' | 'wants-call' | 'call-accepted';

export type Actor = 'jeremy' | 'relay' | 'james';
