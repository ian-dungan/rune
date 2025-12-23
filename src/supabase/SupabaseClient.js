// SupabaseClient.js
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

let SUPABASE_URL, SUPABASE_ANON_KEY;

try {
  const creds = await import('../../config/private-supabase.js');
  SUPABASE_URL = creds.SUPABASE_URL;
  SUPABASE_ANON_KEY = creds.SUPABASE_ANON_KEY;
  console.log('✅ Supabase credentials loaded from private-supabase.js');
} catch (err) {
  console.error('❌ Missing private-supabase.js in /config/. Please create it.');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Test query — rune schema only
(async () => {
  try {
    const { data, error } = await supabase
      .from('rune_player_profiles')
      .select('username')
      .limit(1);

    if (error) {
      console.warn('⚠️ Supabase test query failed:', error.message);
    } else {
      console.log(`✅ Supabase connected — found: ${data?.[0]?.username || 'no players yet'}`);
    }
  } catch (err) {
    console.error('❌ Supabase connection test failed:', err);
  }
})();
