export default class MobileControls {
  constructor(scene, player) {
    this.scene = scene;
    this.player = player;
    this.createJoystick();
  }

  createJoystick() {
    const base = this.scene.add.circle(120, 600, 60, 0x000000, 0.25).setScrollFactor(0);
    const stick = this.scene.add.circle(120, 600, 30, 0xffffff, 0.5).setScrollFactor(0);

    let dragging = false;
    this.scene.input.on('pointerdown', (p) => {
      if (Phaser.Math.Distance.Between(p.x, p.y, base.x, base.y) < 80) dragging = true;
    });
    this.scene.input.on('pointerup', () => {
      dragging = false;
      stick.setPosition(base.x, base.y);
      this.player.setVelocity(0, 0);
    });
    this.scene.input.on('pointermove', (p) => {
      if (!dragging) return;
      const dx = p.x - base.x, dy = p.y - base.y;
      const dist = Phaser.Math.Clamp(Math.sqrt(dx * dx + dy * dy), 0, 60);
      const angle = Math.atan2(dy, dx);
      stick.setPosition(base.x + Math.cos(angle) * dist, base.y + Math.sin(angle) * dist);
      this.player.setVelocity(Math.cos(angle) * this.player.speed, Math.sin(angle) * this.player.speed);
    });
  }
}
