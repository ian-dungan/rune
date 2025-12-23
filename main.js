import LoginScene from './src/scenes/LoginScene.js';
import WorldScene from './src/scenes/WorldScene.js';

const config = {
  type: Phaser.AUTO,
  width: 1280,
  height: 720,
  pixelArt: true,
  backgroundColor: '#1e1e1e',
  dom: { createContainer: true },
  physics: { default: 'arcade', arcade: { gravity: { y: 0 } } },
  scene: [LoginScene, WorldScene]
};

new Phaser.Game(config);
