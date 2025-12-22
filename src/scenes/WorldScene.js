import { supabase } from '../supabase/SupabaseClient.js';
import { getOrCreatePlayerState, updatePlayerPosition, subscribeToPlayerStates } from '../supabase/PlayerState.js';
import Player from '../player/Player.js';

export default class WorldScene extends Phaser.Scene {
  constructor() { super('WorldScene'); }

  async create() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      this.scene.start('LoginScene');
      return;
    }
    const world_id = 'demo-world';
    this.world_id = world_id;
    this.playerState = await getOrCreatePlayerState(user.id, world_id);
    const map = this.make.tilemap({ key: 'world' });
    const tileset = map.addTilesetImage('grass', 'grass');
    const ground = map.createLayer('Ground', [tileset], 0, 0);
    this.player = new Player(this, 400, 300, 'player');
    this.cameras.main.startFollow(this.player.sprite);
    this.cameras.main.setZoom(3.5);
    subscribeToPlayerStates(world_id, payload => {});
  }

  update() {
    if(this.player) this.player.update();
  }
}
