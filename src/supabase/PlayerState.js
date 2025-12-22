import { supabase } from './SupabaseClient.js';
export async function getOrCreatePlayerState(user_id, world_id){return {pos_x:2000,pos_y:2000,pos_z:0};}
export async function updatePlayerPosition(user_id, world_id, pos_x, pos_y){}
export function subscribeToPlayerStates(world_id, callback){}
