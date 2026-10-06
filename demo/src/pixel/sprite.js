// Motor mínimo de pixel art: los sprites se describen como «tramos» de filas
// [fila, x0, x1, clave] sobre una rejilla, se les añade contorno automático y se
// pre-renderizan una vez a un lienzo. Dibujar = un drawImage (rápido y nítido).

export const INK = '#2a1b17';

// Crea un mapa de píxeles vacío y utilidades para pintarlo.
export function pixmap(w, h) {
  const px = Array.from({ length: h }, () => new Array(w).fill(null));
  const set = (x, y, c) => { if (c && y >= 0 && y < h && x >= 0 && x < w) px[y][x] = c; };
  return {
    w, h, px, set,
    span(y, x0, x1, c) { for (let x = x0; x <= x1; x++) set(x, y, c); },
    rect(x, y, rw, rh, c) { for (let j = 0; j < rh; j++) for (let i = 0; i < rw; i++) set(x + i, y + j, c); },
    spans(list, palette) { for (const [y, x0, x1, k] of list) this.span(y, x0, x1, palette[k] ?? k); },
    disc(cx, cy, r, c) {
      for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.6) set(cx + x, cy + y, c);
    },
    get: (x, y) => (y >= 0 && y < h && x >= 0 && x < w ? px[y][x] : null),
  };
}

// Convierte un pixmap en lienzo. `outline`: color del contorno exterior (1 px).
export function bake(map, { outline = INK, pad = 1 } = {}) {
  const c = document.createElement('canvas');
  c.width = map.w + pad * 2; c.height = map.h + pad * 2;
  const g = c.getContext('2d');
  const filled = (x, y) => map.get(x, y) !== null;
  if (outline) {
    g.fillStyle = outline;
    for (let y = -1; y <= map.h; y++) for (let x = -1; x <= map.w; x++) {
      if (!filled(x, y) && (filled(x + 1, y) || filled(x - 1, y) || filled(x, y + 1) || filled(x, y - 1))) g.fillRect(x + pad, y + pad, 1, 1);
    }
  }
  for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
    const col = map.px[y][x];
    if (col) { g.fillStyle = col; g.fillRect(x + pad, y + pad, 1, 1); }
  }
  c.pad = pad;
  return c;
}

// Escala del lienzo visible (píxeles de pantalla por píxel de juego). Las posiciones se
// redondean a 1/escala: el movimiento es suave (sin tirones de píxel entero) y el
// pixel art sigue nítido porque cada píxel del sprite mide exactamente `escala`.
let SCALE = 1;
export function setPixelScale(k) { SCALE = Math.max(1, k); }
export const getPixelScale = () => SCALE;
export const snap = v => Math.round(v * SCALE) / SCALE;

// Dibuja un sprite horneado con su esquina (sin contar el margen) en (x, y).
export function draw(ctx, sprite, x, y, { flip = false } = {}) {
  const p = sprite.pad ?? 0;
  if (!flip) { ctx.drawImage(sprite, snap(x) - p, snap(y) - p); return; }
  ctx.save();
  ctx.translate(snap(x) + sprite.width - p, snap(y) - p);
  ctx.scale(-1, 1);
  ctx.drawImage(sprite, 0, 0);
  ctx.restore();
}

export { BAYER4, mix, hash } from './util.js';
import { mix as mixColor } from './util.js';
export const shade = (hex, f) => mixColor(hex, f > 0 ? '#ffffff' : '#000000', Math.abs(f));
