// Sprites del huerto: regadera (con rotaciones píxel a píxel, sin difuminar), tierra,
// plantas por fases y cinco flores (tulipán, margarita, girasol, lavanda, rosa).

import { pixmap, bake, INK } from './sprite.js';
import { mix } from './util.js';

const cache = new Map();
const memo = (key, fn) => { if (!cache.has(key)) cache.set(key, fn()); return cache.get(key); };

// --- Regadera con asa trasera (como se coge de verdad). Se dibuja con formas para
// cada ángulo y se «pixela» con la paleta exacta (sin antialiasing): queda limpia en
// cualquier inclinación. Pivote = asa trasera (lo que sujetan las patas). ---
const CAN = { body: '#5f9e8f', light: '#8fcab9', shine: '#c8eadf', dark: '#3f7468', deep: '#2c5a50', rim: '#a9dccd', rose: '#d4ad52', roseDark: '#94742f', hole: '#5e4a1f' };
const CAN_COLORS = Object.values(CAN).map(c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16), c]);
export const CAN_SPOUT = { x: 24, y: -9 }; // relativo al asa, sin girar
const CAN_SCALE = 0.82; // proporción respecto al zorro

// Regadera de 16×14 con asa trasera, boca abierta, franja de brillo, remaches, pitorro
// largo y alcachofa con agujeros. Coordenadas relativas al asa (pivote).
function drawCan(g) {
  g.lineCap = 'round';
  g.strokeStyle = CAN.deep; g.lineWidth = 2.4; g.beginPath(); g.arc(2, -0.5, 4.2, Math.PI * 0.5, Math.PI * 1.5); g.stroke();
  g.strokeStyle = CAN.dark; g.lineWidth = 1.2; g.beginPath(); g.arc(2, -0.5, 4.2, Math.PI * 0.6, Math.PI * 1.4); g.stroke();
  // Pitorro (detrás del cuerpo).
  g.strokeStyle = CAN.dark; g.lineWidth = 3; g.beginPath(); g.moveTo(14, 4); g.lineTo(22.5, -6.5); g.stroke();
  g.strokeStyle = CAN.body; g.lineWidth = 1.4; g.beginPath(); g.moveTo(14, 3); g.lineTo(22, -7); g.stroke();
  // Cuerpo.
  g.fillStyle = CAN.body; g.fillRect(1, -7, 15, 14);
  g.fillStyle = CAN.light; g.fillRect(3, -6, 3, 12);
  g.fillStyle = CAN.shine; g.fillRect(4, -5, 1, 9);
  g.fillStyle = CAN.dark; g.fillRect(12, -6, 4, 13);
  g.fillStyle = CAN.deep; g.fillRect(15, -6, 1, 13); g.fillRect(1, 6, 15, 1);
  // Boca y borde.
  g.fillStyle = CAN.rim; g.fillRect(0, -8, 17, 2);
  g.fillStyle = CAN.deep; g.fillRect(2, -8, 13, 1);
  // Banda y remaches.
  g.fillStyle = CAN.dark; g.fillRect(1, 2, 15, 1);
  g.fillStyle = CAN.shine; for (const x of [3, 8, 13]) g.fillRect(x, 2, 1, 1);
  // Alcachofa con agujeros.
  g.save(); g.translate(23.2, -7.6); g.rotate(-Math.PI / 4);
  g.fillStyle = CAN.roseDark; g.fillRect(-2.6, -1.4, 5.2, 3.6);
  g.fillStyle = CAN.rose; g.fillRect(-2.6, -1.4, 5.2, 2.2);
  g.fillStyle = CAN.hole; g.fillRect(-1.6, 1.6, 1, 1); g.fillRect(0.6, 1.6, 1, 1);
  g.restore();
}

export function canSprite(deg) {
  const step = Math.max(-24, Math.min(100, Math.round(deg / 4) * 4)); // negativo = hacia atrás
  return memo(`can${step}`, () => {
    const S = 64, P = 32, c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d'), a = step * Math.PI / 180;
    g.translate(P, P); g.rotate(a); g.scale(CAN_SCALE, CAN_SCALE); drawCan(g);
    const d = g.getImageData(0, 0, S, S).data, m = pixmap(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      if (d[i + 3] < 128) continue;
      let best = null, bd = Infinity; // color más cercano de la paleta
      for (const [r, gg, b, hex] of CAN_COLORS) { const dd = (d[i] - r) ** 2 + (d[i + 1] - gg) ** 2 + (d[i + 2] - b) ** 2; if (dd < bd) { bd = dd; best = hex; } }
      m.set(x, y, best);
    }
    const ox = CAN_SPOUT.x * CAN_SCALE, oy = CAN_SPOUT.y * CAN_SCALE;
    const sx = ox * Math.cos(a) - oy * Math.sin(a), sy = ox * Math.sin(a) + oy * Math.cos(a);
    return { img: bake(m), pivot: { x: P + 1, y: P + 1 }, spout: { x: P + 1 + sx, y: P + 1 + sy } };
  });
}

// --- Tocón donde se sienta el zorro (18×21) ---
export function stumpSprite(s) {
  return memo(`stump${s.index}`, () => {
    const H = 21, m = pixmap(18, H), bark = s.trunk, barkD = mix(s.trunk, '#000000', 0.25), top = mix(s.trunk, '#e8c99a', 0.55), ring = mix(s.trunk, '#e8c99a', 0.25);
    m.rect(1, 2, 16, H - 2, bark);
    m.rect(1, 3, 2, H - 4, mix(s.trunk, '#ffffff', 0.12));
    for (const x of [5, 9, 13]) for (let y = 4; y < H - 1; y++) if ((x + y) % 4) m.set(x, y, barkD);
    m.rect(0, H - 1, 18, 1, barkD); m.set(0, H - 2, bark); m.set(17, H - 2, barkD);
    m.span(0, 3, 14, top); m.span(1, 1, 16, top); m.span(2, 1, 16, ring);
    m.span(1, 6, 11, ring); m.set(8, 1, barkD); m.set(9, 1, barkD);
    if (s.snow) { m.span(0, 3, 14, s.snow); m.span(1, 2, 15, s.snow); }
    return bake(m);
  });
}

// --- Tierra removida (12×4) ---
export function soilSprite(s) {
  return memo(`soil${s.index}`, () => {
    const m = pixmap(14, 4), d = mix(s.dirt, '#000000', 0.15), l = mix(s.dirt, '#ffffff', 0.15);
    m.span(0, 4, 9, l); m.span(1, 2, 11, s.dirt); m.span(2, 1, 12, s.dirt); m.span(3, 0, 13, d);
    m.set(5, 1, d); m.set(9, 2, l);
    return bake(m);
  });
}

// --- Flores ---
const FLOWERS = {
  tulip: { name: 'tulipán', c: '#e0433a', l: '#ff7d6b', d: '#a82a24' },
  daisy: { name: 'margarita', c: '#f7f4ee', l: '#ffffff', d: '#d9d2c4', eye: '#f2b636' },
  sunflower: { name: 'girasol', c: '#f4c430', l: '#ffe070', d: '#c9921a', eye: '#6b4426' },
  lavender: { name: 'lavanda', c: '#9a7fd1', l: '#c2acf0', d: '#6e56a8' },
  rose: { name: 'rosa', c: '#e86a9a', l: '#ff9cc0', d: '#b54672' },
};
export const flowerName = kind => FLOWERS[kind]?.name ?? 'flor';

const STEM = '#4f9a4a', STEM_D = '#3a7a37', LEAF = '#6cbf5a', LEAF_D = '#4f9a4a';

function head(m, kind, cx, top, open) {
  const f = FLOWERS[kind];
  if (!open) { // capullo: verde con la punta del color
    m.rect(cx - 1, top + 2, 3, 3, LEAF_D); m.set(cx, top + 1, f.c); m.set(cx, top + 2, f.c); m.set(cx - 1, top + 2, f.d);
    return;
  }
  if (kind === 'tulip') {
    m.rect(cx - 2, top + 1, 5, 4, f.c); m.set(cx - 2, top, f.c); m.set(cx, top, f.c); m.set(cx + 2, top, f.c);
    m.rect(cx - 1, top + 1, 1, 3, f.l); m.rect(cx + 1, top + 2, 1, 3, f.d); m.span(top + 4, cx - 1, cx + 1, f.d);
  } else if (kind === 'daisy' || kind === 'sunflower') {
    const r = kind === 'sunflower' ? 4 : 3, cy = top + r;
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
      const d = Math.hypot(x, y);
      if (d > r + 0.3) continue;
      m.set(cx + x, cy + y, d <= (kind === 'sunflower' ? 1.8 : 1.2) ? f.eye : (x + y) % 2 === 0 ? f.c : (y < 0 ? f.l : f.d));
    }
    if (kind === 'sunflower') m.set(cx - 1, cy - 1, mix(f.eye, '#ffffff', 0.3));
  } else if (kind === 'lavender') {
    for (let i = 0; i < 7; i++) { const y = top + i, w = i < 2 ? 0 : 1; m.span(y, cx - w, cx + w, i % 2 ? f.c : f.d); if (i % 2 === 0) m.set(cx, y, f.l); }
  } else if (kind === 'rose') {
    m.rect(cx - 2, top + 1, 5, 4, f.c); m.span(top, cx - 1, cx + 1, f.c);
    m.set(cx, top + 2, f.d); m.set(cx + 1, top + 2, f.d); m.set(cx - 1, top + 3, f.d); m.set(cx - 1, top + 1, f.l); m.set(cx + 2, top + 3, f.d);
  }
}

// Planta por fases: 0 nada · 1 brote · 2 tallo · 3 capullo · 4 flor. Ancla: (7, 23) = suelo.
export const PLANT_ANCHOR = { x: 7, y: 23 };
export function plantSprite(kind, stage) {
  return memo(`plant${kind}${stage}`, () => {
    const m = pixmap(15, 24), cx = 7, base = 23;
    if (stage <= 0) return bake(m, { outline: null });
    const h = [0, 3, 8, 12, 13][stage];
    for (let y = 0; y < h; y++) { m.set(cx, base - y, y % 3 === 1 ? STEM_D : STEM); }
    // Hojas (más grandes al crecer).
    const leaf = (y, dir, size) => { for (let i = 1; i <= size; i++) { m.set(cx + dir * i, base - y - Math.floor(i / 2), i === size ? LEAF_D : LEAF); } m.set(cx + dir, base - y + 1, LEAF_D); };
    if (stage === 1) { m.set(cx - 1, base - 3, LEAF); m.set(cx + 1, base - 3, LEAF); m.set(cx - 2, base - 4, LEAF_D); m.set(cx + 2, base - 4, LEAF_D); }
    else { leaf(3, -1, stage >= 3 ? 4 : 3); leaf(5, 1, stage >= 3 ? 4 : 3); if (stage >= 3) leaf(8, -1, 3); }
    if (stage >= 3) head(m, kind, cx, base - h - (kind === 'lavender' ? 5 : kind === 'sunflower' ? 6 : 3), stage === 4);
    return bake(m, { outline: mix(STEM_D, INK, 0.5) });
  });
}

// Icono pequeño de flor para el marcador (7×7).
export function flowerIcon() {
  return memo('icon', () => {
    const m = pixmap(7, 8);
    for (const [x, y] of [[3, 0], [1, 1], [5, 1], [0, 3], [6, 3], [1, 5], [5, 5]]) m.set(x, y, '#e86a9a');
    m.rect(1, 2, 5, 3, '#e86a9a'); m.rect(2, 1, 3, 5, '#e86a9a'); m.rect(2, 2, 3, 3, '#f2b636'); m.set(3, 6, STEM); m.set(3, 7, STEM);
    return bake(m);
  });
}
