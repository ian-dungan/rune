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
    // --- Overworld image (vibrant RPG map) ---
    this.load.image('overworld_big', 'assets/maps/overworld_big.png');

    // --- Tilemap overworld (legacy / optional) ---
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

    // --- Build world from a single vibrant overworld image ---
const bg = this.add.image(0, 0, 'overworld_big').setOrigin(0, 0);

const worldW = bg.width;
const worldH = bg.height;

// World bounds
this.physics.world.setBounds(0, 0, worldW, worldH);
this.cameras.main.setBounds(0, 0, worldW, worldH);

// --- Auto-collision from the overworld image (water/ocean) ---
// We sample the image into a coarse grid and mark "water" cells as blocked.
// This keeps authoring simple while making the world feel real immediately.
const cell = 32; // collision grid size in pixels (bigger = faster, smaller = tighter)
const blockers = this.add.group();
this.blockers = blockers;

try {
  const srcImg = this.textures.get('overworld_big').getSourceImage();
  const ctex = document.createElement('canvas');
  ctex.width = srcImg.width;
  ctex.height = srcImg.height;
  const ctx = ctex.getContext('2d');
  ctx.drawImage(srcImg, 0, 0);
  const imgData = ctx.getImageData(0, 0, srcImg.width, srcImg.height).data;

  const isWater = (r, g, b) => {
    // Heuristic: strong blue and not too bright green -> water
    return (b > 130 && b > g + 20 && b > r + 20);
  };

  for (let y = 0; y < worldH; y += cell) {
    for (let x = 0; x < worldW; x += cell) {
      const sx = Math.min(worldW - 1, x + (cell >> 1));
      const sy = Math.min(worldH - 1, y + (cell >> 1));
      const idx = (sy * worldW + sx) * 4;
      const r = imgData[idx], g = imgData[idx + 1], b = imgData[idx + 2];
      if (isWater(r, g, b)) {
        const rect = this.add.rectangle(x + cell / 2, y + cell / 2, cell, cell, 0x000000, 0);
        this.physics.add.existing(rect, true); // static body
        blockers.add(rect);
      }
    }
  }
} catch (e) {
  console.warn('[World] Collision auto-gen skipped (canvas read failed):', e);
}

    // Spawn point from Tiled
        const spawnX = Math.round(worldW * 0.70);
    const spawnY = Math.round(worldH * 0.40);

    // Player
    this.player = new Player(this, spawnX, spawnY);
    this.player.sprite.setCollideWorldBounds(true);

    // Soft shadow to add "volume"
    this.playerShadow = this.add.ellipse(spawnX, spawnY + 18, 28, 12, 0x000000, 0.22);
    this.playerShadow.setDepth(this.player.sprite.y - 1);

    // Colliders (auto-generated)
    if (this.blockers) this.physics.add.collider(this.player.sprite, this.blockers);

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
