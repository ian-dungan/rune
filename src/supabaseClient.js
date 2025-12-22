// Supabase client + helpers for Rune (username auth + profiles + chat)
// Uses Supabase Auth (email/password) under the hood by mapping username -> deterministic synthetic email.

const SUPABASE_URL = "https://depvgmvmqapfxjwkkhas.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlcHZnbXZtcWFwZnhqd2traGFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5NzkzNzgsImV4cCI6MjA4MDU1NTM3OH0.WLkWVbp86aVDnrWRMb-y4gHmEOs9sRpTwvT8hTmqHC0";

// Default world slug; can be overridden by setting window.RUNE_WORLD_SLUG before modules load.
const WORLD_SLUG = (typeof window !== 'undefined' && window.RUNE_WORLD_SLUG) ? String(window.RUNE_WORLD_SLUG) : 'lobby';

let supabase = null;
let _statusCb = null;

export async function initSupabase(statusCb){
  _statusCb = statusCb;
  const mod = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  supabase = mod.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  statusCb?.(true);
}

/** Normalize username for storage / uniqueness checks */
function normalizeUsername(username){
  return String(username || '').trim();
}

/**
 * Map username -> valid synthetic email local-part.
 * Must stay stable forever or older accounts won't be able to log in.
 */
function usernameToEmail(username){
  const u = normalizeUsername(username).toLowerCase();
  // allow letters, numbers, underscore in UI; but sanitize further for email
  // replace spaces with '.', drop other chars, collapse dots.
  const local = u
    .replace(/\s+/g, '.')
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/\.+/g, '.')
    .replace(/^\.|\.$/g, '');
  // Ensure non-empty and not too long for email local part (64 max)
  const safe = (local || 'user').slice(0, 48);
  return `${safe}@rune.local`;
}

/** Extract character fields from settings jsonb */
function unpackSettings(settings){
  const s = settings && typeof settings === 'object' ? settings : {};
  return {
    display_name: s.display_name || '',
    outfit: s.outfit || 'green',
  };
}

export const auth = {
  async getUser(){
    if(!supabase) return null;
    const { data } = await supabase.auth.getUser();
    return data?.user || null;
  },

  async signUpUsername(username, password){
    if(!supabase) return { ok:false, error:'supabase not ready' };

    const uname = normalizeUsername(username);
    // Your UI already enforces this, but keep server-side safety too.
    if(!/^[a-zA-Z0-9_]{3,16}$/.test(uname)) {
      return { ok:false, error:'Username must be 3–16 chars (letters/numbers/underscore).' };
    }
    if((password||'').length < 6) return { ok:false, error:'Password must be at least 6 characters.' };

    // Check username uniqueness via username_norm (lowercase)
    const unameNorm = uname.toLowerCase();
    const { data: exists, error: e1 } = await supabase
      .schema('rune')
      .from('player_profiles')
      .select('id')
      .eq('username_norm', unameNorm)
      .limit(1)
      .maybeSingle();

    if(e1 && !String(e1.message||'').includes('permission')) {
      // If RLS blocks this select, you'll see it here; surface message.
      // (But ideally you allow public select of username_norm only.)
      return { ok:false, error: e1.message };
    }
    if(exists) return { ok:false, error:'That username is taken.' };

    const email = usernameToEmail(uname);
    const { error } = await supabase.auth.signUp({ email, password });
    if(error) return { ok:false, error: error.message };

    // Create bare profile row for this user (RLS should allow insert for self)
    const me = await this.getUser();
    if(!me) return { ok:false, error:'No session after sign up.' };

    const { error: perr } = await supabase
      .schema('rune')
      .from('player_profiles')
      .insert({ user_id: me.id, username: uname })
      .select('id')
      .maybeSingle();

    // Duplicate errors are OK (race condition)
    if(perr && !String(perr.message||'').toLowerCase().includes('duplicate')) {
      return { ok:false, error: perr.message };
    }

    return { ok:true };
  },

  async signInUsername(username, password){
    if(!supabase) return { ok:false, error:'supabase not ready' };

    const uname = normalizeUsername(username);
    if(!/^[a-zA-Z0-9_]{3,16}$/.test(uname)) {
      return { ok:false, error:'Username must be 3–16 chars (letters/numbers/underscore).' };
    }
    const email = usernameToEmail(uname);

    try{
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if(error) return { ok:false, error: error.message };
      return { ok:true };
    }catch(e){
      return { ok:false, error: String(e?.message || e) };
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
      .select('id,user_id,username,settings,role,active_world_id,muted_until,mute_reason,created_at')
      .eq('user_id', me.id)
      .maybeSingle();

    if(error) {
      console.warn('[profiles] getMyProfile error', error);
      return null;
    }
    if(!data) return null;

    const extra = unpackSettings(data.settings);
    return { ...data, ...extra };
  },

  async createOrUpdateMyProfile({ display_name, outfit }){
    const me = await auth.getUser();
    if(!me) return { ok:false, error:'Not logged in' };

    // Load existing settings so we merge rather than overwrite.
    const current = await this.getMyProfile();
    const mergedSettings = {
      ...(current?.settings && typeof current.settings === 'object' ? current.settings : {}),
      display_name: String(display_name || '').trim(),
      outfit: String(outfit || 'green'),
    };

    const { error } = await supabase
      .schema('rune')
      .from('player_profiles')
      .upsert(
        { user_id: me.id, settings: mergedSettings },
        { onConflict: 'user_id' }
      );

    if(error) return { ok:false, error: error.message };
    return { ok:true };
  }
};

export const chat = (() => {
  let _onMessage = null;
  let _sub = null;
  let _worldId = null;

  async function getWorldId(){
    if(_worldId) return _worldId;
    const { data, error } = await supabase
      .schema('rune')
      .from('worlds')
      .select('id,slug,name')
      .eq('slug', WORLD_SLUG)
      .limit(1)
      .maybeSingle();

    if(error) {
      console.warn('[chat] could not load world', error);
      return null;
    }
    _worldId = data?.id || null;
    if(!_worldId) console.warn(`[chat] No world configured. Create rune.worlds row with slug '${WORLD_SLUG}'.`);
    return _worldId;
  }

  return {
    onMessage(fn){ _onMessage = fn; },

    async bootstrap(){
      if(!supabase) return { ok:false, error:'supabase not ready' };

      const wid = await getWorldId();
      if(!wid) return { ok:false, error:`No world '${WORLD_SLUG}'` };

      // Load recent messages
      const { data, error } = await supabase
        .schema('rune')
        .from('chat_messages')
        .select('id,message,created_at,user_id,world_id')
        .eq('world_id', wid)
        .order('created_at', { ascending: true })
        .limit(50);

      if(error) return { ok:false, error: error.message };

      // Hydrate usernames (simple)
      const userIds = Array.from(new Set((data||[]).map(m=>m.user_id).filter(Boolean)));
      let nameById = {};
      if(userIds.length){
        const { data: profs } = await supabase
          .schema('rune')
          .from('player_profiles')
          .select('user_id,username,settings')
          .in('user_id', userIds);
        (profs||[]).forEach(p=>{
          const extra = unpackSettings(p.settings);
          nameById[p.user_id] = extra.display_name || p.username || 'player';
        });
      }

      (data||[]).forEach(m=>{
        _onMessage?.({ ...m, username: nameById[m.user_id] || 'player' });
      });

      // Realtime
      try{ _sub?.unsubscribe?.(); } catch {}
      _sub = supabase
        .channel('rune_chat')
        .on('postgres_changes', { event: 'INSERT', schema: 'rune', table: 'chat_messages', filter: `world_id=eq.${wid}` }, async (payload) => {
          const m = payload.new;
          // get sender name
          let username = 'player';
          const { data: p } = await supabase
            .schema('rune')
            .from('player_profiles')
            .select('username,settings')
            .eq('user_id', m.user_id)
            .maybeSingle();
          if(p){
            const extra = unpackSettings(p.settings);
            username = extra.display_name || p.username || username;
          }
          _onMessage?.({ ...m, username });
        })
        .subscribe();

      return { ok:true };
    },

    async send(message){
      if(!supabase) return { ok:false, error:'supabase not ready' };
      const me = await auth.getUser();
      if(!me) return { ok:false, error:'Not logged in' };

      const wid = await getWorldId();
      if(!wid) return { ok:false, error:`No world '${WORLD_SLUG}'` };

      const msg = String(message||'').trim();
      if(!msg) return { ok:false, error:'Empty message' };
      if(msg.length > 200) return { ok:false, error:'Too long (200 max)' };

      const { error } = await supabase
        .schema('rune')
        .from('chat_messages')
        .insert({ world_id: wid, user_id: me.id, message: msg });

      if(error) return { ok:false, error: error.message };
      return { ok:true };
    }
  };
})();
