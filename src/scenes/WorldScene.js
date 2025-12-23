import Player from '../player/Player.js';
export default class WorldScene extends Phaser.Scene{
constructor(){super('WorldScene');}
preload(){
this.load.tilemapTiledJSON('world','assets/maps/world.json');
this.load.tilemapTiledJSON('world_art','assets/maps/world_art.json');
this.load.image('world_art','assets/maps/world_art.png');
this.load.spritesheet('player','assets/sprites/player.png',{frameWidth:32,frameHeight:48});
['plains','forest','desert','snow','swamp','castle'].forEach(m=>this.load.audio(m,`assets/music/${m}_theme.mp3`));
}
create(){
this.add.text(100,100,'Welcome to Runeworld Prime',{fontSize:'32px',fill:'#fff'});
this.player=new Player(this,400,300,'player');
}
update(){this.player.update();}}