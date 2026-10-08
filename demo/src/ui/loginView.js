import gsap from 'gsap';
import { login } from '../database/auth.js';

export function showLogin(container, onLoginSuccess) {
  const base = import.meta.env.BASE_URL;
  const logo = `${base}dashboard/logo.png`;
  container.innerHTML = `
    <div class="auth-screen login-screen">
      <div class="login-card">
        <aside class="login-brand" style="--login-photo: url('${base}login-panel.jpg')">
          <div class="login-logo"><img src="${logo}" alt="" /><span>FixedGap</span></div>
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
              <input type="text" id="username" required autocomplete="username" autocapitalize="none" spellcheck="false" />
            </label>
            <label class="login-field">
              <span>Contraseña</span>
              <div class="login-password">
                <input type="password" id="password" required autocomplete="current-password" />
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
      const err = result.error || '';
      console.error('[login]', err);
      errorEl.textContent = /invalid login credentials/i.test(err) ? 'Usuario o contraseña incorrectos.'
        : /rate limit|too many/i.test(err) ? 'Demasiados intentos. Espera un momento y vuelve a probar.'
        : /fetch|network/i.test(err) ? 'Sin conexión con el servidor. Comprueba la red.'
        : 'No se ha podido iniciar sesión. Inténtalo de nuevo.';
      pass.select();
      gsap.fromTo(card, { x: -10 }, { x: 0, duration: 0.4, ease: 'elastic.out(1, 0.3)' });
    }
  });
}
