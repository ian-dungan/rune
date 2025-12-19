// Rune-Like (polished world + UI)
const SUPABASE_URL = "https://depvgmvmqapfxjwkkhas.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlcHZnbXZtcWFwZnhqd2traGFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5NzkzNzgsImV4cCI6MjA4MDU1NTM3OH0.WLkWVbp86aVDnrWRMb-y4gHmEOs9sRpTwvT8hTmqHC0";

const RUNE_SCHEMA = "rune";
const DEFAULT_WORLD_SLUG = "lobby";
const FAKE_EMAIL_DOMAIN = "users.rune.local";

import { Game } from "./game.js";
import { showToast, nowISO, safeUsername, usernameToEmail } from "./util.js";

const $ = (id) => document.getElementById(id);

const screenAuth = $("screenAuth");
const screenGame = $("screenGame");

const tabLogin = $("tabLogin");
const tabSignup = $("tabSignup");
const btnPrimary = $("btnPrimary");
const btnGuest = $("btnGuest");
const btnLogout = $("btnLogout");

const authUsername = $("authUsername");
const authPassword = $("authPassword");
const signupExtras = $("signupExtras");
const charName = $("charName");
const styleGrid = $("styleGrid");
const authMsg = $("authMsg");

const chatLog = $("chatLog");
const chatInput = $("chatInput");
const chatSend = $("chatSend");
const worldPill = $("worldPill");

const hpBar = $("hpBar");
const stamBar = $("stamBar");
const whereText = $("whereText");
const fpsText = $("fpsText");
const btnZoomIn = $("btnZoomIn");
const btnZoomOut = $("btnZoomOut");
const btnCenter = $("btnCenter");
const panelMinimap = $("panelMinimap");
const invGrid = $("invGrid");

let mode = "login";
let supabase = null;
let session = null;
let game = null;

let selectedStyle = 0;
const STYLE_PRESETS = [
  { hair:"#2b1b0a", skin:"#d9b48a", shirt:"#2a88ff", pants:"#23435f" },
  { hair:"#0a0a0a", skin:"#c9966b", shirt:"#53d18a", pants:"#2b2f3a" },
  { hair:"#6a3b14", skin:"#f0c9a4", shirt:"#d6b35f", pants:"#4a3a2b" },
  { hair:"#b9b9b9", skin:"#d4a57f", shirt:"#a85dff", pants:"#333b4a" },
  { hair:"#1b3c5a", skin:"#e0b18d", shirt:"#ff5a6a", pants:"#33425f" },
];

function setMsg(text, kind="") {
  authMsg.className = "msg " + (kind || "");
  authMsg.textContent = text || "";
}

function setMode(next) {
  mode = next;
  tabLogin.classList.toggle("active", mode==="login");
  tabSignup.classList.toggle("active", mode==="signup");
  signupExtras.classList.toggle("hidden", mode!=="signup");
  btnPrimary.textContent = mode==="login" ? "Login" : "Create Account";
  setMsg("");
}

function renderStyleGrid() {
  styleGrid.innerHTML = "";
  STYLE_PRESETS.forEach((s, i) => {
    const d = document.createElement("div");
    d.className = "styleCard" + (i===selectedStyle ? " selected" : "");
    const sw = document.createElement("div");
    sw.className = "styleSwatch";
    sw.style.background = `linear-gradient(135deg, ${s.hair}, ${s.shirt}, ${s.pants})`;
    d.appendChild(sw);
    d.onclick = () => { selectedStyle = i; renderStyleGrid(); };
    styleGrid.appendChild(d);
  });
}

function ensureInvGrid() {
  invGrid.innerHTML = "";
  for (let i=0;i<25;i++){
    const s = document.createElement("div");
    s.className = "invSlot";
    invGrid.appendChild(s);
  }
}

function appendChatLine({name, message, created_at}) {
  const line = document.createElement("div");
  line.className = "chatLine";
  const ts = created_at ? new Date(created_at).toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"}) : "";
  const esc = (v)=> (v??"").toString().replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
  line.innerHTML = `<span class="chatMeta">[${ts}]</span> <span class="chatName">${esc(name)}</span>: ${esc(message)}`;
  chatLog.appendChild(line);
  chatLog.scrollTop = chatLog.scrollHeight;
}

async function initSupabase() {
  if (!window.supabase) { setMsg("Supabase library failed to load.", "bad"); return; }
  supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const { data: { session: s0 } } = await supabase.auth.getSession();
  session = s0 || null;

  supabase.auth.onAuthStateChange((_event, newSession) => { session = newSession; });
}

async function getOrCreateLobbyWorld() {
  const q = supabase.schema(RUNE_SCHEMA).from("worlds");
  const { data: rows, error } = await q.select("id,slug,name").eq("slug", DEFAULT_WORLD_SLUG).limit(1);
  if (error) throw error;
  if (rows && rows.length) return rows[0];

  const { data: created, error: e2 } = await q.insert({ slug: DEFAULT_WORLD_SLUG, name: "Lobby", seed: 12345, settings: {} })
    .select("id,slug,name").single();
  if (e2) throw e2;
  return created;
}

async function fetchMyProfile(userId) {
  const { data, error } = await supabase.schema(RUNE_SCHEMA)
    .from("player_profiles")
    .select("id,user_id,username,settings,role,active_world_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function createMyProfile(userId, username, style) {
  const { data, error } = await supabase.schema(RUNE_SCHEMA)
    .from("player_profiles")
    .insert({ user_id: userId, username, settings: { style, created_at: nowISO() } })
    .select("id,user_id,username,settings,role,active_world_id")
    .single();
  if (error) throw error;
  return data;
}

async function resolveDisplayName(userId) {
  if (!game) return "Player";
  const cached = game.getNameCache(userId);
  if (cached) return cached;

  try {
    const { data, error } = await supabase.schema(RUNE_SCHEMA)
      .from("player_profiles")
      .select("username")
      .eq("user_id", userId)
      .maybeSingle();
    if (!error && data?.username) { game.setNameCache(userId, data.username); return data.username; }
  } catch {}
  const fallback = "Player-" + userId.slice(0,6);
  game.setNameCache(userId, fallback);
  return fallback;
}

async function loadRecentChat(worldId) {
  chatLog.innerHTML = "";
  const { data, error } = await supabase.schema(RUNE_SCHEMA)
    .from("chat_messages")
    .select("id,user_id,message,created_at")
    .eq("world_id", worldId)
    .order("created_at", { ascending: true })
    .limit(50);
  if (error) throw error;

  for (const m of (data || [])) {
    const name = await resolveDisplayName(m.user_id);
    appendChatLine({ name, message: m.message, created_at: m.created_at });
  }
}

function setupRealtimeBroadcast(worldId) {
  const chan = supabase.channel(`rune-chat:${worldId}`);
  chan.on("broadcast", { event: "chat" }, (payload) => {
    const msg = payload?.payload;
    if (!msg) return;
    appendChatLine({ name: msg.name || "Player", message: msg.message || "", created_at: msg.created_at || nowISO() });
  });
  chan.subscribe();
  return chan;
}

async function sendChat(worldId, myUserId, text, myName, chan) {
  const message = (text || "").trim();
  if (!message) return;

  await supabase.schema(RUNE_SCHEMA).from("chat_messages").insert({ world_id: worldId, user_id: myUserId, message });

  await chan.send({ type: "broadcast", event: "chat", payload: { name: myName, message, created_at: nowISO() } });
}

async function enterGame(offline=false) {
  screenAuth.classList.add("hidden");
  screenGame.classList.remove("hidden");

  ensureInvGrid();

  game = new Game({
    canvas: $("game"),
    minimap: $("minimap"),
    onStatus: (s) => (whereText.textContent = s),
    onFps: (fps) => (fpsText.textContent = `${fps.toFixed(0)} fps`)
  });

  btnZoomIn.onclick = () => game.zoomBy(1.15);
  btnZoomOut.onclick = () => game.zoomBy(1/1.15);
  btnCenter.onclick = () => game.centerCamera();
  window.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() === "m") panelMinimap.classList.toggle("hidden");
    if (e.key === "Enter") {
      if (document.activeElement === chatInput) chatSend.click();
      else chatInput.focus();
    }
  });

  if (offline || !supabase || !session?.user) {
    showToast("Offline mode. No saving / no multiplayer chat.");
    game.setPlayerMeta({ name: "OfflineHero", style: STYLE_PRESETS[selectedStyle] });
    game.start();
    return;
  }

  const userId = session.user.id;

  let profile = await fetchMyProfile(userId);
  if (!profile) showToast("No profile found for this account (create one via Create Account).");

  let lobby = null;
  try { lobby = await getOrCreateLobbyWorld(); }
  catch (e) {
    console.warn(e);
    showToast("Lobby missing. Create via SQL: insert into rune.worlds (slug,name,seed) values ('lobby','Lobby',12345) on conflict do nothing;");
  }

  worldPill.textContent = "World: " + (lobby?.name || "Lobby");

  hpBar.style.width = "76%";
  stamBar.style.width = "64%";

  const myName = profile?.username || "Player";
  const style = profile?.settings?.style || STYLE_PRESETS[0];
  game.setPlayerMeta({ name: myName, style });
  game.start();

  if (lobby?.id) {
    const worldId = lobby.id;
    try { await loadRecentChat(worldId); }
    catch (e) {
      console.warn(e);
      appendChatLine({ name:"System", message:"Chat history unavailable (RLS/policy).", created_at: nowISO() });
    }
    const chan = setupRealtimeBroadcast(worldId);

    chatSend.onclick = async () => {
      try {
        const text = chatInput.value;
        chatInput.value = "";
        await sendChat(worldId, userId, text, myName, chan);
      } catch (e) {
        console.warn(e);
        showToast("Chat send failed. Check RLS policies.");
      }
    };

    chatInput.addEventListener("keydown", (e) => { if (e.key === "Enter") chatSend.click(); });
  } else {
    appendChatLine({ name:"System", message:"No world configured. Create rune.worlds row with slug 'lobby'.", created_at: nowISO() });
  }
}

async function doLogin() {
  setMsg("");
  const u = safeUsername(authUsername.value);
  const p = authPassword.value;
  if (!u.ok) return setMsg(u.reason, "bad");
  if (!p || p.length < 6) return setMsg("Password must be 6+ characters.", "bad");

  const email = usernameToEmail(u.value, FAKE_EMAIL_DOMAIN);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: p });
  if (error) return setMsg(error.message || "Login failed.", "bad");
  session = data.session;
  setMsg("Logged in.", "good");
  await enterGame(false);
}

async function doSignup() {
  setMsg("");
  const u = safeUsername(authUsername.value);
  const p = authPassword.value;
  if (!u.ok) return setMsg(u.reason, "bad");
  if (!p || p.length < 6) return setMsg("Password must be 6+ characters.", "bad");

  const cname = (charName.value || u.value).trim().slice(0,16);
  if (!cname) return setMsg("Character name required.", "bad");

  const email = usernameToEmail(u.value, FAKE_EMAIL_DOMAIN);

  const { data, error } = await supabase.auth.signUp({ email, password: p });
  if (error) return setMsg(error.message || "Sign up failed.", "bad");

  session = data.session;
  if (!session?.user) {
    setMsg("Account created. Email confirmation is ON in Supabase — disable it for username-only auth.", "bad");
    return;
  }

  try {
    await createMyProfile(session.user.id, cname, STYLE_PRESETS[selectedStyle]);
  } catch (e) {
    const msg = (e?.message || "").toLowerCase();
    if (msg.includes("duplicate") || msg.includes("unique") || msg.includes("username")) {
      setMsg("That username is taken. Choose another.", "bad");
      await supabase.auth.signOut();
      return;
    }
    console.warn(e);
    setMsg("Profile creation failed (RLS/policy).", "bad");
    await supabase.auth.signOut();
    return;
  }

  setMsg("Account created. Entering game…", "good");
  await enterGame(false);
}

function wireUI() {
  tabLogin.onclick = () => setMode("login");
  tabSignup.onclick = () => setMode("signup");
  btnPrimary.onclick = async () => {
    if (!supabase) return setMsg("Supabase not ready yet.", "bad");
    if (mode === "login") await doLogin();
    else await doSignup();
  };

  btnGuest.onclick = () => enterGame(true);
  btnLogout.onclick = async () => { try { await supabase?.auth.signOut(); } catch {} location.reload(); };

  authPassword.addEventListener("keydown", (e) => { if (e.key === "Enter") btnPrimary.click(); });
}

(async function main(){
  renderStyleGrid();
  wireUI();
  setMode("login");

  await initSupabase();

  if (supabase) {
    const { data: { session: s } } = await supabase.auth.getSession();
    if (s?.user) { session = s; await enterGame(false); }
  }
})();
