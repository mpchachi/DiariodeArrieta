// Objetos pixel del bosque: tronco, baya, madriguera, iconos y fuente del HUD.

import { pixmap, bake, INK } from './sprite.js';
import { mix, hash } from './util.js';

const cache = new Map();
const memo = (key, fn) => { if (!cache.has(key)) cache.set(key, fn()); return cache.get(key); };

// Tronco caído 14×10 (misma caja que la colisión), con nieve/musgo según estación.
export function logSprite(s) {
  return memo(`log${s.index}`, () => {
    const m = pixmap(14, 12), y0 = 2;
    const bark = '#7d5232', barkL = '#9a6a43', barkD = '#5c3a22';
    m.rect(0, y0, 14, 10, bark);
    m.span(y0, 1, 13, barkL); m.span(y0 + 1, 3, 12, barkL);
    m.span(y0 + 9, 0, 13, barkD); m.span(y0 + 8, 4, 13, barkD);
    for (const [x, y, w] of [[5, 4, 4], [9, 6, 3], [6, 7, 2], [10, 3, 2]]) m.span(y0 + y - 1, x, x + w - 1, barkD);
    // Corte del tronco con anillos.
    m.rect(0, y0, 4, 10, '#e2b77e');
    m.span(y0, 1, 2, '#f0cf9a');
    m.rect(1, y0 + 2, 2, 6, '#c08d58'); m.rect(1, y0 + 4, 2, 2, '#e2b77e'); m.set(1, y0 + 4, '#8a5a32');
    if (s.snow) {
      m.span(y0 - 1, 0, 13, s.snow); m.span(y0, 0, 13, s.snow); m.span(y0 - 2, 2, 11, s.snow);
      m.set(3, y0 + 1, s.snow); m.set(9, y0 + 1, s.snowShade); m.set(12, y0 + 1, s.snow);
    } else if (s.index >= 2) {
      const moss = s.grass, mossD = s.grassDark;
      for (let x = 5; x < 13; x++) if (hash(x * 3.1) < 0.6) m.set(x, y0, x % 3 ? moss : mossD);
      m.set(8, y0 - 1, moss); m.set(9, y0 - 2, s.index === 3 ? '#ffd84a' : '#ffffff'); m.set(9, y0 - 1, mossD);
    } else {
      m.set(7, y0, s.snow); m.set(8, y0, s.snow); m.set(11, y0, s.snowShade);
    }
    const c = bake(m); c.top = y0;
    return c;
  });
}

export function berrySprite() {
  return memo('berry', () => {
    const m = pixmap(7, 9);
    m.disc(3, 5, 3, '#d8263a');
    m.span(8, 2, 4, '#a3172a'); m.set(5, 7, '#a3172a'); m.set(1, 7, '#a3172a');
    m.set(2, 4, '#ff9aa6'); m.set(2, 3, '#ffd0d6');
    m.set(3, 1, '#3f7a3a'); m.set(3, 2, '#3f7a3a'); m.set(4, 0, '#5fb553'); m.set(5, 0, '#5fb553'); m.set(5, 1, '#3f7a3a');
    return bake(m);
  });
}

// Madriguera: montículo de tierra con entrada, raíces y cubierta de la estación (64×30).
export function denSprite(s) {
  return memo(`den${s.index}`, () => {
    const W = 64, H = 30, m = pixmap(W, H), cx = 32;
    const dirt = '#8a6a4a', dirtL = '#a3815c', dirtD = '#6b4f36';
    for (let y = 0; y < H; y++) {
      const half = Math.round(Math.sqrt(Math.max(0, 1 - ((H - 1 - y) / (H - 1)) ** 2)) * 31);
      for (let x = cx - half; x <= cx + half; x++) {
        const rx = (x - cx) / 31;
        let col = rx > 0.25 ? dirtL : rx < -0.45 ? dirtD : dirt;
        if (hash(x * 3.3 + y * 7.1) < 0.08) col = dirtD;
        m.set(x, y, col);
      }
      if (y < 7) {
        const top = s.snow || s.grass, topD = s.snowShade || s.grassDark;
        for (let x = cx - half; x <= cx + half; x++) if (y < 4 || hash(x + y * 9) < 0.5) m.set(x, y, (x - cx) < -8 ? topD : top);
      }
    }
    // Entrada.
    for (let y = 0; y < 13; y++) {
      const half = Math.round(Math.sqrt(Math.max(0, 1 - (y / 12) ** 2)) * 9);
      for (let x = cx + 4 - half; x <= cx + 4 + half; x++) m.set(x, H - 1 - y, y > 9 ? '#3b2618' : '#1a100b');
    }
    for (let x = cx - 6; x <= cx + 14; x++) if (hash(x) < 0.5) m.set(x, H - 13, '#5a3d27');
    // Raíces y piedras.
    for (const [x, y] of [[10, 16], [11, 17], [12, 17], [50, 14], [51, 15], [52, 15], [53, 16]]) m.set(x, y, '#5a3d27');
    for (const [x, y] of [[18, 24], [46, 22]]) { m.rect(x, y, 3, 2, '#9a9da3'); m.set(x, y, '#c4c6ca'); }
    if (s.flowers) for (let i = 0; i < 5; i++) { const x = 16 + i * 8, c = s.flowers[i % s.flowers.length]; m.set(x, 0, c); m.set(x - 1, 1, c); m.set(x + 1, 1, c); m.set(x, 1, '#ffd84a'); }
    return bake(m);
  });
}

// Fuente 5×7 para números del HUD.
const GLYPHS = {
  0: ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'], 1: ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  2: ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'], 3: ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  4: ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'], 5: ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  6: ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'], 7: ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  8: ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'], 9: ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
};
export function glyph(ch, color = '#ffffff') {
  return memo(`g${ch}${color}`, () => {
    const rows = GLYPHS[ch]; if (!rows) return null;
    const m = pixmap(5, 7);
    rows.forEach((r, y) => [...r].forEach((c, x) => { if (c === '#') m.set(x, y, y > 4 ? mix(color, '#000000', 0.15) : color); }));
    return bake(m);
  });
}

const HAND_OPEN = ['...#.#.#...', '...#.#.#.#.', '...#.#.#.#.', '...#.#.#.#.', '...#######.', '#..#######.', '##.#######.', '.#########.', '..########.', '..#######..', '...######..', '...######..'];
const HAND_PINCH = ['.....#.#.#.', '.....#.#.#.', '..##.#.#.#.', '.#..##.#.#.', '.#..######.', '..##.#####.', '...#######.', '...#######.', '...######..', '...######..', '...######..', '...######..'];
export function handSprite(status) {
  return memo(`hand${status}`, () => {
    const grid = status === 'pinch' ? HAND_PINCH : HAND_OPEN;
    const fill = status === 'pinch' ? '#ffd84a' : status === 'ready' ? '#ffffff' : '#a7a7a7';
    const shadeC = mix(fill, '#000000', 0.18);
    const m = pixmap(11, 12);
    grid.forEach((r, y) => [...r].forEach((c, x) => { if (c === '#') m.set(x, y, x > 7 || y > 9 ? shadeC : fill); }));
    if (status === 'missing') { m.rect(8, 8, 3, 3, '#d8263a'); m.set(9, 9, '#ffffff'); }
    return bake(m);
  });
}

// Icono pequeño de cabeza de zorro (marcador de progreso) y de madriguera.
export function miniFox() {
  return memo('miniFox', () => {
    const m = pixmap(9, 7), o = '#e8742a', w = '#f8ead2';
    m.set(1, 0, o); m.set(7, 0, o); m.span(1, 1, 7, o); m.span(2, 0, 8, o); m.span(3, 0, 8, o); m.span(4, 1, 7, w); m.span(5, 2, 6, w); m.set(4, 6, '#1d120e');
    m.set(2, 3, '#1d120e'); m.set(6, 3, '#1d120e'); m.set(4, 5, '#1d120e');
    return bake(m);
  });
}
export function miniDen() {
  return memo('miniDen', () => {
    const m = pixmap(9, 6);
    m.span(0, 2, 6, '#6cc04f'); m.span(1, 1, 7, '#8a6a4a'); m.rect(0, 2, 9, 4, '#8a6a4a'); m.rect(3, 3, 3, 3, '#1a100b'); m.span(2, 4, 4, '#1a100b');
    return bake(m);
  });
}

// Panel del HUD (marco de madera claro) de w×h con borde.
export function panel(ctx, x, y, w, h) {
  ctx.fillStyle = INK; ctx.fillRect(x + 1, y, w - 2, h); ctx.fillRect(x, y + 1, w, h - 2);
  ctx.fillStyle = '#fff8ec'; ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
  ctx.fillStyle = '#e8d9bf'; ctx.fillRect(x + 1, y + h - 2, w - 2, 1);
  ctx.fillStyle = 'rgba(42,27,23,0.35)'; ctx.fillRect(x + 2, y + h, w - 2, 1);
}
