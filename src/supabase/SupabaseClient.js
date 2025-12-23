import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export let supabase = null;

/**
 * Loads Supabase credentials from (in priority order):
 *  1) ./config/private-supabase.js (recommended; not committed)
 *     - export const SUPABASE_URL = '...'
 *     - export const SUPABASE_ANON_KEY = '...'
 *     OR export default { url, anonKey }
 *  2) window.SUPABASE_URL / window.SUPABASE_ANON_KEY
 */
export const supabaseReady = (async () => {
  let url = '';
  let anonKey = '';

  // Try local config file (kept out of git)
  try {
    const mod = await import('../../config/private-supabase.js');
    // Support both named exports and default export patterns
    url = mod.SUPABASE_URL || mod.url || mod.default?.SUPABASE_URL || mod.default?.url || mod.default?.SUPABASE?.url || '';
    anonKey = mod.SUPABASE_ANON_KEY || mod.anonKey || mod.default?.SUPABASE_ANON_KEY || mod.default?.anonKey || mod.default?.SUPABASE?.anonKey || '';
  } catch (e) {
    // no-op; fall back to window globals
  }

  // Fallback: window globals (useful for GH Pages with secrets injected at build-time)
  url = url || window.SUPABASE_URL || '';
  anonKey = anonKey || window.SUPABASE_ANON_KEY || '';

  if (!url || !anonKey || anonKey.includes('...') || anonKey === 'YOUR_SUPABASE_ANON_KEY') {
    console.warn('[Supabase] Missing/placeholder credentials. Add config/private-supabase.js with SUPABASE_URL and SUPABASE_ANON_KEY.');
  }

  // If url is missing, still create a client to avoid hard-crash; calls will fail with a clear console error.
  supabase = createClient(url || 'https://example.supabase.co', anonKey || 'missing_anon_key');
  return supabase;
})();
