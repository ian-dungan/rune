// COMPLETE REWRITE - Simple, working RPG overworld
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
  const W = meta.world.width;
  const H = meta.world.height;
  
  // Initialize all layers
  const grass = new Uint16Array(W * H);
  const road = new Uint16Array(W * H);
  const water = new Uint16Array(W * H);
  const deco = new Uint16Array(W * H);
  const props = [];
  
  // === STEP 1: Fill entire world with plain grass (tile 1) ===
  grass.fill(1);
  
  // === STEP 2: Paint major regions ===
  
  // FOREST - Northwest (dark grass = tile 9)
  paintRect(grass, 15, 60, 90, 130, 9);
  
  // DESERT - Southwest (sand = tile 17) 
  paintRect(grass, 10, 160, 85, 225, 17);
  
  // MOUNTAIN - North strip (rocky grass = tile 5)
  paintRect(grass, 0, 0, 255, 35, 5);
  
  // === STEP 3: Add water features ===
  
  // Large lake - Southeast
  paintCircle(water, 185, 185, 20, 1);
  
  // River from mountains to lake
  paintLine(water, 160, 30, 165, 80, 3, 1);
  paintLine(water, 165, 80, 172, 130, 3, 1);
  paintLine(water, 172, 130, 180, 170, 3, 1);
  
  // Small pond near village
  paintRect(water, 68, 118, 78, 126, 1);
  
  // === STEP 4: Add roads ===
  
  // Main road - Castle to Village
  paintLine(road, 128, 80, 110, 95, 2, 1);
  paintLine(road, 110, 95, 75, 110, 2, 1);
  
  // East road - Castle to Town  
  paintLine(road, 128, 80, 160, 110, 2, 1);
  paintLine(road, 160, 110, 205, 140, 2, 1);
  
  // South road - Village to Desert
  paintLine(road, 75, 120, 50, 165, 2, 1);
  
  // === STEP 5: Clear town plazas ===
  paintCircle(grass, 128, 70, 15, 1);  // Castle
  paintCircle(grass, 75, 115, 12, 1);  // Village
  paintCircle(grass, 205, 145, 10, 1); // Town
  
  // === STEP 6: Add sparse decorations ===
  
  // Forest trees - very sparse
  for(let y=70; y<130; y+=8){
    for(let x=25; x<90; x+=8){
      if(!water[y*W+x] && !road[y*W+x]){
        props.push({x, y});
      }
    }
  }
  
  // Plains trees - extremely sparse
  for(let y=50; y<H; y+=15){
    for(let x=100; x<W-20; x+=15){
      if(grass[y*W+x] === 1 && !water[y*W+x] && !road[y*W+x]){
        props.push({x, y});
      }
    }
  }
  
  return {
    width: W,
    height: H,
    spawn: { x: 128, y: 85 },
    layers: { grass, road, water, deco },
    props
  };
}

// Helper: Paint rectangle
function paintRect(layer, x0, y0, x1, y1, tile){
  const W = 256;
  for(let y=y0; y<=y1; y++){
    for(let x=x0; x<=x1; x++){
      if(x>=0 && y>=0 && x<W && y<256){
        layer[y*W+x] = tile;
      }
    }
  }
}

// Helper: Paint circle
function paintCircle(layer, cx, cy, r, tile){
  const W = 256;
  for(let y=cy-r; y<=cy+r; y++){
    for(let x=cx-r; x<=cx+r; x++){
      if(x>=0 && y>=0 && x<W && y<256){
        const dx=x-cx, dy=y-cy;
        if(dx*dx + dy*dy <= r*r){
          layer[y*W+x] = tile;
        }
      }
    }
  }
}

// Helper: Paint thick line
function paintLine(layer, x0, y0, x1, y1, thickness, tile){
  const W = 256;
  const dx = x1-x0, dy = y1-y0;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  
  for(let s=0; s<=steps; s++){
    const t = s/steps;
    const x = Math.round(x0 + dx*t);
    const y = Math.round(y0 + dy*t);
    
    for(let oy=-thickness; oy<=thickness; oy++){
      for(let ox=-thickness; ox<=thickness; ox++){
        if(ox*ox + oy*oy <= thickness*thickness){
          const xx = x+ox, yy = y+oy;
          if(xx>=0 && yy>=0 && xx<W && yy<256){
            layer[yy*W+xx] = tile;
          }
        }
      }
    }
  }
}

export const AUTOTILE_4BIT = {
  0:1, 1:2, 2:3, 3:4, 4:5, 5:6, 6:7, 7:8,
  8:9, 9:10, 10:11, 11:12, 12:13, 13:14, 14:15, 15:16
};
