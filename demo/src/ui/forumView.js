// Foro tipo Reddit: un canal común para todas las cuentas (médicos y equipo FixedGap).
// Publicaciones con título y texto, comentarios por publicación y tiempo real.
import { listPosts, createPost, deletePost, listComments, addComment, deleteComment, subscribeForum } from '../database/forum.js';

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
function ago(iso) {
  const s = (new Date(iso).getTime() - Date.now()) / 1000;
  const units = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];
  for (const [u, n] of units) if (Math.abs(s) >= n) return rtf.format(Math.round(s / n), u);
  return 'ahora';
}
const authorName = a => esc(a?.display_name || a?.username || 'Usuario');
const initials = a => esc((a?.display_name || a?.username || '?').replace(/^dr\.?\s*/i, '').trim().charAt(0).toUpperCase());
const paragraphs = t => esc(t).split(/\n{2,}/).map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');

export function mountForum(root, { me }) {
  let posts = [], openId = null, disposed = false, refreshTimer = null;
  const comments = new Map();

  root.innerHTML = `
    <section class="op-section forum">
      <header class="op-head">
        <div>
          <h1>Foro</h1>
          <p>Canal común de todo el equipo: dudas, avisos y sugerencias. Lo ven todas las cuentas.</p>
        </div>
      </header>
      <form class="forum-composer" data-role="composer" novalidate>
        <input name="title" maxlength="200" placeholder="Publica algo para todo el equipo…" autocomplete="off" />
        <div class="forum-composer-more">
          <textarea name="body" rows="4" maxlength="10000" placeholder="Detalles (opcional)"></textarea>
          <div class="forum-composer-actions">
            <span class="forum-error" data-role="post-error" role="alert"></span>
            <button type="button" class="op-btn op-btn-ghost" data-action="cancel">Cancelar</button>
            <button type="submit" class="op-btn op-btn-primary">Publicar</button>
          </div>
        </div>
      </form>
      <div class="forum-feed" data-role="feed"><p class="op-muted">Cargando publicaciones…</p></div>
    </section>`;

  const feed = root.querySelector('[data-role="feed"]');
  const composer = root.querySelector('[data-role="composer"]');
  const postError = root.querySelector('[data-role="post-error"]');

  const openComposer = open => composer.classList.toggle('is-open', open);
  composer.title.addEventListener('focus', () => openComposer(true));
  composer.querySelector('[data-action="cancel"]').addEventListener('click', () => { composer.reset(); postError.textContent = ''; openComposer(false); });
  composer.addEventListener('submit', async e => {
    e.preventDefault();
    const title = composer.title.value.trim(), body = composer.body.value.trim();
    if (!title) { postError.textContent = 'Escribe un título.'; composer.title.focus(); return; }
    const btn = composer.querySelector('[type="submit"]'); btn.disabled = true; postError.textContent = '';
    const res = await createPost(title, body);
    btn.disabled = false;
    if (!res.ok) { postError.textContent = 'No se ha podido publicar. Inténtalo de nuevo.'; return; }
    composer.reset(); openComposer(false);
    posts = [res.post, ...posts.filter(p => p.id !== res.post.id)];
    render();
  });

  function postHtml(p) {
    const open = p.id === openId, mine = p.author_id === me;
    const list = comments.get(p.id);
    return `
      <article class="forum-post${open ? ' is-open' : ''}" data-id="${p.id}">
        <div class="forum-avatar" aria-hidden="true">${initials(p.author)}</div>
        <div class="forum-post-main">
          <p class="forum-meta"><strong>${authorName(p.author)}</strong> · <time datetime="${p.created_at}">${ago(p.created_at)}</time></p>
          <h2 class="forum-title"><button type="button" data-action="toggle">${esc(p.title)}</button></h2>
          ${p.body ? `<div class="forum-body${open ? '' : ' is-clamped'}">${paragraphs(p.body)}</div>` : ''}
          <div class="forum-actions">
            <button type="button" class="forum-link" data-action="toggle">${p.comment_count === 1 ? '1 comentario' : `${p.comment_count} comentarios`}</button>
            ${mine ? '<button type="button" class="forum-link forum-danger" data-action="delete-post">Borrar</button>' : ''}
          </div>
          ${open ? `
            <div class="forum-comments">
              ${!list ? '<p class="op-muted">Cargando comentarios…</p>' : list.length ? list.map(c => `
                <div class="forum-comment" data-cid="${c.id}">
                  <div class="forum-avatar is-small" aria-hidden="true">${initials(c.author)}</div>
                  <div>
                    <p class="forum-meta"><strong>${authorName(c.author)}</strong> · <time datetime="${c.created_at}">${ago(c.created_at)}</time>
                      ${c.author_id === me ? ' · <button type="button" class="forum-link forum-danger" data-action="delete-comment">Borrar</button>' : ''}</p>
                    <div class="forum-body">${paragraphs(c.body)}</div>
                  </div>
                </div>`).join('') : '<p class="op-muted">Aún no hay comentarios.</p>'}
              <form class="forum-reply" data-role="reply" novalidate>
                <textarea name="body" rows="2" maxlength="5000" placeholder="Escribe un comentario…"></textarea>
                <button type="submit" class="op-btn op-btn-primary">Comentar</button>
              </form>
            </div>` : ''}
        </div>
      </article>`;
  }

  function render() {
    if (disposed) return;
    const focusedReply = root.querySelector('[data-role="reply"] textarea');
    const draft = focusedReply?.value ?? '';
    const hadFocus = document.activeElement === focusedReply;
    feed.innerHTML = posts.length ? posts.map(postHtml).join('')
      : '<div class="op-empty"><p>Todavía no hay publicaciones.</p><p class="op-muted">Sé el primero en escribir algo para el equipo.</p></div>';
    const reply = root.querySelector('[data-role="reply"] textarea');
    if (reply) { reply.value = draft; if (hadFocus) reply.focus(); }
  }

  async function loadPosts() {
    const res = await listPosts();
    if (disposed) return;
    if (!res.ok) { feed.innerHTML = '<p class="forum-error">No se ha podido cargar el foro.</p>'; return; }
    posts = res.posts; render();
  }
  async function loadComments(id) {
    const res = await listComments(id);
    if (disposed) return;
    comments.set(id, res.ok ? res.comments : []); render();
  }

  feed.addEventListener('click', async e => {
    const btn = e.target.closest('[data-action]'); if (!btn) return;
    const id = btn.closest('.forum-post')?.dataset.id;
    if (btn.dataset.action === 'toggle') {
      openId = openId === id ? null : id; render();
      if (openId) loadComments(openId);
    } else if (btn.dataset.action === 'delete-post') {
      if (!confirm('¿Borrar esta publicación y sus comentarios?')) return;
      const res = await deletePost(id);
      if (res.ok) { posts = posts.filter(p => p.id !== id); if (openId === id) openId = null; render(); }
    } else if (btn.dataset.action === 'delete-comment') {
      if (!confirm('¿Borrar este comentario?')) return;
      const cid = btn.closest('.forum-comment').dataset.cid;
      const res = await deleteComment(cid);
      if (res.ok) {
        comments.set(id, (comments.get(id) || []).filter(c => c.id !== cid));
        const p = posts.find(x => x.id === id); if (p) p.comment_count = Math.max(0, p.comment_count - 1);
        render();
      }
    }
  });
  feed.addEventListener('submit', async e => {
    const form = e.target.closest('[data-role="reply"]'); if (!form) return;
    e.preventDefault();
    const id = form.closest('.forum-post').dataset.id, body = form.body.value.trim();
    if (!body) { form.body.focus(); return; }
    const btn = form.querySelector('[type="submit"]'); btn.disabled = true;
    const res = await addComment(id, body);
    btn.disabled = false;
    if (!res.ok) { alert('No se ha podido comentar. Inténtalo de nuevo.'); return; }
    form.body.value = '';
    comments.set(id, [...(comments.get(id) || []).filter(c => c.id !== res.comment.id), res.comment]);
    const p = posts.find(x => x.id === id); if (p) p.comment_count += 1;
    render();
  });

  // Tiempo real: lo que publiquen otros aparece solo (se agrupan ráfagas de cambios).
  const unsubscribe = subscribeForum((kind, payload) => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(async () => {
      await loadPosts();
      const pid = payload.new?.post_id ?? payload.old?.post_id;
      if (kind === 'comment' && openId && (!pid || pid === openId)) loadComments(openId);
    }, 400);
  });
  const tick = setInterval(() => { if (!composer.matches(':focus-within') && !root.querySelector('[data-role="reply"]:focus-within')) render(); }, 60000);

  loadPosts();
  return () => { disposed = true; unsubscribe(); clearTimeout(refreshTimer); clearInterval(tick); };
}
