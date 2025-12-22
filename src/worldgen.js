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

  const grass = new Uint16Array(w*h);
  const road = new Uint16Array(w*h);
  const water = new Uint16Array(w*h);
  const deco = new Uint16Array(w*h);
  const props = [];

  // Simple tiles (1-based)
  const GRASS = 1;
  const GRASS_DARK = 9;
  const SAND = 17;

  function idx(x,y){ return y*w+x; }

  // Base terrain - plain grass
  for(let y=0; y<h; y++){
    for(let x=0; x<w; x++){
      grass[idx(x,y)] = GRASS;
    }
  }

  // Landmarks
  const castle = { x: 128, y: 66 };
  const village = { x: 72, y: 112 };
  const town = { x: 210, y: 145 };
  const lake = { x: 180, y: 180, r: 18 };
  const forest = { x0: 20, y0: 70, x1: 100, y1: 130 };
  const desert = { x0: 15, y0: 160, x1: 90, y1: 220 };

  // Water - lake
  for(let y=lake.y-lake.r; y<=lake.y+lake.r; y++){
    for(let x=lake.x-lake.r; x<=lake.x+lake.r; x++){
      if(x>=0 && y>=0 && x<w && y<h){
        const dx = x-lake.x, dy = y-lake.y;
        if(dx*dx + dy*dy <= lake.r*lake.r){
          water[idx(x,y)] = 1;
        }
      }
    }
  }
  
  // River (simple line)
  drawLine(water, {x:158, y:28}, {x:178, y:165}, 3, 1, w, h);

  // Roads
  drawRoad(road, water, {x:castle.x, y:castle.y+15}, {x:village.x, y:village.y}, 2, 1, w, h);
  drawRoad(road, water, {x:castle.x, y:castle.y+15}, {x:town.x, y:town.y}, 2, 1, w, h);

  // Forest biome
  for(let y=forest.y0; y<=forest.y1; y++){
    for(let x=forest.x0; x<=forest.x1; x++){
      if(!water[idx(x,y)] && !road[idx(x,y)]){
        grass[idx(x,y)] = GRASS_DARK;
      }
    }
  }
  
  // Desert biome
  for(let y=desert.y0; y<=desert.y1; y++){
    for(let x=desert.x0; x<=desert.x1; x++){
      if(!water[idx(x,y)]){
        grass[idx(x,y)] = SAND;
      }
    }
  }

  // Clear towns
  clearCircle(grass, deco, castle.x, castle.y, 14, GRASS, w, h);
  clearCircle(grass, deco, village.x, village.y, 12, GRASS, w, h);
  clearCircle(grass, deco, town.x, town.y, 10, GRASS, w, h);

  // Props (VERY sparse, frame 0 only)
  // Forest trees
  for(let y=forest.y0; y<=forest.y1; y+=6){
    for(let x=forest.x0; x<=forest.x1; x+=6){
      if(!water[idx(x,y)] && !road[idx(x,y)] && Math.random() < 0.15){
        props.push({x, y, kind:'tree'});
      }
    }
  }
  
  // Plains trees
  for(let y=60; y<h-20; y+=10){
    for(let x=0; x<w; x+=10){
      const inF = x>=forest.x0 && x<=forest.x1 && y>=forest.y0 && y<=forest.y1;
      const inD = x>=desert.x0 && x<=desert.x1 && y>=desert.y0 && y<=desert.y1;
      if(!inF && !inD && !water[idx(x,y)] && !road[idx(x,y)] && Math.random() < 0.03){
        props.push({x, y, kind:'tree'});
      }
    }
  }

  return {
    width:w, height:h,
    spawn: { x: castle.x, y: castle.y+18 },
    layers: { grass, road, water, deco },
    props
  };
}

function drawLine(layer, a, b, thickness, tile, w, h){
  const dx = b.x-a.x, dy = b.y-a.y;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  for(let s=0; s<=steps; s++){
    const t = s/steps;
    const x = Math.round(a.x + dx*t), y = Math.round(a.y + dy*t);
    for(let oy=-thickness; oy<=thickness; oy++){
      for(let ox=-thickness; ox<=thickness; ox++){
        if(ox*ox + oy*oy <= thickness*thickness){
          const xx = x+ox, yy = y+oy;
          if(xx>=0 && yy>=0 && xx<w && yy<h) layer[yy*w+xx] = tile;
        }
      }
    }
  }
}

function drawRoad(roadLayer, waterLayer, a, b, thickness, tile, w, h){
  const dx = b.x-a.x, dy = b.y-a.y;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  for(let s=0; s<=steps; s++){
    const t = s/steps;
    const x = Math.round(a.x + dx*t), y = Math.round(a.y + dy*t);
    for(let oy=-thickness; oy<=thickness; oy++){
      for(let ox=-thickness; ox<=thickness; ox++){
        if(ox*ox + oy*oy <= thickness*thickness){
          const xx = x+ox, yy = y+oy;
          if(xx>=0 && yy>=0 && xx<w && yy<h){
            const i = yy*w+xx;
            if(!waterLayer[i]) roadLayer[i] = tile;
          }
        }
      }
    }
  }
}

function clearCircle(grassLayer, decoLayer, cx, cy, r, tile, w, h){
  for(let y=cy-r; y<=cy+r; y++){
    for(let x=cx-r; x<=cx+r; x++){
      if(x>=0 && y>=0 && x<w && y<h){
        const dx=x-cx, dy=y-cy;
        if(dx*dx + dy*dy <= r*r){
          grassLayer[y*w+x] = tile;
          decoLayer[y*w+x] = 0;
        }
      }
    }
  }
}

export const AUTOTILE_4BIT = {
  0: 1, 1: 2, 2: 3, 3: 4,
  4: 5, 5: 6, 6: 7, 7: 8,
  8: 9, 9:10,10:11,11:12,
 12:13,13:14,14:15,15:16
};
