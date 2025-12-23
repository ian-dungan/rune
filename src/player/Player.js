export default class Player{
constructor(scene,x,y,texture){this.scene=scene;
this.sprite=scene.physics.add.sprite(x,y,texture,0);
this.cursors=scene.input.keyboard.createCursorKeys();
this.speed=200;}
update(){
const s=this.sprite,c=this.cursors,v=this.speed;
s.body.setVelocity(0);
if(c.left.isDown)s.body.setVelocityX(-v);
else if(c.right.isDown)s.body.setVelocityX(v);
if(c.up.isDown)s.body.setVelocityY(-v);
else if(c.down.isDown)s.body.setVelocityY(v);
s.body.velocity.normalize().scale(v);}}