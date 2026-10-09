import { interviewScripts, questionSuggestionsFor, type QuestionId } from './fixtures';

// The Interview stage's AI boundary. Relay may suggest questions, extract the
// transcript moment that belongs to the chosen question, and note what that
// moment does and does not cover. It never concludes; James does.
//
// The demo uses `scriptedAssist`, which is deterministic. A live provider would
// run outside the reducer, record its output in the event it dispatches, and fall
// back to `scriptedAssist` when it fails or its output does not pass the checks
// below. The reducer re-checks every output, so a bad suggestion or a mismatched
// excerpt is ignored rather than shown.

export interface QuestionSuggestion {
  id: string;
  /** Aimed at the open question, or a broad opener. */
  kind: 'targeted' | 'broad';
  question: string;
  /** Why Relay suggests it, for James only. */
  why: string;
  /** What Jeremy is told about the topic. Candidate-safe: no internal notes. */
  prep: string;
}

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

export interface InterviewAssist {
  suggestQuestions(input: { openQuestion: string }): QuestionSuggestion[];
  extractExcerpt(input: {
    question: QuestionSuggestion;
  }): { excerpt: TranscriptExcerpt; coverage: Coverage } | undefined;
}

export const scriptedAssist: InterviewAssist = {
  suggestQuestions: ({ openQuestion }) => questionSuggestionsFor(openQuestion),
  extractExcerpt: ({ question }) => interviewScripts[question.id as QuestionId],
};

const filled = (s: string) => s.trim().length > 0;

/** Exactly two distinct, complete suggestions. */
export function validSuggestions(suggestions: QuestionSuggestion[]): boolean {
  return (
    suggestions.length === 2 &&
    new Set(suggestions.map((s) => s.id)).size === 2 &&
    suggestions.every((s) => [s.id, s.question, s.why, s.prep].every(filled))
  );
}

/**
 * An excerpt belongs to a question only if it is tagged with that question and
 * opens with James asking it word for word. Every coverage point must cite a
 * line Jeremy actually said in the excerpt.
 */
export function excerptBelongsTo(
  question: QuestionSuggestion,
  excerpt: TranscriptExcerpt,
  coverage: Coverage,
): boolean {
  const [first, ...rest] = excerpt.lines;
  const jeremyLines = new Set(
    excerpt.lines.filter((l) => l.speaker === 'jeremy').map((l) => l.at),
  );
  return (
    excerpt.questionId === question.id &&
    first?.speaker === 'james' &&
    first.text === question.question &&
    rest.length > 0 &&
    excerpt.lines.every((l) => filled(l.text)) &&
    coverage.addresses.every((a) => filled(a.point) && jeremyLines.has(a.at)) &&
    coverage.notAddressed.every(filled) &&
    coverage.addresses.length + coverage.notAddressed.length > 0
  );
}
