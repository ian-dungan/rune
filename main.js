import WorldScene from './src/scenes/WorldScene.js';
const config = {
  type: Phaser.AUTO,
  width: 1280,
  height: 720,
  pixelArt: true,
  physics: { default: 'arcade', arcade: { debug: false } },
  scene: [WorldScene]
};
new Phaser.Game(config);