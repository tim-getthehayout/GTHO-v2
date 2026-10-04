/** @file Review FieldMargin / GeoJSON / KML imports before writing locations. */

import { el, clear } from '../../ui/dom.js';
import { Sheet } from '../../ui/sheet.js';
import { getAll, getActiveFarmId } from '../../data/store.js';
import { parseBoundaryFile, matchImportedFeatures } from '../../utils/geo-import.js';
import { polygonAreaHectares } from '../../utils/geo.js';
import { applyLocationGeometry, createLocationFromImport } from './apply-geometry.js';

let sheet = null;

function ensureDom() {
  if (document.getElementById('map-import-wrap')) return;
  document.body.appendChild(el('div', { className: 'sheet-wrap', id: 'map-import-wrap', style: { zIndex: '420' } }, [
    el('div', { className: 'sheet-backdrop', onClick: () => sheet?.close() }),
    el('div', { className: 'sheet-panel', id: 'map-import-panel', style: { maxHeight: '90vh', overflowY: 'auto' } }),
  ]));
}

export function openBoundaryImportPicker() {
  const input = el('input', {
    type: 'file',
    accept: '.geojson,.json,.kml,.kmz,application/geo+json,application/vnd.google-earth.kml+xml',
    style: { display: 'none' },
  });
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    input.remove();
    if (!file) return;
    try {
      const features = await parseBoundaryFile(file);
      if (!features.length) {
        window.alert('No polygons found in that file. Export fields (not points or lines) from FieldMargin as KML or GeoJSON.');
        return;
      }
      openImportReview(features, file.name);
    } catch (err) {
      window.alert(err.message || 'Could not read that file.');
    }
  });
  document.body.appendChild(input);
  input.click();
}

export function openImportReview(features, fileName) {
  ensureDom();
  if (!sheet) sheet = new Sheet('map-import-wrap');
  const panel = document.getElementById('map-import-panel');
  if (!panel) return;
  clear(panel);
  panel.appendChild(el('div', { className: 'sheet-handle' }));
  panel.appendChild(el('div', { style: { fontSize: '16px', fontWeight: '600', marginBottom: '4px' } }, ['Import field boundaries']));
  panel.appendChild(el('div', { style: { fontSize: '12px', color: 'var(--text2)', marginBottom: '12px' } }, [
    `${fileName || 'File'} · ${features.length} polygon${features.length === 1 ? '' : 's'}. Match by name or field code, or create a new location.`,
  ]));

  const rows = matchImportedFeatures(features, getAll('locations'));
  const list = el('div');
  panel.appendChild(list);

  function renderRows() {
    clear(list);
    for (const row of rows) {
      const ha = polygonAreaHectares(row.geojson);
      const acres = ha != null ? (ha * 2.47105).toFixed(1) : '—';
      const card = el('div', { style: { padding: '10px 12px', border: '0.5px solid var(--border)', borderRadius: '10px', marginBottom: '8px', background: 'var(--bg2)' } });
      card.appendChild(el('div', { style: { fontWeight: '600', fontSize: '13px' } }, [row.name]));
      card.appendChild(el('div', { style: { fontSize: '11px', color: 'var(--text2)', marginBottom: '6px' } }, [
        `${acres} ac from file${row.matchName ? ` · matched ${row.matchName}` : ''}`,
      ]));
      const select = el('select', { className: 'auth-select' }, [
        el('option', { value: 'create', selected: row.action === 'create' }, ['Create new location']),
        el('option', { value: 'skip', selected: row.action === 'skip' }, ['Skip']),
        ...getAll('locations').filter((l) => !l.archived).map((l) =>
          el('option', { value: `attach:${l.id}`, selected: row.matchId === l.id && row.action !== 'skip' }, [
            `${row.matchId === l.id && l.geojson ? 'Replace ring on' : 'Attach to'} ${l.name}`,
          ]),
        ),
      ]);
      select.addEventListener('change', () => {
        if (select.value === 'create') {
          row.action = 'create';
          row.matchId = null;
        } else if (select.value === 'skip') {
          row.action = 'skip';
        } else {
          row.action = 'attach';
          row.matchId = select.value.slice('attach:'.length);
        }
      });
      card.appendChild(select);
      list.appendChild(card);
    }
  }
  renderRows();

  const status = el('div', { className: 'auth-error' });
  panel.appendChild(status);
  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: '12px' } }, [
    el('button', { className: 'btn btn-outline', onClick: () => sheet.close() }, ['Cancel']),
    el('button', { className: 'btn btn-green', onClick: () => {
      try {
        applyRows(rows);
        sheet.close();
      } catch (err) {
        clear(status);
        status.appendChild(el('span', {}, [err.message]));
      }
    } }, ['Import selected']),
  ]));
  sheet.open();
}

function applyRows(rows) {
  const farmId = getActiveFarmId() || getAll('farms')[0]?.id;
  const operationId = getAll('operations')[0]?.id;
  let created = 0;
  let attached = 0;
  for (const row of rows) {
    if (row.action === 'skip') continue;
    if (row.action === 'create') {
      createLocationFromImport({ name: row.name, geojson: row.geojson, farmId, operationId });
      created += 1;
      continue;
    }
    if (row.matchId) {
      applyLocationGeometry(row.matchId, row.geojson, 'imported');
      attached += 1;
    }
  }
  window.alert(`Imported ${attached} onto existing locations and created ${created} new ones.`);
}
