// Fondos del bosque pre-renderizados por estación en tiras de 512 px que encajan
// sin costura. Cada capa se desplaza en bloque (enteros) a su velocidad de parallax:
// mucho detalle, cero «ondulación», y dibujar cuesta unos pocos drawImage.

import { BAYER4, mix, hash, mulberry } from './util.js';
import { snap } from './sprite.js';

export const TILE = 512;
const TAU = Math.PI * 2;

function canvas(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  return { c, g, px: (x, y, col) => { if (!col) return; g.fillStyle = col; g.fillRect(((Math.round(x) % w) + w) % w, Math.round(y), 1, 1); } };
}
// Ruido periódico en el ancho de la tira (frecuencias enteras = sin costuras).
const periodic = (x, terms) => terms.reduce((s, [k, a, ph]) => s + a * Math.sin(TAU * k * x / TILE + ph), 0);
const bayer = (x, y) => BAYER4[((y % 4) + 4) % 4][((x % 4) + 4) % 4];

// ---------- Cielo (estático) ----------
function sky(s, groundY) {
  const { c, px } = canvas(TILE, groundY);
  // 16 tonos interpolados y tramado solo entre tonos vecinos: degradado suave.
  const shades = Array.from({ length: 16 }, (_, k) => {
    const f = (k / 15) * (s.sky.length - 1), i = Math.min(s.sky.length - 2, Math.floor(f));
    return mix(s.sky[i], s.sky[i + 1], f - i);
  });
  for (let y = 0; y < groundY; y++) {
    const f = (y / groundY) * 15, i = Math.min(14, Math.floor(f)), t = f - i;
    for (let x = 0; x < TILE; x++) px(x, y, t > bayer(x, y) ? shades[i + 1] : shades[i]);
  }
  return c;
}

function sun(s) {
  const R = s.sunR + 9, size = R * 2 + 1;
  const { c, px } = canvas(size, size);
  for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) {
    const d = Math.hypot(x, y);
    if (d <= s.sunR) px(x + R, y + R, d > s.sunR - 2 && (x + y) > 0 ? mix(s.sun, s.glow, 0.25) : s.sun);
    else if (d <= s.sunR + 3 && bayer(x, y) < 0.55) px(x + R, y + R, mix(s.sun, s.glow, 0.5));
    else if (d <= s.sunR + 8 && bayer(x, y) < 0.22 * (1 - (d - s.sunR - 3) / 5)) px(x + R, y + R, s.glow);
  }
  c.radius = R;
  return c;
}

// ---------- Nubes ----------
function clouds(s, rand) {
  const { c, px } = canvas(TILE, 90);
  for (let n = 0; n < 6; n++) {
    const cx = Math.round(n * TILE / 6 + rand() * 50), cy = 14 + Math.round(rand() * 46), w = 18 + Math.round(rand() * 26);
    const count = 4 + Math.floor(rand() * 3);
    const blobs = Array.from({ length: count }, (_, i) => ({
      x: cx - w / 2 + (i / (count - 1)) * w, y: cy - rand() * 5, r: 5 + rand() * 6 }));
    const inside = (x, y) => blobs.some(b => (x - b.x) ** 2 + ((y - b.y) * 1.25) ** 2 <= b.r * b.r) && y <= cy + 4;
    for (let y = cy - 18; y <= cy + 5; y++) for (let x = cx - w; x <= cx + w; x++) {
      if (!inside(x, y)) continue;
      const below = !inside(x, y + 2), top = !inside(x, y - 2);
      px(x, y, below ? s.cloudShade : top && bayer(x, y) < 0.5 ? '#ffffff' : s.cloud);
    }
  }
  return c;
}

// ---------- Montañas / colinas ----------
function ridge(s, groundY, { base, amp, terms, color, light, dark, cap, capShade, capLine, texture, strata }) {
  const { c, px } = canvas(TILE, groundY);
  const top = x => Math.round(base - amp * periodic(x, terms));
  for (let x = 0; x < TILE; x++) {
    const t0 = top(x), slope = top(x + 3) - top(x - 3);
    for (let y = t0; y < groundY; y++) {
      const d = y - t0;
      let col = color;
      // Luz desde la derecha (sol): laderas que bajan hacia la derecha, iluminadas.
      if (slope > 1 && (d < 3 || bayer(x, y) < 0.8 - d / 7)) col = light;
      if (slope < -1 && (d < 4 || bayer(x, y) < 0.7 - d / 10)) col = dark;
      if (d === 0) col = slope < -1 ? dark : light;
      if (strata && (y + Math.round(periodic(x, [[4, 2, 0.5]]))) % strata === 0 && hash(x * 0.37 + y) < 0.55) col = dark;
      if (texture && hash(x * 7.1 + y * 13.3) < texture) col = hash(x + y * 3) < 0.5 ? dark : light;
      if (cap && y < capLine + Math.round(bayer(x, y) * 5) && d < 22) col = slope < -1 ? capShade : cap;
      px(x, y, col);
    }
  }
  return c;
}

// ---------- Árboles ----------
function pine(px, x0, base, h, s, tint = 0) {
  const pick = (c) => (tint ? mix(c, s.hillDark, tint) : c);
  const tiers = h > 26 ? 4 : 3, tierH = Math.round(h / (tiers + 0.6));
  px(x0, base, pick(s.trunkDark)); px(x0, base - 1, pick(s.trunk)); px(x0 + 1, base, pick(s.trunk)); px(x0 + 1, base - 1, pick(s.trunkDark));
  for (let t = 0; t < tiers; t++) {
    const top = base - h + t * (tierH - 1);
    const maxHalf = Math.round((h * 0.16) + t * h * 0.055);
    for (let r = 0; r <= tierH + 1; r++) {
      const half = Math.max(0, Math.round((r / (tierH + 1)) * maxHalf));
      for (let dx = -half; dx <= half + 1; dx++) {
        const edge = dx === -half || dx === half + 1;
        let col = dx < 0 ? s.pineDark : dx > half * 0.4 ? s.pineLight : s.pine;
        if (r === tierH + 1 && bayer(dx, r) < 0.6) col = s.pineDark;
        if (edge && hash(x0 * 3 + dx + r * 7) < 0.4) continue;
        if (s.snow && (r <= 1 || (r === 2 && bayer(x0 + dx, r) < 0.5))) col = dx < 0 ? s.snowShade : s.snow;
        px(x0 + dx, top + r, pick(col));
      }
    }
  }
}

function broadleaf(px, x0, base, h, s, seed, tint = 0) {
  const pick = (c) => (tint ? mix(c, s.hillDark, tint) : c);
  const trunkH = Math.round(h * 0.45);
  for (let y = 0; y < trunkH; y++) { px(x0, base - y, pick(s.trunkDark)); px(x0 + 1, base - y, pick(s.trunk)); }
  const r0 = Math.round(h * 0.34), cy = base - trunkH - r0 + 3;
  if (!s.crown) {
    // Invierno: ramas desnudas con nieve.
    const branch = (x, y, dx, len, depth) => {
      for (let i = 0; i < len; i++) {
        const bx = x + Math.round(dx * i), by = y - i;
        px(bx, by, pick(s.trunk)); if (s.snow && i % 2 === 0) px(bx, by - 1, s.snow);
      }
      if (depth > 0) { branch(x + Math.round(dx * len), y - len, dx - 0.5, Math.round(len * 0.7), depth - 1); branch(x + Math.round(dx * len), y - len, dx + 0.6, Math.round(len * 0.6), depth - 1); }
    };
    branch(x0, base - trunkH, -0.4, Math.round(h * 0.25), 2);
    branch(x0 + 1, base - trunkH, 0.5, Math.round(h * 0.22), 2);
    return;
  }
  const blobs = Array.from({ length: 6 }, (_, i) => ({
    x: x0 + Math.round((hash(seed + i) - 0.5) * r0 * 1.4), y: cy + Math.round((hash(seed + i * 3) - 0.6) * r0), r: r0 * (0.55 + hash(seed + i * 5) * 0.35) }));
  for (let y = cy - r0 * 2; y <= cy + r0 * 1.5; y++) for (let x = x0 - r0 * 2; x <= x0 + r0 * 2; x++) {
    const b = blobs.find(bb => (x - bb.x) ** 2 + (y - bb.y) ** 2 <= bb.r * bb.r);
    if (!b) continue;
    const lx = (x - b.x) / b.r, ly = (y - b.y) / b.r;
    let col = s.crown;
    if (lx - ly > 0.55) col = s.crownLight;
    if (-lx + ly > 0.6) col = s.crownDark;
    if (s.spots && hash(x * 1.7 + y * 2.9 + seed) < 0.035) col = hash(x + y) < 0.5 ? s.spots : s.spotsLight;
    px(x, y, pick(col));
  }
}

function trees(s, groundY, rand, { count, minH, maxH, tint, seed }) {
  const { c, px } = canvas(TILE, groundY);
  const list = Array.from({ length: count }, (_, i) => ({ x: Math.round(i * TILE / count + rand() * (TILE / count) * 0.8),
    h: Math.round(minH + rand() * (maxH - minH)), kind: rand() < (s.crown ? 0.5 : 0.62) ? 'pine' : 'leaf', seed: seed + i * 17 }));
  list.sort((a, b) => a.h - b.h);
  for (const tr of list) {
    for (const wrap of [0, TILE, -TILE]) {
      const x = tr.x + wrap;
      if (x < -40 || x > TILE + 40) continue;
      if (tr.kind === 'pine') pine(px, x, groundY - 1, tr.h, s, tint); else broadleaf(px, x, groundY - 1, tr.h, s, tr.seed, tint);
    }
  }
  return c;
}

// ---------- Suelo ----------
function ground(s, groundY, height, rand) {
  const H = height - groundY + 6, top = 6; // margen superior para hierba/flores que sobresalen
  const { c, px } = canvas(TILE, H);
  for (let x = 0; x < TILE; x++) {
    for (let y = top; y < H; y++) {
      const d = y - top;
      const lip = 4 + Math.round(1.2 * Math.sin(TAU * 9 * x / TILE) + (hash(x * 0.9) < 0.3 ? 1 : 0));
      let col = d < lip - 1 ? (d === 0 ? s.grassLight : s.grass) : d === lip - 1 ? s.grassDark : s.dirt;
      if (d >= lip) {
        // Tierra con vetas y más oscura en profundidad (tramado).
        const depth = (d - lip) / (H - top - lip);
        if (bayer(x, y) < depth * 0.9) col = mix(s.dirt, s.dirtDark, 0.6);
        const band = Math.floor((d + Math.round(periodic(x, [[3, 1.5, 1], [7, 0.8, 2]]))) / 6) % 3 === 0;
        if (band && hash(x * 0.71 + d) < 0.7) col = mix(col, s.dirtDark, 0.35);
        if (d === lip) col = mix(s.dirt, s.dirtDark, 0.7);
        if (hash(x * 3.7 + y * 11.1) < 0.05) col = s.dirtDark;
        if (hash(x * 5.3 + y * 7.7) < 0.035) col = s.dirtLight;
      }
      if (d > 0 && d < lip - 1 && hash(x * 2.3 + y * 5.1) < 0.12) col = s.grassDark;
      px(x, y, col);
    }
    // Hierbas que sobresalen del borde.
    const tuft = hash(x * 1.31);
    if (tuft < 0.35) { const hgt = 1 + Math.floor(hash(x * 2.7) * 3); for (let i = 1; i <= hgt; i++) px(x, top - i, i === hgt ? s.grassLight : s.grass); }
  }
  // Piedras y raíces.
  for (let n = 0; n < 26; n++) {
    const x = Math.floor(rand() * TILE), y = top + 7 + Math.floor(rand() * (H - top - 10));
    const w = 2 + Math.floor(rand() * 3);
    for (let i = 0; i < w; i++) { px(x + i, y, s.stone); px(x + i, y + 1, mix(s.stone, s.dirtDark, 0.5)); }
    px(x, y, mix(s.stone, '#ffffff', 0.3));
  }
  for (let n = 0; n < 10; n++) {
    let x = Math.floor(rand() * TILE), y = top + 4;
    for (let i = 0; i < 6 + rand() * 6; i++) { px(x, y, s.dirtDark); x += rand() < 0.5 ? 1 : 0; y += 1; }
  }
  // Decoración de estación.
  for (let n = 0; n < 40; n++) {
    const x = Math.floor(rand() * TILE);
    if (s.index === 0) {
      const w = 3 + Math.floor(rand() * 6);
      for (let i = 0; i < w; i++) { px(x + i, top - 1, s.snow); if (i > 0 && i < w - 1) px(x + i, top - 2, s.snow); }
      if (rand() < 0.4) px(x + 1, top, '#ffffff');
    } else if (s.index === 1 && n < 14) {
      const w = 4 + Math.floor(rand() * 8);
      for (let i = 0; i < w; i++) { px(x + i, top, s.snow); px(x + i, top + 1, i % 3 ? s.snow : s.snowShade); if (i > 1 && i < w - 2) px(x + i, top - 1, s.snow); }
    } else if (s.flowers && n < 26) {
      const col = s.flowers[n % s.flowers.length], h = 2 + Math.floor(rand() * 3);
      for (let i = 1; i < h; i++) px(x, top - i, s.grassDark);
      px(x, top - h, col); px(x - 1, top - h, col); px(x + 1, top - h, col); px(x, top - h - 1, col); px(x, top - h + 1, col);
      px(x, top - h, s.index === 3 ? '#8a4a1a' : '#ffd84a');
    }
  }
  c.lip = top;
  return c;
}

export function buildLayers(s, { groundY = 150, height = 180 } = {}) {
  const rand = mulberry(9000 + s.index * 101);
  return {
    sky: sky(s, groundY), sun: sun(s), sunY: s.sunY, clouds: clouds(s, rand),
    farBack: ridge(s, groundY, { base: 92, amp: 34, terms: [[2, 0.5, 2.6], [3, 0.35, 0.9], [7, 0.12, 1.4]],
      color: mix(s.far, s.sky[3], 0.45), light: mix(s.farLight, s.sky[3], 0.45), dark: mix(s.farDark, s.sky[3], 0.45),
      cap: s.cap && mix(s.cap, s.sky[3], 0.3), capShade: s.capShade && mix(s.capShade, s.sky[3], 0.3), capLine: 70 }),
    far: ridge(s, groundY, { base: 108, amp: 32, terms: [[1, 0.55, 0.3], [3, 0.3, 1.7], [5, 0.12, 0.4], [11, 0.05, 2.2]],
      color: s.far, light: s.farLight, dark: s.farDark, cap: s.cap, capShade: s.capShade, capLine: 88 }),
    hills: ridge(s, groundY, { base: 124, amp: 12, terms: [[2, 0.6, 2.1], [3, 0.3, 0.2], [9, 0.1, 1.1]],
      color: s.hill, light: s.hillLight, dark: s.hillDark, cap: s.hillCap, capShade: s.hillCap, capLine: 116 }),
    treesBack: trees(s, groundY, rand, { count: 26, minH: 16, maxH: 26, tint: 0.4, seed: 11 }),
    trees: trees(s, groundY, rand, { count: 15, minH: 26, maxH: 44, tint: 0, seed: 97 }),
    ground: ground(s, groundY, height, rand),
  };
}

// Dibuja todas las capas. `scroll` en px del mundo; velocidades de parallax suaves.
export function drawLayers(ctx, L, { width, groundY }, scroll, sunX) {
  const blit = (img, f, y = 0) => {
    const off = snap((((scroll * f) % TILE) + TILE) % TILE);
    ctx.drawImage(img, -off, y);
    if (TILE - off < width) ctx.drawImage(img, TILE - off, y);
  };
  ctx.drawImage(L.sky, 0, 0);
  ctx.drawImage(L.sun, Math.round(sunX - L.sun.radius), Math.round(L.sunY - L.sun.radius));
  // Parallax suave: el fondo se mueve poco respecto al suelo (menos sensación de mareo).
  blit(L.clouds, 0.02);
  blit(L.farBack, 0.03);
  blit(L.far, 0.05);
  blit(L.hills, 0.12);
  blit(L.treesBack, 0.22);
  blit(L.trees, 0.35);
  blit(L.ground, 1, groundY - L.ground.lip);
}

// Paisaje quieto (sin suelo) para escenas fijas como el lago: solo las nubes se mueven.
export function drawSkyline(ctx, L, sunX, cloudOffset = 0) {
  ctx.drawImage(L.sky, 0, 0);
  ctx.drawImage(L.sun, Math.round(sunX - L.sun.radius), Math.round(L.sunY - L.sun.radius));
  const off = snap(((cloudOffset % TILE) + TILE) % TILE);
  ctx.drawImage(L.clouds, -off, 0); ctx.drawImage(L.clouds, TILE - off, 0);
  for (const img of [L.farBack, L.far, L.hills, L.treesBack, L.trees]) ctx.drawImage(img, -40, 0);
}

// ---------------------------------------------------------------------------
// Fondo «en calma» (para personas mayores): POCOS elementos pero bien acabados.
// Degradados suaves sin tramado, perspectiva atmosférica (lo lejano se funde con el
// cielo), bordes iluminados, nubes con volumen y árboles a dos tonos con contorno
// del propio color. Nada de texturas ni partículas que «bailen» al moverse.
export function buildCalmLayers(s, { groundY = 150, height = 180 } = {}) {
  const rand = mulberry(5000 + s.index * 37);
  const haze = s.sky[4];
  const soft = (c, t = 0.35) => mix(c, haze, t);
  const lerp = (a, b, t) => mix(a, b, Math.max(0, Math.min(1, t)));

  const sky = (() => {
    const { c, px } = canvas(TILE, groundY);
    const top = soft(s.sky[0], 0.15), midC = soft(s.sky[2], 0.15), bottom = soft(s.sky[4], 0.05);
    for (let y = 0; y < groundY; y++) {
      const f = y / groundY, col = f < 0.55 ? lerp(top, midC, f / 0.55) : lerp(midC, bottom, (f - 0.55) / 0.45);
      for (let x = 0; x < TILE; x++) px(x, y, col);
    }
    return c;
  })();

  const sunC = (() => {
    const R = s.sunR, H = R + 7, { c, g, px } = canvas(H * 2 + 1, H * 2 + 1);
    for (let y = -H; y <= H; y++) for (let x = -H; x <= H; x++) {
      const d = Math.hypot(x, y);
      if (d <= R) px(x + H, y + H, d > R - 1.5 && x + y > 2 ? soft(s.sun, 0.25) : soft(s.sun, 0.05));
    }
    g.globalAlpha = 0.18; g.fillStyle = s.glow;
    for (const r of [R + 3, R + 6]) { g.beginPath(); g.arc(H + 0.5, H + 0.5, r, 0, Math.PI * 2); g.fill(); }
    c.radius = H; return c;
  })();

  const clouds = (() => {
    const { c, px } = canvas(TILE, 100);
    const light = mix(s.cloud, '#ffffff', 0.4), body = soft(s.cloud, 0.1), shade = mix(s.cloudShade, s.sky[2], 0.35);
    for (let n = 0; n < 3; n++) {
      const cx = Math.round(n * TILE / 3 + 50 + rand() * 50), cy = 50 + Math.round(rand() * 26), k = 0.8 + rand() * 0.5;
      const blobs = [[-13, 1, 6], [-5, -3, 8], [5, -4, 9], [14, 0, 6]].map(([dx, dy, r]) => ({ x: cx + dx * k, y: cy + dy * k, r: r * k }));
      const inside = (x, y) => y <= cy + 3 && blobs.some(b => (x - b.x) ** 2 + (y - b.y) ** 2 <= b.r * b.r);
      for (let y = cy - 16; y <= cy + 3; y++) for (let x = cx - 26; x <= cx + 26; x++) {
        if (!inside(x, y)) continue;
        px(x, y, !inside(x, y + 2) ? shade : !inside(x - 1, y - 2) || !inside(x, y - 2) ? light : body);
      }
    }
    return c;
  })();

  // Cordillera lejana: degradado hacia la neblina, cresta iluminada y nieve limpia.
  const mountains = (() => {
    const { c, px } = canvas(TILE, groundY);
    // Picos: suma de «tiendas» (triángulos suaves) sobre una base ondulada.
    const peaks = [[60, 34, 70], [190, 26, 60], [300, 38, 80], [430, 24, 55]];
    const ridge = x => {
      // Unión suave (log-suma-exp) para que los valles entre picos sean redondeados.
      const k = 0.22;
      let acc = Math.exp(k * (8 + 6 * periodic(x, [[2, 0.6, 1.3], [5, 0.3, 0.2]])));
      for (const [px0, ph, pw] of peaks) for (const off of [-TILE, 0, TILE]) {
        const d = Math.abs(x - px0 - off) / pw;
        if (d < 1.4) acc += Math.exp(k * (ph * Math.max(0, 1 - d) ** 1.3 + 2));
      }
      return Math.round(118 - Math.log(acc) / k);
    };
    const topC = soft(s.far, 0.3), lit = soft(s.farLight, 0.25), botC = soft(s.far, 0.8);
    const capLine = 96;
    for (let x = 0; x < TILE; x++) {
      const t0 = ridge(x), slope = ridge(x + 2) - ridge(x - 2);
      for (let y = t0; y < groundY; y++) {
        // Luz gradual: laderas que miran al sol (derecha) más claras, se apaga con la profundidad.
        const light = Math.max(-1, Math.min(1, slope / 3)), fade = Math.exp(-(y - t0) / 16);
        let col = lerp(topC, botC, (y - t0) / 40);
        col = light > 0 ? mix(col, lit, light * 0.4 * fade) : mix(col, botC, -light * 0.15 * fade);
        if (y === t0) col = mix(col, lit, 0.6);
        // Nieve que sigue la forma del pico (más profunda cuanto más alta la cumbre).
        const capDepth = Math.min(9, (capLine - t0) * 0.6) + Math.round(1.5 * Math.sin(x * 0.4));
        if (s.cap && t0 < capLine && y < t0 + capDepth) col = light < -0.2 ? soft(s.capShade, 0.25) : soft(s.cap, 0.15);
        px(x, y, col);
      }
    }
    return c;
  })();

  // Colinas: dos capas con degradado vertical suave y borde superior más claro.
  const hill = (base, amp, terms, color, rim) => {
    const { c, px } = canvas(TILE, groundY);
    for (let x = 0; x < TILE; x++) {
      const t0 = Math.round(base - amp * periodic(x, terms));
      for (let y = t0; y < groundY; y++) px(x, y, y === t0 ? rim : lerp(color, mix(color, '#000000', 0.12), (y - t0) / 30));
    }
    return c;
  };
  const hillsBack = hill(122, 9, [[2, 0.6, 2.1], [3, 0.3, 0.2]], soft(s.hill, 0.5), soft(s.hillLight, 0.45));
  const hillsFront = hill(134, 6, [[3, 0.6, 1.1], [5, 0.3, 2.4]], soft(s.hill, 0.25), soft(s.hillLight, 0.2));

  // Árboles: pocos, a dos tonos (luz a la derecha) y contorno del propio color.
  const trees = (() => {
    const { c, px } = canvas(TILE, groundY);
    const body = soft(s.pine, 0.3), light = soft(s.pineLight, 0.25), edge = mix(body, '#000000', 0.25);
    const crown = s.crown ? soft(s.crown, 0.3) : null, crownL = s.crown ? soft(s.crownLight, 0.25) : null;
    const trunk = soft(s.trunk, 0.25);
    const spots = [40, 120, 175, 290, 345, 450];
    for (const [i, x0] of spots.entries()) {
      const h = 22 + Math.round(rand() * 12), base = groundY - 1, kind = s.crown && i % 2 ? 'round' : 'pine';
      const shape = [];
      if (kind === 'pine') {
        for (let tier = 0; tier < 3; tier++) {
          const top = base - 3 - h + tier * Math.round(h * 0.26), tierH = Math.round(h * 0.4);
          for (let r = 0; r <= tierH; r++) { const half = Math.round(2 + (r / tierH) * (h * 0.22 + tier * 2)); for (let dx = -half; dx <= half; dx++) shape.push([x0 + dx, top + r, dx]); }
        }
      } else {
        const R = Math.round(h * 0.36), cy = base - 4 - R;
        for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) if (x * x + y * y <= R * R + R) shape.push([x0 + x, cy + y, x - y * 0.6]);
      }
      const set = new Set(shape.map(([x, y]) => `${x},${y}`));
      for (let y = 0; y < 4; y++) { px(x0, base - y, trunk); px(x0 + 1, base - y, mix(trunk, '#000000', 0.15)); }
      for (const [x, y, side] of shape) {
        const outer = !set.has(`${x - 1},${y}`) || !set.has(`${x + 1},${y}`) || !set.has(`${x},${y - 1}`) || !set.has(`${x},${y + 1}`);
        let col = kind === 'pine' ? (side > 0 ? light : body) : (side > 1 ? crownL : crown);
        if (outer) col = kind === 'pine' ? edge : mix(crown, '#000000', 0.22);
        if (s.snow && kind === 'pine' && !set.has(`${x},${y - 2}`)) col = soft(s.snow, 0.1);
        px(x, y, col);
      }
    }
    return c;
  })();

  // Suelo: hierba rematada, tierra con degradado y pocas piedras bien dibujadas.
  const ground = (() => {
    const H = height - groundY + 3, { c, px } = canvas(TILE, H);
    const grass = s.snow ? s.snow : s.grass, grassHi = s.snow ? '#ffffff' : s.grassLight, grassLo = s.snow ? s.snowShade : s.grassDark;
    const dirtTop = soft(s.dirt, 0.1), dirtBot = mix(s.dirt, '#000000', 0.18);
    for (let x = 0; x < TILE; x++) for (let y = 0; y < H; y++) {
      px(x, y, y === 0 ? grassHi : y < 4 ? grass : y === 4 ? grassLo : y === 5 ? mix(dirtTop, '#000000', 0.15) : lerp(dirtTop, dirtBot, (y - 6) / (H - 6)));
    }
    for (let i = 0; i < 6; i++) {
      const x = Math.round(i * TILE / 6 + 30 + rand() * 40), y = 10 + Math.round(rand() * (H - 18)), big = rand() < 0.5;
      const stone = soft(s.stone, 0.1), w = big ? 8 : 5, h = big ? 5 : 3;
      for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
        const nx = (dx + 0.5 - w / 2) / (w / 2), ny = (dy + 0.5 - h / 2) / (h / 2);
        if (nx * nx + ny * ny > 1.15) continue;
        px(x + dx, y + dy, ny > 0.35 ? mix(stone, '#000000', 0.22) : nx < 0 && ny < -0.2 ? mix(stone, '#ffffff', 0.3) : stone);
      }
    }
    c.lip = 0;
    return c;
  })();

  return { calm: true, sky, sun: sunC, sunY: s.sunY, clouds, mountains, hillsBack, hillsFront, trees, ground };
}

export function drawCalm(ctx, L, { width, groundY, top }, scroll, sunX) {
  const blit = (img, f, y = 0) => {
    const off = snap((((scroll * f) % TILE) + TILE) % TILE);
    ctx.drawImage(img, -off, y);
    if (TILE - off < width) ctx.drawImage(img, TILE - off, y);
  };
  ctx.drawImage(L.sky, 0, 0);
  // El sol nunca queda cortado por el encuadre (que puede recortar el cielo de arriba).
  const sunY = Math.max(L.sunY, (top ?? 0) + L.sun.radius + 8);
  ctx.drawImage(L.sun, Math.round(sunX - L.sun.radius), Math.round(sunY - L.sun.radius));
  blit(L.clouds, 0.01);
  blit(L.mountains, 0.02);
  blit(L.hillsBack, 0.05);
  blit(L.hillsFront, 0.1);
  blit(L.trees, 0.16);
  blit(L.ground, 1, groundY);
}
