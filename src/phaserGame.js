
import { generateWorld, AUTOTILE_4BIT } from './worldgen.js';

export function bootGame({ mountId, onCoords, getPlayerProfile }){
  const mount = document.getElementById(mountId);
  mount.innerHTML = '';
  let api = {};

  async function loadJson(url){
    const r = await fetch(url);
    if(!r.ok) throw new Error(`Failed ${url}: ${r.status}`);
    return await r.json();
  }

  function tileAt(layer, w, x, y){
    if(x<0||y<0||x>=w||y>=worldH) return 0;
    return layer[y*w + x];
  }

  let worldW=0, worldH=0;

  function makeAutotileLayer(scene, map, name, tileset, srcLayer, placeholderTile){
    const layer = map.createBlankLayer(name, tileset, 0, 0, worldW, worldH, 32, 32);
    layer.skipCull = true;
    for(let y=0;y<worldH;y++){
      for(let x=0;x<worldW;x++){
        const v = srcLayer[y*worldW+x];
        if(!v) continue;
        // 4bit mask based on same placeholder (value nonzero)
        let mask = 0;
        if(tileAt(srcLayer, worldW, x, y-1)) mask |= 1;
        if(tileAt(srcLayer, worldW, x+1, y)) mask |= 2;
        if(tileAt(srcLayer, worldW, x, y+1)) mask |= 4;
        if(tileAt(srcLayer, worldW, x-1, y)) mask |= 8;
        const id = AUTOTILE_4BIT[mask] || placeholderTile;
        layer.putTileAt(id, x, y);
      }
    }
    return layer;
  }

  class MainScene extends Phaser.Scene{
    constructor(){ super('Main'); }
    async preload(){
      const tiles = await loadJson('./tilesets.json');
      this.tiles = tiles;

      this.load.spritesheet('player', tiles.tilesets.player.image, {
        frameWidth: tiles.tilesets.player.frameWidth,
        frameHeight: tiles.tilesets.player.frameHeight
      });

      // Tilesets
      this.load.image('grass', tiles.tilesets.grass.image);
      this.load.image('road', tiles.tilesets.road.image);
      this.load.image('water', tiles.tilesets.water.image);
      this.load.image('plant', tiles.tilesets.plant.image);
      this.load.image('props', tiles.tilesets.props.image);

      // meta
      this.meta = await loadJson('./meta.json');
    }

    async create(){
      const profile = await getPlayerProfile?.() || {};
      const outfit = profile?.outfit || 'green';

      // Generate world (deterministic)
      const world = generateWorld(this.meta);
      worldW = world.width; worldH = world.height;

      // Tilemap (multiple layers)
      const map = this.make.tilemap({ tileWidth:32, tileHeight:32, width:worldW, height:worldH });

      const tsGrass = map.addTilesetImage('grass', 'grass', 32, 32, 0, 0, 1);
      const tsRoad  = map.addTilesetImage('road', 'road', 32, 32, 0, 0, 1);
      const tsWater = map.addTilesetImage('water', 'water', 32, 32, 0, 0, 1);
      const tsPlant = map.addTilesetImage('plant', 'plant', 32, 32, 0, 0, 1);
      const tsProps = map.addTilesetImage('props', 'props', 32, 32, 0, 0, 1);

      // Grass layer (direct tile ids)
      const grassLayer = map.createBlankLayer('ground_grass', tsGrass, 0, 0, worldW, worldH, 32, 32);
      grassLayer.skipCull = true;
      for(let y=0;y<worldH;y++){
        for(let x=0;x<worldW;x++){
          const id = world.layers.grass[y*worldW+x];
          grassLayer.putTileAt(id || 1, x, y);
        }
      }

      // Autotiled water/road
      const waterLayer = makeAutotileLayer(this, map, 'ground_water', tsWater, world.layers.water, 1);
      const roadLayer  = makeAutotileLayer(this, map, 'ground_road', tsRoad,  world.layers.road, 1);

      // Deco layer
      const decoLayer = map.createBlankLayer('decorations', tsPlant, 0, 0, worldW, worldH, 32, 32);
      decoLayer.skipCull = true;
      for(let y=0;y<worldH;y++){
        for(let x=0;x<worldW;x++){
          const id = world.layers.deco[y*worldW+x];
          if(id) decoLayer.putTileAt(id, x, y);
        }
      }

      // Props as sprites with depth sorting + collisions
      this.physics.world.setBounds(0,0, worldW*32, worldH*32);

      const colliders = this.physics.add.staticGroup();
      const propSprites = [];
      for(const p of world.props){
        const px = p.x*32 + 16;
        const py = p.y*32 + 16;
        let frame = 1;
        if(p.kind==='tree') frame = 1;
        if(p.kind==='rock') frame = 33;
        const s = this.add.sprite(px, py, 'props', frame);
        s.setOrigin(0.5, 0.65);
        s.depth = py;
        propSprites.push(s);

        // simple blocker
        const b = this.add.rectangle(px, py+6, 20, 18, 0x000000, 0);
        this.physics.add.existing(b, true);
        colliders.add(b);
      }

      // Player
      const spawn = world.spawn || {x: 40, y: 40};
      this.player = this.physics.add.sprite(spawn.x*32 + 16, spawn.y*32 + 16, 'player', 0);
      this.player.setSize(16, 18).setOffset(8, 12);
      this.player.setCollideWorldBounds(true);
      this.player.depth = this.player.y;

      // Outfit tint (simple but effective)
      const tints = { green:0x7dffb1, blue:0x86c7ff, red:0xff8492, tan:0xe9d7a3 };
      this.player.setTint(tints[outfit] || 0xffffff);

      // Animations
      this.anims.create({ key:'walkDown', frames:this.anims.generateFrameNumbers('player',{ start:0, end:3 }), frameRate:10, repeat:-1 });
      this.anims.create({ key:'walkLeft', frames:this.anims.generateFrameNumbers('player',{ start:4, end:7 }), frameRate:10, repeat:-1 });
      this.anims.create({ key:'walkRight',frames:this.anims.generateFrameNumbers('player',{ start:8, end:11}), frameRate:10, repeat:-1 });
      this.anims.create({ key:'walkUp',   frames:this.anims.generateFrameNumbers('player',{ start:12,end:15}), frameRate:10, repeat:-1 });

      this.cursors = this.input.keyboard.addKeys({ up:'W', left:'A', down:'S', right:'D', up2:'UP', left2:'LEFT', down2:'DOWN', right2:'RIGHT' });

      this.physics.add.collider(this.player, colliders);

      // Camera
      const cam = this.cameras.main;
      cam.setBounds(0,0, worldW*32, worldH*32);
      cam.startFollow(this.player, true, this.meta.camera?.lerp ?? 0.12, this.meta.camera?.lerp ?? 0.12);
      cam.setZoom(this.meta.camera?.zoom ?? 2.5);

      // Subtle color grade overlay for “ALTTP vibe”
      const vignette = this.add.rectangle(0,0, 10, 10, 0x0b0f14, 0.10).setOrigin(0).setScrollFactor(0);
      vignette.setDisplaySize(this.scale.width, this.scale.height);
      this.scale.on('resize', (s)=> vignette.setDisplaySize(s.width, s.height));

      // Loop: update HUD coords
      this.events.on('postupdate', ()=>{
        onCoords?.(Math.floor(this.player.x/32), Math.floor(this.player.y/32));
      });
    }

    update(){
      const speed = this.meta.player?.speed ?? 140;
      const k = this.cursors;
      const vx = (k.left.isDown||k.left2.isDown ? -1:0) + (k.right.isDown||k.right2.isDown ? 1:0);
      const vy = (k.up.isDown||k.up2.isDown ? -1:0) + (k.down.isDown||k.down2.isDown ? 1:0);

      const v = new Phaser.Math.Vector2(vx, vy).normalize().scale(speed);
      this.player.setVelocity(v.x, v.y);

      // anim
      if(v.length() < 1){
        this.player.anims.stop();
      } else {
        if(Math.abs(v.x) > Math.abs(v.y)){
          this.player.anims.play(v.x>0 ? 'walkRight' : 'walkLeft', true);
        } else {
          this.player.anims.play(v.y>0 ? 'walkDown' : 'walkUp', true);
        }
      }
      this.player.depth = this.player.y;
    }
  }
  const cfg = {
    type: Phaser.AUTO,
    parent: mountId,
    backgroundColor: '#0a0f15',
    pixelArt: true,
    roundPixels: true,
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH
    },
    physics: {
      default: 'arcade',
      arcade: { debug: false }
    },
    scene: [ MainScene ]
  };

  const game = new Phaser.Game(cfg);
  api.destroy = ()=> game.destroy(true);
  return api;


}
