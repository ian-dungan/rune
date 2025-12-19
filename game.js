import { clamp, showToast } from "./util.js";
const TILE=32, CHUNK=32;
function k(cx,cy){return `${cx},${cy}`;}
async function loadImage(src){return new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>rej(new Error("img "+src));i.src=src;});}
function srcRect(idx,cols){return {x:(idx%cols)*TILE,y:Math.floor(idx/cols)*TILE,w:TILE,h:TILE};}

export class Game{
  constructor({canvas,minimap,onStatus,onFps}){
    this.canvas=canvas; this.ctx=canvas.getContext("2d",{alpha:false});
    this.minimap=minimap; this.mctx=minimap.getContext("2d",{alpha:true});
    this.onStatus=onStatus||(()=>{}); this.onFps=onFps||(()=>{});
    this.player={x:(2*CHUNK+16)*TILE,y:(2*CHUNK+16)*TILE,name:"Player",frame:0,ft:0};
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
    this.meta=await (await fetch("./assets/world/overworld/meta.json")).json();
    this.tilesets=await (await fetch("./assets/world/overworld/tilesets.json")).json();
    for(const [name,ts] of Object.entries(this.tilesets.tilesets)){
      this.images[name]=await loadImage("./"+ts.src);
    }
    showToast("Loaded sprite tiles + static world.");
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
    const sp=210;
    this.player.x += (mx/len)*sp*dt; this.player.y += (my/len)*sp*dt;
    this.cam.x += (this.player.x-this.cam.x)*0.12; this.cam.y += (this.player.y-this.cam.y)*0.12;
    const moving=(Math.abs(mx)+Math.abs(my))>0.01;
    const frames=this.tilesets?.palette?.player?.frames?.length||1;
    this.player.ft += dt*(moving?10:2); this.player.frame=Math.floor(this.player.ft)%frames;
    this.onStatus(`Pos: ${Math.floor(this.player.x)}, ${Math.floor(this.player.y)} • Zoom: ${this.cam.zoom.toFixed(2)}x`);
  }

  async _chunk(cx,cy){
    const kk=k(cx,cy);
    if(this.cache.has(kk)) return this.cache.get(kk);
    const res=await fetch(`./assets/world/overworld/chunks/c_${cx}_${cy}.json`);
    if(!res.ok){
      const fill=new Array(CHUNK*CHUNK).fill(this.meta.defaultFill.tile);
      const blank={cx,cy,layers:{ground:{tileset:"grass",data:fill},shadows:{tileset:"shadowPlant",data:new Array(CHUNK*CHUNK).fill(-1)},objects:{tileset:"plant",data:new Array(CHUNK*CHUNK).fill(-1)}}};
      this.cache.set(kk,blank); return blank;
    }
    const ch=await res.json(); this.cache.set(kk,ch);
    if(this.cache.size>90){const first=this.cache.keys().next().value; this.cache.delete(first);}
    return ch;
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
    for(let cy=cT;cy<=cB;cy++) for(let cx=cL;cx<=cR;cx++) this._drawChunk(cx,cy);
    this._drawPlayer(); this._drawMinimap();
  }

  async _drawChunk(cx,cy){
    const ch=await this._chunk(cx,cy);
    const bx=cx*CHUNK*TILE, by=cy*CHUNK*TILE;
    this._drawLayer(ch.layers.ground,bx,by,false);
    this._drawLayer(ch.layers.shadows,bx,by,true);
    this._drawLayer(ch.layers.objects,bx,by,false);
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
      const dx=isShadow?2*z:0, dy=isShadow?3*z:0;
      this.ctx.drawImage(img,r.x,r.y,r.w,r.h,s.x+dx,s.y+dy,TILE*z,TILE*z);
    }
  }

  _drawPlayer(){
    const z=this.cam.zoom, p=this.player, c=this.ctx;
    const frames=this.tilesets.palette.player.frames; const fi=frames[p.frame]??frames[0];
    const ts=this.tilesets.tilesets.player, img=this.images.player, r=srcRect(fi,ts.cols);
    const s=this._w2s(p.x,p.y);
    c.fillStyle="rgba(0,0,0,0.35)"; c.beginPath(); c.ellipse(s.x,s.y+18*z,10*z,5*z,0,0,Math.PI*2); c.fill();
    c.drawImage(img,r.x,r.y,r.w,r.h,s.x-(TILE*z)/2,s.y-(TILE*z),TILE*z,TILE*z);
    c.font=`${Math.floor(12*z)}px system-ui`; c.textAlign="center";
    c.fillStyle="rgba(0,0,0,0.6)"; c.fillText(p.name,s.x+1,s.y-(TILE*z)-8*z+1);
    c.fillStyle="#d6b35f"; c.fillText(p.name,s.x,s.y-(TILE*z)-8*z);
  }

  _drawMinimap(){
    const m=this.mctx,w=this.minimap.width,h=this.minimap.height;
    m.clearRect(0,0,w,h);
    m.fillStyle="rgba(255,255,255,0.05)";
    for(let y=0;y<h;y+=12) m.fillRect(0,y,w,1);
    for(let x=0;x<w;x+=12) m.fillRect(x,0,1,h);
    m.fillStyle="#fff"; m.fillRect(w/2-1,h/2-1,3,3);
  }
}