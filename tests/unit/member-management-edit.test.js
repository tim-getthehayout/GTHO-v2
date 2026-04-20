/**
 * @file OI-0120 — Member Management edit flow.
 *
 * Covers showEditForm + editMember (pending + accepted branches) via the
 * live openMemberManagementSheet entry point. Supabase + session are mocked
 * so the sheet can render without real network.
 *
 * Six cases:
 *   1. Pending happy path — edit name + email + role, Save → update called
 *      with all four fields (+ updated_at); list re-renders.
 *   2. Accepted happy path — edit name + email (no role), Save → update
 *      called with display_name + email + updated_at only; no role key.
 *   3. Validation: empty display_name + bad email surface inline errors and
 *      do NOT call update.
 *   4. Owner row has no edit button.
 *   5. Self row has no edit button.
 *   6. Email collision: pre-check returns another member with same email →
 *      inline error, no update call.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { setLocale } from '../../src/i18n/i18n.js';
import enLocale from '../../src/i18n/locales/en.json';

const OP = '00000000-0000-0000-0000-0000000000aa';
const SELF_USER = 'user-self';

// ── Mutable Supabase stub state ─────────────────────────────────────
let members = [];
let updateCalls = [];
let collisionReturns = [];

function resetSupabaseStub() {
  members = [];
  updateCalls = [];
  collisionReturns = [];
}

// Build a query-builder stub that tracks .update() calls and returns
// user-controlled data for .select() chains used by the email-collision
// pre-check.
function makeSupabaseStub() {
  return {
    from(table) {
      const qb = {
        _table: table,
        _filters: [],
        _update: null,
        _selectCols: null,
        select(cols) {
          this._selectCols = cols;
          return this;
        },
        eq(col, val) { this._filters.push({ op: 'eq', col, val }); return this; },
        neq(col, val) { this._filters.push({ op: 'neq', col, val }); return this; },
        order() { return this; },
        update(payload) {
          this._update = payload;
          return this;
        },
        insert() { return Promise.resolve({ error: null }); },
        delete() { return Promise.resolve({ error: null }); },
        then(resolve) {
          // Two shapes used by the edit flow:
          //   1) List fetch (no update, no neq) — return the members array.
          //   2) Collision check (select + eq operation_id + eq email + neq id).
          //   3) Update call — update set + eq id.
          if (this._update) {
            updateCalls.push({ table: this._table, payload: this._update, filters: this._filters });
            return resolve({ error: null });
          }
          if (this._filters.some(f => f.op === 'neq')) {
            // Collision pre-check. Return the next pre-programmed collision.
            const next = collisionReturns.shift() ?? [];
            return resolve({ data: next, error: null });
          }
          // Otherwise: initial list fetch.
          return resolve({ data: members, error: null });
        },
      };
      return qb;
    },
  };
}

// ── Module mocks ────────────────────────────────────────────────────
vi.mock('../../src/data/supabase-client.js', () => ({
  get supabase() { return makeSupabaseStub(); },
}));
vi.mock('../../src/features/auth/session.js', () => ({
  getUser: () => ({ id: SELF_USER }),
}));

// Import AFTER mocks are registered.
const { openMemberManagementSheet } = await import('../../src/features/settings/member-management.js');

beforeAll(() => setLocale('en', enLocale));

function ensureSheetMarkup() {
  if (document.getElementById('member-mgmt-sheet-wrap')) return;
  const wrap = document.createElement('div');
  wrap.id = 'member-mgmt-sheet-wrap';
  wrap.className = 'sheet-wrap';
  const panel = document.createElement('div');
  panel.id = 'member-mgmt-sheet-panel';
  panel.className = 'sheet-panel';
  wrap.appendChild(panel);
  document.body.appendChild(wrap);
}

async function openSheet() {
  ensureSheetMarkup();
  await openMemberManagementSheet(OP);
  return document.getElementById('member-mgmt-sheet-panel');
}

beforeEach(() => {
  resetSupabaseStub();
  document.body.innerHTML = '';
  // Current user is admin. Pending + accepted + owner + self rows seeded.
  members = [
    { id: 'm-owner', operation_id: OP, user_id: 'user-owner', role: 'owner', display_name: 'Owner', email: 'owner@x.com' },
    { id: 'm-self', operation_id: OP, user_id: SELF_USER, role: 'admin', display_name: 'Self Admin', email: 'self@x.com' },
    { id: 'm-team', operation_id: OP, user_id: 'user-team', role: 'team_member', display_name: 'Team Member', email: 'team@x.com' },
    { id: 'm-pending', operation_id: OP, user_id: null, role: 'team_member', display_name: 'Pending Person', email: 'pending@x.com', invited_at: new Date().toISOString(), invite_token: 'tok-1' },
  ];
});

describe('OI-0120 — member-management edit form', () => {
  it('Owner row has no edit button (CP-66 owner-row protection)', async () => {
    const panel = await openSheet();
    expect(panel.querySelector('[data-testid="member-edit-m-owner"]')).toBeFalsy();
  });

  it("Self row has no edit button (self-edit out of scope)", async () => {
    const panel = await openSheet();
    expect(panel.querySelector('[data-testid="member-edit-m-self"]')).toBeFalsy();
  });

  it('Pending happy path — Save writes display_name + email + role + updated_at', async () => {
    const panel = await openSheet();
    panel.querySelector('[data-testid="member-edit-m-pending"]').click();

    const form = panel.querySelector('[data-testid="member-edit-form-m-pending"]');
    expect(form).toBeTruthy();
    form.querySelector('[data-testid="member-edit-name-m-pending"]').value = 'New Pending Name';
    form.querySelector('[data-testid="member-edit-email-m-pending"]').value = 'new-pending@x.com';
    // Switch role to admin
    form.querySelector('[data-testid="member-edit-role-admin-m-pending"]').click();

    await form.querySelector('[data-testid="member-edit-save-m-pending"]').click();
    // Allow the async editMember promise chain to settle.
    await new Promise(r => setTimeout(r, 20));

    expect(updateCalls.length).toBe(1);
    const call = updateCalls[0];
    expect(call.table).toBe('operation_members');
    expect(call.payload.display_name).toBe('New Pending Name');
    expect(call.payload.email).toBe('new-pending@x.com');
    expect(call.payload.role).toBe('admin');
    expect(call.payload.updated_at).toBeTruthy();
    // filter is eq id = m-pending
    expect(call.filters).toEqual(expect.arrayContaining([{ op: 'eq', col: 'id', val: 'm-pending' }]));
  });

  it('Accepted happy path — Save writes display_name + email + updated_at, NO role', async () => {
    const panel = await openSheet();
    panel.querySelector('[data-testid="member-edit-m-team"]').click();

    const form = panel.querySelector('[data-testid="member-edit-form-m-team"]');
    expect(form).toBeTruthy();
    // No role segment on accepted rows.
    expect(form.querySelector('[data-testid="member-edit-role-admin-m-team"]')).toBeFalsy();

    form.querySelector('[data-testid="member-edit-name-m-team"]').value = 'Renamed Team';
    form.querySelector('[data-testid="member-edit-email-m-team"]').value = 'renamed@x.com';

    await form.querySelector('[data-testid="member-edit-save-m-team"]').click();
    await new Promise(r => setTimeout(r, 20));

    expect(updateCalls.length).toBe(1);
    const call = updateCalls[0];
    expect(call.payload.display_name).toBe('Renamed Team');
    expect(call.payload.email).toBe('renamed@x.com');
    expect(call.payload).not.toHaveProperty('role');
    expect(call.payload.updated_at).toBeTruthy();
  });

  it('Validation failures block Save — empty name and bad email', async () => {
    const panel = await openSheet();
    panel.querySelector('[data-testid="member-edit-m-team"]').click();
    const form = panel.querySelector('[data-testid="member-edit-form-m-team"]');

    // Empty name
    form.querySelector('[data-testid="member-edit-name-m-team"]').value = '';
    form.querySelector('[data-testid="member-edit-email-m-team"]').value = 'still-valid@x.com';
    await form.querySelector('[data-testid="member-edit-save-m-team"]').click();
    await new Promise(r => setTimeout(r, 10));
    const statusEl = form.querySelector('[data-testid="member-edit-status-m-team"]');
    expect(statusEl.textContent).toBe('Display name is required');
    expect(updateCalls.length).toBe(0);

    // Bad email (no @)
    form.querySelector('[data-testid="member-edit-name-m-team"]').value = 'Name OK';
    form.querySelector('[data-testid="member-edit-email-m-team"]').value = 'not-an-email';
    await form.querySelector('[data-testid="member-edit-save-m-team"]').click();
    await new Promise(r => setTimeout(r, 10));
    expect(statusEl.textContent).toBe('Enter a valid email address');
    expect(updateCalls.length).toBe(0);
  });

  it('Email collision — inline error, no update call', async () => {
    // Queue the collision pre-check to return an "existing" row.
    collisionReturns.push([{ id: 'm-other' }]);

    const panel = await openSheet();
    panel.querySelector('[data-testid="member-edit-m-team"]').click();
    const form = panel.querySelector('[data-testid="member-edit-form-m-team"]');
    form.querySelector('[data-testid="member-edit-name-m-team"]').value = 'Team';
    form.querySelector('[data-testid="member-edit-email-m-team"]').value = 'owner@x.com';

    await form.querySelector('[data-testid="member-edit-save-m-team"]').click();
    await new Promise(r => setTimeout(r, 20));

    const statusEl = form.querySelector('[data-testid="member-edit-status-m-team"]');
    expect(statusEl.textContent).toBe('This email is already used by another member');
    expect(updateCalls.length).toBe(0);
  });

  it('Toggle behavior: clicking Edit again on an open form closes it', async () => {
    const panel = await openSheet();
    panel.querySelector('[data-testid="member-edit-m-team"]').click();
    expect(panel.querySelector('[data-testid="member-edit-form-m-team"]')).toBeTruthy();
    panel.querySelector('[data-testid="member-edit-m-team"]').click();
    expect(panel.querySelector('[data-testid="member-edit-form-m-team"]')).toBeFalsy();
  });
});
