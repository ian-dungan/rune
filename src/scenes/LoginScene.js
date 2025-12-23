import { supabase } from '../supabase/SupabaseClient.js';

export default class LoginScene extends Phaser.Scene {
  constructor() { super('LoginScene'); }

  preload() {
    this.load.image('ui_parchment', 'assets/images/ui_parchment.png');
  }

  async create() {
    console.log('🧙 Creating login scene...');
    this.add.image(640, 360, 'ui_parchment').setAlpha(0.8);
    this.add.text(640, 180, 'Rune', {
      fontFamily: 'Georgia',
      fontSize: '72px',
      color: '#fff',
      stroke: '#000',
      strokeThickness: 6
    }).setOrigin(0.5);

    const input = document.createElement('input');
    Object.assign(input.style, {
      position: 'absolute',
      top: '60%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      padding: '12px',
      fontSize: '18px',
      borderRadius: '10px',
      border: '2px solid #333'
    });
    input.placeholder = 'Enter username';
    document.body.appendChild(input);

    const button = document.createElement('button');
    Object.assign(button.style, {
      position: 'absolute',
      top: '70%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      padding: '12px 30px',
      fontSize: '20px',
      borderRadius: '8px',
      cursor: 'pointer'
    });
    button.textContent = 'Enter World';
    document.body.appendChild(button);

    button.onclick = async () => {
      const username = input.value.trim();
      if (!username) return alert('Enter your name');

      const { data, error } = await supabase
        .from('rune.player_profiles_view')
        .select('username')
        .eq('username', username);

      if (error) return alert(error.message);

      if (data.length === 0)
        await supabase.from('rune.player_profiles_view').insert([{ username }]);

      input.remove();
      button.remove();
      this.scene.start('WorldScene', { username });
    };
  }
}
