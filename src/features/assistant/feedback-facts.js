/** GTHO physical fact mapping; the pinned library remains the interview validator. */
import { validateItem, CONTRACT_VERSION } from '../../../vendor/feedback-module/src/index.js';
export { CONTRACT_VERSION };
const impactColumns = { affectedWork: 'impactAffectedWork', workaround: 'impactWorkaround', dataRisk: 'impactDataRisk' };

export function mapFeedbackFacts(item) {
  const validation = validateItem(item, { phase: 'draft' });
  if (!validation.valid) throw new Error(validation.errors.map(error => `${error.field}: ${error.message}`).join('; '));
  const submission = {}, fieldStates = [], reproSteps = [];
  for (const [name, column] of Object.entries(impactColumns)) {
    const fact = item.impact?.[name];
    if (!fact) continue; // Draft omission is not an invented unknown answer.
    submission[column] = fact.state === 'known' ? fact.value : null;
    fieldStates.push({ fieldName: name, state: fact.state, source: fact.source });
  }
  if (item.reproSteps) {
    fieldStates.push({ fieldName: 'reproSteps', state: item.reproSteps.state, source: item.reproSteps.source });
    if (item.reproSteps.state === 'known') {
      item.reproSteps.value.forEach((step, position) => reproSteps.push({ position, stepText: step }));
    }
  }
  return { submission, fieldStates, reproSteps };
}
