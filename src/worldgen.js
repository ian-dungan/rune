
export function makeRng(seedStr){
  // xmur3 + sfc32
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
  const seed = xmur3(seedStr);
  return sfc32(seed(), seed(), seed(), seed());
}

function noise2(rng, x, y){
  // simple value noise via hashing grid
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const h = (a,b)=> {
    let n = (a*374761393 + b*668265263) | 0;
    n = (n ^ (n >>> 13)) | 0;
    n = (n * 1274126177) | 0;
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  const v00=h(xi,yi), v10=h(xi+1,yi), v01=h(xi,yi+1), v11=h(xi+1,yi+1);
  const u = xf*xf*(3-2*xf);
  const v = yf*yf*(3-2*yf);
  const x1 = v00 + (v10-v00)*u;
  const x2 = v01 + (v11-v01)*u;
  return x1 + (x2-x1)*v;
}

export function generateWorld(meta){
  const w = meta.world.width, h = meta.world.height;
  const rng = makeRng(meta.seed || 'alttp');
  const biomeScale = meta.worldgen?.biomeScale ?? 0.045;

  // Layers store tile indices (0 = empty for overlays)
  const grass = new Uint16Array(w*h);
  const road = new Uint16Array(w*h);
  const water = new Uint16Array(w*h);
  const deco = new Uint16Array(w*h);
  const props = []; // objects with sprite frames + collision

  // Choose tile ids (1-based for Phaser Tiled-style). We'll map to Phaser tilesets directly.
  // Grass tiles in TX grass: use a few variations in the first row.
  const G = [1,2,3,4,9,10,11,12]; // looks like variants
  const DIRT = 17; // fallback
  // Road + water: base tile set we will autotile in renderer (mask->index). Use 1 as placeholder.
  const ROAD_BASE = 1;
  const WATER_BASE = 1;

  function idx(x,y){ return y*w+x; }

  // Base grass with soft biome bands
  for(let y=0;y<h;y++){
    for(let x=0;x<w;x++){
      const n = noise2(rng, x*biomeScale, y*biomeScale);
      const v = G[Math.floor(n*G.length)%G.length];
      grass[idx(x,y)] = v;
    }
  }

  // ALTTP-style macro layout anchors
  const castle = { x: Math.floor(w*0.52), y: Math.floor(h*0.26) };
  const village = { x: Math.floor(w*0.28), y: Math.floor(h*0.44) };
  const lake = { x: Math.floor(w*0.70), y: Math.floor(h*0.70), r: Math.floor(Math.min(w,h)*0.12) };

  // Mountain ridge north
  const mountainBandY = Math.floor(h*0.12);
  // desert southeast
  const desertRect = { x0: Math.floor(w*0.70), y0: Math.floor(h*0.38), x1: Math.floor(w*0.92), y1: Math.floor(h*0.58) };
  // forest west
  const forestRect = { x0: Math.floor(w*0.06), y0: Math.floor(h*0.22), x1: Math.floor(w*0.34), y1: Math.floor(h*0.58) };

  // Paint biome accents via deco tiles (plant sheet) and props
  function inRect(x,y,r){ return x>=r.x0 && x<=r.x1 && y>=r.y0 && y<=r.y1; }

  // Water: Lake + river from mountains to lake
  for(let y=0;y<h;y++){
    for(let x=0;x<w;x++){
      const dx=x-lake.x, dy=y-lake.y;
      if(dx*dx+dy*dy <= lake.r*lake.r){
        water[idx(x,y)] = WATER_BASE;
      }
    }
  }
  // River: polyline
  const river = [
    {x: Math.floor(w*0.62), y: mountainBandY+6},
    {x: Math.floor(w*0.58), y: Math.floor(h*0.28)},
    {x: Math.floor(w*0.64), y: Math.floor(h*0.42)},
    {x: Math.floor(w*0.68), y: Math.floor(h*0.55)},
    {x: Math.floor(w*0.70), y: Math.floor(h*0.62)},
    {x: Math.floor(w*0.69), y: Math.floor(h*0.66)},
    {x: Math.floor(w*0.70), y: Math.floor(h*0.70)},
  ];
  function drawThickLine(points, thickness){
    for(let i=0;i<points.length-1;i++){
      const a=points[i], b=points[i+1];
      const dx=b.x-a.x, dy=b.y-a.y;
      const steps = Math.max(Math.abs(dx), Math.abs(dy));
      for(let s=0;s<=steps;s++){
        const t=s/steps;
        const x=Math.round(a.x+dx*t), y=Math.round(a.y+dy*t);
        for(let oy=-thickness;oy<=thickness;oy++){
          for(let ox=-thickness;ox<=thickness;ox++){
            const xx=x+ox, yy=y+oy;
            if(xx<0||yy<0||xx>=w||yy>=h) continue;
            if(ox*ox+oy*oy <= thickness*thickness){
              water[idx(xx,yy)] = WATER_BASE;
            }
          }
        }
      }
    }
  }
  drawThickLine(river, 2);

  // Roads: connect village -> castle -> lake, plus a south road
  function paintRoadPath(path){
    drawThickLine(path, 1);
    for(let y=0;y<h;y++){
      for(let x=0;x<w;x++){
        if(water[idx(x,y)]===WATER_BASE) continue;
      }
    }
  }
  // We'll reuse drawThickLine but write to road layer instead of water
  function drawRoad(points, thickness){
    for(let i=0;i<points.length-1;i++){
      const a=points[i], b=points[i+1];
      const dx=b.x-a.x, dy=b.y-a.y;
      const steps = Math.max(Math.abs(dx), Math.abs(dy));
      for(let s=0;s<=steps;s++){
        const t=s/steps;
        const x=Math.round(a.x+dx*t), y=Math.round(a.y+dy*t);
        for(let oy=-thickness;oy<=thickness;oy++){
          for(let ox=-thickness;ox<=thickness;ox++){
            const xx=x+ox, yy=y+oy;
            if(xx<0||yy<0||xx>=w||yy>=h) continue;
            if(ox*ox+oy*oy <= thickness*thickness){
              if(water[idx(xx,yy)]!==0) continue; // don't pave over water
              road[idx(xx,yy)] = ROAD_BASE;
            }
          }
        }
      }
    }
  }
  drawRoad([{x:village.x,y:village.y},{x:castle.x,y:castle.y},{x:lake.x-10,y:lake.y-8},{x:lake.x-2,y:lake.y-2}], 1);
  drawRoad([{x:village.x,y:village.y},{x:Math.floor(w*0.22),y:Math.floor(h*0.78)}], 1);
  drawRoad([{x:Math.floor(w*0.48),y:Math.floor(h*0.90)},{x:lake.x-12,y:lake.y+22}], 1);

  // Clearings (town/castle plazas)
  function clearCircle(cx,cy,r){
    for(let y=cy-r;y<=cy+r;y++){
      for(let x=cx-r;x<=cx+r;x++){
        if(x<0||y<0||x>=w||y>=h) continue;
        const dx=x-cx, dy=y-cy;
        if(dx*dx+dy*dy<=r*r){
          deco[idx(x,y)]=0;
        }
      }
    }
  }
  clearCircle(village.x, village.y, 10);
  clearCircle(castle.x, castle.y, 12);

  // Decorations + props (Zelda-ish clustering)
  const plantTiles = [ 5,6,7,8, 21,22,23,24, 37,38,39,40 ];
  const rockFrames = [ 33,34,35,36 ]; // props sheet guess
  const treeFrames = [ 1,2,3,4, 17,18,19,20 ]; // guess
  function placeDecoDensity(rect, density){
    for(let y=rect.y0;y<=rect.y1;y++){
      for(let x=rect.x0;x<=rect.x1;x++){
        if(water[idx(x,y)]!==0 || road[idx(x,y)]!==0) continue;
        const n = noise2(rng, x*0.14, y*0.14);
        if(n < density){
          deco[idx(x,y)] = plantTiles[Math.floor(n*plantTiles.length)%plantTiles.length];
        }
      }
    }
  }
  placeDecoDensity(forestRect, 0.22);
  placeDecoDensity({x0:0,y0:0,x1:w-1,y1:h-1}, 0.06);

  // Forest trees as collidable props (placed sparsely)
  function addProp(x,y, kind){
    props.push({ x, y, kind });
  }
  for(let y=forestRect.y0;y<=forestRect.y1;y++){
    for(let x=forestRect.x0;x<=forestRect.x1;x++){
      if(water[idx(x,y)]!==0 || road[idx(x,y)]!==0) continue;
      const n = noise2(rng, x*0.08, y*0.08);
      if(n > 0.76){
        addProp(x,y,'tree');
      }
    }
  }

  // Mountain band as rocks (north)
  for(let y=0;y<mountainBandY+6;y++){
    for(let x=0;x<w;x++){
      const n = noise2(rng, x*0.05, y*0.05);
      if(n > 0.62){
        addProp(x,y,'rock');
      }
    }
  }

  // Desert zone: change grass to drier variant + rocks
  for(let y=desertRect.y0;y<=desertRect.y1;y++){
    for(let x=desertRect.x0;x<=desertRect.x1;x++){
      if(water[idx(x,y)]!==0) continue;
      grass[idx(x,y)] = DIRT;
      const n = noise2(rng, x*0.09, y*0.09);
      if(n > 0.74) addProp(x,y,'rock');
    }
  }

  // Ensure spawn near village road
  const spawn = { x: village.x, y: village.y+8 };

  return {
    width:w, height:h, spawn,
    layers: { grass, road, water, deco },
    props
  };
}

export const AUTOTILE_4BIT = {
  0: 1, 1: 2, 2: 3, 3: 4,
  4: 5, 5: 6, 6: 7, 7: 8,
  8: 9, 9:10,10:11,11:12,
 12:13,13:14,14:15,15:16
};
