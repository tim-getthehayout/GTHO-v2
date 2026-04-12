/** @file Session management — init, login, signup, logout via Supabase Auth */

import { supabase } from '../../data/supabase-client.js';
import { logger } from '../../utils/logger.js';

/** @type {import('@supabase/supabase-js').User|null} */
let currentUser = null;

/** @type {Set<Function>} */
const listeners = new Set();

/**
 * Get the current authenticated user.
 * @returns {import('@supabase/supabase-js').User|null}
 */
export function getUser() {
  return currentUser;
}

/**
 * Initialize session from existing Supabase session (page reload).
 * @returns {Promise<import('@supabase/supabase-js').User|null>}
 */
export async function initSession() {
  if (!supabase) return null;

  try {
    const { data: { session } } = await supabase.auth.getSession();
    currentUser = session?.user ?? null;
    return currentUser;
  } catch (err) {
    logger.error('auth', 'Failed to init session', { error: err.message });
    return null;
  }
}

/**
 * Log in with email and password.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{user: object|null, error: string|null}>}
 */
export async function login(email, password) {
  if (!supabase) {
    return { user: null, error: 'Supabase not configured' };
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    logger.warn('auth', 'Login failed', { error: error.message });
    return { user: null, error: error.message };
  }

  currentUser = data.user;
  notifyListeners();
  return { user: data.user, error: null };
}

/**
 * Sign up with email and password.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{user: object|null, error: string|null, needsConfirmation: boolean}>}
 */
export async function signup(email, password) {
  if (!supabase) {
    return { user: null, error: 'Supabase not configured', needsConfirmation: false };
  }

  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    logger.warn('auth', 'Signup failed', { error: error.message });
    return { user: null, error: error.message, needsConfirmation: false };
  }

  // Supabase may require email confirmation
  if (data.user && !data.session) {
    return { user: data.user, error: null, needsConfirmation: true };
  }

  currentUser = data.user;
  notifyListeners();
  return { user: data.user, error: null, needsConfirmation: false };
}

/**
 * Log out the current user.
 * @returns {Promise<void>}
 */
export async function logout() {
  if (supabase) {
    await supabase.auth.signOut();
  }
  currentUser = null;
  notifyListeners();
}

/**
 * Listen for auth state changes (login/logout).
 * @param {Function} callback - (user: User|null) => void
 * @returns {Function} unsubscribe
 */
export function onAuthChange(callback) {
  listeners.add(callback);

  // Also listen to Supabase auth state changes (token refresh, etc.)
  if (supabase) {
    supabase.auth.onAuthStateChange((_event, session) => {
      currentUser = session?.user ?? null;
      callback(currentUser);
    });
  }

  return () => listeners.delete(callback);
}

function notifyListeners() {
  for (const cb of listeners) {
    cb(currentUser);
  }
}
