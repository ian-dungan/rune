// Deterministic overworld generator (A Link to the Past inspired continent).
// Generates region_{rx}_{ry}.json content on the fly with a fixed seed.
// No procedural surprises: same seed => same world on every device.

export const WorldGen = (() => {
  // --- PRNG helpers (deterministic) ---
  function xmur3(str){
    let h = 1779033703 ^ str.length;
    for (let i=0;i<str.length;i++){
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function(){
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      return (h ^= (h >>> 16)) >>> 0;
    };
  }
  function mulberry32(a){
    return function(){
      let t = (a += 0x6D2B79F5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function rngFrom(seed, x, y){
    const h = xmur3(`${seed}|${x}|${y}`)();
    return mulberry32(h);
  }

  // Smooth value noise (cheap, good enough for map features)
  function lerp(a,b,t){ return a + (b-a)*t; }
  function smoothstep(t){ return t*t*(3-2*t); }
  function hash2(seed, x, y){
    // 0..1 deterministic
    const r = rngFrom(seed, x|0, y|0);
    return r();
  }
  function valueNoise(seed, x, y){
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const a = hash2(seed, xi, yi);
    const b = hash2(seed, xi+1, yi);
    const c = hash2(seed, xi, yi+1);
    const d = hash2(seed, xi+1, yi+1);
    const u = smoothstep(xf), v = smoothstep(yf);
    return lerp(lerp(a,b,u), lerp(c,d,u), v);
  }
  function fbm(seed, x, y){
    let sum=0, amp=0.5, freq=0.008;
    for(let i=0;i<5;i++){
      sum += amp * valueNoise(seed, x*freq, y*freq);
      amp *= 0.5;
      freq *= 2;
    }
    return sum; // ~0..1
  }

  // --- World style knobs (tweakable) ---
  const TILES = {
    grass: [0,1,2,3],
    dirt:  [0,1,2],
    stone: [0,1,2,3],
    water: [0,1,2,3]
  };

  function pick(arr, r){ return arr[Math.floor(r()*arr.length)]; }

  // Major landmarks in WORLD TILE coordinates (not pixels)
  function landmarks(seed){
    // Kakariko-ish town near center-left, castle-ish near center, lake south-east, mountain north-west
    const base = {
      town: {x: 2200, y: 2100},
      castle: {x: 2600, y: 1900},
      lake: {x: 3200, y: 2600, r: 260},
      mountain: {x: 1700, y: 1500, r: 420},
      swamp: {x: 2900, y: 3050, r: 320},
      desert: {x: 3600, y: 1850, r: 420}
    };
    // small deterministic offsets per seed
    const r = rngFrom(seed, 999, 999);
    for(const k of Object.keys(base)){
      base[k].x += Math.floor((r()-0.5)*180);
      base[k].y += Math.floor((r()-0.5)*180);
    }
    return base;
  }

  // River function: meandering line from mountain toward lake
  function riverDistance(seed, x, y, lm){
    // define param along x axis, compute center y
    const t = (x - lm.mountain.x) / (lm.lake.x - lm.mountain.x);
    if(t < -0.2 || t > 1.2) return 9999;
    const nx = x * 0.004;
    const meander = (valueNoise(seed+"|river", nx, 0) - 0.5) * 220;
    const centerY = lerp(lm.mountain.y+80, lm.lake.y-60, t) + meander;
    return Math.abs(y - centerY);
  }

  function biome(seed, x, y, lm){
    // Base height
    const h = fbm(seed+"|h", x, y);
    // Mountain bump
    const dxm = x-lm.mountain.x, dym = y-lm.mountain.y;
    const m = Math.exp(-(dxm*dxm+dym*dym)/(2*lm.mountain.r*lm.mountain.r));
    // Desert bump
    const dxd = x-lm.desert.x, dyd=y-lm.desert.y;
    const des = Math.exp(-(dxd*dxd+dyd*dyd)/(2*lm.desert.r*lm.desert.r));
    // Swamp lowlands
    const dxs = x-lm.swamp.x, dys=y-lm.swamp.y;
    const sw = Math.exp(-(dxs*dxs+dys*dys)/(2*lm.swamp.r*lm.swamp.r));

    const height = h + 0.65*m - 0.35*sw;

    // Lake & river water mask
    const dxl=x-lm.lake.x, dyl=y-lm.lake.y;
    const lakeDist = Math.sqrt(dxl*dxl+dyl*dyl);
    const riverDist = riverDistance(seed, x, y, lm);
    const water = (lakeDist < lm.lake.r) || (riverDist < 10);

    if(water) return "water";
    if(m > 0.35 && height > 0.75) return "mountain";
    if(des > 0.35 && height > 0.45) return "desert";
    if(sw > 0.35) return "swamp";
    if(height < 0.35) return "meadow";
    return "forest";
  }

  function tileFor(seed, x, y, kind){
    const r = rngFrom(seed, x, y);
    // coarse variation so it doesn't look noisy
    const v = r();
    if(kind==="water") return pick(TILES.water, r);
    if(kind==="stone") return pick(TILES.stone, r);
    if(kind==="dirt")  return pick(TILES.dirt, r);
    // grass variants by biome
    if(kind==="grass"){
      return (v<0.70)?0:(v<0.88)?1:(v<0.96)?2:3;
    }
    return 0;
  }

  function generateRegion(rx, ry, tilesets, meta){
    const TILE=meta.tileSize||32;
    const CHUNK=meta.chunkSize||32;
    const REGION_CHUNKS=meta.regionChunks||10;
    const seed = meta.seed || "alttp-continent-001";
    const lm = landmarks(seed);

    const chunks=[];
    const baseChunkX = rx*REGION_CHUNKS;
    const baseChunkY = ry*REGION_CHUNKS;

    for(let cY=0;cY<REGION_CHUNKS;cY++){
      for(let cX=0;cX<REGION_CHUNKS;cX++){
        const absCx = baseChunkX + cX;
        const absCy = baseChunkY + cY;

        const ground = new Array(CHUNK*CHUNK);
        const ground_stone = new Array(CHUNK*CHUNK).fill(-1);
        const ground_water = new Array(CHUNK*CHUNK).fill(-1);
        const decorations = new Array(CHUNK*CHUNK).fill(-1);
        const objects = new Array(CHUNK*CHUNK).fill(-1);
        const shadows = new Array(CHUNK*CHUNK).fill(-1);

        for(let ty=0;ty<CHUNK;ty++){
          for(let tx=0;tx<CHUNK;tx++){
            const worldTileX = absCx*CHUNK + tx;
            const worldTileY = absCy*CHUNK + ty;
            const b = biome(seed, worldTileX, worldTileY, lm);

            const idx = ty*CHUNK + tx;
            if(b==="water"){
              ground[idx] = tileFor(seed, worldTileX, worldTileY, "grass"); // keep base, doesn't matter
              ground_water[idx] = tileFor(seed, worldTileX, worldTileY, "water");
            }else{
              ground[idx] = tileFor(seed, worldTileX, worldTileY, "grass");
              // simple biome tinting by swapping some grass to dirt
              if(b==="desert" && rngFrom(seed+"|d", worldTileX, worldTileY)() < 0.35){
                // dirt under desert (use ground_dirt if you add it later)
                // for now we just vary grass tile more
              }
              if(b==="swamp" && rngFrom(seed+"|s", worldTileX, worldTileY)() < 0.18){
                decorations[idx] = 0; // placeholder plant tile index
              }
            }
          }
        }

        // Deterministic "road graph": draw major roads in world space (stone layer)
        // Vertical main road near castle/town
        const roadX = lm.castle.x - 40;
        const roadY = lm.town.y + 10;
        for(let ty=0;ty<CHUNK;ty++){
          for(let tx=0;tx<CHUNK;tx++){
            const worldTileX = absCx*CHUNK + tx;
            const worldTileY = absCy*CHUNK + ty;
            const idx = ty*CHUNK + tx;

            // North-south road
            if(Math.abs(worldTileX - roadX) <= 1 && Math.abs(worldTileY - roadY) < 900){
              if(ground_water[idx] === -1) ground_stone[idx] = tileFor(seed, worldTileX, worldTileY, "stone");
            }
            // East-west road connecting town -> castle -> desert
            const ewY = lm.castle.y + 10;
            if(Math.abs(worldTileY - ewY) <= 1 && worldTileX > lm.town.x-260 && worldTileX < lm.desert.x+260){
              if(ground_water[idx] === -1) ground_stone[idx] = tileFor(seed, worldTileX, worldTileY, "stone");
            }
          }
        }

        chunks.push({
          cx: absCx,
          cy: absCy,
          layers: {
            ground: { tileset: "grass", data: ground },
            ground_water: { tileset: "water1", data: ground_water },
            ground_stone: { tileset: "stone", data: ground_stone },
            decorations: { tileset: "plant", data: decorations },
            shadows: { tileset: "shadowPlant", data: shadows },
            objects: { tileset: "plant", data: objects }
          }
        });
      }
    }
    return chunks;
  }

  return { generateRegion };
})();
