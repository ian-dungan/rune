import { generateWorld, AUTOTILE_4BIT } from './worldgen.js';

export function bootGame({ mountId, onCoords, getPlayerProfile }){
  const mount = document.getElementById(mountId);
  mount.innerHTML = '';

  const WORLD_SLUG = (window.RUNE_WORLD_SLUG || 'lobby');

  class MainScene extends Phaser.Scene {
    constructor(){
      super('MainScene');
      this.player = null;
      this.cursors = null;
      this.wKey = this.aKey = this.sKey = this.dKey = null;
      this.speed = 160;
      this.worldW = 0;
      this.worldH = 0;
      this.meta = null;
      this.tiles = null;
      this.profile = null;
    }

    preload(){
      // Load config via Phaser loader (no async fetch in preload)
      this.load.json('meta', './meta.json');
      this.load.json('tilesets', './tilesets.json');

      // Player sprite:
      // Use the repo-root sprite sheet (player_sprite.png) so the character isn't a placeholder block.
      // This sheet is 32x64 frames.
      this.load.spritesheet('player', './player_sprite.png', { frameWidth: 32, frameHeight: 64 });
    }

    async create(){
      this.meta = this.cache.json.get('meta') || { seed:'alttp-continent-001', world:{width:256,height:256} };
      this.tiles = this.cache.json.get('tilesets') || null;

      if(!this.tiles?.tilesets){
        this.add.text(16, 16, 'Missing tilesets.json in repo root', { fontFamily:'monospace', fontSize:'16px', color:'#ff6b6b' })
          .setScrollFactor(0);
        return;
      }

      // Enqueue tileset images now that we know their paths.
      // Note: Loader can be used inside create; we wait for completion.
      const ts = this.tiles.tilesets;

      // Set base path relative to page root so GitHub Pages subpaths work.
      // (Do NOT use module-relative paths here.)
      this.load.setBaseURL('');
      this.load.image('grass', ts.grass.image);
      this.load.image('road',  ts.road.image);
      this.load.image('water', ts.water.image);
      this.load.image('plant', ts.plant.image);
      this.load.image('props', ts.props.image);

      // Optional extras if present in tilesets.json
      if(ts.struct?.image) this.load.image('struct', ts.struct.image);
      if(ts.walls?.image)  this.load.image('walls',  ts.walls.image);

      await new Promise((resolve) => {
        this.load.once(Phaser.Loader.Events.COMPLETE, resolve);
        this.load.start();
      });

      // If any textures still missing, show a clear message.
      const needed = ['grass','road','water','plant','props','player'];
      const missing = needed.filter(k => !this.textures.exists(k));
      if(missing.length){
        this.add.text(16, 16, 'Missing textures: ' + missing.join(', '), { fontFamily:'monospace', fontSize:'16px', color:'#ff6b6b' })
          .setScrollFactor(0);
        return;
      }

      // Fetch player profile (async) but don't block map creation forever.
      try{
        this.profile = await (getPlayerProfile?.() ?? null);
      }catch(e){
        console.warn('[Profile] getPlayerProfile failed:', e);
        this.profile = null;
      }

      const world = generateWorld(this.meta);
      this.worldW = world.width;
      this.worldH = world.height;

      // Tilemap setup
      const map = this.make.tilemap({
        tileWidth: 32,
        tileHeight: 32,
        width: this.worldW,
        height: this.worldH
      });

      const tsGrass = map.addTilesetImage('grass', 'grass', 32, 32, 0, 0, 1);
      const tsRoad  = map.addTilesetImage('road',  'road',  32, 32, 0, 0, 1);
      const tsWater = map.addTilesetImage('water', 'water', 32, 32, 0, 0, 1);
      const tsPlant = map.addTilesetImage('plant', 'plant', 32, 32, 0, 0, 1);
      const tsProps = map.addTilesetImage('props', 'props', 32, 32, 0, 0, 1);

      // Layers: base -> overlays
      const layerGrass = map.createBlankLayer('ground_grass', tsGrass, 0, 0, this.worldW, this.worldH, 32, 32);
      const layerRoad  = map.createBlankLayer('ground_road',  tsRoad,  0, 0, this.worldW, this.worldH, 32, 32);
      const layerWater = map.createBlankLayer('ground_water', tsWater, 0, 0, this.worldW, this.worldH, 32, 32);
      const layerDeco  = map.createBlankLayer('decorations',  tsPlant, 0, 0, this.worldW, this.worldH, 32, 32);
      const layerProps = map.createBlankLayer('props',        tsProps, 0, 0, this.worldW, this.worldH, 32, 32);

      // --- Draw order / depth ---
      // Tilemap layers are large display objects; if they sit above the player you can get the
      // "player is stuck behind the ground" effect. We force a strict depth stack:
      //   base ground < water < roads < small deco < player/props (y-sorted)
      layerGrass.setDepth(0);
      layerWater.setDepth(5);
      layerRoad.setDepth(10);
      layerDeco.setDepth(20);

      // Do not visually stamp the props tile layer (we draw props as sprites for proper y-sorting).
      // Keeping the layer around (invisible) leaves room for future collision/picking data.
      layerProps.setDepth(30);
      layerProps.setAlpha(0);

      // (Depth stack already set above.)

      layerGrass.skipCull = true;
      layerRoad.skipCull  = true;
      layerWater.skipCull = true;
      layerDeco.skipCull  = true;
      layerProps.skipCull = true;

      const W = this.worldW;
      const H = this.worldH;

      const tileAt = (arr, x, y) => {
        if(x<0 || y<0 || x>=W || y>=H) return 0;
        return arr[y*W + x];
      };

      // Autotile 4-neighborhood helper
      const autoIndex = (arr, x, y) => {
        const center = tileAt(arr, x, y);
        if(!center) return 0;
        let mask = 0;
        if(tileAt(arr, x, y-1)) mask |= 1;
        if(tileAt(arr, x+1, y)) mask |= 2;
        if(tileAt(arr, x, y+1)) mask |= 4;
        if(tileAt(arr, x-1, y)) mask |= 8;
        return AUTOTILE_4BIT[mask] || center;
      };

      // Paint layers
      for(let y=0;y<H;y++){
        for(let x=0;x<W;x++){
          const i = y*W+x;

          // grass always
          const g = world.layers.grass[i] || 1;
          layerGrass.putTileAt(g, x, y);

          // water autotile
          if(world.layers.water[i]){
            const w = autoIndex(world.layers.water, x, y);
            layerWater.putTileAt(w, x, y);
          }

          // road autotile
          if(world.layers.road[i]){
            const r = autoIndex(world.layers.road, x, y);
            layerRoad.putTileAt(r, x, y);
          }

          // deco optional
          if(world.layers.deco[i]){
            layerDeco.putTileAt(world.layers.deco[i], x, y);
          }
        }
      }

      // Props: spawn as sprites so depth works
      // (For now we also stamp a tile on props layer so minimap/picking can be added later.)
      const propGroup = this.add.group();
      for(const p of world.props){
        // If generator gives named kinds, map them to tile frames.
        // Using props tileset indices (1-based). If unknown, skip.
        const frame = p.frame ?? p.tile ?? null;
        // Keep tile stamp disabled visually (layer is alpha 0). Still useful later for picking.
        if(frame) layerProps.putTileAt(frame, p.x, p.y);
        const spr = this.add.sprite(p.x*32+16, p.y*32+16, 'props', (frame ? frame-1 : 0));
        spr.setOrigin(0.5, 0.75);
        spr.setDepth(10000 + spr.y);
        propGroup.add(spr);
      }

      // Player
      const spawnX = world.spawn?.x ?? Math.floor(W/2);
      const spawnY = world.spawn?.y ?? Math.floor(H/2);

      this.player = this.physics.add.sprite(spawnX*32+16, spawnY*32+16, 'player', 0);
      // Origin closer to feet so y-sorting feels correct.
      this.player.setOrigin(0.5, 0.9);
      // Always above ground layers.
      this.player.setDepth(10000 + this.player.y);
      this.player.setCollideWorldBounds(true);

      // Input
      this.cursors = this.input.keyboard.createCursorKeys();
      this.wKey = this.input.keyboard.addKey('W');
      this.aKey = this.input.keyboard.addKey('A');
      this.sKey = this.input.keyboard.addKey('S');
      this.dKey = this.input.keyboard.addKey('D');

      // Camera
      this.cameras.main.setBounds(0,0,W*32,H*32);
      this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
      this.cameras.main.setZoom(this.meta.camera?.zoom ?? 2);

      // UI callbacks
      this.events.on('postupdate', () => {
        if(!this.player) return;
        const tx = Math.floor(this.player.x/32);
        const ty = Math.floor(this.player.y/32);
        onCoords?.(tx, ty);
      });

      console.log(`[World] Mode: generated • seed: ${this.meta.seed || 'alttp'} • size: ${W}x${H} • world: ${WORLD_SLUG}`);
    }

    update(){
      if(!this.player) return;

      const up    = this.cursors.up.isDown || this.wKey.isDown;
      const down  = this.cursors.down.isDown || this.sKey.isDown;
      const left  = this.cursors.left.isDown || this.aKey.isDown;
      const right = this.cursors.right.isDown || this.dKey.isDown;

      let vx = 0, vy = 0;
      if(left) vx -= 1;
      if(right) vx += 1;
      if(up) vy -= 1;
      if(down) vy += 1;

      if(vx !== 0 && vy !== 0){
        const inv = 1/Math.sqrt(2);
        vx *= inv; vy *= inv;
      }

      this.player.setVelocity(vx*this.speed, vy*this.speed);
      // RPG depth sort: compare by feet position, always above ground layers.
      this.player.setDepth(10000 + this.player.y);
    }
  }

  const cfg = {
    type: Phaser.AUTO,
    parent: mountId,
    backgroundColor: '#0a0f15',
    pixelArt: true,
    roundPixels: true,
    physics: { default:'arcade', arcade:{ gravity:{y:0}, debug:false } },
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: '100%',
      height: '100%'
    },
    scene: [MainScene]
  };

  const game = new Phaser.Game(cfg);

  return {
    destroy(){
      game.destroy(true);
      mount.innerHTML = '';
    }
  };
}
