export default class Player extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, texture) {
    super(scene, x, y, texture);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setCollideWorldBounds(true);
    this.speed = 160;
    this.lastStep = 0;
    this.stepSound = scene.sound.add('step', { volume: 0.2 });
  }

  update(keys, delta) {
    let vx = 0, vy = 0;
    if (keys.W.isDown) vy = -this.speed;
    else if (keys.S.isDown) vy = this.speed;
    if (keys.A.isDown) vx = -this.speed;
    else if (keys.D.isDown) vx = this.speed;
    this.setVelocity(vx, vy);

    if (vx || vy) {
      if (delta - this.lastStep > 400) {
        this.stepSound.play();
        this.lastStep = delta;
      }
    }
  }
}
