// Motor del Flappy portado de FlappyVaina (lib/flappy-logic.ts).
// Cambios de la versión fácil: recorrido fijo con semilla (sesiones comparables),
// número de columnas finito y sin game over (al chocar, el avión se recupera).
// Puro (sin DOM).

import { FLAPPY_CONFIG } from './config.js';
import { mulberry32 } from '../runner/world.js';

export function buildColumns(C = FLAPPY_CONFIG) {
  const rand = mulberry32(C.courseSeed);
  return Array.from({ length: C.columnCount }, (_, i) => ({
    id: i + 1, x: C.firstColumnX + i * C.columnSpacing,
    gapY: (rand() - 0.5) * C.gapRange, gapSize: C.gapSize, passed: false, hit: false,
  }));
}

export class FlappyEngine {
  constructor(C = FLAPPY_CONFIG) {
    this.C = C;
    this.state = { status: 'ready', score: 0, hits: 0, planeY: 0, planeVelocityY: 0, recoveryMs: 0, columns: [] };
  }

  start() {
    Object.assign(this.state, { status: 'playing', score: 0, hits: 0, planeY: 0, planeVelocityY: 0.2, recoveryMs: 0, columns: buildColumns(this.C) });
  }

  // Devuelve los eventos del paso: { passed: [ids], hit: id|null, floor: bool, finished: bool }.
  update(fistStrength, dt) {
    const C = this.C, s = this.state;
    const events = { passed: [], hit: null, floor: false, finished: false };
    // Caja del vehículo: ancho y extensión arriba/abajo (el globo es alto; el avión era un círculo).
    const halfW = C.planeHalfWidth ?? C.planeRadius, up = C.planeUp ?? C.planeRadius, down = C.planeDown ?? C.planeRadius;
    if (s.status !== 'playing') return events;
    s.recoveryMs = Math.max(0, s.recoveryMs - dt * 1000);

    const accel = fistStrength * C.thrust - C.gravity;
    s.planeVelocityY = Math.max(-C.maxVelocity, Math.min(C.maxVelocity, s.planeVelocityY + accel * dt));
    s.planeY += s.planeVelocityY * dt;
    if (s.planeY < C.minY) { s.planeY = C.minY; s.planeVelocityY = 0; events.floor = true; }
    if (s.planeY > C.maxY) { s.planeY = C.maxY; s.planeVelocityY = Math.max(-0.2, s.planeVelocityY * -0.5); }

    for (const col of s.columns) {
      col.x -= C.scrollSpeed * dt;
      // Pasada = el globo ha salido por completo de la columna (los choques cuentan hasta entonces).
      if (!col.passed && col.x + C.columnWidth / 2 < C.planeX - halfW) {
        col.passed = true;
        if (!col.hit) s.score++;
        events.passed.push(col.id);
      }
      const inX = C.planeX + halfW > col.x - C.columnWidth / 2 && C.planeX - halfW < col.x + C.columnWidth / 2;
      const top = col.gapY + col.gapSize / 2, bottom = col.gapY - col.gapSize / 2;
      if (inX && !col.hit && s.recoveryMs === 0 && (s.planeY + up > top || s.planeY - down < bottom)) {
        col.hit = true; s.hits++; s.recoveryMs = C.hitRecoveryMs; events.hit = col.id;
      }
    }
    if (s.columns.every(c => c.passed) && s.columns.at(-1).x < C.planeX - 0.8) { s.status = 'finished'; events.finished = true; }
    return events;
  }
}
