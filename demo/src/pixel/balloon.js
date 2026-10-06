// Sprites del juego del globo: globo aerostático (con cesta), ciprés y nube de tormenta.

import { pixmap, bake, INK, snap } from './sprite.js';
import { mix, hash, BAYER4 } from './util.js';

const cache = new Map();
const memo = (key, fn) => { if (!cache.has(key)) cache.set(key, fn()); return cache.get(key); };
const bayer = (x, y) => BAYER4[((y % 4) + 4) % 4][((x % 4) + 4) % 4];

// Globo 28×48: envoltura a rayas naranja/crema (colores del zorro), cuerdas y cesta.
// La cesta va en un sprite aparte para dibujar al zorro entre las cuerdas y la cesta.
// Ancla: centro de la envoltura en (14, 13). Quemador en y=28; borde de la cesta en y=38.
export const BALLOON = { w: 28, h: 48, cx: 14, cy: 13, burnerY: 28, basketY: 38 };

export function balloonSprite() {
  return memo('balloon', () => {
    const m = pixmap(BALLOON.w, BALLOON.basketY + 1), cx = 13.5, cy = 13, R = 13;
    const stripes = ['#e8742a', '#f8ead2', '#e8742a', '#d8263a', '#e8742a', '#f8ead2', '#e8742a'];
    for (let y = 0; y < 26; y++) for (let x = 0; x < 28; x++) {
      const dx = x - cx, dy = y - cy;
      // Envoltura: círculo arriba que se estrecha hacia la boca del globo.
      const halfW = y <= cy ? Math.sqrt(Math.max(0, R * R - dy * dy)) + 0.4 : R * (1 - ((y - cy) / 13.5) ** 1.7) + 2.5;
      if (Math.abs(dx) > halfW) continue;
      const u = (dx / Math.max(1, halfW) + 1) / 2;
      let col = stripes[Math.min(stripes.length - 1, Math.floor(u * stripes.length))];
      const light = u > 0.6 && dy < 3 ? 0.25 : 0, dark = u < 0.22 ? 0.25 : y > 19 ? 0.2 : 0;
      if (light && bayer(x, y) < 0.7) col = mix(col, '#ffffff', light);
      if (dark && bayer(x, y) < 0.8) col = mix(col, '#2a1b17', dark);
      m.set(x, y, col);
    }
    m.set(18, 4, '#ffffff'); m.set(19, 5, '#ffffff'); m.set(18, 5, '#fff2e0'); m.set(19, 4, '#fff2e0');
    m.span(25, 10, 17, '#7a4a2a'); m.span(26, 11, 16, '#5a3a22');
    // Cuerdas hasta las esquinas de la cesta.
    for (let y = 27; y <= BALLOON.basketY; y++) {
      const f = (y - 27) / (BALLOON.basketY - 27);
      m.set(Math.round(10 - f * 3), y, '#5a3a22'); m.set(Math.round(17 + f * 3), y, '#5a3a22');
    }
    m.rect(12, 27, 4, 2, '#6a6a6a'); m.span(27, 12, 15, '#9a9a9a');
    return bake(m);
  });
}

export function basketSprite() {
  return memo('basket', () => {
    const m = pixmap(16, 10);
    m.rect(1, 0, 14, 9, '#a8743f');
    m.span(0, 0, 15, '#7a4f28'); m.span(1, 0, 15, '#c08a52');
    for (let y = 2; y < 9; y++) for (let x = 1; x < 15; x++) if ((x + y * 2) % 4 === 0) m.set(x, y, '#8a5a2f');
    for (let y = 2; y < 9; y++) m.set(14, y, '#8a5a2f');
    m.span(9, 2, 13, '#6a4422');
    return bake(m);
  });
}

// Llama del quemador: 0 (apagado) … 1 (máxima). Dibujo directo, parpadeo ligero.
export function drawFlame(ctx, x, y, strength, t) {
  if (strength < 0.08) return;
  const h = Math.round(2 + strength * 9 + Math.sin(t * 30) * 0.8);
  const w = strength > 0.6 ? 3 : 2;
  const px = (dx, dy, c) => { ctx.fillStyle = c; ctx.fillRect(snap(x) + dx, snap(y) - dy, 1, 1); };
  for (let i = 0; i < h; i++) {
    const ww = Math.max(0, Math.round(w * (1 - i / h)));
    for (let dx = -ww; dx <= ww; dx++) px(dx, i, i < h * 0.35 ? '#fff4b0' : i < h * 0.7 ? '#ffb43a' : '#ff6a2a');
  }
  if (strength > 0.5) { ctx.fillStyle = 'rgba(255,190,90,0.25)'; ctx.fillRect(snap(x) - 6, snap(y) - h - 3, 13, h + 4); }
}

// Ciprés columnar desde el suelo hasta `height` px (ancho 20). Versión lisa: dos tonos,
// sin tramados, para que se lea de un vistazo.
export function cypressSprite(height, s, id) {
  return memo(`cyp${s.index}-${height}`, () => {
    const W = 20, H = Math.max(10, height), m = pixmap(W, H);
    m.rect(9, H - 6, 3, 6, s.trunk);
    for (let y = 0; y < H - 4; y++) {
      const half = Math.round((W / 2 - 1) * Math.sqrt(Math.min(1, y / 10)));
      for (let x = 10 - half; x < 10 + half; x++) m.set(x, y, x >= 10 + half * 0.25 ? s.pineLight : s.pine);
    }
    if (s.snow) for (let y = 0; y < 3; y++) { const half = Math.round(9 * Math.sqrt(Math.min(1, y / 10))); m.span(y, 10 - half, 9 + half, s.snow); }
    return bake(m, { outline: mix(s.pine, '#14201a', 0.55) });
  });
}

// Nube colgando desde arriba hasta `height` px: bordes abultados, panza con tres
// lóbulos, luz arriba a la izquierda y sombra abajo. Contorno del propio color.
export function stormCloudSprite(height, s, id) {
  return memo(`cloud${s.index}-${height}`, () => {
    const W = 32, H = Math.max(14, height), m = pixmap(W, H);
    const base = mix('#d5dce4', s.sky[2], 0.2), light = mix(base, '#ffffff', 0.55), shade = mix(base, '#6f7c8c', 0.35), deep = mix(base, '#6f7c8c', 0.55);
    const lobes = [[8, H - 7, 7], [16, H - 5, 8], [24, H - 7, 7]];
    const inside = (x, y) => {
      if (x < 0 || x >= W || y < 0) return false;
      if (y < H - 9) { const bump = 1.6 * Math.abs(Math.sin((y + 3) * 0.32)); return x >= 3 - bump && x < W - 3 + bump; }
      return lobes.some(([cx, cy, r]) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r) || (y < H - 7 && x >= 3 && x < W - 3);
    };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!inside(x, y)) continue;
      let col = base;
      if (!inside(x, y + 2)) col = deep;
      else if (!inside(x, y + 4)) col = shade;
      else if (!inside(x - 2, y) || !inside(x - 1, y - 3)) col = light;
      else if (x > W * 0.68) col = mix(base, shade, 0.5);
      m.set(x, y, col);
    }
    return bake(m, { outline: mix(deep, '#3a4350', 0.45) });
  });
}

export function fistHandSprite() {
  return memo('fist', () => {
    const rows = ['...........', '...........', '...####....', '..#######..', '.#########.', '.#########.', '##########.', '.#########.', '..########.', '..#######..', '...######..', '...######..'];
    const m = pixmap(11, 12);
    rows.forEach((r, y) => [...r].forEach((c, x) => { if (c === '#') m.set(x, y, x > 7 || y > 9 ? '#d9b23b' : '#ffd84a'); }));
    for (const x of [3, 5, 7]) m.set(x, 4, '#d9b23b');
    return bake(m);
  });
}
