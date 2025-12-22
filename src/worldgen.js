// MULTIPLAYER RPG OVERWORLD - Wide open spaces with distinct regions
export function makeRng(seedStr){
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

export function generateWorld(meta){
  const W = 256;
  const H = 256;
  
  const grass = new Uint16Array(W * H);
  const road = new Uint16Array(W * H);
  const water = new Uint16Array(W * H);
  const deco = new Uint16Array(W * H);
  const props = [];
  
  // BASE: Light grass everywhere (tile 1)
  grass.fill(1);
  
  // ===== REGIONS =====
  
  // MOUNTAINS - North edge (rocky terrain, tile 5)
  for(let y=0; y<25; y++){
    for(let x=0; x<W; x++){
      grass[y*W + x] = 5;
    }
  }
  
  // FOREST - Northwest quadrant (dark grass, tile 9)
  for(let y=25; y<110; y++){
    for(let x=10; x<90; x++){
      grass[y*W + x] = 9;
    }
  }
  
  // DESERT - Southwest (sand, tile 17)
  for(let y=150; y<240; y++){
    for(let x=10; x<100; x++){
      grass[y*W + x] = 17;
    }
  }
  
  // BEACH - South edge (sand, tile 17)
  for(let y=240; y<H; y++){
    for(let x=0; x<W; x++){
      grass[y*W + x] = 17;
    }
  }
  
  // EASTERN PLAINS - Wide open space (keep light grass, tile 1)
  // This is 100-250 x, 25-200 y - huge open area for multiplayer
  
  // ===== WATER =====
  
  // Ocean - South coast
  for(let y=245; y<H; y++){
    for(let x=0; x<W; x++){
      water[y*W + x] = 1;
    }
  }
  
  // Large lake - East side
  for(let y=140; y<180; y++){
    for(let x=180; x<230; x++){
      water[y*W + x] = 1;
    }
  }
  
  // River from mountains to lake
  drawWaterPath(water, 130, 22, 145, 50, 2, W);
  drawWaterPath(water, 145, 50, 170, 90, 2, W);
  drawWaterPath(water, 170, 90, 185, 140, 2, W);
  
  // ===== ROADS - Connecting all regions =====
  
  // Main east-west road (through center)
  for(let x=0; x<W; x++){
    drawRoad(road, water, x, 128, 2, W);
  }
  
  // North-south road (through center) 
  for(let y=25; y<240; y++){
    if(!water[y*W + 128]){
      drawRoad(road, water, 128, y, 2, W);
    }
  }
  
  // Road to forest town
  drawRoadPath(road, water, 128, 128, 50, 70, 2, W);
  
  // Road to desert town
  drawRoadPath(road, water, 128, 128, 55, 200, 2, W);
  
  // ===== TOWNS (clear plazas) =====
  
  const castle = {x: 128, y: 65};
  const forestTown = {x: 50, y: 70};
  const plainsTown = {x: 200, y: 100};
  const desertTown = {x: 55, y: 200};
  
  clearArea(grass, water, road, castle.x, castle.y, 12, 1);
  clearArea(grass, water, road, forestTown.x, forestTown.y, 10, 9);
  clearArea(grass, water, road, plainsTown.x, plainsTown.y, 10, 1);
  clearArea(grass, water, road, desertTown.x, desertTown.y, 10, 17);
  
  // ===== MINIMAL PROPS (just enough to show regions) =====
  
  // Forest trees - sparse
  for(let y=35; y<105; y+=15){
    for(let x=20; x<85; x+=15){
      if(!water[y*W + x] && !road[y*W + x] && (x+y) % 3 === 1){
        props.push({x, y});
      }
    }
  }
  
  // Plains trees - very sparse
  for(let y=50; y<190; y+=25){
    for(let x=100; x<240; x+=25){
      if(!water[y*W + x] && !road[y*W + x] && (x*y) % 7 === 3){
        props.push({x, y});
      }
    }
  }
  
  console.log(`[WORLDGEN] Created multiplayer world: ${props.length} props, 4 towns`);
  
  return {
    width: W,
    height: H,
    spawn: castle,
    layers: { grass, road, water, deco },
    props
  };
}

function drawWaterPath(water, x0, y0, x1, y1, thickness, W){
  const dx = x1-x0, dy = y1-y0;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  for(let s=0; s<=steps; s++){
    const t = s/steps;
    const x = Math.round(x0 + dx*t);
    const y = Math.round(y0 + dy*t);
    for(let r=0; r<=thickness; r++){
      for(let angle=0; angle<8; angle++){
        const xx = x + Math.round(r * Math.cos(angle * Math.PI/4));
        const yy = y + Math.round(r * Math.sin(angle * Math.PI/4));
        if(xx>=0 && yy>=0 && xx<256 && yy<256){
          water[yy*W + xx] = 1;
        }
      }
    }
  }
}

function drawRoadPath(road, water, x0, y0, x1, y1, thickness, W){
  const dx = x1-x0, dy = y1-y0;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  for(let s=0; s<=steps; s++){
    const t = s/steps;
    const x = Math.round(x0 + dx*t);
    const y = Math.round(y0 + dy*t);
    drawRoad(road, water, x, y, thickness, W);
  }
}

function drawRoad(road, water, x, y, thickness, W){
  for(let dy=-thickness; dy<=thickness; dy++){
    for(let dx=-thickness; dx<=thickness; dx++){
      const xx = x + dx, yy = y + dy;
      if(xx>=0 && yy>=0 && xx<256 && yy<256){
        if(!water[yy*W + xx]){
          road[yy*W + xx] = 1;
        }
      }
    }
  }
}

function clearArea(grass, water, road, cx, cy, radius, tile){
  const W = 256;
  for(let y=cy-radius; y<=cy+radius; y++){
    for(let x=cx-radius; x<=cx+radius; x++){
      if(x>=0 && y>=0 && x<256 && y<256){
        const dx=x-cx, dy=y-cy;
        if(dx*dx + dy*dy <= radius*radius){
          grass[y*W + x] = tile;
          water[y*W + x] = 0;
          road[y*W + x] = 0;
        }
      }
    }
  }
}

export const AUTOTILE_4BIT = {
  0:1, 1:2, 2:3, 3:4, 4:5, 5:6, 6:7, 7:8,
  8:9, 9:10, 10:11, 11:12, 12:13, 13:14, 14:15, 15:16
};
