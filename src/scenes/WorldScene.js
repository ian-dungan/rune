import { supabase } from "../supabase/SupabaseClient.js";
import Player from "../player/Player.js";

export default class WorldScene extends Phaser.Scene {
  constructor() { super("WorldScene"); }
  preload() {
    ["grass","forest","desert","mountains","snow","town"].forEach(ts =>
      this.load.image(ts, `assets/tilesets/${ts}.png`)
    );
    this.load.tilemapTiledJSON("world","assets/maps/world.json");
    this.load.tilemapTiledJSON("world_art","assets/maps/world_art.json");
    this.load.image("world_art","assets/maps/world_art.png");
    this.load.spritesheet("player","assets/sprites/player.png",{frameWidth:32,frameHeight:48});
    ["plains","forest","desert","snow","swamp","castle"].forEach(m =>
      this.load.audio(m,`assets/music/${m}_theme.mp3`)
    );
  }
  async create() {
    const useArtMap = true;
    const mapKey = useArtMap ? "world_art" : "world";
    const map = this.make.tilemap({ key: mapKey });
    if(mapKey==="world_art"){
      const artLayer = map.createLayer("ArtLayer", [], 0, 0);
      this.physics.world.setBounds(0,0,artLayer.width,artLayer.height);
    } else {
      const tilesets = ["grass","forest","desert","mountains","snow","town"].map(ts => map.addTilesetImage(ts));
      map.createLayer("Ground", tilesets, 0, 0);
      map.createLayer("Structures", tilesets, 0, 0);
    }
    const collisionLayer = map.getObjectLayer("Collision");
    this.blockers = this.physics.add.staticGroup();
    if(collisionLayer) collisionLayer.objects.forEach(obj => {
      const block=this.blockers.create(obj.x+obj.width/2,obj.y-obj.height/2);
      block.setSize(obj.width,obj.height).setVisible(false);
    });
    this.player=new Player(this,8000,8000,"player");
    this.physics.add.collider(this.player.sprite,this.blockers);
    this.cameras.main.startFollow(this.player.sprite,true,0.08,0.08);
    this.cameras.main.setZoom(3.5);
    this.otherPlayers={};
    this.channel=supabase.channel("rpg_world",{config:{presence:{key:this.player.id}}});
    await this.channel.subscribe();
    this.channel.track({id:this.player.id,x:this.player.sprite.x,y:this.player.sprite.y});
    this.channel.on("presence",{event:"sync"},()=>this.syncPlayers());
  }
  update(){
    if(!this.player)return;
    this.player.update();
    this.channel.track({id:this.player.id,x:this.player.sprite.x,y:this.player.sprite.y});
  }
  syncPlayers(){
    const state=this.channel.presenceState();
    for(const[id,[p]]of Object.entries(state)){
      if(id===this.player.id)continue;
      if(!this.otherPlayers[id]){
        const other=this.add.sprite(p.x,p.y,"player");
        this.otherPlayers[id]=other;
      } else {
        this.otherPlayers[id].setPosition(p.x,p.y);
      }
    }
  }
}
