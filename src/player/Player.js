export default class Player {
  constructor(scene, x, y, texture) {
    this.scene = scene;
    this.sprite = scene.physics.add.sprite(x, y, texture, 0);
    this.sprite.setCollideWorldBounds(true);
    this.cursors = scene.input.keyboard.createCursorKeys();
    this.speed = 200;
    this.id = crypto.randomUUID();
  }
  update() {
    const { cursors, sprite, speed } = this;
    sprite.body.setVelocity(0);
    if (cursors.left.isDown) sprite.body.setVelocityX(-speed);
    else if (cursors.right.isDown) sprite.body.setVelocityX(speed);
    if (cursors.up.isDown) sprite.body.setVelocityY(-speed);
    else if (cursors.down.isDown) sprite.body.setVelocityY(speed);
    sprite.body.velocity.normalize().scale(speed);
  }
}
