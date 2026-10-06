import { startPinchGame } from './pinchGame.js';

const stop = startPinchGame(document.getElementById('app'));
window.addEventListener('pagehide', stop, { once: true });
if (import.meta.hot) import.meta.hot.dispose(stop);
