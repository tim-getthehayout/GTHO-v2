/** @file Full-screen map overlay for picking a paddock or dropping a todo pin. */

import { el, clear } from '../../ui/dom.js';
import { getAll, getById, update } from '../../data/store.js';
import { getActiveFarmId } from '../../data/store.js';
import { loadLeaflet } from './leaflet-loader.js';
import { findLocationAtPoint, locationHasPerimeter } from '../../utils/geo.js';
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

function paintLocations(L, map, locations, selectedId, onPick) {
  const layers = [];
  for (const loc of locations) {
    if (!loc.geojson) continue;
    const layer = L.geoJSON(loc.geojson, {
      style: {
        color: loc.id === selectedId ? '#f5c518' : '#2f9e44',
        weight: loc.id === selectedId ? 3 : 2,
        fillOpacity: loc.id === selectedId ? 0.45 : 0.28,
        fillColor: loc.id === selectedId ? '#f5c518' : '#69db7c',
      },
    });
    layer.on('click', () => onPick(loc.id));
    const label = loc.fieldCode ? `${loc.name} (${loc.fieldCode})` : loc.name;
    layer.bindTooltip(label, { sticky: true });
    layer.addTo(map);
    layers.push(layer);
  }
  return layers;
}

export function closeMapPicker() {
  document.getElementById(OVERLAY_ID)?.remove();
}

export async function openLocationMapPicker(opts = {}) {
  closeMapPicker();
  const mode = opts.mode || 'pick';
  const filter = opts.filter || ((l) => !l.archived && l.type === 'land');
  let selectedId = opts.selectedId || null;
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
    toolbar.appendChild(el('div', { className: 'farm-map-title' }, [opts.title || (mode === 'pin' ? 'Drop a pin' : 'Pick a paddock')]));
    const actions = el('div', { className: 'farm-map-actions' });
    actions.appendChild(el('button', { className: 'btn btn-outline btn-sm', onClick: closeMapPicker }, ['Cancel']));
    if (mode === 'pick') {
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
    : 'Tap a paddock outline to select it.';

  renderToolbar();

  const L = await loadLeaflet();
  const map = L.map(canvas, { zoomControl: true }).setView(defaultCenter(), 15);
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles © Esri',
    maxZoom: 19,
  }).addTo(map);

  const locations = getAll('locations').filter(filter);
  const drawn = locations.filter(locationHasPerimeter);
  paintLocations(L, map, drawn, selectedId, (id) => {
    selectedId = id;
    if (mode === 'pick') {
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
