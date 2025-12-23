import Player from '../player/Player.js';
import { supabase } from '../supabase/SupabaseClient.js';

export default class WorldScene extends Phaser.Scene {
  constructor() { super('WorldScene'); }

  preload() {
    // Map and art
    this.load.tilemapTiledJSON('world', 'assets/maps/world.json');
    this.load.image('world_art', 'assets/maps/world_art.png');

    // Load knight animations (drop your actual PNGs into /assets/sprites/)
    const animations = ['ATTACK 1','ATTACK 2','ATTACK 3','DEATH','DEFEND','HURT','IDLE','JUMP','RUN','WALK'];
    animations.forEach(name => {
      this.load.spritesheet(name, `assets/sprites/${name}.png`, {
        frameWidth: 84, frameHeight: 84
      });
    });

    // Music
    this.load.audio('plains_theme', 'assets/music/plains_theme.mp3');
  }

  create() {
    this.map = this.add.image(0, 0, 'world_art').setOrigin(0, 0);
    this.player = new Player(this, 2000, 2000);
    this.cameras.main.startFollow(this.player.sprite, true, 0.08, 0.08);
    this.cameras.main.setZoom(2.5);
    this.sound.play('plains_theme', { loop: true, volume: 0.5 });
  }

  update() { this.player.update(); }
}