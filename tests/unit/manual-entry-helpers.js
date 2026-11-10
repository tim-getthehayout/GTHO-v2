import { vi } from 'vitest';
import { setLocale } from '../../src/i18n/i18n.js';
import en from '../../src/i18n/locales/en.json';
import { add, _reset, setSyncAdapter, getAll, mergeRemote } from '../../src/data/store.js';
import * as Operation from '../../src/entities/operation.js';
import * as Farm from '../../src/entities/farm.js';
export const OP = 'test-operation', FARM = 'test-farm';
export function seed(type, entity, data) {
  const row = entity.create({ operationId: ['doseUnits','inputProductUnits'].includes(type) ? null : OP, ...data });
  if (['doseUnits','inputProductUnits'].includes(type) && !row.operationId) mergeRemote(type, [row]);
  else add(type, row, entity.validate, entity.toSupabaseShape, type);
  return row;
}
export function resetForms(units = 'metric') {
  setLocale('en', en);
  localStorage.clear(); _reset(); setSyncAdapter(null); document.body.replaceChildren();
  seed('operations', Operation, { id: OP, name: 'Test operation', unitSystem: units });
  seed('farms', Farm, { id: FARM, name: 'Test farm' });
}
export function queueSpy() {
  const rows = [];
  setSyncAdapter({ push: vi.fn((table, record, operation) => rows.push({ table, record, operation })), delete: vi.fn() });
  return table => [...rows, ...JSON.parse(localStorage.getItem('_sync_queue') || '[]')].filter(row => row.table === table).map(row => row.record);
}
export const button = (root, text) => [...root.querySelectorAll('button')].find(node => node.textContent.trim() === text);
export function fill(root, selector, value, event = 'input') {
  const control = root.querySelector(selector); control.value = value; control.dispatchEvent(new Event(event, { bubbles: true })); return control;
}
export const persisted = type => JSON.parse(localStorage.getItem('gtho_' + type) || 'null') || getAll(type);
