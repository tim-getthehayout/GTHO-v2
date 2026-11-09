/** Existing Feedback/Get Help sheet binding, delegating every interview/revision to the pinned library. */
import { feedback } from './shared.js';
import { el } from '../../ui/dom.js';
const known = value => ({ state: 'known',value,source: 'user' });
export function mountFeedbackReview(panel,initial,{ persistDraft,onSession }) {
  let session = initial;
  const fields = {};
  const section = el('div', { 'data-testid': 'feedback-normal-review' });
  const type = el('select', { 'data-testid': 'feedback-kind' }, [el('option',{ value: '' },['—']),el('option',{ value: 'bug' },['Bug']),el('option',{ value: 'request' },['Request'])]);
  type.value = session.item.type || '';
  section.appendChild(el('div',{ className: 'field' },[el('label',{},['Bug or request']),type]));
  for (const name of ['title','expected','actual','reproSteps','severity','affectedWork','workaround','dataRisk']) {
    const fact = ['affectedWork','workaround','dataRisk'].includes(name) ? session.item.impact?.[name] : session.item[name];
    const state = el('select', { 'data-testid': `feedback-${name}-state` }, ['known',...(['title','expected'].includes(name) ? [] : ['unknown']),...(name === 'reproSteps' ? ['not_reproducible','not_applicable'] : name === 'severity' ? ['not_applicable'] : [])].map(value => el('option',{ value },[value])));
    const input = el('textarea', { 'data-testid': `feedback-${name}`, rows: '2' });
    state.value = fact?.state || 'known'; input.value = Array.isArray(fact?.value) ? fact.value.join('\n') : fact?.value || '';
    const updateState = () => { input.disabled = state.value !== 'known'; };state.addEventListener('change',updateState);updateState();
    fields[name] = { state,input };
    section.appendChild(el('div',{ className: 'field' },[el('label',{},[name]),state,input]));
  }
  panel.appendChild(section);
  function patch() {
    const result = { type: type.value,impact: {} };
    for (const [name,{ state,input }] of Object.entries(fields)) {
      const fact = state.value === 'known' ? known(name === 'reproSteps' ? input.value.split('\n') : input.value) : { state: state.value,source: 'user' };
      if (['affectedWork','workaround','dataRisk'].includes(name)) result.impact[name] = fact; else result[name] = fact;
    }
    return result;
  }
  async function changed(note) {
    if (!session.item.firstNote) { session = await feedback.recordFirstNote(session,note,persistDraft); await onSession?.(session); }
    if (!session.captureSaved || session.saveError) session = await feedback.persistDraft(session,persistDraft);
    if (!session.captureSaved || session.saveError) throw new Error(session.saveError || 'durable-feedback-draft-required');
    session = feedback.applyAnswer(session,patch());
    session = await feedback.persistDraft(session,persistDraft);
    if (!session.captureSaved || session.saveError) throw new Error(session.saveError || 'durable-feedback-draft-required');
    session = feedback.presentReview(session);
    await onSession?.(session);
    section.dataset.revision = feedback.itemRevision(session.item);
    return session;
  }
  return {
    async confirm(note) {
      // First click/correction populates and shows the exact library revision.
      if (session.status === 'confirmed') {
        const draft = feedback.resumeDraft(session),candidate = feedback.applyAnswer(draft,patch());
        if (feedback.itemRevision(candidate.item) === feedback.itemRevision(session.item)) {
          session = await feedback.persistDraft(session,persistDraft);
          if (session.saveError) throw new Error(session.saveError);
          await onSession?.(session);return feedback.prepareHandoff(session);
        }
        session = draft; // The library revokes the old confirmation before correction.
      }
      const shown = session.review?.revision;
      await changed(note);
      if (shown !== session.review.revision) return null;
      session = feedback.acceptReview(session,{ source: 'host',confirmed: true,revision: session.review.revision,destination: session.review.destination,evidence: crypto.randomUUID() });
      session = await feedback.persistDraft(session,persistDraft);
      if (session.saveError) throw new Error(session.saveError);
      const handoff = feedback.prepareHandoff(session);
      await onSession?.(session);
      return handoff;
    },
    async delivery(report) { session = feedback.recordHostDelivery(session,report); await onSession?.(session); return session; },
    snapshot() { return session; },
  };
}
