
export function makeRng(seedStr){
  // Keep for future dungeon generation
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
  const w = meta.world.width, h = meta.world.height;

  // Static overworld - hand-designed like ALTTP
  const grass = new Uint16Array(w*h);
  const road = new Uint16Array(w*h);
  const water = new Uint16Array(w*h);
  const deco = new Uint16Array(w*h);
  const props = [];

  // Tile palette
  const GRASS_PLAIN = [1,2,3,4];
  const GRASS_FOREST = [9,10,11,12];
  const GRASS_MOUNTAIN = [5,6,7,8];
  const SAND_DESERT = [17,18,19,20];
  const ROAD_BASE = 1;
  const WATER_BASE = 1;

  function idx(x,y){ return y*w+x; }
  function setTile(layer, x, y, tile) {
    if(x>=0 && y>=0 && x<w && y<h) layer[idx(x,y)] = tile;
  }
  function pick(arr) { return arr[Math.floor(Math.random()*arr.length)]; }


  // === BASE TERRAIN ===
  // Fill with plain grass
  for(let y=0; y<h; y++){
    for(let x=0; x<w; x++){
      grass[idx(x,y)] = pick(GRASS_PLAIN);
    }
  }

  // === STATIC WORLD REGIONS (like ALTTP) ===
  
  // Castle region (center-north)
  const castle = { x: 128, y: 66 };
  
  // Villages
  const kakariko = { x: 72, y: 112 };  // northwest village
  const townSquare = { x: 210, y: 145 }; // east town
  
  // Lake (southeast)
  const lake = { x: 180, y: 180, r: 18 };
  
  // Death Mountain (north)
  const mountainY = 30;
  
  // Lost Woods (northwest forest)
  const forestRect = { x0: 20, y0: 70, x1: 100, y1: 130 };
  
  // Desert (southwest)
  const desertRect = { x0: 15, y0: 160, x1: 90, y1: 220 };
  
  // Graveyard (northwest of castle)
  const graveyard = { x: 90, y: 50, w: 20, h: 15 };

  // === WATER FEATURES ===
  
  // Main lake
  for(let y=lake.y-lake.r; y<=lake.y+lake.r; y++){
    for(let x=lake.x-lake.r; x<=lake.x+lake.r; x++){
      const dx = x-lake.x, dy = y-lake.y;
      if(dx*dx + dy*dy <= lake.r*lake.r){
        setTile(water, x, y, WATER_BASE);
      }
    }
  }
  
  // River from mountains to lake
  const river = [
    {x:158, y:28}, {x:160, y:45}, {x:165, y:70},
    {x:168, y:95}, {x:172, y:120}, {x:175, y:145},
    {x:178, y:165}
  ];
  for(let i=0; i<river.length-1; i++){
    drawThickLine(water, river[i], river[i+1], 3, WATER_BASE);
  }
  
  // Small pond near kakariko
  for(let y=kakariko.y+10; y<kakariko.y+17; y++){
    for(let x=kakariko.x-5; x<kakariko.x+3; x++){
      setTile(water, x, y, WATER_BASE);
    }
  }

  // === ROADS ===
  
  // Main highway: castle -> kakariko -> desert
  const mainRoad = [
    {x:castle.x, y:castle.y+15},
    {x:castle.x-20, y:castle.y+30},
    {x:kakariko.x, y:kakariko.y},
    {x:kakariko.x-10, y:kakariko.y+20},
    {x:desertRect.x0+10, y:desertRect.y0}
  ];
  for(let i=0; i<mainRoad.length-1; i++){
    drawPath(road, water, mainRoad[i], mainRoad[i+1], 2, ROAD_BASE);
  }
  
  // East road: castle -> town
  const eastRoad = [
    {x:castle.x, y:castle.y+15},
    {x:castle.x+30, y:castle.y+40},
    {x:townSquare.x, y:townSquare.y}
  ];
  for(let i=0; i<eastRoad.length-1; i++){
    drawPath(road, water, eastRoad[i], eastRoad[i+1], 2, ROAD_BASE);
  }
  
  // Path to lake
  const lakePath = [
    {x:townSquare.x, y:townSquare.y+10},
    {x:lake.x-lake.r-2, y:lake.y}
  ];
  for(let i=0; i<lakePath.length-1; i++){
    drawPath(road, water, lakePath[i], lakePath[i+1], 1, ROAD_BASE);
  }

  // === BIOME TERRAIN ===
  
  // Mountain grass (darker)
  for(let y=0; y<mountainY+10; y++){
    for(let x=0; x<w; x++){
      if(!water[idx(x,y)]){
        grass[idx(x,y)] = pick(GRASS_MOUNTAIN);
      }
    }
  }
  
  // Forest grass
  for(let y=forestRect.y0; y<=forestRect.y1; y++){
    for(let x=forestRect.x0; x<=forestRect.x1; x++){
      if(!water[idx(x,y)] && !road[idx(x,y)]){
        grass[idx(x,y)] = pick(GRASS_FOREST);
      }
    }
  }
  
  // Desert sand
  for(let y=desertRect.y0; y<=desertRect.y1; y++){
    for(let x=desertRect.x0; x<=desertRect.x1; x++){
      if(!water[idx(x,y)]){
        grass[idx(x,y)] = pick(SAND_DESERT);
      }
    }
  }

  // === DECORATIONS & PROPS ===
  
  // Clear town areas
  clearCircle(grass, deco, castle.x, castle.y, 14, pick(GRASS_PLAIN));
  clearCircle(grass, deco, kakariko.x, kakariko.y, 12, pick(GRASS_PLAIN));
  clearCircle(grass, deco, townSquare.x, townSquare.y, 10, pick(GRASS_PLAIN));
  
  // Dense forest trees
  for(let y=forestRect.y0; y<=forestRect.y1; y+=2){
    for(let x=forestRect.x0; x<=forestRect.x1; x+=2){
      if(!water[idx(x,y)] && !road[idx(x,y)]){
        if(Math.random() < 0.65){
          props.push({x, y, kind:'tree', frame:18});
          deco[idx(x,y)] = 0;
        } else if(Math.random() < 0.3){
          deco[idx(x,y)] = 5+Math.floor(Math.random()*4); // bushes
        }
      }
    }
  }
  
  // Mountain rocks
  for(let y=0; y<mountainY+15; y+=2){
    for(let x=0; x<w; x+=2){
      if(!water[idx(x,y)] && !road[idx(x,y)]){
        if(Math.random() < 0.4){
          props.push({x, y, kind:'rock', frame:34});
        }
      }
    }
  }
  
  // Desert cacti/rocks
  for(let y=desertRect.y0; y<=desertRect.y1; y+=3){
    for(let x=desertRect.x0; x<=desertRect.x1; x+=3){
      if(Math.random() < 0.25){
        props.push({x, y, kind:'rock', frame:35});
      }
    }
  }
  
  // Scattered trees in plains
  for(let y=40; y<h; y+=4){
    for(let x=0; x<w; x+=4){
      if(!inRect(x,y,forestRect) && !inRect(x,y,desertRect) && 
         !water[idx(x,y)] && !road[idx(x,y)] && y>mountainY+15){
        if(Math.random() < 0.15){
          props.push({x, y, kind:'tree', frame:17});
        } else if(Math.random() < 0.1){
          deco[idx(x,y)] = 21+Math.floor(Math.random()*4); // flowers
        }
      }
    }
  }
  
  // Graveyard headstones
  for(let y=graveyard.y; y<graveyard.y+graveyard.h; y+=2){
    for(let x=graveyard.x; x<graveyard.x+graveyard.w; x+=2){
      if(Math.random() < 0.6){
        props.push({x, y, kind:'grave', frame:50});
      }
    }
  }

  // Spawn at castle entrance
  const spawn = { x: castle.x, y: castle.y+18 };

  return {
    width:w, height:h, spawn,
    layers: { grass, road, water, deco },
    props
  };
}

// Helper functions
function drawThickLine(layer, a, b, thickness, tile){
  const dx = b.x-a.x, dy = b.y-a.y;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  for(let s=0; s<=steps; s++){
    const t = s/steps;
    const x = Math.round(a.x + dx*t);
    const y = Math.round(a.y + dy*t);
    for(let oy=-thickness; oy<=thickness; oy++){
      for(let ox=-thickness; ox<=thickness; ox++){
        if(ox*ox + oy*oy <= thickness*thickness){
          if(layer) layer[(y+oy)*256 + (x+ox)] = tile;
        }
      }
    }
  }
}

function drawPath(roadLayer, waterLayer, a, b, thickness, tile){
  const dx = b.x-a.x, dy = b.y-a.y;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  for(let s=0; s<=steps; s++){
    const t = s/steps;
    const x = Math.round(a.x + dx*t);
    const y = Math.round(a.y + dy*t);
    for(let oy=-thickness; oy<=thickness; oy++){
      for(let ox=-thickness; ox<=thickness; ox++){
        if(ox*ox + oy*oy <= thickness*thickness){
          const i = (y+oy)*256 + (x+ox);
          if(!waterLayer[i]) roadLayer[i] = tile;
        }
      }
    }
  }
}

function clearCircle(grassLayer, decoLayer, cx, cy, r, grassTile){
  for(let y=cy-r; y<=cy+r; y++){
    for(let x=cx-r; x<=cx+r; x++){
      const dx=x-cx, dy=y-cy;
      if(dx*dx + dy*dy <= r*r){
        const i = y*256 + x;
        grassLayer[i] = grassTile;
        decoLayer[i] = 0;
      }
    }
  }
}

function inRect(x,y,r){
  return x>=r.x0 && x<=r.x1 && y>=r.y0 && y<=r.y1;
}

export const AUTOTILE_4BIT = {
  0: 1, 1: 2, 2: 3, 3: 4,
  4: 5, 5: 6, 6: 7, 7: 8,
  8: 9, 9:10,10:11,11:12,
 12:13,13:14,14:15,15:16
};
