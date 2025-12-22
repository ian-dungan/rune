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
  const w = meta.world.width, h = meta.world.height;

  const grass = new Uint16Array(w*h);
  const road = new Uint16Array(w*h);
  const water = new Uint16Array(w*h);
  const deco = new Uint16Array(w*h);
  const props = [];

  const GRASS_LIGHT = 1;
  const GRASS_DARK = 9;
  const SAND = 17;
  
  function idx(x,y){ return y*w+x; }

  for(let y=0; y<h; y++){
    for(let x=0; x<w; x++){
      grass[idx(x,y)] = GRASS_LIGHT;
    }
  }

  const castle = { x: 128, y: 66 };
  const village = { x: 72, y: 112 };
  const town = { x: 210, y: 145 };
  const lakeCenter = { x: 180, y: 180 };
  const lakeRadius = 22;

  // WATER - large visible lake
  for(let y = lakeCenter.y - lakeRadius; y <= lakeCenter.y + lakeRadius; y++){
    for(let x = lakeCenter.x - lakeRadius; x <= lakeCenter.x + lakeRadius; x++){
      if(x>=0 && y>=0 && x<w && y<h){
        const dx = x - lakeCenter.x;
        const dy = y - lakeCenter.y;
        if(dx*dx + dy*dy <= lakeRadius*lakeRadius){
          water[idx(x,y)] = 1;
        }
      }
    }
  }
  
  // River
  drawWater(water, {x:155, y:25}, {x:160, y:60}, 4, w, h);
  drawWater(water, {x:160, y:60}, {x:168, y:100}, 4, w, h);
  drawWater(water, {x:168, y:100}, {x:172, y:135}, 4, w, h);
  drawWater(water, {x:172, y:135}, {x:178, y:165}, 4, w, h);

  // Pond
  for(let y=village.y+8; y<village.y+16; y++){
    for(let x=village.x-6; x<village.x+4; x++){
      if(x>=0 && y>=0 && x<w && y<h) water[idx(x,y)] = 1;
    }
  }

  // ROADS - thick and visible
  drawRoad(road, water, {x:castle.x, y:castle.y+12}, {x:village.x+5, y:village.y-5}, 3, w, h);
  drawRoad(road, water, {x:village.x+5, y:village.y-5}, {x:village.x, y:village.y}, 3, w, h);
  drawRoad(road, water, {x:castle.x, y:castle.y+12}, {x:town.x-10, y:town.y-8}, 3, w, h);
  drawRoad(road, water, {x:town.x-10, y:town.y-8}, {x:town.x, y:town.y}, 3, w, h);
  drawRoad(road, water, {x:village.x, y:village.y+12}, {x:40, y:180}, 3, w, h);
  drawRoad(road, water, {x:town.x, y:town.y+10}, {x:lakeCenter.x-lakeRadius-3, y:lakeCenter.y-8}, 2, w, h);

  // FOREST - dark green
  const forestRect = { x0: 20, y0: 70, x1: 105, y1: 135 };
  for(let y=forestRect.y0; y<=forestRect.y1; y++){
    for(let x=forestRect.x0; x<=forestRect.x1; x++){
      if(x>=0 && y>=0 && x<w && y<h){
        if(!water[idx(x,y)] && !road[idx(x,y)]){
          grass[idx(x,y)] = GRASS_DARK;
          if((x+y) % 7 === 0) deco[idx(x,y)] = 5;
        }
      }
    }
  }

  // DESERT - sand
  const desertRect = { x0: 15, y0: 165, x1: 95, y1: 230 };
  for(let y=desertRect.y0; y<=desertRect.y1; y++){
    for(let x=desertRect.x0; x<=desertRect.x1; x++){
      if(x>=0 && y>=0 && x<w && y<h){
        if(!water[idx(x,y)]){
          grass[idx(x,y)] = SAND;
          if((x*y) % 23 === 0) deco[idx(x,y)] = 21;
        }
      }
    }
  }

  // Clear towns
  clearCircle(grass, deco, castle.x, castle.y, 16, GRASS_LIGHT, w, h);
  clearCircle(grass, deco, village.x, village.y, 14, GRASS_LIGHT, w, h);
  clearCircle(grass, deco, town.x, town.y, 12, GRASS_LIGHT, w, h);

  // Sparse props
  for(let y=forestRect.y0; y<=forestRect.y1; y+=7){
    for(let x=forestRect.x0; x<=forestRect.x1; x+=7){
      if(!water[idx(x,y)] && !road[idx(x,y)] && (x+y)%3 === 0){
        props.push({x, y, kind:'tree'});
      }
    }
  }
  
  for(let y=50; y<h-30; y+=12){
    for(let x=20; x<w-20; x+=12){
      const inForest = x>=forestRect.x0 && x<=forestRect.x1 && y>=forestRect.y0 && y<=forestRect.y1;
      const inDesert = x>=desertRect.x0 && x<=desertRect.x1 && y>=desertRect.y0 && y<=desertRect.y1;
      if(!inForest && !inDesert && !water[idx(x,y)] && !road[idx(x,y)] && (x*y)%17 === 0){
        props.push({x, y, kind:'tree'});
      }
    }
  }

  return {
    width:w, height:h,
    spawn: { x: castle.x, y: castle.y+20 },
    layers: { grass, road, water, deco },
    props
  };
}

function drawWater(layer, a, b, thickness, w, h){
  const dx = b.x-a.x, dy = b.y-a.y;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  for(let s=0; s<=steps; s++){
    const t = s/steps;
    const x = Math.round(a.x + dx*t);
    const y = Math.round(a.y + dy*t);
    for(let oy=-thickness; oy<=thickness; oy++){
      for(let ox=-thickness; ox<=thickness; ox++){
        if(ox*ox + oy*oy <= thickness*thickness){
          const xx = x+ox, yy = y+oy;
          if(xx>=0 && yy>=0 && xx<w && yy<h) layer[yy*w+xx] = 1;
        }
      }
    }
  }
}

function drawRoad(roadLayer, waterLayer, a, b, thickness, w, h){
  const dx = b.x-a.x, dy = b.y-a.y;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  for(let s=0; s<=steps; s++){
    const t = s/steps;
    const x = Math.round(a.x + dx*t);
    const y = Math.round(a.y + dy*t);
    for(let oy=-thickness; oy<=thickness; oy++){
      for(let ox=-thickness; ox<=thickness; ox++){
        if(ox*ox + oy*oy <= thickness*thickness){
          const xx = x+ox, yy = y+oy;
          if(xx>=0 && yy>=0 && xx<w && yy<h){
            const i = yy*w+xx;
            if(!waterLayer[i]) roadLayer[i] = 1;
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
