import { supabase } from '../supabase/SupabaseClient.js';

export default class LoginScene extends Phaser.Scene {
  constructor() { super('LoginScene'); }

  preload() {
    this.load.html('loginform', 'src/scenes/loginform.html');
  }

  create() {
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

        // generate fake email
        const fakeEmail = `${username}@rune.local`;

        // Check for duplicate username
        const { data: existingProfiles } = await supabase
          .from('rune.player_profiles')
          .select('username')
          .eq('username', username)
          .limit(1);

        let user;
        if (existingProfiles && existingProfiles.length > 0) {
          // Try login with existing synthetic email
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
          // Sign up new user
          const { data, error } = await supabase.auth.signUp({
            email: fakeEmail,
            password
          });
          if (error) {
            alert(error.message);
            return;
          }
          user = data.user;

          // Create profile entry
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
