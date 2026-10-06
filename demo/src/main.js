import gsap from 'gsap';
import { startPastilleroGame, startLegacyPastilleroGame } from './games/pastillero/game.js';
import { startJarraGame } from './games/jarra/game.js';
import { startInterruptoresGame } from './games/interruptores/game.js';
import { startFoxJourney } from './pack/pack.js';
import { showTetrisLoader } from './tetrisLoader.js';
import { waitForNext } from './ui/nextButton.js';
import { startPlaythrough, commitPlaythrough, setActiveSubject } from './clinical/sessionRecorder.js';
import { getCurrentUser } from './database/auth.js';
import { showLogin } from './ui/loginView.js';
import { showDashboard } from './ui/dashboardView.js';
import { showCreateSubject } from './ui/createSubjectView.js';

const app = document.getElementById('app');
const DEMO_SEQUENCE = ['pastillero', 'jarra', 'interruptores'];

function startGame(name) {
  if (name === 'pastillero') return startLegacyPastilleroGame(app);
  if (name === 'jarra') return startJarraGame(app);
  if (name === 'interruptores') return startInterruptoresGame(app);
}

function showLoadingScreen(message = "Guardando sesión...") {
  // Use a custom version of tetris loader if possible, or just standard loader
  app.innerHTML = `
    <div id="tetris-screen">
      <div class="spinner-wrap"><div class="spinner-inner"><div class="spinner-bar"></div></div></div>
      <div class="loader-text">
        <h2 class="loader-title">${message}</h2>
      </div>
    </div>
  `;
  return () => { app.innerHTML = ''; };
}

async function init() {
  const user = await getCurrentUser();
  if (user) {
    renderDashboard();
  } else {
    renderLogin();
  }
}

function renderLogin() {
  app.innerHTML = '';
  showLogin(app, (user) => {
    renderDashboard();
  });
}

function renderDashboard() {
  app.innerHTML = '';
  showDashboard(
    app, 
    (subjectId) => {
      setActiveSubject(subjectId);
      runDemo();
    }, 
    () => {
      renderCreateSubject();
    },
    () => {
      renderLogin();
    },
    (subjectId) => {
      startPastilleroGame(app, { subjectId, onExit: renderDashboard });
    },
    (subjectId) => {
      // «El viaje del zorro»: carrera (pinza) → globo (puño) → huerto (giro), con transiciones automáticas.
      startFoxJourney(app, { subjectId, onExit: renderDashboard, onDone: renderDashboard });
    }
  );
}

function renderCreateSubject() {
  app.innerHTML = '';
  showCreateSubject(
    app,
    (subject) => {
      renderDashboard(); // Back to dashboard, now will include the new subject
    },
    () => {
      renderDashboard(); // Cancelled, go back
    }
  );
}

async function runDemo() {
  app.innerHTML = '';
  startPlaythrough();

  for (let i = 0; i < DEMO_SEQUENCE.length; i++) {
    const gameName = DEMO_SEQUENCE[i];
    const cleanup = startGame(gameName);

    const isLast = i === DEMO_SEQUENCE.length - 1;
    await waitForNext(isLast ? 'Finalizar y Guardar' : 'Siguiente juego');

    if (cleanup) cleanup();
  }

  const cleanupLoader = showLoadingScreen("Sincronizando con base de datos...");
  
  // Persist this playthrough and upload it
  const { uploadResult } = await commitPlaythrough('right');
  
  if (cleanupLoader) cleanupLoader();
  
  if (uploadResult && !uploadResult.ok) {
    alert("Hubo un problema al subir la sesión: " + uploadResult.error);
  }

  // Go back to the dashboard after completing the session
  renderDashboard();
}

// Start application
init();
