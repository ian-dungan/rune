export default class Player extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, texture) {
    super(scene, x, y, texture);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setCollideWorldBounds(true);
    this.speed = 150;
    this.stepSound = scene.sound.add('step', { volume: 0.2 });
  }

  handleInput(keys) {
    let vx = 0, vy = 0;
    if (keys.W.isDown) vy = -this.speed;
    else if (keys.S.isDown) vy = this.speed;
    if (keys.A.isDown) vx = -this.speed;
    else if (keys.D.isDown) vx = this.speed;
    this.setVelocity(vx, vy);
    if (vx || vy) this.playStep();
  }

  playStep() {
    if (!this.stepSound.isPlaying) this.stepSound.play();
  }
}
