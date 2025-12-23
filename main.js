import * as Phaser from './src/lib/phaser.esm.js';
import LoginScene from './src/scenes/LoginScene.js';
import WorldScene from './src/scenes/WorldScene.js';

const config = {
  type: Phaser.AUTO,
  parent: 'game',
  width: 1280,
  height: 720,
  backgroundColor: '#0b1020',
  pixelArt: true,
  physics: {
    default: 'arcade',
    arcade: { debug: false }
  },
  scene: [LoginScene, WorldScene]
};

new Phaser.Game(config);
