import { supabase } from '../supabase/SupabaseClient.js';

export default class LoginScene extends Phaser.Scene {
  constructor() {
    super('LoginScene');
  }

  preload() {
    this.load.image('ui_parchment', 'assets/images/ui_parchment.png');
  }

  create() {
    this.add.image(640, 360, 'ui_parchment').setAlpha(0.8);
    this.add.text(640, 200, 'Rune', { fontSize: '72px', color: '#fff', fontFamily: 'Georgia' }).setOrigin(0.5);

    const usernameInput = this.add.dom(640, 400, 'input', {
      width: '220px',
      padding: '10px',
      fontSize: '18px',
      borderRadius: '8px',
      textAlign: 'center'
    }, '').setOrigin(0.5);

    const loginButton = this.add.dom(640, 480, 'button', { padding: '10px 20px', fontSize: '18px' }, 'Enter World')
      .setOrigin(0.5)
      .addListener('click')
      .on('click', async () => {
        const username = usernameInput.node.value.trim();
        if (!username) return alert('Please enter a name.');

        const { data, error } = await supabase
          .from('rune.player_profiles')
          .select('username')
          .eq('username', username);

        if (error) return alert(error.message);

        if (data.length === 0)
          await supabase.from('rune.player_profiles').insert([{ username }]);

        this.scene.start('WorldScene', { username });
      });
  }
}
