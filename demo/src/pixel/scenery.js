// Paisaje de fondo para los tres juegos. Modo `pixel` (el que se usa): se dibuja a la
// resolución del juego (1 px = 1 píxel de pixel art), con bordes nítidos (sin
// antialiasing) y degradados en franjas planas de color, nunca tramados. Modo HD
// (pixel: false) queda como alternativa ilustrada. En ambos:
//   - pocos elementos, pero bien acabados (cielo, sol, 3 nubes, 2 cordilleras con cara
//     de luz y de sombra, neblina, colinas con bosque lejano, 6 árboles, suelo);
//   - colores apagados para que destaquen el zorro, los obstáculos y el globo;
//   - nada parpadea ni tiene textura que «baile» al moverse.
// Cada capa se pre-renderiza una vez por estación y escala (tira de TILE px sin
// costura); dibujar un fotograma = copiar imágenes.

import { mix, mulberry } from './util.js';

export const TILE = 512;
const TAU = Math.PI * 2;

const wave = (x, terms) => terms.reduce((s, [n, a, p]) => s + a * Math.sin(TAU * n * x / TILE + p), 0);

function layer(R, y0, y1) {
  const c = document.createElement('canvas');
  c.width = TILE * R; c.height = Math.ceil((y1 - y0) * R);
  const g = c.getContext('2d');
  g.setTransform(R, 0, 0, R, 0, -y0 * R);
  c.y0 = y0; c.h = y1 - y0;
  return { c, g };
}

// Dibuja `fn` tres veces (x−TILE, x, x+TILE) para que la tira no tenga costura.
const wrapped = (g, fn) => { for (const off of [-TILE, 0, TILE]) { g.save(); g.translate(off, 0); fn(); g.restore(); } };

function ridgePath(g, fn, bottom, step = 0.5) {
  g.beginPath(); g.moveTo(-2, bottom);
  for (let x = -2; x <= TILE + 2; x += step) g.lineTo(x, fn(x));
  g.lineTo(TILE + 2, bottom); g.closePath();
}

// Modo pixel activo durante la construcción (degradados en franjas).
let PIXEL = false;

const hexA = c => (c.length === 9 ? parseInt(c.slice(7), 16) / 255 : 1);
function lerpStops(stops, t) {
  let i = 0;
  while (i < stops.length - 2 && t > stops[i + 1][0]) i++;
  const [t0, c0] = stops[i], [t1, c1] = stops[i + 1], u = Math.max(0, Math.min(1, (t - t0) / ((t1 - t0) || 1)));
  const rgb = mix(c0.slice(0, 7), c1.slice(0, 7), u), a = hexA(c0) * (1 - u) + hexA(c1) * u;
  return `${rgb}${Math.round(a * 255).toString(16).padStart(2, '0')}`;
}
function vgrad(g, y0, y1, stops) {
  const gr = g.createLinearGradient(0, y0, 0, y1);
  if (!PIXEL) { stops.forEach(([t, c]) => gr.addColorStop(t, c)); return gr; }
  // Franjas planas: 1 franja cada ~7 px (entre 2 y 10 franjas).
  const n = Math.max(2, Math.min(10, Math.round(Math.abs(y1 - y0) / 7)));
  for (let i = 0; i < n; i++) { const c = lerpStops(stops, (i + 0.5) / n); gr.addColorStop(i / n, c); gr.addColorStop(Math.min(1, (i + 1) / n - 1e-4), c); }
  return gr;
}

// Quita el antialiasing: cada píxel queda opaco o transparente (bordes nítidos).
function crisp(c) {
  if (!PIXEL) return c;
  const g = c.getContext('2d'), img = g.getImageData(0, 0, c.width, c.height), d = img.data;
  for (let i = 3; i < d.length; i += 4) d[i] = d[i] >= 128 ? 255 : 0;
  g.putImageData(img, 0, 0);
  return c;
}

export function buildScenery(s, { groundY = 150, height = 180, R = 2, pixel = false } = {}) {
  PIXEL = pixel; if (pixel) R = 1;
  const rand = mulberry(9000 + s.index * 53);
  const haze = s.sky[4];
  const soft = (c, t) => mix(c, haze, t);

  // --- Cielo (columna de 1 px que se estira) ---
  const sky = document.createElement('canvas');
  sky.width = 1; sky.height = groundY * R;
  { const g = sky.getContext('2d'); g.fillStyle = vgrad(g, 0, sky.height, [[0, soft(s.sky[0], 0.1)], [0.55, soft(s.sky[2], 0.1)], [1, s.sky[4]]]); g.fillRect(0, 0, 1, sky.height); }

  // --- Sol con halo suave ---
  const SR = s.sunR + 16, sun = document.createElement('canvas');
  sun.width = sun.height = SR * 2 * R;
  { const g = sun.getContext('2d'); g.scale(R, R);
    if (pixel) { // halo en dos anillos planos + disco, píxel a píxel
      const ring = (r, col) => { g.fillStyle = col; for (let y = -r; y <= r; y++) { const w = Math.floor(Math.sqrt(r * r - y * y + r * 0.5)); g.fillRect(SR - w, SR + y, w * 2 + 1, 1); } };
      g.globalAlpha = 0.18; ring(s.sunR + 7, s.glow); g.globalAlpha = 0.3; ring(s.sunR + 3, s.glow); g.globalAlpha = 1;
      ring(s.sunR, soft(s.sun, 0.05));
    } else {
      const gr = g.createRadialGradient(SR, SR, s.sunR * 0.6, SR, SR, SR);
      gr.addColorStop(0, mix(s.glow, '#ffffff', 0.3)); gr.addColorStop(0.4, `${s.glow}88`); gr.addColorStop(1, `${s.glow}00`);
      g.fillStyle = gr; g.fillRect(0, 0, SR * 2, SR * 2);
      g.fillStyle = soft(s.sun, 0.05); g.beginPath(); g.arc(SR, SR, s.sunR, 0, TAU); g.fill();
    } }
  sun.radius = SR;

  // --- Nubes: elipses con volumen (luz arriba, sombra abajo) ---
  const clouds = layer(R, 0, 110);
  { const { g } = clouds;
    const top = mix(s.cloud, '#ffffff', 0.5), bottom = mix(s.cloudShade, s.sky[2], 0.3);
    for (let n = 0; n < 3; n++) {
      const cx = n * TILE / 3 + 50 + rand() * 60, cy = 56 + rand() * 30, k = 0.7 + rand() * 0.4;
      wrapped(g, () => {
        g.fillStyle = vgrad(g, cy - 14 * k, cy + 4 * k, [[0, top], [0.7, s.cloud], [1, bottom]]);
        g.beginPath();
        for (const [dx, dy, rx, ry] of [[-16, 1, 9, 5], [-6, -4, 10, 9], [6, -6, 11, 10], [17, -1, 8, 6], [0, 2, 22, 4]]) {
          g.moveTo(cx + (dx + rx) * k, cy + dy * k); g.ellipse(cx + dx * k, cy + dy * k, rx * k, ry * k, 0, 0, TAU);
        }
        g.fill();
      });
    }
  }

  // --- Cordillera: silueta suave + cara de luz por pico + nieve + neblina abajo ---
  function range({ y0, base, peaks, color, light, capColor, capLine, hazeAmt }) {
    const L = layer(R, y0, groundY), { g } = L;
    const ridge = x => {
      const k = 0.2;
      let acc = Math.exp(k * (6 + 4 * wave(x, [[2, 0.6, 1.3], [5, 0.3, 0.2]])));
      for (const [px, ph, pw] of peaks) for (const off of [-TILE, 0, TILE]) {
        const d = Math.abs(x - px - off) / pw;
        if (d < 1.5) acc += Math.exp(k * (ph * Math.max(0, 1 - d) ** 1.25));
      }
      return base - Math.log(acc) / k;
    };
    const fill = vgrad(g, y0, groundY, [[0, soft(color, hazeAmt)], [1, soft(color, Math.min(0.92, hazeAmt + 0.5))]]);
    ridgePath(g, ridge, groundY); g.fillStyle = fill; g.fill();
    g.save(); ridgePath(g, ridge, groundY); g.clip();
    for (const [px, ph, pw] of peaks) for (const off of [-TILE, 0, TILE]) {
      const ax = px + off, ay = ridge(px);
      // Cara de luz: del pico hacia la derecha y abajo.
      g.beginPath(); g.moveTo(ax, ay);
      for (let x = ax; x <= ax + pw * 1.1; x += 1) g.lineTo(x, ridge(x - off) );
      g.lineTo(ax + pw * 0.25, groundY); g.lineTo(ax - pw * 0.05, groundY); g.closePath();
      g.fillStyle = vgrad(g, ay, ay + (groundY - ay) * 0.8, [[0, `${soft(light, hazeAmt * 0.6)}99`], [1, `${soft(light, 0.9)}00`]]);
      g.fill();
      // Nieve en la cumbre, con borde inferior irregular.
      if (capColor && ay < capLine) {
        const depth = Math.min(14, (capLine - ay) * 0.8);
        g.beginPath(); g.moveTo(ax - pw * 0.6, ridge(ax - pw * 0.6 - off));
        for (let x = ax - pw * 0.6; x <= ax + pw * 0.6; x += 1) g.lineTo(x, ridge(x - off));
        for (let i = 0; i <= 8; i++) {
          const x = ax + pw * 0.6 - i * pw * 0.15, yy = Math.max(ridge(x - off), ay + depth * (i % 2 ? 0.75 : 1.05) * (1 - Math.abs(x - ax) / (pw * 0.9)));
          g.lineTo(x, yy);
        }
        g.closePath();
        g.fillStyle = soft(capColor, hazeAmt * 0.5); g.fill();
      }
    }
    g.restore();
    // Neblina en la base.
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = vgrad(g, groundY - 34, groundY, [[0, `${haze}00`], [1, `${haze}aa`]]);
    g.fillRect(0, groundY - 34, TILE, 34);
    g.globalCompositeOperation = 'source-over';
    return crisp(L.c);
  }
  const mountainsFar = range({ y0: 50, base: 128, peaks: [[70, 46, 80], [210, 38, 70], [330, 52, 90], [450, 34, 62]],
    color: s.far, light: s.farLight, capColor: s.cap, capLine: 98, hazeAmt: 0.45 });
  const mountainsNear = range({ y0: 80, base: 140, peaks: [[140, 30, 70], [280, 24, 60], [400, 34, 80], [20, 22, 50]],
    color: mix(s.far, s.hill, 0.45), light: mix(s.farLight, s.hillLight, 0.45), capColor: s.cap ? s.capShade : null, capLine: 112, hazeAmt: 0.28 });

  // --- Colinas lejanas con bosque en silueta ---
  const hillsBack = (() => {
    const L = layer(R, 96, groundY), { g } = L;
    const ridge = x => 128 - 7 * wave(x, [[2, 0.6, 2.1], [3, 0.3, 0.2], [7, 0.1, 1]]);
    const forest = soft(mix(s.pineDark, s.hill, 0.5), 0.45);
    g.fillStyle = forest;
    for (let x = 0; x < TILE; x += 5 + rand() * 4) {
      const h = 7 + rand() * 6, y = ridge(x) + 2, w = 3.5 + rand() * 1.5;
      wrapped(g, () => { g.beginPath(); g.moveTo(x - w, y); g.lineTo(x, y - h); g.lineTo(x + w, y); g.closePath(); g.fill(); });
    }
    ridgePath(g, ridge, groundY);
    g.fillStyle = vgrad(g, 115, groundY, [[0, soft(s.hill, 0.42)], [1, soft(s.hillDark, 0.5)]]); g.fill();
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = vgrad(g, groundY - 20, groundY, [[0, `${haze}00`], [1, `${haze}66`]]); g.fillRect(0, groundY - 20, TILE, 20);
    g.globalCompositeOperation = 'source-over';
    return crisp(L.c);
  })();

  // --- Colinas cercanas con borde iluminado ---
  const hillsFront = (() => {
    const L = layer(R, 110, groundY + 1), { g } = L;
    const ridge = x => 137 - 5 * wave(x, [[3, 0.6, 1.1], [5, 0.3, 2.4]]);
    ridgePath(g, ridge, groundY + 1);
    g.fillStyle = vgrad(g, 128, groundY, [[0, soft(s.hill, 0.18)], [1, soft(s.hillDark, 0.2)]]); g.fill();
    g.beginPath(); for (let x = -2; x <= TILE + 2; x += 0.5) g.lineTo(x, ridge(x) + 0.4);
    g.strokeStyle = soft(s.hillLight, 0.1); g.lineWidth = pixel ? 1 : 0.8; g.stroke();
    if (s.hillCap) { ridgePath(g, ridge, groundY + 1); g.save(); g.clip(); g.fillStyle = `${s.hillCap}cc`; g.beginPath(); for (let x = -2; x <= TILE + 2; x += 0.5) g.lineTo(x, ridge(x) + 2 + Math.sin(TAU * 12 * x / TILE)); g.lineTo(TILE + 2, 0); g.lineTo(-2, 0); g.fill(); g.restore(); }
    return crisp(L.c);
  })();

  // --- Árboles: pocos, planos a dos tonos (luz a la derecha) ---
  const trees = (() => {
    const L = layer(R, 90, groundY + 1), { g } = L;
    const base = groundY + 0.5, trunk = soft(s.trunk, 0.15);
    const spots = [[40, 'pine', 34], [118, 'round', 26], [176, 'pine', 28], [292, 'pine', 38], [350, 'round', 24], [448, 'pine', 30]];
    for (const [x, kind0, h] of spots) {
      const kind = kind0 === 'round' && !s.crown ? 'pine' : kind0;
      wrapped(g, () => {
        g.fillStyle = trunk; g.fillRect(x - 1, base - 6, 2, 6);
        const halves = (dark, lit, pathFn) => {
          pathFn(); g.fillStyle = dark; g.fill();
          g.save(); pathFn(); g.clip(); g.fillStyle = lit; g.fillRect(x, 0, 60, 300); g.restore();
        };
        if (kind === 'pine') {
          const dark = soft(s.pine, 0.18), lit = soft(s.pineLight, 0.12);
          for (let t = 0; t < 3; t++) {
            const top = base - 5 - h + t * h * 0.26, bot = top + h * 0.42, w = h * (0.2 + t * 0.07);
            const tier = () => { g.beginPath(); g.moveTo(x, top); g.quadraticCurveTo(x + w * 0.45, top + (bot - top) * 0.55, x + w, bot); g.lineTo(x - w, bot); g.quadraticCurveTo(x - w * 0.45, top + (bot - top) * 0.55, x, top); g.closePath(); };
            halves(dark, lit, tier);
            if (s.snow) { g.save(); tier(); g.clip(); g.fillStyle = s.snow; g.beginPath(); g.moveTo(x, top - 1); g.lineTo(x + w * 0.5, top + (bot - top) * 0.45); g.lineTo(x + w * 0.15, top + (bot - top) * 0.35); g.lineTo(x - w * 0.2, top + (bot - top) * 0.48); g.lineTo(x - w * 0.5, top + (bot - top) * 0.45); g.closePath(); g.fill(); g.restore(); }
          }
        } else {
          const r = h * 0.42, cy = base - 6 - r * 0.9;
          const crown = () => { g.beginPath(); g.arc(x, cy, r, 0, TAU); g.moveTo(x - r * 0.3 + r * 0.7, cy + r * 0.35); g.arc(x - r * 0.3, cy + r * 0.35, r * 0.7, 0, TAU); g.moveTo(x + r * 0.45 + r * 0.6, cy + r * 0.4); g.arc(x + r * 0.45, cy + r * 0.4, r * 0.6, 0, TAU); };
          halves(soft(s.crown, 0.18), soft(s.crownLight, 0.12), crown);
          if (s.spots) { g.fillStyle = soft(s.spots, 0.1); for (let i = 0; i < 7; i++) { const a = rand() * TAU, d = rand() * r * 0.8; g.beginPath(); g.arc(x + Math.cos(a) * d, cy + Math.sin(a) * d, 1.1, 0, TAU); g.fill(); } }
        }
      });
    }
    return crisp(L.c);
  })();

  // --- Suelo: hierba con borde suave, tierra con degradado, pocas piedras ---
  const ground = (() => {
    const L = layer(R, groundY - 2, height), { g } = L;
    const grass = s.snow ?? s.grass, grassHi = s.snow ? '#ffffff' : s.grassLight, grassLo = s.snow ? s.snowShade : s.grassDark;
    g.fillStyle = vgrad(g, groundY + 4, height, [[0, soft(s.dirt, 0.05)], [1, mix(s.dirt, '#000000', 0.22)]]);
    g.fillRect(0, groundY + 3, TILE, height - groundY);
    g.fillStyle = mix(s.dirt, '#000000', 0.12); g.fillRect(0, groundY + 15, TILE, pixel ? 1 : 0.6);
    for (let i = 0; i < 6; i++) {
      const x = i * TILE / 6 + 20 + rand() * 50, y = groundY + 9 + rand() * (height - groundY - 14), rx = 2.5 + rand() * 2.5;
      wrapped(g, () => {
        g.fillStyle = mix(s.stone, '#000000', 0.15); g.beginPath(); g.ellipse(x, y + 0.5, rx, rx * 0.6, 0, 0, TAU); g.fill();
        g.fillStyle = s.stone; g.beginPath(); g.ellipse(x - 0.3, y, rx * 0.9, rx * 0.5, 0, 0, TAU); g.fill();
        g.fillStyle = mix(s.stone, '#ffffff', 0.35); g.beginPath(); g.ellipse(x - rx * 0.35, y - rx * 0.2, rx * 0.35, rx * 0.18, 0, 0, TAU); g.fill();
      });
    }
    const edge = x => groundY + 0.7 * Math.sin(TAU * 9 * x / TILE) + 0.3 * Math.sin(TAU * 23 * x / TILE + 1);
    g.beginPath(); g.moveTo(-2, groundY + 5);
    for (let x = -2; x <= TILE + 2; x += 0.5) g.lineTo(x, edge(x) + 4.5);
    g.lineTo(TILE + 2, groundY - 2); g.lineTo(-2, groundY - 2); g.closePath();
    g.fillStyle = vgrad(g, groundY, groundY + 5, [[0, grass], [1, grassLo]]); g.fill();
    g.fillStyle = grassHi; g.fillRect(0, groundY - (pixel ? 0 : 0.2), TILE, pixel ? 1 : 0.8);
    if (!s.snow) {
      g.fillStyle = grassLo;
      for (let x = 6; x < TILE; x += 18 + rand() * 20) wrapped(g, () => { for (const d of [-1.2, 0, 1.2]) { g.beginPath(); g.moveTo(x + d - 0.5, groundY + 0.5); g.lineTo(x + d * 1.8, groundY - 2.2 + Math.abs(d) * 0.6); g.lineTo(x + d + 0.5, groundY + 0.5); g.fill(); } });
    }
    return crisp(L.c);
  })();
  crisp(clouds.c);

  PIXEL = false;
  return { R, sky, sun, sunY: s.sunY, clouds: clouds.c, mountainsFar, mountainsNear, hillsBack, hillsFront, trees, ground };
}

// Dibuja el paisaje en coordenadas del juego. `scroll` en px del suelo.
export function drawScenery(ctx, L, { width, top = 0, groundY = 150 }, scroll, sunX, snapFn = v => v, withGround = true) {
  ctx.drawImage(L.sky, 0, 0, width, L.sky.height / L.R);
  const sunY = Math.max(L.sunY, top + L.sun.radius * 0.5 + 6);
  ctx.drawImage(L.sun, sunX - L.sun.radius, sunY - L.sun.radius, L.sun.radius * 2, L.sun.radius * 2);
  const blit = (img, f) => {
    const off = snapFn((((scroll * f) % TILE) + TILE) % TILE), h = img.height / L.R;
    ctx.drawImage(img, -off, img.y0 ?? 0, TILE, h);
    if (TILE - off < width) ctx.drawImage(img, TILE - off, img.y0 ?? 0, TILE, h);
  };
  blit(L.clouds, 0.01);
  blit(L.mountainsFar, 0.02);
  blit(L.mountainsNear, 0.04);
  blit(L.hillsBack, 0.07);
  blit(L.hillsFront, 0.11);
  blit(L.trees, 0.16);
  if (withGround) blit(L.ground, 1);
}
