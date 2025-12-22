# Rune (ALTTP) — Phaser Edition

This repo is meant for GitHub Pages.

## Files
- `index.html` loads Phaser + your game modules.
- `meta.json` (root) controls seed, camera, world size.
- `tilesets.json` (root) registers tileset images.

## Supabase
Username auth is implemented by synthesizing an email: `username@rune.local`.

Required tables in schema `rune`:
- `player_profiles` with unique `username` and `user_id`
- `chat_messages` with `user_id`, `message`, timestamps

## Run
Just open via GitHub Pages or any static server.
