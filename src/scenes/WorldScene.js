import * as Phaser from '../lib/phaser.esm.js';
import Player from '../player/Player.js';
import { supabaseReady } from '../supabase/SupabaseClient.js';

export default class WorldScene extends Phaser.Scene {
  constructor() {
    super('WorldScene');
  }

  init(data) {
    this.username = data?.username || null;
    this.username_norm = data?.username_norm || (this.username ? this.username.toLowerCase() : null);
  }

  preload() {
    // Tiled overworld
    this.load.tilemapTiledJSON('overworld', 'assets/maps/Overworld.json');
    this.load.image('glades_tiles', 'assets/tilesets/glades_tiles.png');

    // World map UI (painted reference)
    this.load.image('worldmap_ui', 'assets/ui/worldmap.png');

    // Player sprite sheets
    const animations = ['IDLE','WALK','RUN','JUMP','ATTACK 1','ATTACK 2','ATTACK 3','DEFEND','HURT','DEATH'];
    animations.forEach(name => {
      this.load.spritesheet(name, `assets/sprites/${name}.png`, { frameWidth: 84, frameHeight: 84 });
    });
  }

  async create() {
    await supabaseReady;

    // --- Build map from Tiled JSON ---
    const map = this.make.tilemap({ key: 'overworld' });
    const tileset = map.addTilesetImage('glades_tiles', 'glades_tiles');

    const ground = map.createLayer('Ground', tileset, 0, 0);
    const detailsLow = map.createLayer('DetailsLow', tileset, 0, 0);
    const detailsHigh = map.createLayer('DetailsHigh', tileset, 0, 0);

    ground.setDepth(0);
    detailsLow.setDepth(1);
    detailsHigh.setDepth(20);

    // Collisions via tileset property collides=true
    ground.setCollisionByProperty({ collides: true });
    detailsHigh.setCollisionByProperty({ collides: true });

    // --- Player ---
    this.player = new Player(this, 0, 0);

    const spawn = map.findObject('SpawnPoints', o => o.name === 'player_start');
    if (spawn) this.player.sprite.setPosition(spawn.x, spawn.y);
    this.player.sprite.setDepth(10);

    this.physics.add.collider(this.player.sprite, ground);
    this.physics.add.collider(this.player.sprite, detailsHigh);

    // World bounds + camera
    const worldW = map.widthInPixels;
    const worldH = map.heightInPixels;
    this.physics.world.setBounds(0, 0, worldW, worldH);
    this.player.sprite.body.setCollideWorldBounds(true);

    this.cameras.main.setBounds(0, 0, worldW, worldH);
    this.cameras.main.startFollow(this.player.sprite, true, 0.12, 0.12);
    this.cameras.main.setZoom(2);

    // --- UI ---
    this.add.text(10, 10, 'WASD/Arrows • Shift=Run • Wheel=Zoom • M=World Map', {
      fontFamily: 'sans-serif',
      fontSize: '14px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3
    }).setScrollFactor(0).setDepth(2000);

    // Zoom
    this.input.on('wheel', (pointer, gameObjects, dx, dy) => {
      const cam = this.cameras.main;
      const z = Phaser.Math.Clamp(cam.zoom + (dy > 0 ? -0.1 : 0.1), 1, 4);
      cam.setZoom(Math.round(z * 10) / 10);
    });

    // World map overlay
    const w = this.scale.width;
    const h = this.scale.height;
    this.keyMap = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.M);
    this.worldMapOpen = false;

    this.mapOverlayBg = this.add.rectangle(w/2, h/2, w*0.92, h*0.92, 0x000000, 0.65)
      .setScrollFactor(0).setDepth(1000).setVisible(false);

    this.mapOverlayImg = this.add.image(w/2, h/2, 'worldmap_ui')
      .setScrollFactor(0).setDepth(1001).setVisible(false);

    const maxW = w*0.9, maxH = h*0.9;
    const scale = Math.min(maxW / this.mapOverlayImg.width, maxH / this.mapOverlayImg.height);
    this.mapOverlayImg.setScale(scale);

    this.mapMarker = this.add.circle(w/2, h/2, 5, 0xff4444, 1)
      .setScrollFactor(0).setDepth(1002).setVisible(false);
  }

  update() {
    // Toggle overlay
    if (Phaser.Input.Keyboard.JustDown(this.keyMap)) {
      this.worldMapOpen = !this.worldMapOpen;
      this.mapOverlayBg.setVisible(this.worldMapOpen);
      this.mapOverlayImg.setVisible(this.worldMapOpen);
      this.mapMarker.setVisible(this.worldMapOpen);
    }

    if (this.worldMapOpen) {
      const worldW = this.physics.world.bounds.width;
      const worldH = this.physics.world.bounds.height;

      const px = this.player.sprite.x / worldW;
      const py = this.player.sprite.y / worldH;

      const img = this.mapOverlayImg;
      const imgW = img.width * img.scaleX;
      const imgH = img.height * img.scaleY;

      this.mapMarker.x = img.x - imgW/2 + px * imgW;
      this.mapMarker.y = img.y - imgH/2 + py * imgH;
    }

    // Keep player in the right draw order relative to shadows/props
    this.player.sprite.setDepth(this.player.sprite.y);

    this.player.update();
  }
}
