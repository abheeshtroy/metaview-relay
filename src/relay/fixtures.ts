// Synthetic demo script. Every person, company and sentence here is fictional.

import type {
  Coverage,
  QuestionSuggestion,
  TranscriptExcerpt,
  TranscriptLine,
} from './interviewAssist';

export type ClaimId = 'latency' | 'rollout' | 'validation';
export type AnswerId = 'owned-runtime' | 'built-tooling';
export type Confidence =
  | 'unclarified'
  | 'clarified'
  | 'narrowed'
  // Jeremy edited the scripted answer, so Relay does not interpret it.
  | 'uninterpreted'
  // James read Jeremy's own answer and accepted it as written.
  | 'accepted-as-written';

export const people = {
  candidate: { name: 'Jeremy Clarkson', first: 'Jeremy', initials: 'JC' },
  recruiter: { name: 'James May', first: 'James', initials: 'JM' },
  employer: 'AutoFarm',
  role: 'Staff Software Engineer, AI Infrastructure',
  location: 'Seattle, WA · open to hybrid',
};

export const openQuestionAtStart =
  'How recently has Jeremy operated model-serving or evaluation infrastructure? His application does not say.';

export const conciergePrompt =
  'Is there anything relevant to this role that your résumé doesn’t make obvious?';

export const scriptedNote =
  'My résumé reads as automotive, but most of the last six years was ML systems work. I worked on the on-vehicle inference stack for our perception models, where every frame had a hard 30 ms latency budget. I built the over-the-air pipeline that shipped model updates to the fleet in staged canaries, and the hardware-in-the-loop rig we used to validate each model before release. That feels close to serving, rollout and evaluation infrastructure.';

export interface ClaimTemplate {
  id: ClaimId;
  evidence: string;
  skill: string;
  roleNeed: string;
  correctionNote: string;
  draftQuestion: string;
  scriptedFollowUp: string;
}

export const claimTemplates: ClaimTemplate[] = [
  {
    id: 'latency',
    evidence: 'hard 30 ms latency budget',
    skill: 'Inference under hard latency budgets',
    roleNeed: 'Latency and reliability targets for model serving',
    correctionNote:
      'Strong latency instincts, but embedded inference isn’t the same as multi-tenant GPU serving. Worth exploring in the screen.',
    draftQuestion:
      'Could you share a time you traded latency against reliability in the inference stack? What did you change?',
    scriptedFollowUp:
      'We were missing the 30 ms budget on older hardware. I moved pre-processing onto the accelerator and added a fallback model, and accepted a small accuracy drop on those vehicles.',
  },
  {
    id: 'rollout',
    evidence: 'staged canaries',
    skill: 'Staged model rollout to a fleet',
    roleNeed: 'Safe rollout of new model versions',
    correctionNote:
      'Reads as release engineering more than model serving. Still valuable; I’d like to discuss scope with the hiring manager.',
    draftQuestion: 'When a canary went wrong, how did you detect it and roll back?',
    scriptedFollowUp:
      'Each canary group reported on-vehicle health metrics. If false-positive braking events rose above baseline, the rollout paused and the previous model was restored automatically.',
  },
  {
    id: 'validation',
    evidence: 'hardware-in-the-loop rig',
    skill: 'Pre-release model validation',
    roleNeed: 'Evaluation infrastructure',
    correctionNote:
      'HIL validation is closer to QA than to eval infrastructure here. I want to hear how he would apply it.',
    draftQuestion: 'How did you decide a model was ready to ship from the rig results?',
    scriptedFollowUp:
      'We replayed a fixed library of recorded drives and required no regressions on safety-critical scenarios. Anything borderline went to a human review board.',
  },
];

export const clarification = {
  // The claim this question is about; a custom answer leaves it to James.
  target: 'latency' as ClaimId,
  question:
    'One question so James reads this correctly: on the on-vehicle inference stack, did you operate the runtime in production, or build tooling around a runtime another team owned?',
  answers: [
    {
      id: 'owned-runtime' as const,
      text: 'I owned the runtime in production for two years, including on-call, across roughly 40,000 vehicles.',
    },
    {
      id: 'built-tooling' as const,
      text: 'I built the release and validation tooling. The ML platform team owned the runtime itself.',
    },
  ],
};

export interface AnswerEffect {
  confidence: Record<ClaimId, Confidence>;
  skillOverride?: Partial<Record<ClaimId, string>>;
  openQuestion: string;
  signal: string;
}

export const answerEffects: Record<AnswerId, AnswerEffect> = {
  'owned-runtime': {
    confidence: {
      latency: 'clarified',
      rollout: 'unclarified',
      validation: 'unclarified',
    },
    openQuestion:
      'How does on-vehicle serving at fleet scale translate to multi-tenant GPU serving at AutoFarm?',
    signal: 'Jeremy says he operated the inference runtime in production.',
  },
  'built-tooling': {
    confidence: { latency: 'narrowed', rollout: 'clarified', validation: 'clarified' },
    skillOverride: { latency: 'Tooling around latency-bounded inference' },
    openQuestion:
      'Has Jeremy operated a model-serving runtime directly, or only the tooling around one?',
    signal: 'Jeremy says he built the tooling; another team operated the runtime.',
  },
};

export const confidenceLabel: Record<Confidence, string> = {
  unclarified: 'Inferred · not yet clarified',
  clarified: 'Clarified by Jeremy',
  narrowed: 'Narrowed by Jeremy’s answer',
  uninterpreted: 'Own-words answer · not interpreted by Relay',
  'accepted-as-written': 'Jeremy’s own answer · accepted by James',
};

// Deterministic demo clock: Thursday 8 October, starting 10:02, three minutes per
// step. After the interview, the clock restarts from when the call ended.
export interface ClockAnchor {
  seq: number;
  minutes: number;
}
export const dayStart: ClockAnchor = { seq: 0, minutes: 10 * 60 + 2 };

export function demoTime(seq: number, anchor: ClockAnchor = dayStart): string {
  const total = anchor.minutes + (seq - anchor.seq) * 3;
  const hh = Math.floor(total / 60);
  const mm = String(total % 60).padStart(2, '0');
  return `Thu ${hh}:${mm}`;
}

// ---------- Interview ----------
// The interview itself happens off screen. These are the synthetic outputs a
// bounded assistant would produce around it; see interviewAssist.ts.

export const interviewCall = {
  when: 'Thu 8 Oct · 14:00',
  length: '45 min',
  /** Minutes since midnight when the call starts and ends, for the demo clock. */
  startsAt: 14 * 60,
  endsAt: 14 * 60 + 45,
};

export type QuestionId =
  'shared-gpu-translation' | 'runtime-split' | 'recent-hands-on' | 'broad-overview';

const broadOverview: QuestionSuggestion = {
  id: 'broad-overview',
  kind: 'broad',
  question: 'Walk me through the ML systems you’ve worked on most recently.',
  why: 'Open-ended and good for rapport, but the answer may never reach your open question.',
  prep: 'James would like an overview of the ML systems you’ve worked on most recently.',
};

/** One targeted suggestion for each open question the Apply stage can leave. */
const targetedByOpenQuestion: Record<string, QuestionSuggestion> = {
  [answerEffects['owned-runtime'].openQuestion]: {
    id: 'shared-gpu-translation',
    kind: 'targeted',
    question:
      'Your runtime served a few models per vehicle. What would change if many teams’ models shared the same GPUs?',
    why: 'Goes straight at whether his on-vehicle serving work carries over to shared GPUs.',
    prep: 'James would like to hear how your on-vehicle serving work might carry over to serving many models on shared GPUs.',
  },
  [answerEffects['built-tooling'].openQuestion]: {
    id: 'runtime-split',
    kind: 'targeted',
    question:
      'When the runtime misbehaved in production, what did you handle yourself, and what went to the platform team?',
    why: 'Separates what Jeremy operated himself from what he built around it.',
    prep: 'James would like to hear how production responsibilities were split between you and the ML platform team.',
  },
  [openQuestionAtStart]: {
    id: 'recent-hands-on',
    kind: 'targeted',
    question:
      'When were you last hands-on with model-serving or evaluation infrastructure, and what did that involve day to day?',
    why: 'Asks for the recency and day-to-day detail the application leaves out.',
    prep: 'James would like to hear when you last worked hands-on with model-serving or evaluation systems, and what that looked like day to day.',
  },
};

/** Targeted first, then the broad opener. Unknown open questions get the application's. */
export function questionSuggestionsFor(openQuestion: string): QuestionSuggestion[] {
  return [
    targetedByOpenQuestion[openQuestion] ?? targetedByOpenQuestion[openQuestionAtStart],
    broadOverview,
  ];
}

const excerpt = (
  question: QuestionSuggestion,
  lines: Omit<TranscriptLine, 'speaker'>[],
): TranscriptExcerpt => ({
  questionId: question.id,
  source: 'synthetic-fixture',
  lines: lines.map((l, i) => ({ ...l, speaker: i === 0 ? 'james' : 'jeremy' })),
});

const targeted = (id: QuestionId) =>
  Object.values(targetedByOpenQuestion).find((q) => q.id === id) as QuestionSuggestion;

/** The transcript moment for each question, and what it does and doesn't cover. */
export const interviewScripts: Record<
  QuestionId,
  { excerpt: TranscriptExcerpt; coverage: Coverage }
> = {
  'shared-gpu-translation': {
    excerpt: excerpt(targeted('shared-gpu-translation'), [
      { at: '18:04', text: targeted('shared-gpu-translation').question },
      {
        at: '18:20',
        text: 'The latency discipline carries over. We profiled every model against a fixed budget and refused releases that blew it. What I haven’t done is schedule lots of tenants on one card.',
      },
      {
        at: '18:58',
        text: 'The closest was perception and driver monitoring sharing one accelerator. Each got a fixed time slice so neither could starve the other. I’d expect shared GPUs to need the same idea, with admission control on top.',
      },
    ]),
    coverage: {
      addresses: [
        { point: 'Latency budgets and release gating carry over', at: '18:20' },
        { point: 'Has isolated two models on one accelerator', at: '18:58' },
        { point: 'Says he hasn’t scheduled many tenants on one GPU', at: '18:20' },
      ],
      notAddressed: [
        'How he would handle quotas, noisy neighbours or cost at AutoFarm’s scale',
        'Any experience with data-centre serving frameworks',
      ],
    },
  },
  'runtime-split': {
    excerpt: excerpt(targeted('runtime-split'), [
      { at: '15:10', text: targeted('runtime-split').question },
      {
        at: '15:24',
        text: 'The platform team carried the pager for the runtime. When a release regressed, my tooling caught it in the canary and rolled the fleet back. I wrote that rollback path and I owned it.',
      },
      {
        at: '16:02',
        text: 'I wasn’t tuning the runtime itself. But I was in every incident review that involved a model, because the release data usually explained what had happened.',
      },
    ]),
    coverage: {
      addresses: [
        { point: 'Owned release and rollback tooling, not the runtime', at: '15:24' },
        { point: 'Took part in model-related incident reviews', at: '16:02' },
      ],
      notAddressed: [
        'Whether he has ever been on call for a serving system',
        'How he would ramp up on runtime ownership at AutoFarm',
      ],
    },
  },
  'recent-hands-on': {
    excerpt: excerpt(targeted('recent-hands-on'), [
      { at: '11:32', text: targeted('recent-hands-on').question },
      {
        at: '11:45',
        text: 'Evaluation, this year. I ran the hardware-in-the-loop rig and decided which recorded drives went into the regression set.',
      },
      {
        at: '12:20',
        text: 'Serving, last spring, during the fleet rollout of the new detection model. Since then I’ve been closer to validation than to the runtime.',
      },
    ]),
    coverage: {
      addresses: [
        { point: 'Hands-on evaluation work this year', at: '11:45' },
        { point: 'Last serving work was last spring', at: '12:20' },
      ],
      notAddressed: [
        'How much of the serving work he did himself',
        'The scale of the serving systems involved',
      ],
    },
  },
  'broad-overview': {
    excerpt: excerpt(broadOverview, [
      { at: '06:41', text: broadOverview.question },
      {
        at: '06:52',
        text: 'Most recently, the perception models on our vehicles: the on-vehicle inference stack, the over-the-air pipeline that shipped updates in canary groups, and the rig we validated every model on.',
      },
      {
        at: '07:31',
        text: 'The part I enjoyed most was the rig. Replaying thousands of recorded drives against a new model and seeing exactly where it got worse.',
      },
    ]),
    coverage: {
      addresses: [
        { point: 'What he worked on: inference, rollout and validation', at: '06:52' },
        { point: 'Most energised by evaluation work', at: '07:31' },
      ],
      notAddressed: [
        'The open question: nothing here speaks to it directly',
        'His own role versus his team’s in running these systems',
      ],
    },
  },
};

/** Jeremy's suggested addition at recap. Edited or not, Relay never interprets it. */
export const scriptedAddendum =
  'One thing I didn’t get to say: I sized the accelerator for the next vehicle generation, working out how many models it could host within budget. That’s the closest I’ve come to capacity planning for shared hardware.';

export type DebriefOutcome = 'answered-for-now' | 'still-open';

export const debriefOutcomeLabel: Record<DebriefOutcome, string> = {
  'answered-for-now': 'Answered for now',
  'still-open': 'Still open',
};

/** Starter notes for the demo. James's to rewrite; they never come from Relay. */
export const debriefNoteStarters: Record<DebriefOutcome, string> = {
  'answered-for-now':
    'Answered enough to move forward. Carry the gaps Relay listed into the next round rather than treating them as settled.',
  'still-open':
    'Not answered yet. I want the hiring manager’s view before we decide on next steps.',
};
