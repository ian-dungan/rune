export default class Player {
  constructor(scene, x, y) {
    this.scene = scene;
    this.sprite = scene.physics.add.sprite(x, y, 'IDLE', 0);
    this.cursors = scene.input.keyboard.createCursorKeys();
    this.keys = scene.input.keyboard.addKeys('W,A,S,D,SHIFT');
    this.speed = 180;
    this.runSpeed = 260;

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
    const { cursors, sprite } = this;
    const k = this.keys;
    const speed = (k?.SHIFT?.isDown) ? this.runSpeed : this.speed;

    let vx = 0;
    let vy = 0;

    const left  = cursors.left.isDown  || k.A.isDown;
    const right = cursors.right.isDown || k.D.isDown;
    const up    = cursors.up.isDown    || k.W.isDown;
    const down  = cursors.down.isDown  || k.S.isDown;

    if (left)  vx -= 1;
    if (right) vx += 1;
    if (up)    vy -= 1;
    if (down)  vy += 1;

    // normalize diagonal
    if (vx !== 0 || vy !== 0) {
        const len = Math.hypot(vx, vy);
        vx = (vx / len) * speed;
        vy = (vy / len) * speed;
    }

    sprite.body.setVelocity(vx, vy);

    if (vx !== 0 || vy !== 0) {
      sprite.anims.play(k?.SHIFT?.isDown ? 'run' : 'walk', true);
    } else {
      // Hard-idle: stop animation so the character isn't constantly moving at rest
      sprite.anims.stop();
      sprite.setTexture('IDLE', 0);
    }
}
}
