/**
 * @file v1 → v2 migration transform engine — CP-57.
 * Reads a v1 JSON export (S object from exportDataJSON()), applies all 25
 * transform sections per V2_MIGRATION_PLAN.md §2.1–§2.25, and synthesizes
 * a v2 backup envelope for the CP-56 import pipeline.
 */

import { logger } from '../utils/logger.js';
import { CURRENT_SCHEMA_VERSION } from './backup-import.js';

// ── Constants ────────────────────────────────────────────────────────
const LBS_TO_KG = 0.453592;
const ACRES_TO_HA = 0.404686;
const INCHES_TO_CM = 2.54;
const LBS_PER_ACRE_TO_KG_PER_HA = 1.12085;
/**
 * dm_lbs_per_inch_per_acre → dm_kg_per_cm_per_ha
 * Factor: (lbs→kg) / (inch→cm) / (acre→ha) = 0.453592 / 2.54 / 0.404686 ≈ 0.4412
 */
const DM_LBS_IN_AC_TO_KG_CM_HA = 0.4412;

// ── ID Map ───────────────────────────────────────────────────────────

/**
 * Create an ID remapping helper. Maps v1 IDs (bigint/text) → v2 UUIDs.
 * @returns {{ remap(v1Id): string, getMap(): Map }}
 */
function createIdMap() {
  const map = new Map();
  return {
    remap(v1Id) {
      if (v1Id == null) return null;
      const key = String(v1Id);
      if (!map.has(key)) map.set(key, crypto.randomUUID());
      return map.get(key);
    },
    getMap() { return map; },
  };
}

// ── Dose parser (§2.7) ──────────────────────────────────────────────

/**
 * Best-effort parse of v1 freeform dose text.
 * Returns { amount, unitStr } or null if unparseable.
 */
function parseDose(doseText) {
  if (!doseText || typeof doseText !== 'string') return null;
  const match = doseText.trim().match(/^([\d.]+)\s*(.*)$/);
  if (!match) return null;
  const amount = parseFloat(match[1]);
  if (isNaN(amount)) return null;
  return { amount, unitStr: (match[2] || '').trim().toLowerCase() };
}

/**
 * Match a dose unit string to a dose_units row id.
 * @param {string} unitStr
 * @param {Map<string, string>} unitLookup - lowercase name → v2 uuid
 * @returns {string|null}
 */
function matchDoseUnit(unitStr, unitLookup) {
  if (!unitStr) return null;
  // Direct match
  if (unitLookup.has(unitStr)) return unitLookup.get(unitStr);
  // Common aliases
  const aliases = { ml: 'ml', cc: 'ml', tabs: 'tablet', tab: 'tablet', tablets: 'tablet', pills: 'tablet', pill: 'tablet' };
  const alias = aliases[unitStr];
  if (alias && unitLookup.has(alias)) return unitLookup.get(alias);
  return null;
}

// ── Role heuristic (§2.14) ──────────────────────────────────────────

function inferRole(className) {
  const lower = (className || '').toLowerCase();
  if (lower.includes('cow') || lower.includes('heifer')) return 'cow';
  if (lower.includes('calf') || lower.includes('calves')) return 'calf';
  if (lower.includes('bull')) return 'bull';
  if (lower.includes('steer')) return 'steer';
  if (lower.includes('yearling')) return 'yearling';
  return 'cow'; // safe default for beef operation
}

// ── Main transform ───────────────────────────────────────────────────

/**
 * Detect whether a parsed JSON object is a v1 export.
 * v1 exports are flat objects with `pastures`, `events`, `herd`, `settings`.
 * v2 backups have `format === "gtho-v2-backup"`.
 */
export function isV1Export(obj) {
  if (!obj || typeof obj !== 'object') return false;
  if (obj.format === 'gtho-v2-backup') return false;
  return Array.isArray(obj.pastures) || Array.isArray(obj.events) || obj.herd != null || obj.settings != null;
}

/**
 * Transform a v1 export into a v2 backup envelope.
 *
 * @param {object} v1 - Parsed v1 JSON (the S object)
 * @param {object} opts
 * @param {string} opts.operationId - The target v2 operation UUID
 * @param {string} opts.userId - Current user's auth id
 * @param {string} opts.userEmail - Current user's email
 * @param {string} opts.timezone - User's timezone (e.g. 'America/Chicago')
 * @param {Array<{id: string, name: string}>} [opts.existingDoseUnits] - Existing v2 dose_units for matching
 * @returns {{ envelope: object, audit: object }}
 */
export function transformV1ToV2(v1, opts) {
  const { operationId, userId, userEmail, timezone, existingDoseUnits = [] } = opts;

  // Build dose unit lookup for treatment dose parsing
  const doseUnitLookup = new Map();
  for (const du of existingDoseUnits) {
    doseUnitLookup.set(du.name.toLowerCase(), du.id);
  }

  // Ensure arrays exist (v1 ensureDataArrays pattern)
  const ensure = (key) => Array.isArray(v1[key]) ? v1[key] : [];
  const settings = v1.settings || {};
  const herd = v1.herd || {};

  // ID maps per table
  const ids = {
    operations: createIdMap(),
    farms: createIdMap(),
    locations: createIdMap(),
    forageTypes: createIdMap(),
    animalClasses: createIdMap(),
    animals: createIdMap(),
    groups: createIdMap(),
    events: createIdMap(),
    feedTypes: createIdMap(),
    batches: createIdMap(),
    surveys: createIdMap(),
    aiBulls: createIdMap(),
    treatmentTypes: createIdMap(),
    treatmentCategories: createIdMap(),
    inputProducts: createIdMap(),
    inputProductCategories: createIdMap(),
    harvestEvents: createIdMap(),
    todos: createIdMap(),
    users: createIdMap(),
    manureBatches: createIdMap(),
    manureBatchTransactions: createIdMap(),
    amendments: createIdMap(),
    soilTests: createIdMap(),
    observations: createIdMap(),
  };

  // Audit tracking
  const audit = {
    counts: {},
    unparseableDoses: [], // { animalTag, date, rawDose, treatmentType }
    npkDeltas: [], // { eventId, v1N, v1P, v1K, v2N, v2P, v2K, deltaPct }
    warnings: [],
    skipped: [],
  };

  const now = new Date().toISOString();
  const migrationDate = now.split('T')[0]; // YYYY-MM-DD

  // ── §2.8: Operation ────────────────────────────────────────────
  const opId = operationId;
  // Force the id map to use the provided operationId
  ids.operations.remap('__op__');
  const farmId = ids.farms.remap('__farm__');

  const v2Operations = [{
    id: opId,
    name: herd.name || settings.herdName || 'My Operation',
    timezone: timezone || 'America/Chicago',
    currency: 'USD',
    unit_system: 'imperial',
    schema_version: CURRENT_SCHEMA_VERSION,
    archived: false,
    created_at: now,
    updated_at: now,
  }];

  // ── §2.8: Farm ─────────────────────────────────────────────────
  const v2Farms = [{
    id: farmId,
    operation_id: opId,
    name: herd.name ? `${herd.name} Farm` : 'Home Farm',
    address: null,
    latitude: null,
    longitude: null,
    area_hectares: null,
    notes: null,
    archived: false,
    created_at: now,
    updated_at: now,
  }];

  // ── §2.8: Farm Settings ────────────────────────────────────────
  const fsId = crypto.randomUUID();
  const v2FarmSettings = [{
    id: fsId,
    farm_id: farmId,
    operation_id: opId,
    default_au_weight_kg: (settings.auWeight || 1000) * LBS_TO_KG,
    default_residual_height_cm: (settings.residualGrazeHeight || 4) * INCHES_TO_CM,
    default_utilization_pct: settings.forageUtilizationPct || 65,
    recovery_required: settings.recoveryRequired || false,
    default_recovery_min_days: settings.recoveryMinDays || 21,
    default_recovery_max_days: settings.recoveryMaxDays || 60,
    n_price_per_kg: (settings.nPrice || 0.55) / LBS_TO_KG,
    p_price_per_kg: (settings.pPrice || 0.65) / LBS_TO_KG,
    k_price_per_kg: (settings.kPrice || 0.42) / LBS_TO_KG,
    default_manure_rate_kg_per_day: (settings.manureVolumeRate || 65) * LBS_TO_KG,
    feed_day_goal: settings.feedDayGoal || 90,
    forage_quality_scale_min: 1,
    forage_quality_scale_max: 100,
    threshold_aud_target_pct: settings.thresholds?.audsTargetPct || 80,
    threshold_aud_warn_pct: settings.thresholds?.audsWarningPct || 60,
    threshold_rotation_target_pct: settings.thresholds?.pasturePercentTarget || 80,
    threshold_rotation_warn_pct: settings.thresholds?.pasturePercentWarn || 60,
    threshold_npk_warn_per_ha: settings.thresholds?.npkPerAcre ? settings.thresholds.npkPerAcre / ACRES_TO_HA : null,
    threshold_cost_per_day_target: settings.thresholds?.costPerDayTarget || null,
    threshold_cost_per_day_warn: settings.thresholds?.costPerDayWarn || null,
    created_at: now,
    updated_at: now,
  }];

  // ── §2.8: User Preferences ────────────────────────────────────
  const v2UserPreferences = [{
    id: crypto.randomUUID(),
    operation_id: opId,
    user_id: userId,
    home_view_mode: settings.homeViewMode || 'groups',
    default_view_mode: 'detail',
    stat_period_days: settings.homeStatPeriod === '30d' ? 30 : settings.homeStatPeriod === '14d' ? 14 : 14,
    active_farm_id: null, // All farms mode (§2.24)
    field_mode_quick_actions: null,
    created_at: now,
    updated_at: now,
  }];

  // ── §2.10: Forage Types ────────────────────────────────────────
  const v2ForageTypes = ensure('forageTypes').map(ft => ({
    id: ids.forageTypes.remap(ft.id),
    operation_id: opId,
    name: ft.name || 'Unknown',
    dm_pct: ft.dmPct ?? ft.dm_pct ?? null,
    n_per_tonne_dm: ft.nPerTonneDm ?? ft.n_per_tonne_dm ?? null,
    p_per_tonne_dm: ft.pPerTonneDm ?? ft.p_per_tonne_dm ?? null,
    k_per_tonne_dm: ft.kPerTonneDm ?? ft.k_per_tonne_dm ?? null,
    dm_kg_per_cm_per_ha: ft.dmLbsPerInchPerAcre != null ? ft.dmLbsPerInchPerAcre * DM_LBS_IN_AC_TO_KG_CM_HA
      : ft.dm_lbs_per_inch_per_acre != null ? ft.dm_lbs_per_inch_per_acre * DM_LBS_IN_AC_TO_KG_CM_HA
      : null,
    min_residual_height_cm: settings.residualGrazeHeight ? settings.residualGrazeHeight * INCHES_TO_CM : null,
    utilization_pct: settings.forageUtilizationPct || null,
    notes: ft.notes || null,
    is_seeded: ft.isSeeded ?? false,
    archived: false,
    created_at: now,
    updated_at: now,
  }));

  // ── §2.14: Animal Classes ──────────────────────────────────────
  const weanTargets = settings.weanTargets || { cattle: 205, sheep: 60, goat: 60 };
  const v2AnimalClasses = ensure('animalClasses').map(ac => ({
    id: ids.animalClasses.remap(ac.id),
    operation_id: opId,
    name: ac.name || 'Unknown',
    species: 'beef_cattle', // Tim's operation is all beef (§2.14)
    role: inferRole(ac.name),
    default_weight_kg: ac.weight != null ? ac.weight * LBS_TO_KG : null,
    dmi_pct: ac.dmiPct ?? ac.dmi_pct ?? null,
    dmi_pct_lactating: null, // new in v2 (§2.14)
    excretion_n_rate: null,  // seed with NRCS defaults post-migration
    excretion_p_rate: null,
    excretion_k_rate: null,
    weaning_age_days: weanTargets.cattle || 205,
    archived: false,
    created_at: now,
    updated_at: now,
  }));

  // ── §2.15: Animals ─────────────────────────────────────────────
  const v2Animals = ensure('animals').map(a => ({
    id: ids.animals.remap(a.id),
    operation_id: opId,
    class_id: a.classId ? ids.animalClasses.remap(a.classId) : a.class_id ? ids.animalClasses.remap(a.class_id) : null,
    tag_num: a.tag ?? a.tagNum ?? null,
    eid: a.eid || null,
    name: a.name || null,
    sex: a.sex || 'female',
    dam_id: a.damId ? ids.animals.remap(a.damId) : a.dam_id ? ids.animals.remap(a.dam_id) : null,
    sire_animal_id: null, // populated below from breeding/calving records
    sire_ai_bull_id: null, // populated below
    birth_date: a.birthDate || a.birth_date || null,
    weaned: null,
    weaned_date: null,
    // OI-0099: confirmed_bred column added in migration 026. v1 had a
    // `confirmedBred` boolean; preserve when present, default to false.
    confirmed_bred: a.confirmedBred === true || a.confirmed_bred === true ? true : false,
    notes: a.notes || null,
    active: a.archived === true ? false : true,
    cull_date: null,
    cull_reason: null,
    cull_notes: null,
    created_at: now,
    updated_at: now,
  }));

  // ── §2.13: Groups ──────────────────────────────────────────────
  const v2Groups = ensure('animalGroups').map(g => ({
    id: ids.groups.remap(g.id),
    operation_id: opId,
    farm_id: farmId,
    name: g.name || 'Unnamed Group',
    color: g.color || null,
    // OI-0090: schema_version 24 upgraded `archived boolean` → `archived_at timestamptz`.
    archived_at: g.archived ? now : null,
    created_at: now,
    updated_at: now,
  }));

  // ── §2.24: Animal Group Memberships ────────────────────────────
  const v2AnimalGroupMemberships = ensure('animalGroupMemberships').map(m => ({
    id: crypto.randomUUID(),
    operation_id: opId,
    animal_id: ids.animals.remap(m.animalId || m.animal_id),
    group_id: ids.groups.remap(m.groupId || m.group_id),
    date_joined: m.dateJoined || m.date_joined || migrationDate,
    date_left: m.dateLeft || m.date_left || null,
    created_at: now,
    updated_at: now,
  }));

  // ── §2.1: Pastures → Locations ─────────────────────────────────
  const v2Locations = ensure('pastures').map(p => {
    const locationType = p.locationType || p.location_type || 'paddock';
    let type, landUse;
    if (locationType === 'drylot' || locationType === 'barn') {
      type = 'confinement';
      landUse = null;
    } else {
      type = 'land';
      landUse = 'pasture';
    }

    return {
      id: ids.locations.remap(p.id),
      operation_id: opId,
      farm_id: farmId,
      name: p.name || 'Unnamed',
      type,
      land_use: landUse,
      area_hectares: p.acres != null ? p.acres * ACRES_TO_HA : null,
      field_code: null,
      soil_type: null,
      forage_type_id: p.forageTypeId ? ids.forageTypes.remap(p.forageTypeId)
        : p.forage_type_id ? ids.forageTypes.remap(p.forage_type_id) : null,
      capture_percent: p.capturePercent ?? p.capture_percent ?? null,
      archived: p.archived ?? false,
      created_at: now,
      updated_at: now,
    };
  });

  // Valid location IDs — for skipping references to unmigrated/archived locations
  const validLocationIds = new Set(v2Locations.map(l => l.id));

  // ── §2.24: Feed Types ──────────────────────────────────────────
  const v2FeedTypes = ensure('feedTypes').map(ft => ({
    id: ids.feedTypes.remap(ft.id),
    operation_id: opId,
    name: ft.name || 'Unknown',
    category: ft.category || 'hay',
    unit: ft.unit || 'bale',
    dm_pct: ft.dmPct ?? ft.dm_pct ?? null,
    n_pct: ft.nPct ?? ft.n_pct ?? null,
    p_pct: ft.pPct ?? ft.p_pct ?? null,
    k_pct: ft.kPct ?? ft.k_pct ?? null,
    default_weight_kg: ft.defaultWeightLbs != null ? ft.defaultWeightLbs * LBS_TO_KG
      : ft.default_weight_lbs != null ? ft.default_weight_lbs * LBS_TO_KG : null,
    cutting_number: ft.cuttingNum ?? ft.cutting_number ?? null,
    forage_type_id: ft.forageTypeId ? ids.forageTypes.remap(ft.forageTypeId) : null,
    harvest_active: ft.harvestActive ?? ft.harvest_active ?? false,
    archived: ft.archived ?? false,
    created_at: now,
    updated_at: now,
  }));

  // ── §2.24: AI Bulls ────────────────────────────────────────────
  const v2AiBulls = ensure('aiBulls').map(b => ({
    id: ids.aiBulls.remap(b.id),
    operation_id: opId,
    name: b.name || 'Unknown',
    breed: b.breed || null,
    tag: b.tag || null,
    reg_num: b.regNum ?? b.reg_num ?? null,
    archived: b.archived ?? false,
    created_at: now,
    updated_at: now,
  }));

  // ── §2.24: Treatment Categories + Treatment Types ──────────────
  // Extract implicit categories from treatment types
  const categoryMap = new Map(); // category name → v2 uuid
  const v1TreatmentTypes = ensure('treatmentTypes');
  for (const tt of v1TreatmentTypes) {
    const cat = tt.category || 'General';
    if (!categoryMap.has(cat)) {
      categoryMap.set(cat, crypto.randomUUID());
    }
  }

  const v2TreatmentCategories = [...categoryMap.entries()].map(([name, id]) => ({
    id,
    operation_id: opId,
    name,
    is_default: name === 'General',
    archived: false,
    created_at: now,
    updated_at: now,
  }));

  const v2TreatmentTypes = v1TreatmentTypes.map(tt => ({
    id: ids.treatmentTypes.remap(tt.id),
    operation_id: opId,
    name: tt.name || 'Unknown',
    category_id: categoryMap.get(tt.category || 'General'),
    archived: tt.archived ?? false,
    created_at: now,
    updated_at: now,
  }));

  // ── §2.24: Input Product Categories + Input Products ───────────
  const prodCatMap = new Map();
  const v1Products = ensure('inputProducts');
  for (const p of v1Products) {
    const cat = p.category || 'General';
    if (!prodCatMap.has(cat)) {
      prodCatMap.set(cat, crypto.randomUUID());
    }
  }

  const v2InputProductCategories = [...prodCatMap.entries()].map(([name, id]) => ({
    id,
    operation_id: opId,
    name,
    is_default: name === 'General',
    archived: false,
    created_at: now,
    updated_at: now,
  }));

  const v2InputProducts = v1Products.map(p => ({
    id: ids.inputProducts.remap(p.id),
    operation_id: opId,
    name: p.name || 'Unknown',
    category_id: prodCatMap.get(p.category || 'General'),
    n_pct: p.nPct ?? p.n_pct ?? null,
    p_pct: p.pPct ?? p.p_pct ?? null,
    k_pct: p.kPct ?? p.k_pct ?? null,
    s_pct: null, ca_pct: null, mg_pct: null, cu_pct: null, fe_pct: null,
    mn_pct: null, mo_pct: null, zn_pct: null, b_pct: null, cl_pct: null,
    cost_per_unit: p.costPerUnit ?? p.cost_per_unit ?? null,
    unit_id: null,
    archived: p.archived ?? false,
    created_at: now,
    updated_at: now,
  }));

  // ── §2.24: Operation Members ───────────────────────────────────
  // operation_members excluded from backup (§5.4), skip

  // ── §2.16: Batches ─────────────────────────────────────────────
  const v2Batches = ensure('batches').map(b => ({
    id: ids.batches.remap(b.id),
    operation_id: opId,
    feed_type_id: ids.feedTypes.remap(b.typeId || b.feedTypeId || b.feed_type_id),
    name: b.name || 'Batch',
    batch_number: null,
    source: b.source || 'purchase',
    quantity: b.quantity ?? 0,
    remaining: b.remaining ?? b.quantity ?? 0,
    unit: b.unit || 'bale',
    weight_per_unit_kg: b.weightPerUnitKg != null ? b.weightPerUnitKg * LBS_TO_KG
      : b.weight_per_unit_kg != null ? b.weight_per_unit_kg * LBS_TO_KG : null,
    dm_pct: b.dmPct ?? b.dm_pct ?? null,
    cost_per_unit: b.costPerUnit ?? b.cost_per_unit ?? null,
    purchase_date: b.purchaseDate || b.purchase_date || null,
    notes: b.notes || null,
    archived: b.archived ?? false,
    created_at: now,
    updated_at: now,
  }));

  // ── §2.17: Batch Adjustments ───────────────────────────────────
  const v2BatchAdjustments = [];
  for (const b of ensure('batches')) {
    const adjustments = b.adjustments || [];
    for (const adj of adjustments) {
      v2BatchAdjustments.push({
        id: crypto.randomUUID(),
        batch_id: ids.batches.remap(b.id),
        operation_id: opId,
        adjusted_by: null,
        previous_qty: adj.previousQty ?? adj.previous_qty ?? 0,
        new_qty: adj.newQty ?? adj.new_qty ?? 0,
        delta: (adj.newQty ?? adj.new_qty ?? 0) - (adj.previousQty ?? adj.previous_qty ?? 0),
        reason: adj.reason || null,
        created_at: adj.timestamp || adj.created_at || now,
      });
    }
  }

  // ── §2.2–§2.6: Events and child tables ─────────────────────────
  const v2Events = [];
  const v2PaddockWindows = [];
  const v2GroupWindows = [];
  const v2FeedEntries = [];
  const v2FeedChecks = [];
  const v2FeedCheckItems = [];

  // §2.5: Build transfer pair index BEFORE event loop (OI-0049)
  const transferPairIndex = new Map();
  for (const ev of ensure('events')) {
    const fes = ev.feedEntries || ev.feed_entries || [];
    for (const fe of fes) {
      if (fe.kind === 'transfer' && (fe.transferPairId || fe.transfer_pair_id)) {
        const pairId = fe.transferPairId || fe.transfer_pair_id;
        const qty = fe.qty ?? fe.quantity ?? 0;
        const entry = transferPairIndex.get(String(pairId)) || {};
        if (qty < 0) {
          entry.sourceEventV1Id = ev.id;
        } else {
          entry.destEventV1Id = ev.id;
        }
        transferPairIndex.set(String(pairId), entry);
      }
    }
  }
  audit.transferPairsFound = transferPairIndex.size;
  let transferPairsLinked = 0;
  let transferPairsOrphaned = 0;

  for (const ev of ensure('events')) {
    const eventId = ids.events.remap(ev.id);

    // §2.2: Event
    v2Events.push({
      id: eventId,
      operation_id: opId,
      farm_id: farmId,
      date_in: ev.dateIn || ev.date_in || ev.startDate || migrationDate,
      time_in: ev.timeIn || ev.time_in || null,
      date_out: ev.dateOut || ev.date_out || ev.endDate || null,
      time_out: ev.timeOut || ev.time_out || null,
      source_event_id: null, // §2.2: NULL for all migrated events
      notes: ev.notes || null,
      created_at: ev.created_at || now,
      updated_at: now,
    });

    // §2.3: Anchor paddock → first paddock window
    const anchorPastureId = ev.pastureId || ev.pasture_id;
    const eventDateIn = ev.dateIn || ev.date_in || ev.startDate || migrationDate;
    const anchorLocationId = anchorPastureId ? ids.locations.remap(anchorPastureId) : null;
    if (anchorLocationId && validLocationIds.has(anchorLocationId)) {
      v2PaddockWindows.push({
        id: crypto.randomUUID(),
        operation_id: opId,
        event_id: eventId,
        location_id: anchorLocationId,
        date_opened: eventDateIn,
        time_opened: ev.timeIn || ev.time_in || null,
        date_closed: ev.dateOut || ev.date_out || ev.endDate || null,
        time_closed: ev.timeOut || ev.time_out || null,
        no_pasture: ev.noPasture || ev.no_pasture || false,
        is_strip_graze: false,
        strip_group_id: null,
        area_pct: 100,
        created_at: now,
        updated_at: now,
      });
    }

    // §2.3: Sub-moves → additional paddock windows
    const subMoves = ev.subMoves || ev.sub_moves || [];
    for (const sm of subMoves) {
      const smPastureId = sm.pastureId || sm.pasture_id;
      if (!smPastureId) continue;
      const smLocationId = ids.locations.remap(smPastureId);
      if (!validLocationIds.has(smLocationId)) continue;
      v2PaddockWindows.push({
        id: crypto.randomUUID(),
        operation_id: opId,
        event_id: eventId,
        location_id: smLocationId,
        date_opened: sm.dateOpened || sm.date_opened || eventDateIn,
        time_opened: sm.timeOpened || sm.time_opened || null,
        date_closed: sm.dateClosed || sm.date_closed || null,
        time_closed: sm.timeClosed || sm.time_closed || null,
        no_pasture: false,
        is_strip_graze: false,
        strip_group_id: null,
        area_pct: 100,
        created_at: now,
        updated_at: now,
      });
    }

    // §2.4: Groups → group windows
    const groups = ev.groups || [];
    for (const g of groups) {
      const groupId = g.groupId || g.group_id;
      if (!groupId) continue;
      v2GroupWindows.push({
        id: crypto.randomUUID(),
        operation_id: opId,
        event_id: eventId,
        group_id: ids.groups.remap(groupId),
        date_joined: g.dateJoined || g.date_joined || eventDateIn,
        time_joined: g.timeJoined || g.time_joined || null,
        date_left: g.dateLeft || g.date_left || null,
        time_left: g.timeLeft || g.time_left || null,
        head_count: g.headSnapshot || g.head_snapshot || g.headCount || g.head_count || 0,
        avg_weight_kg: (g.weightSnapshot || g.weight_snapshot || g.avgWeight || g.avg_weight || 0) * LBS_TO_KG,
        created_at: now,
        updated_at: now,
      });
    }

    // §2.5: Feed entries
    const feedEntries = ev.feedEntries || ev.feed_entries || [];
    // Build sub-move ID → location lookup
    const subMoveLocationMap = new Map();
    for (const sm of subMoves) {
      subMoveLocationMap.set(String(sm.id), ids.locations.remap(sm.pastureId || sm.pasture_id));
    }

    for (const fe of feedEntries) {
      // Resolve location_id per §2.5
      let locationId;
      const subMoveId = fe.subMoveId || fe.sub_move_id;
      if (subMoveId && subMoveLocationMap.has(String(subMoveId))) {
        locationId = subMoveLocationMap.get(String(subMoveId));
      } else if (anchorLocationId) {
        locationId = anchorLocationId;
      } else {
        // Skip feed entry without a resolvable location
        audit.warnings.push(`Feed entry ${fe.id} on event ${ev.id}: no resolvable location, skipped.`);
        continue;
      }
      if (!validLocationIds.has(locationId)) {
        audit.warnings.push(`Feed entry ${fe.id} on event ${ev.id}: location not in migrated set, skipped.`);
        continue;
      }

      const qty = fe.qty ?? fe.quantity ?? 0;

      // §2.5: Resolve transfer link via transferPairId (OI-0049)
      let sourceEventId = null;
      const pairId = fe.transferPairId || fe.transfer_pair_id;
      if (fe.kind === 'transfer' && pairId) {
        const pair = transferPairIndex.get(String(pairId));
        if (pair) {
          if (qty < 0 && pair.destEventV1Id) {
            sourceEventId = ids.events.remap(pair.destEventV1Id);
            transferPairsLinked++;
          } else if (qty >= 0 && pair.sourceEventV1Id) {
            sourceEventId = ids.events.remap(pair.sourceEventV1Id);
            transferPairsLinked++;
          } else {
            transferPairsOrphaned++;
            audit.warnings.push(`Transfer pair ${pairId}: missing ${qty < 0 ? 'dest' : 'source'} side.`);
          }
        } else {
          transferPairsOrphaned++;
          audit.warnings.push(`Transfer pair ${pairId} not found in index.`);
        }
      }

      const batchId = fe.batchId ? ids.batches.remap(fe.batchId)
        : fe.batch_id ? ids.batches.remap(fe.batch_id) : null;
      if (!batchId) {
        audit.warnings.push(`Feed entry ${fe.id} on event ${ev.id}: no batch_id, skipped.`);
        continue;
      }

      v2FeedEntries.push({
        id: crypto.randomUUID(),
        operation_id: opId,
        event_id: eventId,
        batch_id: batchId,
        location_id: locationId,
        date: fe.date || eventDateIn,
        time: fe.time || null,
        quantity: Math.abs(qty),
        source_event_id: sourceEventId,
        created_at: now,
        updated_at: now,
      });
    }

    // §2.6: Feed residual checks
    const feedChecks = ev.feedResidualChecks || ev.feed_residual_checks || [];
    for (const fc of feedChecks) {
      const checkId = crypto.randomUUID();
      v2FeedChecks.push({
        id: checkId,
        operation_id: opId,
        event_id: eventId,
        date: fc.date || eventDateIn,
        time: fc.time || null,
        is_close_reading: fc.isCloseReading || fc.is_close_reading || false,
        notes: fc.notes || null,
        created_at: now,
        updated_at: now,
      });

      // Extract type_checks JSONB → check items
      const typeChecks = fc.typeChecks || fc.type_checks || [];
      for (const tc of typeChecks) {
        const batchId = tc.batchId || tc.batch_id;
        if (!batchId) {
          audit.warnings.push(`Feed check item on event ${ev.id}: no batch_id, skipped.`);
          continue;
        }
        const rawLocId = tc.pastureId || tc.pasture_id || tc.locationId || tc.location_id;
        const checkItemLocId = rawLocId ? ids.locations.remap(rawLocId) : anchorLocationId;
        if (!checkItemLocId || !validLocationIds.has(checkItemLocId)) {
          audit.warnings.push(`Feed check item on event ${ev.id}: location not in migrated set, skipped.`);
          continue;
        }
        v2FeedCheckItems.push({
          id: crypto.randomUUID(),
          operation_id: opId,
          feed_check_id: checkId,
          batch_id: ids.batches.remap(batchId),
          location_id: checkItemLocId,
          remaining_quantity: tc.remainingQuantity ?? tc.remaining_quantity ?? tc.remaining ?? 0,
          created_at: now,
        });
      }
    }
  }

  // ── §2.7: Health Events → 5 tables + weight records + notes ────
  const v2BcsScores = [];
  const v2Treatments = [];
  const v2BreedingRecords = [];
  const v2HeatRecords = [];
  const v2CalvingRecords = [];
  const v2WeightRecords = [];
  const v2AnimalNotes = [];

  // Track breeding/calving sire info for back-populating animals
  const animalSireMap = new Map(); // v1 animal id → { sireAnimalId, sireAiBullId }

  const v1HealthEvents = ensure('animalHealthEvents') || ensure('animal_health_events') || [];
  // v1 may store health events under various keys — also check if it's in a combined array
  const healthEvents = v1HealthEvents.length > 0 ? v1HealthEvents : [];

  for (const he of healthEvents) {
    const animalId = he.animalId || he.animal_id;
    if (!animalId) continue;
    const v2AnimalId = ids.animals.remap(animalId);
    const eventDate = he.date || he.recordedAt || he.recorded_at || now;
    const type = he.type || '';

    switch (type) {
    case 'bcs':
      v2BcsScores.push({
        id: crypto.randomUUID(),
        operation_id: opId,
        animal_id: v2AnimalId,
        scored_at: eventDate,
        score: he.score ?? 5,
        likely_cull: he.likelyCull ?? he.likely_cull ?? false,
        notes: he.notes || null,
        created_at: now,
        updated_at: now,
      });
      break;

    case 'treatment': {
      let doseAmount = null;
      let doseUnitId = null;
      const rawDose = he.dose || '';

      if (rawDose) {
        const parsed = parseDose(rawDose);
        if (parsed) {
          doseAmount = parsed.amount;
          doseUnitId = matchDoseUnit(parsed.unitStr, doseUnitLookup);
        }
        if (!doseAmount || !doseUnitId) {
          // Unparseable — log to audit CSV
          const animal = ensure('animals').find(a => String(a.id) === String(animalId));
          const tType = v1TreatmentTypes.find(tt => String(tt.id) === String(he.treatmentTypeId || he.treatment_type_id));
          audit.unparseableDoses.push({
            animalTag: animal?.tag || animal?.name || String(animalId),
            date: eventDate,
            rawDose,
            treatmentType: tType?.name || 'Unknown',
          });
        }
      }

      v2Treatments.push({
        id: crypto.randomUUID(),
        operation_id: opId,
        animal_id: v2AnimalId,
        treatment_type_id: (he.treatmentTypeId || he.treatment_type_id) ? ids.treatmentTypes.remap(he.treatmentTypeId || he.treatment_type_id) : null,
        treated_at: eventDate,
        product: he.product || null,
        dose_amount: doseAmount,
        dose_unit_id: doseUnitId,
        withdrawal_date: he.withdrawalDate || he.withdrawal_date || null,
        notes: (!doseAmount && rawDose) ? `${he.notes || ''} [v1 dose: ${rawDose}]`.trim() : (he.notes || null),
        created_at: now,
        updated_at: now,
      });
      break;
    }

    case 'breeding': {
      const subtype = he.subtype || he.method || '';
      if (subtype === 'heat') {
        // §2.7: breeding+heat → animal_heat_records
        v2HeatRecords.push({
          id: crypto.randomUUID(),
          operation_id: opId,
          animal_id: v2AnimalId,
          observed_at: eventDate,
          notes: he.notes || null,
          created_at: now,
          updated_at: now,
        });
      } else {
        // ai or bull → animal_breeding_records
        const sireAiBullId = he.aiBullId ? ids.aiBulls.remap(he.aiBullId) : null;
        const sireAnimalId = he.bullAnimalId ? ids.animals.remap(he.bullAnimalId) : null;

        v2BreedingRecords.push({
          id: crypto.randomUUID(),
          operation_id: opId,
          animal_id: v2AnimalId,
          bred_at: eventDate,
          method: subtype || 'bull',
          sire_animal_id: sireAnimalId,
          sire_ai_bull_id: sireAiBullId,
          semen_id: null,
          technician: null,
          expected_calving: he.expectedCalving || he.expected_calving || null,
          confirmed_date: he.confirmedDate || he.confirmed_date || null,
          notes: he.notes || null,
          created_at: now,
          updated_at: now,
        });

        // Track sire for animal back-population
        if (sireAnimalId || sireAiBullId) {
          animalSireMap.set(String(animalId), { sireAnimalId, sireAiBullId });
        }
      }
      break;
    }

    case 'calving': {
      const calfV1Id = he.calfId || he.calf_id;
      const calfId = calfV1Id ? ids.animals.remap(calfV1Id) : null;
      const sireAiBullId = he.aiBullId ? ids.aiBulls.remap(he.aiBullId) : null;
      const sireAnimalId = he.bullAnimalId || he.sireAnimalId ? ids.animals.remap(he.bullAnimalId || he.sireAnimalId) : null;

      v2CalvingRecords.push({
        id: crypto.randomUUID(),
        operation_id: opId,
        dam_id: v2AnimalId,
        calf_id: calfId,
        calved_at: eventDate,
        sire_animal_id: sireAnimalId,
        sire_ai_bull_id: sireAiBullId,
        stillbirth: he.stillbirth ?? false,
        dried_off_date: null, // new in v2 (§2.7)
        notes: he.notes || null,
        created_at: now,
        updated_at: now,
      });

      // Extract birth weight → weight records (§2.7)
      const birthWeight = he.birthWeight || he.birthWeightLbs || he.birth_weight;
      if (birthWeight != null && calfId) {
        v2WeightRecords.push({
          id: crypto.randomUUID(),
          operation_id: opId,
          animal_id: calfId,
          recorded_at: eventDate,
          weight_kg: birthWeight * LBS_TO_KG,
          source: 'calving',
          notes: null,
          created_at: now,
          updated_at: now,
        });
      }
      break;
    }

    case 'note':
      // §2.7: type='note' → animal_notes table
      v2AnimalNotes.push({
        id: crypto.randomUUID(),
        operation_id: opId,
        animal_id: v2AnimalId,
        noted_at: eventDate,
        note: he.notes || he.text || he.note || '',
        created_at: now,
        updated_at: now,
      });
      break;

    default:
      audit.warnings.push(`Unknown health event type "${type}" for animal ${animalId}, skipped.`);
    }
  }

  // Back-populate sire info on animals (§2.15)
  for (const a of v2Animals) {
    // Find the original v1 id for this animal
    const v1AnimalId = [...ids.animals.getMap().entries()].find(([, v2Id]) => v2Id === a.id)?.[0];
    if (v1AnimalId && animalSireMap.has(v1AnimalId)) {
      const sire = animalSireMap.get(v1AnimalId);
      if (sire.sireAnimalId) a.sire_animal_id = sire.sireAnimalId;
      if (sire.sireAiBullId) a.sire_ai_bull_id = sire.sireAiBullId;
    }
  }

  // ── §2.9: Animal Weight Records ────────────────────────────────
  for (const wr of ensure('animalWeightRecords')) {
    v2WeightRecords.push({
      id: crypto.randomUUID(),
      operation_id: opId,
      animal_id: ids.animals.remap(wr.animalId || wr.animal_id),
      recorded_at: wr.recordedAt || wr.recorded_at || now,
      weight_kg: (wr.weightLbs ?? wr.weight_lbs ?? 0) * LBS_TO_KG,
      source: 'import',
      notes: wr.notes || wr.note || null,
      created_at: now,
      updated_at: now,
    });
  }

  // ── §2.11: Surveys ─────────────────────────────────────────────
  const v2Surveys = [];
  const v2SurveyDraftEntries = [];

  for (const s of ensure('surveys')) {
    const surveyId = ids.surveys.remap(s.id);
    v2Surveys.push({
      id: surveyId,
      operation_id: opId,
      survey_date: s.surveyDate || s.survey_date || s.createdAt || s.created_at || migrationDate,
      type: 'bulk', // v1 surveys are always multi-paddock (§2.11)
      status: s.status || 'committed',
      notes: s.notes || null,
      created_at: s.createdAt || s.created_at || now,
      updated_at: now,
    });

    // Extract draft entries only for draft surveys (§2.11)
    if (s.status === 'draft') {
      const draftRatings = s.draftRatings || s.draft_ratings || {};
      for (const [paddockId, rating] of Object.entries(draftRatings)) {
        const draftLocId = ids.locations.remap(paddockId);
        if (!validLocationIds.has(draftLocId)) continue;
        v2SurveyDraftEntries.push({
          id: crypto.randomUUID(),
          operation_id: opId,
          survey_id: surveyId,
          location_id: draftLocId,
          forage_height_cm: rating.vegHeight != null ? rating.vegHeight * INCHES_TO_CM : null,
          forage_cover_pct: rating.forageCoverPct ?? null,
          forage_quality: rating.rating ?? null,
          forage_condition: rating.forageQuality ? rating.forageQuality.toLowerCase() : null,
          bale_ring_residue_count: null,
          recovery_min_days: rating.recoveryMinDays ?? null,
          recovery_max_days: rating.recoveryMaxDays ?? null,
          notes: rating.notes || null,
          created_at: now,
          updated_at: now,
        });
      }
    }
  }

  // ── §2.12: Paddock Observations ────────────────────────────────
  const v2Observations = [];
  for (const obs of ensure('paddockObservations')) {
    const rawSource = obs.source || '';
    const sourceMap = {
      survey: 'survey',
      event_open: 'event',
      event_close: 'event',
      sub_move_open: 'event',
      sub_move_close: 'event',
    };
    const source = sourceMap[rawSource] || 'event';

    // Infer type from raw v1 source string (OI-0048)
    const obsType = rawSource.includes('close') ? 'close' : 'open';

    // Resolve source_id
    let sourceId = null;
    if (obs.sourceId || obs.source_id) {
      const rawSourceId = obs.sourceId || obs.source_id;
      if (rawSource === 'survey') {
        sourceId = ids.surveys.remap(rawSourceId);
      } else {
        sourceId = ids.events.remap(rawSourceId);
      }
    }

    const obsLocationId = ids.locations.remap(obs.pastureId || obs.pasture_id);
    if (!validLocationIds.has(obsLocationId)) {
      audit.warnings.push(`Observation ${obs.id}: location_id ${obsLocationId} not in migrated locations, skipped.`);
      continue;
    }

    v2Observations.push({
      id: ids.observations.remap(obs.id),
      operation_id: opId,
      location_id: obsLocationId,
      observed_at: obs.observedAt || obs.observed_at || now,
      type: obsType,
      source,
      source_id: sourceId,
      forage_height_cm: obs.vegHeight != null ? obs.vegHeight * INCHES_TO_CM : null,
      forage_cover_pct: obs.forageCoverPct ?? obs.forage_cover_pct ?? null,
      forage_quality: obs.forageQuality != null ? obs.forageQuality : null,
      forage_condition: obs.forageCondition ? obs.forageCondition.toLowerCase() : null,
      bale_ring_residue_count: null,
      residual_height_cm: null, // v1 doesn't capture separately (§2.12)
      recovery_min_days: obs.recoveryMinDays ?? obs.recovery_min_days ?? null,
      recovery_max_days: obs.recoveryMaxDays ?? obs.recovery_max_days ?? null,
      notes: obs.notes || null,
      created_at: obs.created_at || now,
      updated_at: now,
    });
  }

  // ── §2.18: Harvest Events ──────────────────────────────────────
  const v2HarvestEvents = [];
  const v2HarvestEventFields = [];

  for (const he of ensure('harvestEvents')) {
    const heId = ids.harvestEvents.remap(he.id);
    v2HarvestEvents.push({
      id: heId,
      operation_id: opId,
      date: he.date || migrationDate,
      notes: he.notes || null,
      created_at: now,
      updated_at: now,
    });

    const fields = he.fields || [];
    for (const f of fields) {
      const hefLocId = ids.locations.remap(f.pastureId || f.pasture_id || f.locationId || f.location_id);
      if (!hefLocId || !validLocationIds.has(hefLocId)) {
        audit.warnings.push(`Harvest field on event ${he.id}: location not in migrated set, skipped.`);
        continue;
      }
      v2HarvestEventFields.push({
        id: crypto.randomUUID(),
        operation_id: opId,
        harvest_event_id: heId,
        location_id: hefLocId,
        feed_type_id: ids.feedTypes.remap(f.feedTypeId || f.feed_type_id),
        quantity: f.quantity ?? 0,
        weight_per_unit_kg: f.weightPerUnitKg != null ? f.weightPerUnitKg * LBS_TO_KG
          : f.weight_per_unit_kg != null ? f.weight_per_unit_kg * LBS_TO_KG : null,
        dm_pct: f.dmPct ?? f.dm_pct ?? null,
        cutting_number: f.cuttingNumber ?? f.cutting_number ?? null,
        batch_id: f.batchId ? ids.batches.remap(f.batchId) : null,
        notes: f.notes || null,
        created_at: now,
        updated_at: now,
      });
    }
  }

  // ── §2.19: Manure Batches + Transactions ───────────────────────
  const v2ManureBatches = ensure('manureBatches').map(mb => ({
    id: ids.manureBatches.remap(mb.id),
    operation_id: opId,
    label: mb.label || mb.name || 'Manure Batch',
    source_location_id: mb.sourceLocationId ? ids.locations.remap(mb.sourceLocationId)
      : mb.source_location_id ? ids.locations.remap(mb.source_location_id) : null,
    estimated_volume_kg: mb.estimatedVolumeLbs != null ? mb.estimatedVolumeLbs * LBS_TO_KG
      : mb.estimated_volume_lbs != null ? mb.estimated_volume_lbs * LBS_TO_KG : null,
    n_kg: mb.nLbs != null ? mb.nLbs * LBS_TO_KG : mb.n_lbs != null ? mb.n_lbs * LBS_TO_KG : null,
    p_kg: mb.pLbs != null ? mb.pLbs * LBS_TO_KG : mb.p_lbs != null ? mb.p_lbs * LBS_TO_KG : null,
    k_kg: mb.kLbs != null ? mb.kLbs * LBS_TO_KG : mb.k_lbs != null ? mb.k_lbs * LBS_TO_KG : null,
    s_kg: null, ca_kg: null, mg_kg: null, cu_kg: null, fe_kg: null,
    mn_kg: null, mo_kg: null, zn_kg: null, b_kg: null, cl_kg: null,
    capture_date: mb.captureDate || mb.capture_date || null,
    notes: mb.notes || null,
    created_at: now,
    updated_at: now,
  }));

  const v2ManureBatchTransactions = ensure('manureBatchTransactions').map(t => ({
    id: ids.manureBatchTransactions.remap(t.id),
    operation_id: opId,
    batch_id: ids.manureBatches.remap(t.batchId || t.batch_id),
    type: t.type || 'input',
    transaction_date: t.transactionDate || t.transaction_date || migrationDate,
    volume_kg: (t.volumeLbs ?? t.volume_lbs ?? 0) * LBS_TO_KG,
    source_event_id: (t.sourceEventId || t.source_event_id) ? ids.events.remap(t.sourceEventId || t.source_event_id) : null,
    amendment_id: (t.amendmentId || t.amendment_id) ? ids.amendments.remap(t.amendmentId || t.amendment_id) : null,
    notes: t.notes || null,
    created_at: now,
    updated_at: now,
  }));

  // ── §2.20: Amendments + Amendment Locations ────────────────────
  const v2Amendments = ensure('inputApplications').map(a => ({
    id: ids.amendments.remap(a.id),
    operation_id: opId,
    applied_at: a.appliedAt || a.applied_at || now,
    source_type: 'product',
    input_product_id: (a.inputProductId || a.input_product_id) ? ids.inputProducts.remap(a.inputProductId || a.input_product_id) : null,
    manure_batch_id: null,
    spreader_id: null, // v1 uses global manure_load, not per-spreader (§2.20)
    total_qty: a.totalQty ?? a.total_qty ?? null,
    qty_unit_id: null,
    cost_override: null,
    notes: a.notes || null,
    created_at: now,
    updated_at: now,
  }));

  const v2AmendmentLocations = ensure('inputApplicationLocations').filter(al => {
    const locId = ids.locations.remap(al.pastureId || al.pasture_id);
    if (!locId || !validLocationIds.has(locId)) {
      audit.warnings.push(`Amendment location ${al.id}: location not in migrated set, skipped.`);
      return false;
    }
    return true;
  }).map(al => ({
    id: crypto.randomUUID(),
    operation_id: opId,
    amendment_id: ids.amendments.remap(al.applicationId || al.application_id),
    location_id: ids.locations.remap(al.pastureId || al.pasture_id),
    qty: al.qty ?? null,
    n_kg: al.nKg ?? al.n_kg ?? null,
    p_kg: al.pKg ?? al.p_kg ?? null,
    k_kg: al.kKg ?? al.k_kg ?? null,
    s_kg: null, ca_kg: null, mg_kg: null, cu_kg: null, fe_kg: null,
    mn_kg: null, mo_kg: null, zn_kg: null, b_kg: null, cl_kg: null,
    area_ha: al.areaAcres != null ? al.areaAcres * ACRES_TO_HA
      : al.area_acres != null ? al.area_acres * ACRES_TO_HA : null,
    created_at: now,
    updated_at: now,
  }));

  // ── §2.21: Todos + Todo Assignments ────────────────────────────
  const v2Todos = ensure('todos').map(td => ({
    id: ids.todos.remap(td.id),
    operation_id: opId,
    title: td.title || 'Untitled',
    description: td.body || td.description || null,
    status: td.status || 'open',
    note: td.note || null,
    location_id: null,
    animal_id: null,
    due_date: td.dueDate || td.due_date || null,
    created_by: null,
    created_at: td.created_at || now,
    updated_at: now,
  }));

  // todo_assignments: user_id FK references operation_members(id), which is excluded
  // from backup/import (§5.4). v1 user IDs can't be mapped to operation_members rows.
  // Assignments are dropped; todos themselves migrate fine.
  const v2TodoAssignments = [];
  const v1AssignmentCount = ensure('todos').reduce((sum, td) => sum + (td.assignedTo || td.assigned_to || []).length, 0);
  if (v1AssignmentCount > 0) {
    audit.warnings.push(`${v1AssignmentCount} todo assignment(s) dropped (user_id FK to operation_members can't be resolved from v1 data).`);
  }

  // ── §2.22: Soil Tests ──────────────────────────────────────────
  const v2SoilTests = ensure('soilTests').filter(st => {
    const locId = ids.locations.remap(st.landId || st.land_id || st.pastureId || st.pasture_id);
    if (!locId || !validLocationIds.has(locId)) {
      audit.warnings.push(`Soil test ${st.id}: location not in migrated set, skipped.`);
      return false;
    }
    return true;
  }).map(st => ({
    id: ids.soilTests.remap(st.id),
    operation_id: opId,
    location_id: ids.locations.remap(st.landId || st.land_id || st.pastureId || st.pasture_id),
    tested_at: st.date || st.tested_at || now,
    extraction_method: null,
    n: st.n != null ? st.n * LBS_PER_ACRE_TO_KG_PER_HA : null,
    p: st.p != null ? st.p * LBS_PER_ACRE_TO_KG_PER_HA : null,
    k: st.k != null ? st.k * LBS_PER_ACRE_TO_KG_PER_HA : null,
    s: null, ca: null, mg: null, cu: null, fe: null,
    mn: null, mo: null, zn: null, b: null, cl: null,
    unit: 'kg/ha', // v2 stores metric
    ph: st.pH ?? st.ph ?? null,
    buffer_ph: null,
    cec: null,
    base_saturation: null,
    organic_matter: st.organicMatter ?? st.organic_matter ?? null,
    lab: st.lab ?? st.labName ?? st.lab_name ?? null,
    notes: st.notes || null,
    created_at: now,
    updated_at: now,
  }));

  // ── §2.24: Submissions (feedback) ──────────────────────────────
  const v2Submissions = ensure('feedback').map(fb => ({
    id: crypto.randomUUID(),
    operation_id: opId,
    submitter_id: null,
    app: 'gtho',
    type: fb.type || 'feedback',
    category: fb.category || null,
    area: fb.area || null,
    screen: fb.screen || null,
    priority: 'normal',
    status: 'open',
    note: fb.message || fb.note || fb.text || null,
    version: fb.version || null,
    thread: [],
    dev_response: null,
    dev_response_ts: null,
    first_response_at: null,
    resolved_in_version: null,
    resolution_note: null,
    oi_number: null,
    linked_to: null,
    created_at: fb.created_at || fb.createdAt || now,
    updated_at: now,
  }));

  // ── §2.25: NPK Price History ───────────────────────────────────
  const nPricePerKg = (settings.nPrice || 0.55) / LBS_TO_KG;
  const pPricePerKg = (settings.pPrice || 0.65) / LBS_TO_KG;
  const kPricePerKg = (settings.kPrice || 0.42) / LBS_TO_KG;

  const v2NpkPriceHistory = [{
    id: crypto.randomUUID(),
    farm_id: farmId,
    operation_id: opId,
    effective_date: migrationDate,
    n_price_per_kg: nPricePerKg,
    p_price_per_kg: pPricePerKg,
    k_price_per_kg: kPricePerKg,
    notes: 'Migrated from v1',
    created_at: now,
    updated_at: now,
  }];

  // ── §2.23: NPK parity check data (validation only) ────────────
  // Collect v1 stored NPK for later comparison
  for (const ev of ensure('events')) {
    const npkLedger = ev.npkLedger || ev.npk_ledger || ev.npkDeposits || ev.npk_deposits || [];
    if (npkLedger.length > 0) {
      let v1N = 0, v1P = 0, v1K = 0;
      for (const entry of npkLedger) {
        v1N += entry.n || entry.nLbs || entry.n_lbs || 0;
        v1P += entry.p || entry.pLbs || entry.p_lbs || 0;
        v1K += entry.k || entry.kLbs || entry.k_lbs || 0;
      }
      // Store for later parity check (v1 values in lbs, note for reference)
      audit.npkDeltas.push({
        v1EventId: ev.id,
        v2EventId: ids.events.remap(ev.id),
        v1N, v1P, v1K,
        // v2 values will be computed post-import by the calc engine
        v2N: null, v2P: null, v2K: null,
        deltaPct: null,
      });
    }
  }

  // ── Empty tables (new in v2, no v1 data) ───────────────────────
  const v2Spreaders = [];
  const v2DoseUnits = []; // existing seed data handled by reference table upsert
  const v2InputProductUnits = []; // same
  const v2BatchNutritionalProfiles = []; // Tim has no feed test data (§2.24)

  // ── Build counts for envelope ──────────────────────────────────
  const counts = {
    farms: v2Farms.length,
    events: v2Events.length,
    animals: v2Animals.length,
    batches: v2Batches.length,
    todos: v2Todos.length,
  };

  // ── Assemble envelope (§1.6) ───────────────────────────────────
  const envelope = {
    format: 'gtho-v2-backup',
    format_version: 1,
    schema_version: CURRENT_SCHEMA_VERSION,
    exported_at: now,
    exported_by: {
      user_id: userId,
      email: userEmail,
    },
    operation_id: opId,
    build_stamp: 'v1-migration',
    counts,
    tables: {
      operations: v2Operations,
      farms: v2Farms,
      forage_types: v2ForageTypes,
      animal_classes: v2AnimalClasses,
      feed_types: v2FeedTypes,
      ai_bulls: v2AiBulls,
      spreaders: v2Spreaders,
      input_product_categories: v2InputProductCategories,
      input_product_units: v2InputProductUnits,
      treatment_categories: v2TreatmentCategories,
      dose_units: v2DoseUnits,
      farm_settings: v2FarmSettings,
      user_preferences: v2UserPreferences,
      locations: v2Locations,
      animals: v2Animals,
      groups: v2Groups,
      batches: v2Batches,
      treatment_types: v2TreatmentTypes,
      input_products: v2InputProducts,
      animal_group_memberships: v2AnimalGroupMemberships,
      batch_adjustments: v2BatchAdjustments,
      batch_nutritional_profiles: v2BatchNutritionalProfiles,
      soil_tests: v2SoilTests,
      surveys: v2Surveys,
      events: v2Events,
      manure_batches: v2ManureBatches,
      amendments: v2Amendments,
      amendment_locations: v2AmendmentLocations,
      manure_batch_transactions: v2ManureBatchTransactions,
      npk_price_history: v2NpkPriceHistory,
      event_paddock_windows: v2PaddockWindows,
      event_group_windows: v2GroupWindows,
      event_feed_entries: v2FeedEntries,
      event_feed_checks: v2FeedChecks,
      event_feed_check_items: v2FeedCheckItems,
      paddock_observations: v2Observations,
      survey_draft_entries: v2SurveyDraftEntries,
      harvest_events: v2HarvestEvents,
      harvest_event_fields: v2HarvestEventFields,
      animal_weight_records: v2WeightRecords,
      animal_treatments: v2Treatments,
      animal_bcs_scores: v2BcsScores,
      animal_breeding_records: v2BreedingRecords,
      animal_heat_records: v2HeatRecords,
      animal_calving_records: v2CalvingRecords,
      animal_notes: v2AnimalNotes,
      todos: v2Todos,
      todo_assignments: v2TodoAssignments,
      submissions: v2Submissions,
    },
  };

  // Build audit counts
  for (const [table, rows] of Object.entries(envelope.tables)) {
    audit.counts[table] = rows.length;
  }
  audit.transferPairsLinked = transferPairsLinked;
  audit.transferPairsOrphaned = transferPairsOrphaned;

  logger.info('migration', 'v1 transform complete', {
    v1_pastures: ensure('pastures').length,
    v1_events: ensure('events').length,
    v1_animals: ensure('animals').length,
    v2_locations: v2Locations.length,
    v2_events: v2Events.length,
    v2_animals: v2Animals.length,
    unparseable_doses: audit.unparseableDoses.length,
    warnings: audit.warnings.length,
  });

  return { envelope, audit };
}

/**
 * Generate a CSV string for unparseable dose audit.
 * @param {Array<{animalTag: string, date: string, rawDose: string, treatmentType: string}>} doses
 * @returns {string}
 */
export function generateDoseAuditCsv(doses) {
  if (!doses || doses.length === 0) return '';
  const header = 'Animal Tag,Date,Raw Dose,Treatment Type';
  const rows = doses.map(d =>
    `"${(d.animalTag || '').replace(/"/g, '""')}","${d.date}","${(d.rawDose || '').replace(/"/g, '""')}","${(d.treatmentType || '').replace(/"/g, '""')}"`
  );
  return [header, ...rows].join('\n');
}

/**
 * Check if a v2 operation is empty (no events, animals, etc.).
 * Used by CP-57 to decide whether to skip auto-backup (§1.6).
 * @param {object} store - The store module
 * @returns {boolean}
 */
export function isOperationEmpty(store) {
  const events = store.getAll('events');
  const animals = store.getAll('animals');
  const locations = store.getAll('locations');
  return events.length === 0 && animals.length === 0 && locations.length === 0;
}

// Export for testing
export { parseDose, matchDoseUnit, inferRole, createIdMap };
export { LBS_TO_KG, ACRES_TO_HA, INCHES_TO_CM, LBS_PER_ACRE_TO_KG_PER_HA, DM_LBS_IN_AC_TO_KG_CM_HA, CURRENT_SCHEMA_VERSION };
