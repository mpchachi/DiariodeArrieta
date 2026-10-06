// Mundo del Runner: recorrido con semilla, física del zorro y colisiones.
// Puro (sin DOM). Unidades: píxeles de la resolución interna y milisegundos.
// Versión fácil: un solo tipo de obstáculo y un solo tipo de salto.

import { RUNNER_CONFIG } from './config.js';

export const OBSTACLE = Object.freeze({ name: 'tronco', w: 14, h: 10 });
export const FOX_BOX = Object.freeze({ left: -6, right: 8, height: 15 });
const OBSTACLE_INSET = 2;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildCourse(C = RUNNER_CONFIG) {
  const rand = mulberry32(C.courseSeed);
  const obstacles = [], berries = [];
  // A la altura del cuerpo del zorro en lo alto del salto.
  const berryY = jumpApex(C) + 7;
  let x = C.startOffset;
  for (let i = 0; i < C.obstacleCount; i++) {
    const intro = i < C.introCount;
    obstacles.push({ id: i, kind: 'low', ...OBSTACLE, x, intro });
    const spacing = intro ? C.introSpacing : C.minSpacing + Math.round(rand() * (C.maxSpacing - C.minSpacing));
    // Baya sobre el tronco: se recoge con un salto bien medido (recompensa al timing).
    if (C.berries !== false && !intro && rand() < 0.6) berries.push({ id: berries.length, x: x + OBSTACLE.w / 2, y: berryY });
    x += spacing;
  }
  return { obstacles, berries, finishX: x - C.maxSpacing + C.finishOffset };
}

export function createFox() {
  return { y: 0, vy: 0, onGround: true, airMs: 0, stumbleMs: 0, landMs: 0 };
}

export function startJump(fox, C = RUNNER_CONFIG) {
  if (!fox.onGround) return false;
  Object.assign(fox, { vy: C.jumpVelocity, onGround: false, airMs: 0 });
  return true;
}

export function stepFox(fox, dtMs, C = RUNNER_CONFIG) {
  const out = { landed: false };
  fox.stumbleMs = Math.max(0, fox.stumbleMs - dtMs);
  fox.landMs = Math.max(0, fox.landMs - dtMs);
  if (fox.onGround) return out;
  fox.airMs += dtMs;
  const dt = dtMs / 1000;
  fox.vy -= C.gravity * dt;
  fox.y += fox.vy * dt;
  if (fox.y <= 0) {
    Object.assign(fox, { y: 0, vy: 0, onGround: true, landMs: 90 });
    out.landed = true;
  }
  return out;
}

export function collides(foxWorldX, foxY, ob) {
  const left = foxWorldX + FOX_BOX.left, right = foxWorldX + FOX_BOX.right;
  const oLeft = ob.x + OBSTACLE_INSET, oRight = ob.x + ob.w - OBSTACLE_INSET;
  return right > oLeft && left < oRight && foxY < ob.h - OBSTACLE_INSET;
}

export function touchesBerry(foxWorldX, foxY, berry) {
  return Math.abs(foxWorldX + 1 - berry.x) < 9 && foxY < berry.y + 3 && foxY + FOX_BOX.height > berry.y - 3;
}

function trajectory(C) {
  const fox = createFox(), stepMs = 2, points = [];
  startJump(fox, C);
  let t = 0;
  while (!fox.onGround && t < 5000) {
    stepFox(fox, stepMs, C);
    t += stepMs;
    points.push({ t, y: fox.y });
  }
  return points;
}

export function jumpApex(C = RUNNER_CONFIG) {
  return Math.round(Math.max(...trajectory(C).map(p => p.y)));
}

// Ventana de despegue que supera el obstáculo, como offset (px) de la posición
// del zorro respecto al borde izquierdo del obstáculo. `ideal` = centro de la
// ventana. Se usa para medir la precisión temporal de cada salto.
export function takeoffWindow(ob, C = RUNNER_CONFIG) {
  const path = trajectory(C);
  const landingDx = C.speed * path.at(-1).t / 1000;
  const feasible = [];
  // d máximo: el zorro aún no ha alcanzado el obstáculo al despegar.
  for (let d = -250; d <= OBSTACLE_INSET - FOX_BOX.right; d++) {
    const clearsAfterLanding = ob.x + d + landingDx + FOX_BOX.left >= ob.x + ob.w - OBSTACLE_INSET;
    if (clearsAfterLanding && path.every(p => !collides(ob.x + d + C.speed * p.t / 1000, p.y, ob))) feasible.push(d);
  }
  if (!feasible.length) return null;
  const min = feasible[0], max = feasible.at(-1);
  return { min, max, ideal: (min + max) / 2, widthMs: (max - min) / C.speed * 1000 };
}
