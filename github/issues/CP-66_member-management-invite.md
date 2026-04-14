# CP-66: Member Management & Invite Link

## Summary

V2 has the `operation_members` schema (§1.4) and a reference to "member management" in V2_UX_FLOWS.md §20.1, but no designed UX flow, no invite mechanism, and no build checkpoint. V1 had a working invite system (`sbInviteMember` + OTP email + `claim_pending_invite` RPC). V2 replaces the email-based invite with a **shareable link** — admin copies a URL and sends it however they want (text, email, etc.). No email service required.

**Why this matters:** Without this, there's no way for an owner/admin to add team members to their operation. Every user would have to create their own isolated operation.

## Schema Addition

**New column on `operation_members`:**

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| invite_token | uuid | NULL, UNIQUE | Generated on invite creation. Nulled on acceptance. Used in shareable link. |

```sql
ALTER TABLE operation_members
  ADD COLUMN invite_token uuid UNIQUE;
```

**Why a separate token (not the row `id`):** The `id` is an FK target used throughout the app (adjusted_by, created_by, todo_assignments). Exposing it in a URL is unnecessary. `invite_token` is single-use, nulled after acceptance, and can be regenerated if the admin wants a fresh link.

**CP-55/CP-56 impact:** `invite_token` is NULL for accepted members and only populated for pending invites. Export should include it for pending rows (so a restore preserves outstanding invites). Import should handle missing `invite_token` on older backups (default NULL — no action needed, naturally safe).

## New Supabase RPC

```sql
-- SECURITY DEFINER: runs with elevated privileges so the invitee
-- (who has no operation_members row yet) can claim their invite.
CREATE OR REPLACE FUNCTION claim_invite_by_token(p_token uuid, p_user_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE operation_members
  SET user_id = p_user_id,
      accepted_at = now(),
      invite_token = NULL,
      updated_at = now()
  WHERE invite_token = p_token
    AND user_id IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

This mirrors v1's `claim_pending_invite` but uses token-based lookup instead of email matching.

## UX Flow: Member Management (V2_UX_FLOWS.md §20.3)

### 20.3.1 Entry Point

Settings → Section 2 (Operation) → "Members" row → tap opens Member Management sheet.

**Visibility:** Admin and owner only. Team members see a read-only member count chip ("3 members") but cannot tap into management.

### 20.3.2 Member List

Full-height sheet showing all operation members, ordered: owner first, then admins, then team members, then pending invites (sorted by `invited_at` ascending).

Each row shows:

| State | Row content |
|-------|-------------|
| Accepted member | Display name, role badge (owner/admin/team_member), "you" badge if current user |
| Pending invite | Email address, role badge, "pending" badge (⏳), time since invited |

**Actions per row (admin/owner only):**

| Action | When shown | What it does |
|--------|-----------|-------------|
| Change role | Accepted non-owner members | Tap role badge → dropdown: admin / team_member. Owner role cannot be assigned or removed here. |
| Remove | Accepted non-owner, non-self members | Confirmation dialog → deletes `operation_members` row. Member loses all access. |
| Copy link | Pending invites | Copies invite URL to clipboard. Toast: "Link copied." |
| Regenerate link | Pending invites | Generates new `invite_token`, invalidates old link. Confirmation: "This will invalidate the previous link." |
| Cancel invite | Pending invites | Confirmation → deletes pending row. |

**Owner protection:** The owner row has no action buttons. An operation must always have exactly one owner.

### 20.3.3 Invite Creation

**Trigger:** "Invite member" button at bottom of member list sheet (admin/owner only).

**Inline form (expands in-place, no separate sheet):**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Display name | text input | Yes | Pre-populates the member row. Invitee can change later. |
| Email | email input | Yes | For display in pending list. Not used for sending. |
| Role | segment control | Yes | Two options: "Admin" / "Team Member". Default: Team Member. |

**On "Create Invite" tap:**

1. Validate inputs (name non-empty, email format valid).
2. Insert `operation_members` row: `operation_id`, `display_name`, `email`, `role`, `invited_at = now()`, `invite_token = crypto.randomUUID()`, `user_id = NULL`.
3. Generate invite URL: `{app_base_url}/#invite={invite_token}`
4. Auto-copy URL to clipboard.
5. Show success state with the link displayed and a "Copy link" button.
6. Toast: "Invite created. Link copied to clipboard."
7. Member list re-renders with new pending row.

### 20.3.4 Invite Acceptance (Invitee's Experience)

**URL pattern:** `{app_base_url}/#invite={token}`

**Flow:**

1. App loads, router detects `#invite={token}` hash parameter.
2. **If not signed in:** App shows sign-in/sign-up screen with context banner: "You've been invited to join an operation. Sign in or create an account to continue."
3. **After sign-in (or if already signed in):** App calls `claim_invite_by_token(token, auth.uid())` RPC.
4. **Success:** Token is valid, row claimed → user_id set, accepted_at set, invite_token nulled. App loads the operation. Toast: "Welcome to {operation_name}!"
5. **Already claimed:** Token doesn't match any pending row → show message: "This invite link has already been used or was cancelled." CTA: "Go to your operation" (if they have one) or "Create a new operation."
6. **Edge case — user already a member:** If the signed-in user already has an accepted row for this operation, show: "You're already a member of {operation_name}." Navigate to dashboard.
7. Clear the `#invite=` hash from the URL after processing (clean URL state).

### 20.3.5 Post-Sign-In Check (v1 Parity)

V1 also checked for pending invites by email match after every sign-in (`sbPostSignInCheck`). V2 should keep this as a fallback: after sign-in, if the user has no operation, call `claim_pending_invite` (email-based match, same as v1) before falling through to the "create new operation" bootstrap. This handles the case where someone signs up with the invited email but doesn't use the link.

**Two claim paths (belt and suspenders):**
- **Link-based:** `claim_invite_by_token(token, user_id)` — primary path, triggered by invite URL.
- **Email-based:** `claim_pending_invite(email, user_id)` — fallback, triggered on any sign-in when user has no operation. Same as v1.

## Acceptance Criteria

- [ ] `invite_token` column added to `operation_members` via migration SQL
- [ ] `claim_invite_by_token` Supabase RPC created (SECURITY DEFINER)
- [ ] `claim_pending_invite` Supabase RPC ported from v1 (email-based fallback)
- [ ] Member Management sheet accessible from Settings → Operation → Members (admin/owner only)
- [ ] Member list renders accepted members and pending invites with correct badges and ordering
- [ ] Admin can create an invite: form validates, row inserted, link auto-copied to clipboard
- [ ] Admin can copy link, regenerate link, and cancel invite for pending rows
- [ ] Admin can change role (admin ↔ team_member) for accepted non-owner members
- [ ] Admin can remove accepted non-owner, non-self members with confirmation
- [ ] Owner row is protected (no action buttons)
- [ ] Team members see read-only member count, cannot access management sheet
- [ ] Router detects `#invite={token}` and triggers acceptance flow
- [ ] Unauthenticated invitee sees sign-in prompt with invite context banner
- [ ] Authenticated invitee's invite is claimed (user_id, accepted_at set, token nulled)
- [ ] Invalid/expired/used token shows appropriate message with recovery CTA
- [ ] Already-a-member edge case handled gracefully
- [ ] Hash cleared from URL after invite processing
- [ ] Email-based fallback claim runs on sign-in (v1 parity)
- [ ] All user-facing strings use `t()` (i18n)
- [ ] No `innerHTML` — all dynamic content via DOM builder

## Test Plan

- [ ] Unit: `operation-members` entity — `invite_token` field in FIELDS, shape round-trip includes token
- [ ] Unit: invite URL generation produces correct format
- [ ] Unit: claim RPC sets user_id, accepted_at, nulls token
- [ ] Unit: claim RPC no-ops for already-claimed or missing token
- [ ] Unit: email-based fallback claim matches correctly
- [ ] Integration: full invite → accept flow (create invite, open link in new session, sign in, verify membership)
- [ ] Integration: regenerate link invalidates old token, new token works
- [ ] Integration: cancel invite removes row, old link shows error
- [ ] Integration: role change persists to Supabase
- [ ] Integration: remove member deletes row, removed user loses access on next load
- [ ] E2E: admin creates invite, copies link, new user opens link, signs up, lands in operation

## Related OIs

- OI-0047 (new — member management UX flow missing from V2_UX_FLOWS.md)

## Notes

**V1 comparison:** V1 used `signInWithOtp({ email })` to send a Supabase magic link email. This worked but required Supabase email configuration and meant the admin had to know the invitee's email before they had an account. The shareable link approach is simpler (no email infra), more flexible (admin can send via any channel), and aligns with how ranch teams actually communicate (text/WhatsApp > email).

**Schema impact:** The `invite_token` column is the only schema addition. It's nullable, so existing rows are unaffected. The column is NULL for all accepted members and only populated for pending invites.

**Build phase:** This belongs in Phase 3.5 (Polish) as CP-66, after CP-63 (Onboarding polish) since the invite flow touches onboarding-adjacent concerns (first sign-in, operation discovery). Could also be prioritized earlier if multi-user testing is needed sooner.

**RLS consideration:** The `claim_invite_by_token` function must be SECURITY DEFINER because the invitee has no `operation_members` row yet (and therefore no RLS access to update the table). The function validates by token match + user_id IS NULL, preventing any abuse.

**Future enhancement:** Email-based invites (Supabase sends branded email) can be added later as an optional "also email this invite" toggle. The shareable link remains the primary mechanism.
