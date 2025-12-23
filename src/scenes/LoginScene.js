// LoginScene.js
import Phaser from '../lib/phaser.js';
import { supabase } from '../supabase/SupabaseClient.js';

export default class LoginScene extends Phaser.Scene {
  constructor() {
    super('LoginScene');
  }

  preload() {
    this.load.image('ui_parchment', 'assets/images/ui_parchment.png');
  }

  async create() {
    console.log('🧙 Creating login scene...');

    const bg = this.add.image(this.scale.width / 2, this.scale.height / 2, 'ui_parchment');
    bg.setDisplaySize(this.scale.width, this.scale.height);

    let container = document.querySelector('#game-login');
    if (!container) {
      container = document.createElement('div');
      container.id = 'game-login';
      container.style.position = 'absolute';
      container.style.top = '50%';
      container.style.left = '50%';
      container.style.transform = 'translate(-50%, -50%)';
      container.style.textAlign = 'center';
      container.style.background = 'rgba(0,0,0,0.4)';
      container.style.padding = '20px';
      container.style.borderRadius = '12px';
      container.style.fontFamily = 'serif';
      document.body.appendChild(container);
    }

    container.innerHTML = `
      <h2 style="color: #fff;">Enter Your Username</h2>
      <input id="username" type="text" placeholder="Adventurer123"
             style="padding:10px; border-radius:6px; width:200px;"/>
      <br><br>
      <button id="loginBtn" 
              style="padding:10px 20px; border-radius:8px; cursor:pointer;">Login</button>
    `;

    document.getElementById('loginBtn').addEventListener('click', async () => {
      const username = document.getElementById('username').value.trim().toLowerCase();
      if (!username) return alert('Enter a username!');

      console.log(`Attempting login as: ${username}`);

      const { data: existing, error } = await supabase
        .from('rune.player_profiles')
        .select('username')
        .eq('username_norm', username)
        .maybeSingle();

      if (error) {
        console.error('Error checking username:', error);
        alert('Connection error. Check console.');
        return;
      }

      if (existing) {
        console.log('✅ Username exists, logging in...');
        this.scene.start('WorldScene', { username });
      } else {
        alert('No such adventurer found. Please register in Supabase first.');
      }
    });
  }
}

