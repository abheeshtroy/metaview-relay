// Synthetic demo script. Every person, company and sentence here is fictional.

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

export const interviewQuestion =
  'Tell me about a time you had to make a model rollout safe while keeping a tight latency budget.';

export const scriptedInterviewAnswer =
  'During a staged rollout, older vehicles missed the latency budget. I paused the next canary, moved pre-processing onto the accelerator, and used a smaller fallback model while we measured the safety impact before continuing.';

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

// Deterministic demo clock: Thursday 8 October, starting 10:02.
export function demoTime(seq: number): string {
  const total = 10 * 60 + 2 + seq * 3;
  const hh = Math.floor(total / 60);
  const mm = String(total % 60).padStart(2, '0');
  return `Thu ${hh}:${mm}`;
}
