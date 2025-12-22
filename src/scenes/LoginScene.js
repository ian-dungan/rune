import { supabase } from '../supabase/SupabaseClient.js';

export default class LoginScene extends Phaser.Scene {
  constructor() { super('LoginScene'); }

  preload() {
    this.load.html('loginform', 'src/scenes/loginform.html');
  }

  create() {
    this.add.text(640, 80, 'Rune Online', { fontSize: '48px', color: '#fff' }).setOrigin(0.5);
    this.add.text(640, 140, 'Sign in to begin your adventure', { fontSize: '18px', color: '#aaa' }).setOrigin(0.5);
    const element = this.add.dom(640, 360).createFromCache('loginform');
    element.addListener('click');
    element.on('click', async event => {
      if (event.target.name === 'loginButton') {
        const email = element.getChildByName('email').value;
        const password = element.getChildByName('password').value;
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error && error.message.includes('Invalid login credentials')) {
          const { error: signUpError } = await supabase.auth.signUp({ email, password });
          if (signUpError) {
            alert(signUpError.message);
            return;
          }
        } else if (error) {
          alert(error.message);
          return;
        }
        this.scene.start('WorldScene');
      }
    });
  }
}
