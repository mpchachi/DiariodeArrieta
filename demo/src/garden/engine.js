// Motor de «El huerto del zorro». Puro (sin DOM). Fases:
//   neutral → (water → bloom → return → walk) × flores → done
// La regadera copia la inclinación; el agua sale a partir de un umbral que se adapta
// solo si al paciente le cuesta llegar. No hay tiempo límite ni fallo.
// `pourSign`: lado natural de verter (pronación). En vista espejo, el ángulo es
// negativo cuando el puño gira hacia la izquierda de la pantalla: mano derecha = −1,
// mano izquierda = +1. Girar al lado contrario endereza la regadera (sin agua).

import { GARDEN_CONFIG } from './config.js';

const wrap = d => { while (d > 180) d -= 360; while (d < -180) d += 360; return d; };
const mean = a => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);

export class GardenEngine {
  constructor(C = GARDEN_CONFIG, { pourSign = -1 } = {}) {
    this.C = C; this.pourSign = pourSign;
    this.phase = 'neutral'; this.phaseAt = null; this.p = {};
    this.neutral = null; this.wrist0 = null;
    this.pourStart = C.pourStartDeg;
    this.index = 0; this.flowers = []; this.window = [];
    this.rel = 0; this.tilt = 0; this.flow = 0; this.lastT = null;
  }

  get flower() { return this.flowers[this.index] ?? null; }
  get growth() { return this.flower?.growth ?? 0; }
  get returnDeg() { return Math.min(this.C.returnDeg, this.pourStart * 0.5); }

  set(phase, t) { this.phase = phase; this.phaseAt = t; this.p = {}; return { type: 'phase', phase }; }

  newFlower(t) {
    this.flowers[this.index] = {
      index: this.index, kind: this.C.flowers[this.index], readyAt: t, pourStartAt: null, bloomAt: null, returnAt: null,
      growth: 0, pourMs: 0, peakTiltDeg: 0, peakOppositeDeg: 0, peakVelIn: 0, peakVelOut: 0, startThresholdDeg: this.pourStart,
      compensation: false, samples: [],
    };
    return this.set('water', t);
  }

  // Un fotograma válido: { t (ms), angle (°), velocity (°/s), wrist {x,y} }.
  update({ t, angle, velocity = 0, wrist = null }) {
    const C = this.C, ev = [];
    if (this.phaseAt === null) this.phaseAt = t;
    const dt = this.lastT === null ? 0 : Math.max(0, Math.min(250, t - this.lastT));
    this.lastT = t;
    const since = t - this.phaseAt;
    this.rel = this.neutral === null ? 0 : wrap(angle - this.neutral);
    // Inclinación hacia el lado de verter (+) o hacia el contrario (−).
    this.pour = this.pourSign * this.rel;
    this.tilt = Math.max(0, this.pour);
    const f = this.flower;
    // Velocidad hacia el lado de verter (+) o de vuelta (−).
    const vOut = this.pourSign * velocity;
    this.flow = 0;

    switch (this.phase) {
      case 'neutral': {
        this.window.push({ t, angle, wrist });
        while (this.window.length && t - this.window[0].t > C.neutralMs) this.window.shift();
        const span = this.window.length > 1 ? this.window.at(-1).t - this.window[0].t : 0;
        const vals = this.window.map(s => s.angle), spread = Math.max(...vals) - Math.min(...vals);
        if ((span >= C.neutralMs * 0.9 && spread <= C.neutralToleranceDeg) || since >= C.neutralTimeoutMs) {
          this.neutral = mean(vals);
          const ws = this.window.map(s => s.wrist).filter(Boolean);
          this.wrist0 = ws.length ? { x: mean(ws.map(w => w.x)), y: mean(ws.map(w => w.y)) } : null;
          ev.push({ type: 'ready' }, this.newFlower(t));
        }
        break;
      }
      case 'water': {
        // En cuanto sale agua, la flor crece a un ritmo mínimo (35 %): nadie se atasca.
        const ratio = (this.tilt - this.pourStart) / C.pourRangeDeg;
        this.flow = ratio > 0 ? 0.35 + 0.65 * Math.min(1, ratio) : 0;
        if (this.flow > 0) {
          f.pourStartAt ??= t;
          f.pourMs += dt;
          f.growth = Math.min(1, f.growth + this.flow * C.growPerSecond * dt / 1000);
        } else if (f.pourStartAt === null && since >= C.adaptAfterMs) {
          // Adaptación: si no llega a regar, el agua empieza a salir con menos giro.
          const steps = 1 + Math.floor((since - C.adaptAfterMs) / C.adaptEveryMs);
          this.pourStart = Math.max(C.pourMinStartDeg, f.startThresholdDeg - steps * C.adaptStepDeg);
        }
        f.peakTiltDeg = Math.max(f.peakTiltDeg, this.tilt);
        f.peakOppositeDeg = Math.max(f.peakOppositeDeg, -this.pour);
        f.peakVelIn = Math.max(f.peakVelIn, vOut);
        f.samples.push([Math.round(t), Math.round(this.rel * 10) / 10]);
        if (wrist && this.wrist0 && Math.hypot(wrist.x - this.wrist0.x, wrist.y - this.wrist0.y) > C.compensationShift) f.compensation = true;
        if (f.growth >= 1) { f.bloomAt = t; ev.push(this.set('bloom', t), { type: 'bloom', kind: f.kind }); }
        break;
      }
      case 'bloom': {
        f.peakVelOut = Math.max(f.peakVelOut, -vOut);
        f.samples.push([Math.round(t), Math.round(this.rel * 10) / 10]);
        if (since >= C.bloomMs) ev.push(this.set('return', t));
        break;
      }
      case 'return': {
        f.peakVelOut = Math.max(f.peakVelOut, -vOut);
        f.samples.push([Math.round(t), Math.round(this.rel * 10) / 10]);
        if (this.pour <= this.returnDeg) {
          f.returnAt = t;
          if (this.index >= C.flowers.length - 1) ev.push(this.set('done', t), { type: 'done' });
          else ev.push(this.set('walk', t), { type: 'walk' });
        }
        break;
      }
      case 'walk': {
        if (since >= C.walkMs) { this.index++; ev.push(this.newFlower(t)); }
        break;
      }
      default: break;
    }
    return ev;
  }

  // Avance de la caminata (0..1) para la escena.
  walkProgress(t) { return this.phase === 'walk' ? Math.min(1, (t - this.phaseAt) / this.C.walkMs) : 0; }
}
