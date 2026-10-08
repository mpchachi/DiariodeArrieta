import { supabase } from './supabaseClient.js';

// Foro de FixedGap (tablas forum_posts / forum_comments, migración 007).
// Todas las cuentas leen; cada uno solo edita o borra lo suyo (RLS).
const AUTHOR = 'author:operators!author_id(id, username, display_name)';

export async function listPosts({ limit = 50 } = {}) {
  const { data, error } = await supabase.from('forum_posts')
    .select(`id, title, body, comment_count, created_at, updated_at, author_id, ${AUTHOR}`)
    .order('created_at', { ascending: false }).limit(limit);
  return error ? { ok: false, error: error.message, posts: [] } : { ok: true, posts: data };
}

export async function createPost(title, body) {
  const { data, error } = await supabase.from('forum_posts')
    .insert({ title: title.trim(), body: body.trim() })
    .select(`id, title, body, comment_count, created_at, updated_at, author_id, ${AUTHOR}`).single();
  return error ? { ok: false, error: error.message } : { ok: true, post: data };
}

export async function deletePost(id) {
  const { error } = await supabase.from('forum_posts').delete().eq('id', id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function listComments(postId) {
  const { data, error } = await supabase.from('forum_comments')
    .select(`id, post_id, body, created_at, author_id, ${AUTHOR}`)
    .eq('post_id', postId).order('created_at', { ascending: true });
  return error ? { ok: false, error: error.message, comments: [] } : { ok: true, comments: data };
}

export async function addComment(postId, body) {
  const { data, error } = await supabase.from('forum_comments')
    .insert({ post_id: postId, body: body.trim() })
    .select(`id, post_id, body, created_at, author_id, ${AUTHOR}`).single();
  return error ? { ok: false, error: error.message } : { ok: true, comment: data };
}

export async function deleteComment(id) {
  const { error } = await supabase.from('forum_comments').delete().eq('id', id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

// Cambios en tiempo real (publicaciones o comentarios de cualquiera). Devuelve la función para cancelar.
export function subscribeForum(onChange) {
  const channel = supabase.channel(`forum-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'forum_posts' }, p => onChange('post', p))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'forum_comments' }, p => onChange('comment', p))
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}
