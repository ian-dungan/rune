import * as Phaser from '../lib/phaser.esm.js';

export default class WorldScene extends Phaser.Scene {
  constructor() {
    super('WorldScene');
  }

  preload() {
    this.load.image('ground', 'assets/images/ui_parchment.png'); // placeholder
  }

  create(data) {
    console.log('🌍 Entering Rune world as', data.username);
    this.add.text(50, 50, `Welcome, ${data.username}!`, {
      font: '24px serif',
      color: '#fff'
    });

    const ground = this.add.image(this.scale.width / 2, this.scale.height / 2, 'ground');
    ground.setDisplaySize(this.scale.width, this.scale.height);
  }
}
