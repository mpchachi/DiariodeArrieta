import gsap from 'gsap';
import { login } from '../database/auth.js';

// Puntos de la mano (los 21 landmarks que detecta la cámara) para la ilustración del panel.
const HAND = [[50, 92], [36, 84], [27, 72], [21, 61], [15, 52], [37, 54], [33, 39], [31, 29], [30, 20], [48, 51], [47, 34],
  [46, 23], [46, 13], [58, 53], [60, 38], [61, 28], [62, 19], [67, 57], [71, 46], [74, 38], [76, 31]];
const BONES = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13],
  [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];
const handSvg = () => `
  <svg class="login-hand" viewBox="0 0 100 100" aria-hidden="true">
    ${BONES.map(([a, b]) => `<line x1="${HAND[a][0]}" y1="${HAND[a][1]}" x2="${HAND[b][0]}" y2="${HAND[b][1]}" />`).join('')}
    ${HAND.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${[4, 8, 12, 16, 20].includes(i) ? 1.9 : 1.4}" style="--d:${(i * 0.09).toFixed(2)}s" />`).join('')}
  </svg>`;

export function showLogin(container, onLoginSuccess) {
  const logo = `${import.meta.env.BASE_URL}dashboard/logo.png`;
  container.innerHTML = `
    <div class="auth-screen login-screen">
      <div class="login-card">
        <aside class="login-brand">
          <div class="login-logo"><img src="${logo}" alt="" /><span>FixedGap</span></div>
          ${handSvg()}
          <div class="login-pitch">
            <h2>Telemonitorización motora tras un ictus.</h2>
            <p>Juegos en casa con la cámara del ordenador y métricas objetivas para el equipo clínico.</p>
          </div>
        </aside>
        <section class="login-form-pane">
          <h1>Bienvenido de nuevo</h1>
          <p class="login-lead">Accede a la plataforma clínica de FixedGap.</p>
          <form id="login-form" novalidate>
            <label class="login-field">
              <span>Usuario</span>
              <input type="text" id="username" required autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="p. ej. DrGarcia" />
            </label>
            <label class="login-field">
              <span>Contraseña</span>
              <div class="login-password">
                <input type="password" id="password" required autocomplete="current-password" placeholder="••••••••" />
                <button type="button" class="login-toggle" aria-label="Mostrar contraseña" aria-pressed="false">Mostrar</button>
              </div>
            </label>
            <p id="login-error" class="login-error" role="alert"></p>
            <button type="submit" class="auth-button login-submit">
              <span class="btn-text">Iniciar sesión</span>
              <div class="btn-loader"></div>
            </button>
          </form>
          <p class="login-foot">¿No tienes cuenta? Pídela al equipo de FixedGap.</p>
        </section>
      </div>
    </div>
  `;

  const authScreen = container.querySelector('.auth-screen');
  const card = container.querySelector('.login-card');
  const form = document.getElementById('login-form');
  const errorEl = document.getElementById('login-error');
  const btn = form.querySelector('.login-submit');
  const user = document.getElementById('username');
  const pass = document.getElementById('password');
  const toggle = form.querySelector('.login-toggle');

  gsap.fromTo(authScreen, { opacity: 0 }, { opacity: 1, duration: 0.5 });
  gsap.fromTo(card, { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: 'power3.out', delay: 0.1 });
  user.focus();

  toggle.addEventListener('click', () => {
    const show = pass.type === 'password';
    pass.type = show ? 'text' : 'password';
    toggle.textContent = show ? 'Ocultar' : 'Mostrar';
    toggle.setAttribute('aria-pressed', String(show));
    toggle.setAttribute('aria-label', show ? 'Ocultar contraseña' : 'Mostrar contraseña');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (btn.classList.contains('loading')) return;
    const username = user.value.trim();
    const password = pass.value;
    if (!username || !password) {
      errorEl.textContent = 'Escribe tu usuario y tu contraseña.';
      (username ? pass : user).focus();
      return;
    }
    errorEl.textContent = '';
    btn.classList.add('loading');

    const result = await login(username, password);

    if (result.ok) {
      gsap.to(card, { y: -24, opacity: 0, duration: 0.4, ease: 'power2.in' });
      gsap.to(authScreen, { opacity: 0, duration: 0.4, delay: 0.2, onComplete: () => onLoginSuccess(result.user) });
    } else {
      btn.classList.remove('loading');
      errorEl.textContent = /invalid login credentials/i.test(result.error || '')
        ? 'Usuario o contraseña incorrectos.'
        : (result.error || 'Error al iniciar sesión.');
      pass.select();
      gsap.fromTo(card, { x: -10 }, { x: 0, duration: 0.4, ease: 'elastic.out(1, 0.3)' });
    }
  });
}
