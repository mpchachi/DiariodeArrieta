// Sprites del zorro (34×21, de perfil mirando a la derecha, patas en la fila 20).
// Rasgos de zorro: hocico largo y fino con nariz negra, orejas grandes con punta
// negra, mejilla/garganta/pecho blancos, patas negras finas y cola tupida con punta blanca.
// Se describen por filas: [columna inicial, caracteres] (sin contar puntos a mano).

import { pixmap, bake } from './sprite.js';

export const FOX_PALETTE = {
  o: '#e8742a', l: '#f6a25a', d: '#b5501f', D: '#8f3c17', w: '#fbf1e1', g: '#e3d3bd',
  k: '#1d120e', h: '#ffffff',
};

const BODY = [
  [[24, 'k'], [28, 'k']],
  [[23, 'dd'], [27, 'oo']],
  [[23, 'dDd'], [27, 'oddo']],
  [[2, 'www'], [22, 'dDDd'], [27, 'oddoo']],
  [[1, 'wwwwo'], [23, 'olllooooo']],
  [[0, 'wwwwooo'], [22, 'oolllokooooo']],
  [[0, 'wwgooooood'], [12, 'olllllllo'], [22, 'oooooooooook']],
  [[1, 'wgooooood'], [10, 'oooooooooooo'], [22, 'owwwwwwwwww']],
  [[2, 'odoooooo'], [10, 'oooooooooooww'], [23, 'wwwwwgg']],
  [[3, 'ddooooo'], [10, 'ooooooooooowww'], [24, 'wgg']],
  [[5, 'dddd'], [9, 'doooooooooooww']],
  [[10, 'ddwwwwwwwwwd']],
  [[11, 'ddddddddddd']],
];

// Patas: [x base, superior, inferior]. Lejanas primero (más oscuras).
const LEGS = [[11, 'D'], [19, 'D'], [13, 'd'], [21, 'd']];
const POSES = {
  run0: [[-3, 0], [2, 1], [1, 1], [4, 0]],
  run1: [[-1, 1], [0, 0], [0, 0], [2, 1]],
  run2: [[1, 1], [-1, 0], [-2, 0], [1, 1]],
  run3: [[0, 0], [1, 1], [-1, 1], [0, 0]],
  jump: [[-4, 2], [3, 2], [-3, 1], [4, 1]],
  fall: [[-1, 0], [1, 0], [0, 0], [2, 0]],
  stand: [[0, 0], [0, 0], [0, 0], [0, 0]],
};

function paint(m, rows, dy = 0, dx = 0) {
  rows.forEach((segs, y) => segs.forEach(([x0, str]) => [...str].forEach((ch, i) => {
    if (ch !== '.') m.set(x0 + i + dx, y + dy, FOX_PALETTE[ch]);
  })));
}

function legs(m, pose) {
  // Patas naranjas con «calcetín» negro abajo, como los zorros reales.
  LEGS.forEach(([bx, upper], i) => {
    const [dx, lift] = POSES[pose][i];
    m.rect(bx, 13, 2, 3, FOX_PALETTE[upper]);
    const mid = Math.sign(dx) * Math.min(1, Math.abs(dx));
    m.rect(bx + mid, 16 - lift, 2, 2, FOX_PALETTE[upper]);
    m.rect(bx + Math.round(dx * 0.7), 18 - lift, 2, 1, FOX_PALETTE.k);
    m.rect(bx + dx, 19 - lift, 2, 2, FOX_PALETTE.k);
  });
}

function foxFrame(pose, { tailDrop = 0, dizzy = false, blink = false } = {}) {
  const m = pixmap(34, 21);
  legs(m, pose);
  // La cola se pinta aparte para poder bajarla un píxel al correr (vaivén suave).
  paint(m, BODY.map(segs => segs.filter(([x]) => x >= 9)));
  paint(m, BODY.map(segs => segs.filter(([x]) => x < 9)), tailDrop);
  if (dizzy) { for (const [x, y] of [[27, 4], [29, 4], [28, 5], [27, 6], [29, 6]]) m.set(x, y, FOX_PALETTE.k); m.set(28, 6, FOX_PALETTE.o); }
  else if (blink) { m.set(28, 5, FOX_PALETTE.o); m.set(27, 6, FOX_PALETTE.k); m.set(28, 6, FOX_PALETTE.k); }
  return bake(m);
}

// Zorro asomado en la cesta del globo (cabeza + pecho + patitas en el borde), 15×14.
function foxPeek({ blink = false } = {}) {
  const m = pixmap(15, 14);
  paint(m, BODY.slice(0, 10).map(segs => segs.filter(([x]) => x >= 21)), 0, -21);
  m.rect(2, 10, 8, 4, FOX_PALETTE.o); m.rect(4, 10, 5, 4, FOX_PALETTE.w);
  m.rect(1, 12, 3, 2, FOX_PALETTE.k); m.rect(8, 12, 3, 2, FOX_PALETTE.k);
  if (blink) { m.set(7, 5, FOX_PALETTE.o); m.set(6, 6, FOX_PALETTE.k); m.set(7, 6, FOX_PALETTE.k); }
  return bake(m);
}

// Cola que asoma por detrás de la cesta (9×8).
function foxTail() {
  const m = pixmap(9, 8);
  paint(m, [
    [[1, 'ww']], [[0, 'wwgo']], [[0, 'wgooo']], [[1, 'oooood']],
    [[2, 'ooooodd']], [[3, 'dooood']], [[5, 'dddd']], [],
  ]);
  return bake(m);
}

let cache = null;
export function foxSprites() {
  if (cache) return cache;
  cache = {
    run: ['run0', 'run1', 'run2', 'run3'].map((p, i) => foxFrame(p, { tailDrop: i % 2 })),
    jump: foxFrame('jump'),
    fall: foxFrame('fall', { tailDrop: 1 }),
    stand: foxFrame('stand'),
    blink: foxFrame('stand', { blink: true }),
    dizzy: foxFrame('fall', { tailDrop: 1, dizzy: true }),
    head: foxPeek(), headBlink: foxPeek({ blink: true }), tail: foxTail(),
  };
  return cache;
}

// Ancla: columna 16 del sprite = x del zorro; fila 21 = suelo.
export const FOX_ANCHOR = { x: 16, y: 21 };
