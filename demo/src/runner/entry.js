import { startFoxJourney } from '../pack/pack.js';

// «El viaje del zorro» completo sin login: carrera (pinza) → globo (puño) → huerto (giro).
const app = document.getElementById('app');
const stop = startFoxJourney(app);
window.addEventListener('pagehide', () => stop?.(), { once: true });
if (import.meta.hot) import.meta.hot.dispose(() => stop?.());
