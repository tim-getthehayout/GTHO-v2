/** @file OI-0265 Nv1+Lk1+Lg1+Sv-A+In-A+Rd1+Ft1 — retire the Locations menu item, one feed-type dialog. */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import '../../src/calcs/core.js';
import '../../src/calcs/advanced.js';
import { _reset, add, getAll, getById, setSyncAdapter } from '../../src/data/store.js';
import * as OperationEntity from '../../src/entities/operation.js';
import * as FarmEntity from '../../src/entities/farm.js';
import * as FarmSettingEntity from '../../src/entities/farm-setting.js';
import * as LocationEntity from '../../src/entities/location.js';
import * as FeedTypeEntity from '../../src/entities/feed-type.js';
import * as SurveyEntity from '../../src/entities/survey.js';
import * as DraftEntity from '../../src/entities/survey-draft-entry.js';
import { setLocale } from '../../src/i18n/i18n.js';
import enLocale from '../../src/i18n/locales/en.json';
import { resetCalendarState, readStateFromUrl, LIST_VIEW_HASH } from '../../src/features/events/calendar-state.js';
import { renderCalendarGrid, matchesLegacyTypeFilter } from '../../src/features/events/rotation-calendar/calendar-grid.js';
import { renderEventsScreen, LIST_RERENDER_KEYS } from '../../src/features/events/index.js';
import { redirectLegacyLocationsRoute } from '../../src/features/map/map-view.js';
import { openFeedTypesSheet } from '../../src/features/locations/index.js';
import { openHarvestSheet } from '../../src/features/harvest/index.js';
import { renderSurveysScreen } from '../../src/features/surveys/index.js';

const OP = '00000000-0000-4000-8000-0000000000aa';
const FARM = '00000000-0000-4000-8000-0000000000bb';
const FARM2 = '00000000-0000-4000-8000-0000000000b2';
const L = {
  past: '00000000-0000-4000-8000-0000000000c1',
  mixed: '00000000-0000-4000-8000-0000000000c2',
  crop: '00000000-0000-4000-8000-0000000000c3',
  conf: '00000000-0000-4000-8000-0000000000c4',
  store: '00000000-0000-4000-8000-0000000000c5',
};
const flush = () => new Promise(r => setTimeout(r, 0));
const tid = (root, id) => root.querySelector(`[data-testid="${id}"]`);

beforeAll(() => setLocale('en', enLocale));

function addLoc(id, name, extra) {
  add('locations', LocationEntity.create({ id, operationId: OP, farmId: FARM, name, areaHectares: 4, ...extra }),
    LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
}

function seed({ twoFarms = false } = {}) {
  _reset();
  localStorage.clear();
  setSyncAdapter(null);
  resetCalendarState();
  document.body.innerHTML = '';
  add('operations', OperationEntity.create({ id: OP, name: 'Op', unitSystem: 'imperial' }),
    OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
  add('farms', FarmEntity.create({ id: FARM, operationId: OP, name: 'Home' }),
    FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
  if (twoFarms) {
    add('farms', FarmEntity.create({ id: FARM2, operationId: OP, name: 'River' }),
      FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
  }
  add('farmSettings', FarmSettingEntity.create({ farmId: FARM, operationId: OP }),
    FarmSettingEntity.validate, FarmSettingEntity.toSupabaseShape, 'farm_settings');
  addLoc(L.past, 'A Pasture', { type: 'land', landUse: 'pasture' });
  // Entity stores mixed use as 'mixed_use' (X1 reads it since OI-0271); this fixture keeps a 2nd pasture.
  addLoc(L.mixed, 'B Pasture', { type: 'land', landUse: 'pasture', farmId: twoFarms ? FARM2 : FARM });
  addLoc(L.crop, 'Corn', { type: 'land', landUse: 'crop' });
  addLoc(L.conf, 'Barn lot', { type: 'confinement' });
  addLoc(L.store, 'Hay shed', { type: 'storage', farmId: twoFarms ? FARM2 : FARM });
}

function renderList() {
  window.history.replaceState(null, '', '#/events?view=list');
  readStateFromUrl();
  const c = document.createElement('div');
  document.body.appendChild(c);
  renderCalendarGrid(c);
  return c;
}
const rowIds = c => [...c.querySelectorAll('[data-testid="loc-mgmt-row"]')].map(r => r.dataset.locationId);
const cardNames = c => [...c.querySelectorAll('[data-testid="loc-mgmt-legacy-cards"] .card')]
  .map(n => n.querySelector('span').textContent);

afterEach(() => vi.restoreAllMocks());

describe('OI-0265 Rd1 + Lk1 — no route or link to #/locations', () => {
  it('#/locations redirects (history replace) to the List view and renders Locations & Rotation', () => {
    window.history.replaceState(null, '', '#/locations');
    const render = vi.fn();
    const c = document.createElement('div');
    redirectLegacyLocationsRoute(c, render);
    expect(window.location.hash).toBe(LIST_VIEW_HASH);
    expect(LIST_VIEW_HASH).toBe('#/events?view=list');
    expect(render).toHaveBeenCalledWith(c);
    const main = readFileSync('src/main.js', 'utf8');
    expect(main).toMatch(/route\('#\/locations', \(c\) => redirectLegacyLocationsRoute\(c, renderEventsScreen\)\)/);
    expect(main).not.toMatch(/renderLocationsScreen/);
  });

  it('no source file navigates to #/locations any more', () => {
    const files = [];
    const walk = (d) => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (p.endsWith('.js')) files.push(p);
      }
    };
    walk('src');
    const hits = files.filter(f => /navigate\('#\/locations'\)|href: '#\/locations'/.test(readFileSync(f, 'utf8')));
    expect(hits).toEqual([]);
    const grid = readFileSync('src/features/events/rotation-calendar/calendar-grid.js', 'utf8');
    expect(grid.match(/openSurveySheet\(loc\.id, opId\); \/\/ OI-0265 Lk1/g)).toHaveLength(3);
    for (const f of ['src/features/dashboard/index.js', 'src/features/events/detail.js']) {
      expect(readFileSync(f, 'utf8')).toMatch(/if \(loc\) openLocationSheet\(loc, (ctx\.)?operationId, loc\.farmId\)/);
    }
  });

  it('Season bar link is gone; empty-state "+ Add location" opens the location sheet in place', () => {
    seed();
    const c = renderList();
    expect(c.textContent).not.toContain('Locations · Surveys · Map');
    _reset();
    add('operations', OperationEntity.create({ id: OP, name: 'Op' }), OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
    window.history.replaceState(null, '', '#/events');
    readStateFromUrl();
    const e = document.createElement('div');
    document.body.appendChild(e);
    renderCalendarGrid(e);
    tid(e, 'calendar-empty-add-location').click();
    expect(document.getElementById('loc-edit-panel').textContent).toContain('Add location');
    expect(window.location.hash).toBe('#/events');
  });

  it('harvest "Feed types" opens the Feed types dialog over the harvest sheet (kept open)', () => {
    seed();
    openHarvestSheet(OP);
    document.querySelector('[data-testid="harvest-feed-types-link"]').click();
    expect(document.getElementById('feed-types-wrap').classList.contains('open')).toBe(true);
    expect(document.getElementById('harvest-sheet-wrap').classList.contains('open')).toBe(true);
    expect(Number(document.getElementById('feed-types-wrap').style.zIndex))
      .toBeGreaterThan(Number(document.getElementById('harvest-sheet-wrap').style.zIndex));
  });
});

describe('OI-0265 Lg1 — List pills, legacy cards, farm pills', () => {
  beforeEach(() => seed());

  it('six legacy pills; All = pasture/mixed rows then crop/confinement/storage cards by name', () => {
    const c = renderList();
    const pills = [...tid(c, 'loc-mgmt-list-filters').querySelectorAll('button')].map(b => b.textContent);
    expect(pills).toEqual(['All', 'Pasture', 'Mixed-Use', 'Crop', 'Confinement', 'Storage']);
    expect(rowIds(c).sort()).toEqual([L.past, L.mixed].sort());
    expect(cardNames(c)).toEqual(['Barn lot', 'Corn', 'Hay shed']);
    const body = tid(c, 'loc-mgmt-body');
    const cards = tid(c, 'loc-mgmt-legacy-cards');
    const lastRow = [...body.querySelectorAll('[data-testid="loc-mgmt-row"]')].pop();
    expect(lastRow.compareDocumentPosition(cards) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(tid(c, 'loc-mgmt-list-farms')).toBeNull(); // single farm
  });

  it('Crop / Confinement / Storage show only that type as legacy cards; Pasture shows rows only', () => {
    const c = renderList();
    tid(c, 'loc-mgmt-list-filter-crop').click();
    expect(rowIds(c)).toEqual([]);
    expect(cardNames(c)).toEqual(['Corn']);
    const crop = c.querySelector('[data-testid="loc-mgmt-legacy-cards"] .card');
    const btns = [...crop.querySelectorAll('button')].map(b => b.textContent);
    expect(btns).toEqual(['Edit', '\uD83D\uDCCB Survey', '\u270E Soil']);
    btns.length && [...crop.querySelectorAll('button')][0].click();
    expect(document.getElementById('loc-edit-panel').textContent).toContain('Delete location');

    tid(c, 'loc-mgmt-list-filter-confinement').click();
    expect(cardNames(c)).toEqual(['Barn lot']);
    const conf = c.querySelector('[data-testid="loc-mgmt-legacy-cards"] .card');
    expect([...conf.querySelectorAll('button')].map(b => b.textContent)).toEqual(['Edit']);

    tid(c, 'loc-mgmt-list-filter-storage').click();
    expect(cardNames(c)).toEqual(['Hay shed']);

    tid(c, 'loc-mgmt-list-filter-pasture').click();
    expect(rowIds(c).sort()).toEqual([L.past, L.mixed].sort());
    expect(tid(c, 'loc-mgmt-legacy-cards')).toBeNull();
    tid(c, 'loc-mgmt-list-filter-all').click();
  });

  it('legacy type rule matches locations/index.js', () => {
    expect(matchesLegacyTypeFilter({ type: 'storage' }, 'storage')).toBe(true);
    expect(matchesLegacyTypeFilter({ type: 'land', landUse: 'crop' }, 'crop')).toBe(true);
    expect(matchesLegacyTypeFilter({ type: 'confinement', landUse: 'crop' }, 'crop')).toBe(false);
  });

  it('search filters rows and cards; Calendar view keeps pasture/mixed rows only', () => {
    const c = renderList();
    const search = tid(c, 'loc-mgmt-list-search');
    search.value = 'shed';
    search.dispatchEvent(new Event('input'));
    expect(rowIds(c)).toEqual([]);
    expect(cardNames(c)).toEqual(['Hay shed']);
    search.value = '';
    search.dispatchEvent(new Event('input'));

    window.history.replaceState(null, '', '#/events');
    readStateFromUrl();
    const cal = document.createElement('div');
    document.body.appendChild(cal);
    renderCalendarGrid(cal);
    expect(tid(cal, 'loc-mgmt-legacy-cards')).toBeNull();
  });

  it('List still renders when there are no pasture/mixed locations (cards only)', () => {
    seed();
    for (const id of [L.past, L.mixed]) {
      const loc = getById('locations', id);
      loc.archived = true;
    }
    const c = renderList();
    expect(tid(c, 'calendar-empty')).toBeNull();
    expect(cardNames(c)).toEqual(['Barn lot', 'Corn', 'Hay shed']);
  });
});

describe('OI-0265 Lg1 — farm pills (multi-farm only)', () => {
  it('shows All farms + one per farm and filters rows and cards by farm', () => {
    seed({ twoFarms: true });
    const c = renderList();
    const farms = tid(c, 'loc-mgmt-list-farms');
    expect([...farms.querySelectorAll('button')].map(b => b.textContent)).toEqual(['All farms', 'Home', 'River']);
    tid(c, `loc-mgmt-list-farm-${FARM2}`).click();
    expect(rowIds(c)).toEqual([L.mixed]);
    expect(cardNames(c)).toEqual(['Hay shed']);
    tid(c, 'loc-mgmt-list-farm-all').click();
    expect(cardNames(c)).toHaveLength(3);
  });
});

describe('OI-0265 Lg1 — a saved location appears at once', () => {
  it('a new storage location shows under All and Storage without remount', async () => {
    seed();
    window.history.replaceState(null, '', '#/events?view=list');
    const root = document.createElement('div');
    document.body.appendChild(root);
    renderEventsScreen(root);
    expect(cardNames(root)).not.toContain('Feed shed');
    addLoc('00000000-0000-4000-8000-0000000000c9', 'Feed shed', { type: 'storage' });
    await flush();
    expect(cardNames(root)).toContain('Feed shed');
    tid(root, 'loc-mgmt-list-filter-storage').click();
    expect(cardNames(root)).toEqual(['Feed shed', 'Hay shed']);
    tid(root, 'loc-mgmt-list-filter-all').click();
    expect(LIST_RERENDER_KEYS).toEqual(['locations', 'paddockObservations', 'soilTests', 'forageTypes', 'feedTypes']);
  });
});

describe('OI-0265 Sv-A / In-A — surveys and inputs', () => {
  beforeEach(() => seed());

  it('List "Surveys" → #/surveys; "Inputs & amendments" links to #/amendments', () => {
    const c = renderList();
    tid(c, 'loc-mgmt-list-surveys').click();
    expect(window.location.hash).toBe('#/surveys');
    const inputs = tid(c, 'loc-mgmt-list-inputs-link');
    expect(inputs.getAttribute('href')).toBe('#/amendments');
    inputs.click();
    expect(window.location.hash).toBe('#/amendments');
  });

  it('#/surveys: committed survey has Edit (bulk-edit sheet); draft has Resume and Discard', async () => {
    const committed = SurveyEntity.create({ operationId: OP, surveyDate: '2026-11-01', status: 'committed' });
    const draft = SurveyEntity.create({ operationId: OP, surveyDate: '2026-11-20', status: 'draft' });
    for (const s of [committed, draft]) add('surveys', s, SurveyEntity.validate, SurveyEntity.toSupabaseShape, 'surveys');
    add('surveyDraftEntries', DraftEntity.create({ operationId: OP, surveyId: draft.id, locationId: L.past, forageQuality: 50 }),
      DraftEntity.validate, DraftEntity.toSupabaseShape, 'survey_draft_entries');
    const c = document.createElement('div');
    document.body.appendChild(c);
    renderSurveysScreen(c);

    expect(tid(c, `surveys-edit-${draft.id}`)).toBeNull();
    tid(c, `surveys-edit-${committed.id}`).click();
    expect(document.getElementById('survey-sheet-wrap').classList.contains('open')).toBe(true);

    expect(tid(c, `surveys-resume-${draft.id}`)).toBeTruthy();
    expect(tid(c, `surveys-finish-${draft.id}`)).toBeTruthy(); // existing actions stay
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    tid(c, `surveys-discard-${draft.id}`).click();
    expect(confirm).toHaveBeenCalledWith('Discard this survey draft?');
    expect(getById('surveys', draft.id)).toBeFalsy();
    expect(getAll('surveyDraftEntries').filter(d => d.surveyId === draft.id)).toEqual([]);
    expect(getById('surveys', committed.id)).toBeTruthy();
  });
});

describe('OI-0265 Ft1 — one feed-type dialog', () => {
  const HAY = '00000000-0000-4000-8000-0000000000f1';
  const SUPP = '00000000-0000-4000-8000-0000000000f2';
  const OLD = '00000000-0000-4000-8000-0000000000f3';
  const panel = () => document.getElementById('feed-types-panel');
  const dlg = () => document.getElementById('feed-type-sheet-panel');
  const d$ = id => dlg().querySelector(`[data-testid="${id}"]`);

  beforeEach(() => {
    seed();
    const ft = (data) => add('feedTypes', FeedTypeEntity.create({ operationId: OP, unit: 'bale', ...data }),
      FeedTypeEntity.validate, FeedTypeEntity.toSupabaseShape, 'feed_types');
    ft({ id: HAY, name: 'Grass hay', category: 'hay', harvestActive: false, defaultWeightKg: 400 });
    ft({ id: SUPP, name: 'Mineral', category: 'supplement', harvestActive: false });
    ft({ id: OLD, name: 'Old type', category: 'hay', archived: true });
  });

  it('rows = Feeds rows (non-archived, user units); Edit opens the Feeds dialog stacked above', () => {
    openFeedTypesSheet(OP);
    expect(panel().textContent).toContain('Grass hay');
    expect(panel().textContent).not.toContain('Old type');
    expect(panel().textContent).toContain('lbs/unit');
    panel().querySelector(`[data-testid="feed-type-edit-${HAY}"]`).click();
    expect(dlg()).toBeTruthy();
    expect(d$('feed-type-sheet-n')).toBeTruthy();
    expect(d$('feed-type-sheet-category').options).toHaveLength(5);
    expect(d$('feed-type-sheet-harvest')).toBeTruthy();
    const wrap = document.getElementById('feed-type-sheet-wrap');
    expect(wrap.classList.contains('open')).toBe(true);
    expect(Number(wrap.style.zIndex)).toBeGreaterThan(Number(document.getElementById('feed-types-wrap').style.zIndex));
    // The retired inline form is gone.
    expect(panel().textContent).not.toContain('Add type');
    expect(panel().querySelector('[data-testid="location-feed-type-unit"]')).toBeNull();
  });

  it('saving keeps Harvest active Off and a supplement category; list refreshes after save', async () => {
    openFeedTypesSheet(OP);
    panel().querySelector(`[data-testid="feed-type-edit-${HAY}"]`).click();
    d$('feed-type-sheet-name').value = 'Grass hay 2';
    d$('feed-type-sheet-save').click();
    expect(getById('feedTypes', HAY).harvestActive).toBe(false);
    await flush();
    expect(panel().textContent).toContain('Grass hay 2');

    panel().querySelector(`[data-testid="feed-type-edit-${SUPP}"]`).click();
    d$('feed-type-sheet-save').click();
    expect(getById('feedTypes', SUPP).category).toBe('supplement');
    expect(getById('feedTypes', SUPP).harvestActive).toBe(false);
  });

  it('"+ Add feed type" opens the Feeds dialog empty; Delete removes with confirm', async () => {
    openFeedTypesSheet(OP);
    panel().querySelector('[data-testid="feed-types-dialog-add"]').click();
    expect(d$('feed-type-sheet-name').value).toBe('');
    expect(dlg().textContent).toContain(enLocale.feed.createFeedType);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    panel().querySelector(`[data-testid="feed-type-delete-${SUPP}"]`).click();
    expect(confirm).toHaveBeenCalledWith(enLocale.feed.confirmDeleteFeedType);
    expect(getById('feedTypes', SUPP)).toBeFalsy();
    await flush();
    expect(panel().textContent).not.toContain('Mineral');
  });
});
