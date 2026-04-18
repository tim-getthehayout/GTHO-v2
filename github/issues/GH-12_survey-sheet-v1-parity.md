# Survey Sheet — v1 Parity Rebuild (SP-9)

**Status:** Shipped · historical spec (kept for audit)
**Owner:** Cowork (design) → Claude Code (implementation)
**Base doc impact:** V2_UX_FLOWS.md §7 (short paragraph) will be replaced by this spec during end-of-sprint reconciliation.
**Schema impact:** Added `farm_settings.bale_ring_residue_diameter_ft` via migration 022. **OI-0111 / migration 027 (2026-04-18) subsequently renamed this column to `bale_ring_residue_diameter_cm` per the metric-internal rule; references below that use `_ft` reflect this spec's state-at-time-of-writing.** Verifies `event_observations.bale_ring_residue_count` exists. **CP-55/CP-56 spec update applied.**
**Depends on:** OI-0063 (`event_observations` schema alignment — closed 2026-04-15).

---

## 1. Goal

Rebuild the v2 survey experience to match v1 exactly. V1 has a single "survey sheet" that opens in three modes (bulk / single / bulk-edit) plus a field-mode pasture picker. V2 currently has a generic list/create screen at `src/features/surveys/index.js` that does not match v1 UX. V1 users must not experience v2 surveys as a regression.

Two deliberate deltas from v1 are included:
1. **Drop the home-screen "Pasture readiness" card.** V2 does not have this card, and we are not adding it. SP-9 therefore spans only entry points that exist in v2.
2. **Add a bale-ring-residue helper.** A new per-paddock input that calculates forage cover % from the count of bale-ring residues — a convenience tool for users coming off bale grazing. Stored with the observation so recovery over time is visible.

Everything else — sheet layout, paddock card shape, bulk chrome, filter pills, draft lifecycle, field-mode sheet behaviour — matches v1.

---

## 2. Entry-point matrix

Every entry point that opens a survey sheet in v1, and the v2 mapping.

| # | v1 entry point | v1 function called | Mode | v2 equivalent | In SP-9? |
|---|---|---|---|---|---|
| 1 | Pastures screen → `📋 Survey` button (line 1157) | `openBulkSurveySheet()` | bulk | Locations screen → `📋 Survey` button (same slot) | ✅ yes |
| 2 | Surveys sub-tab → `+ New Survey` button (line 8441) | `openBulkSurveySheet()` | bulk | Locations screen → Surveys sub-tab → `+ New Survey` | ✅ yes |
| 3 | Surveys sub-tab → `Resume` button on draft banner (line 8432) | `openBulkSurveySheet()` (resumes) | bulk | Same | ✅ yes |
| 4 | Surveys sub-tab → `Edit` button on committed row (line 8460) | `openBulkSurveyEdit(surveyId)` | bulk-edit | Same | ✅ yes |
| 5 | Location edit sheet → `+ Add reading` (line 21606) | `openSurveySheet(pastureId)` | single | Location edit sheet → `+ Add reading` | ✅ yes |
| 6 | Location edit sheet → row Edit in survey history | `openSurveySheet(pastureId, surveyId)` | single (edit existing) | Same | ✅ yes |
| 7 | Field mode → `📋 Multi-Pasture Survey` tile | `openBulkSurveySheet()` (via FIELD_MODULES, line 5174) | bulk | Field mode module `surveybulk` (SP-8 already wires this) | ✅ yes |
| 8 | Field mode → `📋 Pasture Survey` tile | `_fieldModePastureSurveyHandler()` → picker → `openSurveySheet(pastureId)` | single | Field mode module `surveysingle` (SP-8 already wires this) | ✅ yes |
| 9 | v1 Home `Pasture readiness` card → `+ Survey` button (line 765) | `openSurveySheet(null)` (broken hybrid — no focus pasture, opens in single mode) | — | **N/A — v2 has no readiness card** | ❌ dropped |

**Single-pasture entry from the pasture list:** v1's Surveys sub-tab lists committed surveys; there is no "survey just this one paddock from the main pastures list" entry point. Single-paddock surveys are reached via (5) location edit or (8) field-mode picker. V2 keeps this — **no new "survey this paddock" button on the dashboard/locations card**.

---

## 3. Sheet structure

A single sheet element `#survey-sheet-wrap` (v2: `<Sheet>` component) hosts all three modes. `_setSurveySheetMode(mode, draftDate, pastureName)` toggles headers, save button, discard link, and draft tag visibility.

### 3.1 Sheet container (v1 HTML reference)

```html
<!-- v1 index.html lines 22497–22532 -->
<div class="sheet-wrap" id="survey-sheet-wrap">
  <div class="sheet-backdrop" onclick="closeSurveySheet()"></div>
  <div class="sheet" style="max-height:90vh;overflow:hidden;display:flex;flex-direction:column;">
    <div class="sheet-handle"></div>
    <!-- Bulk mode header (dynamically populated) -->
    <div id="survey-bulk-header" style="display:none;background:var(--bg);padding:0 0 6px;border-bottom:0.5px solid var(--border);"></div>
    <!-- Classic header (single/bulk-edit modes) -->
    <div id="survey-classic-header">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
        <div style="font-size:16px;font-weight:600;" id="survey-sheet-title">Pasture survey</div>
        <span id="survey-draft-tag" style="display:none;font-size:10px;font-weight:600;color:var(--amber-d,#92400e);background:var(--amber-l,#fffbeb);border:1px solid var(--amber,#f59e0b);padding:2px 8px;border-radius:10px;">DRAFT</span>
      </div>
      <div style="font-size:13px;color:var(--text2);margin-bottom:14px;" id="survey-sheet-subtitle">
        Rate each paddock 1–10 for forage availability. Tap a number to select.
      </div>
      <div class="field" style="margin-bottom:14px;">
        <label>Survey date</label>
        <input type="date" id="survey-date" style="max-width:180px;"/>
      </div>
    </div>
    <!-- Scrollable content -->
    <div id="survey-scroll-body" style="flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:0 0 16px;">
      <div id="survey-paddock-list"></div>
      <div class="div"></div>
      <div id="survey-recovery-section-hdr" style="font-size:13px;font-weight:600;margin-bottom:8px;">Recovery window edits <span style="font-size:11px;font-weight:400;color:var(--text2);">(optional — updates the last closed event per paddock)</span></div>
      <div id="survey-recovery-list"></div>
      <div class="btn-row" style="margin-top:16px;">
        <button class="btn btn-green" id="survey-save-btn" onclick="saveSurvey()">Save survey</button>
        <button class="btn btn-outline" onclick="closeSurveySheet()">Close</button>
      </div>
      <div style="margin-top:10px;text-align:center;" id="survey-discard-wrap">
        <button id="survey-discard-btn" style="display:none;background:none;border:none;color:var(--red);font-size:13px;cursor:pointer;text-decoration:underline;" onclick="discardSurvey()">Discard survey</button>
      </div>
    </div>
  </div>
</div>
```

v2 implementation: use the DOM builder (`el()`). Do not copy HTML directly.

### 3.2 Mode switcher (v1 JS reference)

```js
// v1 index.html lines 8515–8551
function _setSurveySheetMode(mode, draftDate, pastureName){
  const titleEl       = document.getElementById('survey-sheet-title');
  const subtitleEl    = document.getElementById('survey-sheet-subtitle');
  const recSection    = document.getElementById('survey-recovery-section-hdr');
  const saveBtn       = document.getElementById('survey-save-btn');
  const discardWrap   = document.getElementById('survey-discard-wrap');
  const draftTag      = document.getElementById('survey-draft-tag');
  const bulkHeader    = document.getElementById('survey-bulk-header');
  const classicHeader = document.getElementById('survey-classic-header');
  if(mode==='bulk'){
    if(bulkHeader)    bulkHeader.style.display    = '';
    if(classicHeader) classicHeader.style.display = 'none';
    if(recSection)    recSection.style.display     = 'none';
    if(saveBtn)       saveBtn.style.display        = 'none';
    if(discardWrap)   discardWrap.style.display    = 'none';
    if(draftTag)      draftTag.style.display       = 'none';
    _renderBulkSurveyHeader();
  } else if(mode==='bulk-edit'){
    if(bulkHeader)    bulkHeader.style.display    = 'none';
    if(classicHeader) classicHeader.style.display = '';
    if(titleEl)  titleEl.textContent = 'Edit survey';
    if(subtitleEl) subtitleEl.textContent = 'Edit ratings and tap Save Survey to update.';
    if(recSection) recSection.style.display = '';
    if(saveBtn)    saveBtn.style.display    = '';
    if(discardWrap)discardWrap.style.display= 'none';
    if(draftTag)   draftTag.style.display   = 'none';
  } else {
    // single
    if(bulkHeader)    bulkHeader.style.display    = 'none';
    if(classicHeader) classicHeader.style.display = '';
    if(titleEl) titleEl.textContent = pastureName ? 'Survey: '+pastureName : 'Paddock survey';
    if(subtitleEl) subtitleEl.textContent = 'Rate forage availability and set recovery window.';
    if(recSection) recSection.style.display = 'none';
    if(saveBtn)    saveBtn.style.display    = '';
    if(discardWrap)discardWrap.style.display= 'none';
    if(draftTag)   draftTag.style.display   = 'none';
  }
}
```

**Mode summary:**
- **bulk** — bulk header visible (filter pills, DRAFT tag, Save Draft + Finish & Save + ✕). Classic header hidden. Save button at bottom hidden (bulk chrome has its own).
- **bulk-edit** — classic header visible ("Edit survey"). Bulk chrome hidden. Save button at bottom visible ("Save survey" replaces observations in place). Recovery section hdr is hidden because recovery is embedded per card.
- **single** — classic header visible ("Paddock survey" or "Survey: {name}"). Save button visible. Only one paddock card rendered.

---

## 4. Paddock card

### 4.1 Collapsed card header (bulk mode only — single mode always expanded)

```js
// v1 index.html lines 8860–8868
const chevronDeg = isExpanded ? '180' : '0';
const headerHtml = `<div onclick="_expandSurveyCard('${p.id}')" style="cursor:pointer;display:flex;align-items:center;justify-content:space-between;padding:${isExpanded?'0':'0'};">
  <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0;">
    <span style="font-size:14px;font-weight:600;">${p.name}</span>
    <span style="font-size:11px;color:var(--text2);">${p.acres||0} ac</span>
    ${activeNote}
    ${completeBadge}
  </div>
  <div style="font-size:16px;color:var(--text2);transform:rotate(${chevronDeg}deg);transition:transform 0.2s;flex-shrink:0;margin-left:8px;">⌃</div>
</div>`;
```

- **Name + acres + Active badge + Complete badge** on the left.
- **Chevron** on the right, rotates 180° when expanded.
- Click header toggles expand.
- Complete badge appears only when `_isBulkSurveyCardComplete(pid)` returns true — see §4.4.

### 4.2 Expanded card body (all three modes, single mode auto-expanded)

Content (top to bottom):

1. **Forage quality rating** — range slider (0–100) paired with a number input, color bar underneath. Slider and number stay in sync via `setSurveyRating`. Color shifts red → amber → green.
2. **Avg veg height (in)** + **Avg forage cover (%)** — two numeric inputs side-by-side.
3. **🆕 Bale-ring residues** (see §5) — optional numeric input. When filled, auto-computes forage cover %.
4. **Forage condition** — 4 buttons: Poor / Fair / Good / Exc. (short label for "Excellent").
5. **Recovery window** — MIN days + MAX days, relative to survey date. Date preview under each input. `↻ {date} – {date}` status line below.
6. **Notes** — free text textarea (optional, bulk card only shows on single mode; bulk mode omits to keep cards compact — hydration preserves it regardless).

#### v1 rating slider + number (extracted)

```js
// v1 index.html lines 8877–8892 (bulk card; single card is identical at 8675–8690)
const ratingBtns = `
  <div style="display:flex;align-items:center;gap:10px;">
    <input type="range" id="survey-slider-${p.id}" min="0" max="100" step="1"
      value="${curRating??50}"
      oninput="setSurveyRating('${p.id}','${p.name}',this.value)"
      style="flex:1;accent-color:${surveyRatingColor(curRating??50)};cursor:pointer;"/>
    <input type="number" id="survey-num-${p.id}" min="0" max="100" step="1"
      value="${curRating??''}"
      placeholder="0–100"
      oninput="setSurveyRating('${p.id}','${p.name}',this.value)"
      style="width:60px;padding:5px 6px;border:0.5px solid var(--border2);border-radius:var(--radius);
             font-size:14px;font-weight:600;text-align:center;background:var(--bg);color:var(--text);font-family:inherit;"/>
  </div>
  <div style="height:6px;border-radius:3px;background:var(--bg2);margin-top:4px;overflow:hidden;">
    <div id="survey-bar-${p.id}" style="height:100%;width:${curRating??0}%;background:${surveyRatingColor(curRating??0)};border-radius:3px;transition:width 0.15s,background 0.15s;"></div>
  </div>`;
```

#### v1 veg-height + cover inputs (extracted, bulk card)

```js
// v1 index.html lines 8951–8968
<div style="display:flex;gap:10px;margin-top:10px;flex-wrap:wrap;">
  <div style="flex:1;min-width:110px;">
    <div style="font-size:11px;font-weight:600;color:var(--text2);margin-bottom:4px;letter-spacing:0.03em;">AVG VEG HEIGHT (in)</div>
    <input type="number" id="survey-veght-${p.id}" min="0" max="72" step="0.5"
      value="${surveyVegHeight[p.id]??''}" placeholder="inches"
      oninput="surveyVegHeight['${p.id}']=parseFloat(this.value)||null;_triggerSurveyDraftSave();_updateBulkSurveyCardStatus('${p.id}')"
      style="width:100%;padding:6px 8px;border:0.5px solid var(--border2);border-radius:var(--radius);
             font-size:14px;background:var(--bg);color:var(--text);font-family:inherit;text-align:center;box-sizing:border-box;"/>
  </div>
  <div style="flex:1;min-width:110px;">
    <div style="font-size:11px;font-weight:600;color:var(--text2);margin-bottom:4px;letter-spacing:0.03em;">AVG FORAGE COVER (%)</div>
    <input type="number" id="survey-cover-${p.id}" min="0" max="100" step="1"
      value="${surveyForageCover[p.id]??''}" placeholder="%"
      oninput="surveyForageCover['${p.id}']=parseFloat(this.value)||null;_triggerSurveyDraftSave();_updateBulkSurveyCardStatus('${p.id}')"
      style="width:100%;padding:6px 8px;border:0.5px solid var(--border2);border-radius:var(--radius);
             font-size:14px;background:var(--bg);color:var(--text);font-family:inherit;text-align:center;box-sizing:border-box;"/>
  </div>
</div>
```

#### v1 forage-condition 4-button group (extracted)

```js
// v1 index.html lines 8898–8909
const conditionBtns = ['Poor','Fair','Good','Excellent'].map(q=>{
  const active = curCondition === q;
  return `<button type="button" onclick="surveyForageQuality['${p.id}']='${q}';_triggerSurveyDraftSave();_renderBulkConditionBtns('${p.id}');_updateBulkSurveyCardStatus('${p.id}')"
    id="survey-cond-${p.id}-${q}"
    style="flex:1;padding:6px 0;font-size:12px;border-radius:6px;cursor:pointer;font-family:inherit;
    border:0.5px solid ${active?'var(--green)':'var(--border2)'};
    background:${active?'var(--green-l)':'transparent'};
    color:${active?'var(--green-d)':'var(--text2)'};
    font-weight:${active?'500':'400'};">${q==='Excellent'?'Exc.':q}</button>`;
}).join('');
```

#### v1 recovery window + live date preview (extracted)

```js
// v1 index.html lines 8977–9008
<div style="margin-top:10px;">
  <div style="font-size:11px;font-weight:600;color:var(--text2);margin-bottom:5px;letter-spacing:0.03em;">RECOVERY WINDOW</div>
  <div style="display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap;">
    <div style="text-align:center;">
      <div style="font-size:9px;color:var(--text2);margin-bottom:2px;">MIN days</div>
      <input type="number" placeholder="${st.recoveryMinDays||30}" min="1" max="365"
        value="${curMin}"
        oninput="surveyRecovery['${p.id}']={...(surveyRecovery['${p.id}']||{}),min:parseInt(this.value)||null};_triggerSurveyDraftSave();renderSurveyRecoveryPreview('${p.id}');_updateBulkSurveyCardStatus('${p.id}')"
        id="rec-min-${p.id}"
        style="width:60px;padding:5px 7px;border:0.5px solid var(--border2);border-radius:var(--radius);
               font-size:13px;background:var(--bg);color:var(--text);font-family:inherit;text-align:center;"/>
      <div id="rec-min-date-${p.id}" style="font-size:11px;font-weight:600;color:var(--green-d);margin-top:3px;min-height:14px;">
        ${(()=>{if(!curMin)return'';const d=new Date(surveyDate+'T12:00:00');d.setDate(d.getDate()+curMin);return d.toLocaleDateString('en-US',{month:'short',day:'numeric'});})()}
      </div>
    </div>
    <div style="font-size:14px;color:var(--text2);padding-top:18px;">–</div>
    <div style="text-align:center;">
      <div style="font-size:9px;color:var(--text2);margin-bottom:2px;">MAX days</div>
      <input type="number" placeholder="${st.recoveryMaxDays||60}" min="1" max="365"
        value="${curMax}"
        oninput="surveyRecovery['${p.id}']={...(surveyRecovery['${p.id}']||{}),max:parseInt(this.value)||null};_triggerSurveyDraftSave();renderSurveyRecoveryPreview('${p.id}');_updateBulkSurveyCardStatus('${p.id}')"
        id="rec-max-${p.id}"
        style="width:60px;padding:5px 7px;border:0.5px solid var(--border2);border-radius:var(--radius);
               font-size:13px;background:var(--bg);color:var(--text);font-family:inherit;text-align:center;"/>
      <div id="rec-max-date-${p.id}" style="font-size:11px;font-weight:600;color:var(--amber-d);margin-top:3px;min-height:14px;">
        ${(()=>{if(!curMax)return'';const d=new Date(surveyDate+'T12:00:00');d.setDate(d.getDate()+curMax);return d.toLocaleDateString('en-US',{month:'short',day:'numeric'});})()}
      </div>
    </div>
    <div style="font-size:11px;color:var(--text2);padding-top:18px;">days from ${dLabel(surveyDate)}</div>
  </div>
  <div id="rec-preview-${p.id}">${nextGrazeHtml}</div>
</div>
```

**Recovery-window date math.** MIN/MAX are stored as "days from last move-out" on the event, but displayed in the survey as "days from survey date". The conversion:

```js
// v1 index.html lines 8912–8921
const surveyDate = document.getElementById('survey-date')?.value || todayStr();
const daysAlreadyRested = lastEv?.dateOut
  ? Math.max(0, Math.round((new Date(surveyDate+'T12:00:00') - new Date(lastEv.dateOut+'T12:00:00'))/86400000))
  : 0;
const srcMin = lastEv ? lastEv.recoveryMinDays : p.recoveryMinDays;
const srcMax = lastEv ? lastEv.recoveryMaxDays : p.recoveryMaxDays;
const displayMin = Math.max(0, (srcMin ?? st.recoveryMinDays ?? 30) - daysAlreadyRested);
const displayMax = Math.max(0, (srcMax ?? st.recoveryMaxDays ?? 60) - daysAlreadyRested);
```

On commit the inverse applies — see §7.2.

### 4.3 Single-mode card differences

Single mode (one paddock, always expanded) has a richer context line:

```js
// v1 index.html lines 8722–8732
const contextStr = lastEv ? `Last grazed ${dLabel(lastEv.dateOut)} · ${daysSince}d ago`
  : activeEv ? `Active · Day ${daysBetween(activeEv.dateIn,todayStr())}`
  : 'No graze history';
const latestStr = latest ? `Last rated ${latest.rating}/10 on ${dLabel(latest.date)}` : 'Not yet rated';

listEl.innerHTML = `
  <div style="padding:4px 0 12px;">
    <div style="display:flex;gap:6px;font-size:11px;color:var(--text2);margin-bottom:12px;flex-wrap:wrap;">
      <span>${contextStr}</span><span>·</span><span>${latestStr}</span>
    </div>
    ...
```

Plus a larger font size on the slider/number inputs and a larger "Next window" preview panel (padded box vs. a single line).

### 4.4 `_isBulkSurveyCardComplete` — completion rule

User decision (Q3 from design walkthrough): **strict v1 rule, bale-ring excluded**.

```js
// v1 index.html lines 9016–9024
function _isBulkSurveyCardComplete(pid){
  if(surveyRatings[pid]==null) return false;
  if(surveyVegHeight[pid]==null) return false;
  if(surveyForageCover[pid]==null) return false;
  if(!surveyForageQuality[pid]) return false;
  const rec = surveyRecovery[pid];
  if(!rec||!rec.min||!rec.max) return false;
  return true;
}
```

**V2 rule:** identical to v1. Six required fields: rating, vegHeight, forageCover, forageCondition, recoveryMin, recoveryMax. `baleRingResidueCount` is **not** required for the ✓ Complete badge — it's a helper, not a data point on its own. Notes are optional.

---

## 5. Bale-ring residue helper (new in v2)

**Why it exists.** Users coming off bale grazing need a fast way to estimate forage cover %. Counting bale-ring footprints in a paddock and multiplying by the ring area gives a defensible cover estimate without tape-measuring.

**User decision (Q2 from design walkthrough):** farm-level default diameter of 12 ft, user-editable in Settings. Stored on the observation so recovery over time is visible.

### 5.1 Per-paddock input (expanded card, between cover input and forage condition)

Pseudocode for the input row:

```text
┌─ BALE-RING RESIDUES (optional) ─────────────────┐
│  [ 14 ] rings × 113 sq ft = 1,582 sq ft          │
│  ↳ Sets forage cover to 86% (of 10,890 sq ft)    │
└──────────────────────────────────────────────────┘
```

- `number` input, placeholder `0`, min 0, max 999.
- Live caption below: `{count} rings × {ringArea} sq ft = {totalArea} sq ft`.
- Second line: `↳ Sets forage cover to {100 - coverReducedPct}% (of {paddockArea} sq ft)`. Only shown when `paddock.acres > 0`.
- When the user types a count, `forageCoverPct` is auto-set from the calculation (see §5.3). The user can still override the forage-cover field afterwards — the bale-ring count does not lock it.
- Field hint: "Count bale-ring residues visible across the paddock."

### 5.2 Farm setting (new)

Add to Settings screen under the existing "Forage quality scale" card (or a new "Pasture assessment" card if layout is cleaner):

```text
Bale-ring residue diameter
[ 12 ] ft
Used to estimate forage cover from bale-ring counts during surveys.
```

- Stored at `farm_settings.bale_ring_residue_diameter_ft` (numeric(4,1), default 12.0).
- Changing it does not retro-update prior observations.

### 5.3 Calculation (registered via `registerCalc`)

```js
// src/calc/survey-bale-ring.js
import { registerCalc } from '../utils/calc-registry.js';

// Inputs: { ringCount, ringDiameterFt, paddockAcres }
// Output: { ringAreaSqFt, totalAreaSqFt, coverReducedPct, computedForageCoverPct }
registerCalc({
  id: 'survey.baleRingCover',
  inputs: ['ringCount', 'ringDiameterFt', 'paddockAcres'],
  output: ['computedForageCoverPct', 'ringAreaSqFt', 'totalAreaSqFt', 'coverReducedPct'],
  fn: ({ ringCount, ringDiameterFt = 12, paddockAcres }) => {
    const r = ringDiameterFt / 2;
    const ringAreaSqFt = Math.PI * r * r;                 // ≈ 113.1 @ 12 ft
    const totalAreaSqFt = (ringCount || 0) * ringAreaSqFt;
    const paddockSqFt = (paddockAcres || 0) * 43560;
    if (!paddockSqFt) return { ringAreaSqFt, totalAreaSqFt, coverReducedPct: null, computedForageCoverPct: null };
    const coverReducedPct = Math.min(100, (totalAreaSqFt / paddockSqFt) * 100);
    const computedForageCoverPct = Math.max(0, Math.round(100 - coverReducedPct));
    return { ringAreaSqFt, totalAreaSqFt, coverReducedPct, computedForageCoverPct };
  },
});
```

**Model note.** The calc returns `100 - (ringArea / paddockArea × 100)` — the usable pasture, treating bale-ring residues as the *bare* portion. If the user's domain intent inverts later (rings represent forage not bare ground), only the `computedForageCoverPct` line changes; the stored ring count is unchanged.

**Paddock-area fallback.** When the paddock has no `acres`, auto-compute is skipped and the caption reads `↳ Set paddock acreage to estimate cover.` — the ring count is still stored.

### 5.4 Storage

Already in v2 schema (no migration needed for these columns):
- `paddock_observations.bale_ring_residue_count` (integer, nullable) — exists at V2_SCHEMA_DESIGN.md §6 line 1105.
- `survey_draft_entries.bale_ring_residue_count` (integer, nullable) — exists at V2_SCHEMA_DESIGN.md §7 line 1194.

**Missing / verification:**
- `farm_settings.bale_ring_residue_diameter_ft` — **not in schema yet**. Migration 022 adds it.
- `event_observations.bale_ring_residue_count` — present? verify during implementation. Event pre-graze observations should capture the same bale-ring helper since OI-0063 aligned the two tables. If the column is missing, migration 022 adds it.

---

## 6. Bulk-mode chrome

Only renders in `mode==='bulk'`. Replaces the classic header entirely.

### 6.1 v1 header renderer (extracted)

```js
// v1 index.html lines 8553–8630
function _renderBulkSurveyHeader(){
  const el = document.getElementById('survey-bulk-header');
  if(!el) return;
  const surveyDate = document.getElementById('survey-date')?.value || todayStr();

  // Row 1: Action buttons + date
  const expandLabel = _bulkSurveyExpandAll ? 'Collapse all' : 'Expand all';
  let row1 = `<div id="survey-bulk-actions" style="display:flex;align-items:center;justify-content:space-between;padding:8px 0 6px;">
    <button type="button" onclick="_bulkSurveyCancel()" style="background:none;border:none;color:var(--red);font-size:13px;font-weight:500;cursor:pointer;font-family:inherit;padding:4px 0;">Cancel</button>
    <div style="display:flex;align-items:center;gap:8px;">
      <span style="font-size:10px;font-weight:600;color:var(--amber-d,#92400e);background:var(--amber-l,#fffbeb);border:1px solid var(--amber,#f59e0b);padding:2px 8px;border-radius:10px;">DRAFT</span>
      <button type="button" onclick="_toggleBulkSurveyExpandAll()" style="background:none;border:0.5px solid var(--border2);color:var(--text2);font-size:11px;cursor:pointer;font-family:inherit;padding:4px 10px;border-radius:6px;">${expandLabel}</button>
    </div>
    <div style="display:flex;gap:6px;align-items:center;">
      <button type="button" class="btn btn-outline btn-sm" onclick="_bulkSurveySaveDraft()">Save Draft</button>
      <button type="button" class="btn btn-green btn-sm" onclick="_bulkSurveyFinishAndSave()">Finish &amp; Save</button>
      <button type="button" onclick="closeSurveySheet()" style="background:none;border:none;color:var(--text2);font-size:18px;line-height:1;cursor:pointer;padding:2px 4px;margin-left:2px;" title="Close (saves draft)">✕</button>
    </div>
  </div>
  <div id="survey-finish-confirm" style="display:none;padding:8px 0 6px;border-top:0.5px solid var(--border2);">
    <div id="survey-finish-confirm-msg" style="font-size:13px;color:var(--text2);margin-bottom:8px;text-align:center;"></div>
    <div style="display:flex;gap:10px;">
      <button type="button" onclick="completeBulkSurvey()" style="flex:1;padding:10px;font-size:13px;font-weight:600;border-radius:8px;border:none;background:var(--teal);color:white;cursor:pointer;font-family:inherit;">Finish Anyway</button>
      <button type="button" onclick="_bulkSurveyHideFinishConfirm()" style="flex:1;padding:10px;font-size:13px;font-weight:600;border-radius:8px;border:0.5px solid var(--border2);background:transparent;color:var(--text);cursor:pointer;font-family:inherit;">Go Back</button>
    </div>
  </div>`;

  // Date row
  let dateRow = `<div style="display:flex;align-items:center;gap:8px;padding:0 0 8px;">
    <span style="font-size:13px;font-weight:600;">Survey date:</span>
    <input type="date" id="survey-bulk-date" value="${surveyDate}"
      onchange="document.getElementById('survey-date').value=this.value"
      style="max-width:160px;padding:4px 6px;border:0.5px solid var(--border2);border-radius:var(--radius);font-size:13px;background:var(--bg);color:var(--text);font-family:inherit;"/>
  </div>`;

  // Row 2: Farm filter pills (only if >1 farm)
  const farms = (S.farms||[]).filter(f=>!f.archived);
  let farmRow = '';
  if(farms.length > 1){
    const pills = [{k:'all',label:'All farms'},...farms.map(f=>({k:String(f.id),label:f.name||'Farm'}))];
    farmRow = `<div style="display:flex;gap:4px;flex-wrap:wrap;padding:4px 0;">
      ${pills.map(p=>{
        const active = _bulkSurveyFarmFilter === p.k;
        return `<button type="button" onclick="_bulkSurveyFarmFilter='${p.k}';renderSurveyPaddocks()"
          style="padding:4px 10px;font-size:11px;border-radius:12px;cursor:pointer;font-family:inherit;
          border:0.5px solid ${active?'var(--amber)':'var(--border2)'};
          background:${active?'var(--amber-l)':'transparent'};
          color:${active?'var(--amber-d)':'var(--text2)'};
          font-weight:${active?'600':'400'};">${p.label}</button>`;
      }).join('')}
    </div>`;
  }

  // Row 3: Type filter pills
  const types = [{k:'pasture',label:'Pasture'},{k:'mixed-use',label:'Mixed-Use'},{k:'all',label:'All'}];
  let typeRow = `<div style="display:flex;gap:4px;flex-wrap:wrap;padding:4px 0;">
    ${types.map(t=>{
      const active = _bulkSurveyTypeFilter === t.k;
      return `<button type="button" onclick="_bulkSurveyTypeFilter='${t.k}';renderSurveyPaddocks()"
        style="padding:4px 10px;font-size:11px;border-radius:12px;cursor:pointer;font-family:inherit;
        border:0.5px solid ${active?'var(--green)':'var(--border2)'};
        background:${active?'var(--green-l)':'transparent'};
        color:${active?'var(--green-d)':'var(--text2)'};
        font-weight:${active?'600':'400'};">${t.label}</button>`;
    }).join('')}
  </div>`;

  // Row 4: Search box
  let searchRow = `<div style="padding:4px 0;">
    <input type="text" id="survey-bulk-search" placeholder="Search by name or field code..."
      value="${_bulkSurveySearch}"
      oninput="_bulkSurveySearch=this.value.trim().toLowerCase();renderSurveyPaddocks()"
      style="width:100%;padding:6px 10px;border:0.5px solid var(--border2);border-radius:var(--radius);
      font-size:13px;background:var(--bg);color:var(--text);font-family:inherit;box-sizing:border-box;"/>
  </div>`;

  el.innerHTML = row1 + dateRow + farmRow + typeRow + searchRow;
}
```

**V2 parts:**
- **Row 1** — Cancel (red text button, not an outline btn) · center cluster (DRAFT pill + Expand/Collapse all) · right cluster (Save Draft + Finish & Save + ✕).
- **Date row** — survey date input, narrow.
- **Farm pills** — only if `farms.length > 1`; amber active state.
- **Type pills** — Pasture / Mixed-Use / All (green active).
- **Search** — filters by name or fieldCode.
- **Finish confirm bar** — slides in-place when `_bulkSurveyFinishAndSave` detects unrated paddocks; "Finish Anyway" + "Go Back".

### 6.2 Paddock-list filter logic (extracted)

```js
// v1 index.html lines 8810–8830
if(!surveyFocusPastureId){
  if(_bulkSurveyFarmFilter !== 'all'){
    pastures = pastures.filter(p=>{
      const pFarm = p.farmId ? String(p.farmId) : ((S.farms||[])[0] ? String(S.farms[0].id) : null);
      return pFarm === _bulkSurveyFarmFilter;
    });
  }
  if(_bulkSurveyTypeFilter !== 'all'){
    pastures = pastures.filter(p=>(p.landUse||'pasture') === _bulkSurveyTypeFilter);
  } else {
    pastures = pastures.filter(p=>(p.landUse||'pasture') !== 'crop');
  }
  if(_bulkSurveySearch){
    const q = _bulkSurveySearch;
    pastures = pastures.filter(p=>
      p.name.toLowerCase().includes(q) ||
      (p.fieldCode||'').toLowerCase().includes(q)
    );
  }
}
```

Confinement locations are always excluded (`p.locationType!=='confinement'`). Crop is excluded unless type pill is explicitly 'crop' (v1 does not list crop in the pill set; v2 matches — only pasture / mixed-use / all).

---

## 7. Draft lifecycle

v1 and v2 differ at the storage layer: v1 keeps `draftRatings` as a JSONB blob on `surveys`; v2 uses a child table `survey_draft_entries` (already in V2_SCHEMA_DESIGN.md §7). The UX is identical.

### 7.1 v1 draft save (extracted)

```js
// v1 index.html lines 7985–8020
function _persistSurveyDraftLocal(sv){
  if(!sv || sv.status!=='draft') return;
  sv.draftRatings = {};
  const _allPids = new Set([...Object.keys(surveyRatings),...Object.keys(surveyForageQuality),...Object.keys(surveyVegHeight),...Object.keys(surveyForageCover),...Object.keys(surveyNotes),...Object.keys(surveyRecovery)]);
  _allPids.forEach(pid=>{
    sv.draftRatings[pid] = {
      rating:        surveyRatings[pid]??null,
      vegHeight:     surveyVegHeight[pid]??null,
      forageCover:   surveyForageCover[pid]??null,
      forageQuality: surveyForageQuality[pid]??null,
      notes:         surveyNotes[pid]??null,
      recoveryMin:   surveyRecovery[pid]?.min??null,
      recoveryMax:   surveyRecovery[pid]?.max??null,
    };
  });
  sv.date = document.getElementById('survey-date')?.value || sv.date;
  saveLocal();
}

function _triggerSurveyDraftSave(){
  if(_surveyEditId === null) return;
  const sv = (S.surveys||[]).find(s=>String(s.id)===String(_surveyEditId)&&s.status==='draft');
  if(!sv) return;
  _persistSurveyDraftLocal(sv);                 // immediate localStorage persist
  if(_surveyDraftTimer) clearTimeout(_surveyDraftTimer);
  _surveyDraftTimer = setTimeout(()=>saveSurveyDraft(sv.id), 1000); // debounced Supabase write
}
```

**V2 pattern (store-first):**

```js
// pseudocode for src/features/surveys/draft.js
import { getStore } from '../../data/store.js';

let _draftTimer = null;

export function triggerSurveyDraftSave(surveyId) {
  if (!surveyId) return;
  const state = captureDraftStateFromDOM();  // reads slider/inputs into { [pastureId]: {...} }
  getStore().upsertSurveyDraftEntries(surveyId, state);   // validates → mutates → persists → queues sync
  if (_draftTimer) clearTimeout(_draftTimer);
  _draftTimer = setTimeout(() => getStore().flushSurveyDraftSync(surveyId), 1000);
}
```

- **Immediate** localStorage write via store mutation.
- **Debounced** Supabase sync (1 s) so typing doesn't spam the queue.
- Called on every oninput/onchange of every card field.
- Also called on sheet close (see `closeSurveySheet` at v1 line 8107).

### 7.2 Commit — `completeBulkSurvey` (extracted)

```js
// v1 index.html lines 8229–8284
function completeBulkSurvey(){
  if(_surveyEditId === null) return;
  const sv = (S.surveys||[]).find(s=>String(s.id)===String(_surveyEditId));
  if(!sv) return;
  const date = document.getElementById('survey-date')?.value || todayStr();
  const pastures = sortedPastures(false).filter(p=>p.locationType!=='confinement');
  const rated = pastures.filter(p=>surveyRatings[String(p.id)]!=null);
  if(!rated.length){ alert('Rate at least one paddock before completing the survey.'); return; }

  sv.date   = date;
  sv.status = 'committed';
  sv.draftRatings = null;
  queueWrite('surveys', _surveyRow(sv, _sbOperationId));

  // Write paddock_observations for each rated pasture
  let _obsTs = Date.now();
  rated.forEach(p=>{
    const pid = String(p.id);
    _writePaddockObservation({
      id: _obsTs++, pastureId: p.id, pastureName: p.name,
      observedAt: date, source: 'survey', sourceId: sv.id,
      confidenceRank: 3,
      vegHeight:       surveyVegHeight[pid]??null,
      forageCoverPct:  surveyForageCover[pid]??null,
      forageQuality:   surveyRatings[pid]??null,
      forageCondition: surveyForageQuality[pid]??null,
      recoveryMinDays: surveyRecovery[pid]?.min??null,
      recoveryMaxDays: surveyRecovery[pid]?.max??null,
      notes:           surveyNotes[pid]||null,
    });
  });

  // Apply recovery window edits
  Object.entries(surveyRecovery).forEach(([pastureId,rec])=>{
    if(rec.min==null && rec.max==null) return;
    const p  = S.pastures.find(x=>String(x.id)===String(pastureId));
    if(!p) return;
    const ev = lastClosedEventForPasture(pastureId, p.name);
    if(ev){
      const daysAlreadyRested = ev.dateOut
        ? Math.max(0, Math.round((new Date(date+'T12:00:00')-new Date(ev.dateOut+'T12:00:00'))/86400000))
        : 0;
      if(rec.min!=null) ev.recoveryMinDays = rec.min + daysAlreadyRested;
      if(rec.max!=null) ev.recoveryMaxDays = rec.max + daysAlreadyRested;
    } else {
      if(rec.min!=null && p) p.recoveryMinDays=rec.min;
      if(rec.max!=null && p) p.recoveryMaxDays=rec.max;
    }
  });

  save();
  ...
}
```

**V2 commit rules (strict parity):**
1. **Require at least one rated paddock** — alert and return otherwise.
2. **Stamp** `surveys.date` + `surveys.status = 'committed'` and clear `draftRatings` equivalents (delete child `survey_draft_entries` rows for this survey).
3. **Write one `paddock_observations` row per rated paddock**, with `source='survey'` and `sourceId=survey.id`. Include `baleRingResidueCount` if set.
4. **Recovery window inversion.** When saving recovery min/max, add `daysAlreadyRested` (survey date − last closed event's `dateOut`) back, so the stored value is event-date-relative. If no prior event exists, write directly to `pastures.recoveryMinDays/MaxDays`.
5. **Single observation per (survey, paddock).** If re-committing (bulk-edit path), delete the prior observation for this `(sourceId, pastureId)` and write a new one — do not append.

### 7.3 Cancel / Close / Discard

| Action | Behavior | v1 fn |
|---|---|---|
| Backdrop click (non-field-mode only) | `closeSurveySheet()` — auto-saves draft | line 8107 |
| `✕` button in bulk header | `closeSurveySheet()` — auto-saves draft | line 8569 |
| "Cancel" (red text, bulk header) | Confirm "Discard changes from this session?" → restores snapshot → closes (but draft record remains in DB) | line 8119 `_bulkSurveyCancel` |
| "Save Draft" button | `_bulkSurveySaveDraft()` — immediate sync, sheet stays open, toast "Draft saved." | line 8175 |
| "Finish & Save" button | If any paddock unrated → inline confirm bar ("{N} of {M} paddocks have no data — finish anyway?"). Otherwise commit. | line 8183 |
| "Discard" on surveys tab banner | Full delete (`S.surveys.splice`, Supabase delete) | line 8470 |

**Two-tier close semantics:**
- "Close sheet" (backdrop / ✕) = preserve the draft; next time user opens a bulk survey they get "Resume".
- "Cancel" (explicit) = roll the session's edits back to snapshot; the draft itself still exists but mirrors the state before this session's edits.
- "Discard" (surveys tab) = destroy the draft entirely.

---

## 8. Field-mode adaptations

SP-8 already wires the two survey tiles into the field-mode grid. This spec defines the **picker sheet** and **sheet-behaviour** changes for field mode.

### 8.1 Pasture survey picker (single-survey mode in field)

```html
<!-- v1 index.html lines 25103–25113 -->
<div id="pasture-survey-picker-wrap" class="sheet-wrap field-mode-sheet">
  <div class="sheet-backdrop" onclick="closePastureSurveyPickerSheet()"></div>
  <div class="sheet" style="max-width:500px;">
    <div class="sheet-handle"></div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
      <div style="font-size:16px;font-weight:600;">Survey a pasture</div>
      <button class="sheet-close" onclick="closePastureSurveyPickerSheet()" style="border:none;background:transparent;font-size:18px;cursor:pointer;color:var(--text2);">&#x2715;</button>
    </div>
    <div id="pasture-survey-picker-list"></div>
  </div>
</div>
```

**Picker renderer** (from lines 5284–5357):

- Farm filter pills (only if >1 farm), teal active.
- Type filter pills: All / Pasture / Mixed-Use (excludes crop unless explicit).
- Search input: name or fieldCode.
- Sort: active paddocks first, then alphabetical.
- Row: 📋 icon · name + acres + "active" badge · land-use + farm hint.
- Click a row → `closePastureSurveyPickerSheet()` then `openSurveySheet(pastureId)` (single mode).

### 8.2 Field-mode sheet behaviour

When `document.body.classList.contains('field-mode')`:

| Element | Behavior |
|---|---|
| Backdrop click | Disabled (`backdrop.onclick = null`). Prevents accidental close. |
| Sheet handle | `display: none` — visual indicator removed. |
| `.sheet-close` button | Text becomes `⌂ Done` (Unicode U+2302) instead of `✕`. |
| Full-screen | Sheet takes full viewport — see SP-8's field-mode-sheet CSS. |

This behaviour already applies to the move picker, feed-check picker, and heat picker (SP-8). The survey sheet must follow the same rule.

### 8.3 Exiting the survey sheet in field mode

On `closeSurveySheet()` (or `closePastureSurveyPickerSheet()`), call `_fieldModeGoHome()` to return the user to the field-mode tile grid — matching v1 at lines 8116 and 5281.

---

## 9. Schema impact

### 9.1 Columns already in V2_SCHEMA_DESIGN.md

| Table | Column | Status |
|---|---|---|
| `paddock_observations` | `bale_ring_residue_count` (integer, null) | ✅ exists |
| `survey_draft_entries` | `bale_ring_residue_count` (integer, null) | ✅ exists |
| `farm_settings` | `forage_quality_scale_min` / `_max` | ✅ exists |

### 9.2 New columns (migration 022)

| Table | Column | Type | Default | Purpose |
|---|---|---|---|---|
| `farm_settings` | `bale_ring_residue_diameter_ft` | numeric(4,1) | 12.0 | Per-farm default ring diameter used by the cover-from-rings calc |
| `event_observations` | `bale_ring_residue_count` | integer | NULL | **Verify first** — should already exist after OI-0063 alignment. If absent, add. |

### 9.3 Migration 022 SQL (sketch)

```sql
-- supabase/migrations/022_bale_ring_residue_helper.sql
-- SP-9: Bale-ring residue cover helper for surveys.
-- Adds farm_settings.bale_ring_residue_diameter_ft (default 12.0).
-- Verifies event_observations.bale_ring_residue_count exists; adds if missing.

BEGIN;

-- 1. Farm setting for ring diameter default
ALTER TABLE farm_settings
  ADD COLUMN IF NOT EXISTS bale_ring_residue_diameter_ft numeric(4,1) NOT NULL DEFAULT 12.0;

-- 2. Event observations parity (should already exist from OI-0063; guard)
ALTER TABLE event_observations
  ADD COLUMN IF NOT EXISTS bale_ring_residue_count integer;

-- 3. Bump schema version
UPDATE operations SET schema_version = 22;

COMMIT;
```

**Apply + verify per CLAUDE.md Migration Execution Rule:** write → execute against Supabase MCP → verify with `SELECT column_name FROM information_schema.columns WHERE ...` → report in commit message.

### 9.4 `BACKUP_MIGRATIONS` entry (v2 app)

```js
// src/data/backup-migrations.js — add entry
21: (b) => {
  // SP-9: default ring diameter for any farm_settings rows missing the field
  (b.farm_settings || []).forEach(fs => {
    if (fs.bale_ring_residue_diameter_ft == null) fs.bale_ring_residue_diameter_ft = 12.0;
  });
  b.schema_version = 22;
  return b;
},
```

### 9.5 FK ordering (V2_MIGRATION_PLAN.md §5.3a)

No new FK added — `farm_settings` already depends on `operations`, `event_observations.bale_ring_residue_count` is a scalar column. **No §5.3a update required** for this migration. Confirm during implementation.

---

## 10. CP-55 / CP-56 export/import spec impact

**Flag under Export/Import Spec Sync Rule (CLAUDE.md).**

| Change | CP-55 export | CP-56 import |
|---|---|---|
| `farm_settings.bale_ring_residue_diameter_ft` (new col) | Serialize alongside other farm_settings fields | Old backups missing it → default to 12.0 |
| `event_observations.bale_ring_residue_count` (conditional new col) | Serialize if present | Old backups → null |
| `survey_draft_entries.bale_ring_residue_count` (already exists) | Must be in export if not already | Null-tolerant |
| `paddock_observations.bale_ring_residue_count` (already exists) | Must be in export if not already | Null-tolerant |

**Schema version** bumps to 22. CP-56 migration chain must cover version 21 → 22 by defaulting the new `farm_settings` column to 12.0.

---

## 11. Files to create / change

### New files

- `src/features/surveys/survey-sheet.js` — new sheet implementation (replaces current generic create flow in `src/features/surveys/index.js`).
- `src/features/surveys/bulk-header.js` — renders the bulk-mode header (Row 1 actions, date, farm pills, type pills, search).
- `src/features/surveys/paddock-card.js` — the shared card renderer (collapsed vs expanded, single vs bulk).
- `src/features/surveys/picker-sheet.js` — field-mode pasture picker.
- `src/features/surveys/draft.js` — `triggerSurveyDraftSave`, debounced sync.
- `src/calc/survey-bale-ring.js` — registered calc (`survey.baleRingCover`).
- `supabase/migrations/022_bale_ring_residue_helper.sql`.

### Modified files

- `src/features/surveys/index.js` — refactor to delegate to `survey-sheet.js`; keep `openCreateSurveySheet` export (used by SP-1 dashboard button) as a thin wrapper around `openBulkSurveySheet`.
- `src/data/store.js` — add `upsertSurveyDraftEntries(surveyId, state)`, `flushSurveyDraftSync(surveyId)`, `commitSurvey(surveyId, date)`, `deleteSurveyDraft(surveyId)`.
- `src/entities/farm-settings.js` — add `bale_ring_residue_diameter_ft` to FIELDS, `validate()`, `toSupabaseShape()`, `fromSupabaseShape()`.
- `src/entities/event-observations.js` — add `bale_ring_residue_count` if missing.
- `src/features/settings/index.js` — add "Bale-ring residue diameter" input to the farm-settings card.
- `src/features/locations/edit-sheet.js` — add `+ Add reading` button that calls `openSurveySheet(pastureId)`.
- `src/features/locations/surveys-tab.js` — OR create this file — renders the Surveys sub-tab with draft banner, `+ New Survey`, and committed list.
- `src/features/field-mode/index.js` — replace current `surveybulk` / `surveysingle` stubs with `openBulkSurveySheet()` / `openPastureSurveyPickerSheet()`.
- `src/data/backup-migrations.js` — add migration 21 entry.

### Tests

- `tests/unit/calc/survey-bale-ring.test.js` — verifies the ring-area math + `computedForageCoverPct` bounds.
- `tests/unit/entities/farm-settings.test.js` — add case for `bale_ring_residue_diameter_ft` round-trip.
- `tests/unit/features/survey-draft.test.js` — debounce behavior, resume-from-draft round-trip.
- `tests/unit/features/survey-commit.test.js` — recovery-window inversion, single-obs-per-(survey, paddock) rule.
- `tests/e2e/surveys-bulk-parity.spec.ts` — opens bulk, fills 2 paddocks, finishes, asserts Supabase rows present (per `CLAUDE.md` "E2E Testing — Verify Supabase, Not Just UI").
- `tests/e2e/surveys-single-parity.spec.ts` — opens single from locations edit, fills + saves.
- `tests/e2e/surveys-field-mode.spec.ts` — picker sheet flow in field mode, `⌂ Done` label verified.

---

## 12. Acceptance criteria

- [ ] Bulk survey opens from Locations `📋 Survey`, Surveys sub-tab `+ New Survey`, and field-mode `Multi-Pasture Survey` tile — all three paths call the same `openBulkSurveySheet()`.
- [ ] Draft banner on Surveys sub-tab shows "📋 Survey in progress · {N} paddocks rated" and Resume / Discard buttons.
- [ ] Single-pasture survey opens from Locations edit → `+ Add reading`, Locations edit → survey-history row Edit, and field-mode `Pasture Survey` tile.
- [ ] Bulk header matches v1 exactly: Cancel (red text) · DRAFT tag · Expand/Collapse all · Save Draft · Finish & Save · ✕ · date · farm pills (>1 farm) · type pills · search.
- [ ] Paddock card in bulk mode is collapsed by default; header shows name · acres · Active badge · ✓ Complete badge (when `_isBulkSurveyCardComplete` true); chevron rotates on expand.
- [ ] Expanded card shows: rating slider + number + color bar, veg height, forage cover, **bale-ring residues (new)**, forage condition (4 buttons), recovery window (MIN/MAX + date preview + status).
- [ ] Bale-ring input auto-sets forage cover % via `survey.baleRingCover` calc; user can override after.
- [ ] Farm setting "Bale-ring residue diameter" added to Settings; defaults to 12 ft.
- [ ] Draft saves immediately to localStorage + 1s-debounced to Supabase on every field change.
- [ ] Cancel confirms discard-session; ✕ silently auto-saves; Save Draft shows toast; Finish & Save shows inline "N of M paddocks have no data — finish anyway?" bar.
- [ ] Finish commit writes one `paddock_observations` row per rated paddock with `source='survey'`, `sourceId=survey.id`, and `baleRingResidueCount` if set.
- [ ] Recovery-window values are stored event-date-relative (inverse of the survey-date-relative display).
- [ ] Bulk-edit of a committed survey replaces prior observations for `(sourceId, pastureId)` — does not append.
- [ ] Field-mode picker sheet renders with farm pills, type pills, search; active paddocks first; `⌂ Done` close label.
- [ ] Field-mode sheet behaviour applies to survey sheet: backdrop disabled, handle hidden, close = `⌂ Done`.
- [ ] Closing the survey sheet in field mode calls `_fieldModeGoHome()`.
- [ ] Migration 022 applied and verified against Supabase; commit message reads "Migration 022 applied and verified".
- [ ] `BACKUP_MIGRATIONS[21]` defaults `bale_ring_residue_diameter_ft` to 12.0 for old backups.
- [ ] CP-55 export includes all new/affected columns; CP-56 import null-tolerant for old backups.
- [ ] All unit tests pass (`npx vitest run`).
- [ ] E2E Supabase-verification tests pass for bulk, single, and field-mode flows.
- [ ] No `innerHTML` with dynamic data; DOM builder used throughout.
- [ ] All user-facing strings use `t()`.

---

## 13. Open questions resolved in design walkthrough (2026-04-17)

| # | Question | Resolution |
|---|---|---|
| Q1 | Does the v1 home-card "+ Survey" button need a v2 equivalent? | **No.** V2 has no "Pasture readiness" home card. Entry point is dropped from SP-9. |
| Q2 | Should bale-ring residue count be stored, and what's the default ring diameter? | **Yes** — stored on `paddock_observations` (already in schema) and `event_observations` (verify). Default diameter = **12 ft**, per-farm editable in Settings (new `farm_settings.bale_ring_residue_diameter_ft`). |
| Q3 | What's the rule for the "✓ Complete" badge on a bulk paddock card? | **Strict v1 parity.** Requires rating + vegHeight + forageCover + forageCondition + recoveryMin + recoveryMax. Bale-ring count is not required (it's a helper, not a required data point). Notes optional. |

---

## 14. Notes for the implementer

- **Use the store.** Every mutation goes through `store.*` — not raw `S.*` writes.
- **No `innerHTML` with user data.** The v1 HTML/CSS above is reference, not paste-ready. Use the DOM builder.
- **Calc registry.** The bale-ring calc must use `registerCalc` (V2_CALCULATION_SPEC.md pattern).
- **Store param counts.** Every `store.add` / `store.update` / `store.remove` must pass the full argument set — see CLAUDE.md "Store call param-count check" (OI-0050 trap).
- **Execute migration 022 in the same session** it is written (Migration Execution Rule).
- **Close the GitHub issue** for this spec in the commit that completes all acceptance criteria.
