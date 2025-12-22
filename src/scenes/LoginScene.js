import { supabase } from '../supabase/SupabaseClient.js';

export default class LoginScene extends Phaser.Scene {
  constructor() { super('LoginScene'); }

  preload() {
    this.load.html('loginform', './src/scenes/loginform.html');
  }

  create() {
    // --- Hardened DOM container creation ---
    if (!this.game.domContainer) {
      console.warn('No DOM container detected. Creating one manually...');
      const container = document.createElement('div');
      container.classList.add('phaser-dom-container');
      container.style.position = 'absolute';
      container.style.left = '0';
      container.style.top = '0';
      container.style.pointerEvents = 'none';
      container.style.width = '100%';
      container.style.height = '100%';
      document.body.appendChild(container);
      this.game.domContainer = container;
    }

    this.add.text(640, 80, 'Rune Online', { fontSize: '48px', color: '#fff' }).setOrigin(0.5);
    this.add.text(640, 140, 'Enter a username to begin', { fontSize: '18px', color: '#aaa' }).setOrigin(0.5);

    const element = this.add.dom(640, 360).createFromCache('loginform');
    element.addListener('click');

    element.on('click', async event => {
      if (event.target.name === 'loginButton') {
        const username = element.getChildByName('username').value.trim();
        const password = element.getChildByName('password').value.trim();

        if (!username || !password) {
          alert('Enter a username and password');
          return;
        }

        const fakeEmail = `${username}@rune.local`;

        const { data: existingProfiles } = await supabase
          .from('rune.player_profiles')
          .select('username')
          .eq('username', username)
          .limit(1);

        let user;
        if (existingProfiles && existingProfiles.length > 0) {
          const { data, error } = await supabase.auth.signInWithPassword({
            email: fakeEmail,
            password
          });
          if (error) {
            alert('Incorrect password for that username.');
            return;
          }
          user = data.user;
        } else {
          const { data, error } = await supabase.auth.signUp({
            email: fakeEmail,
            password
          });
          if (error) {
            alert(error.message);
            return;
          }
          user = data.user;
          await supabase.from('rune.player_profiles').insert([{
            user_id: user.id,
            username
          }]);
        }

        this.scene.start('WorldScene');
      }
    });
  }
}
