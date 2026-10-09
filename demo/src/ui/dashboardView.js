import gsap from 'gsap';
import { supabase } from '../database/supabaseClient.js';
import { listSubjects } from '../database/subjects.js';
import { getOperatorProfile } from '../database/auth.js';
import { mountForum, esc } from './forumView.js';
import { mountShell, ICON } from './shell.js';

const SEX = { male: 'Hombre', female: 'Mujer', other: 'Otro' };
const HAND = { right: 'mano derecha', left: 'mano izquierda', ambidextrous: 'ambidiestro' };
const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
function lastSession(iso) {
  if (!iso) return 'Sin sesiones todavía';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return `Última sesión ${days < 1 ? 'hoy' : rtf.format(-days, 'day')}`;
}
const initials = name => esc(String(name).trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?');

// Pantalla principal del operador (estructura de shadcn-admin): barra lateral con
// Pacientes / Foro / Dashboard clínico y, en Pacientes, un menú de tarjetas con buscador,
// filtro por tipo y orden. Firma compatible con main.js.
export async function showDashboard(container, onSelectSubject, onCreateSubject, onLogout, onSelectPinch = null, onPlay = null) {
  container.innerHTML = `<div class="dash-loading"><div class="spinner-inner"><div class="spinner-bar"></div></div></div>`;

  const [operator, subjects, { data: { user } }] = await Promise.all([getOperatorProfile(), listSubjects(), supabase.auth.getUser()]);
  const ids = subjects.map(s => s.id);
  const { data: sessions } = ids.length
    ? await supabase.from('sessions').select('subject_id, started_at').in('subject_id', ids).order('started_at', { ascending: false })
    : { data: [] };
  const last = new Map(), count = new Map();
  for (const s of sessions || []) { if (!last.has(s.subject_id)) last.set(s.subject_id, s.started_at); count.set(s.subject_id, (count.get(s.subject_id) || 0) + 1); }

  const base = import.meta.env.BASE_URL;
  const year = new Date().getFullYear();
  const play = onPlay || onSelectPinch || onSelectSubject;
  let unmountForum = null, shell = null;

  const leave = fn => { unmountForum?.(); unmountForum = null; gsap.to(shell.root, { opacity: 0, duration: 0.2, onComplete: () => { shell.dispose(); fn(); } }); };

  shell = mountShell(container, {
    active: location.hash === '#foro' ? 'foro' : 'pacientes', crumbs: ['Plataforma', 'Pacientes'], operator,
    onNavigate: tab => show(tab), onLogout: () => { unmountForum?.(); shell.dispose(); onLogout(); },
  });
  gsap.fromTo(shell.root, { opacity: 0 }, { opacity: 1, duration: 0.25, ease: 'power1.out' });

  shell.main.innerHTML = `
    <section class="ui-page" data-panel="pacientes">
      <div class="ui-page-head">
        <div>
          <h1>Pacientes</h1>
          <p>Elige un paciente para empezar el viaje del zorro o consulta su ficha.</p>
        </div>
        <button type="button" class="ui-btn ui-btn-primary" id="new-subject-btn">${ICON.plus}Nuevo paciente</button>
      </div>
      ${subjects.length ? `
      <div class="ui-toolbar">
        <div class="ui-toolbar-left">
          <label class="ui-input-icon">
            <span class="sr-only">Buscar paciente</span>${ICON.search}
            <input type="search" class="ui-input" data-role="q" placeholder="Buscar paciente…" autocomplete="off" />
          </label>
          <label><span class="sr-only">Tipo</span>
            <select class="ui-select" data-role="type">
              <option value="all">Todos</option><option value="patient">Pacientes</option><option value="healthy">Voluntarios sanos</option>
            </select>
          </label>
        </div>
        <label class="ui-select-icon"><span class="sr-only">Ordenar</span>${ICON.sort}
          <select class="ui-select" data-role="sort">
            <option value="recent">Actividad reciente</option><option value="name">Nombre (A–Z)</option><option value="created">Alta más reciente</option>
          </select>
        </label>
      </div>
      <div class="ui-sep"></div>` : ''}
      <ul class="pt-grid" data-role="grid"></ul>
    </section>
    <div data-panel="foro" hidden></div>`;

  const grid = shell.main.querySelector('[data-role="grid"]');
  const q = shell.main.querySelector('[data-role="q"]');
  const type = shell.main.querySelector('[data-role="type"]');
  const sort = shell.main.querySelector('[data-role="sort"]');

  const card = s => {
    const n = count.get(s.id) || 0, healthy = s.subject_type === 'healthy';
    return `
      <li class="pt-card" data-id="${s.id}">
        <div class="pt-top">
          <div class="pt-avatar" aria-hidden="true">${initials(s.display_name)}</div>
          <span class="ui-badge${healthy ? '' : ' is-strong'}">${healthy ? 'Voluntario sano' : 'Paciente'}</span>
        </div>
        <div class="pt-who">
          <h2>${esc(s.display_name)}</h2>
          <p>${SEX[s.sex] || 'Otro'} · ${year - s.birth_year} años · ${HAND[s.dominant_hand] || ''}</p>
        </div>
        <ul class="pt-facts">
          <li>${ICON.hash}${n === 1 ? '1 sesión' : `${n} sesiones`}</li>
          <li>${ICON.calendar}${lastSession(last.get(s.id))}</li>
        </ul>
        <div class="pt-actions">
          <button type="button" class="ui-btn ui-btn-primary ui-btn-sm" data-action="play">${ICON.play}Jugar</button>
          <a class="ui-btn ui-btn-outline ui-btn-sm" href="${base}dashboard/patient/${encodeURIComponent(s.id)}">${ICON.file}Ver ficha</a>
        </div>
      </li>`;
  };

  function renderGrid() {
    if (!subjects.length) {
      grid.outerHTML = `<div class="ui-empty"><div class="ui-empty-icon">${ICON.users}</div><h2>Aún no hay pacientes</h2>
        <p>Da de alta a tu primer paciente o voluntario para empezar el viaje del zorro.</p>
        <button type="button" class="ui-btn ui-btn-primary" data-action="new">${ICON.plus}Nuevo paciente</button></div>`;
      return;
    }
    const term = q.value.trim().toLowerCase();
    const list = subjects
      .filter(s => (type.value === 'all' || (s.subject_type || 'patient') === type.value) && s.display_name.toLowerCase().includes(term))
      .sort((a, b) => sort.value === 'name' ? a.display_name.localeCompare(b.display_name, 'es')
        : sort.value === 'created' ? String(b.created_at).localeCompare(String(a.created_at))
          : String(last.get(b.id) || '').localeCompare(String(last.get(a.id) || '')) || a.display_name.localeCompare(b.display_name, 'es'));
    grid.innerHTML = list.length ? list.map(card).join('')
      : `<li class="ui-empty is-inline"><h2>Ningún resultado</h2><p>Ningún paciente coincide con la búsqueda o el filtro.</p>
          <button type="button" class="ui-btn ui-btn-outline ui-btn-sm" data-action="clear">Quitar filtros</button></li>`;
  }
  renderGrid();
  [q, type, sort].forEach(el => el?.addEventListener('input', renderGrid));

  function show(tab) {
    shell.setActive(tab, ['Plataforma', tab === 'foro' ? 'Foro' : 'Pacientes']);
    shell.main.querySelector('[data-panel="pacientes"]').hidden = tab !== 'pacientes';
    const forumEl = shell.main.querySelector('[data-panel="foro"]');
    forumEl.hidden = tab !== 'foro';
    if (tab === 'foro' && !unmountForum) unmountForum = mountForum(forumEl, { me: user?.id });
    history.replaceState(null, '', tab === 'foro' ? '#foro' : location.pathname + location.search);
  }
  show(location.hash === '#foro' ? 'foro' : 'pacientes');

  shell.main.addEventListener('click', e => {
    const el = e.target.closest('#new-subject-btn, [data-action]');
    if (!el) return;
    if (el.id === 'new-subject-btn' || el.dataset.action === 'new') leave(onCreateSubject);
    else if (el.dataset.action === 'play') { const id = el.closest('.pt-card').dataset.id; leave(() => play(id)); }
    else if (el.dataset.action === 'clear') { q.value = ''; type.value = 'all'; renderGrid(); }
  });
}
