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
  console.log('[WORLDGEN] Starting...');
  
  const W = 256;
  const H = 256;
  
  const grass = new Uint16Array(W * H);
  const road = new Uint16Array(W * H);
  const water = new Uint16Array(W * H);
  const deco = new Uint16Array(W * H);
  const props = [];
  
  console.log('[WORLDGEN] Filling base grass...');
  // FILL with light grass
  for(let i=0; i<W*H; i++){
    grass[i] = 1;
  }
  
  console.log('[WORLDGEN] Painting forest (dark grass)...');
  // FOREST - top left - DARK GRASS (tile 9)
  for(let y=0; y<128; y++){
    for(let x=0; x<128; x++){
      grass[y*W + x] = 9;
    }
  }
  
  console.log('[WORLDGEN] Painting desert (sand)...');
  // DESERT - bottom left - SAND (tile 17)
  for(let y=128; y<256; y++){
    for(let x=0; x<128; x++){
      grass[y*W + x] = 17;
    }
  }
  
  console.log('[WORLDGEN] Adding lake...');
  // BIG LAKE - center right
  for(let y=90; y<170; y++){
    for(let x=160; x<220; x++){
      water[y*W + x] = 1;
    }
  }
  
  console.log('[WORLDGEN] Adding roads...');
  // ROAD - horizontal through middle
  for(let x=0; x<256; x++){
    for(let t=-2; t<=2; t++){
      road[(128+t)*W + x] = 1;
    }
  }
  
  // ROAD - vertical through middle
  for(let y=0; y<256; y++){
    for(let t=-2; t<=2; t++){
      if(water[y*W + 128] === 0){
        road[y*W + (128+t)] = 1;
      }
    }
  }
  
  console.log('[WORLDGEN] Adding props...');
  // Very few props
  for(let y=20; y<120; y+=20){
    for(let x=20; x<120; x+=20){
      props.push({x, y});
    }
  }
  
  console.log('[WORLDGEN] Complete! Props:', props.length);
  
  return {
    width: W,
    height: H,
    spawn: { x: 128, y: 128 },
    layers: { grass, road, water, deco },
    props
  };
}

export const AUTOTILE_4BIT = {
  0:1, 1:2, 2:3, 3:4, 4:5, 5:6, 6:7, 7:8,
  8:9, 9:10, 10:11, 11:12, 12:13, 13:14, 14:15, 15:16
};
