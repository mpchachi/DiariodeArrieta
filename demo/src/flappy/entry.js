import { startFlappyGame } from './game.js';

const stop = startFlappyGame(document.getElementById('app'));
window.addEventListener('pagehide', stop, { once: true });
if (import.meta.hot) import.meta.hot.dispose(stop);
