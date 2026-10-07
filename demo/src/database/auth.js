import { supabase } from './supabaseClient.js';

const FAKE_DOMAIN = '@fixedgap.local';

// Acepta «usuario» o el email completo («usuario@fixedgap.local»), sin espacios ni mayúsculas.
export function loginEmail(username) {
  const u = String(username ?? '').trim().toLowerCase();
  return u.includes('@') ? u : u + FAKE_DOMAIN;
}

export async function login(username, password) {
  const email = loginEmail(username);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: error.message };
  return { ok: true, user: data.user };
}

export async function logout() {
  await supabase.auth.signOut();
}

export async function getCurrentUser() {
  const { data } = await supabase.auth.getUser();
  return data?.user || null;
}

export async function getOperatorProfile() {
  const user = await getCurrentUser();
  if (!user) return null;
  const { data } = await supabase
    .from('operators')
    .select('*')
    .eq('id', user.id)
    .single();
  return data;
}

export function onAuthStateChange(callback) {
  return supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user || null);
  });
}
