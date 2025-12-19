// Rune-Like top-down sprite build
const SUPABASE_URL = "https://depvgmvmqapfxjwkkhas.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlcHZnbXZtcWFwZnhqd2traGFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5NzkzNzgsImV4cCI6MjA4MDU1NTM3OH0.WLkWVbp86aVDnrWRMb-y4gHmEOs9sRpTwvT8hTmqHC0";
const RUNE_SCHEMA = "rune";
const DEFAULT_WORLD_SLUG = "lobby";
const FAKE_EMAIL_DOMAIN = "users.rune.local";

import { Game } from "./game.js";
import { showToast, nowISO, safeUsername, usernameToEmail } from "./util.js";

const $=(id)=>document.getElementById(id);
const screenAuth=$("screenAuth"), screenGame=$("screenGame");
const tabLogin=$("tabLogin"), tabSignup=$("tabSignup");
const btnPrimary=$("btnPrimary"), btnGuest=$("btnGuest"), btnLogout=$("btnLogout");
const authUsername=$("authUsername"), authPassword=$("authPassword"), signupExtras=$("signupExtras"), charName=$("charName");
const authMsg=$("authMsg");
const chatLog=$("chatLog"), chatInput=$("chatInput"), chatSend=$("chatSend"), worldPill=$("worldPill");
const whereText=$("whereText"), fpsText=$("fpsText");
const btnZoomIn=$("btnZoomIn"), btnZoomOut=$("btnZoomOut"), btnCenter=$("btnCenter");
const panelMinimap=$("panelMinimap");

let mode="login";
let supabase=null, session=null, game=null;

function setMsg(t,k=""){authMsg.className="msg "+(k||"");authMsg.textContent=t||"";}
function setMode(m){mode=m;tabLogin.classList.toggle("active",m==="login");tabSignup.classList.toggle("active",m==="signup");
  signupExtras.classList.toggle("hidden",m!=="signup");btnPrimary.textContent=m==="login"?"Login":"Create Account";setMsg("");}

function appendChatLine({name,message,created_at}){
  const line=document.createElement("div");line.className="chatLine";
  const ts=created_at?new Date(created_at).toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"}):"";
  const esc=(v)=>(v??"").toString().replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
  line.innerHTML=`<span class="chatMeta">[${ts}]</span> <span class="chatName">${esc(name)}</span>: ${esc(message)}`;
  chatLog.appendChild(line);chatLog.scrollTop=chatLog.scrollHeight;
}

async function initSupabase(){
  if(!window.supabase){setMsg("Supabase library failed to load.","bad");return;}
  supabase=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
  const { data:{session:s0} }=await supabase.auth.getSession();session=s0||null;
  supabase.auth.onAuthStateChange((_e,ns)=>{session=ns;});
}

async function fetchMyProfile(userId){
  const {data,error}=await supabase.schema(RUNE_SCHEMA).from("player_profiles")
    .select("id,user_id,username,settings,role,active_world_id").eq("user_id",userId).maybeSingle();
  if(error) throw error; return data;
}
async function createMyProfile(userId, username){
  const {data,error}=await supabase.schema(RUNE_SCHEMA).from("player_profiles")
    .insert({user_id:userId,username,settings:{created_at:nowISO()}}).select("id,user_id,username,settings,role,active_world_id").single();
  if(error) throw error; return data;
}
async function getLobbyWorld(){
  const {data,error}=await supabase.schema(RUNE_SCHEMA).from("worlds").select("id,slug,name").eq("slug",DEFAULT_WORLD_SLUG).limit(1);
  if(error) throw error; return (data&&data.length)?data[0]:null;
}
async function loadRecentChat(worldId){
  chatLog.innerHTML="";
  const {data,error}=await supabase.schema(RUNE_SCHEMA).from("chat_messages")
    .select("id,user_id,message,created_at").eq("world_id",worldId).order("created_at",{ascending:true}).limit(50);
  if(error) throw error;
  for(const m of (data||[])) appendChatLine({name:"Player-"+m.user_id.slice(0,6),message:m.message,created_at:m.created_at});
}
function setupRealtimeBroadcast(worldId){
  const chan=supabase.channel(`rune-chat:${worldId}`);
  chan.on("broadcast",{event:"chat"},(payload)=>{
    const msg=payload?.payload;if(!msg) return;
    appendChatLine({name:msg.name||"Player",message:msg.message||"",created_at:msg.created_at||nowISO()});
  });
  chan.subscribe();return chan;
}
async function sendChat(worldId,myUserId,text,myName,chan){
  const message=(text||"").trim(); if(!message) return;
  await supabase.schema(RUNE_SCHEMA).from("chat_messages").insert({world_id:worldId,user_id:myUserId,message});
  await chan.send({type:"broadcast",event:"chat",payload:{name:myName,message,created_at:nowISO()}});
}

async function enterGame(offline=false){
  screenAuth.classList.add("hidden");screenGame.classList.remove("hidden");
  game=new Game({canvas:$("game"),minimap:$("minimap"),onStatus:(s)=>whereText.textContent=s,onFps:(fps)=>fpsText.textContent=`${fps.toFixed(0)} fps`});
  btnZoomIn.onclick=()=>game.zoomBy(1.15);
  btnZoomOut.onclick=()=>game.zoomBy(1/1.15);
  btnCenter.onclick=()=>game.centerCamera();

  window.addEventListener("keydown",(e)=>{
    const k=(e?.key||""); if(!k) return;
    const key=k.toLowerCase();
    if(key==="m") panelMinimap.classList.toggle("hidden");
    if(key==="enter"){ if(document.activeElement===chatInput) chatSend.click(); else chatInput.focus(); }
  });

  await game.loadStaticWorld();
  game.start();

  if(offline || !supabase || !session?.user){
    showToast("Offline mode. Static overworld loaded.");
    game.setPlayerName("OfflineHero");
    return;
  }

  const userId=session.user.id;
  let profile=null;
  try{ profile=await fetchMyProfile(userId);}catch(e){appendChatLine({name:"System",message:"Profile fetch blocked (RLS).",created_at:nowISO()});}
  game.setPlayerName(profile?.username || "Player");

  let lobby=null;
  try{ lobby=await getLobbyWorld(); }catch(e){ lobby=null; }
  if(!lobby){
    appendChatLine({name:"System",message:"No world configured. Create rune.worlds row with slug 'lobby'.",created_at:nowISO()});
    return;
  }
  worldPill.textContent="World: "+lobby.name;

  try{ await loadRecentChat(lobby.id); }catch{ appendChatLine({name:"System",message:"Chat history unavailable (RLS).",created_at:nowISO()}); }
  const chan=setupRealtimeBroadcast(lobby.id);
  chatSend.onclick=async()=>{ try{ const t=chatInput.value; chatInput.value=""; await sendChat(lobby.id,userId,t,game.player.name,chan);}catch{showToast("Chat send failed (RLS).");} };
  chatInput.addEventListener("keydown",(e)=>{ if((e?.key||"")==="Enter") chatSend.click(); });
}

async function doLogin(){
  setMsg("");
  const u=safeUsername(authUsername.value); const p=authPassword.value;
  if(!u.ok) return setMsg(u.reason,"bad");
  if(!p || p.length<6) return setMsg("Password must be 6+ characters.","bad");
  const email=usernameToEmail(u.value,FAKE_EMAIL_DOMAIN);
  const {data,error}=await supabase.auth.signInWithPassword({email,password:p});
  if(error) return setMsg(error.message||"Login failed.","bad");
  session=data.session; setMsg("Logged in.","good");
  await enterGame(false);
}
async function doSignup(){
  setMsg("");
  const u=safeUsername(authUsername.value); const p=authPassword.value;
  if(!u.ok) return setMsg(u.reason,"bad");
  if(!p || p.length<6) return setMsg("Password must be 6+ characters.","bad");
  const cname=(charName.value||u.value).trim().slice(0,16); if(!cname) return setMsg("Character name required.","bad");
  const email=usernameToEmail(u.value,FAKE_EMAIL_DOMAIN);
  const {data,error}=await supabase.auth.signUp({email,password:p});
  if(error) return setMsg(error.message||"Sign up failed.","bad");
  session=data.session;
  if(!session?.user){ setMsg("Account created. Disable email confirmation for instant login.","bad"); return; }
  try{ await createMyProfile(session.user.id,cname); }
  catch(e){ setMsg("Username taken or profile insert blocked (RLS).","bad"); try{await supabase.auth.signOut();}catch{} return; }
  setMsg("Account created. Entering…","good");
  await enterGame(false);
}

function wireUI(){
  tabLogin.onclick=()=>setMode("login");
  tabSignup.onclick=()=>setMode("signup");
  btnPrimary.onclick=async()=>{ if(!supabase) return setMsg("Supabase not ready yet.","bad"); if(mode==="login") await doLogin(); else await doSignup(); };
  btnGuest.onclick=()=>enterGame(true);
  btnLogout.onclick=async()=>{ try{await supabase?.auth.signOut();}catch{} location.reload(); };
  authPassword.addEventListener("keydown",(e)=>{ if((e?.key||"")==="Enter") btnPrimary.click(); });
}

(async function main(){
  wireUI(); setMode("login");
  await initSupabase();
  if(supabase){
    const {data:{session:s}}=await supabase.auth.getSession();
    if(s?.user){ session=s; await enterGame(false); }
  }
})();