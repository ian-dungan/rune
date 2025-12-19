// Rune-like Web Game Starter
// Hosting: GitHub Pages
// Backend: Supabase (free tier)
//
// 1) Set SUPABASE_URL and SUPABASE_ANON_KEY
// 2) Run the SQL in the README section below (see bottom of this file)
// 3) In Supabase Auth settings, add your GitHub Pages URL to Site URL + Redirect URLs
//
// Supabase docs:
// - Installing supabase-js: https://supabase.com/docs/reference/javascript/installing
// - Sign in with password: https://supabase.com/docs/reference/javascript/auth-signinwithpassword
// - Realtime broadcast: https://supabase.com/docs/guides/realtime/broadcast

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://depvgmvmqapfxjwkkhas.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlcHZnbXZtcWFwZnhqd2traGFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5NzkzNzgsImV4cCI6MjA4MDU1NTM3OH0.WLkWVbp86aVDnrWRMb-y4gHmEOs9sRpTwvT8hTmqHC0";

// ---- UI refs
const viewAuth = document.querySelector("#viewAuth");
const viewCharacter = document.querySelector("#viewCharacter");
const viewGame = document.querySelector("#viewGame");

const statusPill = document.querySelector("#statusPill");
const btnSignOut = document.querySelector("#btnSignOut");

const authUsername = document.querySelector("#authUsername");
const authPassword = document.querySelector("#authPassword");
const btnLogin = document.querySelector("#btnLogin");
const btnSignup = document.querySelector("#btnSignup");
const authError = document.querySelector("#authError");

const charName = document.querySelector("#charName");
const charColor = document.querySelector("#charColor");
const btnCreateCharacter = document.querySelector("#btnCreateCharacter");
const btnBackToAuth = document.querySelector("#btnBackToAuth");
const charError = document.querySelector("#charError");

const whoami = document.querySelector("#whoami");
const chatLog = document.querySelector("#chatLog");
const chatForm = document.querySelector("#chatForm");
const chatInput = document.querySelector("#chatInput");
const btnReconnectChat = document.querySelector("#btnReconnectChat");

const canvas = document.querySelector("#gameCanvas");
const ctx = canvas.getContext("2d");

// ---- State
let supabase = null;
let session = null;
let profile = null;

// Rune game namespace
const RUNE_SCHEMA = "rune";
const DEFAULT_WORLD_SLUG = "lobby";
let currentWorld = null; // {id, slug, name}

let chatChannel = null;
let chatConnected = false;

function setStatus(ok, text){
  statusPill.textContent = text;
  statusPill.classList.toggle("ok", !!ok);
}

function show(el){
  el.hidden = false;
}
function hide(el){
  el.hidden = true;
}

function setError(el, msg){
  el.textContent = msg;
  el.hidden = !msg;
}

function normalizeUsername(raw){
  const u = (raw ?? "").trim();
  // 3-16 chars, letters/numbers/underscore. (Simple + Rune-like.)
  if(!/^[A-Za-z0-9_]{3,16}$/.test(u)) return null;
  return u;
}

function usernameToEmail(username){
  // Supabase Auth requires an email identifier for password auth.
  // We map usernames to a deterministic "email alias" so users log in with username only.
  return `${username.toLowerCase()}@users.rune.local`;
}

function isConfigured(){
  return SUPABASE_URL.startsWith("http") && SUPABASE_ANON_KEY.length > 50;
}

function safeText(s){
  // Basic HTML escaping to prevent chat injection
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function formatTime(ts){
  try{
    const d = new Date(ts);
    return d.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"});
  }catch{
    return "";
  }
}

// ---- Auth + Profile
async function initSupabase(){
  if(!isConfigured()){
    setStatus(false, "Configure Supabase");
    return;
  }
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Restore existing session quickly
  const { data } = await supabase.auth.getSession();
  session = data.session ?? null;

  supabase.auth.onAuthStateChange((_event, newSession) => {
    session = newSession;
    // Re-evaluate screens when auth changes
    route().catch(console.error);
  });

  await route();
}

async function route(){
  setError(authError, "");
  setError(charError, "");

  btnSignOut.hidden = !session;

  if(!supabase){
    hide(viewCharacter); hide(viewGame); show(viewAuth);
    return;
  }

  if(!session){
    setStatus(false, "Signed out");
    hide(viewCharacter); hide(viewGame); show(viewAuth);
    await disconnectChat();
    return;
  }

  setStatus(true, "Signed in");

  // Load profile
  const userId = session.user.id;
  const { data: prof, error } = await supabase
    .schema(RUNE_SCHEMA).from("player_profiles")
    .select("id, user_id, username, settings")
    .eq("user_id", userId)
    .maybeSingle();

  if(error){
    console.error(error);
    setError(authError, "Profile load error: " + error.message);
    hide(viewCharacter); hide(viewGame); show(viewAuth);
    return;
  }

  profile = prof ?? null;
  const lookObj = profile?.settings?.look ?? null;
  if(profile) profile.look = lookObj;

  if(!profile || !lookObj || !lookObj.name){
    // Character creation required
    hide(viewAuth); hide(viewGame); show(viewCharacter);
    whoami.textContent = "";
    await disconnectChat();
    return;
  }

  // Game
  hide(viewAuth); hide(viewCharacter); show(viewGame);

  // Ensure we have a world context for chat/game data
  try{
    if(!currentWorld) await loadDefaultWorld();
  }catch(e){
    appendSystem(String(e.message ?? e));
  }

  whoami.textContent = `You are: ${profile.username} (${profile.look?.name ?? 'no character'})`;
  startRenderer();
  await connectChat();
}

// ---- Buttons
btnLogin.addEventListener("click", async () => {
  setError(authError, "");
  if(!isConfigured()){
    setError(authError, "Open app.js and set SUPABASE_URL and SUPABASE_ANON_KEY.");
    return;
  }

  const username = normalizeUsername(authUsername.value);
  const password = authPassword.value;

  if(!username || !password){
    setError(authError, "Username and password required.");
    return;
  }

  const email = usernameToEmail(username);

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if(error){
    setError(authError, error.message);
    return;
  }

  // route() will run via auth state change
});

btnSignup.addEventListener("click", async () => {
  setError(authError, "");
  if(!isConfigured()){
    setError(authError, "Open app.js and set SUPABASE_URL and SUPABASE_ANON_KEY.");
    return;
  }

  const username = normalizeUsername(authUsername.value);
  const password = authPassword.value;

  if(!username || !password){
    setError(authError, "Username and password required. Username: 3–16 letters/numbers/_");
    return;
  }

  const email = usernameToEmail(username);

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { username } }
  });

  if(error){
    setError(authError, error.message);
    return;
  }

  // For a "username-only" experience, turn OFF email confirmations in Supabase Auth settings.
  // If confirmations are ON, data.session may be null here.
  if(!data.session){
    setError(authError, "Account created, but email confirmations are enabled. Disable confirmations in Supabase Auth → Providers → Email, then try logging in.");
    return;
  }

  // Create a base profile row (enforces unique username at DB level too)
  const ins = await supabase.schema(RUNE_SCHEMA).from("player_profiles").insert({
    id: data.user.id,
    username,
    look: {}
  });

  if(ins.error){
    // Very rare if races happen; sign out so user can try again cleanly
    await supabase.auth.signOut();
    setError(authError, "That username is taken. Please choose another.");
    return;
  }

  // route() will take the user to character creation
});
btnSignOut.addEventListener("click", async () => {
  if(!supabase) return;
  await supabase.auth.signOut();
});

btnBackToAuth.addEventListener("click", async () => {
  // Sign out and back
  if(supabase) await supabase.auth.signOut();
});

btnCreateCharacter.addEventListener("click", async () => {
  setError(charError, "");
  if(!session) return;

  const raw = charName.value.trim();
  const charDisplayName = raw.replace(/\s+/g, " ");
  const ok = /^[A-Za-z0-9_ ]{3,20}$/.test(charDisplayName);

  if(!ok){
    setError(charError, "Name must be 3–20 chars, using letters/numbers/spaces/_ only.");
    return;
  }

  const username = profile?.username ?? session.user.user_metadata?.username ?? "Player";

  const look = {
    name: charDisplayName,
    color: charColor.value
  };

  // Upsert profile tied to auth uid
  const { error } = await supabase
    .schema(RUNE_SCHEMA).from("player_profiles")
    .upsert({ user_id: session.user.id, username, settings: { look } }, { onConflict: "user_id" });
if(error){
    setError(charError, error.message);
    return;
  }

  await route();
});


async function loadDefaultWorld(){
  if(!supabase) return null;
  const { data, error } = await supabase
    .schema(RUNE_SCHEMA)
    .from("worlds")
    .select("id, slug, name")
    .eq("slug", DEFAULT_WORLD_SLUG)
    .maybeSingle();

  if(error){
    console.error(error);
    throw new Error("World load error: " + error.message);
  }
  if(!data){
    throw new Error(`No Rune world found with slug "${DEFAULT_WORLD_SLUG}". Create one row in rune.worlds (slug, name, seed).`);
  }
  currentWorld = data;
  return currentWorld;
}

// ---- Chat (Realtime Broadcast)
async function connectChat(){
  if(!supabase || !session || !profile) return;

  try{
    if(!currentWorld) await loadDefaultWorld();
  }catch(e){
    appendSystem(String(e.message ?? e));
    return;
  }

  await disconnectChat();

  // We use Broadcast for realtime delivery (simple + fast),
  // and we ALSO write to rune.chat_messages for persistence/mod tools.
  chatChannel = supabase.channel(`chat:${DEFAULT_WORLD_SLUG}`, {
    config: { broadcast: { self: true } }
  });

  chatChannel.on("broadcast", { event: "message" }, ({ payload }) => {
    appendChat(payload);
  });

  chatChannel.subscribe((status) => {
    chatConnected = status === "SUBSCRIBED";
    btnReconnectChat.title = chatConnected ? "Realtime connected" : "Reconnect realtime";
  });

  // Load recent chat history (best-effort)
  try{
    const { data, error } = await supabase
      .schema(RUNE_SCHEMA)
      .from("chat_messages")
      .select("id, user_id, message, created_at")
      .eq("world_id", currentWorld.id)
      .order("created_at", { ascending: true })
      .limit(50);

    if(error) throw error;
    if(data && data.length){
      appendSystem(`Loaded ${data.length} recent messages.`);
      for(const row of data){
        const shortId = String(row.user_id).slice(0, 6);
        const name = (row.user_id === session.user.id) ? profile.username : `Player-${shortId}`;
        appendChat({ username: name, text: row.message, ts: row.created_at });
      }
    }
  }catch(e){
    console.warn(e);
  }

  btnReconnectChat.disabled = false;
}

async function disconnectChat(){
  chatConnected = false;
  if(chatChannel && supabase){
    try{ await supabase.removeChannel(chatChannel); }catch(e){ console.warn(e); }
  }
  chatChannel = null;
}

btnReconnectChat.addEventListener("click", async () => {
  btnReconnectChat.disabled = true;
  await connectChat();
  btnReconnectChat.disabled = false;
});

chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if(!text) return;
  if(!chatChannel || !session || !profile) return;
  if(!currentWorld){
    appendSystem("No world loaded; chat is unavailable.");
    return;
  }

  chatInput.value = "";

  // 1) Persist to DB (rune.chat_messages)
  const { error: insErr } = await supabase
    .schema(RUNE_SCHEMA)
    .from("chat_messages")
    .insert({
      world_id: currentWorld.id,
      user_id: session.user.id,
      message: text
    });

  if(insErr){
    appendSystem(`Send failed: ${insErr.message}`);
    return;
  }

  // 2) Broadcast realtime payload for instant delivery (includes username)
  const payload = {
    id: crypto.randomUUID(),
    userId: session.user.id,
    username: profile.username,
    text,
    ts: new Date().toISOString()
  };

  const { error: bcErr } = await chatChannel.send({
    type: "broadcast",
    event: "message",
    payload
  });

  if(bcErr){
    // DB write succeeded; realtime delivery failed
    appendSystem(`Realtime delivery failed: ${bcErr.message}`);
  }
});

function appendSystem(text){
  appendChat({ username: "System", text, ts: new Date().toISOString(), system: true });
}

function appendChat(msg){
  // Keep the log lightweight
  const max = 200;
  while(chatLog.children.length > max) chatLog.removeChild(chatLog.firstChild);

  const div = document.createElement("div");
  div.className = "msg";

  const meta = document.createElement("div");
  meta.className = "meta";
  const name = msg.system ? "System" : (msg.username ?? "Unknown");
  meta.innerHTML = `<span><b>${safeText(name)}</b></span><span>${safeText(formatTime(msg.ts))}</span>`;

  const text = document.createElement("div");
  text.className = "text";
  text.innerHTML = safeText(msg.text ?? "");

  div.appendChild(meta);
  div.appendChild(text);
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
}

// ---- Minimal 2D renderer (Rune-like vibe, placeholder art)
let raf = 0;
let t0 = 0;

function startRenderer(){
  if(raf) return;
  t0 = performance.now();
  raf = requestAnimationFrame(loop);
}
function stopRenderer(){
  if(raf) cancelAnimationFrame(raf);
  raf = 0;
}

function loop(now){
  const dt = Math.min(0.05, (now - t0) / 1000);
  t0 = now;

  draw(now, dt);

  raf = requestAnimationFrame(loop);
}

function draw(now, dt){
  const w = canvas.width;
  const h = canvas.height;

  // Background
  ctx.clearRect(0, 0, w, h);

  // Tile grid
  const tile = 32;
  for(let y=0; y<h; y+=tile){
    for(let x=0; x<w; x+=tile){
      const n = (Math.sin((x+y)*0.08) + Math.sin((x-now*0.02)*0.05)) * 0.5;
      const g = 70 + Math.floor((n+1)*20);
      ctx.fillStyle = `rgb(20, ${g}, 40)`;
      ctx.fillRect(x, y, tile, tile);
      // subtle edge
      ctx.strokeStyle = "rgba(0,0,0,.18)";
      ctx.strokeRect(x, y, tile, tile);
    }
  }

  // Player
  const color = profile?.look?.color ?? "#3aa3ff";
  const px = w*0.5;
  const py = h*0.58;

  // Shadow
  ctx.fillStyle = "rgba(0,0,0,.35)";
  ctx.beginPath();
  ctx.ellipse(px, py+18, 16, 6, 0, 0, Math.PI*2);
  ctx.fill();

  // Body (simple)
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(px-14, py-26, 28, 44, 10);
  ctx.fill();

  // Head
  ctx.fillStyle = "rgb(235, 212, 182)";
  ctx.beginPath();
  ctx.arc(px, py-36, 12, 0, Math.PI*2);
  ctx.fill();

  // Nameplate
  ctx.font = "14px ui-sans-serif, system-ui";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(0,0,0,.55)";
  ctx.fillText(profile?.username ?? "", px+1, py-56+1);
  ctx.fillStyle = "white";
  ctx.fillText(profile?.username ?? "", px, py-56);

  // Tiny instruction
  ctx.textAlign = "left";
  ctx.font = "13px ui-sans-serif, system-ui";
  ctx.fillStyle = "rgba(255,255,255,.85)";
  ctx.fillText("Starter: auth + character create + realtime chat. Next: movement, map, inventory, combat.", 14, 22);
}

// Stop renderer if we leave game view
const mo = new MutationObserver(() => {
  if(viewGame.hidden) stopRenderer();
  else startRenderer();
});
mo.observe(viewGame, { attributes:true, attributeFilter:["hidden"] });

// ---- Kick off
initSupabase().catch((e) => {
  console.error(e);
  setError(authError, String(e?.message ?? e));
  setStatus(false, "Init error");
});

/*
===========================
SUPABASE SQL (run once)
========================

This starter expects your RuneScape-like game tables to live in the `rune` schema:

- rune.worlds
- rune.player_profiles
- rune.chat_messages

Use the Rune-only migration we built in chat (recommended). If you want the minimum needed for this starter, here it is:

create schema if not exists rune;

-- Worlds (create at least one row for the default chat world)
create table if not exists rune.worlds (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  seed bigint not null,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

insert into rune.worlds (slug, name, seed)
values ('lobby', 'Lobby', 12345)
on conflict (slug) do nothing;

-- Player profile (1:1 with auth user)
create table if not exists rune.player_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  username text,
  username_norm text generated always as (lower(username)) stored,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists rune_player_profiles_username_norm_uq
  on rune.player_profiles (username_norm);

alter table rune.player_profiles enable row level security;

create policy "rune_profiles_read_own"
on rune.player_profiles for select to authenticated
using (user_id = auth.uid());

create policy "rune_profiles_insert_own"
on rune.player_profiles for insert to authenticated
with check (user_id = auth.uid());

create policy "rune_profiles_update_own"
on rune.player_profiles for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- Chat persistence
create table if not exists rune.chat_messages (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references rune.worlds(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  message text not null check (char_length(message) between 1 and 200),
  created_at timestamptz not null default now()
);

create index if not exists rune_chat_messages_world_created_idx
  on rune.chat_messages (world_id, created_at desc);

alter table rune.chat_messages enable row level security;

create policy "rune_chat_read"
on rune.chat_messages for select to authenticated
using (true);

create policy "rune_chat_insert"
on rune.chat_messages for insert to authenticated
with check (user_id = auth.uid());

*/
