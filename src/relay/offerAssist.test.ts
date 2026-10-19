import { describe, expect, it } from 'vitest';
import { offerPresets } from './fixtures';
import {
  checkOfferAssist,
  defaultReplyMode,
  detectConcerns,
  replyDraft,
  scriptedOfferAssist,
} from './offerAssist';

describe('offer triage', () => {
  it('routes each suggested question the same way every time', () => {
    expect(offerPresets.map((p) => scriptedOfferAssist(p.question).route)).toEqual([
      'answer',
      'answer',
      'james',
    ]);
  });

  it('answers a two-part routine question from both facts', () => {
    const assist = scriptedOfferAssist('When can I start, and is it hybrid?');
    expect(assist.route).toBe('answer');
    expect(assist.factsUsed).toEqual(['startWindow', 'workModel']);
  });

  it('detects every sensitive topic in a question', () => {
    expect(detectConcerns('Base salary, equity and visa sponsorship?')).toEqual(
      expect.arrayContaining(['compensation', 'equity', 'immigration']),
    );
    expect(detectConcerns('Do you like dogs?')).toEqual(['other']);
  });
});

describe('checkOfferAssist', () => {
  const safe = {
    concerns: ['start-date'],
    route: 'answer',
    answer:
      'Any Monday from 2 November to 30 November 2026 works. Tell James which one suits you.',
    factsUsed: ['startWindow'],
    reason: 'From the start date in the offer.',
  };

  it('accepts a routine answer that only uses cited facts', () => {
    expect(checkOfferAssist('When can I start?', safe)).toMatchObject({
      route: 'answer',
    });
  });

  it('keeps a live model’s rationale from introducing unapproved claims', () => {
    const checked = checkOfferAssist('When can I start?', {
      ...safe,
      reason: 'The company will make an exception for you.',
    });
    expect(checked?.reason).toBe('Answered from the approved offer: start date.');
  });

  it('rejects malformed output and numbers the cited facts do not contain', () => {
    expect(checkOfferAssist('When can I start?', { ...safe, reason: '' })).toBeNull();
    expect(
      checkOfferAssist('When can I start?', { ...safe, factsUsed: ['salary'] }),
    ).toBeNull();
    expect(
      checkOfferAssist('When can I start?', { ...safe, answer: 'Start on 9 November.' }),
    ).toBeNull();
    expect(checkOfferAssist('When can I start?', { ...safe, factsUsed: [] })).toBeNull();
    expect(
      checkOfferAssist('When can I start?', { ...safe, answer: undefined }),
    ).toBeNull();
  });

  it('refuses to let a model answer a sensitive question', () => {
    expect(checkOfferAssist('What about my salary and start date?', safe)).toBeNull();
  });

  it('accepts only the approved routine wording and exact fact set', () => {
    expect(
      checkOfferAssist('When can I start?', {
        ...safe,
        answer: 'Any Monday in November works.',
      }),
    ).toBeNull();
    expect(
      checkOfferAssist('When can I start?', {
        ...safe,
        factsUsed: ['startWindow', 'role'],
      }),
    ).toBeNull();
  });

  it('adds sensitive topics a model missed when it routes to James', () => {
    const routed = checkOfferAssist('Could you sponsor my H-1B?', {
      concerns: ['other'],
      route: 'james',
      answer: '',
      factsUsed: [],
      reason: 'Needs a person.',
    });
    expect(routed?.concerns).toContain('immigration');
  });

  it('preserves every detected part of a combined question sent to James', () => {
    const routed = checkOfferAssist(
      'Can we discuss the base salary and H-1B sponsorship?',
      {
        concerns: ['compensation'],
        route: 'james',
        answer: '',
        factsUsed: [],
        reason: 'Compensation needs James.',
      },
    );
    expect(routed?.concerns).toEqual(['compensation', 'immigration']);
  });

  it('does not accept hidden model answers or facts on questions for James', () => {
    expect(
      checkOfferAssist('Could you sponsor my visa?', {
        concerns: ['immigration'],
        route: 'james',
        answer: 'We can sponsor you.',
        factsUsed: [],
        reason: 'James needs to confirm.',
      }),
    ).toBeNull();
  });
});

describe('reply drafts for James', () => {
  it('drafts a pay answer from the approved base, and leaves unknowns to James', () => {
    const pay = scriptedOfferAssist('Is there any room on the base salary?');
    expect(defaultReplyMode(pay)).toBe('written');
    expect(replyDraft(pay, 'written')).toContain('$245,000');
    const visa = scriptedOfferAssist('Could you sponsor my visa?');
    expect(defaultReplyMode(visa)).toBe('call');
    expect(replyDraft(visa, 'written')).toBe('');
  });
});
