#!/usr/bin/env python3
"""Generate a massive *static* overworld by baking chunks to JSON (RLE).

This DOES NOT run in the browser. Run locally:
  python tools/generate_overworld.py

It will create/overwrite chunk files under:
  assets/world/overworld/chunks/

Adjust WORLD_TILES and CHUNK_TILES to control size.
"""

import os, json, math, random

WORLD_TILES = 10800          # ~32 minutes across at default walk speed
CHUNK_TILES = 128            # 128x128 tiles per chunk
OUT_DIR = os.path.join("assets","world","overworld","chunks")

ATLAS_COLS = 45
def tid(col,row): return row*ATLAS_COLS+col

# These IDs must match assets/world/overworld/tiles.json
GRASS = [tid(0,0),tid(1,0),tid(0,1)]
DIRT  = [tid(14,0),tid(15,0)]
SAND  = [tid(18,0),tid(19,0)]
WATER = [tid(33,22),tid(34,22)]

def rle_encode(arr):
  out=[]
  prev=arr[0]; cnt=1
  for v in arr[1:]:
    if v==prev and cnt<65535: cnt+=1
    else:
      out.append([cnt,prev]); prev=v; cnt=1
  out.append([cnt,prev])
  return out

def noise(x,y,seed=12345):
  # simple deterministic pseudo-noise
  n = (x*73856093) ^ (y*19349663) ^ seed
  n = (n<<13) ^ n
  return 1.0 - ((n*(n*n*15731 + 789221) + 1376312589) & 0x7fffffff)/1073741824.0

def fbm(x,y):
  a=0.0; amp=0.55; freq=0.004
  for i in range(5):
    a += amp * (noise(int(x*freq*10000), int(y*freq*10000), 12345+i*97)*0.5+0.5)
    amp *= 0.5; freq *= 2.0
  return a

def tile_at(tx,ty):
  h = fbm(tx,ty)
  if h < 0.40: return WATER[(tx+ty)&1]
  if h < 0.435: return SAND[(tx+ty)&1]
  # roads
  if abs((tx%128)-64) < 2 or abs((ty%128)-64) < 2:
    return DIRT[(tx+ty)&1]
  return GRASS[(tx*3+ty*7)&2]

def main():
  os.makedirs(OUT_DIR, exist_ok=True)
  chunks = math.ceil(WORLD_TILES / CHUNK_TILES)

  for cy in range(chunks):
    for cx in range(chunks):
      w=h=CHUNK_TILES
      arr=[]
      baseX=cx*CHUNK_TILES
      baseY=cy*CHUNK_TILES
      for y in range(h):
        for x in range(w):
          arr.append(tile_at(baseX+x, baseY+y))
      data={"w":w,"h":h,"rle":rle_encode(arr)}
      with open(os.path.join(OUT_DIR,f"c_{cx}_{cy}.json"),"w") as f:
        json.dump(data,f)
      if (cx%10==0 and cy%10==0):
        print(f"wrote chunk {cx},{cy}")

  print("Done. Commit assets/world/overworld/chunks/ to GitHub Pages (may be large).")

if __name__ == "__main__":
  main()
