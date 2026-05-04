# Survey Sheet — V1 Parity Rebuild

**Status:** Reconciled into base docs 2026-05-04 (Reconciliation Session D, SP-9). Implementation work for the bulk-edit / draft-resume / picker flows shipped earlier — see commit history.
**Type:** UI feature (full v1 parity + one deliberate v2 addition: bale-ring residue helper)
**Priority:** P1
**Related OI:** OI-0063 (event_observations alignment, predecessor — closed 2026-04-15), OI-0111 / migration 027 (renamed `bale_ring_residue_diameter_ft` → `_cm` per metric-internal rule)

## Authoritative spec

The full design lives in **V2_UX_FLOWS.md §7 "Survey Workflow"**. Read that section before implementing. The 11 subsections cover:

- §7.1 Three Modes (one sheet, three modes — `bulk` / `single` / `bulk-edit` — toggled by `setSurveySheetMode`; the sheet container is reused, never destroyed between modes)
- §7.2 Entry Points (the 8-path matrix — Locations `📋 Survey`, Surveys sub-tab `+ New Survey` / Resume / Edit, Location edit `+ Add reading` / row Edit, Field Mode multi-pasture and single-pasture tiles; v1's 9th entry point — home Pasture readiness card — explicitly dropped)
- §7.3 Paddock Card (collapsed bulk header anatomy, single-mode richer context line, six body sections — rating slider + number + color bar, veg height + cover side-by-side, bale-ring helper, forage condition 4-button group, recovery window with live date preview, notes; recovery-window date math inverse on commit)
- §7.4 Bale-Ring Residue Helper (the one deliberate v2 addition — input between cover and condition, two-line caption, auto-fill cover %, count stored on observation, default 12 ft diameter editable per farm)
- §7.5 Bulk-Mode Chrome (action row with red Cancel + DRAFT pill + Expand/Collapse + Save Draft + Finish & Save + ✕; date row; farm pills only when >1 farm; type pills excluding crop; search; in-place finish-confirm bar)
- §7.6 Draft Lifecycle (immediate-on-localStorage + 1-second-debounced Supabase sync; child table `survey_draft_entries`; three close semantics — backdrop/✕ auto-saves, Cancel rolls back session edits, Discard deletes draft entirely)
- §7.7 Commit Rules (require ≥1 rated paddock; one observation per rated paddock with `source='survey'`, `sourceId=survey.id`, `confidenceRank=3`; recovery-window inversion on save so stored values are event-date-relative; bulk-edit replaces, doesn't append)
- §7.8 Field Mode Adaptations (backdrop disabled; sheet handle hidden; close = `⌂ Done`; full-screen mobile; single survey gates through a picker sheet first)
- §7.9 Surveys Sub-Tab on Locations Screen (draft banner + committed list with Edit; `+ New Survey` disabled when a draft exists)
- §7.10 Design Notes (no `farm_id` on the parent survey — bulk surveys can span farms; the Complete-badge rule lives in one function, kept strict and grep-friendly)
- §7.11 Schema and Export Impact (migration 022 added `farm_settings.bale_ring_residue_diameter_ft`, renamed to `_cm` in OI-0111 / migration 027; v21 → v22 backup-migrations chain entry)

The bale-ring residue calc (`survey.baleRingCover` / SUR-2) is documented in **V2_CALCULATION_SPEC.md §4.9 "Survey/Forage Quality Domain"** with formula, inputs, output shape, paddock-area fallback, and storage rules.

## Why this file exists

Thin pointer for GitHub issue tracking. The full spec is no longer duplicated here per the project's "Specs in base docs, not spec files" rule.
