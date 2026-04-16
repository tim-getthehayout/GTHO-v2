/**
 * @file Invite claim logic — CP-66.
 * Handles both token-based (shareable link) and email-based (v1 parity) claim paths.
 */

import { supabase } from '../../data/supabase-client.js';
import { logger } from '../../utils/logger.js';

/**
 * Extract an invite token from the current URL hash.
 * Pattern: #invite={uuid}
 * @returns {string|null}
 */
export function extractInviteToken() {
  const hash = window.location.hash || '';
  const match = hash.match(/^#invite=([0-9a-f-]{36})$/i);
  return match ? match[1] : null;
}

/**
 * Clear the invite hash from the URL without triggering a navigation.
 */
export function clearInviteHash() {
  if (window.location.hash.startsWith('#invite=')) {
    history.replaceState(null, '', window.location.pathname);
  }
}

/**
 * Claim an invite by token (primary path — shareable link).
 * @param {string} token
 * @param {string} userId
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function claimInviteByToken(token, userId) {
  if (!supabase) return { success: false, error: 'Supabase not configured' };

  try {
    const { error } = await supabase.rpc('claim_invite_by_token', {
      p_token: token,
      p_user_id: userId,
    });

    if (error) {
      logger.error('invite', 'claim_invite_by_token failed', { error: error.message });
      return { success: false, error: error.message };
    }

    // Verify the claim succeeded by checking if the user now has a membership
    const { data } = await supabase
      .from('operation_members')
      .select('operation_id')
      .eq('user_id', userId)
      .limit(1);

    if (data && data.length > 0) {
      logger.info('invite', 'invite claimed by token', { userId });
      return { success: true };
    }

    // Token was invalid or already claimed
    return { success: false, error: 'invalid_token' };
  } catch (err) {
    logger.error('invite', 'claim exception', { error: err.message });
    return { success: false, error: err.message };
  }
}

/**
 * Claim a pending invite by email match (v1 parity fallback).
 * Called after sign-in when user has no operation.
 * @param {string} email
 * @param {string} userId
 * @returns {Promise<boolean>} true if an invite was claimed
 */
export async function claimPendingInviteByEmail(email, userId) {
  if (!supabase || !email) return false;

  try {
    const { error } = await supabase.rpc('claim_pending_invite', {
      p_email: email,
      p_user_id: userId,
    });

    if (error) {
      logger.warn('invite', 'claim_pending_invite failed', { error: error.message });
      return false;
    }

    // Check if we now have a membership
    const { data } = await supabase
      .from('operation_members')
      .select('operation_id')
      .eq('user_id', userId)
      .limit(1);

    if (data && data.length > 0) {
      logger.info('invite', 'invite claimed by email', { email });
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Check if the current user already has a membership in any operation.
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
export async function userHasOperation(userId) {
  if (!supabase) return false;
  const { data } = await supabase
    .from('operation_members')
    .select('operation_id')
    .eq('user_id', userId)
    .limit(1);
  return (data && data.length > 0);
}

/**
 * Get the operation name for a token (for welcome message).
 * @param {string} token
 * @returns {Promise<string|null>}
 */
export async function getOperationNameForToken(token) {
  if (!supabase) return null;
  const { data } = await supabase
    .from('operation_members')
    .select('operation_id')
    .eq('invite_token', token)
    .single();
  if (!data) return null;
  const { data: op } = await supabase
    .from('operations')
    .select('name')
    .eq('id', data.operation_id)
    .single();
  return op?.name || null;
}
