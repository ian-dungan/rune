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
    // --- Background map (generated placeholder png in assets/maps/world_art.png) ---
    this.load.image('world_art', 'assets/maps/world_art.png');
    // Walkability mask (white=walkable, black=blocked)
    this.load.image('walkmask', 'assets/maps/walkmask.png');

    // Foreground occluders (auto-cut from painted map)
    this.load.image('fg_castle', 'assets/fg/fg_castle.png');
    this.load.image('fg_forest', 'assets/fg/fg_forest.png');
    this.load.image('fg_snowtown', 'assets/fg/fg_snowtown.png');
    this.load.image('fg_desertcity', 'assets/fg/fg_desertcity.png');
    this.load.image('fg_lighthouse', 'assets/fg/fg_lighthouse.png');
    this.load.image('fg_tower', 'assets/fg/fg_tower.png');
    this.load.image('fg_bridge', 'assets/fg/fg_bridge.png');

    // Knight animations (PNG sprite sheets in /assets/sprites/)
    const animations = ['ATTACK 1','ATTACK 2','ATTACK 3','DEATH','DEFEND','HURT','IDLE','JUMP','RUN','WALK'];
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
    // Make sure Supabase is ready (we won't hard-fail if creds missing)
    this.supabase = await supabaseReady;

    // Background
    const bg = this.add.image(0, 0, 'world_art').setOrigin(0, 0);

    // World bounds (match background image)
    const w = bg.width;
    const h = bg.height;
    this.physics.world.setBounds(0, 0, w, h);
    this.cameras.main.setBounds(0, 0, w, h);


// --- Foreground occluders + simple structure colliders ---
const fg = [];
const makeFg = (key, x, y, collider = null) => {
  const s = this.add.image(x, y, key).setOrigin(0, 0);
  // Depth is based on the "base" of the object, so the player can walk behind it.
  s.setDepth(y + s.height);
  fg.push(s);

  if (collider) {
    const { cx, cy, cw, ch } = collider;
    const r = this.add.rectangle(cx, cy, cw, ch, 0x000000, 0);
    this.physics.add.existing(r, true); // static body
    r.body.setOffset(-cw / 2, -ch / 2);
    this._colliders.push(r);
  }
  return s;
};

this._colliders = [];

// Place a handful of occluders (these were auto-cut; feel free to tweak boxes later)
makeFg('fg_bridge', 360, 40,  { cx: 550, cy: 160, cw: 260, ch: 60 });
makeFg('fg_castle', 360, 330, { cx: 530, cy: 540, cw: 240, ch: 140 });
makeFg('fg_forest', 20, 160,  { cx: 190, cy: 410, cw: 260, ch: 120 });
makeFg('fg_snowtown', 660, 150,{ cx: 840, cy: 330, cw: 240, ch: 120 });
makeFg('fg_desertcity', 690, 520,{ cx: 860, cy: 705, cw: 230, ch: 130 });
makeFg('fg_lighthouse', 735, 825,{ cx: 910, cy: 980, cw: 150, ch: 110 });
makeFg('fg_tower', 0, 820,   { cx: 90,  cy: 990, cw: 140, ch: 110 });
    // Spawn position (later you can load from Supabase)
    const spawnX = Math.floor(w * 0.5);
    const spawnY = Math.floor(h * 0.55);

    // Player
    this.player = new Player(this, spawnX, spawnY);
    this.player.sprite.setCollideWorldBounds(true);

    // Soft shadow to add "volume"
    this.playerShadow = this.add.ellipse(spawnX, spawnY + 18, 28, 12, 0x000000, 0.25);
    this.playerShadow.setDepth(this.player.sprite.y - 1);

    // Collide with key structures (doesn't affect Supabase)
    this._colliders?.forEach(c => this.physics.add.collider(this.player.sprite, c));

    // Camera
    this.cameras.main.startFollow(this.player.sprite, true, 0.08, 0.08);
    this.cameras.main.setZoom(1.35);
    this.cameras.main.roundPixels = true;

    // Mouse wheel zoom
    this.input.on('wheel', (_p, _go, _dx, dy) => {
      const cam = this.cameras.main;
      const next = Phaser.Math.Clamp(cam.zoom - dy * 0.0012, 0.6, 3.0);
      cam.setZoom(next);
    });


    // HUD
    this.coordsText = this.add.text(16, 38, '', {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: '14px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3
    }).setScrollFactor(0);

    // HUD
    const name = this.username || 'Guest';
    this.add.text(16, 12, `🗡️ ${name}`, {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: '18px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 4
    }).setScrollFactor(0);

    // Music
    try {
      this.sound.play('plains_theme', { loop: true, volume: 0.45 });
    } catch (e) {
      console.warn('[Audio] Could not start music:', e);
    }
  }

update(time, delta) {
  this.player?.update?.();

  if (this.player && this.player.sprite) {
    // Depth-sort so you can walk behind objects
    this.player.sprite.setDepth(this.player.sprite.y);

    if (this.playerShadow) {
      this.playerShadow.x = this.player.sprite.x;
      this.playerShadow.y = this.player.sprite.y + 18;
      this.playerShadow.setDepth(this.player.sprite.y - 1);
    }

    // Walkmask collision (keeps you out of water / high mountains)
    const tx = Math.floor(this.player.sprite.x);
    const ty = Math.floor(this.player.sprite.y + 20); // feet
    const tex = this.textures.get('walkmask');

    if (!this._lastGood) this._lastGood = { x: this.player.sprite.x, y: this.player.sprite.y };

    const src = tex?.getSourceImage?.();
    const inBounds = src && tx >= 0 && ty >= 0 && tx < src.width && ty < src.height;

    if (inBounds) {
      const p = tex.getPixel(tx, ty);
      const walkable = p && p.r > 30; // white-ish
      if (walkable) {
        this._lastGood.x = this.player.sprite.x;
        this._lastGood.y = this.player.sprite.y;
      } else {
        // Revert to last good position
        this.player.sprite.setPosition(this._lastGood.x, this._lastGood.y);
        this.player.sprite.body?.setVelocity(0, 0);
      }
    }
  }

  if (this.coordsText && this.player?.sprite) {
    const x = Math.round(this.player.sprite.x);
    const y = Math.round(this.player.sprite.y);
    this.coordsText.setText(`📍 ${x}, ${y}`);
  }
}
}