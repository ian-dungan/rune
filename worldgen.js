// Deterministic, ALTTP-inspired continent generator (fixed seed).
// Generates chunks on-demand, always producing the same world for the same seed.

const TILE = 32;
const CHUNK = 32;

function xmur3(str){
  // Simple string hash -> 32-bit
  let h = 1779033703 ^ str.length;
  for(let i=0; i<str.length; i++){
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function(){
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= (h >>> 16);
    return h >>> 0;
  };
}

function sfc32(a,b,c,d){
  return function(){
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

// Hash-based deterministic random for integer coords
function rand01(seedU32, x, y){
  // mix x,y with seed
  let h = seedU32 ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= (h >>> 16);
  return (h >>> 0) / 4294967296;
}

function lerp(a,b,t){ return a + (b-a)*t; }
function fade(t){ return t*t*(3-2*t); }

// Value noise with bilinear interpolation (deterministic)
function valueNoise(seedU32, x, y, scale){
  const gx = Math.floor(x/scale);
  const gy = Math.floor(y/scale);
  const fx = (x/scale) - gx;
  const fy = (y/scale) - gy;

  const v00 = rand01(seedU32, gx, gy);
  const v10 = rand01(seedU32, gx+1, gy);
  const v01 = rand01(seedU32, gx, gy+1);
  const v11 = rand01(seedU32, gx+1, gy+1);

  const u = fade(fx);
  const v = fade(fy);
  const a = lerp(v00, v10, u);
  const b = lerp(v01, v11, u);
  return lerp(a, b, v);
}

function fbm(seedU32, x, y, baseScale){
  let amp = 1.0, freq = 1.0, sum = 0.0, norm = 0.0;
  for(let i=0; i<4; i++){
    const n = valueNoise(seedU32, x*freq, y*freq, baseScale);
    sum += n * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.0;
  }
  return sum / norm;
}

export class WorldGen{
  constructor(seed){
    this.seed = seed || "alttp-continent-001";
    const h = xmur3(this.seed);
    this.seedU32 = h();
    // deterministic global RNG for landmark placement (not per-tile)
    const h2 = xmur3(this.seed + ":rng");
    this.rng = sfc32(h2(), h2(), h2(), h2());
    // Landmark anchors (in tile coords) - stable for the seed
    this.spawnTile = { x: 160, y: 160 }; // default; meta.spawn overrides
    this.lake = { x: 220, y: 210, r: 18 };
    this.castle = { x: 170, y: 110 };
    this.village = { x: 120, y: 165 };
    this.desert = { x: 280, y: 170 };
  }

  _applyMeta(meta){
    if(meta && meta.spawn){
      this.spawnTile = {
        x: Math.floor((meta.spawn.x || 0) / TILE),
        y: Math.floor((meta.spawn.y || 0) / TILE)
      };
    }
    // Place some anchors relative to spawn (stable but "designed")
    this.castle = { x: this.spawnTile.x + 10, y: this.spawnTile.y - 45 };
    this.village = { x: this.spawnTile.x - 40, y: this.spawnTile.y + 5 };
    this.lake = { x: this.spawnTile.x + 55, y: this.spawnTile.y + 45, r: 20 };
    this.desert = { x: this.spawnTile.x + 120, y: this.spawnTile.y + 10 };
  }

  generateChunk(cx, cy, meta){
    this._applyMeta(meta);

    const grass = new Array(CHUNK*CHUNK).fill(-1);
    const dirt  = new Array(CHUNK*CHUNK).fill(-1);
    const stone = new Array(CHUNK*CHUNK).fill(-1);
    const water = new Array(CHUNK*CHUNK).fill(-1);
    const deco  = new Array(CHUNK*CHUNK).fill(-1);
    const trees = new Array(CHUNK*CHUNK).fill(-1);
    const objs  = new Array(CHUNK*CHUNK).fill(-1);
    const shad  = new Array(CHUNK*CHUNK).fill(-1);

    const baseX = cx * CHUNK;
    const baseY = cy * CHUNK;

    for(let ly=0; ly<CHUNK; ly++){
      for(let lx=0; lx<CHUNK; lx++){
        const tx = baseX + lx;
        const ty = baseY + ly;
        const idx = ly*CHUNK + lx;

        // Macro fields
        const h = fbm(this.seedU32, tx, ty, 96);        // height-ish
        const m = fbm(this.seedU32^0xA53A, tx+5000, ty-5000, 128); // moisture
        const heat = fbm(this.seedU32^0x19F1, tx-8000, ty+2000, 160);

        // Height shaping: gentle continent "slope" so it's not all water
        // (continent feel, not island)
        const slope = clamp01(0.35 + 0.65 * (1.0 - Math.abs((ty - this.spawnTile.y)/900)));
        const height = clamp01(0.25 + 0.75*h) * slope;

        // River: a wandering band originating from "mountains" north of spawn and feeding the lake
        const riverWobble = (fbm(this.seedU32^0xBEEF, tx, ty, 48) - 0.5) * 10.0;
        const riverCenter = lerp(this.castle.y, this.lake.y, clamp01((tx - this.castle.x) / (this.lake.x - this.castle.x))) + riverWobble;
        const riverWidth = 2.2 + fbm(this.seedU32^0xC0DE, tx, ty, 64) * 1.8;
        const isRiver = Math.abs(ty - riverCenter) < riverWidth && tx > Math.min(this.castle.x, this.lake.x) - 40 && tx < Math.max(this.castle.x, this.lake.x) + 40;

        // Lake
        const dxL = tx - this.lake.x;
        const dyL = ty - this.lake.y;
        const isLake = (dxL*dxL + dyL*dyL) < (this.lake.r*this.lake.r);

        // Roads: main cross through spawn + connectors to landmarks
        const roadWob = (valueNoise(this.seedU32^0xD00D, tx, ty, 64)-0.5) * 2.0;
        const isMainEW = Math.abs(ty - (this.spawnTile.y + roadWob)) <= 1;
        const isMainNS = Math.abs(tx - (this.spawnTile.x + roadWob)) <= 1;

        const isToCastle = distPointToSegment(tx,ty, this.spawnTile.x,this.spawnTile.y, this.castle.x,this.castle.y) < 1.4;
        const isToVillage = distPointToSegment(tx,ty, this.spawnTile.x,this.spawnTile.y, this.village.x,this.village.y) < 1.4;
        const isToLake = distPointToSegment(tx,ty, this.spawnTile.x,this.spawnTile.y, this.lake.x,this.lake.y) < 1.4;

        const isRoad = isMainEW || isMainNS || isToCastle || isToVillage || isToLake;

        // Biomes
        const isMountain = height > 0.78;
        const isForest = (m > 0.58 && height > 0.38) && heat < 0.62;
        const isDesert = (heat > 0.68 && m < 0.42 && height > 0.35) || (dist2(tx,ty,this.desert.x,this.desert.y) < 45*45);

        // Water first
        if(isLake || isRiver || height < 0.20){
          water[idx] = 0; // base water tile
          // add occasional water sparkle/variation
          if(rand01(this.seedU32, tx, ty) > 0.92) water[idx] = 1;
          continue;
        }

        // Ground
        if(isRoad){
          stone[idx] = 0;
          // widen roads slightly on the mains
          if(isMainEW && Math.abs(ty - this.spawnTile.y) <= 0) stone[idx] = 0;
        } else if(isMountain){
          stone[idx] = (rand01(this.seedU32, tx, ty) > 0.7) ? 3 : 2;
        } else if(isDesert){
          dirt[idx] = (rand01(this.seedU32^0x3333, tx, ty) > 0.6) ? 2 : 1;
        } else {
          // lush grass with subtle variation
          const r = rand01(this.seedU32^0x1234, tx, ty);
          grass[idx] = (r < 0.78) ? 0 : (r < 0.92 ? 1 : 2);
          // occasional dirt patches for texture
          if(rand01(this.seedU32^0x2222, tx, ty) > 0.985) dirt[idx] = 0;
        }

        // Decorations (flowers/tufts)
        if(!isRoad && !isMountain){
          const p = rand01(this.seedU32^0xF00D, tx, ty);
          if(p > 0.995 && !isDesert) deco[idx] = 0; // flower
          else if(p > 0.99) deco[idx] = 1;          // another flower
        }

        // Forest trees & bushes
        if(isForest && !isRoad && !isMountain){
          const t = rand01(this.seedU32^0xCAFE, tx, ty);
          if(t > 0.965){
            // treetop tile indices: keep within 0-7
            trees[idx] = Math.floor(rand01(this.seedU32^0xBADA, tx, ty) * 8);
            // subtle shadow under trees (from shadowPlant sheet)
            shad[idx] = 0;
          } else if(t > 0.94){
            // bush from plant tileset (use a few known bush-ish indices)
            const b = [96,98,100,102,104];
            objs[idx] = b[Math.floor(rand01(this.seedU32^0xB055, tx, ty) * b.length)];
            shad[idx] = 16; // soft shadow
          }
        }

        // Landmarks: small stone "ruin" clusters near village/castle/lake
        if(dist2(tx,ty,this.village.x,this.village.y) < 14*14 && rand01(this.seedU32^0x7777, tx, ty) > 0.992){
          objs[idx] = 40; // props-ish index (adjustable)
        }
        if(dist2(tx,ty,this.castle.x,this.castle.y) < 16*16 && rand01(this.seedU32^0x8888, tx, ty) > 0.991){
          stone[idx] = 5;
        }
      }
    }

    return {
      cx, cy,
      layers: {
        ground_grass: { tileset: "grass1", data: grass },
        ground_dirt:  { tileset: "dirt1",  data: dirt },
        ground_stone: { tileset: "stone",  data: stone },
        ground_water: { tileset: "water1", data: water },
        shadows:      { tileset: "shadowPlant", data: shad },
        decorations:  { tileset: "flowers", data: deco },
        trees:        { tileset: "lpcTreetop", data: trees },
        objects:      { tileset: "plant", data: objs }
      }
    };
  }
}

function clamp01(v){ return v < 0 ? 0 : (v > 1 ? 1 : v); }
function dist2(x,y,x2,y2){ const dx=x-x2, dy=y-y2; return dx*dx+dy*dy; }
function distPointToSegment(px,py,x1,y1,x2,y2){
  const vx=x2-x1, vy=y2-y1;
  const wx=px-x1, wy=py-y1;
  const c1 = vx*wx + vy*wy;
  if(c1 <= 0) return Math.hypot(px-x1, py-y1);
  const c2 = vx*vx + vy*vy;
  if(c2 <= c1) return Math.hypot(px-x2, py-y2);
  const b = c1 / c2;
  const bx = x1 + b*vx, by = y1 + b*vy;
  return Math.hypot(px-bx, py-by);
}
