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
    answer: 'Any Monday from 2 November to 30 November 2026 works.',
    factsUsed: ['startWindow'],
    reason: 'From the start date in the offer.',
  };

  it('accepts a routine answer that only uses cited facts', () => {
    expect(checkOfferAssist('When can I start?', safe)).toMatchObject({
      route: 'answer',
    });
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
  });

  it('refuses to let a model answer a sensitive question', () => {
    expect(checkOfferAssist('What about my salary and start date?', safe)).toBeNull();
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
