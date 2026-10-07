// Vista previa de la guía de gestos (desarrollo): los cuatro gestos a la vez.
// `?t=ms` congela la animación en ese instante del bucle (capturas); `?done=1` muestra
// la marca de confirmación en la primera; `?hand=Left` invierte el gesto de verter.
import { createGestureGuide } from './gestureGuide.js';

const q = new URLSearchParams(location.search);
if (q.has('t')) {
  // Congela el bucle en `ms`: las guías arrancan en 0 y cada fotograma llega con `ms`.
  const ms = Number(q.get('t')), raf = window.requestAnimationFrame.bind(window);
  performance.now = () => 0;
  window.requestAnimationFrame = cb => raf(() => cb(ms));
}
const cases = [
  { gesture: 'pinch', title: 'Junta pulgar e índice para saltar', hint: 'Hazlo tú ahora: el zorro te espera.' },
  { gesture: 'fist', title: 'Cierra el puño para subir', hint: 'Al abrir la mano, el globo baja.' },
  { gesture: 'grip', title: 'Cierra la mano como si cogieras una regadera', hint: 'Pulgar hacia arriba. Mantenla quieta un momento.', step: { index: 0, total: 2 } },
  { gesture: 'tilt', title: 'Inclina la mano para regar', hint: 'Gira la muñeca hacia dentro, como si vertieras agua.', step: { index: 1, total: 2 }, mirror: q.get('hand') === 'Left' },
];
const grid = document.getElementById('grid');
// Desarrollo: `?gesture=fist&views=yaw,pitch,roll;yaw,pitch,roll` prueba varias cámaras.
if (q.has('views')) {
  const { GESTURES } = await import('./handModel.js');
  const name = q.get('gesture') ?? 'fist';
  const list = q.get('views').split(';').map(v => v.split(',').map(Number));
  window.guides = list.map(([yaw, pitch, roll]) => {
    GESTURES[name].view = { yaw, pitch, roll };
    const slot = document.createElement('div'); slot.className = 'slot'; grid.appendChild(slot);
    const g = createGestureGuide(slot);
    g.show({ gesture: name, title: `${yaw},${pitch},${roll}`, hint: '' });
    return g;
  });
} else {
window.guides = cases.map(c => {
  const slot = document.createElement('div'); slot.className = 'slot'; grid.appendChild(slot);
  const g = createGestureGuide(slot);
  g.show(c);
  return g;
});
if (q.get('done') === '1') setTimeout(() => window.guides[0].success(), 600);
}
