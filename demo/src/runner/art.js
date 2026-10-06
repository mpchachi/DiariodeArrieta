// Arte del Runner sobre el motor pixel compartido (src/pixel): fondos por capas
// pre-renderizadas, sprites con sombreado y contorno, HUD con paneles y fuente propia.

import { SEASONS } from '../pixel/seasons.js';
import { buildScenery, drawScenery } from '../pixel/scenery.js';
import { foxSprites, FOX_ANCHOR } from '../pixel/fox.js';
import { draw, snap } from '../pixel/sprite.js';
import { logSprite, berrySprite, denSprite, glyph, handSprite, miniFox, miniDen, panel } from '../pixel/props.js';
import { mulberry } from '../pixel/util.js';

export { SEASONS };

export function createArt(ctx, view) {
  const { groundY } = view;
  const r = (x, y, w, h, c) => { if (!c) return; ctx.fillStyle = c; ctx.fillRect(snap(x), snap(y), Math.round(w), Math.round(h)); };
  const layers = new Map();
  // Fondo pixel limpio: pocos elementos, bordes nítidos y degradados en franjas planas.
  const layersFor = s => {
    if (!layers.has(s.index)) layers.set(s.index, buildScenery(s, { groundY: view.groundY ?? 150, height: view.height ?? 180, pixel: true }));
    return layers.get(s.index);
  };
  const particles = [];
  const rand = mulberry(7);

  function background(s, scroll) {
    drawScenery(ctx, layersFor(s), view, scroll, view.width - 48, snap);
  }

  // ---------- Partículas (pocas y lentas) ----------
  function spawn(s, anywhere) {
    const type = s.particles;
    const base = { type, life: 0, seed: rand() * 10, x: rand() * (view.width + 40), y: anywhere ? rand() * groundY : -4 };
    if (type === 'snow') return { ...base, vx: -4 - rand() * 4, vy: 7 + rand() * 6 };
    if (type === 'drops') return { ...base, vx: -2, vy: 30 + rand() * 15 };
    if (type === 'petals') return { ...base, vx: -8 - rand() * 5, vy: 5 + rand() * 4 };
    return { ...base, y: 60 + rand() * (groundY - 70), vx: 0, vy: 0 };
  }
  // Sin partículas (nieve, pétalos…): eran ruido visual. Se conservan por si se reactivan.
  const PARTICLES = false;
  function updateParticles(s, dt) {
    if (!PARTICLES) return;
    const want = { snow: 26, drops: 8, petals: 12, fireflies: 14 }[s.particles];
    while (particles.length < want) particles.push(spawn(s, true));
    if (particles.length > want) particles.length = want;
    for (const p of particles) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.life += dt;
      if (s.particles === 'snow' || s.particles === 'petals') p.x += Math.sin(p.life * 0.8 + p.seed) * 2 * dt;
      if (s.particles === 'fireflies') { p.vx = Math.sin(p.life + p.seed) * 6; p.vy = Math.cos(p.life * 0.7 + p.seed) * 4; }
      if (p.y > groundY + 4 || p.x < -4 || p.x > view.width + 4 || p.type !== s.particles) Object.assign(p, spawn(s, false));
    }
  }
  function drawParticles(t) {
    if (!PARTICLES) return;
    for (const p of particles) {
      if (p.type === 'snow') { r(p.x, p.y, 1, 1, '#ffffff'); if (p.seed > 6.5) { r(p.x + 1, p.y, 1, 1, '#e6eef4'); r(p.x, p.y + 1, 1, 1, '#e6eef4'); } }
      else if (p.type === 'drops') { r(p.x, p.y, 1, 2, '#e8f4fc'); r(p.x, p.y + 2, 1, 1, '#b9d6ea'); }
      else if (p.type === 'petals') { const flip = Math.sin(p.life * 3 + p.seed) > 0; r(p.x, p.y, flip ? 2 : 1, flip ? 1 : 2, p.seed > 5 ? '#f7a9c9' : '#ffe0ec'); }
      else if (Math.sin(t * 2.2 + p.seed * 5) > 0.1) { r(p.x - 1, p.y, 3, 1, 'rgba(255,246,160,0.35)'); r(p.x, p.y - 1, 1, 3, 'rgba(255,246,160,0.35)'); r(p.x, p.y, 1, 1, '#fff6a0'); }
    }
  }

  // ---------- Objetos ----------
  function shadow(cx, w) {
    r(cx - w / 2 + 1, groundY, w - 2, 1, 'rgba(30,20,15,0.28)');
    r(cx - w / 2 + 3, groundY + 1, w - 6, 1, 'rgba(30,20,15,0.16)');
  }
  function obstacle(ob, x, s) {
    shadow(x + ob.w / 2, ob.w + 4);
    draw(ctx, logSprite(s), x, groundY - 12);
  }
  function berry(x, y, t) {
    const by = y + Math.sin(t * 3) * 1.5;
    if (Math.sin(t * 5 + x) > 0.6) { r(x + 3, by - 6, 1, 3, '#fffbe0'); r(x + 2, by - 5, 3, 1, '#fffbe0'); }
    draw(ctx, berrySprite(), x - 3, by - 5);
  }
  function den(x, s) {
    shadow(x + 4, 66);
    draw(ctx, denSprite(s), x - 32, groundY - 30);
  }

  // ---------- Zorro ----------
  function fox(x, y, st) {
    const sp = foxSprites();
    const lift = Math.max(0, groundY - y);
    shadow(x + 1, Math.max(8, 24 - lift / 3));
    const sprite = !st.onGround ? (st.vy > 0 ? sp.jump : sp.fall) : sp.run[st.frame % 4];
    draw(ctx, sprite, x - FOX_ANCHOR.x, y - FOX_ANCHOR.y + (st.landing ? 1 : 0));
  }

  function sparkles(list) {
    for (const p of list) r(p.x, p.y, p.size, p.size, p.color);
  }

  // ---------- HUD ----------
  function text(str, x, y, color = '#ffffff') {
    let cx = x;
    for (const ch of String(str)) { const g = glyph(ch, color); if (g) draw(ctx, g, cx, y); cx += 6; }
    return cx;
  }
  function handIcon(x, y, status) { draw(ctx, handSprite(status), x, y); }

  // Marcador mínimo: solo el camino hasta la madriguera y el estado de la mano.
  function hud({ progress, hand }) {
    const top = (view.top ?? 0) + 4;
    const bw = Math.min(120, Math.round(view.width * 0.4)), bx = Math.round((view.width - bw) / 2), p = Math.min(1, Math.max(0, progress));
    panel(ctx, bx - 4, top + 2, bw + 20, 11);
    r(bx, top + 6, bw, 3, '#d7c4a4');
    r(bx, top + 6, Math.round(bw * p), 3, '#e8742a');
    draw(ctx, miniDen(), bx + bw + 3, top + 4);
    draw(ctx, miniFox(), bx + Math.round(bw * p) - 4, top + 1);
    panel(ctx, view.width - 21, top, 17, 18);
    handIcon(view.width - 18, top + 3, hand);
  }

  return { background, updateParticles, drawParticles, obstacle, berry, den, fox, sparkles, hud, handIcon, rect: r };
}
