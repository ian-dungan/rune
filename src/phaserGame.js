import { generateWorld, AUTOTILE_4BIT } from './worldgen.js';

export function bootGame({ mountId, onCoords, getPlayerProfile }){
  const mount = document.getElementById(mountId);
  mount.innerHTML = '';

  class MainScene extends Phaser.Scene {
    constructor(){
      super('MainScene');
      this.player = null;
      this.speed = 160;
    }

    preload(){
      this.load.json('meta', './meta.json');
      this.load.json('tilesets', './tilesets.json');
      this.load.spritesheet('player', './player_sprite.png', { frameWidth: 32, frameHeight: 64 });
    }

    async create(){
      this.meta = this.cache.json.get('meta') || { seed:'alttp-001', world:{width:256,height:256} };
      this.tiles = this.cache.json.get('tilesets') || null;

      if(!this.tiles?.tilesets){
        this.add.text(16, 16, 'Missing tilesets.json', { fontSize:'16px', color:'#ff0000' }).setScrollFactor(0);
        return;
      }

      const ts = this.tiles.tilesets;
      this.load.setBaseURL('');
      this.load.image('grass', ts.grass.image);
      this.load.image('road', ts.road.image);
      this.load.image('water', ts.water.image);
      this.load.image('plant', ts.plant.image);
      this.load.image('props', ts.props.image);

      await new Promise((resolve) => {
        this.load.once(Phaser.Loader.Events.COMPLETE, resolve);
        this.load.start();
      });

      const missing = ['grass','road','water','plant','props','player'].filter(k => !this.textures.exists(k));
      if(missing.length){
        this.add.text(16, 16, 'Missing: ' + missing.join(', '), { fontSize:'16px', color:'#ff0000' }).setScrollFactor(0);
        return;
      }

      const world = generateWorld(this.meta);
      const W = world.width, H = world.height;

      const map = this.make.tilemap({
        tileWidth: 32, tileHeight: 32,
        width: W, height: H
      });

      const tsGrass = map.addTilesetImage('grass', 'grass', 32, 32, 0, 0, 1);
      const tsRoad = map.addTilesetImage('road', 'road', 32, 32, 0, 0, 1);
      const tsWater = map.addTilesetImage('water', 'water', 32, 32, 0, 0, 1);
      const tsPlant = map.addTilesetImage('plant', 'plant', 32, 32, 0, 0, 1);
      const tsProps = map.addTilesetImage('props', 'props', 32, 32, 0, 0, 1);

      const layerGrass = map.createBlankLayer('grass', tsGrass, 0, 0, W, H, 32, 32);
      const layerRoad = map.createBlankLayer('road', tsRoad, 0, 0, W, H, 32, 32);
      const layerWater = map.createBlankLayer('water', tsWater, 0, 0, W, H, 32, 32);
      const layerDeco = map.createBlankLayer('deco', tsPlant, 0, 0, W, H, 32, 32);

      // CRITICAL: All ground layers at depth 0
      layerGrass.setDepth(0);
      layerRoad.setDepth(0);
      layerWater.setDepth(0);
      layerDeco.setDepth(0);

      // Auto-tile helper
      const tileAt = (arr, x, y) => {
        if(x<0 || y<0 || x>=W || y>=H) return 0;
        return arr[y*W + x];
      };

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

      // Paint tiles
      for(let y=0; y<H; y++){
        for(let x=0; x<W; x++){
          const i = y*W+x;
          
          layerGrass.putTileAt(world.layers.grass[i], x, y);
          
          if(world.layers.water[i]){
            layerWater.putTileAt(autoIndex(world.layers.water, x, y), x, y);
          }
          
          if(world.layers.road[i]){
            layerRoad.putTileAt(autoIndex(world.layers.road, x, y), x, y);
          }
          
          if(world.layers.deco[i]){
            layerDeco.putTileAt(world.layers.deco[i], x, y);
          }
        }
      }

      // Props as sprites
      for(const p of world.props){
        const spr = this.add.sprite(p.x*32+16, p.y*32+16, 'props', 0);
        spr.setOrigin(0.5, 0.75);
        spr.setDepth(100);
      }

      // Player
      const spawnX = world.spawn?.x ?? Math.floor(W/2);
      const spawnY = world.spawn?.y ?? Math.floor(H/2);

      this.player = this.physics.add.sprite(spawnX*32+16, spawnY*32+16, 'player', 0);
      this.player.setOrigin(0.5, 0.9);
      this.player.setDepth(200); // ALWAYS above everything
      this.player.setCollideWorldBounds(true);

      // Input
      this.cursors = this.input.keyboard.createCursorKeys();
      this.wKey = this.input.keyboard.addKey('W');
      this.aKey = this.input.keyboard.addKey('A');
      this.sKey = this.input.keyboard.addKey('S');
      this.dKey = this.input.keyboard.addKey('D');

      // Camera
      this.cameras.main.setBounds(0, 0, W*32, H*32);
      this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
      this.cameras.main.setZoom(this.meta.camera?.zoom ?? 2.5);

      this.events.on('postupdate', () => {
        if(!this.player) return;
        const tx = Math.floor(this.player.x/32);
        const ty = Math.floor(this.player.y/32);
        onCoords?.(tx, ty);
      });

      console.log(`[World] Generated • ${W}x${H} • spawn: (${spawnX}, ${spawnY})`);
    }

    update(){
      if(!this.player) return;

      const up = this.cursors.up.isDown || this.wKey.isDown;
      const down = this.cursors.down.isDown || this.sKey.isDown;
      const left = this.cursors.left.isDown || this.aKey.isDown;
      const right = this.cursors.right.isDown || this.dKey.isDown;

      let vx = 0, vy = 0;
      if(left) vx -= 1;
      if(right) vx += 1;
      if(up) vy -= 1;
      if(down) vy += 1;

      if(vx && vy){
        const inv = 1/Math.sqrt(2);
        vx *= inv;
        vy *= inv;
      }

      this.player.setVelocity(vx*this.speed, vy*this.speed);
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
