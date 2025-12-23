import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../config/private-supabase.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
console.log('✅ Supabase credentials loaded from private-supabase.js');

(async () => {
  try {
    console.log('🔎 Testing Supabase connection to public.player_profiles_view');
    const { data, error, status } = await supabase
      .from('player_profiles_view')
      .select('username')
      .limit(1);

    if (error) console.error('⚠️ Supabase test query failed:', error.message);
    else console.log(`✅ Supabase connected — status ${status}`);
  } catch (err) {
    console.error('❌ Supabase connection test failed:', err);
  }
})();
