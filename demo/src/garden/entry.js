import { startGardenGame } from './game.js';

const stop = startGardenGame(document.getElementById('app'));
window.addEventListener('pagehide', stop, { once: true });
if (import.meta.hot) import.meta.hot.dispose(stop);
