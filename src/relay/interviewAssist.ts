import { interviewScripts, type FollowUp, type InterviewPlan } from './fixtures';

// The Interview stage's AI boundary. In the call, Relay marks the moment James
// asks his planned question and quotes it exactly. When the call ends, it notes
// what the answer covers and leaves open, and writes one follow-up for Jeremy on
// what was missed. It never decides.
//
// The demo uses `scriptedAssist`, which replays recorded output. A live notetaker
// would run outside the reducer and record its output in the event it dispatches.
// The reducer re-checks every output, so a mismatched excerpt or note is ignored.

export interface TranscriptLine {
  /** Minutes and seconds into the call. */
  at: string;
  speaker: 'james' | 'jeremy';
  text: string;
}

export interface TranscriptExcerpt {
  questionId: string;
  source: 'synthetic-fixture';
  lines: TranscriptLine[];
}

/** What the excerpt speaks to, each point cited to a line Jeremy said. */
export interface Coverage {
  addresses: { point: string; at: string }[];
  notAddressed: string[];
}

export interface CallNotes {
  coverage: Coverage;
  followUp: FollowUp;
}

export const scriptedAssist = {
  excerptFor: (plan: InterviewPlan): TranscriptExcerpt =>
    interviewScripts[plan.id].excerpt,
  notesFor: (plan: InterviewPlan): CallNotes => {
    const { coverage, followUp } = interviewScripts[plan.id];
    return { coverage, followUp };
  },
};

const filled = (s: string) => s.trim().length > 0;

/**
 * An excerpt belongs to a plan only if it is tagged with it and opens with James
 * asking the question word for word, followed by Jeremy's answer.
 */
export function excerptBelongsTo(plan: InterviewPlan, excerpt: TranscriptExcerpt) {
  const [first, ...rest] = excerpt.lines;
  return (
    excerpt.questionId === plan.id &&
    first?.speaker === 'james' &&
    first.text === plan.question &&
    rest.some((l) => l.speaker === 'jeremy') &&
    excerpt.lines.every((l) => filled(l.text))
  );
}

/** Every coverage point must cite a line Jeremy actually said, and there must be a follow-up. */
export function notesFit(excerpt: TranscriptExcerpt, notes: CallNotes): boolean {
  const { coverage, followUp } = notes;
  const jeremyLines = new Set(
    excerpt.lines.filter((l) => l.speaker === 'jeremy').map((l) => l.at),
  );
  return (
    coverage.addresses.length > 0 &&
    coverage.addresses.every((a) => filled(a.point) && jeremyLines.has(a.at)) &&
    coverage.notAddressed.every(filled) &&
    filled(followUp.question)
  );
}
