// Estructura común de la plataforma (inspirada en shadcn-admin): barra lateral plegable con
// grupos de navegación y la cuenta abajo (menú con «Cerrar sesión»), cabecera con el botón
// de plegar y la ruta, y el contenido. En móvil la barra se abre como panel superpuesto.
import { getOperatorProfile, logout } from '../database/auth.js';
import { esc } from './forumView.js';

const svg = (d, cls = 'ic') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const ICON = {
  users: svg('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>'),
  forum: svg('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'),
  activity: svg('<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>'),
  external: svg('<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>', 'ic ic-sm'),
  panel: svg('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/>'),
  chevrons: svg('<path d="m7 15 5 5 5-5M7 9l5-5 5 5"/>', 'ic ic-sm'),
  logout: svg('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>', 'ic ic-sm'),
  plus: svg('<path d="M12 5v14M5 12h14"/>', 'ic ic-sm'),
  play: svg('<path d="m7 4 13 8-13 8z"/>', 'ic ic-sm'),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>', 'ic ic-sm'),
  file: svg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8"/>', 'ic ic-sm'),
  calendar: svg('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>', 'ic ic-xs'),
  hash: svg('<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>', 'ic ic-xs'),
  sort: svg('<path d="m3 16 4 4 4-4M7 20V4M11 4h10M11 8h7M11 12h4"/>', 'ic ic-sm'),
};

const initials = name => esc(String(name || '?').replace(/^dr\.?\s*/i, '').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?');
const COLLAPSE_KEY = 'fixedgap_sidebar_collapsed';

/**
 * Pinta la estructura y devuelve { main, setActive, dispose }.
 * @param {HTMLElement} container
 * @param {{ active: 'pacientes'|'foro', crumbs: string[], operator?: object|null, onNavigate: (tab:string)=>void, onLogout?: ()=>void }} opts
 */
export function mountShell(container, { active, crumbs, operator = null, onNavigate, onLogout }) {
  const base = import.meta.env.BASE_URL;
  const collapsed = localStorage.getItem(COLLAPSE_KEY) === '1';
  container.innerHTML = `
    <div class="sh${collapsed ? ' is-collapsed' : ''}">
      <aside class="sh-side" aria-label="Navegación">
        <div class="sh-side-head">
          <a class="sh-brand" href="${base}" title="FixedGap">
            <img src="${base}dashboard/logo.png" alt="" />
            <span class="sh-brand-text"><strong>FixedGap</strong><small>Plataforma clínica</small></span>
          </a>
        </div>
        <nav class="sh-nav">
          <p class="sh-group">Plataforma</p>
          <button type="button" class="sh-item" data-nav="pacientes" title="Pacientes">${ICON.users}<span>Pacientes</span></button>
          <button type="button" class="sh-item" data-nav="foro" title="Foro">${ICON.forum}<span>Foro</span></button>
          <p class="sh-group">Análisis</p>
          <a class="sh-item" href="${base}dashboard/" title="Dashboard clínico">${ICON.activity}<span>Dashboard clínico</span>${ICON.external}</a>
        </nav>
        <div class="sh-side-foot">
          <button type="button" class="sh-user" data-action="user-menu" aria-haspopup="menu" aria-expanded="false">
            <span class="sh-avatar" data-role="avatar">·</span>
            <span class="sh-user-text"><strong data-role="name">&nbsp;</strong><small data-role="username">&nbsp;</small></span>
            ${ICON.chevrons}
          </button>
          <div class="sh-menu" role="menu" data-role="user-menu" hidden>
            <div class="sh-menu-label"><span class="sh-avatar" data-role="avatar">·</span><span class="sh-user-text"><strong data-role="name"></strong><small data-role="username"></small></span></div>
            <div class="sh-sep"></div>
            <button type="button" role="menuitem" class="sh-menu-item" data-action="logout">${ICON.logout}Cerrar sesión</button>
          </div>
        </div>
      </aside>
      <div class="sh-scrim" data-action="close-side"></div>
      <div class="sh-content">
        <header class="sh-header">
          <button type="button" class="sh-trigger" data-action="toggle-side" aria-label="Mostrar u ocultar la barra lateral">${ICON.panel}</button>
          <span class="sh-vsep" aria-hidden="true"></span>
          <nav class="sh-crumbs" aria-label="Ruta" data-role="crumbs"></nav>
        </header>
        <main class="sh-main" data-role="main"></main>
      </div>
    </div>`;

  const root = container.querySelector('.sh');
  const main = root.querySelector('[data-role="main"]');
  const menu = root.querySelector('[data-role="user-menu"]');
  const userBtn = root.querySelector('[data-action="user-menu"]');

  const setUser = op => {
    const name = op?.display_name || op?.username || 'Cuenta';
    root.querySelectorAll('[data-role="name"]').forEach(el => { el.textContent = name; });
    root.querySelectorAll('[data-role="username"]').forEach(el => { el.textContent = op?.username ? `@${op.username}` : ''; });
    root.querySelectorAll('[data-role="avatar"]').forEach(el => { el.innerHTML = initials(name); });
  };
  if (operator) setUser(operator); else getOperatorProfile().then(op => { if (root.isConnected) setUser(op); });

  const setCrumbs = list => {
    root.querySelector('[data-role="crumbs"]').innerHTML = list.map((c, i) =>
      i < list.length - 1 ? `<span class="sh-crumb">${esc(c)}</span><span class="sh-crumb-sep" aria-hidden="true">/</span>` : `<span class="sh-crumb is-current" aria-current="page">${esc(c)}</span>`).join('');
  };
  const setActive = (tab, list) => {
    root.querySelectorAll('[data-nav]').forEach(b => { const on = b.dataset.nav === tab; b.classList.toggle('is-active', on); b.toggleAttribute('aria-current', on); });
    if (list) setCrumbs(list);
  };
  setActive(active, crumbs);

  const isMobile = () => matchMedia('(max-width: 767px)').matches;
  const closeMenu = () => { menu.hidden = true; userBtn.setAttribute('aria-expanded', 'false'); };
  const onDocClick = e => { if (!menu.hidden && !e.target.closest('.sh-side-foot')) closeMenu(); };
  const onKey = e => { if (e.key === 'Escape') { closeMenu(); root.classList.remove('is-open'); } };
  document.addEventListener('click', onDocClick);
  document.addEventListener('keydown', onKey);

  root.addEventListener('click', async e => {
    const el = e.target.closest('[data-nav], [data-action]');
    if (!el) return;
    if (el.dataset.nav) { root.classList.remove('is-open'); onNavigate(el.dataset.nav); return; }
    switch (el.dataset.action) {
      case 'toggle-side':
        if (isMobile()) root.classList.toggle('is-open');
        else { const c = root.classList.toggle('is-collapsed'); localStorage.setItem(COLLAPSE_KEY, c ? '1' : '0'); }
        break;
      case 'close-side': root.classList.remove('is-open'); break;
      case 'user-menu': menu.hidden = !menu.hidden; userBtn.setAttribute('aria-expanded', String(!menu.hidden)); break;
      case 'logout':
        closeMenu(); await logout();
        if (onLogout) onLogout(); else location.reload();
        break;
    }
  });

  return {
    root, main, setActive,
    dispose() { document.removeEventListener('click', onDocClick); document.removeEventListener('keydown', onKey); },
  };
}
