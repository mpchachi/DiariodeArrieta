// Sprites de la pesca: zorro sentado con caña, corcho, peces, muelle y cubo.

import { pixmap, bake, INK } from './sprite.js';
import { FOX_PALETTE as P } from './fox.js';
import { mix, hash } from './util.js';

const cache = new Map();
const memo = (key, fn) => { if (!cache.has(key)) cache.set(key, fn()); return cache.get(key); };

function paint(m, rows, dx = 0, dy = 0) {
  rows.forEach((segs, y) => segs.forEach(([x0, str]) => [...str].forEach((ch, i) => { if (ch !== '.') m.set(x0 + i + dx, y + dy, P[ch]); })));
}

// Cabeza del zorro de perfil (misma que el corredor), 13 de ancho.
const HEAD = [
  [[2, 'k'], [6, 'k']],
  [[1, 'dd'], [5, 'oo']],
  [[1, 'dDd'], [5, 'oddo']],
  [[0, 'dDDd'], [5, 'oddoo']],
  [[1, 'olllooooo']],
  [[0, 'oolllokooooo']],
  [[0, 'oooooooooook']],
  [[0, 'owwwwwwwwww']],
  [[1, 'wwwwwgg']],
  [[2, 'wgg']],
];

// Zorro sentado de perfil sujetando la caña (24×23). Pivote de la caña: (19, 14).
export const FOX_SIT = { w: 24, h: 23, pivotX: 19, pivotY: 14 };
export function foxSitSprite({ blink = false, happy = false } = {}) {
  return memo(`sit${blink}${happy}`, () => {
    const m = pixmap(FOX_SIT.w, FOX_SIT.h);
    // Cola enroscada sobre el muelle.
    paint(m, [[], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [[0, 'ww'], [2, 'ooo']], [[0, 'wwgoood']], [[1, 'oooooddd']], [[3, 'dddddd']]], 0, 1);
    // Cuerpo sentado.
    paint(m, [
      [], [], [], [], [], [], [], [], [], [[7, 'oooo']],
      [[6, 'ooooooo'], [12, 'wwww']],
      [[5, 'olloooo'], [12, 'wwwww']],
      [[5, 'olllooo'], [12, 'wwwww']],
      [[4, 'oooooooo'], [12, 'wwww']],
      [[4, 'ooooooooo'], [13, 'www']],
      [[4, 'oooooooooo'], [14, 'ww']],
      [[4, 'odooooooooo']],
      [[4, 'ddoooooooooo']],
      [[5, 'dddddddddd']],
      [[6, 'ddddddd'], [13, 'kkkk']],
      [[13, 'kkkkk']],
    ]);
    // Brazos hacia delante sujetando la caña.
    paint(m, [[], [], [], [], [], [], [], [], [], [], [], [], [[13, 'oo']], [[14, 'ooo']], [[15, 'oooo'], [19, 'kk']], [[17, 'oo'], [19, 'kk']]]);
    paint(m, HEAD, 9, 0);
    if (blink) { m.set(16, 5, P.o); m.set(15, 6, P.k); m.set(16, 6, P.k); }
    if (happy) { m.set(15, 5, P.k); m.set(16, 4, P.k); m.set(17, 5, P.k); m.set(16, 5, P.o); }
    return bake(m);
  });
}

export function bobberSprite() {
  return memo('bobber', () => {
    const m = pixmap(4, 7);
    m.rect(1, 0, 2, 1, '#3a2a25');
    m.rect(0, 1, 4, 2, '#f8f4ec'); m.set(0, 1, '#ffffff');
    m.rect(0, 3, 4, 2, '#d8263a'); m.set(3, 4, '#a3172a');
    m.rect(1, 5, 2, 2, '#d8263a');
    return bake(m);
  });
}

// Peces de perfil mirando a la izquierda (hacia el muelle).
const SPECIES = {
  small: { len: 12, h: 6, body: '#b9b34a', belly: '#f0e7a8', fin: '#e8742a', mark: 'stripes', markC: '#5d6a2a' },
  medium: { len: 16, h: 7, body: '#8a9a6a', belly: '#e9e4cf', fin: '#c98a6a', mark: 'trout', markC: '#e98aa0' },
  big: { len: 22, h: 9, body: '#9fb3c4', belly: '#f4f1ea', fin: '#7d8fa0', mark: 'salmon', markC: '#e88a7a' },
};
export function fishSprite(kind) {
  return memo(`fish${kind}`, () => {
    const s = SPECIES[kind], W = s.len + 5, H = s.h + 3, m = pixmap(W, H);
    const cx = s.len / 2, cy = H / 2, rx = s.len / 2, ry = s.h / 2;
    for (let y = 0; y < H; y++) for (let x = 0; x < s.len; x++) {
      const dx = (x - cx + 0.5) / rx, dy = (y - cy + 0.5) / ry;
      if (dx * dx + dy * dy > 1) continue;
      let col = dy > 0.25 ? s.belly : s.body;
      if (dy < -0.55) col = mix(s.body, '#000000', 0.18);
      if (s.mark === 'stripes' && dy < 0.3 && Math.floor(x / 3) % 2 === 1 && x > 3) col = s.markC;
      if (s.mark === 'trout' && Math.abs(dy) < 0.18 && x > 3) col = s.markC;
      if (s.mark === 'trout' && dy < -0.1 && hash(x * 3 + y * 7) < 0.25) col = '#3a3a2a';
      if (s.mark === 'salmon' && Math.abs(dy - 0.05) < 0.16 && x > 4) col = s.markC;
      m.set(x, y, col);
    }
    // Cola en horquilla (a la derecha) y aletas.
    const tx = s.len - 1, c0 = Math.round(cy);
    for (let i = 0; i < 5; i++) {
      const top = c0 - 1 - Math.floor(i * 0.7), bot = c0 + Math.floor(i * 0.7);
      for (let y = top; y <= bot; y++) if (!(i >= 3 && y >= c0 - 1 && y <= c0)) m.set(tx + i, y, y < c0 ? s.fin : mix(s.fin, '#000000', 0.15));
    }
    for (let i = 0; i < 3; i++) m.set(Math.round(cx) + i - 1, 0, s.fin);
    m.set(Math.round(cx), H - 1, s.fin);
    // Ojo y boca.
    m.set(2, Math.round(cy) - 1, INK); m.set(2, Math.round(cy) - 2, '#ffffff'); m.set(0, Math.round(cy), mix(s.body, '#000000', 0.4));
    return bake(m);
  });
}

// Silueta oscura bajo el agua (se acerca al corcho).
export function fishShadow(kind) {
  return memo(`shadow${kind}`, () => {
    const s = SPECIES[kind], m = pixmap(s.len + 4, s.h);
    for (let y = 0; y < s.h; y++) for (let x = 0; x < s.len + 4; x++) {
      const dx = (x - s.len / 2) / (s.len / 2), dy = (y - s.h / 2 + 0.5) / (s.h / 2);
      if (dx * dx + dy * dy <= 1 || (x >= s.len - 1 && Math.abs(dy) < (x - s.len + 2) / 4)) m.set(x, y, '#1d3340');
    }
    return bake(m, { outline: null });
  });
}

// Muelle de madera de `w` px de largo (tablas arriba, postes al agua).
export function dockSprite(w) {
  return memo(`dock${w}`, () => {
    const m = pixmap(w, 34), wood = '#a0703f', woodL = '#c08a52', woodD = '#7a4f28', post = '#6a4422';
    for (let x = 6; x < w; x += 24) { m.rect(x, 5, 4, 29, post); m.rect(x + 3, 5, 1, 29, '#4f3219'); }
    m.rect(0, 0, w, 5, wood); m.span(0, 0, w - 1, woodL); m.span(4, 0, w - 1, woodD);
    for (let x = 8; x < w; x += 9) { m.set(x, 1, woodD); m.set(x, 2, woodD); m.set(x, 3, woodD); m.set(x - 2, 2, '#5a3a22'); }
    m.rect(w - 2, 0, 2, 5, woodD);
    return bake(m);
  });
}

export function bucketSprite(count) {
  return memo(`bucket${Math.min(count, 3)}`, () => {
    const m = pixmap(12, 13), wood = '#8a5a2f', woodL = '#b07a45', band = '#9aa0a6';
    if (count > 0) { m.rect(3, 0, 2, 4, '#b9b34a'); m.set(2, 0, '#e8742a'); m.set(5, 0, '#e8742a'); }
    if (count > 1) { m.rect(6, 1, 2, 3, '#9fb3c4'); m.set(5, 1, '#7d8fa0'); m.set(8, 1, '#7d8fa0'); }
    if (count > 2) { m.rect(8, 0, 2, 4, '#8a9a6a'); m.set(10, 0, '#c98a6a'); }
    for (let y = 3; y < 13; y++) { const inset = Math.floor((y - 3) / 5); m.span(y, inset, 11 - inset, y % 4 === 0 ? woodL : wood); }
    m.span(5, 0, 11, band); m.span(10, 1, 10, band); m.span(3, 0, 11, '#5a3a22');
    return bake(m);
  });
}
