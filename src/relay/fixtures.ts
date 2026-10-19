// Synthetic demo script. Every person, company, number and sentence here is fictional.

import type { Coverage, TranscriptExcerpt, TranscriptLine } from './interviewAssist';

export const people = {
  candidate: { name: 'Jeremy Clarkson', first: 'Jeremy', initials: 'JC' },
  recruiter: { name: 'James May', first: 'James', initials: 'JM' },
  employer: 'AutoFarm',
  role: 'Staff Software Engineer, AI Infrastructure',
};

// ---------- Apply ----------

/** What James sees of the application before Jeremy adds anything. */
export const resumeSummary =
  'Résumé: six years of software at a vehicle maker, on perception, fleet updates and test rigs. It never mentions model serving.';

/** What Relay could not tell from the application alone. */
export const openQuestionAtStart =
  'How recently has Jeremy run model-serving or evaluation infrastructure? His application does not say.';

export const applicationPrompt =
  'Is there anything relevant to this role that your résumé doesn’t make obvious?';

export const scriptedNote =
  'My résumé reads as automotive, but most of the last six years was ML systems work. I worked on the on-vehicle inference stack for our perception models, where every frame had a hard 30 ms latency budget. I built the over-the-air pipeline that shipped model updates to the fleet in staged canaries, and the hardware-in-the-loop rig we used to validate each model before release. That feels close to serving, rollout and evaluation infrastructure.';

export type ClaimId = 'latency' | 'rollout' | 'validation';

export interface ClaimTemplate {
  id: ClaimId;
  /** The exact phrase in Jeremy's note that the reading rests on. */
  evidence: string;
  skill: string;
  roleNeed: string;
}

export const claimTemplates: ClaimTemplate[] = [
  {
    id: 'latency',
    evidence: 'hard 30 ms latency budget',
    skill: 'Inference under hard latency budgets',
    roleNeed: 'Latency targets for model serving',
  },
  {
    id: 'rollout',
    evidence: 'staged canaries',
    skill: 'Staged model rollout to a fleet',
    roleNeed: 'Safe rollout of new model versions',
  },
  {
    id: 'validation',
    evidence: 'hardware-in-the-loop rig',
    skill: 'Pre-release model validation',
    roleNeed: 'Evaluation infrastructure',
  },
];

export type AnswerId = 'owned-runtime' | 'built-tooling';

/** The one thing in Jeremy's note that James could read two ways. */
export const clarification = {
  target: 'latency' as ClaimId,
  question:
    'On the on-vehicle inference stack, did you run the runtime in production, or build tooling around a runtime another team owned?',
  answers: [
    {
      id: 'owned-runtime' as const,
      label: 'I ran it',
      text: 'I owned the runtime in production for two years, including on-call, across roughly 40,000 vehicles.',
    },
    {
      id: 'built-tooling' as const,
      label: 'I built the tooling',
      text: 'I built the release and validation tooling. The ML platform team owned the runtime itself.',
    },
  ],
};

/** How Relay reads each claim. `unread`: Jeremy wrote his own answer, so James reads it. */
export type ReadingBasis = 'note' | 'answer' | 'narrowed' | 'unread';

export interface AnswerEffect {
  basis: Record<ClaimId, ReadingBasis>;
  skillOverride?: Partial<Record<ClaimId, string>>;
  openQuestion: string;
  /** Why the open question is still open, for James. */
  openBecause: string;
  plan: QuestionId;
}

export const answerEffects: Record<AnswerId, AnswerEffect> = {
  'owned-runtime': {
    basis: { latency: 'answer', rollout: 'note', validation: 'note' },
    openQuestion:
      'Does his on-vehicle serving work carry over to many teams’ models sharing data-centre GPUs?',
    openBecause:
      'He ran a runtime with a few models per vehicle. Nothing he has said covers many tenants on shared hardware.',
    plan: 'shared-gpu-translation',
  },
  'built-tooling': {
    basis: { latency: 'narrowed', rollout: 'answer', validation: 'answer' },
    skillOverride: { latency: 'Tooling around latency-bounded inference' },
    openQuestion:
      'Has Jeremy run a model-serving runtime himself, or only the tooling around one?',
    openBecause:
      'His answer says another team owned the runtime. The role needs someone who has operated one.',
    plan: 'runtime-split',
  },
};

/** When Jeremy answers in his own words, Relay quotes them and leaves the reading to James. */
export const ownWordsEffect = {
  openQuestion:
    'Has Jeremy run a model-serving runtime himself? He answered in his own words.',
  openBecause: 'Relay doesn’t interpret an answer written in his own words. Read it.',
};

/** When Relay finds nothing in the note to link, the reading is James's from the start. */
export const unlinkedNote =
  'Relay couldn’t link anything in his note to this role, so it didn’t ask him anything. Read it yourself.';

// ---------- Interview ----------

export const interviewCall = {
  length: '45 minutes',
  minutes: 45,
  decisionBy: 'Monday 12 October',
};

export type SlotId = 'tue' | 'wed' | 'thu';

/** Open times on James's calendar. Relay offers them; Jeremy picks. */
export const interviewSlots: {
  id: SlotId;
  day: string;
  /** Minutes since midnight. */
  startsAt: number;
}[] = [
  { id: 'tue', day: 'Tue 6 Oct', startsAt: 15 * 60 },
  { id: 'wed', day: 'Wed 7 Oct', startsAt: 10 * 60 + 30 },
  { id: 'thu', day: 'Thu 8 Oct', startsAt: 14 * 60 },
];

export const clock = (m: number) =>
  `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
export const slotLabel = (slot: (typeof interviewSlots)[number]) =>
  `${slot.day}, ${clock(slot.startsAt)}`;

export type QuestionId = 'shared-gpu-translation' | 'runtime-split';

export interface InterviewPlan {
  id: QuestionId;
  /** What James asks, word for word. Only the hiring team sees it. */
  question: string;
  /** Why Relay suggests it, for James. */
  why: string;
  /** The topic Jeremy is told in advance. Candidate-safe. */
  prep: string;
}

export const interviewPlans: Record<QuestionId, InterviewPlan> = {
  'shared-gpu-translation': {
    id: 'shared-gpu-translation',
    question:
      'Your runtime served a few models per vehicle. What would change if many teams’ models shared the same GPUs?',
    why: 'Goes straight at whether his on-vehicle serving work carries over to shared GPUs.',
    prep: 'James would like to hear how your on-vehicle serving work might carry over to serving many models on shared GPUs.',
  },
  'runtime-split': {
    id: 'runtime-split',
    question:
      'When the runtime misbehaved in production, what did you handle yourself, and what went to the platform team?',
    why: 'Separates what Jeremy operated himself from what he built around it.',
    prep: 'James would like to hear how production responsibilities were split between you and the ML platform team.',
  },
};

export interface FollowUp {
  /** Relay's question to Jeremy after the call, about a topic there wasn't time for. */
  question: string;
  /** A suggested reply for the demo. Whatever Jeremy sends is quoted, never interpreted. */
  scriptedReply: string;
}

const excerpt = (
  plan: InterviewPlan,
  lines: Omit<TranscriptLine, 'speaker'>[],
): TranscriptExcerpt => ({
  questionId: plan.id,
  source: 'synthetic-fixture',
  lines: lines.map((l, i) => ({ ...l, speaker: i === 0 ? 'james' : 'jeremy' })),
});

/** The transcript moment for each plan, what it covers, and the follow-up it leaves. */
export const interviewScripts: Record<
  QuestionId,
  { excerpt: TranscriptExcerpt; coverage: Coverage; followUp: FollowUp }
> = {
  'shared-gpu-translation': {
    excerpt: excerpt(interviewPlans['shared-gpu-translation'], [
      { at: '18:04', text: interviewPlans['shared-gpu-translation'].question },
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
    followUp: {
      question:
        'There wasn’t time to get into quotas, noisy neighbours or cost when many models share hardware. Have you worked on anything like that?',
      scriptedReply:
        'I sized the accelerator for the next vehicle generation, working out how many models it could host within budget and what each one could use at peak. That’s the closest I’ve come to capacity planning for shared hardware.',
    },
  },
  'runtime-split': {
    excerpt: excerpt(interviewPlans['runtime-split'], [
      { at: '15:10', text: interviewPlans['runtime-split'].question },
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
    followUp: {
      question:
        'There wasn’t time to cover on-call. Have you carried a pager for a serving system yourself?',
      scriptedReply:
        'Not as primary. I was secondary on-call for the release pipeline, and joined the runtime team’s rotation for two major launches.',
    },
  },
};

export type DebriefOutcome = 'advance' | 'hold';

// ---------- Offer / Close ----------

/** AutoFarm's approved offer. Relay may answer only from these, and only on routine topics. */
export type OfferFactId =
  | 'role'
  | 'base'
  | 'equity'
  | 'startWindow'
  | 'workModel'
  | 'firstYear'
  | 'onboarding'
  | 'replyBy';

export const offerFacts: Record<OfferFactId, { label: string; value: string }> = {
  role: { label: 'Role', value: people.role },
  base: { label: 'Base salary', value: '$245,000 a year' },
  equity: { label: 'Equity', value: '$400,000 in RSUs, vesting over four years' },
  startWindow: {
    label: 'Start date',
    value: 'Any Monday from 2 November to 30 November 2026',
  },
  workModel: {
    label: 'Work model',
    value: 'Hybrid: Tuesday to Thursday in the Seattle office',
  },
  firstYear: {
    label: 'First year',
    value:
      'Lead GPU scheduling for the shared inference platform and mentor two engineers',
  },
  onboarding: {
    label: 'Onboarding',
    value: 'A six-week ramp, paired with the inference platform lead',
  },
  replyBy: { label: 'Reply by', value: 'Friday 23 October 2026' },
};

export const offerDay = 'Fri 9 Oct';

export type OfferPresetId = 'start-date' | 'first-year' | 'base-salary';

/** Suggested questions in Jeremy's portal. They run through the same triage as his own words. */
export const offerPresets: { id: OfferPresetId; question: string }[] = [
  { id: 'start-date', question: 'How flexible is the start date?' },
  { id: 'first-year', question: 'What would I own in the first year?' },
  { id: 'base-salary', question: 'Is there any room on the base salary?' },
];

/** James's held slot, offered when he would rather talk than write. */
export const callSlot = 'Thursday 15 October at 11:00';
