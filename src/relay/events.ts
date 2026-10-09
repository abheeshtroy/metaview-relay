import type { AnswerId, ClaimId } from './fixtures';

// Events carry only what the person submitted. Whether text differs from the
// script is derived by the reducer, never asserted by the UI.
export type RelayEvent =
  | { type: 'context-submitted'; text: string }
  | { type: 'clarification-answered'; answerId: AnswerId; text: string }
  | { type: 'claim-accepted'; claimId: ClaimId }
  | { type: 'claim-corrected'; claimId: ClaimId; note: string }
  | { type: 'clarification-sent'; claimId: ClaimId; question: string }
  | { type: 'followup-answered'; claimId: ClaimId; text: string }
  | { type: 'custom-answer-accepted'; claimId: ClaimId }
  | { type: 'claim-left-unresolved'; claimId: ClaimId }
  | { type: 'unmapped-context-accepted' }
  | { type: 'unmapped-context-left-unresolved' }
  | { type: 'unmapped-context-followup-sent'; question: string }
  | { type: 'unmapped-context-followup-answered'; text: string }
  | { type: 'interview-started' }
  | { type: 'interview-question-sent'; question: string }
  | { type: 'interview-answer-submitted'; text: string }
  | { type: 'interview-followup-sent'; question: string }
  | { type: 'interview-answer-accepted' }
  | { type: 'interview-answer-left-unresolved' };

export type Actor = 'jeremy' | 'relay' | 'james';
