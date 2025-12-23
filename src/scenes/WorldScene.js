import Player from '../player/Player.js';
import MobileControls from '../player/MobileControls.js';

export default class WorldScene extends Phaser.Scene {
  constructor() { super('WorldScene'); }

  preload() {
    this.load.image('tileset', 'assets/images/tileset.png');
    this.load.tilemapTiledJSON('town', 'assets/maps/town.json');
    this.load.spritesheet('knight', 'assets/images/knight.png', { frameWidth: 32, frameHeight: 32 });
    this.load.audio('ambient', 'assets/audio/ambient.mp3');
    this.load.audio('step', 'assets/audio/step_grass.wav');
  }

  create({ username }) {
    this.sound.play('ambient', { loop: true, volume: 0.4 });
    const map = this.make.tilemap({ key: 'town' });
    const tileset = map.addTilesetImage('tileset', 'tileset');
    map.createLayer('Ground', tileset, 0, 0);

    this.player = new Player(this, 400, 300, 'knight');
    this.cameras.main.startFollow(this.player);
    this.keys = this.input.keyboard.addKeys('W,A,S,D');

    if (/Mobi|Android/i.test(navigator.userAgent)) {
      new MobileControls(this, this.player);
      console.log('📱 Mobile controls active');
    }

    this.add.text(16, 16, `Welcome, ${username}`, { fontSize: '20px', color: '#fff' }).setScrollFactor(0);
  }

  update(t, delta) {
    if (!/Mobi|Android/i.test(navigator.userAgent)) this.player.update(this.keys, delta);
  }
}
