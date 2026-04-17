# SP-4: Dashboard Group Card — V1 Parity

**Priority:** P1
**Area:** v2-build / UI sprint
**Labels:** ui, dashboard, v1-parity
**Depends on:** `BUG_group-placement-detection.md` (Fix A must land first or same session)

---

## Goal

Rebuild the v2 dashboard group card to match the v1 card layout, data density, and interaction pattern. The Groups tab is the animal-centric view of the farm — users expect to see each group's current location, event timeline, DMI target, feed breakdown, NPK deposited, and fertilizer value at a glance.

The v2 group card currently shows a stripped-down version: name, head, avg weight, location name, a basic DMI progress bar, NPK in lbs (with NaN bug), and Move/Weights/Edit buttons. It's missing most of the v1 data points and the entire visual structure of the location bar.

---

## V1 Reference: Card Structure (top to bottom)

### Header (always visible, clickable to expand on mobile)

```
[color bar] [Group Name]                              [chevron ▼]
            N head · avg W lbs · [Location Name]
```

### Body (expanded by default on desktop, toggle on mobile)

**1. Composition line**
```
29 female, 2 male
```
Gender breakdown from animal records. Falls back to class-count display if no sex data.

**2. Location status bar** (gray background card)
When placed:
```
[icon] [Location Name] [badge: grazing/confinement/stored feed]
Day N · [date label] · N feedings · $cost · AU · Pasture AUDs: N · ADA: N/ac · Pasture: N lbs DMI · Stored Feed: N lbs DMI
[sub-move summary line, if any]
[Currently at: location · since date, if active sub-move]
```
When not placed:
```
Not currently placed (dimmed)
```

**3. DMI target + feed breakdown** (when active event exists)
```
DMI target N lbs/day · X% from pasture this event
[amber progress bar — fill = stored feed % of total]
X% stored feed · Y% estimated pasture
NPK deposited: NN.N / PN.N / KN.N lbs · $value fert value    (purple text)
```
When `noPasture` flag: `100% stored feed` in amber text, no progress bar.

**4. Action buttons**
```
[Move] [Split] [Weights] [Edit]
```
- **Move** (teal, only when placed) → opens event edit sheet for this event
- **Place** (teal, only when NOT placed) → launches place wizard
- **Split** (outline, only when placed) → opens split sheet
- **Weights** (outline, always) → opens weight sheet
- **Edit** (outline, always) → opens edit group sheet

---

## V1 HTML Template (extracted from `renderGroupCard()`, lines 6279-6394)

```html
<div class="grp-card" id="grp-card-{id}">
  <div class="grp-card-hdr" onclick="toggleGroupCard({id})">
    <div class="grp-color-bar" style="background:{color};"></div>
    <div style="flex:1;min-width:0;">
      <div style="font-size:15px;font-weight:600;line-height:1.3;">{name}</div>
      <div style="font-size:12px;color:var(--text2);margin-top:2px;">
        {head} head · avg {weight} lbs · {locationName | 'not placed'}
      </div>
    </div>
    <svg class="grp-chevron" width="18" height="18" viewBox="0 0 24 24"
         fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  </div>
  <div class="grp-card-body">
    <!-- Composition -->
    <div style="font-size:12px;color:var(--text2);margin-bottom:8px;">{composition}</div>

    <!-- Location bar (when placed) -->
    <div class="grp-loc-bar">
      <div style="flex:1;">
        <div style="font-size:13px;font-weight:600;">
          {icon} {locationName} <span class="badge bg" style="font-size:10px;">grazing</span>
        </div>
        <div style="font-size:11px;color:var(--text2);margin-top:2px;">
          Day {N} · {dateLabel} · {feedCount} feedings · ${cost} · {AU} AU
          · Pasture AUDs: {pAUDs} · ADA: {ada}/ac
          · Pasture: {pDM} lbs DMI · Stored Feed: {sDM} lbs DMI
        </div>
        <!-- Sub-move summary (conditional) -->
        <div style="font-size:11px;color:var(--text2);margin-top:2px;">
          {N} sub-moves · {hrs}h off-paddock · {pct}% on pasture
        </div>
        <!-- Currently at (conditional) -->
        <div style="font-size:11px;font-weight:600;color:var(--teal-d);margin-top:3px;">
          📍 Currently at: {smLocationName}
          <span style="font-weight:400;color:var(--text2);"> · since {date}</span>
        </div>
      </div>
    </div>

    <!-- Location bar (when NOT placed) -->
    <div class="grp-loc-bar" style="opacity:0.6;">
      <div style="font-size:13px;color:var(--text2);">Not currently placed</div>
    </div>

    <!-- DMI + NPK block -->
    <div style="font-size:12px;color:var(--text2);margin-bottom:10px;">
      DMI target {N} lbs/day · {pct}% from pasture this event
      <div class="prog" style="margin-top:4px;">
        <div class="prog-fill" style="width:{fill}%;background:var(--amber);"></div>
      </div>
      <div style="font-size:10px;color:var(--text2);margin-top:2px;">
        {fill}% stored feed · {100-fill}% estimated pasture
      </div>
      <div style="font-size:11px;color:var(--purple-d);margin-top:3px;">
        NPK deposited: N{n} / P{p} / K{k} lbs · <strong>${value}</strong> fert value
      </div>
    </div>

    <!-- Actions -->
    <div class="grp-actions">
      <button class="btn btn-teal">Move</button>
      <button class="btn btn-outline">Split</button>
      <button class="btn btn-outline">Weights</button>
      <button class="btn btn-outline">Edit</button>
    </div>
  </div>
</div>
```

---

## V1 CSS Classes

```css
.grp-card {
  background: var(--bg);
  border: 0.5px solid var(--border);
  border-radius: var(--radius-l);
  margin-bottom: 10px;
  overflow: hidden;
}
.grp-card-hdr {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  cursor: pointer;
}
.grp-card-hdr:active { background: var(--bg2); }
.grp-color-bar {
  width: 4px;
  border-radius: 2px;
  flex-shrink: 0;
  align-self: stretch;
  min-height: 36px;
}
.grp-card-body {
  display: none;
  border-top: 0.5px solid var(--border);
  padding: 12px 14px;
}
.grp-card.expanded .grp-card-body { display: block; }
.grp-card.expanded .grp-chevron { transform: rotate(180deg); }
.grp-chevron {
  transition: transform 0.2s;
  flex-shrink: 0;
  color: var(--text3);
}
.grp-loc-bar {
  background: var(--bg2);
  border-radius: var(--radius);
  padding: 9px 12px;
  margin-bottom: 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.grp-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.grp-actions .btn { flex: 1; min-width: 80px; padding: 10px 8px; font-size: 13px; }

/* Progress bar (stored feed) */
.prog { height: 5px; background: var(--bg3); border-radius: 3px; overflow: hidden; margin-top: 4px; }
.prog-fill { height: 100%; border-radius: 3px; }

/* Desktop: body always visible, chevron hidden */
body.desktop .grp-card .grp-card-body { display: block !important; }
body.desktop .grp-card .grp-chevron { display: none; }
```

---

## Changes from V1

1. **Split button** → Deferred. V2 does not have `openSplitSheet` yet. Show the button but disabled with tooltip "Coming soon" or omit entirely. **Decision needed from Tim.**
2. **Edit button handler** → V1 calls `openEditGroupSheet(g.id)`. V2 equivalent is `navigate('#/animals')` or a dedicated group-edit sheet if one exists.
3. **Move button handler** → V1 calls `openEventEdit(ae.id)`. V2 should call `openEventDetailSheet(event, operationId, farmId)` (the SP-2 sheet) since that's the v2 equivalent of v1's event edit.
4. **Calculation sources** → V1 uses inline calc functions (`calcConsumedDMI`, `pastureFraction`, `getGroupTotals`). V2 uses registered calcs (CST-1, NPK-1, DMI-2, etc.). The calc references below map v1 display values to v2 calcs.

---

## Calc Reference (v1 display → v2 calc)

| V1 display value | V1 source | V2 calc |
|---|---|---|
| Head count | `getGroupTotals(g).totalHead` | `animalGroupMemberships` count |
| Avg weight | `getGroupTotals(g).avgWeight` | `activeGW.avgWeightKg` → display() |
| AU | `totalLiveWeight / auWeight` | `activeGW.headCount * activeGW.avgWeightKg / auWeight` |
| Feed cost | `calcEntryCost(feedEntries)` | CST-1 |
| Stored feed DMI | `calcConsumedDMI(entries, residual, lastCheck)` | DMI-1 (or inline from eventFeedEntries) |
| Pasture DMI | `dmiTarget * days - storedFeed` | `dmiTarget * days - DMI-1 result` |
| Pasture AUDs | `pastureDM / dmPerAUD` | Inline: `pastureDM / settings.dmPerAUD` |
| ADA | `pastureAUDs / acres` | Inline: `pastureAUDs / paddock acres` |
| DMI target | `getGroupTotals(g).dmiTarget` | DMI-2 (or from group.dmiTarget) |
| Pasture fraction | `pastureFraction(ae)` | Inline from sub-move durations |
| NPK deposited | `grpBW/1000 * excRate * days * pFrac` | NPK-1 |
| NPK fert value | `n*nPrice + p*pPrice + k*kPrice` | NPK-2 (or inline from npkPriceHistory) |

---

## Acceptance Criteria

- [ ] Group card header matches v1: color bar, name, head, avg weight, location name
- [ ] Composition line shows gender breakdown (or class breakdown as fallback)
- [ ] Location status bar matches v1 layout: icon, name, badge, full event timeline line
- [ ] Sub-move summary and "Currently at" lines render when applicable
- [ ] DMI target line with pasture percentage renders
- [ ] Amber progress bar showing stored feed fraction renders
- [ ] NPK deposited line in purple with fertilizer dollar value renders
- [ ] Action buttons: Move/Place, Split (or placeholder), Weights, Edit
- [ ] Mobile: card body collapses with chevron toggle
- [ ] Desktop: card body always visible, chevron hidden
- [ ] Cards use v1 CSS classes (`.grp-card`, `.grp-loc-bar`, `.grp-actions`, `.prog`, etc.)
- [ ] No NaN values in any displayed numbers

---

## No Schema Impact

Visual/rendering only. No CP-55/CP-56 impact.
