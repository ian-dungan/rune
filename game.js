import { clamp, showToast } from "./util.js";
const TILE=32, CHUNK=32;
function k(cx,cy){return `${cx},${cy}`;}
async function loadImage(src){return new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>{console.error("Failed to load:",src);rej(new Error("img "+src));};i.src=src;});}
function srcRect(idx,cols){return {x:(idx%cols)*TILE,y:Math.floor(idx/cols)*TILE,w:TILE,h:TILE};}

export class Game{
  constructor({canvas,minimap,onStatus,onFps}){
    this.canvas=canvas; this.ctx=canvas.getContext("2d",{alpha:false});
    this.minimap=minimap; this.mctx=minimap.getContext("2d",{alpha:true});
    this.onStatus=onStatus||(()=>{}); this.onFps=onFps||(()=>{});
    this.player={x:(2*CHUNK+16)*TILE,y:(2*CHUNK+16)*TILE,name:"Player",frame:0,ft:0,dir:"down",moving:false};
    this.cam={x:this.player.x,y:this.player.y,zoom:2.35};
    this._keys=new Set(); this._target=null;
    this.tilesets=null; this.images={}; this.meta=null; this.cache=new Map();
    this._fps={last:performance.now(),acc:0,frames:0,val:60};
    this._bind(); this._resize(); window.addEventListener("resize",()=>this._resize());
  }
  setPlayerName(n){this.player.name=n||"Player";}
  zoomBy(f){this.cam.zoom=clamp(this.cam.zoom*f,1.2,4.2);}
  centerCamera(){this.cam.x=this.player.x;this.cam.y=this.player.y;}

  _resize(){const dpr=Math.min(devicePixelRatio||1,2);const r=this.canvas.getBoundingClientRect();
    this.canvas.width=Math.floor(r.width*dpr);this.canvas.height=Math.floor(r.height*dpr);
    this.ctx.imageSmoothingEnabled=false;
  }
  _bind(){
    window.addEventListener("keydown",(e)=>{if(["INPUT","TEXTAREA"].includes((document.activeElement?.tagName||"").toUpperCase())) return;
      const kk=(e?.key||""); if(!kk) return; this._keys.add(kk.toLowerCase());});
    window.addEventListener("keyup",(e)=>{const kk=(e?.key||""); if(!kk) return; this._keys.delete(kk.toLowerCase());});
    this.canvas.addEventListener("pointerdown",(e)=>{const r=this.canvas.getBoundingClientRect();
      const sx=(e.clientX-r.left)*(this.canvas.width/r.width); const sy=(e.clientY-r.top)*(this.canvas.height/r.height);
      const w=this._s2w(sx,sy); this._target={x:w.x,y:w.y};});
    this.canvas.addEventListener("wheel",(e)=>{e.preventDefault();this.zoomBy(e.deltaY<0?1.10:1/1.10);},{passive:false});
  }
  _s2w(sx,sy){const cx=this.canvas.width/2,cy=this.canvas.height/2,z=this.cam.zoom;
    return {x:(sx-cx)/z+this.cam.x,y:(sy-cy)/z+this.cam.y};}
  _w2s(wx,wy){const cx=this.canvas.width/2,cy=this.canvas.height/2,z=this.cam.zoom;
    return {x:(wx-this.cam.x)*z+cx,y:(wy-this.cam.y)*z+cy};}

  async loadStaticWorld(){
    try{
      this.meta=await (await fetch("./assets/world/overworld/meta.json")).json();
      this.tilesets=await (await fetch("./tilesets.json")).json();
      
      for(const [name,ts] of Object.entries(this.tilesets.tilesets)){
        if(name==='player') continue;
        this.images[name]=await loadImage("./"+ts.src);
      }
      
      // Load player sprite
      this.images.player=await loadImage("./player_sprite.png");
      
      // Initialize region cache
      this.regions = new Map();
      this.REGION_SIZE = 10;
      
      console.log("Assets loaded. Static world ready (region-based).");
      showToast("Loaded sprite tiles. Static world ready!");
    }catch(err){
      console.error("Failed to load world:",err);
      showToast("Error loading world assets - check console");
    }
  }

  start(){this._run=true;this._last=performance.now();requestAnimationFrame(t=>this._tick(t));}
  _tick(t){if(!this._run) return; const dt=Math.min(.033,(t-this._last)/1000); this._last=t;
    this._update(dt); this._render();
    const f=this._fps; f.frames++; f.acc += (t-f.last); f.last=t;
    if(f.acc>500){f.val=(f.frames/f.acc)*1000; f.acc=0; f.frames=0; this.onFps(f.val);}
    requestAnimationFrame(tt=>this._tick(tt));}

  _update(dt){
    let ax=0,ay=0;
    if(this._keys.has("w")||this._keys.has("arrowup")) ay-=1;
    if(this._keys.has("s")||this._keys.has("arrowdown")) ay+=1;
    if(this._keys.has("a")||this._keys.has("arrowleft")) ax-=1;
    if(this._keys.has("d")||this._keys.has("arrowright")) ax+=1;
    let tx=0,ty=0;
    if(this._target){
      const dx=this._target.x-this.player.x, dy=this._target.y-this.player.y;
      const dist=Math.hypot(dx,dy);
      if(dist<6) this._target=null; else {tx=dx/dist; ty=dy/dist;}
    }
    const mx=ax||tx, my=ay||ty; const len=Math.hypot(mx,my)||1;
    const sp=90;
    this.player.x += (mx/len)*sp*dt; this.player.y += (my/len)*sp*dt;
    this.cam.x += (this.player.x-this.cam.x)*0.12; this.cam.y += (this.player.y-this.cam.y)*0.12;
    const moving=(Math.abs(mx)+Math.abs(my))>0.01;
    this.player.moving=moving;
    
    // Update direction based on movement
    if(moving){
      if(Math.abs(mx)>Math.abs(my)){
        this.player.dir=mx>0?"right":"left";
      }else{
        this.player.dir=my>0?"down":"up";
      }
    }
    
    this.player.ft += dt*(moving?10:2); this.player.frame=Math.floor(this.player.ft)%8;
    this.onStatus(`Pos: ${Math.floor(this.player.x)}, ${Math.floor(this.player.y)} • Zoom: ${this.cam.zoom.toFixed(2)}x`);
  }

  async _chunk(cx,cy){
    const kk=k(cx,cy);
    if(this.cache.has(kk)) return this.cache.get(kk);
    
    // Determine which region this chunk belongs to
    const rx = Math.floor(cx / this.REGION_SIZE);
    const ry = Math.floor(cy / this.REGION_SIZE);
    const regionKey = `${rx}_${ry}`;
    
    // Load region if not cached
    if(!this.regions.has(regionKey)){
      try{
        const res = await fetch(`./assets/world/overworld/regions/region_${regionKey}.json`);
        if(res.ok){
          const chunks = await res.json();
          // Cache all chunks from this region
          for(const chunk of chunks){
            this.cache.set(k(chunk.cx, chunk.cy), chunk);
          }
          this.regions.set(regionKey, true);
          console.log(`Loaded region ${regionKey} (${chunks.length} chunks)`);
        } else {
          console.warn(`Region ${regionKey} not found (${res.status})`);
          this.regions.set(regionKey, false);
        }
      }catch(err){
        console.error(`Error loading region ${regionKey}:`, err);
        this.regions.set(regionKey, false);
      }
    }
    
    // Return chunk if now cached
    if(this.cache.has(kk)) return this.cache.get(kk);
    
    // Fallback: create grass chunk
    console.warn(`Using fallback for chunk (${cx},${cy})`);
    const grassTiles = [];
    for(let i=0; i<CHUNK*CHUNK; i++) grassTiles.push(Math.floor(Math.random()*8));
    
    return {
      cx,cy,
      layers:{
        ground_grass:{tileset:"grass1",data:grassTiles},
        ground_water:{tileset:"water1",data:new Array(CHUNK*CHUNK).fill(-1)},
        ground_dirt:{tileset:"dirt1",data:new Array(CHUNK*CHUNK).fill(-1)},
        shadows:{tileset:"shadowPlant",data:new Array(CHUNK*CHUNK).fill(-1)},
        objects:{tileset:"plant",data:new Array(CHUNK*CHUNK).fill(-1)},
        decorations:{tileset:"flowers",data:new Array(CHUNK*CHUNK).fill(-1)},
        structures:{tileset:"wall",data:new Array(CHUNK*CHUNK).fill(-1)},
        trees:{tileset:"lpcTreetop",data:new Array(CHUNK*CHUNK).fill(-1)}
      }
    };
  }

  _render(){
    const c=this.ctx; c.imageSmoothingEnabled=false;
    c.fillStyle="#061018"; c.fillRect(0,0,this.canvas.width,this.canvas.height);
    if(!this.tilesets||!this.meta){c.fillStyle="#9bb0c6";c.font="16px system-ui";c.fillText("Loading…",20,30);return;}
    const z=this.cam.zoom;
    const halfW=(this.canvas.width/2)/z, halfH=(this.canvas.height/2)/z;
    const left=this.cam.x-halfW,right=this.cam.x+halfW,top=this.cam.y-halfH,bottom=this.cam.y+halfH;
    const tL=Math.floor(left/TILE)-2,tR=Math.floor(right/TILE)+2,tT=Math.floor(top/TILE)-2,tB=Math.floor(bottom/TILE)+2;
    const cL=Math.floor(tL/CHUNK),cR=Math.floor(tR/CHUNK),cT=Math.floor(tT/CHUNK),cB=Math.floor(tB/CHUNK);
    
    // Draw all chunks (BELOW pass)
    for(let cy=cT;cy<=cB;cy++){
      for(let cx=cL;cx<=cR;cx++){
        this._drawChunkSync(cx,cy);
      }
    }

    // Player always renders between below/above passes
    this._drawPlayer();

    // Draw all chunks (ABOVE pass)
    for(let cy=cT;cy<=cB;cy++){
      for(let cx=cL;cx<=cR;cx++){
        this._drawChunkSyncAbove(cx,cy);
      }
    }

    this._drawMinimap();
  }

  _drawChunkSync(cx,cy){
    const kk=k(cx,cy);
    if(!this.cache.has(kk)){
      this._chunk(cx,cy);
      return;
    }
    const ch=this.cache.get(kk);
    const bx=cx*CHUNK*TILE, by=cy*CHUNK*TILE;
    
    // Ground layers (order matters!)
    if(ch.layers.ground_water) this._drawLayer(ch.layers.ground_water,bx,by,false);
    if(ch.layers.ground_dirt) this._drawLayer(ch.layers.ground_dirt,bx,by,false);
    if(ch.layers.ground_grass) this._drawLayer(ch.layers.ground_grass,bx,by,false);
    if(ch.layers.ground_stone) this._drawLayer(ch.layers.ground_stone,bx,by,false);
    if(ch.layers.ground) this._drawLayer(ch.layers.ground,bx,by,false);

    // Shadows under everything
    this._drawLayer(ch.layers.shadows,bx,by,true);

    // Decorations / low layer
    if(ch.layers.decorations) this._drawLayer(ch.layers.decorations,bx,by,false);

    // Draw objects/props/trees/structures that are behind the player (by Y)
    if(ch.layers.trees) this._drawLayerSplit(ch.layers.trees,bx,by,false,"below");
    if(ch.layers.structures) this._drawLayerSplit(ch.layers.structures,bx,by,false,"below");
    if(ch.layers.props) this._drawLayerSplit(ch.layers.props,bx,by,false,"below");
    if(ch.layers.objects) this._drawLayerSplit(ch.layers.objects,bx,by,false,"below");

  _drawChunkSyncAbove(cx,cy){
    const kk=k(cx,cy);
    if(!this.cache.has(kk)) return;
    const ch=this.cache.get(kk);
    const bx=cx*CHUNK*TILE, by=cy*CHUNK*TILE;

    // Draw things that should cover the player when they are "in front" (by Y)
    if(ch.layers.trees) this._drawLayerSplit(ch.layers.trees,bx,by,false,"above");
    if(ch.layers.structures) this._drawLayerSplit(ch.layers.structures,bx,by,false,"above");
    if(ch.layers.props) this._drawLayerSplit(ch.layers.props,bx,by,false,"above");
    if(ch.layers.objects) this._drawLayerSplit(ch.layers.objects,bx,by,false,"above");
  }

  }

  _drawLayerSplit(layer,bx,by,isShadow,mode){
    // mode: "below" draws tiles whose world-y is <= player.y; "above" draws > player.y
    if(!layer) return;
    const splitY=this.player.y;
    const tsName=layer.tileset;
    const ts=this.tilesets.tilesets[tsName]||this.tilesets.tilesets.grass;
    const img=this.images[tsName]||this.images.grass;
    const cols=ts.cols; const data=layer.data; const z=this.cam.zoom;
    const anchor = this._layerAnchor(tsName);
    for(let i=0;i<data.length;i++){
      const tid=data[i]; if(tid===-1||tid==null) continue;
      const tx=i%CHUNK, ty=Math.floor(i/CHUNK);
      const wx=bx+tx*TILE, wy=by+ty*TILE;
      if(mode==="below" && wy>splitY) continue;
      if(mode==="above" && wy<=splitY) continue;
      const s=this._w2s(wx,wy-anchor);
      const r=srcRect(tid,cols);
      const dx=isShadow?2*z:0, dy=isShadow?3*z:0;
      this.ctx.drawImage(img,r.x,r.y,r.w,r.h,s.x+dx,s.y+dy,TILE*z,TILE*z);
    }
  }

  _drawLayer(layer,bx,by,isShadow){
    if(!layer) return;
    const tsName=layer.tileset;
    const ts=this.tilesets.tilesets[tsName]||this.tilesets.tilesets.grass;
    const img=this.images[tsName]||this.images.grass;
    const cols=ts.cols; const data=layer.data; const z=this.cam.zoom;
    
    for(let i=0;i<data.length;i++){
      const tid=data[i]; if(tid===-1||tid==null) continue;
      const tx=i%CHUNK, ty=Math.floor(i/CHUNK);
      const wx=bx+tx*TILE, wy=by+ty*TILE;
      const s=this._w2s(wx,wy); const r=srcRect(tid,cols);
      this.ctx.drawImage(img,r.x,r.y,r.w,r.h,s.x,s.y,TILE*z,TILE*z);
    }
  }

  _drawPlayer(){
    const z=this.cam.zoom, p=this.player, c=this.ctx;
    const s=this._w2s(p.x,p.y);

    const img=this.images.player;
    if(!img){
      // Fallback rectangle
      c.fillStyle="#58b2ff";
      c.fillRect(s.x-6*z,s.y-18*z,12*z,18*z);
      c.font=`${Math.floor(12*z)}px system-ui`;
      c.textAlign="center";
      c.fillStyle="#d6b35f";
      c.fillText(p.name, s.x, s.y-20*z);
      return;
    }

    // Sprite sheet layout: 16 cols (96px each) x 4 rows (80px each)
    const SPRITE_W=96, SPRITE_H=80;
    const dirRow={down:0,left:1,right:2,up:3};
    const row=dirRow[p.dir]||0;
    const col=(p.moving?8:0)+p.frame;
    
    const sx=col*SPRITE_W;
    const sy=row*SPRITE_H;
    
    // Scale sprite to world size
    const scale=0.5;
    const w=SPRITE_W*scale*z;
    const h=SPRITE_H*scale*z;
    
    // Draw shadow at ground level
    c.fillStyle="rgba(0,0,0,0.35)";
    c.beginPath(); c.ellipse(s.x,s.y,8*z,4*z,0,0,Math.PI*2); c.fill();
    
    // Draw sprite with BOTTOM at s.y (ground level)
    c.drawImage(img, sx, sy, SPRITE_W, SPRITE_H, s.x-w/2, s.y-h, w, h);

    // nameplate above sprite
    c.font=`${Math.floor(12*z)}px system-ui`;
    c.textAlign="center";
    c.fillStyle="rgba(0,0,0,0.6)";
    c.fillText(p.name, s.x+1, s.y-h-6*z+1);
    c.fillStyle="#d6b35f";
    c.fillText(p.name, s.x, s.y-h-6*z);
  }

  _drawMinimap(){
    const m=this.mctx,w=this.minimap.width,h=this.minimap.height;
    m.clearRect(0,0,w,h);
    
    // Draw actual world terrain on minimap
    const zoom=0.15;
    const centerX=this.player.x, centerY=this.player.y;
    const viewW=w/zoom, viewH=h/zoom;
    
    // Calculate visible chunk range
    const cL=Math.floor((centerX-viewW/2)/(CHUNK*TILE));
    const cR=Math.floor((centerX+viewW/2)/(CHUNK*TILE));
    const cT=Math.floor((centerY-viewH/2)/(CHUNK*TILE));
    const cB=Math.floor((centerY+viewH/2)/(CHUNK*TILE));
    
    m.imageSmoothingEnabled=false;
    
    // Draw each cached chunk
    for(let cy=cT;cy<=cB;cy++){
      for(let cx=cL;cx<=cR;cx++){
        const kk=k(cx,cy);
        if(!this.cache.has(kk)) continue;
        const ch=this.cache.get(kk);
        
        // Sample every tile in chunk for minimap
        for(let ty=0;ty<CHUNK;ty++){
          for(let tx=0;tx<CHUNK;tx++){
            const wx=cx*CHUNK*TILE+tx*TILE;
            const wy=cy*CHUNK*TILE+ty*TILE;
            const mx=Math.floor((wx-centerX+viewW/2)*zoom);
            const my=Math.floor((wy-centerY+viewH/2)*zoom);
            
            if(mx<0||my<0||mx>=w||my>=h) continue;
            
            const idx=ty*CHUNK+tx;
            
            // Check layers for color (priority order)
            let color="#7a9639"; // default grass
            
            // Water (blue)
            if(ch.layers.ground_water?.data[idx]>=0){
              color="#4a90d9"; // blue for water
            }
            // Dirt/sand (tan)
            else if(ch.layers.ground_dirt?.data[idx]>=0){
              color="#c9a875"; // tan for sand/dirt
            }
            // Grass (green)
            else if(ch.layers.ground_grass?.data[idx]>=0){
              color="#7a9639"; // green for grass
            }
            // Stone (gray)
            else if(ch.layers.ground_stone?.data[idx]>=0){
              color="#8b8b7a"; // gray for stone
            }
            
            // Objects overlay darker
            if(ch.layers.trees?.data[idx]>=0 || ch.layers.objects?.data[idx]>=0){
              // Darken the color for forests
              const r = parseInt(color.slice(1,3), 16);
              const g = parseInt(color.slice(3,5), 16);
              const b = parseInt(color.slice(5,7), 16);
              color = `#${Math.max(0,r-30).toString(16).padStart(2,'0')}${Math.max(0,g-30).toString(16).padStart(2,'0')}${Math.max(0,b-30).toString(16).padStart(2,'0')}`;
            }
            
            // Structures (darker gray)
            if(ch.layers.structures?.data[idx]>=0){
              color="#5a5a4a";
            }
            
            const size=Math.ceil(zoom*TILE);
            m.fillStyle=color;
            m.fillRect(mx,my,size,size);
          }
        }
      }
    }
    
    // Draw player position
    m.fillStyle="#fff";
    m.fillRect(w/2-2,h/2-2,4,4);
  }
}
