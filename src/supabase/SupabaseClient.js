import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../config/private-supabase.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
console.log('✅ Supabase credentials loaded from private-supabase.js');

// Quick test to confirm connection:
(async () => {
  try {
    const { data, error, status } = await supabase
      .from('rune.player_profiles_view')
      .select('username')
      .limit(1);

    if (error) console.error('⚠️ Supabase test query failed:', error.message);
    else console.log(`✅ Supabase connected — status ${status}`);
  } catch (err) {
    console.error('❌ Supabase test failed:', err);
  }
})();
