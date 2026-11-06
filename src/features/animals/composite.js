/** @file Composite reduce-on-add. Same-species individuals joining a group that already has one composite. */

import { getAll, add, update } from '../../data/store.js';
import { t } from '../../i18n/i18n.js';
import { showToast } from '../../ui/toast.js';
import { animalHeadCount, reduceCompositeTotals } from '../../calcs/window-helpers.js';
import * as AnimalEntity from '../../entities/animal.js';
import * as WeightRecordEntity from '../../entities/animal-weight-record.js';

function latestWeight(animalId, records) {
  let best = null;
  for (const w of records) {
    if (w.animalId !== animalId) continue;
    if (typeof w.weightKg !== 'number' || !Number.isFinite(w.weightKg)) continue;
    const stamp = w.recordedAt || w.date || '';
    if (!best || stamp > (best.recordedAt || best.date || '')) best = w;
  }
  return best;
}

function speciesOf(animal, classes) {
  if (!animal?.classId) return null;
  return classes.get(animal.classId)?.species || null;
}

/**
 * Individuals in `incomingAnimalIds` that share a species with composites already
 * in the group. More than one match for a species is left in `ambiguous` and is not reduced.
 * Animals with no class are skipped (species cannot be matched).
 */
export function planCompositeReductions({ groupId, incomingAnimalIds }) {
  const animals = getAll('animals');
  const classes = new Map(getAll('animalClasses').map(c => [c.id, c]));
  const byId = new Map(animals.map(a => [a.id, a]));
  const memberships = getAll('animalGroupMemberships').filter(m => m.groupId === groupId && !m.dateLeft);
  const incoming = (incomingAnimalIds || [])
    .map(id => byId.get(id))
    .filter(a => a && a.isBulk !== true);
  const headsBySpecies = new Map();
  for (const a of incoming) {
    const species = speciesOf(a, classes);
    if (!species) continue;
    headsBySpecies.set(species, (headsBySpecies.get(species) || 0) + 1);
  }
  const composites = memberships
    .map(m => byId.get(m.animalId))
    .filter(a => a && a.isBulk === true && animalHeadCount(a) > 0);
  const plans = [];
  const ambiguous = [];
  for (const [species, headsToRemove] of headsBySpecies) {
    const matches = composites.filter(c => speciesOf(c, classes) === species);
    if (matches.length === 1) plans.push({ composite: matches[0], species, headsToRemove });
    else if (matches.length > 1) ambiguous.push({ species, composites: matches, headsToRemove });
  }
  return { plans, ambiguous };
}

/** Ask once per single matching composite. Returns the plans the user accepted. */
export function confirmCompositeReductions(groupId, incomingAnimalIds) {
  const { plans, ambiguous } = planCompositeReductions({ groupId, incomingAnimalIds });
  const accepted = [];
  for (const plan of plans) {
    const name = plan.composite.name || plan.composite.tagNum || t('animal.compositeFallbackName');
    const ok = window.confirm(t('animal.compositeReduceConfirm', { name, count: plan.headsToRemove }));
    if (ok) accepted.push(plan);
  }
  if (ambiguous.length) {
    const names = ambiguous.flatMap(a => a.composites.map(c => c.name || t('animal.compositeFallbackName'))).join(', ');
    showToast(t('animal.compositeReduceAmbiguous', { names }));
  }
  return accepted;
}

export function applyCompositeReductions(accepted, operationId) {
  if (!accepted?.length) return;
  const weights = getAll('animalWeightRecords');
  for (const plan of accepted) {
    const latest = latestWeight(plan.composite.id, weights);
    const result = reduceCompositeTotals({
      headBefore: animalHeadCount(plan.composite),
      weightKg: latest ? latest.weightKg : null,
      headsToRemove: plan.headsToRemove,
    });
    update(
      'animals', plan.composite.id,
      { bulkHeadCount: result.headAfter },
      AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals',
    );
    if (result.weightKgAfter == null) continue;
    const rec = WeightRecordEntity.create({
      operationId,
      animalId: plan.composite.id,
      recordedAt: new Date().toISOString(),
      weightKg: result.weightKgAfter,
      source: 'manual',
      notes: 'Composite reduced when identified animals joined the group',
    });
    add('animalWeightRecords', rec, WeightRecordEntity.validate, WeightRecordEntity.toSupabaseShape, 'animal_weight_records');
  }
}
