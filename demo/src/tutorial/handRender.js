// Dibujo de la mano 3D en un lienzo 2D: cápsulas con contorno fino, sombreado por
// profundidad (lo más cercano, más claro) y sombra suave debajo. Estilo gris neutro.

import { project, WRIST_L, WRIST_R } from './handModel.js';

export const HAND_THEME = Object.freeze({
  light: [228, 232, 238], // #E4E8EE
  dark: [160, 170, 182], // #A0AAB6
  outline: 'rgba(71, 82, 98, 0.62)',
  edge: 1.6, // grosor del contorno (px de lienzo)
  shadow: 'rgba(15, 23, 42, 0.22)',
});

const rgb = c => `rgb(${c.map(v => Math.round(v)).join(',')})`;
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

// Caja que envuelve un conjunto de puntos proyectados.
export function bounds(points2d) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of points2d) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

// Encaje estable: calcula centro y zoom para que todas las poses del bucle entren en
// un cuadrado de `size` px con margen `pad` (la mano no «salta» al cambiar de pose).
export function fitLayout(frames, size, pad = 30) {
  const all = [];
  for (const f of frames) for (const p of project(f.points)) all.push(p);
  const b = bounds(all);
  const zoom = (size - pad * 2) / Math.max(b.w, b.h);
  return { zoom, cx: size / 2 - (b.x0 + b.w / 2) * zoom, cy: size / 2 - (b.y0 + b.h / 2) * zoom, size };
}

function primitives(points, anatomy) {
  const prims = [];
  const chainPrim = (idx, radius) => prims.push({ idx, radius, z: idx.reduce((s, i) => s + points[i][2], 0) / idx.length });
  // Palma: contorno muñeca → nudillos → base del pulgar → muñeca (polígono redondeado).
  const palm = { poly: true, idx: [WRIST_L, 17, 13, 9, 5, 1, WRIST_R], radius: anatomy.palmRadius };
  palm.z = [17, 13, 9, 5, 1].reduce((s, i) => s + points[i][2], 0) / 5 - 6; // siempre un poco detrás
  prims.push(palm);
  anatomy.fingers.forEach((f, i) => chainPrim([5 + i * 4, 6 + i * 4, 7 + i * 4, 8 + i * 4], f.radius));
  chainPrim([1, 2, 3, 4], anatomy.thumb.radius);
  return prims.sort((a, b) => a.z - b.z);
}

// `frame`: { points } del modelo; `layout`: de fitLayout; `anatomy`: ANATOMY.
export function renderHand(ctx, frame, layout, anatomy, theme = HAND_THEME) {
  const { size, zoom, cx, cy } = layout;
  const pts3 = frame.points;
  const p2 = project(pts3, { zoom, cx, cy });
  const at = i => p2[i];
  const zs = pts3.map(p => p[2]);
  const zmin = Math.min(...zs), zmax = Math.max(...zs), span = Math.max(1, zmax - zmin);
  const shade = z => rgb(mix(theme.dark, theme.light, (z - zmin) / span));

  ctx.save();
  ctx.clearRect(0, 0, size, size);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';

  // Dos pasadas por primitiva (contorno y relleno), de atrás hacia delante.
  const draw = (prim, pass) => {
    const pts = prim.idx.map(at), r = prim.radius * zoom;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    if (prim.poly) ctx.closePath();
    if (pass === 'outline') {
      ctx.lineWidth = r * 2 + theme.edge * 2;
      ctx.strokeStyle = theme.outline; ctx.fillStyle = theme.outline;
    } else {
      // Degradado a lo largo de la primitiva según la profundidad de sus extremos.
      const a = pts[0], b = pts[pts.length - 1];
      const g = ctx.createLinearGradient(a[0], a[1], b[0], b[1]);
      g.addColorStop(0, shade(prim.poly ? prim.z : pts3[prim.idx[0]][2]));
      g.addColorStop(1, shade(prim.poly ? prim.z + 4 : pts3[prim.idx[prim.idx.length - 1]][2]));
      ctx.lineWidth = r * 2;
      ctx.strokeStyle = g; ctx.fillStyle = g;
    }
    ctx.stroke();
    if (prim.poly) ctx.fill();
  };
  for (const prim of primitives(frame.points, anatomy)) { draw(prim, 'outline'); draw(prim, 'fill'); }
  // Pequeño brillo en las yemas: da volumen sin romper el estilo plano.
  for (const tip of [4, 8, 12, 16, 20]) {
    const [x, y] = at(tip), r = (tip === 4 ? anatomy.thumb.radius : anatomy.fingers[(tip - 8) / 4].radius) * zoom;
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 0.95, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}
