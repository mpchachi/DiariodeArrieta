// Feedback tranquilo para los juegos (pensado para personas mayores):
// - Una palabra de ánimo grande y legible que aparece, sube unos píxeles y se desvanece
//   (≈ 1,6 s). Sin rebotes, destellos, sacudidas ni combos.
// - Unas pocas chispas/hojas que suben despacio desde donde ocurrió el acierto.
// - Tras un choque, como mucho una vez por partida, un «Casi… ¡sigue así!» suave: nunca
//   un mensaje negativo.
// Con «reducir movimiento» del sistema: solo aparece y desaparece el texto, sin partículas.

const CHEERS = ['¡Bien!', '¡Muy bien!', '¡Eso es!', '¡Genial!', '¡Así se hace!'];
const SHOW_MS = 1600;
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function createPraise(root) {
  const el = document.createElement('div');
  el.className = 'runner-praise';
  el.setAttribute('aria-live', 'polite');
  el.hidden = true;
  el.dataset.count = '0';
  root.append(el);
  let i = 0, timer = null, encouraged = false;

  function show(text, tone) {
    el.textContent = text;
    el.dataset.tone = tone;
    el.dataset.count = String(Number(el.dataset.count) + 1);
    el.hidden = false;
    el.classList.remove('is-on');
    void el.offsetWidth; // reinicia la animación si llegan dos seguidos
    el.classList.add('is-on');
    clearTimeout(timer);
    timer = setTimeout(() => { el.hidden = true; }, SHOW_MS);
  }

  return {
    cheer: () => show(CHEERS[i++ % CHEERS.length], 'cheer'),
    encourage() { if (encouraged) return; encouraged = true; show('Casi… ¡sigue así!', 'soft'); },
    hide() { clearTimeout(timer); el.hidden = true; },
    dispose() { clearTimeout(timer); el.remove(); },
  };
}

// Partículas lentas en coordenadas del lienzo pixel. `draw(ctx, rect)` usa el `rect` de
// cada juego (posiciones ajustadas a la cuadrícula) y desvanece con globalAlpha.
const GOLD = ['#ffe9a8', '#ffffff', '#ffd27a'];
export function createFloaters() {
  let list = [];
  return {
    spawn(x, y, { n = 6, colors = GOLD, spread = 10 } = {}) {
      if (reducedMotion()) return;
      for (let k = 0; k < n; k++) {
        list.push({
          x: x + (Math.random() - 0.5) * spread, y: y + (Math.random() - 0.5) * spread * 0.5,
          vx: (Math.random() - 0.5) * 8, vy: -(9 + Math.random() * 7),
          life: 1.2 + Math.random() * 0.5, max: 1.7, seed: Math.random() * 6, color: colors[k % colors.length], big: k % 3 === 0,
        });
      }
    },
    update(dt) {
      for (const p of list) { p.life -= dt; p.x += (p.vx + Math.sin(p.life * 3 + p.seed) * 3) * dt; p.y += p.vy * dt; }
      list = list.filter(p => p.life > 0);
    },
    draw(ctx, rect) {
      if (!list.length) return;
      const alpha = ctx.globalAlpha;
      for (const p of list) {
        ctx.globalAlpha = alpha * Math.min(1, p.life / 0.6);
        if (p.big) { rect(p.x - 1, p.y, 3, 1, p.color); rect(p.x, p.y - 1, 1, 3, p.color); } // chispa en cruz
        else rect(p.x, p.y, 1, 1, p.color);
      }
      ctx.globalAlpha = alpha;
    },
    clear() { list = []; },
    get size() { return list.length; },
  };
}
