/**
 * @file Member management sheet — CP-66.
 * V2_UX_FLOWS.md §20.7 / CP-66 spec.
 * Member list, invite creation, role change, remove, copy/regenerate/cancel.
 */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { Sheet } from '../../ui/sheet.js';
import { supabase } from '../../data/supabase-client.js';
import { getUser } from '../auth/session.js';
import { logger } from '../../utils/logger.js';

let memberSheet = null;

/**
 * Open the member management sheet.
 * @param {string} operationId
 */
export async function openMemberManagementSheet(operationId) {
  if (!memberSheet) {
    memberSheet = new Sheet('member-mgmt-sheet-wrap');
  }

  const panel = document.getElementById('member-mgmt-sheet-panel');
  if (!panel) return;
  clear(panel);

  panel.appendChild(el('h2', { className: 'wizard-step-title' }, [t('members.title')]));
  panel.appendChild(el('div', { 'data-testid': 'member-list-loading' }, [t('members.loading')]));

  memberSheet.open();

  await renderMemberList(panel, operationId);
}

/**
 * Render the member list.
 */
async function renderMemberList(panel, operationId) {
  clear(panel);
  panel.appendChild(el('h2', { className: 'wizard-step-title' }, [t('members.title')]));

  const user = getUser();
  const userId = user?.id;

  // Fetch members from Supabase
  let members = [];
  if (supabase) {
    const { data, error } = await supabase
      .from('operation_members')
      .select('*')
      .eq('operation_id', operationId)
      .order('role', { ascending: true });
    if (error) {
      logger.error('members', 'Failed to load members', { error: error.message });
      panel.appendChild(el('p', { className: 'auth-error' }, [t('members.loadError')]));
      return;
    }
    members = data || [];
  }

  // Sort: owner first, then admin, then team_member, then pending (no user_id)
  const roleOrder = { owner: 0, admin: 1, team_member: 2 };
  members.sort((a, b) => {
    const aAccepted = a.user_id != null;
    const bAccepted = b.user_id != null;
    if (aAccepted && !bAccepted) return -1;
    if (!aAccepted && bAccepted) return 1;
    if (!aAccepted && !bAccepted) {
      return new Date(a.invited_at || 0) - new Date(b.invited_at || 0);
    }
    return (roleOrder[a.role] ?? 9) - (roleOrder[b.role] ?? 9);
  });

  // Determine if current user is admin/owner
  const currentMember = members.find(m => m.user_id === userId);
  const isAdminOrOwner = currentMember && (currentMember.role === 'owner' || currentMember.role === 'admin');

  // Render member rows
  const listEl = el('div', { className: 'member-list', 'data-testid': 'member-list' });

  for (const member of members) {
    const isPending = member.user_id == null;
    const isOwner = member.role === 'owner';
    const isSelf = member.user_id === userId;

    const badges = [];
    badges.push(el('span', { className: `badge badge-${roleBadgeColor(member.role)}` }, [member.role]));
    if (isSelf) badges.push(el('span', { className: 'badge badge-teal' }, [t('members.you')]));
    if (isPending) badges.push(el('span', { className: 'badge badge-amber' }, [t('members.pending')]));

    const nameText = isPending ? (member.email || member.display_name) : (member.display_name || member.email);
    const detailText = isPending
      ? t('members.invitedAgo', { time: timeSince(member.invited_at) })
      : member.email;

    const actions = [];
    if (isAdminOrOwner && !isOwner) {
      if (isPending) {
        // OI-0120: Edit | Copy | Regenerate | Cancel.
        actions.push(el('button', {
          className: 'btn btn-outline btn-xs',
          'data-testid': `member-edit-${member.id}`,
          onClick: () => showEditForm(member, operationId, panel, { isPending: true }),
        }, [t('members.edit')]));
        actions.push(el('button', {
          className: 'btn btn-outline btn-xs',
          'data-testid': `member-copy-link-${member.id}`,
          onClick: () => copyInviteLink(member.invite_token),
        }, [t('members.copyLink')]));
        actions.push(el('button', {
          className: 'btn btn-outline btn-xs',
          'data-testid': `member-regen-${member.id}`,
          onClick: () => regenerateLink(member, operationId, panel),
        }, [t('members.regenerate')]));
        actions.push(el('button', {
          className: 'btn btn-red btn-xs',
          'data-testid': `member-cancel-${member.id}`,
          onClick: () => cancelInvite(member, operationId, panel),
        }, [t('members.cancelInvite')]));
      } else {
        if (!isSelf) {
          // OI-0120: Role Select | Edit | Remove.
          actions.push(renderRoleSelect(member, operationId, panel));
          actions.push(el('button', {
            className: 'btn btn-outline btn-xs',
            'data-testid': `member-edit-${member.id}`,
            onClick: () => showEditForm(member, operationId, panel, { isPending: false }),
          }, [t('members.edit')]));
          actions.push(el('button', {
            className: 'btn btn-red btn-xs',
            'data-testid': `member-remove-${member.id}`,
            onClick: () => removeMember(member, operationId, panel),
          }, [t('members.remove')]));
        }
      }
    }

    listEl.appendChild(el('div', {
      className: 'member-row',
      'data-testid': `member-row-${member.id}`,
    }, [
      el('div', { className: 'member-row-info' }, [
        el('div', { className: 'member-row-name' }, [nameText]),
        el('div', { className: 'member-row-detail' }, [detailText]),
        el('div', { className: 'member-row-badges' }, badges),
      ]),
      actions.length > 0 ? el('div', { className: 'member-row-actions' }, actions) : null,
    ].filter(Boolean)));
  }

  panel.appendChild(listEl);

  // Invite button (admin/owner only)
  if (isAdminOrOwner) {
    panel.appendChild(el('button', {
      className: 'btn btn-green btn-sm',
      style: { marginTop: 'var(--space-4)' },
      'data-testid': 'member-invite-btn',
      onClick: () => showInviteForm(panel, operationId),
    }, [t('members.inviteMember')]));
  }

  // Close button
  panel.appendChild(el('button', {
    className: 'btn btn-outline btn-sm',
    style: { marginTop: 'var(--space-3)' },
    onClick: () => memberSheet.close(),
  }, [t('action.done')]));
}

// ── Invite creation form ─────────────────────────────────────────────

function showInviteForm(panel, operationId) {
  // Remove existing form if any
  const existing = panel.querySelector('[data-testid="member-invite-form"]');
  if (existing) existing.remove();

  const inputs = {};
  const form = el('div', {
    className: 'card',
    style: { marginTop: 'var(--space-4)', padding: 'var(--space-4)' },
    'data-testid': 'member-invite-form',
  }, [
    el('h3', { style: { marginBottom: 'var(--space-3)' } }, [t('members.inviteMember')]),
    el('label', { className: 'form-label' }, [t('members.displayName')]),
    inputs.name = el('input', {
      type: 'text', className: 'auth-input', placeholder: t('members.displayName'),
      'data-testid': 'member-invite-name',
    }),
    el('label', { className: 'form-label' }, [t('members.email')]),
    inputs.email = el('input', {
      type: 'email', className: 'auth-input', placeholder: t('members.email'),
      'data-testid': 'member-invite-email',
    }),
    el('label', { className: 'form-label' }, [t('members.role')]),
    el('div', { className: 'btn-row' }, [
      inputs.roleAdmin = el('button', {
        className: 'btn btn-outline btn-xs',
        'data-testid': 'member-invite-role-admin',
        onClick: () => {
          inputs.roleAdmin.className = 'btn btn-green btn-xs';
          inputs.roleTeam.className = 'btn btn-outline btn-xs';
          inputs._role = 'admin';
        },
      }, [t('members.roleAdmin')]),
      inputs.roleTeam = el('button', {
        className: 'btn btn-green btn-xs',
        'data-testid': 'member-invite-role-team',
        onClick: () => {
          inputs.roleTeam.className = 'btn btn-green btn-xs';
          inputs.roleAdmin.className = 'btn btn-outline btn-xs';
          inputs._role = 'team_member';
        },
      }, [t('members.roleTeamMember')]),
    ]),
  ]);

  inputs._role = 'team_member'; // default

  const statusEl = el('div', { className: 'auth-error', 'data-testid': 'member-invite-status' });
  form.appendChild(statusEl);

  form.appendChild(el('div', { className: 'btn-row', style: { marginTop: 'var(--space-3)' } }, [
    el('button', {
      className: 'btn btn-green btn-sm',
      'data-testid': 'member-invite-create',
      onClick: () => createInvite(inputs, operationId, panel, statusEl),
    }, [t('members.createInvite')]),
    el('button', {
      className: 'btn btn-outline btn-sm',
      onClick: () => form.remove(),
    }, [t('action.cancel')]),
  ]));

  // Insert before the close button
  const inviteBtn = panel.querySelector('[data-testid="member-invite-btn"]');
  if (inviteBtn) {
    inviteBtn.before(form);
    inviteBtn.style.display = 'none';
  } else {
    panel.appendChild(form);
  }
}

async function createInvite(inputs, operationId, panel, statusEl) {
  clear(statusEl);
  const name = inputs.name.value.trim();
  const email = inputs.email.value.trim();
  const role = inputs._role;

  if (!name) { statusEl.appendChild(el('span', {}, [t('members.nameRequired')])); return; }
  if (!email || !email.includes('@')) { statusEl.appendChild(el('span', {}, [t('members.emailInvalid')])); return; }

  const inviteToken = crypto.randomUUID();
  const now = new Date().toISOString();

  if (!supabase) return;

  const { error } = await supabase
    .from('operation_members')
    .insert({
      operation_id: operationId,
      display_name: name,
      email,
      role,
      invite_token: inviteToken,
      invited_at: now,
      user_id: null,
      created_at: now,
      updated_at: now,
    });

  if (error) {
    logger.error('members', 'Failed to create invite', { error: error.message });
    statusEl.appendChild(el('span', {}, [error.message]));
    return;
  }

  // Copy link to clipboard
  const link = generateInviteUrl(inviteToken);
  await copyToClipboard(link);

  showToast(t('members.inviteCreated'));
  logger.info('members', 'invite created', { operationId, email, role });

  // Re-render member list
  await renderMemberList(panel, operationId);
}

// ── Edit form (OI-0120) ─────────────────────────────────────────────

/**
 * Show the inline edit form beneath a member row. Handles both pending
 * invites (display_name + email + role) and accepted members
 * (display_name + email only — role stays on the existing row select).
 *
 * @param {object} member
 * @param {string} operationId
 * @param {HTMLElement} panel
 * @param {object} opts
 * @param {boolean} opts.isPending
 */
function showEditForm(member, operationId, panel, opts) {
  // Toggle: if the form is already open for this member, close it.
  const existing = panel.querySelector(`[data-testid="member-edit-form-${member.id}"]`);
  if (existing) { existing.remove(); return; }

  const inputs = {};
  inputs._role = member.role || 'team_member';

  const children = [
    el('h3', { style: { marginBottom: 'var(--space-3)' } }, [
      opts.isPending ? t('members.editPending') : t('members.editTitle'),
    ]),
    el('label', { className: 'form-label' }, [t('members.displayName')]),
    inputs.name = el('input', {
      type: 'text', className: 'auth-input',
      value: member.display_name || '',
      'data-testid': `member-edit-name-${member.id}`,
    }),
    el('label', { className: 'form-label' }, [t('members.email')]),
    inputs.email = el('input', {
      type: 'email', className: 'auth-input',
      value: member.email || '',
      'data-testid': `member-edit-email-${member.id}`,
    }),
  ];

  if (opts.isPending) {
    const roleChildren = [];
    inputs.roleAdmin = el('button', {
      className: inputs._role === 'admin' ? 'btn btn-green btn-xs' : 'btn btn-outline btn-xs',
      'data-testid': `member-edit-role-admin-${member.id}`,
      onClick: () => {
        inputs.roleAdmin.className = 'btn btn-green btn-xs';
        inputs.roleTeam.className = 'btn btn-outline btn-xs';
        inputs._role = 'admin';
      },
    }, [t('members.roleAdmin')]);
    inputs.roleTeam = el('button', {
      className: inputs._role === 'team_member' ? 'btn btn-green btn-xs' : 'btn btn-outline btn-xs',
      'data-testid': `member-edit-role-team-${member.id}`,
      onClick: () => {
        inputs.roleTeam.className = 'btn btn-green btn-xs';
        inputs.roleAdmin.className = 'btn btn-outline btn-xs';
        inputs._role = 'team_member';
      },
    }, [t('members.roleTeamMember')]);
    roleChildren.push(inputs.roleAdmin, inputs.roleTeam);
    children.push(
      el('label', { className: 'form-label' }, [t('members.role')]),
      el('div', { className: 'btn-row' }, roleChildren),
    );
  }

  const statusEl = el('div', {
    className: 'auth-error',
    'data-testid': `member-edit-status-${member.id}`,
  });
  children.push(statusEl);

  children.push(el('div', { className: 'btn-row', style: { marginTop: 'var(--space-3)' } }, [
    el('button', {
      className: 'btn btn-green btn-sm',
      'data-testid': `member-edit-save-${member.id}`,
      onClick: () => editMember(member, operationId, panel, inputs, statusEl, opts),
    }, [t('members.saveChanges')]),
    el('button', {
      className: 'btn btn-outline btn-sm',
      'data-testid': `member-edit-cancel-${member.id}`,
      onClick: () => form.remove(),
    }, [t('action.cancel')]),
  ]));

  const form = el('div', {
    className: 'card',
    style: { marginTop: 'var(--space-2)', marginBottom: 'var(--space-3)', padding: 'var(--space-4)' },
    'data-testid': `member-edit-form-${member.id}`,
  }, children);

  // Insert directly after the member row.
  const row = panel.querySelector(`[data-testid="member-row-${member.id}"]`);
  if (row && row.parentNode) {
    row.parentNode.insertBefore(form, row.nextSibling);
  } else {
    panel.appendChild(form);
  }
}

/**
 * Validate + persist the edit. Client-side email collision check
 * (no `(operation_id, email)` UNIQUE constraint exists on
 * `operation_members` — verified via pg_constraint 2026-04-20).
 */
async function editMember(member, operationId, panel, inputs, statusEl, opts) {
  clear(statusEl);
  const name = inputs.name.value.trim();
  const email = inputs.email.value.trim();

  if (!name) { statusEl.appendChild(el('span', {}, [t('members.nameRequired')])); return; }
  if (!email || !email.includes('@')) { statusEl.appendChild(el('span', {}, [t('members.emailInvalid')])); return; }

  if (!supabase) return;

  // Email collision check — only needed when the email changed.
  if (email !== (member.email || '')) {
    const { data: existing, error: checkError } = await supabase
      .from('operation_members')
      .select('id')
      .eq('operation_id', operationId)
      .eq('email', email)
      .neq('id', member.id);
    if (checkError) {
      logger.error('members', 'Failed to check email collision', { error: checkError.message });
      statusEl.appendChild(el('span', {}, [checkError.message]));
      return;
    }
    if (existing && existing.length > 0) {
      statusEl.appendChild(el('span', {}, [t('members.emailInUse')]));
      return;
    }
  }

  const updates = {
    display_name: name,
    email,
    updated_at: new Date().toISOString(),
  };
  if (opts.isPending) updates.role = inputs._role;

  const { error } = await supabase
    .from('operation_members')
    .update(updates)
    .eq('id', member.id);

  if (error) {
    logger.error('members', 'Failed to edit member', { error: error.message });
    // If the DB does acquire a unique constraint in a future migration, its
    // 23505 error code surfaces here; map to the friendly message.
    const msg = /duplicate key|unique/i.test(error.message) ? t('members.emailInUse') : error.message;
    statusEl.appendChild(el('span', {}, [msg]));
    return;
  }

  showToast(t('members.changesSaved'));
  logger.info('members', 'member edited', { operationId, memberId: member.id });
  await renderMemberList(panel, operationId);
}

// ── Actions ──────────────────────────────────────────────────────────

function renderRoleSelect(member, operationId, panel) {
  const select = el('select', {
    className: 'auth-select',
    style: { maxWidth: '120px', fontSize: '12px' },
    'data-testid': `member-role-${member.id}`,
    onChange: async () => {
      if (!supabase) return;
      const { error } = await supabase
        .from('operation_members')
        .update({ role: select.value, updated_at: new Date().toISOString() })
        .eq('id', member.id);
      if (error) {
        logger.error('members', 'Failed to change role', { error: error.message });
        return;
      }
      showToast(t('members.roleChanged'));
      await renderMemberList(panel, operationId);
    },
  }, [
    el('option', { value: 'admin', ...(member.role === 'admin' ? { selected: 'selected' } : {}) }, [t('members.roleAdmin')]),
    el('option', { value: 'team_member', ...(member.role === 'team_member' ? { selected: 'selected' } : {}) }, [t('members.roleTeamMember')]),
  ]);
  return select;
}

async function removeMember(member, operationId, panel) {
  if (!window.confirm(t('members.removeConfirm', { name: member.display_name }))) return;
  if (!supabase) return;

  const { error } = await supabase.from('operation_members').delete().eq('id', member.id);
  if (error) {
    logger.error('members', 'Failed to remove member', { error: error.message });
    return;
  }
  showToast(t('members.removed'));
  await renderMemberList(panel, operationId);
}

async function cancelInvite(member, operationId, panel) {
  if (!window.confirm(t('members.cancelInviteConfirm'))) return;
  if (!supabase) return;

  const { error } = await supabase.from('operation_members').delete().eq('id', member.id);
  if (error) {
    logger.error('members', 'Failed to cancel invite', { error: error.message });
    return;
  }
  showToast(t('members.inviteCancelled'));
  await renderMemberList(panel, operationId);
}

async function regenerateLink(member, operationId, panel) {
  if (!window.confirm(t('members.regenerateConfirm'))) return;
  if (!supabase) return;

  const newToken = crypto.randomUUID();
  const { error } = await supabase
    .from('operation_members')
    .update({ invite_token: newToken, updated_at: new Date().toISOString() })
    .eq('id', member.id);

  if (error) {
    logger.error('members', 'Failed to regenerate link', { error: error.message });
    return;
  }

  await copyToClipboard(generateInviteUrl(newToken));
  showToast(t('members.linkRegenerated'));
  await renderMemberList(panel, operationId);
}

function copyInviteLink(token) {
  if (!token) return;
  copyToClipboard(generateInviteUrl(token));
  showToast(t('members.linkCopied'));
}

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Generate the invite URL from a token.
 * @param {string} token
 * @returns {string}
 */
export function generateInviteUrl(token) {
  const base = window.location.origin + window.location.pathname;
  return `${base}#invite=${token}`;
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // fallback: no-op, toast still shows
  }
}

function roleBadgeColor(role) {
  if (role === 'owner') return 'teal';
  if (role === 'admin') return 'green';
  return 'outline';
}

function timeSince(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function showToast(message) {
  const existing = document.querySelector('[data-testid="member-toast"]');
  if (existing) existing.remove();
  const toast = el('div', { className: 'export-toast', 'data-testid': 'member-toast' }, [message]);
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

/**
 * Get the member count for the current operation (for read-only display).
 * @param {string} operationId
 * @returns {Promise<number>}
 */
export async function getMemberCount(operationId) {
  if (!supabase) return 0;
  const { count, error } = await supabase
    .from('operation_members')
    .select('*', { count: 'exact', head: true })
    .eq('operation_id', operationId);
  if (error) return 0;
  return count || 0;
}

/**
 * Get the current user's role in the operation.
 * @param {string} operationId
 * @returns {Promise<string|null>}
 */
export async function getCurrentUserRole(operationId) {
  if (!supabase) return null;
  const user = getUser();
  if (!user) return null;
  const { data } = await supabase
    .from('operation_members')
    .select('role')
    .eq('operation_id', operationId)
    .eq('user_id', user.id)
    .single();
  return data?.role || null;
}

/**
 * Render the sheet wrapper markup (needs to exist in DOM).
 * @returns {HTMLElement}
 */
export function renderMemberSheetMarkup() {
  return el('div', { id: 'member-mgmt-sheet-wrap', className: 'sheet-wrap' }, [
    el('div', { className: 'sheet-backdrop' }),
    el('div', { className: 'sheet-panel', id: 'member-mgmt-sheet-panel' }),
  ]);
}
