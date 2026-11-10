/** A historical observation must use an entered or explicitly confirmed clock. */
import { el } from './dom.js';
import { getLocalTodayStr } from '../utils/date-utils.js';
import { localFormTimestamp } from '../utils/form-values.js';
import { t } from '../i18n/i18n.js';
export function explicitObservationTime(state, dateInput, timeInput) {
  const hint = el('div', { className: 'form-hint', 'data-testid': 'explicit-time' });
  const confirm = el('button', { type: 'button', className: 'btn btn-outline btn-xs', onClick: () => {
    if (!confirm.isConnected || !timeInput.value) return;
    state.time = timeInput.value; state.explicitTimeDate = dateInput.value; refresh();
  } });
  function refresh() {
    const historical = dateInput.value !== getLocalTodayStr();
    hint.textContent = historical && state.explicitTimeDate !== dateInput.value ? t('manualEntry.explicitTime') : t('manualEntry.timeReadback', { time: timeInput.value || '00:00' });
    confirm.textContent = t('manualEntry.confirmTime', { time: timeInput.value || '—' });
    confirm.hidden = !historical || state.explicitTimeDate === dateInput.value || !timeInput.value;
  }
  dateInput.addEventListener('change', () => {
    if (!dateInput.isConnected) return;
    if (state.date !== dateInput.value) {
      state.date = dateInput.value; state.explicitTimeDate = null;
      if (state.date !== getLocalTodayStr()) { state.time = ''; timeInput.value = ''; }
    }
    refresh();
  });
  const entered = () => {
    if (!timeInput.isConnected) return;
    state.time = timeInput.value; state.explicitTimeDate = dateInput.value; refresh();
  };
  timeInput.addEventListener('input', entered); timeInput.addEventListener('change', entered);
  refresh(); return el('div', {}, [hint, confirm]);
}
export function validateObservationTime(state) {
  if (state.date !== getLocalTodayStr() && (!state.time || state.explicitTimeDate !== state.date)) throw new Error(t('manualEntry.explicitTime'));
  localFormTimestamp(state.date, state.time);
}
