import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

let SUPABASE_URL, SUPABASE_ANON_KEY;

try {
  const creds = await import('../../config/private-supabase.js');
  SUPABASE_URL = creds.SUPABASE_URL;
  SUPABASE_ANON_KEY = creds.SUPABASE_ANON_KEY;
  console.log('✅ Supabase credentials loaded from private-supabase.js');
} catch (err) {
  console.error('❌ Missing private-supabase.js in /config/. Please create it with your Supabase URL and anon key.');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
