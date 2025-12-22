
import { initSupabase, auth, profiles, chat } from './supabaseClient.js';
import { bootGame } from './phaserGame.js';

const $ = (id) => document.getElementById(id);

const modal = $('modal');
const modalTitle = $('modal-title');
const authWrap = $('auth');
const charWrap = $('character');
const authError = $('auth-error');
const charError = $('char-error');

const tabs = Array.from(document.querySelectorAll('.tab'));
const panels = Array.from(document.querySelectorAll('.tab-panel'));

function showModal(title){
  modalTitle.textContent = title;
  modal.classList.remove('hidden');
}
function hideModal(){ modal.classList.add('hidden'); }

function setAuthError(msg){
  authError.textContent = msg;
  authError.classList.toggle('hidden', !msg);
}
function setCharError(msg){
  charError.textContent = msg;
  charError.classList.toggle('hidden', !msg);
}

tabs.forEach(btn=>{
  btn.addEventListener('click', ()=>{
    tabs.forEach(b=>b.classList.toggle('active', b===btn));
    panels.forEach(p=>p.classList.toggle('hidden', p.dataset.panel !== btn.dataset.tab));
    setAuthError('');
  });
});

$('modal-close').addEventListener('click', ()=>{ /* keep modal until logged in */ });

function normalizeUsername(u){
  return (u||'').trim();
}

function validateUsername(u){
  if(!/^[a-zA-Z0-9_]{3,16}$/.test(u)) return "Username must be 3–16 chars (letters/numbers/underscore).";
  return '';
}

async function ensureCharacterFlow(){
  const me = await auth.getUser();
  if(!me) return;

  const prof = await profiles.getMyProfile();
  if(prof && prof.display_name){
    hideModal();
    startGame({ user: me, profile: prof });
    return;
  }

  // show character creation
  authWrap.classList.add('hidden');
  charWrap.classList.remove('hidden');
  showModal("Create your character");
}

function setupOutfits(){
  const choices = $('outfit-choices');
  const outfits = [
    { id:'green', label:'Forest Tunic', color:'#48e1a3' },
    { id:'blue',  label:'Lake Tunic',   color:'#69b7ff' },
    { id:'red',   label:'Crimson',      color:'#ff5c73' },
    { id:'tan',   label:'Traveler',     color:'#d6c08a' },
  ];
  choices.innerHTML = '';
  let selected = outfits[0].id;

  outfits.forEach(o=>{
    const el = document.createElement('div');
    el.className = 'choice' + (o.id===selected ? ' active' : '');
    el.innerHTML = `<div class="swatch" style="background:${o.color}"></div><div><div class="label">${o.label}</div><div class="hint" style="margin:0">Outfit: ${o.id}</div></div>`;
    el.addEventListener('click', ()=>{
      selected = o.id;
      Array.from(choices.children).forEach(c=>c.classList.remove('active'));
      el.classList.add('active');
    });
    choices.appendChild(el);
  });

  return () => selected;
}

const getSelectedOutfit = setupOutfits();

$('btn-register').addEventListener('click', async ()=>{
  setAuthError('');
  const username = normalizeUsername($('reg-username').value);
  const password = $('reg-password').value || '';
  const v = validateUsername(username);
  if(v) return setAuthError(v);
  if(password.length < 6) return setAuthError("Password must be at least 6 characters.");

  const ok = await auth.signUpUsername(username, password);
  if(!ok.ok) return setAuthError(ok.error || "Could not create account.");
  await ensureCharacterFlow();
});

$('btn-login').addEventListener('click', async ()=>{
  setAuthError('');
  const username = normalizeUsername($('login-username').value);
  const password = $('login-password').value || '';
  const v = validateUsername(username);
  if(v) return setAuthError(v);

  const ok = await auth.signInUsername(username, password);
  if(!ok.ok) return setAuthError(ok.error || "Login failed.");
  await ensureCharacterFlow();
});

$('btn-create-char').addEventListener('click', async ()=>{
  setCharError('');
  const display = ( $('char-name').value || '' ).trim();
  if(!/^[a-zA-Z0-9_ ]{3,16}$/.test(display)) return setCharError("Display name must be 3–16 chars.");
  const outfit = getSelectedOutfit();

  const ok = await profiles.createOrUpdateMyProfile({ display_name: display, outfit });
  if(!ok.ok) return setCharError(ok.error || "Could not save character.");
  const me = await auth.getUser();
  const prof = await profiles.getMyProfile();
  hideModal();
  startGame({ user: me, profile: prof });
});

$('btn-logout').addEventListener('click', async ()=>{
  await auth.signOut();
  location.reload();
});

function setStatus(connected){
  const dot = $('status-dot');
  const txt = $('status-text');
  dot.style.background = connected ? 'var(--good)' : '#888';
  txt.textContent = connected ? 'Connected' : 'Offline';
}

function addChatMessage(m){
  const log = $('chat-log');
  const row = document.createElement('div');
  row.className = 'msg';
  const t = new Date(m.created_at || Date.now());
  const hh = String(t.getHours()).padStart(2,'0');
  const mm = String(t.getMinutes()).padStart(2,'0');
  row.innerHTML = `<span class="t">[${hh}:${mm}]</span> <span class="u">${escapeHtml(m.username||'??')}</span>: ${escapeHtml(m.message||'')}`;
  log.appendChild(row);
  log.scrollTop = log.scrollHeight;
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}

$('chat-send').addEventListener('click', sendChat);
$('chat-input').addEventListener('keydown', (e)=>{ if(e.key==='Enter') sendChat(); });

async function sendChat(){
  const input = $('chat-input');
  const message = (input.value||'').trim();
  if(!message) return;
  input.value = '';
  const ok = await chat.send(message);
  if(!ok.ok) addChatMessage({username:'system', message:`(send failed) ${ok.error||''}`});
}

async function startGame(ctx){
  setStatus(true);
  // Chat
  chat.onMessage(addChatMessage);
  await chat.bootstrap();

  // Game
  const coordsEl = $('coords');
  const gameApi = bootGame({
    mountId: 'game',
    onCoords: (x,y)=>{ coordsEl.textContent = `x:${x} y:${y}`; },
    getPlayerProfile: async ()=> await profiles.getMyProfile()
  });

  // expose for debugging
  window.GAME = gameApi;
}

async function main(){
  showModal("Welcome");
  await initSupabase(setStatus);

  const me = await auth.getUser();
  if(me){
    await ensureCharacterFlow();
  } else {
    // show auth
    authWrap.classList.remove('hidden');
    charWrap.classList.add('hidden');
    showModal("Welcome");
  }
}

main();
