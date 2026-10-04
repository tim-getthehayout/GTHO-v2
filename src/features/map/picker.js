/** @file Full-screen map overlay for picking a paddock or dropping a todo pin. */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { getAll, getById, update } from '../../data/store.js';
import { getActiveFarmId } from '../../data/store.js';
import { loadLeaflet } from './leaflet-loader.js';
import { findLocationAtPoint, locationHasPerimeter } from '../../utils/geo.js';
import { addPaddockLabel } from './labels.js';
import { paddockPopup } from './paddock-facts.js';
import * as TodoEntity from '../../entities/todo.js';

const OVERLAY_ID = 'map-picker-overlay';

function defaultCenter() {
  const farmId = getActiveFarmId();
  const farm = farmId ? getById('farms', farmId) : getAll('farms')[0];
  if (farm?.latitude != null && farm?.longitude != null) {
    return [farm.latitude, farm.longitude];
  }
  const withCentroid = getAll('locations').find((l) => l.centroidLat != null && l.centroidLng != null);
  if (withCentroid) return [withCentroid.centroidLat, withCentroid.centroidLng];
  return [35.2271, -80.8431];
}

function polygonStyle(on, blocked) {
  if (blocked) {
    return { color: '#868e96', weight: 2, fillOpacity: 0.2, fillColor: '#adb5bd' };
  }
  if (on) {
    return { color: '#f5c518', weight: 3, fillOpacity: 0.45, fillColor: '#f5c518' };
  }
  return { color: '#2f9e44', weight: 2, fillOpacity: 0.28, fillColor: '#69db7c' };
}

function paintLocations(L, map, locations, styleFor, onPick) {
  const layers = [];
  for (const loc of locations) {
    if (!loc.geojson) continue;
    const layer = L.geoJSON(loc.geojson, { style: () => styleFor(loc.id) });
    layer.on('click', () => onPick(loc.id));
    layer.bindPopup(paddockPopup(loc));
    layer.addTo(map);
    addPaddockLabel(L, map, loc);
    layers.push({ id: loc.id, layer });
  }
  return {
    restyle() {
      for (const { id, layer } of layers) layer.setStyle(styleFor(id));
    },
  };
}

export function closeMapPicker() {
  document.getElementById(OVERLAY_ID)?.remove();
}

export async function openLocationMapPicker(opts = {}) {
  closeMapPicker();
  const mode = opts.mode || 'pick';
  const multi = mode === 'multi';
  const filter = opts.filter || ((l) => !l.archived && l.type === 'land');
  let selectedId = opts.selectedId || null;
  const selectedIds = new Set(opts.selectedIds || []);
  const blockedIds = new Set(multi ? (opts.blockedIds || []) : []);
  let pin = null;

  const overlay = el('div', { id: OVERLAY_ID, className: 'map-picker-overlay', 'data-testid': 'map-picker' });
  const toolbar = el('div', { className: 'farm-map-toolbar' });
  const canvas = el('div', { className: 'farm-map-canvas', id: 'map-picker-canvas' });
  const hint = el('div', { className: 'farm-map-hint' });
  overlay.appendChild(toolbar);
  overlay.appendChild(hint);
  overlay.appendChild(canvas);
  document.body.appendChild(overlay);

  function renderToolbar() {
    clear(toolbar);
    const defaultTitle = mode === 'pin' ? 'Drop a pin' : (multi ? 'Pick paddocks' : 'Pick a paddock');
    toolbar.appendChild(el('div', { className: 'farm-map-title' }, [opts.title || defaultTitle]));
    const actions = el('div', { className: 'farm-map-actions' });
    actions.appendChild(el('button', { className: 'btn btn-outline btn-sm', onClick: closeMapPicker }, ['Cancel']));
    if (multi) {
      const count = selectedIds.size;
      actions.appendChild(el('button', {
        className: 'btn btn-green btn-sm',
        disabled: count === 0,
        'data-testid': 'map-picker-use',
        onClick: () => {
          if (!selectedIds.size) return;
          opts.onSelect?.([...selectedIds]);
          closeMapPicker();
        },
      }, [count === 1
        ? t('event.locationPicker.usePaddock')
        : t('event.locationPicker.usePaddocks', { count })]));
    } else if (mode === 'pick') {
      actions.appendChild(el('button', {
        className: 'btn btn-green btn-sm',
        disabled: !selectedId,
        onClick: () => {
          if (!selectedId) return;
          opts.onSelect?.(selectedId);
          closeMapPicker();
        },
      }, ['Use paddock']));
    } else {
      actions.appendChild(el('button', {
        className: 'btn btn-green btn-sm',
        disabled: !pin,
        onClick: () => {
          if (!pin) return;
          if (opts.todoId) {
            update('todos', opts.todoId, {
              pointLat: pin.lat,
              pointLng: pin.lng,
              locationId: pin.locationId || getById('todos', opts.todoId)?.locationId || null,
            }, TodoEntity.validate, TodoEntity.toSupabaseShape, 'todos');
          }
          opts.onPin?.(pin);
          closeMapPicker();
        },
      }, ['Save pin']));
    }
    toolbar.appendChild(actions);
  }

  hint.textContent = mode === 'pin'
    ? 'Tap the map to drop a pin. If you tap inside a paddock it will also attach that location.'
    : (multi ? t('event.locationPicker.mapHint') : 'Tap a paddock outline to select it.');

  renderToolbar();

  const L = await loadLeaflet();
  const map = L.map(canvas, { zoomControl: true }).setView(defaultCenter(), 15);
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles © Esri',
    maxZoom: 19,
  }).addTo(map);

  const locations = getAll('locations').filter(filter);
  const drawn = locations.filter(locationHasPerimeter);
  function styleFor(id) {
    return polygonStyle(multi ? selectedIds.has(id) : id === selectedId, blockedIds.has(id));
  }
  const painted = paintLocations(L, map, drawn, styleFor, (id) => {
    if (multi) {
      if (blockedIds.has(id)) {
        const reason = opts.blockedReasons?.[id];
        if (reason) hint.textContent = reason;
        return;
      }
      if (selectedIds.has(id)) selectedIds.delete(id);
      else selectedIds.add(id);
      painted.restyle();
      hint.textContent = getById('locations', id)?.name || t('event.locationPicker.mapHint');
      renderToolbar();
      return;
    }
    selectedId = id;
    if (mode === 'pick') {
      painted.restyle();
      hint.textContent = getById('locations', id)?.name || 'Selected';
      renderToolbar();
    }
  });

  if (drawn.length) {
    const group = L.featureGroup(drawn.map((loc) => L.geoJSON(loc.geojson)));
    try { map.fitBounds(group.getBounds().pad(0.15)); } catch { /* empty */ }
  }

  let marker = null;
  if (mode === 'pin') {
    const existing = opts.todoId ? getById('todos', opts.todoId) : null;
    if (existing?.pointLat != null && existing?.pointLng != null) {
      pin = { lat: existing.pointLat, lng: existing.pointLng, locationId: existing.locationId || null };
      marker = L.marker([pin.lat, pin.lng]).addTo(map);
    }
    map.on('click', (e) => {
      pin = {
        lat: e.latlng.lat,
        lng: e.latlng.lng,
        locationId: findLocationAtPoint(locations, e.latlng.lat, e.latlng.lng)?.id || selectedId || null,
      };
      if (marker) marker.setLatLng(e.latlng);
      else marker = L.marker(e.latlng).addTo(map);
      hint.textContent = pin.locationId
        ? `Pin dropped in ${getById('locations', pin.locationId)?.name || 'paddock'}`
        : 'Pin dropped (no paddock under this point)';
      renderToolbar();
    });
  }

  requestAnimationFrame(() => map.invalidateSize());
}

export function mapPickButton(selectEl, extra = {}) {
  return el('button', {
    type: 'button',
    className: 'btn btn-outline btn-sm',
    'data-testid': extra.testId || 'map-pick-button',
    onClick: () => openLocationMapPicker({
      selectedId: selectEl?.value || extra.selectedId || null,
      title: extra.title || 'Pick a paddock',
      onSelect: (id) => {
        if (selectEl) {
          selectEl.value = id;
          selectEl.dispatchEvent(new Event('change'));
        }
        extra.onSelect?.(id);
      },
    }),
  }, ['Map']);
}
