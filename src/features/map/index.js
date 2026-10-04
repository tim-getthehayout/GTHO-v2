/** @file Farm map screen — view paddocks, draw a perimeter, import FieldMargin files. */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { getAll, getById, getActiveFarmId, update } from '../../data/store.js';
import { loadLeaflet } from './leaflet-loader.js';
import { mapIntent, setMapIntent } from './intent.js';
import { ringToGeojson, findLocationAtPoint, locationHasPerimeter } from '../../utils/geo.js';
import { applyLocationGeometry } from './apply-geometry.js';
import { openBoundaryImportPicker } from './import-sheet.js';
import { openLocationMapPicker } from './picker.js';
import * as TodoEntity from '../../entities/todo.js';

let mapInstance = null;

function defaultCenter() {
  const farmId = getActiveFarmId();
  const farm = farmId ? getById('farms', farmId) : getAll('farms')[0];
  if (farm?.latitude != null && farm?.longitude != null) {
    return [Number(farm.latitude), Number(farm.longitude)];
  }
  const withCentroid = getAll('locations').find((l) => l.centroidLat != null && l.centroidLng != null);
  if (withCentroid) return [withCentroid.centroidLat, withCentroid.centroidLng];
  return [35.2271, -80.8431];
}

export async function renderFarmMapScreen(container) {
  clear(container);
  const intent = mapIntent || { mode: 'view' };
  const wrap = el('div', { className: 'farm-map-screen', 'data-testid': 'farm-map-screen' });
  const toolbar = el('div', { className: 'farm-map-toolbar' });
  const hint = el('div', { className: 'farm-map-hint' });
  const canvas = el('div', { className: 'farm-map-canvas', id: 'farm-map-canvas' });
  wrap.appendChild(el('h1', { className: 'screen-heading', style: { marginBottom: '8px' } }, [t('map.title')]));
  wrap.appendChild(toolbar);
  wrap.appendChild(hint);
  wrap.appendChild(canvas);
  container.appendChild(wrap);

  const L = await loadLeaflet();
  if (mapInstance) {
    mapInstance.remove();
    mapInstance = null;
  }
  const map = L.map(canvas, { zoomControl: true }).setView(defaultCenter(), 15);
  mapInstance = map;
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles © Esri',
    maxZoom: 19,
  }).addTo(map);

  const locations = getAll('locations').filter((l) => !l.archived && l.type === 'land');
  const drawn = locations.filter(locationHasPerimeter);
  const locLayers = L.featureGroup();
  for (const loc of drawn) {
    const layer = L.geoJSON(loc.geojson, {
      style: { color: '#2f9e44', weight: 2, fillOpacity: 0.28, fillColor: '#69db7c' },
    });
    layer.bindTooltip(loc.fieldCode ? `${loc.name} (${loc.fieldCode})` : loc.name, { sticky: true });
    layer.addTo(locLayers);
  }
  locLayers.addTo(map);
  if (drawn.length) {
    try { map.fitBounds(locLayers.getBounds().pad(0.12)); } catch { /* empty */ }
  }

  const draft = { ring: [], polyline: null, preview: null, marker: null, pin: null };

  function setHint(text) {
    hint.textContent = text;
  }

  function renderToolbar() {
    clear(toolbar);
    const actions = el('div', { className: 'farm-map-actions' });
    actions.appendChild(el('button', { className: 'btn btn-outline btn-sm', onClick: () => openBoundaryImportPicker() }, [t('map.import')]));
    actions.appendChild(el('button', { className: 'btn btn-outline btn-sm', onClick: locateMe }, [t('map.whereIAm')]));
    if (intent.mode === 'draw') {
      actions.appendChild(el('button', { className: 'btn btn-outline btn-sm', onClick: undoVertex }, [t('map.undo')]));
      actions.appendChild(el('button', { className: 'btn btn-green btn-sm', onClick: saveRing }, [t('map.savePerimeter')]));
    } else if (intent.mode === 'pin') {
      actions.appendChild(el('button', { className: 'btn btn-green btn-sm', onClick: savePin }, [t('map.savePin')]));
    } else {
      actions.appendChild(el('button', {
        className: 'btn btn-outline btn-sm',
        onClick: () => {
          setMapIntent({ mode: 'draw', locationId: intent.locationId || null });
          renderFarmMapScreen(container);
        },
      }, [t('map.draw')]));
    }
    toolbar.appendChild(actions);
  }

  function redrawDraft() {
    if (draft.polyline) draft.polyline.remove();
    if (draft.preview) draft.preview.remove();
    if (draft.ring.length) {
      draft.polyline = L.polyline(draft.ring.map(([lng, lat]) => [lat, lng]), { color: '#f5c518', weight: 3 }).addTo(map);
    }
    if (draft.ring.length >= 3) {
      draft.preview = L.polygon(draft.ring.map(([lng, lat]) => [lat, lng]), {
        color: '#f5c518', weight: 2, fillColor: '#f5c518', fillOpacity: 0.25,
      }).addTo(map);
    }
  }

  function undoVertex() {
    draft.ring.pop();
    redrawDraft();
  }

  function saveRing() {
    if (draft.ring.length < 3) {
      setHint(t('map.needThreeCorners'));
      return;
    }
    const geojson = ringToGeojson(draft.ring);
    let locationId = intent.locationId;
    if (!locationId) {
      const names = locations.map((l) => l.name).join('\n');
      const typed = window.prompt(`Save this perimeter onto which location?\n\n${names}`, locations[0]?.name || '');
      const match = locations.find((l) => l.name.toLowerCase() === String(typed || '').trim().toLowerCase());
      if (!match) {
        setHint(t('map.unknownLocation'));
        return;
      }
      locationId = match.id;
    }
    applyLocationGeometry(locationId, geojson, 'drawn');
    setMapIntent({ mode: 'view' });
    renderFarmMapScreen(container);
  }

  function savePin() {
    if (!draft.pin || !intent.todoId) {
      setHint(t('map.tapToPin'));
      return;
    }
    update('todos', intent.todoId, {
      pointLat: draft.pin.lat,
      pointLng: draft.pin.lng,
      locationId: draft.pin.locationId || getById('todos', intent.todoId)?.locationId || null,
    }, TodoEntity.validate, TodoEntity.toSupabaseShape, 'todos');
    setMapIntent({ mode: 'view' });
    renderFarmMapScreen(container);
  }

  function locateMe() {
    if (!navigator.geolocation) {
      setHint(t('map.noGps'));
      return;
    }
    navigator.geolocation.getCurrentPosition((pos) => {
      const { latitude, longitude } = pos.coords;
      map.setView([latitude, longitude], 17);
      L.circleMarker([latitude, longitude], { radius: 8, color: '#1c7ed6', fillColor: '#4dabf7', fillOpacity: 1 }).addTo(map);
      const here = findLocationAtPoint(locations, latitude, longitude);
      setHint(here ? t('map.youAreIn').replace('{name}', here.name) : t('map.youAreOutside'));
    }, () => setHint(t('map.gpsDenied')), { enableHighAccuracy: true, timeout: 12000 });
  }

  if (intent.mode === 'draw') {
    setHint(t('map.drawHint'));
    map.on('click', (e) => {
      draft.ring.push([e.latlng.lng, e.latlng.lat]);
      redrawDraft();
    });
  } else if (intent.mode === 'pin') {
    setHint(t('map.pinHint'));
    map.on('click', (e) => {
      draft.pin = {
        lat: e.latlng.lat,
        lng: e.latlng.lng,
        locationId: findLocationAtPoint(locations, e.latlng.lat, e.latlng.lng)?.id || null,
      };
      if (draft.marker) draft.marker.setLatLng(e.latlng);
      else draft.marker = L.marker(e.latlng).addTo(map);
    });
  } else {
    setHint(t('map.viewHint'));
  }

  renderToolbar();
  requestAnimationFrame(() => map.invalidateSize());
}

export { openLocationMapPicker, openBoundaryImportPicker };
