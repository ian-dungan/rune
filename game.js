import { clamp, showToast } from "./util.js";

function hash2i(x, y){
  let h = x * 374761393 + y * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  return (h ^ (h >> 16)) >>> 0;
}
function lerp(a,b,t){ return a + (b-a)*t; }
function smoothstep(t){ return t*t*(3-2*t); }

function valueNoise2D(x, y, seed){
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;

  const h00 = hash2i(xi + seed, yi + seed);
  const h10 = hash2i(xi + 1 + seed, yi + seed);
  const h01 = hash2i(xi + seed, yi + 1 + seed);
  const h11 = hash2i(xi + 1 + seed, yi + 1 + seed);

  const v00 = (h00 % 1024) / 1024;
  const v10 = (h10 % 1024) / 1024;
  const v01 = (h01 % 1024) / 1024;
  const v11 = (h11 % 1024) / 1024;

  const u = smoothstep(xf);
  const v = smoothstep(yf);

  return lerp(lerp(v00, v10, u), lerp(v01, v11, u), v);
}

function fbm(x, y, seed){
  let a = 0.0, amp = 0.55, freq = 0.035;
  for (let i=0;i<5;i++){
    a += amp * valueNoise2D(x*freq, y*freq, seed + i*97);
    amp *= 0.5; freq *= 2.0;
  }
  return a;
}

const TILE = 16;
const CHUNK = 64;
const PALETTE = {
  grass1: "#2b6f3d", grass2: "#2f7a43", grass3: "#2a6840",
  dirt1:  "#6b4b2a", dirt2:  "#5a4024",
  sand1:  "#bca06a", sand2:  "#c7ad78",
  water1: "#10324a", water2: "#0b263a",
  stone1: "#4a5666", stone2: "#3c4755",
  path1:  "#a67c3e", path2:  "#8f6a35",
};

function tileTypeAt(tx, ty, seed){
  const h = fbm(tx, ty, seed);
  const m = fbm(tx + 1000, ty - 1000, seed + 13);
  if (h < 0.40) return "water";
  if (h < 0.435) return "sand";
  if (h > 0.74) return "stone";
  if (m < 0.36) return "dirt";
  const road = (Math.abs((tx % 96)) < 2) || (Math.abs((ty % 96)) < 2);
  if (road && h > 0.46 && h < 0.70) return "path";
  return "grass";
}

function colorForTile(tt, tx, ty){
  const n = (hash2i(tx,ty) % 1000)/1000;
  if (tt === "grass") return n < .33 ? PALETTE.grass1 : (n < .66 ? PALETTE.grass2 : PALETTE.grass3);
  if (tt === "dirt") return n < .5 ? PALETTE.dirt1 : PALETTE.dirt2;
  if (tt === "sand") return n < .5 ? PALETTE.sand1 : PALETTE.sand2;
  if (tt === "water") return n < .5 ? PALETTE.water1 : PALETTE.water2;
  if (tt === "stone") return n < .5 ? PALETTE.stone1 : PALETTE.stone2;
  if (tt === "path") return n < .5 ? PALETTE.path1 : PALETTE.path2;
  return "#000";
}

function worldToTile(x){ return Math.floor(x / TILE); }
function tileToWorld(t){ return t * TILE; }

export class Game {
  constructor({ canvas, minimap, onStatus, onFps }){
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.minimap = minimap;
    this.mctx = minimap.getContext("2d", { alpha: true });

    this.onStatus = onStatus || (()=>{});
    this.onFps = onFps || (()=>{});

    this.seed = 12345;

    this.player = {
      x: 0, y: 0, vx: 0, vy: 0,
      speed: 180,
      name: "Player",
      style: { hair:"#0a0a0a", skin:"#d9b48a", shirt:"#2a88ff", pants:"#23435f" },
      target: null
    };

    this.cam = { x: 0, y: 0, zoom: 3.0 };
    this.nameCache = new Map();
    this.chunks = new Map();
    this.anim = { t: 0 };
    this._fps = { last: performance.now(), acc:0, frames:0, value:60 };

    this._bindInput();
    this._resize();
    window.addEventListener("resize", ()=>this._resize());

    showToast("World streaming ready. Click to move.");
  }

  setPlayerMeta({ name, style }){
    if (name) this.player.name = name;
    if (style) this.player.style = style;
  }

  getNameCache(userId){ return this.nameCache.get(userId); }
  setNameCache(userId, name){ this.nameCache.set(userId, name); }

  start(){
    this._running = true;
    this._last = performance.now();
    requestAnimationFrame((t)=>this._tick(t));
  }

  zoomBy(f){ this.cam.zoom = clamp(this.cam.zoom * f, 1.5, 5.25); }
  centerCamera(){ this.cam.x = this.player.x; this.cam.y = this.player.y; }

  _resize(){
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.floor(rect.width * dpr);
    this.canvas.height = Math.floor(rect.height * dpr);
    this.ctx.imageSmoothingEnabled = false;
  }

  _bindInput(){
    this._keys = new Set();

    window.addEventListener("keydown", (e)=>{
      if (["INPUT","TEXTAREA"].includes((document.activeElement?.tagName||"").toUpperCase())) return;
      const k = (e.key || "").toLowerCase();
      if (!k) return;
      this._keys.add(k);
    });
    window.addEventListener("keyup", (e)=>{
      const k = (e.key || "").toLowerCase();
      if (!k) return;
      this._keys.delete(k);
    });

    this.canvas.addEventListener("pointerdown", (e)=>{
      const rect = this.canvas.getBoundingClientRect();
      const mx = (e.clientX - rect.left) * (this.canvas.width/rect.width);
      const my = (e.clientY - rect.top) * (this.canvas.height/rect.height);
      const w = this._screenToWorld(mx, my);
      this.player.target = { x: w.x, y: w.y };
    });

    this.canvas.addEventListener("wheel", (e)=>{
      e.preventDefault();
      const f = e.deltaY < 0 ? 1.10 : 1/1.10;
      this.zoomBy(f);
    }, { passive:false });
  }

  _screenToWorld(sx, sy){
    const cx = this.canvas.width/2, cy = this.canvas.height/2, z = this.cam.zoom;
    return { x: (sx - cx)/z + this.cam.x, y: (sy - cy)/z + this.cam.y };
  }
  _worldToScreen(wx, wy){
    const cx = this.canvas.width/2, cy = this.canvas.height/2, z = this.cam.zoom;
    return { x: (wx - this.cam.x)*z + cx, y: (wy - this.cam.y)*z + cy };
  }

  _tick(t){
    if (!this._running) return;
    const dt = Math.min(0.033, (t - this._last)/1000);
    this._last = t;
    this.anim.t += dt;

    this._update(dt);
    this._render();

    const f = this._fps;
    f.frames++; f.acc += (t - f.last); f.last = t;
    if (f.acc > 500){
      f.value = (f.frames / f.acc) * 1000;
      f.acc = 0; f.frames = 0;
      this.onFps(f.value);
    }
    requestAnimationFrame((tt)=>this._tick(tt));
  }

  _update(dt){
    const follow = 0.12;
    this.cam.x += (this.player.x - this.cam.x) * follow;
    this.cam.y += (this.player.y - this.cam.y) * follow;

    let ax = 0, ay = 0;
    if (this._keys.has("w") || this._keys.has("arrowup")) ay -= 1;
    if (this._keys.has("s") || this._keys.has("arrowdown")) ay += 1;
    if (this._keys.has("a") || this._keys.has("arrowleft")) ax -= 1;
    if (this._keys.has("d") || this._keys.has("arrowright")) ax += 1;

    let tx = 0, ty = 0;
    if (this.player.target){
      const dx = this.player.target.x - this.player.x;
      const dy = this.player.target.y - this.player.y;
      const dist = Math.hypot(dx,dy);
      if (dist < 4) this.player.target = null;
      else { tx = dx/dist; ty = dy/dist; }
    }

    const mx = ax || tx;
    const my = ay || ty;
    const len = Math.hypot(mx,my) || 1;

    const tt = tileTypeAt(worldToTile(this.player.x), worldToTile(this.player.y), this.seed);
    const slow = (tt === "water") ? 0.55 : 1.0;
    const sp = this.player.speed * slow;

    this.player.vx = (mx/len) * sp;
    this.player.vy = (my/len) * sp;
    this.player.x += this.player.vx * dt;
    this.player.y += this.player.vy * dt;

    const pt = tileTypeAt(worldToTile(this.player.x), worldToTile(this.player.y), this.seed);
    this.onStatus(`Pos: ${Math.floor(this.player.x)}, ${Math.floor(this.player.y)} • Tile: ${pt} • Zoom: ${this.cam.zoom.toFixed(2)}x`);
  }

  _render(){
    const ctx = this.ctx;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#061018";
    ctx.fillRect(0,0,this.canvas.width,this.canvas.height);

    const z = this.cam.zoom;
    const halfW = (this.canvas.width/2)/z;
    const halfH = (this.canvas.height/2)/z;
    const left = this.cam.x - halfW;
    const right = this.cam.x + halfW;
    const top = this.cam.y - halfH;
    const bottom = this.cam.y + halfH;

    const tL = worldToTile(left) - 2;
    const tR = worldToTile(right) + 2;
    const tT = worldToTile(top) - 2;
    const tB = worldToTile(bottom) + 2;

    const cL = Math.floor(tL / CHUNK);
    const cR = Math.floor(tR / CHUNK);
    const cT = Math.floor(tT / CHUNK);
    const cB = Math.floor(tB / CHUNK);

    for (let cy=cT; cy<=cB; cy++){
      for (let cx=cL; cx<=cR; cx++){
        const chunk = this._getChunk(cx, cy);
        const wx = tileToWorld(cx*CHUNK);
        const wy = tileToWorld(cy*CHUNK);
        const s = this._worldToScreen(wx, wy);
        ctx.drawImage(chunk.img, s.x, s.y, CHUNK*TILE*z, CHUNK*TILE*z);
      }
    }

    const g = ctx.createRadialGradient(this.canvas.width*0.5, this.canvas.height*0.5, 20, this.canvas.width*0.5, this.canvas.height*0.5, Math.max(this.canvas.width,this.canvas.height)*0.6);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.25)");
    ctx.fillStyle = g;
    ctx.fillRect(0,0,this.canvas.width,this.canvas.height);

    this._drawPlayer();
    this._drawMinimap();
    ctx.restore();
  }

  _drawPlayer(){
    const ctx = this.ctx;
    const z = this.cam.zoom;
    const p = this.player;
    const s = this._worldToScreen(p.x, p.y);

    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(s.x, s.y + 10*z, 6*z, 3*z, 0, 0, Math.PI*2);
    ctx.fill();

    const walk = (Math.abs(p.vx)+Math.abs(p.vy)) > 0.1;
    const bob = walk ? Math.sin(this.anim.t*10) * 0.8 : 0;
    const leg = walk ? Math.sin(this.anim.t*10) : 0;

    const skin = p.style.skin, hair = p.style.hair, shirt = p.style.shirt, pants = p.style.pants;
    const px = s.x, py = s.y + bob*z;

    ctx.fillStyle = pants;
    ctx.fillRect(px-4*z, py+3*z, 8*z, 7*z);

    ctx.fillStyle = "#0a0c10";
    ctx.fillRect(px-4*z, py+10*z + leg*1.2*z, 3*z, 4*z);
    ctx.fillRect(px+1*z, py+10*z - leg*1.2*z, 3*z, 4*z);

    ctx.fillStyle = shirt;
    ctx.fillRect(px-5*z, py-3*z, 10*z, 7*z);

    ctx.fillStyle = skin;
    ctx.fillRect(px-7*z, py-2*z, 2*z, 6*z);
    ctx.fillRect(px+5*z, py-2*z, 2*z, 6*z);

    ctx.fillStyle = skin;
    ctx.fillRect(px-5*z, py-12*z, 10*z, 10*z);

    ctx.fillStyle = hair;
    ctx.fillRect(px-5*z, py-12*z, 10*z, 4*z);

    ctx.fillStyle = "#081018";
    ctx.fillRect(px-3*z, py-8*z, 2*z, 2*z);
    ctx.fillRect(px+1*z, py-8*z, 2*z, 2*z);

    ctx.font = `${Math.floor(10*z)}px ui-sans-serif, system-ui`;
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.fillText(p.name, px+1, py - 16*z + 1);
    ctx.fillStyle = "#d6b35f";
    ctx.fillText(p.name, px, py - 16*z);
  }

  _drawMinimap(){
    const m = this.mctx;
    const w = this.minimap.width, h = this.minimap.height;
    m.clearRect(0,0,w,h);

    const pxPerTile = 0.5;
    const ptx = worldToTile(this.player.x);
    const pty = worldToTile(this.player.y);

    const img = m.createImageData(w,h);
    for (let y=0; y<h; y++){
      for (let x=0; x<w; x++){
        const tx = ptx + Math.floor((x - w/2) / pxPerTile);
        const ty = pty + Math.floor((y - h/2) / pxPerTile);
        const tt = tileTypeAt(tx, ty, this.seed);
        const c = colorForTile(tt, tx, ty);
        const r = int(c.slice(1,3)), g = int(c.slice(3,5)), b = int(c.slice(5,7));
        const i = (y*w + x)*4;
        img.data[i+0]=r; img.data[i+1]=g; img.data[i+2]=b; img.data[i+3]=255;
      }
    }
    m.putImageData(img,0,0);

    m.fillStyle = "#ffffff";
    m.fillRect(w/2 - 1, h/2 - 1, 3, 3);
    m.strokeStyle = "rgba(0,0,0,0.6)";
    m.strokeRect(w/2 - 1, h/2 - 1, 3, 3);
  }

  _chunkKey(cx, cy){ return `${cx},${cy}`; }

  _getChunk(cx, cy){
    const key = this._chunkKey(cx, cy);
    const found = this.chunks.get(key);
    if (found) return found;

    const c = document.createElement("canvas");
    c.width = CHUNK*TILE;
    c.height = CHUNK*TILE;
    const g = c.getContext("2d");
    g.imageSmoothingEnabled = false;

    const baseX = cx*CHUNK;
    const baseY = cy*CHUNK;

    for (let y=0;y<CHUNK;y++){
      for (let x=0;x<CHUNK;x++){
        const tx = baseX + x;
        const ty = baseY + y;
        const tt = tileTypeAt(tx, ty, this.seed);
        g.fillStyle = colorForTile(tt, tx, ty);
        g.fillRect(x*TILE, y*TILE, TILE, TILE);

        const n = (hash2i(tx+91,ty-37)%1000)/1000;
        if (tt === "grass" && n < 0.04){
          g.fillStyle = "rgba(0,0,0,0.18)";
          g.fillRect(x*TILE + 6, y*TILE + 5, 2, 2);
          g.fillRect(x*TILE + 10, y*TILE + 9, 1, 1);
        }
        if (tt === "sand" && n < 0.035){
          g.fillStyle = "rgba(255,255,255,0.12)";
          g.fillRect(x*TILE + 7, y*TILE + 6, 2, 1);
        }
        if (tt === "water" && n < 0.08){
          g.fillStyle = "rgba(255,255,255,0.06)";
          g.fillRect(x*TILE + 2, y*TILE + (2 + (hash2i(tx,ty)%10)), 12, 1);
        }
        if (tt === "stone" && n < 0.04){
          g.fillStyle = "rgba(0,0,0,0.25)";
          g.fillRect(x*TILE + 5, y*TILE + 6, 6, 5);
          g.fillStyle = "rgba(255,255,255,0.07)";
          g.fillRect(x*TILE + 6, y*TILE + 7, 2, 2);
        }
      }
    }

    const chunk = { img: c, cx, cy };
    this.chunks.set(key, chunk);
    if (this.chunks.size > 90){
      const firstKey = this.chunks.keys().next().value;
      this.chunks.delete(firstKey);
    }
    return chunk;
  }
}

function int(h){ return parseInt(h,16); }
