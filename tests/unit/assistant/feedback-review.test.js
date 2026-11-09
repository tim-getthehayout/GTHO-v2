import { describe,it,expect,vi } from 'vitest';
import { mountFeedbackReview } from '../../../src/features/assistant/feedback-review.js';
import { openFeedbackSheet } from '../../../src/ui/header.js';
import { feedback } from '../../../src/features/assistant/shared.js';
const fact = value => ({ state: 'known',value,source: 'host' });
describe('normal feedback sheet library review orchestration',() => {
  it('propagates correction persistence failures; confirmed retries reuse exact handoff and post-confirmation correction revokes consent',async () => {
    const panel = document.createElement('div');let fail = false;
    const persistDraft = vi.fn(async () => { if (fail) throw new Error('disk full');return { saved: true }; });
    const session = feedback.createSession({ itemId: 'id',contractVersion: '0.1.2',appId: 'gtho',scope: 'op',sourcePurpose: 'feedback',capturedAt: '2026-11-08T12:00:00-05:00',screen: fact('animals'),buildStamp: fact('test') },{ scoped: true,adapted: true });
    const review = mountFeedbackReview(panel,session,{ persistDraft });
    panel.querySelector('[data-testid="feedback-kind"]').value = 'bug';
    for (const [name,value] of Object.entries({ title: 'Title',expected: 'Expected',actual: 'Actual',reproSteps: 'First\nSecond',severity: 'normal',affectedWork: 'work',workaround: 'manual',dataRisk: 'none reported' })) panel.querySelector(`[data-testid="feedback-${name}"]`).value = value;
    expect(await review.confirm('original')).toBeNull();
    fail = true;panel.querySelector('[data-testid="feedback-actual"]').value = 'Correction';
    await expect(review.confirm('original')).rejects.toThrow('disk full');expect(review.snapshot().status).toBe('draft');expect(review.snapshot().item.reviewConfirmation).toBeUndefined();
    fail = false;expect(await review.confirm('original')).toBeNull();
    const handoff = await review.confirm('original');expect(await review.confirm('original')).toEqual(handoff);
    panel.querySelector('[data-testid="feedback-actual"]').value = 'Another correction';
    expect(await review.confirm('original')).toBeNull();expect(review.snapshot().item.reviewConfirmation).toBeUndefined();
    const corrected = await review.confirm('original');expect(corrected.revision).not.toBe(handoff.revision);
  });
  it('does not close the normal sheet as saved when a filing callback returns no local-save evidence',async () => {
    document.body.innerHTML = '';
    const session = feedback.createSession({ itemId: 'id',contractVersion: '0.1.2',appId: 'gtho',scope: 'op',sourcePurpose: 'feedback',capturedAt: '2026-11-08T12:00:00-05:00',screen: fact('animals'),buildStamp: fact('test') },{ scoped: true,adapted: true });
    const filed = vi.fn(async () => []);openFeedbackSheet('feedback','op',{ feedbackSession: session,persistDraft: async () => ({ saved: true }),fileConfirmed: filed });
    const panel = document.querySelector('#fb-sheet-panel');panel.querySelector('textarea').value = 'original';panel.querySelector('[data-testid="feedback-kind"]').value = 'bug';
    for (const [name,value] of Object.entries({ title: 'Title',expected: 'Expected',actual: 'Actual',reproSteps: 'First',severity: 'normal',affectedWork: 'work',workaround: 'manual',dataRisk: 'none reported' })) panel.querySelector(`[data-testid="feedback-${name}"]`).value = value;
    const save = panel.querySelector('.btn-green');save.click();await vi.waitFor(() => expect(panel.querySelector('[data-testid="feedback-normal-review"]').dataset.revision).toBeTruthy());
    save.click();await vi.waitFor(() => expect(panel.querySelector('.auth-error').textContent).toBe('confirmed-local-save-evidence-required'));
    expect(filed).toHaveBeenCalledOnce();expect(panel.querySelector('textarea').readOnly).toBe(true);
  });

});
