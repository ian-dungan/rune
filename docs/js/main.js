// Rune static /docs demo (no build tools)
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d", { alpha: false });

function resizeCanvas(){
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const w = 960, h = 540;
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
}
resizeCanvas();
addEventListener("resize", resizeCanvas);

// --- World ---
const TILE = 24;
const WORLD_W = 180;
const WORLD_H = 180;

const T = { GRASS:0, WATER:1, PATH:2, ROCK:3 };
const tileName = ["Grass","Water","Path","Rock"];
const tileBiome = (t)=> tileName[t] || "—";

function hash2(x,y){
  let n = x*374761393 + y*668265263;
  n = (n ^ (n >> 13)) * 1274126177;
  n ^= (n >> 16);
  return (n >>> 0) / 4294967295;
}
function fbm(x,y){
  let a=0, amp=0.55, f=0.06;
  for(let i=0;i<4;i++){
    a += amp * (hash2(Math.floor(x*f*1000), Math.floor(y*f*1000)) * 2 - 1);
    amp *= 0.5;
    f *= 2.0;
  }
  return a;
}

const world = new Uint8Array(WORLD_W * WORLD_H);

function genWorld(){
  for(let y=0;y<WORLD_H;y++){
    for(let x=0;x<WORLD_W;x++){
      const n = fbm(x,y);
      let t = T.GRASS;
      if(n < -0.18) t = T.WATER;
      if(n > 0.42) t = T.ROCK;
      world[y*WORLD_W+x] = t;
    }
  }
  // winding path
  let x = 14, y = WORLD_H-20;
  for(let i=0;i<WORLD_W+WORLD_H;i++){
    for(let dy=-1;dy<=1;dy++){
      for(let dx=-1;dx<=1;dx++){
        const xx = x+dx, yy=y+dy;
        if(xx>=0&&yy>=0&&xx<WORLD_W&&yy<WORLD_H){
          world[yy*WORLD_W+xx] = T.PATH;
        }
      }
    }
    x += (hash2(i, 99) < 0.55) ? 1 : 0;
    y -= (hash2(i, 199) < 0.55) ? 1 : 0;
    x += (hash2(i, 299) < 0.15) ? (hash2(i, 9) < 0.5 ? -1 : 1) : 0;
    y += (hash2(i, 399) < 0.15) ? (hash2(i, 19) < 0.5 ? -1 : 1) : 0;
    x = Math.max(2, Math.min(WORLD_W-3, x));
    y = Math.max(2, Math.min(WORLD_H-3, y));
  }

  // safe spawn clearing + pond
  const sx=18, sy=WORLD_H-24;
  for(let yy=sy-5;yy<=sy+5;yy++){
    for(let xx=sx-5;xx<=sx+5;xx++){
      if(xx>=0&&yy>=0&&xx<WORLD_W&&yy<WORLD_H){
        world[yy*WORLD_W+xx] = T.GRASS;
      }
    }
  }
  for(let yy=sy-2;yy<=sy+2;yy++){
    for(let xx=sx+8;xx<=sx+12;xx++){
      if(xx>=0&&yy>=0&&xx<WORLD_W&&yy<WORLD_H){
        world[yy*WORLD_W+xx] = T.WATER;
      }
    }
  }
  for(let i=0;i<16;i++){
    const xx=sx+i, yy=sy-1;
    if(xx>=0&&yy>=0&&xx<WORLD_W&&yy<WORLD_H) world[yy*WORLD_W+xx]=T.PATH;
  }
}
genWorld();

function tileAt(tx,ty){
  if(tx<0||ty<0||tx>=WORLD_W||ty>=WORLD_H) return T.ROCK;
  return world[ty*WORLD_W+tx];
}
function isBlocked(t){ return t===T.WATER || t===T.ROCK; }

// --- Player ---
const player = { name:"Adventurer", x:18*TILE+TILE/2, y:(WORLD_H-24)*TILE+TILE/2, r:8, speed:130, hp:100 };
const cam = { x:player.x, y:player.y };
const keys = new Set();

addEventListener("keydown",(e)=>{
  const k=e.key.toLowerCase();
  if(k==="enter"){
    if(document.activeElement===chatInput){ sendChat(); e.preventDefault(); }
    else { chatInput.focus(); e.preventDefault(); }
    return;
  }
  keys.add(k);
  if(["arrowup","arrowdown","arrowleft","arrowright"," "].includes(k)) e.preventDefault();
});
addEventListener("keyup",(e)=>keys.delete(e.key.toLowerCase()));

// --- Touch stick ---
const stickBase=document.getElementById("stickBase");
const stickKnob=document.getElementById("stickKnob");
const btnE=document.getElementById("btnE");
let stick={active:false,id:null,ox:0,oy:0,dx:0,dy:0};
function clamp(v,a,b){ return Math.max(a, Math.min(b,v)); }
function setKnob(dx,dy){
  const max=36; const len=Math.hypot(dx,dy);
  if(len>max){ dx*=max/len; dy*=max/len; }
  stickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
}
stickBase.addEventListener("pointerdown",(e)=>{
  stick.active=true; stick.id=e.pointerId;
  const r=stickBase.getBoundingClientRect();
  stick.ox=r.left+r.width/2; stick.oy=r.top+r.height/2;
  stick.dx=0; stick.dy=0;
  stickBase.setPointerCapture(e.pointerId);
});
stickBase.addEventListener("pointermove",(e)=>{
  if(!stick.active||e.pointerId!==stick.id) return;
  stick.dx=e.clientX-stick.ox; stick.dy=e.clientY-stick.oy;
  setKnob(stick.dx, stick.dy);
});
function endStick(e){
  if(e && e.pointerId!==stick.id) return;
  stick.active=false; stick.id=null; stick.dx=0; stick.dy=0; setKnob(0,0);
}
stickBase.addEventListener("pointerup", endStick);
stickBase.addEventListener("pointercancel", endStick);
btnE.addEventListener("pointerdown", ()=>interact());

// --- Chat ---
const chatLog=document.getElementById("chatLog");
const chatInput=document.getElementById("chatInput");
const sendBtn=document.getElementById("sendBtn");
sendBtn.addEventListener("click", sendChat);

function nowTime(){ return new Date().toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"}); }
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c])); }
function addMsg(from,text){
  const el=document.createElement("div");
  el.className="msg";
  el.innerHTML = `<span class="from">${escapeHtml(from)}:</span> ${escapeHtml(text)} <span class="time">${nowTime()}</span>`;
  chatLog.appendChild(el);
  chatLog.scrollTop = chatLog.scrollHeight;
}
function sendChat(){
  const text=chatInput.value.trim();
  if(!text) return;
  chatInput.value="";
  addMsg(player.name, text);
  if(Math.random()<0.28){
    const replies=["Nice day for it.","Head north if you want trouble.","Water blocks movement—go around.","Press E near the glowing orbs."];
    setTimeout(()=>addMsg("Guide", replies[Math.floor(Math.random()*replies.length)]), 350);
  }
}
addMsg("System","Welcome to Rune (static). Movement + minimap + local chat. This is a /docs GitHub Pages demo.");

// --- HUD ---
const hudName=document.getElementById("name");
const hudHP=document.getElementById("hp");
const hudCoords=document.getElementById("coords");
const hudBiome=document.getElementById("biome");
hudName.textContent=player.name;

// --- Pickups / interact ---
let pickups=[
  {x:(18+10)*TILE+TILE/2, y:(WORLD_H-24-1)*TILE+TILE/2, kind:"Coin", taken:false},
  {x:(18+12)*TILE+TILE/2, y:(WORLD_H-24-1)*TILE+TILE/2, kind:"Herb", taken:false},
];
let inventory={Coin:0, Herb:0};

function interact(){
  let best=null, bestD=1e9;
  for(const p of pickups){
    if(p.taken) continue;
    const d=Math.hypot(player.x-p.x, player.y-p.y);
    if(d<bestD){ bestD=d; best=p; }
  }
  if(best && bestD<28){
    best.taken=true;
    inventory[best.kind]=(inventory[best.kind]||0)+1;
    addMsg("System", `Picked up: ${best.kind} (x${inventory[best.kind]})`);
  }else{
    addMsg("System","Nothing to interact with nearby.");
  }
}
addEventListener("keydown",(e)=>{ if(e.key.toLowerCase()==="e") interact(); });

// --- Rendering ---
function drawTile(t, x, y){
  const n=hash2(x,y);
  if(t===T.GRASS) ctx.fillStyle = `rgb(${28+Math.floor(n*12)}, ${90+Math.floor(n*25)}, ${40+Math.floor(n*12)})`;
  else if(t===T.WATER) ctx.fillStyle = `rgb(${10+Math.floor(n*10)}, ${40+Math.floor(n*20)}, ${110+Math.floor(n*25)})`;
  else if(t===T.PATH) ctx.fillStyle = `rgb(${140+Math.floor(n*20)}, ${120+Math.floor(n*18)}, ${80+Math.floor(n*14)})`;
  else ctx.fillStyle = `rgb(${70+Math.floor(n*25)}, ${72+Math.floor(n*25)}, ${80+Math.floor(n*25)})`;
  ctx.fillRect(x*TILE, y*TILE, TILE, TILE);
  if(t===T.WATER){
    ctx.fillStyle="rgba(255,255,255,0.06)";
    ctx.fillRect(x*TILE, y*TILE, TILE, 2);
  }
}
function drawPickup(p){
  if(p.taken) return;
  ctx.save();
  ctx.translate(p.x,p.y);
  ctx.fillStyle = p.kind==="Coin" ? "rgba(255,215,0,0.95)" : "rgba(90,255,120,0.9)";
  ctx.beginPath(); ctx.arc(0,0,6,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle="rgba(0,0,0,0.35)"; ctx.lineWidth=2; ctx.stroke();
  ctx.restore();
}
function drawPlayer(){
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.fillStyle="rgba(0,0,0,0.35)";
  ctx.beginPath(); ctx.ellipse(0,10,9,4,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle="rgba(220,235,255,0.92)";
  ctx.beginPath(); ctx.arc(0,0,player.r,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle="rgba(0,0,0,0.35)"; ctx.lineWidth=2; ctx.stroke();
  ctx.fillStyle="rgba(74,163,255,0.9)";
  ctx.beginPath(); ctx.arc(4,-2,2.2,0,Math.PI*2); ctx.fill();
  ctx.restore();
}
function drawLabels(){
  const sx=18*TILE+TILE/2, sy=(WORLD_H-24)*TILE+TILE/2;
  ctx.save();
  ctx.fillStyle="rgba(0,0,0,0.35)";
  ctx.fillRect(sx-48, sy-56, 96, 18);
  ctx.fillStyle="rgba(255,255,255,0.92)";
  ctx.font="12px system-ui"; ctx.textAlign="center";
  ctx.fillText("South Gate", sx, sy-42);
  ctx.restore();
}
function withCamera(fn){
  const viewW=960, viewH=540;
  ctx.save();
  ctx.translate(viewW/2 - cam.x, viewH/2 - cam.y);
  fn();
  ctx.restore();
}

function moveWithCollide(nx,ny){
  const r=player.r;
  function ok(x,y){
    const tx=Math.floor(x/TILE), ty=Math.floor(y/TILE);
    return !isBlocked(tileAt(tx,ty));
  }
  if(ok(nx+r, player.y) && ok(nx-r, player.y) && ok(nx, player.y+r) && ok(nx, player.y-r)) player.x=nx;
  if(ok(player.x+r, ny) && ok(player.x-r, ny) && ok(player.x, ny+r) && ok(player.x, ny-r)) player.y=ny;
  player.x=clamp(player.x, player.r, WORLD_W*TILE-player.r);
  player.y=clamp(player.y, player.r, WORLD_H*TILE-player.r);
}
function getMoveVector(){
  let ax=0, ay=0;
  if(keys.has("w")||keys.has("arrowup")) ay-=1;
  if(keys.has("s")||keys.has("arrowdown")) ay+=1;
  if(keys.has("a")||keys.has("arrowleft")) ax-=1;
  if(keys.has("d")||keys.has("arrowright")) ax+=1;
  if(stick.active){
    const max=36;
    ax += clamp(stick.dx/max, -1, 1);
    ay += clamp(stick.dy/max, -1, 1);
  }
  const len=Math.hypot(ax,ay);
  if(len>1e-6){ ax/=len; ay/=len; }
  return {ax,ay};
}

// --- Minimap ---
const mm=document.getElementById("minimap");
const mmctx=mm.getContext("2d");
const MM_SCALE=180/WORLD_W;
function drawMinimap(){
  const img=mmctx.createImageData(mm.width, mm.height);
  for(let y=0;y<WORLD_H;y++){
    for(let x=0;x<WORLD_W;x++){
      const t=tileAt(x,y);
      const px=Math.floor(x*MM_SCALE);
      const py=Math.floor(y*MM_SCALE);
      const idx=(py*mm.width+px)*4;
      let r=0,g=0,b=0;
      if(t===T.GRASS){ r=40; g=145; b=70; }
      else if(t===T.WATER){ r=30; g=70; b=175; }
      else if(t===T.PATH){ r=190; g=165; b=110; }
      else { r=120; g=120; b=130; }
      img.data[idx]=r; img.data[idx+1]=g; img.data[idx+2]=b; img.data[idx+3]=255;
    }
  }
  mmctx.putImageData(img,0,0);
  const px=Math.floor((player.x/TILE)*MM_SCALE);
  const py=Math.floor((player.y/TILE)*MM_SCALE);
  mmctx.fillStyle="white";
  mmctx.beginPath(); mmctx.arc(px,py,3,0,Math.PI*2); mmctx.fill();
}

let last=performance.now();
let mmTimer=0;

drawMinimap();
function tick(now){
  const dt=Math.min(0.033, (now-last)/1000);
  last=now;

  const {ax,ay}=getMoveVector();
  moveWithCollide(player.x+ax*player.speed*dt, player.y+ay*player.speed*dt);

  cam.x += (player.x-cam.x) * Math.min(1, dt*6.5);
  cam.y += (player.y-cam.y) * Math.min(1, dt*6.5);

  const tx=Math.floor(player.x/TILE), ty=Math.floor(player.y/TILE);
  hudCoords.textContent=`${tx},${ty}`;
  hudBiome.textContent=tileBiome(tileAt(tx,ty));
  hudHP.textContent=String(player.hp);

  ctx.clearRect(0,0,960,540);
  withCamera(()=>{
    const viewW=960, viewH=540;
    const left=Math.floor((cam.x-viewW/2)/TILE)-2;
    const top=Math.floor((cam.y-viewH/2)/TILE)-2;
    const right=Math.floor((cam.x+viewW/2)/TILE)+2;
    const bottom=Math.floor((cam.y+viewH/2)/TILE)+2;

    for(let y=top;y<=bottom;y++){
      for(let x=left;x<=right;x++){
        drawTile(tileAt(x,y), x,y);
      }
    }

    // small decorative stones
    for(let i=0;i<40;i++){
      const rx=Math.floor(hash2(i,7)*WORLD_W);
      const ry=Math.floor(hash2(i,17)*WORLD_H);
      if(tileAt(rx,ry)!==T.GRASS) continue;
      const px=rx*TILE+TILE/2, py=ry*TILE+TILE/2;
      ctx.fillStyle="rgba(0,0,0,0.18)";
      ctx.beginPath(); ctx.arc(px,py,6,0,Math.PI*2); ctx.fill();
      ctx.fillStyle="rgba(190,190,200,0.5)";
      ctx.beginPath(); ctx.arc(px-1,py-2,4,0,Math.PI*2); ctx.fill();
    }

    for(const p of pickups) drawPickup(p);
    drawLabels();
    drawPlayer();
  });

  mmTimer += dt;
  if(mmTimer>0.25){ drawMinimap(); mmTimer=0; }

  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
