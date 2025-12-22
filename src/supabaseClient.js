
const SUPABASE_URL = "https://depvgmvmqapfxjwkkhas.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlcHZnbXZtcWFwZnhqd2traGFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5NzkzNzgsImV4cCI6MjA4MDU1NTM3OH0.WLkWVbp86aVDnrWRMb-y4gHmEOs9sRpTwvT8hTmqHC0";

let supabase = null;
let _statusCb = null;

export async function initSupabase(statusCb){
  _statusCb = statusCb;
  // Supabase JS (CDN ESM)
  const mod = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  supabase = mod.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  statusCb?.(true);
}

function normalizeUsername(raw){
  return String(raw || '').trim();
}

function usernameToEmail(username){
  // Supabase Auth requires email; we synthesize one deterministically from a sanitized username.
  const u = normalizeUsername(username).toLowerCase();
  // allow letters/numbers plus . _ -
  const local = u.replace(/\s+/g,'.').replace(/[^a-z0-9._-]/g,'').replace(/^\.+/,'').replace(/\.+$/,'');
  if(!local) throw new Error('Invalid username.');
  return `${local}@rune.local`;
}


export const auth = {
  async getUser(){
    if(!supabase) return null;
    const { data } = await supabase.auth.getUser();
    return data?.user || null;
  },
  
async signUpUsername(username, password){
  if(!supabase) return {ok:false, error:'supabase not ready'};
  const usernameClean = normalizeUsername(username);
  if(usernameClean.length < 3) return {ok:false, error:'Username must be at least 3 characters.'};
  if(usernameClean.length > 20) return {ok:false, error:'Username must be 20 characters or less.'};

  let email;
  try{
    email = usernameToEmail(usernameClean);
  }catch(e){
    return {ok:false, error:'Username contains invalid characters.'};
  }

  // Ensure unique username in rune.player_profiles
  const exists = await supabase
    .schema('rune')
    .from('player_profiles')
    .select('id')
    .eq('username_norm', usernameClean.toLowerCase())
    .limit(1)
    .maybeSingle();

  if(exists.data) return {ok:false, error:'That username is taken.'};

  const { error } = await supabase.auth.signUp({ email, password });
  if(error) return {ok:false, error:error.message};

  // Create profile row immediately (best-effort).
  const me = await auth.getUser();
  if(me){
    const { error: perr } = await supabase
      .schema('rune')
      .from('player_profiles')
      .insert({ user_id: me.id, username: usernameClean })
      .select('id')
      .maybeSingle();

    if(perr && !String(perr.message||'').toLowerCase().includes('duplicate')) {
      return {ok:false, error: perr.message};
    }
  }

  return {ok:true};
},
  },
  
async signInUsername(username, password){
  if(!supabase) return {ok:false, error:'supabase not ready'};
  try{
    const email = usernameToEmail(username);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if(error) return {ok:false, error:error.message};
    return {ok:true};
  }catch(e){
    return {ok:false, error: String(e?.message || e)};
  }
},
  async signOut(){
    if(!supabase) return;
    await supabase.auth.signOut();
  }
};

export const profiles = {
  async getMyProfile(){
    const me = await auth.getUser();
    if(!me) return null;
    const { data, error } = await supabase
      .schema('rune')
      .from('player_profiles')
      .select('id,user_id,username,display_name,outfit,settings')
      .eq('user_id', me.id)
      .maybeSingle();
    if(error) return null;
    return data || null;
  },
  async createOrUpdateMyProfile(payload){
    const me = await auth.getUser();
    if(!me) return {ok:false, error:'not logged in'};
    const { error } = await supabase
      .schema('rune')
      .from('player_profiles')
      .upsert({
        user_id: me.id,
        display_name: payload.display_name,
        outfit: payload.outfit
      }, { onConflict: 'user_id' });
    if(error) return {ok:false, error:error.message};
    return {ok:true};
  }
};

export const chat = (() => {
  const callbacks = new Set();
  let channel = null;

  function emit(m){ callbacks.forEach(cb=>cb(m)); }

  return {
    onMessage(cb){ callbacks.add(cb); return ()=>callbacks.delete(cb); },

    async bootstrap(){
      if(!supabase) return;
      const me = await auth.getUser();
      if(!me) return;

      // Load last 50
      const prof = await profiles.getMyProfile();
      const { data } = await supabase
        .schema('rune')
        .from('chat_messages')
        .select('id,message,created_at,user_id')
        .order('created_at', { ascending: true })
        .limit(50);

      (data||[]).forEach(row=>{
        emit({ username: prof?.username || 'player', message: row.message, created_at: row.created_at });
      });

      // Realtime
      if(channel) supabase.removeChannel(channel);
      channel = supabase.channel('rune-chat')
        .on('postgres_changes', { event: 'INSERT', schema: 'rune', table: 'chat_messages' }, async (payload) => {
          const row = payload.new;
          // Try to resolve username (fast path: if it's us)
          let username = 'player';
          if(row.user_id === me.id){
            username = (await profiles.getMyProfile())?.username || 'you';
          } else {
            // lightweight lookup
            const { data: p } = await supabase.schema('rune').from('player_profiles')
              .select('username').eq('user_id', row.user_id).maybeSingle();
            username = p?.username || 'player';
          }
          emit({ username, message: row.message, created_at: row.created_at });
        })
        .subscribe();
    },

    async send(message){
      if(!supabase) return {ok:false, error:'supabase not ready'};
      const me = await auth.getUser();
      if(!me) return {ok:false, error:'not logged in'};
      const { error } = await supabase
        .schema('rune')
        .from('chat_messages')
        .insert({ user_id: me.id, message });
      if(error) return {ok:false, error:error.message};
      return {ok:true};
    }
  };
})();
