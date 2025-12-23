export default class Player {
  constructor(scene, x, y) {
    this.scene = scene;
    this.sprite = scene.physics.add.sprite(x, y, 'IDLE', 0);
    this.cursors = scene.input.keyboard.createCursorKeys();
    this.speed = 200;

    // Animation creation
    const anims = ['idle','walk','run','jump','attack1','attack2','attack3','defend','hurt','death'];
    anims.forEach(a => {
      scene.anims.create({
        key: a,
        frames: scene.anims.generateFrameNumbers(a.toUpperCase(), { start: 0, end: 7 }),
        frameRate: 10,
        repeat: ['idle','walk','run'].includes(a) ? -1 : 0
      });
    });
  }

  update() {
    const { cursors, sprite, speed } = this;
    sprite.body.setVelocity(0);

    if (cursors.left.isDown) sprite.body.setVelocityX(-speed);
    else if (cursors.right.isDown) sprite.body.setVelocityX(speed);
    if (cursors.up.isDown) sprite.body.setVelocityY(-speed);
    else if (cursors.down.isDown) sprite.body.setVelocityY(speed);

    if (sprite.body.velocity.length() > 0) sprite.anims.play('run', true);
    else sprite.anims.play('idle', true);
  }
}