/** @file Supabase client initialization from env vars */

import { createClient } from '@supabase/supabase-js';
import { installCleanRecoveryHash } from '../features/auth/recovery.js';

// Before createClient. auth-js initialize() parses window.location, and a
// recovery redirect whose redirectTo contained `#/change-password` hides
// access_token in a second hash. Repair that URL first so detectSessionInUrl
// can store the recovery session.
installCleanRecoveryHash();

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

/**
 * Supabase client instance. Will be null if env vars are not configured.
 * @type {import('@supabase/supabase-js').SupabaseClient | null}
 */
export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;
