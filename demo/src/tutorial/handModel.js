// Mano 3D articulada para la guía de gestos. Pura (sin DOM).
//
// Sistema de coordenadas de la mano (mano derecha, palma hacia quien mira):
//   +x hacia el pulgar, +y hacia los dedos, +z hacia el espectador (normal de la palma).
// La mano se describe con una pose (flexión de cada articulación en radianes y la
// orientación global) y se convierte en 21 puntos 3D, igual que los landmarks de
// MediaPipe (0 muñeca; 1-4 pulgar; 5-8 índice; 9-12 corazón; 13-16 anular; 17-20 meñique).
// Después se proyecta con una perspectiva suave para dibujarla en 2D.

const D = Math.PI / 180;

// Anatomía (unidades ≈ mm de una mano adulta). Longitudes por falange y radios.
export const ANATOMY = Object.freeze({
  palmRadius: 13,
  forearmRadius: 14,
  // La muñeca es algo más estrecha que los nudillos.
  wrist: [[-24, 4, 0], [24, 4, 0]],
  // Nudillos (MCP) de índice, corazón, anular y meñique.
  fingers: [
    { mcp: [30, 88, 0], lengths: [44, 26, 22], radius: 9.6, spread: -4 },
    { mcp: [10, 94, 0], lengths: [48, 29, 23], radius: 9.6, spread: -1 },
    { mcp: [-10, 89, 0], lengths: [44, 27, 22], radius: 9.1, spread: 3 },
    { mcp: [-29, 78, 0], lengths: [35, 21, 19], radius: 8.2, spread: 8 },
  ],
  thumb: { cmc: [34, 22, 8], lengths: [42, 32, 26], radius: 10.4 },
});

// Poses base. Flexiones en grados: [MCP, PIP, DIP, separación opcional] por dedo; pulgar
// { abd: separación del índice, lift: elevación hacia el espectador, flex: [CMC, MCP, IP] }.
// El pulgar siempre se dobla hacia la oposición (hacia el meñique y hacia la palma).
export const POSES = Object.freeze({
  open: {
    fingers: [[6, 8, 4], [4, 6, 4], [6, 8, 4], [8, 10, 6]],
    thumb: { abd: 55, lift: 16, flex: [0, 6, 4] },
  },
  // Mano relajada: dedos ligeramente curvados.
  relaxed: {
    fingers: [[10, 14, 6], [12, 18, 8], [16, 22, 10], [20, 26, 12]],
    thumb: { abd: 48, lift: 20, flex: [4, 8, 6] },
  },
  // Pinza tipo «OK»: la yema del pulgar toca la del índice y los otros tres dedos quedan
  // relajados y abiertos, para que el anillo pulgar-índice se lea a la primera.
  pinch: {
    fingers: [[42, 56, 34, 2], [14, 20, 10, -2], [18, 26, 12], [22, 30, 14]],
    thumb: { abd: 16, lift: 38, flex: [12, 10, 10] },
  },
  // Puño: los dedos se cierran del todo y convergen (el 4.º valor anula la separación
  // natural); el pulgar se cruza por delante de los dedos doblados.
  fist: {
    fingers: [[90, 102, 58, 4], [92, 104, 60, 1], [90, 102, 60, -3], [88, 98, 56, -8]],
    thumb: { abd: 40, lift: 10, flex: [30, 30, 60] },
  },
  // Agarre de la regadera (pulgar arriba): puño con el pulgar estirado a lo largo del índice.
  grip: {
    fingers: [[84, 98, 46, 4], [86, 100, 48, 1], [84, 98, 48, -3], [82, 96, 46, -8]],
    thumb: { abd: 12, lift: 14, flex: [0, 4, 4] },
  },
  // Verter: el mismo puño con el pulgar algo más abierto (al poner los nudillos hacia la
  // cámara y girar 90°, queda arriba en pantalla).
  pour: {
    fingers: [[84, 98, 46, 4], [86, 100, 48, 1], [84, 98, 48, -3], [82, 96, 46, -8]],
    thumb: { abd: 20, lift: 14, flex: [0, 4, 4] },
  },
});

const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const norm = a => { const l = Math.hypot(...a) || 1; return scale(a, 1 / l); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const lerp = (a, b, t) => a + (b - a) * t;

// Cadena de falanges en el plano formado por la dirección `dir` (en la palma) y la
// normal `bend` (hacia donde se dobla): cada falange gira la flexión acumulada.
function chain(origin, dir, bend, lengths, flexDeg) {
  const pts = [origin];
  let p = origin, angle = 0;
  for (let i = 0; i < lengths.length; i++) {
    angle += flexDeg[i] * D;
    const v = add(scale(dir, Math.cos(angle)), scale(bend, Math.sin(angle)));
    p = add(p, v, lengths[i]);
    pts.push(p);
  }
  return pts;
}

// Interpola dos poses (0 = a, 1 = b).
export function blendPose(a, b, t) {
  return {
    fingers: a.fingers.map((f, i) => [0, 1, 2, 3].map(j => lerp(f[j] ?? 0, b.fingers[i][j] ?? 0, t))),
    thumb: { abd: lerp(a.thumb.abd, b.thumb.abd, t), lift: lerp(a.thumb.lift, b.thumb.lift, t),
      flex: a.thumb.flex.map((v, j) => lerp(v, b.thumb.flex[j], t)) },
  };
}

// 23 puntos 3D en el sistema de la mano (sin orientación global): los 21 landmarks
// más los dos bordes de la muñeca (21 izquierda, 22 derecha) para dibujar la palma.
export const WRIST_L = 21, WRIST_R = 22;
export function handPoints(pose, anatomy = ANATOMY) {
  const pts = new Array(23);
  pts[0] = [0, 0, 0];
  pts[WRIST_L] = [...anatomy.wrist[0]]; pts[WRIST_R] = [...anatomy.wrist[1]];
  anatomy.fingers.forEach((f, i) => {
    const s = (f.spread + (pose.fingers[i][3] ?? 0)) * D;
    const dir = [Math.sin(s), Math.cos(s), 0]; // en la palma, abierto hacia fuera
    const bend = [0, 0, 1]; // los dedos se doblan hacia la palma = hacia el espectador
    const c = chain(f.mcp, dir, bend, f.lengths, pose.fingers[i]);
    for (let k = 0; k < 4; k++) pts[5 + i * 4 + k] = c[k];
  });
  const th = pose.thumb;
  const { dir, bend } = thumbFrame(th);
  const c = chain(anatomy.thumb.cmc, dir, bend, anatomy.thumb.lengths, th.flex);
  for (let k = 0; k < 4; k++) pts[1 + k] = c[k];
  return pts;
}

// Dirección y plano de flexión del pulgar para una pose.
export function thumbFrame(th) {
  const a = th.abd * D, l = th.lift * D;
  // Dirección del pulgar: separado del índice hacia +x y levantado hacia el espectador.
  const dir = norm([Math.sin(a) * Math.cos(l), Math.cos(a) * Math.cos(l), Math.sin(l)]);
  // Oposición: el pulgar se dobla hacia el meñique (−x) y hacia la palma (+z). Se proyecta
  // perpendicular a `dir` para que el plano no degenere cuando el pulgar apunta a la cámara.
  const opp = [-0.82, -0.1, 0.56];
  let bend = add(opp, dir, -dot(opp, dir));
  if (Math.hypot(...bend) < 0.2) bend = cross(dir, [0, 1, 0]);
  return { dir, bend: norm(bend) };
}

// Uñas: centro y normal dorsal de cada falange distal (pulgar, índice, corazón, anular,
// meñique), en el sistema local de la mano. La normal apunta al lado contrario de la
// flexión, perpendicular a la falange.
export function nailAnchors(pose, pts, anatomy = ANATOMY) {
  const out = [];
  const one = (c, d, r, bend) => {
    const seg = norm(add(d, c, -1));
    // Dorsal = −flexión, proyectada perpendicular al segmento.
    let n = scale(bend, -1); n = norm(add(n, seg, -dot(n, seg)));
    const center = add(add(c, seg, distance(c, d) * 0.62), n, r * 0.58);
    out.push({ center, normal: n, radius: r * 0.56, length: distance(c, d) * 0.5 });
  };
  one(pts[3], pts[4], anatomy.thumb.radius, thumbFrame(pose.thumb).bend);
  anatomy.fingers.forEach((f, i) => one(pts[7 + i * 4], pts[8 + i * 4], f.radius, [0, 0, 1]));
  return out;
}
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// Rotaciones globales (grados) aplicadas en orden: roll (z), pitch (x), yaw (y).
export function orient(points, { yaw = 0, pitch = 0, roll = 0, mirror = false } = {}) {
  const cy = Math.cos(yaw * D), sy = Math.sin(yaw * D);
  const cp = Math.cos(pitch * D), sp = Math.sin(pitch * D);
  const cr = Math.cos(roll * D), sr = Math.sin(roll * D);
  return points.map(([x0, y0, z0]) => {
    let x = mirror ? -x0 : x0, y = y0, z = z0;
    [x, y] = [x * cr - y * sr, x * sr + y * cr];
    [y, z] = [y * cp - z * sp, y * sp + z * cp];
    [x, z] = [x * cy + z * sy, -x * sy + z * cy];
    return [x, y, z];
  });
}

// Proyección con perspectiva suave: devuelve [sx, sy, z] (y hacia abajo, como el lienzo).
export function project(points, { focal = 900, zoom = 1, cx = 0, cy = 0 } = {}) {
  return points.map(([x, y, z]) => {
    const k = focal / (focal - z) * zoom;
    return [cx + x * k, cy - y * k, z];
  });
}

// Distancia entre dos puntos 3D.
export const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// Curva de animación: suave al arrancar y al frenar.
export const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// Guion de cada gesto: fotogramas clave { at: 0..1 del ciclo, pose, roll } y la vista.
// `hold` mantiene el valor hasta el siguiente fotograma clave.
export const GESTURES = Object.freeze({
  // Pinza: 3/4 con la palma hacia el espectador, para que el anillo pulgar-índice se vea.
  pinch: {
    periodMs: 2400,
    view: { yaw: -55, pitch: 14, roll: 0 },
    keys: [
      { at: 0, pose: 'relaxed' }, { at: 0.18, pose: 'relaxed' },
      { at: 0.42, pose: 'pinch' }, { at: 0.68, pose: 'pinch' },
      { at: 0.9, pose: 'relaxed' }, { at: 1, pose: 'relaxed' },
    ],
  },
  // Puño: 3/4 ligeramente desde arriba, con el pulgar cruzado por delante a la vista.
  fist: {
    periodMs: 2600,
    view: { yaw: -10, pitch: 36, roll: -4 },
    keys: [
      { at: 0, pose: 'open' }, { at: 0.16, pose: 'open' },
      { at: 0.44, pose: 'fist' }, { at: 0.7, pose: 'fist' },
      { at: 0.92, pose: 'open' }, { at: 1, pose: 'open' },
    ],
  },
  // Agarre: puño con el pulgar arriba, visto desde el lado del pulgar.
  grip: {
    periodMs: 2600,
    view: { yaw: -50, pitch: 10, roll: -4 },
    keys: [
      { at: 0, pose: 'open' }, { at: 0.16, pose: 'open' },
      { at: 0.44, pose: 'grip' }, { at: 0.72, pose: 'grip' },
      { at: 0.92, pose: 'open' }, { at: 1, pose: 'open' },
    ],
  },
  // Verter: el puño con el pulgar arriba gira en pantalla hacia el lado de verter
  // (pronación): con la mano derecha el pulgar cae hacia la izquierda; con la izquierda,
  // al revés. Misma vista que el agarre para que el paso 2 continúe al paso 1.
  tilt: {
    periodMs: 3000,
    view: { yaw: -50, pitch: 10, roll: -4 }, // misma vista que el agarre: puño con el pulgar arriba
    baseRoll: 0,
    keys: [
      { at: 0, pose: 'pour', roll: 0 }, { at: 0.16, pose: 'pour', roll: 0 },
      { at: 0.46, pose: 'pour', roll: 42 }, { at: 0.72, pose: 'pour', roll: 42 },
      { at: 0.94, pose: 'pour', roll: 0 }, { at: 1, pose: 'pour', roll: 0 },
    ],
  },
});

// Estado del gesto en el instante `ms` (bucle): puntos orientados y datos auxiliares.
export function gestureFrame(name, ms, { mirror = false } = {}) {
  const g = GESTURES[name];
  if (!g) throw new Error(`gesto desconocido: ${name}`);
  const t = ((ms % g.periodMs) + g.periodMs) % g.periodMs / g.periodMs;
  let i = 0;
  while (i < g.keys.length - 2 && g.keys[i + 1].at <= t) i++;
  const a = g.keys[i], b = g.keys[i + 1];
  const u = easeInOut(Math.min(1, Math.max(0, (t - a.at) / Math.max(1e-6, b.at - a.at))));
  const pose = blendPose(POSES[a.pose], POSES[b.pose], u);
  const sign = mirror ? -1 : 1;
  const screenRoll = lerp(a.roll ?? 0, b.roll ?? 0, u) * sign;
  const local = handPoints(pose);
  const roll = (g.baseRoll ?? 0) * sign + screenRoll;
  // Mano izquierda: también se refleja la cámara (yaw y roll), así la imagen es la simétrica.
  const view = { ...g.view, yaw: (g.view.yaw ?? 0) * sign, roll: (g.view.roll ?? 0) * sign, mirror };
  const place = pts => { let o = orient(pts, view); if (roll) o = orient(o, { roll }); return o; };
  // Base de la mano en el mundo (columnas de la matriz): sirve para volver al sistema
  // local de la mano, donde la palma es plana y los dedos se doblan hacia +z.
  const basis = place([[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
  return { points: place(local), local, basis, pose, progress: t, screenRoll };
}
