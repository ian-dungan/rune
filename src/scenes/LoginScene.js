import * as Phaser from '../lib/phaser.esm.js';
import { supabaseReady } from '../supabase/SupabaseClient.js';

export default class LoginScene extends Phaser.Scene {
  constructor() {
    super('LoginScene');
  }

  preload() {
    this.load.image('ui_parchment', 'assets/images/ui_parchment.png');
    this.load.html('loginform', 'src/scenes/loginform.html');
  }

  async create() {
    console.log('🧙 Creating login scene...');

    // Ensure Supabase client is initialized (but don't crash if credentials missing)
    const supabase = await supabaseReady;

    this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x0b1020).setOrigin(0, 0);

    const bg = this.add.image(this.scale.width / 2, this.scale.height / 2, 'ui_parchment');
    bg.setScale(Math.min(this.scale.width / bg.width, this.scale.height / bg.height) * 0.9);

    const title = this.add.text(this.scale.width / 2, 110, 'Rune', {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: '48px',
      color: '#1b2238'
    }).setOrigin(0.5, 0.5);

    const help = this.add.text(this.scale.width / 2, 165, 'Log in with your adventurer name', {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: '16px',
      color: '#2b3558'
    }).setOrigin(0.5, 0.5);

    const element = this.add.dom(this.scale.width / 2, this.scale.height / 2 + 30).createFromCache('loginform');

    const usernameInput = element.getChildByName('username');
    const submitBtn = element.getChildByID('loginBtn');

    submitBtn.addEventListener('click', async (e) => {
      e.preventDefault();

      const username = (usernameInput?.value || '').trim();
      if (!username) {
        alert('Enter a name.');
        return;
      }

      // Normalize username for lookup
      const username_norm = username.toLowerCase();

      try {
        const { data: existing, error } = await supabase
          .from('rune_player_profiles')
          .select('username')
          .eq('username_norm', username_norm)
          .maybeSingle();

        if (error) {
          console.error('Error checking username:', error);
          alert('Database connection error. Check console.');
          return;
        }

        if (existing) {
          console.log('✅ Username exists, logging in...');
          element.destroy();
          this.scene.start('WorldScene', { username, username_norm });
        } else {
          alert('No such adventurer found. Please register in Supabase first.');
        }
      } catch (err) {
        console.error('Unexpected login error:', err);
        alert('Login error. Check console.');
      }
    });
  }
}
