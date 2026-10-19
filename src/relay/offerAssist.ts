import { callSlot, offerFacts, people, type OfferFactId } from './fixtures.js';

// The Offer / Close AI boundary. Relay triages each of Jeremy's questions. It may
// answer on its own only when the question is routine and AutoFarm's approved offer
// answers it fully. Pay, equity, visas, benefits and anything uncertain go to James.
//
// A live model proposes; `checkOfferAssist` decides. The server and the reducer
// both run it, so an answer that cites the wrong facts, mentions a number the
// facts don't contain, or touches a sensitive topic never reaches Jeremy.

export type ConcernType =
  | 'start-date'
  | 'work-model'
  | 'role-scope'
  | 'timeline'
  | 'compensation'
  | 'equity'
  | 'immigration'
  | 'relocation'
  | 'benefits'
  | 'other';

export const concernTypes: ConcernType[] = [
  'start-date',
  'work-model',
  'role-scope',
  'timeline',
  'compensation',
  'equity',
  'immigration',
  'relocation',
  'benefits',
  'other',
];

/** The only topics Relay may answer without James. */
export const routineConcerns: ConcernType[] = [
  'start-date',
  'work-model',
  'role-scope',
  'timeline',
];

export const concernLabel: Record<ConcernType, string> = {
  'start-date': 'Start date',
  'work-model': 'Work model',
  'role-scope': 'Role and growth',
  timeline: 'Timeline',
  compensation: 'Pay',
  equity: 'Equity',
  immigration: 'Visa',
  relocation: 'Relocation',
  benefits: 'Benefits',
  other: 'Something Relay can’t answer',
};

export interface OfferAssist {
  /** Every topic the question touches, so a two-part question loses neither part. */
  concerns: ConcernType[];
  route: 'answer' | 'james';
  /** Present only when Relay answers. */
  answer?: string;
  factsUsed: OfferFactId[];
  /** One sentence: which facts answered it, or why James should. */
  reason: string;
  mode: 'live' | 'replay';
  status: 'success' | 'fallback' | 'provider-error';
}

const factIds = Object.keys(offerFacts) as OfferFactId[];

const detectors: [ConcernType, RegExp][] = [
  [
    'compensation',
    /salary|\bpay\b|\bbase\b|compensation|bonus|\braise\b|counter|negotiat/i,
  ],
  ['equity', /equity|\brsus?\b|stock|shares|\bvest/i],
  ['immigration', /visa|h-?1b|immigration|sponsor|green card|work permit/i],
  ['relocation', /relocat|moving to|move to/i],
  [
    'benefits',
    /benefit|insurance|health|pension|401k|parental|\bleave\b|holiday|\bpto\b|vacation/i,
  ],
  ['start-date', /\bstart|begin|join(ing)? date|first day/i],
  ['work-model', /hybrid|remote|office|in person|on.?site|days a week|from home/i],
  [
    'role-scope',
    /first year|\bown\b|scope|grow|responsib|day to day|mentor|onboard|ramp/i,
  ],
  [
    'timeline',
    /deadline|reply by|decide by|how long do i have|respond by|\bwhen do i need/i,
  ],
];

/** Topics that always need James, whatever a model says. */
const sensitiveQuestion =
  /salary|\bpay\b|\bbase\b|compensation|bonus|negotiat|counter|equity|\brsus?\b|stock|visa|h-?1b|immigration|sponsor|relocat|benefit|insurance/i;
/** Words a routine answer may never contain. */
const sensitiveAnswer =
  /\$|salary|compensation|equity|\brsus?\b|bonus|visa|immigration|relocat|benefit|negotiat|guarantee/i;

export function detectConcerns(question: string): ConcernType[] {
  const found = detectors.filter(([, re]) => re.test(question)).map(([type]) => type);
  return found.length ? found : ['other'];
}

const routineAnswers: Partial<
  Record<ConcernType, { facts: OfferFactId[]; answer: string }>
> = {
  'start-date': {
    facts: ['startWindow'],
    answer:
      'Any Monday from 2 November to 30 November 2026 works. Tell James which one suits you.',
  },
  'work-model': {
    facts: ['workModel'],
    answer: 'The role is hybrid: Tuesday to Thursday in the Seattle office.',
  },
  'role-scope': {
    facts: ['firstYear', 'onboarding'],
    answer:
      'In the first year you’d lead GPU scheduling for the shared inference platform and mentor two engineers. The first six weeks are a ramp, paired with the inference platform lead.',
  },
  timeline: {
    facts: ['replyBy'],
    answer: 'Please reply by Friday 23 October 2026.',
  },
};

const joinLabels = (concerns: ConcernType[]) =>
  concerns.map((c) => concernLabel[c].toLowerCase()).join(' and ');

/** Deterministic triage, used for suggested questions and whenever a live model is unavailable. */
export function scriptedOfferAssist(
  question: string,
  status: OfferAssist['status'] = 'fallback',
): OfferAssist {
  const concerns = detectConcerns(question);
  const routine =
    !sensitiveQuestion.test(question) &&
    concerns.every((c) => routineConcerns.includes(c));
  if (routine) {
    const parts = concerns.map((c) => routineAnswers[c]!);
    const factsUsed = [...new Set(parts.flatMap((p) => p.facts))];
    return {
      concerns,
      route: 'answer',
      answer: parts.map((p) => p.answer).join(' '),
      factsUsed,
      reason: `Answered from the approved offer: ${factsUsed.map((f) => offerFacts[f].label.toLowerCase()).join(', ')}.`,
      mode: 'replay',
      status,
    };
  }
  const forJames = concerns.filter((c) => !routineConcerns.includes(c) && c !== 'other');
  return {
    concerns,
    route: 'james',
    factsUsed: [],
    reason: forJames.length
      ? `${capitalise(joinLabels(forJames))} questions always go to James.`
      : 'The approved offer doesn’t answer this, so James should.',
    mode: 'replay',
    status,
  };
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function answerReason(factsUsed: OfferFactId[]) {
  return `Answered from the approved offer: ${factsUsed.map((fact) => offerFacts[fact].label.toLowerCase()).join(', ')}.`;
}

function jamesReason(concerns: ConcernType[]) {
  const forJames = concerns.filter(
    (concern) => !routineConcerns.includes(concern) && concern !== 'other',
  );
  return forJames.length
    ? `${capitalise(joinLabels(forJames))} questions always go to James.`
    : 'The approved offer doesn’t answer this, so James should.';
}

/** The one approved answer Relay may give for a complete set of routine topics. */
function routineAnswerFor(concerns: ConcernType[]) {
  if (!concerns.length || !concerns.every((concern) => routineConcerns.includes(concern)))
    return null;
  const parts = concerns.map((concern) => routineAnswers[concern]);
  if (parts.some((part) => !part)) return null;
  const answers = parts as { facts: OfferFactId[]; answer: string }[];
  return {
    answer: answers.map((part) => part.answer).join(' '),
    factsUsed: [...new Set(answers.flatMap((part) => part.facts))],
  };
}

function sameIds<T extends string>(actual: T[], expected: T[]) {
  return (
    actual.length === expected.length &&
    actual.every((id, index) => id === expected[index])
  );
}

/**
 * The single gate for model output. Returns a safe assist, or null when the output
 * is malformed or tries to answer something Relay may not answer.
 */
export function checkOfferAssist(
  question: string,
  value: unknown,
): Omit<OfferAssist, 'mode' | 'status'> | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  const concerns = data.concerns;
  const facts = data.factsUsed;
  if (
    !Array.isArray(concerns) ||
    concerns.length === 0 ||
    !concerns.every((c) => concernTypes.includes(c as ConcernType)) ||
    !Array.isArray(facts) ||
    !facts.every((f) => factIds.includes(f as OfferFactId)) ||
    (data.route !== 'answer' && data.route !== 'james') ||
    typeof data.answer !== 'string' ||
    typeof data.reason !== 'string' ||
    !data.reason.trim()
  )
    return null;
  // Keep Relay's deterministic reading as well as the model's interpretation.
  // In particular, a combined pay + start-date question must not lose the
  // start-date part just because pay requires James.
  const merged = [
    ...new Set([...detectConcerns(question), ...(concerns as ConcernType[])]),
  ];
  if (data.route === 'james') {
    // A routed question carries interpretation only. It never carries a hidden
    // proposed answer or facts that could be mistaken for James's approval.
    if ((typeof data.answer === 'string' && data.answer.trim()) || facts.length)
      return null;
    return {
      concerns: merged,
      route: 'james',
      factsUsed: [],
      reason: jamesReason(merged),
    };
  }
  const answer = typeof data.answer === 'string' ? data.answer.trim() : '';
  const used = facts as OfferFactId[];
  const approved = routineAnswerFor(merged);
  if (
    !answer ||
    used.length === 0 ||
    sensitiveQuestion.test(question) ||
    !approved ||
    sensitiveAnswer.test(answer) ||
    answer !== approved.answer ||
    !sameIds(used, approved.factsUsed)
  )
    return null;
  return {
    concerns: merged,
    route: 'answer',
    answer,
    factsUsed: used,
    reason: answerReason(used),
  };
}

export type ReplyMode = 'written' | 'call';

/** How James most likely wants to reply, before he chooses. */
export function defaultReplyMode(assist: OfferAssist): ReplyMode {
  return assist.concerns.every((c) => c === 'compensation') || assist.answer
    ? 'written'
    : 'call';
}

/**
 * Relay's draft for James. It uses only approved facts; where none apply, it
 * leaves the written answer to James rather than inventing one.
 */
export function replyDraft(assist: OfferAssist, mode: ReplyMode): string {
  if (mode === 'call')
    return `Good question, and easier to talk through. I’ve held ${callSlot} for us. Reply here if another time suits.`;
  if (assist.concerns.every((c) => c === 'compensation'))
    return `Thanks for asking. The base for this offer is ${offerFacts.base.value}, and it’s fixed for this level. I’m happy to talk through the equity if that would help.`;
  return assist.answer ?? '';
}

// ---------- Live provider contract ----------

export const offerAssistSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['concerns', 'route', 'answer', 'factsUsed', 'reason'],
  properties: {
    concerns: { type: 'array', items: { type: 'string', enum: concernTypes } },
    route: { type: 'string', enum: ['answer', 'james'] },
    answer: { type: 'string' },
    factsUsed: { type: 'array', items: { type: 'string', enum: factIds } },
    reason: { type: 'string' },
  },
} as const;

export const offerAssistInstructions = [
  `You triage one question from ${people.candidate.first}, a candidate holding an offer from ${people.employer}.`,
  'List every topic the question touches in concerns.',
  `Set route to "answer" only if every topic is one of ${routineConcerns.join(', ')} and the approved facts answer it completely. Then write a short, warm answer in the second person that uses only those facts, and list them in factsUsed.`,
  'Otherwise set route to "james", leave answer empty and factsUsed empty, and say in reason why the recruiter should answer.',
  'Pay, equity, visas, relocation, benefits, negotiation and any decision always go to james. Never invent a fact, number or promise.',
].join(' ');

export function offerAssistInput(question: string) {
  return JSON.stringify({
    question,
    approvedFacts: Object.fromEntries(factIds.map((id) => [id, offerFacts[id].value])),
  });
}
