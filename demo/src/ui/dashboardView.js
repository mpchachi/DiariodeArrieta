import gsap from 'gsap';
import { supabase } from '../database/supabaseClient.js';
import { listSubjects } from '../database/subjects.js';
import { getOperatorProfile, logout } from '../database/auth.js';
import { mountForum, esc } from './forumView.js';

const SEX = { male: 'Hombre', female: 'Mujer', other: 'Otro' };
const HAND = { right: 'mano derecha', left: 'mano izquierda', ambidextrous: 'ambidiestro' };
const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
function lastSession(iso) {
  if (!iso) return 'Sin sesiones todavía';
  const days = Math.round((Date.now() - new Date(iso).getTime()) / 86400000);
  return `Última sesión ${days < 1 ? 'hoy' : rtf.format(-days, 'day')}`;
}

// Pantalla principal del operador: pestañas «Pacientes» (menú de tarjetas) y «Foro».
// Firma compatible con main.js (onSelectPinch / onSelectSubject se mantienen por compatibilidad).
export async function showDashboard(container, onSelectSubject, onCreateSubject, onLogout, onSelectPinch = null, onPlay = null) {
  container.innerHTML = `<div class="dash-loading"><div class="spinner-inner"><div class="spinner-bar"></div></div></div>`;

  const [operator, subjects, { data: { user } }] = await Promise.all([getOperatorProfile(), listSubjects(), supabase.auth.getUser()]);
  const ids = subjects.map(s => s.id);
  const { data: sessions } = ids.length
    ? await supabase.from('sessions').select('subject_id, started_at').in('subject_id', ids).order('started_at', { ascending: false })
    : { data: [] };
  const last = new Map(), count = new Map();
  for (const s of sessions || []) { if (!last.has(s.subject_id)) last.set(s.subject_id, s.started_at); count.set(s.subject_id, (count.get(s.subject_id) || 0) + 1); }

  const name = operator?.display_name || operator?.username || 'Operador';
  const base = import.meta.env.BASE_URL;
  const year = new Date().getFullYear();
  const play = onPlay || onSelectPinch || onSelectSubject;

  const tiles = subjects.map(s => {
    const n = count.get(s.id) || 0;
    return `
      <article class="pt-card" data-id="${s.id}">
        <div class="pt-top">
          <div class="pt-avatar" aria-hidden="true">${esc(s.display_name.charAt(0).toUpperCase())}</div>
          <div class="pt-who">
            <h3>${esc(s.display_name)}</h3>
            <p>${SEX[s.sex] || 'Otro'} · ${year - s.birth_year} años · ${HAND[s.dominant_hand] || ''}</p>
          </div>
        </div>
        <dl class="pt-facts">
          <div><dt>Sesiones</dt><dd>${n}</dd></div>
          <div><dt>Actividad</dt><dd>${lastSession(last.get(s.id))}</dd></div>
        </dl>
        <div class="pt-actions">
          <button type="button" class="op-btn op-btn-primary" data-action="play">Jugar</button>
          <a class="op-btn op-btn-ghost" href="${base}dashboard/patient/${encodeURIComponent(s.id)}">Ver ficha</a>
        </div>
      </article>`;
  }).join('');

  container.innerHTML = `
    <div class="op-screen">
      <header class="op-bar">
        <div class="op-brand"><img src="${base}dashboard/logo.png" alt="" /><span>FixedGap</span></div>
        <nav class="op-tabs" aria-label="Secciones">
          <button type="button" class="op-tab" data-tab="pacientes">Pacientes</button>
          <button type="button" class="op-tab" data-tab="foro">Foro</button>
          <a class="op-tab" href="${base}dashboard/">Dashboard clínico</a>
        </nav>
        <div class="op-user">
          <span>${esc(name)}</span>
          <button id="logout-btn" type="button" class="op-btn op-btn-ghost">Cerrar sesión</button>
        </div>
      </header>
      <main class="op-main">
        <section class="op-section" data-panel="pacientes">
          <header class="op-head">
            <div>
              <h1>Pacientes</h1>
              <p>Elige un paciente para empezar el viaje del zorro.</p>
            </div>
          </header>
          <div class="pt-grid">
            <button type="button" class="pt-card pt-new" id="new-subject-btn">
              <span class="pt-new-plus" aria-hidden="true">+</span>
              <span class="pt-new-label">Nuevo paciente</span>
              <span class="pt-new-hint">Nombre o pseudónimo, año de nacimiento y mano dominante.</span>
            </button>
            ${tiles}
          </div>
        </section>
        <div data-panel="foro" hidden></div>
      </main>
    </div>`;

  const screen = container.querySelector('.op-screen');
  gsap.fromTo(screen, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' });

  let unmountForum = null;
  const show = tab => {
    container.querySelectorAll('.op-tab[data-tab]').forEach(b => b.classList.toggle('is-active', b.dataset.tab === tab));
    container.querySelector('[data-panel="pacientes"]').hidden = tab !== 'pacientes';
    const forumEl = container.querySelector('[data-panel="foro"]');
    forumEl.hidden = tab !== 'foro';
    if (tab === 'foro' && !unmountForum) unmountForum = mountForum(forumEl, { me: user?.id });
    history.replaceState(null, '', tab === 'foro' ? '#foro' : location.pathname + location.search);
  };
  container.querySelectorAll('.op-tab[data-tab]').forEach(b => b.addEventListener('click', () => show(b.dataset.tab)));
  show(location.hash === '#foro' ? 'foro' : 'pacientes');

  const leave = fn => { unmountForum?.(); gsap.to(screen, { opacity: 0, duration: 0.25, onComplete: fn }); };
  document.getElementById('logout-btn').addEventListener('click', async () => { await logout(); leave(onLogout); });
  document.getElementById('new-subject-btn').addEventListener('click', () => leave(onCreateSubject));
  container.querySelectorAll('.pt-card[data-id] [data-action="play"]').forEach(btn => {
    btn.addEventListener('click', () => { const id = btn.closest('.pt-card').dataset.id; leave(() => play(id)); });
  });
}
