/** Deterministic feeding clarification and quantity allocation (OI-0206).
 * Never assumes a split, never fuzzy-matches, never invents a timestamp. */

export const QUANTITY_BASIS_TOTAL = 'total';
export const QUANTITY_BASIS_PER_PADDOCK = 'per-paddock';

const named = value => typeof value === 'string' && value.trim() !== '';

/** Map a short reply onto total vs per-paddock. Unrecognized text is null. */
export function parseQuantityBasis(value) {
  const text = String(value ?? '').trim().toLowerCase();
  if (!text) return null;
  if (text === QUANTITY_BASIS_TOTAL || text === QUANTITY_BASIS_PER_PADDOCK) return text;
  if (/\bper paddock\b|\beach paddock\b|\bapiece\b|\beach\b/.test(text)) return QUANTITY_BASIS_PER_PADDOCK;
  if (/\btotal\b|\baltogether\b|\bcombined\b|\bacross\b/.test(text)) return QUANTITY_BASIS_TOTAL;
  return null;
}

/** before / after / same-instant. "unclear" stays null so the host asks again. */
export function parseCarryoverTiming(value) {
  const text = String(value ?? '').trim().toLowerCase();
  if (!text) return null;
  if (text === 'before' || text === 'after' || text === 'same-instant') return text;
  if (/\bsame time\b|\bsame instant\b|\bat the same time\b|\bwith the delivery\b/.test(text)) return 'same-instant';
  if (/\bbefore\b|\bprior\b|\balready there\b/.test(text)) return 'before';
  if (/\bafter\b|\bafterwards\b|\bthen checked\b/.test(text)) return 'after';
  return null;
}

function list(names) {
  if (!names.length) return '';
  return names.length === 2 ? `${names[0]} or ${names[1]}` : `${names.slice(0, -1).join(', ')} or ${names.at(-1)}`;
}

/** Per-paddock copies the stated quantity to each target. A total without an
 * explicit per-target allocation is unresolved — never even-split by default. */
export function allocateFeedingLines(lines, locationIds, quantityBasis) {
  const ids = [...new Set((locationIds ?? []).filter(Boolean))];
  const rows = Array.isArray(lines) ? lines : [];
  if (!ids.length) return { status: 'question', question: 'Which paddock did you feed?' };
  if (ids.length === 1) {
    return { status: 'allocated', allocations: ids.map(locationId => ({ locationId, lines: rows.map(line => ({ ...line })) })) };
  }
  const basis = parseQuantityBasis(quantityBasis);
  if (!basis) {
    return { status: 'question', field: 'quantityBasis', question: `Is the quantity a total across ${list(ids)}, or the same amount per paddock?` };
  }
  if (basis === QUANTITY_BASIS_PER_PADDOCK) {
    return { status: 'allocated', quantityBasis: basis, allocations: ids.map(locationId => ({ locationId, lines: rows.map(line => ({ ...line })) })) };
  }
  const uniqueParts = parts => {
    const locIds = (parts ?? []).map(part => part.locationId);
    return locIds.length === new Set(locIds).size;
  };
  const explicit = rows.every(line => Array.isArray(line.allocations) && line.allocations.length === ids.length
    && uniqueParts(line.allocations)
    && line.allocations.every(part => ids.includes(part.locationId) && Number.isFinite(part.qty) && part.qty >= 0)
    && Math.abs(line.allocations.reduce((sum, part) => sum + part.qty, 0) - Number(line.qty ?? line.quantity ?? 0)) < 1e-9);
  if (!explicit) {
    return {
      status: 'question',
      field: 'lineAllocations',
      quantityBasis: basis,
      question: `How should the total be allocated across ${list(ids)}?`,
    };
  }
  return {
    status: 'allocated',
    quantityBasis: basis,
    allocations: ids.map(locationId => ({
      locationId,
      lines: rows.map(line => {
        const part = line.allocations.find(item => item.locationId === locationId);
        return { ...line, qty: part.qty, quantity: part.qty, allocations: undefined };
      }),
    })),
  };
}


/** Keep only allocations that match the visible targets, batches and quantities.
 * Unknown targets are dropped. A single visible target always uses the visible
 * lines — model-supplied allocations are never trusted as-is. */
export function reconcileAllocatedLines(allocated, { lines, locationIds } = {}) {
  const ids = [...new Set((locationIds ?? []).filter(Boolean))];
  const rows = Array.isArray(lines) ? lines : [];
  if (!ids.length) return { status: 'rejected', reason: 'no-targets' };
  if (ids.length === 1) {
    return { status: 'allocated', allocations: [{ locationId: ids[0], lines: rows.map(line => ({ ...line })) }] };
  }
  const incoming = Array.isArray(allocated) ? allocated.filter(part => ids.includes(part.locationId)) : [];
  const locIds = incoming.map(part => part.locationId);
  if (new Set(locIds).size !== locIds.length) return { status: 'rejected', reason: 'duplicate-target' };
  if (incoming.length !== ids.length) return { status: 'rejected', reason: 'missing-target' };
  const qty = line => Number(line?.qty ?? line?.quantity ?? 0);
  const byTarget = new Map(incoming.map(part => [part.locationId, Array.isArray(part.lines) ? part.lines : []]));
  for (const line of rows) {
    const parts = ids.map(id => (byTarget.get(id) ?? []).find(item => item.batchId === line.batchId));
    if (parts.some(part => !part || !Number.isFinite(qty(part)) || qty(part) < 0)) {
      return { status: 'rejected', reason: 'quantity-mismatch' };
    }
    const shown = qty(line);
    const perPaddock = parts.every(part => Math.abs(qty(part) - shown) < 1e-9);
    const totalMatches = Math.abs(parts.reduce((sum, part) => sum + qty(part), 0) - shown) < 1e-9;
    if (!perPaddock && !totalMatches) return { status: 'rejected', reason: 'quantity-mismatch' };
  }
  return {
    status: 'allocated',
    allocations: ids.map(locationId => ({
      locationId,
      lines: rows.map(line => {
        const part = (byTarget.get(locationId) ?? []).find(item => item.batchId === line.batchId);
        const { allocations: _ignored, ...rest } = line;
        return { ...rest, qty: qty(part), quantity: qty(part) };
      }),
    })),
  };
}

/** Merge a short clarification reply into the pending paddock / quantity / carryover field. */
export function applyPendingClarification(pending, names = {}, fields = {}, utterance = '') {
  const said = { ...(pending?.names && typeof pending.names === 'object' ? pending.names : {}), ...(names && typeof names === 'object' && !Array.isArray(names) ? names : {}) };
  const merged = { ...(pending?.fields && typeof pending.fields === 'object' ? pending.fields : {}), ...fields };
  const answer = named(utterance) ? utterance.trim() : (named(said.answer) ? said.answer.trim() : '');
  const field = pending?.field;
  if (field === 'paddock' && !parseSaidList(said).length && named(answer)) said.paddock = answer;
  if (field === 'quantityBasis' && !merged.quantityBasis) {
    const basis = parseQuantityBasis(merged.quantityBasis ?? said.quantityBasis ?? answer);
    if (basis) merged.quantityBasis = basis;
  }
  if (field === 'carryoverTiming') {
    const carryover = { ...(merged.carryover && typeof merged.carryover === 'object' ? merged.carryover : {}) };
    if (!carryover.timing) {
      const timing = parseCarryoverTiming(carryover.timing ?? said.timing ?? answer);
      if (timing) carryover.timing = timing;
    }
    merged.carryover = carryover;
  }
  if (field === 'carryoverTime') {
    const carryover = { ...(merged.carryover && typeof merged.carryover === 'object' ? merged.carryover : {}) };
    if (!carryover.time && named(answer)) carryover.time = answer;
    merged.carryover = carryover;
  }
  if (pending?.fill && typeof pending.fill === 'object') {
    if (pending.fill.locationIds && !merged.locationIds) merged.locationIds = pending.fill.locationIds;
    if (pending.fill.locationId && !merged.locationId) merged.locationId = pending.fill.locationId;
  }
  return { names: said, fields: merged };
}

function parseSaidList(said) {
  const raw = said?.paddock ?? said?.paddocks ?? null;
  if (Array.isArray(raw)) return raw.map(value => String(value).trim()).filter(Boolean);
  if (typeof raw !== 'string') return [];
  return raw.split(',').map(value => value.trim()).filter(Boolean);
}

export function carryoverTimingQuestion() {
  return 'Was the remaining feed checked before the new delivery, after it, or at the same time?';
}
