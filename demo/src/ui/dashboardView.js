import gsap from 'gsap';
import { listSubjects } from '../database/subjects.js';
import { getOperatorProfile, logout } from '../database/auth.js';
import { initChatWidget } from './chatWidget.js';

export async function showDashboard(container, onSelectSubject, onCreateSubject, onLogout, onSelectPinch = null, onPlay = null) {
  // Show a quick loader while fetching data
  container.innerHTML = `<div class="dash-loading"><div class="spinner-inner"><div class="spinner-bar"></div></div></div>`;
  
  const [operator, subjects] = await Promise.all([
    getOperatorProfile(),
    listSubjects()
  ]);

  let rawOperatorName = operator?.display_name || operator?.username || 'Operador';
  const operatorName = rawOperatorName.charAt(0).toUpperCase() + rawOperatorName.slice(1).toLowerCase();

  let subjectsHtml = '';
  if (subjects.length === 0) {
    subjectsHtml = `
      <div class="empty-state">
        <p>No tienes sujetos registrados todavía.</p>
      </div>
    `;
  } else {
    subjectsHtml = subjects.map(s => `
      <div class="subject-entry">
        <button class="subject-card" data-id="${s.id}">
          <div class="subject-avatar">${s.display_name.charAt(0).toUpperCase()}</div>
          <div class="subject-info">
            <h3>${s.display_name}</h3>
            <p>${s.sex === 'male' ? 'Hombre' : s.sex === 'female' ? 'Mujer' : 'Otro'}, Nacido en ${s.birth_year}</p>
          </div>
          <div class="subject-action">
            <span>${onPlay ? 'Jugar' : onSelectPinch ? 'Jugar al Pastillero' : 'Seleccionar'}</span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
          </div>
        </button>
        <div class="subject-secondary">
          ${onPlay && onSelectPinch ? `<button class="text-button subject-pinch" data-id="${s.id}">Pastillero (pinza)</button>` : ''}
          ${onSelectPinch || onPlay ? `<button class="text-button subject-legacy" data-id="${s.id}">Sesión anterior de 3 juegos</button>` : ''}
        </div>
      </div>
    `).join('');
  }

  container.innerHTML = `
    <div class="dash-screen">
      <header class="dash-header">
        <div class="dash-logo">FixedGap</div>
        <div class="dash-user">
          <span class="operator-name">${operatorName}</span>
          <button id="logout-btn" class="text-button">Cerrar Sesión</button>
        </div>
      </header>
      
      <main class="dash-main">
        <div class="dash-toolbar">
          <h2 class="dash-title">Tus Sujetos</h2>
          <div class="dash-actions">
            <button id="goto-dashboard-btn" class="secondary-button">Ir al Dashboard Clínico</button>
            <button id="new-subject-btn" class="primary-button">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
              Nuevo Sujeto
            </button>
          </div>
        </div>
        
        <div class="subjects-list">
          ${subjectsHtml}
        </div>
      </main>
    </div>
  `;

  // Initialize the chat widget on the dashboard
  initChatWidget(container);

  const dashScreen = container.querySelector('.dash-screen');
  gsap.fromTo(dashScreen, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' });

  // Event Listeners
  document.getElementById('logout-btn').addEventListener('click', async () => {
    await logout();
    gsap.to(dashScreen, { opacity: 0, duration: 0.3, onComplete: onLogout });
  });

  document.getElementById('goto-dashboard-btn').addEventListener('click', () => {
    window.location.href = '/dashboard/';
  });

  document.getElementById('new-subject-btn').addEventListener('click', () => {
    gsap.to(dashScreen, { opacity: 0, x: -20, duration: 0.3, onComplete: onCreateSubject });
  });

  const subjectCards = container.querySelectorAll('.subject-card');
  subjectCards.forEach(card => {
    card.addEventListener('click', () => {
      const subjectId = card.dataset.id;
      gsap.to(dashScreen, { opacity: 0, scale: 0.98, duration: 0.4, onComplete: () => (onPlay || onSelectPinch || onSelectSubject)(subjectId) });
    });
  });
  container.querySelectorAll('.subject-pinch').forEach(button => {
    button.addEventListener('click', () => {
      gsap.to(dashScreen, { opacity: 0, duration: 0.3, onComplete: () => onSelectPinch(button.dataset.id) });
    });
  });
  container.querySelectorAll('.subject-legacy').forEach(button => {
    button.addEventListener('click', () => {
      gsap.to(dashScreen, { opacity: 0, duration: 0.3, onComplete: () => onSelectSubject(button.dataset.id) });
    });
  });
}
