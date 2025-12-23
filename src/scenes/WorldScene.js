import Player from '../player/Player.js';
import { supabase } from '../supabase/SupabaseClient.js';

export default class WorldScene extends Phaser.Scene {
  constructor() { super('WorldScene'); }
  preload() {
    this.load.tilemapTiledJSON('world', 'assets/maps/world.json');
    this.load.image('world_art', 'assets/maps/world_art.png');

    const animations = [
      'ATTACK 1','ATTACK 2','ATTACK 3','DEATH','DEFEND',
      'HURT','IDLE','JUMP','RUN','WALK'
    ];
    animations.forEach(name => {
      this.load.spritesheet(name, `assets/sprites/${name}.png`, {
        frameWidth: 84, frameHeight: 84
      });
    });
  }
  create() {
    this.map = this.add.image(0, 0, 'world_art').setOrigin(0, 0);
    this.player = new Player(this, 2000, 2000);
    this.cameras.main.startFollow(this.player.sprite, true, 0.08, 0.08);
    this.cameras.main.setZoom(2.5);
  }
  update() { this.player.update(); }
}