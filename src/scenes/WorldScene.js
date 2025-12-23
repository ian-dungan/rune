import * as Phaser from '../lib/phaser.esm.js';
import Player from '../player/Player.js';
import { supabaseReady } from '../supabase/SupabaseClient.js';

export default class WorldScene extends Phaser.Scene {
  constructor() {
    super('WorldScene');
    this.username = null;
    this.username_norm = null;
  }

  init(data) {
    this.username = data?.username || null;
    this.username_norm = data?.username_norm || (this.username ? this.username.toLowerCase() : null);
  }

  preload() {
    // --- Tilemap overworld (Tiled JSON) ---
    this.load.tilemapTiledJSON('overworld', 'assets/maps/Overworld.json');
    this.load.image('glades_tiles', 'assets/tilesets/glades_tiles.png');

    // Knight animations (PNG sprite sheets in /assets/sprites/)
    const animations = [
      'IDLE','WALK','RUN','JUMP','ATTACK 1','ATTACK 2','ATTACK 3','DEFEND','HURT','DEATH'
    ];
    animations.forEach(name => {
      this.load.spritesheet(name, `assets/sprites/${name}.png`, { frameWidth: 84, frameHeight: 84 });
    });

    // Music
    this.load.audio('plains_theme', 'assets/music/plains_theme.mp3');

    // Helpful loader logging (so you can see missing/corrupt assets)
    this.load.on('loaderror', (file) => {
      console.error('[LoadError]', file?.key, file?.src);
    });
  }

  async create() {
    // Supabase remains intact (login/profile/etc). We only wait for readiness.
    this.supabase = await supabaseReady;

    // --- Build world from Tiled ---
    const map = this.make.tilemap({ key: 'overworld' });
    const tileset = map.addTilesetImage('glades_tiles', 'glades_tiles');

    this.groundLayer = map.createLayer('Ground', tileset, 0, 0);
    this.waterLayer  = map.createLayer('Water', tileset, 0, 0);
    this.obstaclesLayer = map.createLayer('Obstacles', tileset, 0, 0);

    // Collision: any tile with property collides=true
    this.waterLayer.setCollisionByProperty({ collides: true });
    this.obstaclesLayer.setCollisionByProperty({ collides: true });

    // World bounds
    const worldW = map.widthInPixels;
    const worldH = map.heightInPixels;
    this.physics.world.setBounds(0, 0, worldW, worldH);
    this.cameras.main.setBounds(0, 0, worldW, worldH);

    // Spawn point from Tiled
    const spawn = map.findObject('SpawnPoints', o => o.name === 'player_start') || { x: worldW/2, y: worldH/2 };
    const spawnX = Math.round(spawn.x);
    const spawnY = Math.round(spawn.y);

    // Player
    this.player = new Player(this, spawnX, spawnY);
    this.player.sprite.setCollideWorldBounds(true);

    // Soft shadow to add "volume"
    this.playerShadow = this.add.ellipse(spawnX, spawnY + 18, 28, 12, 0x000000, 0.22);
    this.playerShadow.setDepth(this.player.sprite.y - 1);

    // Colliders
    this.physics.add.collider(this.player.sprite, this.waterLayer);
    this.physics.add.collider(this.player.sprite, this.obstaclesLayer);

    // Camera
    this.cameras.main.startFollow(this.player.sprite, true, 0.10, 0.10);
    this.cameras.main.setZoom(1.6);
    this.cameras.main.roundPixels = true;

    // Mouse wheel zoom
    this.input.on('wheel', (_p, _go, _dx, dy) => {
      const cam = this.cameras.main;
      const next = Phaser.Math.Clamp(cam.zoom - dy * 0.0012, 0.6, 3.0);
      cam.setZoom(next);
    });

    // Music (simple loop)
    try {
      const music = this.sound.add('plains_theme', { loop: true, volume: 0.35 });
      music.play();
    } catch (e) {
      console.warn('[Music] Could not start:', e);
    }

    // Minimal HUD: username + coords
    const label = this.username ? `Player: ${this.username}` : 'Player';
    this.add.text(12, 10, label, { fontFamily: 'monospace', fontSize: '14px', color: '#ffffff' })
      .setScrollFactor(0).setDepth(99999);

    this.coordsText = this.add.text(12, 30, '', { fontFamily: 'monospace', fontSize: '12px', color: '#ffffff' })
      .setScrollFactor(0).setDepth(99999);
  }

  update(_time, delta) {
    if (!this.player) return;
    this.player.update(delta);

    // y-sort for player + shadow so you feel "in" the world
    this.player.sprite.setDepth(this.player.sprite.y);
    if (this.playerShadow) {
      this.playerShadow.setPosition(this.player.sprite.x, this.player.sprite.y + 18);
      this.playerShadow.setDepth(this.player.sprite.y - 1);
    }

    if (this.coordsText) {
      const x = Math.round(this.player.sprite.x);
      const y = Math.round(this.player.sprite.y);
      this.coordsText.setText(`x:${x}  y:${y}`);
    }
  }
}
