// Static overworld renderer (32x32 tiles) + chunk streaming from /assets/world/overworld
import { clamp, showToast } from "./util.js";

const WORLD_ASSETS = "./assets/world/overworld";
const TILESET_URL = "./assets/tileset_32.png";

export class Game {
  constructor({ canvas, minimap, onStatus, onFps }){
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.minimap = minimap;
    this.mctx = minimap.getContext("2d", { alpha: true });

    this.onStatus = onStatus || (()=>{});
    this.onFps = onFps || (()=>{});

    this.player = {
      x: 0, y: 0, vx: 0, vy: 0,
      speed: 220, // tiles are bigger; slightly faster feel
      name: "Player",
      style: { hair:"#0a0a0a", skin:"#d9b48a", shirt:"#2a88ff", pants:"#23435f" },
      target: null
    };

    this.cam = { x: 0, y: 0, zoom: 2.25 };
    this.nameCache = new Map();
    this.anim = { t: 0 };
    this._fps = { last: performance.now(), acc:0, frames:0, value:60 };

    this.world = new StaticWorld({ baseUrl: WORLD_ASSETS, tilesetUrl: TILESET_URL });

    this._bindInput();
    this._resize();
    window.addEventListener("resize", ()=>this._resize());

    showToast("Loading static overworld…");
  }

  setPlayerMeta({ name, style }){
    if (name) this.player.name = name;
    if (style) this.player.style = style;
  }
  getNameCache(userId){ return this.nameCache.get(userId); }
  setNameCache(userId, name){ this.nameCache.set(userId, name); }

  async start(){
    await this.world.init();
    // spawn
    const sp = this.world.meta.spawn;
    this.player.x = sp.x * this.world.meta.tileSize;
    this.player.y = sp.y * this.world.meta.tileSize;
    this.cam.x = this.player.x; this.cam.y = this.player.y;

    this._running = true;
    this._last = performance.now();
    requestAnimationFrame((t)=>this._tick(t));
    showToast("Welcome! Click to move. Wheel to zoom.");
  }

  stop(){ this._running = false; }
  zoomBy(f){ this.cam.zoom = clamp(this.cam.zoom * f, 1.25, 4.0); }
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
      this._keys.add(e.key.toLowerCase());
    });
    window.addEventListener("keyup", (e)=>this._keys.delete(e.key.toLowerCase()));

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
    const cx = this.canvas.width/2;
    const cy = this.canvas.height/2;
    const z = this.cam.zoom;
    return { x: (sx - cx)/z + this.cam.x, y: (sy - cy)/z + this.cam.y };
  }
  _worldToScreen(wx, wy){
    const cx = this.canvas.width/2;
    const cy = this.canvas.height/2;
    const z = this.cam.zoom;
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

  _tryMove(nx, ny){
    // collision/slow based on tile
    const tile = this.world.sampleTileWorld(nx, ny);
    if (tile.solid) return { x: this.player.x, y: this.player.y, slow: 1.0, tileName: tile.name };
    return { x: nx, y: ny, slow: tile.slow, tileName: tile.name };
  }

  _update(dt){
    // camera follow
    const follow = 0.12;
    this.cam.x += (this.player.x - this.cam.x) * follow;
    this.cam.y += (this.player.y - this.cam.y) * follow;

    // input
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
      if (dist < 6) this.player.target = null;
      else { tx = dx/dist; ty = dy/dist; }
    }

    const mx = ax || tx;
    const my = ay || ty;
    const len = Math.hypot(mx,my) || 1;

    // sample tile slow
    const baseSp = this.player.speed;
    const tile = this.world.sampleTileWorld(this.player.x, this.player.y);
    const sp = baseSp * (tile.slow ?? 1.0);

    this.player.vx = (mx/len) * sp;
    this.player.vy = (my/len) * sp;

    const nx = this.player.x + this.player.vx * dt;
    const ny = this.player.y + this.player.vy * dt;

    const moved = this._tryMove(nx, ny);
    this.player.x = moved.x;
    this.player.y = moved.y;

    const posTile = this.world.worldToTile(this.player.x, this.player.y);
    this.onStatus(`Tile: ${moved.tileName} • Pos: ${posTile.tx},${posTile.ty} • Zoom: ${this.cam.zoom.toFixed(2)}x`);
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

    // draw visible chunks
    this.world.drawVisible(ctx, this, left, top, right, bottom);

    // vignette
    const g = ctx.createRadialGradient(this.canvas.width*0.5, this.canvas.height*0.5, 20, this.canvas.width*0.5, this.canvas.height*0.5, Math.max(this.canvas.width,this.canvas.height)*0.6);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.25)");
    ctx.fillStyle = g;
    ctx.fillRect(0,0,this.canvas.width,this.canvas.height);

    this._drawPlayer();
    this.world.drawMinimap(this.mctx, this.player.x, this.player.y);

    ctx.restore();
  }

  _drawPlayer(){
    const ctx = this.ctx;
    const z = this.cam.zoom;
    const p = this.player;
    const s = this._worldToScreen(p.x, p.y);

    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(s.x, s.y + 18*z, 10*z, 5*z, 0, 0, Math.PI*2);
    ctx.fill();

    const walk = (Math.abs(p.vx)+Math.abs(p.vy)) > 0.1;
    const bob = walk ? Math.sin(this.anim.t*10) * 1.2 : 0;
    const leg = walk ? Math.sin(this.anim.t*10) : 0;

    const skin = p.style.skin, hair = p.style.hair, shirt = p.style.shirt, pants = p.style.pants;

    const px = s.x;
    const py = s.y + bob*z;

    // 32px tile world: sprite ~ 22px tall at zoom 2.25 looks good
    ctx.fillStyle = pants;
    ctx.fillRect(px-7*z, py+6*z, 14*z, 12*z);

    ctx.fillStyle = "#0a0c10";
    ctx.fillRect(px-7*z, py+18*z + leg*1.8*z, 5*z, 7*z);
    ctx.fillRect(px+2*z, py+18*z - leg*1.8*z, 5*z, 7*z);

    ctx.fillStyle = shirt;
    ctx.fillRect(px-9*z, py-2*z, 18*z, 12*z);

    ctx.fillStyle = skin;
    ctx.fillRect(px-12*z, py-1*z, 3*z, 10*z);
    ctx.fillRect(px+9*z, py-1*z, 3*z, 10*z);

    ctx.fillStyle = skin;
    ctx.fillRect(px-9*z, py-20*z, 18*z, 18*z);

    ctx.fillStyle = hair;
    ctx.fillRect(px-9*z, py-20*z, 18*z, 6*z);

    ctx.fillStyle = "#081018";
    ctx.fillRect(px-5*z, py-13*z, 3*z, 3*z);
    ctx.fillRect(px+2*z, py-13*z, 3*z, 3*z);

    ctx.font = `${Math.floor(10*z)}px ui-sans-serif, system-ui`;
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.fillText(p.name, px+1, py - 26*z + 1);
    ctx.fillStyle = "#d6b35f";
    ctx.fillText(p.name, px, py - 26*z);
  }
}

class StaticWorld {
  constructor({ baseUrl, tilesetUrl }){
    this.baseUrl = baseUrl;
    this.tilesetUrl = tilesetUrl;
    this.meta = null;
    this.tiledefs = null;

    this.tileset = null;
    this.tileSize = 32;
    this.cols = 45;

    this.chunkTiles = 128;
    this.chunkPx = this.chunkTiles * this.tileSize;

    this.chunkCache = new Map(); // key -> {canvas, img}
    this.tileAvg = new Map(); // tileId -> [r,g,b]
  }

  async init(){
    this.meta = await (await fetch(`${this.baseUrl}/meta.json`)).json();
    this.tiledefs = await (await fetch(`${this.baseUrl}/tiles.json`)).json();
    this.tileSize = this.meta.tileSize;
    this.cols = this.meta.atlasCols;
    this.chunkTiles = this.meta.chunkTiles;
    this.chunkPx = this.chunkTiles * this.tileSize;

    this.tileset = await loadImage(this.tilesetUrl);

    // Precompute average colors for a handful of tiles for minimap speed
    const pick = new Set([
      ...(this.tiledefs.grass_ids||[]),
      ...(this.tiledefs.dirt_ids||[]),
      ...(this.tiledefs.sand_ids||[]),
      ...(this.tiledefs.water_ids||[]),
      ...(this.tiledefs.path_ids||[]),
      ...(this.tiledefs.cliff_ids||[]),
    ]);
    for (const id of pick) this.tileAvg.set(id, avgTileColor(this.tileset, id, this.tileSize, this.cols));
  }

  worldToTile(wx, wy){
    return { tx: Math.floor(wx / this.tileSize), ty: Math.floor(wy / this.tileSize) };
  }

  tileToChunk(tx, ty){
    return { cx: Math.floor(tx / this.chunkTiles), cy: Math.floor(ty / this.chunkTiles) };
  }

  _key(cx, cy){ return `${cx},${cy}`; }

  async _fetchChunk(cx, cy){
    const url = `${this.baseUrl}/chunks/c_${cx}_${cy}.json`;
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  }

  _decodeRle(rle, total){
    const arr = new Uint16Array(total);
    let i=0;
    for (const [count, value] of rle){
      arr.fill(value, i, i+count);
      i += count;
      if (i >= total) break;
    }
    return arr;
  }

  async _getChunk(cx, cy){
    const key = this._key(cx, cy);
    const cached = this.chunkCache.get(key);
    if (cached) return cached;

    // bounds (static overworld size)
    const maxTiles = this.meta.worldTiles;
    const maxChunks = Math.ceil(maxTiles / this.chunkTiles);
    if (cx < 0 || cy < 0 || cx >= maxChunks || cy >= maxChunks){
      // outside world: solid void
      const ch = this._makeSolidChunk(0, true, "Void");
      this.chunkCache.set(key, ch);
      return ch;
    }

    const data = await this._fetchChunk(cx, cy);
    let tiles;
    let missing = false;
    if (!data){
      // inside bounds but missing chunk file: treat as water (not solid) so it still looks okay.
      missing = true;
      tiles = new Uint16Array(this.chunkTiles*this.chunkTiles);
      tiles.fill((this.tiledefs.water_ids||[0])[0]);
    } else {
      tiles = this._decodeRle(data.rle, data.w*data.h);
    }

    const canvas = document.createElement("canvas");
    canvas.width = this.chunkPx;
    canvas.height = this.chunkPx;
    const g = canvas.getContext("2d");
    g.imageSmoothingEnabled = false;

    // render tiles
    for (let y=0; y<this.chunkTiles; y++){
      for (let x=0; x<this.chunkTiles; x++){
        const id = tiles[y*this.chunkTiles + x];
        this._drawTile(g, id, x*this.tileSize, y*this.tileSize);
      }
    }

    const chunk = { canvas, tiles, cx, cy, missing };
    this.chunkCache.set(key, chunk);

    // basic memory cap
    if (this.chunkCache.size > 64){
      const firstKey = this.chunkCache.keys().next().value;
      this.chunkCache.delete(firstKey);
    }
    return chunk;
  }

  _makeSolidChunk(tileId, solid, name){
    const tiles = new Uint16Array(this.chunkTiles*this.chunkTiles);
    tiles.fill(tileId);
    const canvas = document.createElement("canvas");
    canvas.width = this.chunkPx; canvas.height = this.chunkPx;
    const g = canvas.getContext("2d");
    g.fillStyle = "#000"; g.fillRect(0,0,canvas.width,canvas.height);
    return { canvas, tiles, cx:0, cy:0, missing:false, solidOverride:solid, nameOverride:name };
  }

  _drawTile(ctx, tileId, dx, dy){
    const ts = this.tileSize;
    const col = tileId % this.cols;
    const row = Math.floor(tileId / this.cols);
    const sx = col * ts;
    const sy = row * ts;
    ctx.drawImage(this.tileset, sx, sy, ts, ts, dx, dy, ts, ts);
  }

  _tileInfo(tileId){
    const solidSet = new Set(this.tiledefs.solid_ids || []);
    const waterSet = new Set(this.tiledefs.water_ids || []);
    const sandSet = new Set(this.tiledefs.sand_ids || []);
    const grassSet = new Set(this.tiledefs.grass_ids || []);
    const pathSet = new Set(this.tiledefs.path_ids || []);
    const dirtSet = new Set(this.tiledefs.dirt_ids || []);

    let name = "Tile";
    if (waterSet.has(tileId)) name = "Water";
    else if (sandSet.has(tileId)) name = "Sand";
    else if (pathSet.has(tileId)) name = "Path";
    else if (dirtSet.has(tileId)) name = "Dirt";
    else if (grassSet.has(tileId)) name = "Grass";

    const slowMap = this.tiledefs.slow_ids || {};
    const slow = slowMap[String(tileId)] ?? (waterSet.has(tileId) ? 0.6 : 1.0);
    const solid = solidSet.has(tileId);
    return { name, slow, solid };
  }

  sampleTileWorld(wx, wy){
    const { tx, ty } = this.worldToTile(wx, wy);
    const { cx, cy } = this.tileToChunk(tx, ty);
    const key = this._key(cx, cy);
    const chunk = this.chunkCache.get(key);
    // If chunk not yet loaded, assume grass (no collision) for smooth movement; load will catch up visually.
    if (!chunk) return { name:"Loading", slow:1.0, solid:false };

    const lx = tx - cx*this.chunkTiles;
    const ly = ty - cy*this.chunkTiles;
    const id = chunk.tiles[ly*this.chunkTiles + lx];
    const info = this._tileInfo(id);
    if (chunk.solidOverride) return { name: chunk.nameOverride || "Void", slow:1.0, solid:true };
    return info;
  }

  drawVisible(ctx, game, left, top, right, bottom){
    const ts = this.tileSize;
    const z = game.cam.zoom;

    const tL = Math.floor(left / ts) - 2;
    const tR = Math.floor(right / ts) + 2;
    const tT = Math.floor(top / ts) - 2;
    const tB = Math.floor(bottom / ts) + 2;

    const cL = Math.floor(tL / this.chunkTiles);
    const cR = Math.floor(tR / this.chunkTiles);
    const cT = Math.floor(tT / this.chunkTiles);
    const cB = Math.floor(tB / this.chunkTiles);

    for (let cy=cT; cy<=cB; cy++){
      for (let cx=cL; cx<=cR; cx++){
        // kick async load
        this._getChunk(cx, cy);
        const key = this._key(cx, cy);
        const ch = this.chunkCache.get(key);
        if (!ch) continue;

        const wx = cx*this.chunkPx;
        const wy = cy*this.chunkPx;
        const s = game._worldToScreen(wx, wy);
        ctx.drawImage(ch.canvas, s.x, s.y, this.chunkPx*z, this.chunkPx*z);

        // show "missing" watermark lightly
        if (ch.missing){
          ctx.save();
          ctx.globalAlpha = 0.20;
          ctx.fillStyle = "#000";
          ctx.font = `${Math.floor(14*z)}px ui-sans-serif, system-ui`;
          ctx.fillText("UNMAPPED", s.x + 12*z, s.y + 24*z);
          ctx.restore();
        }
      }
    }
  }

  drawMinimap(mctx, px, py){
    const w = mctx.canvas.width, h = mctx.canvas.height;
    mctx.clearRect(0,0,w,h);

    const ts = this.tileSize;
    const { tx:ptx, ty:pty } = this.worldToTile(px, py);

    // 1 pixel = 2 tiles
    const pxPerTile = 0.5;
    const img = mctx.createImageData(w,h);

    for (let y=0; y<h; y++){
      for (let x=0; x<w; x++){
        const tx = ptx + Math.floor((x - w/2) / pxPerTile);
        const ty = pty + Math.floor((y - h/2) / pxPerTile);
        const { cx, cy } = this.tileToChunk(tx, ty);
        const ch = this.chunkCache.get(this._key(cx, cy));
        let id = (this.tiledefs.grass_ids||[0])[0];
        if (ch){
          const lx = tx - cx*this.chunkTiles;
          const ly = ty - cy*this.chunkTiles;
          if (lx>=0 && ly>=0 && lx<this.chunkTiles && ly<this.chunkTiles){
            id = ch.tiles[ly*this.chunkTiles + lx];
          }
        }
        const rgb = this.tileAvg.get(id) || [80,120,90];
        const i = (y*w + x)*4;
        img.data[i+0]=rgb[0]; img.data[i+1]=rgb[1]; img.data[i+2]=rgb[2]; img.data[i+3]=255;
      }
    }
    mctx.putImageData(img,0,0);

    // player marker
    mctx.fillStyle = "#ffffff";
    mctx.fillRect(w/2 - 1, h/2 - 1, 3, 3);
    mctx.strokeStyle = "rgba(0,0,0,0.6)";
    mctx.strokeRect(w/2 - 1, h/2 - 1, 3, 3);
  }
}

function loadImage(url){
  return new Promise((resolve, reject)=>{
    const img = new Image();
    img.onload = ()=>resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function avgTileColor(img, tileId, ts, cols){
  const col = tileId % cols;
  const row = Math.floor(tileId / cols);
  const sx = col * ts;
  const sy = row * ts;
  const c = document.createElement("canvas");
  c.width = ts; c.height = ts;
  const g = c.getContext("2d");
  g.drawImage(img, sx, sy, ts, ts, 0, 0, ts, ts);
  const d = g.getImageData(0,0,ts,ts).data;
  let r=0,gc=0,b=0, n=0;
  for (let i=0;i<d.length;i+=4){
    const a=d[i+3];
    if (a<10) continue;
    r+=d[i]; gc+=d[i+1]; b+=d[i+2]; n++;
  }
  if (!n) return [0,0,0];
  return [Math.round(r/n), Math.round(gc/n), Math.round(b/n)];
}
