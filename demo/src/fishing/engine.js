// Motor de «El zorro pescador». Puro (sin DOM): recibe el ángulo de la muñeca ya
// filtrado y avanza la calibración y las rondas. Fases:
//   calib-rest → calib-up → calib-down → calib-return →
//   (cast → casting → wait → bite → reel → caught) × 6 → done
// Nada penaliza: si no engancha a tiempo, el pez vuelve a picar más tarde.

import { FISHING_CONFIG } from './config.js';

const mean = a => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);

export class FishingEngine {
  constructor(C = FISHING_CONFIG) {
    this.C = C;
    this.phase = 'calib-rest';
    this.phaseAt = null;
    this.calib = { neutral: null, sign: 1, extRange: null, flexRange: null, maxRel: 0, minRel: 0, wrist0: null, lowRange: false };
    this.rounds = [];
    this.roundIndex = 0;
    this.window = [];
    this.lastT = null;
    this.rel = 0;
  }

  get fish() { return this.C.fishTypes[this.C.sequence[this.roundIndex]] ?? null; }
  get round() { return this.rounds[this.roundIndex] ?? null; }

  thresholds() {
    const C = this.C, { extRange, flexRange } = this.calib;
    if (extRange === null) return null;
    const fish = this.fish;
    const band = fish ? fish.band.map(f => f * extRange) : [0, 0];
    if (band[1] - band[0] < C.minBandDeg) { const mid = (band[0] + band[1]) / 2; band[0] = mid - C.minBandDeg / 2; band[1] = mid + C.minBandDeg / 2; }
    return {
      cast: -Math.max(C.minRangeDeg, C.castFraction * flexRange),
      neutralLo: -Math.max(C.neutralMinDeg, C.neutralFraction * flexRange),
      neutralHi: Math.max(C.neutralMinDeg, C.neutralFraction * extRange),
      hook: Math.max(C.hookMinDeg, C.hookFraction * extRange),
      band,
    };
  }

  set(phase, t) { this.phase = phase; this.phaseAt = t; this.p = {}; return { type: 'phase', phase }; }

  newRound(t) {
    const key = this.C.sequence[this.roundIndex];
    this.rounds[this.roundIndex] = {
      index: this.roundIndex, fish: key, startedAt: t, castAt: null, castFlexionDeg: 0,
      biteAt: null, onsetAt: null, hookAt: null, peakVelocity: 0, peakExtensionDeg: 0,
      caughtAt: null, inBandMs: 0, reelMs: 0, holdSamples: [], missedBites: 0, compensation: false,
      band: null,
    };
    return this.set('cast', t);
  }

  // Avanza con un fotograma válido. Devuelve la lista de eventos ocurridos.
  update({ t, angle, velocity = 0, wrist = null }) {
    const C = this.C, ev = [];
    if (this.phaseAt === null) this.phaseAt = t;
    const dt = this.lastT === null ? 0 : Math.max(0, Math.min(250, t - this.lastT));
    this.lastT = t;
    const cal = this.calib;
    const rel = cal.neutral === null ? 0 : cal.sign * (angle - cal.neutral);
    this.rel = rel;
    const th = this.thresholds();
    const r = this.round;
    const since = t - this.phaseAt;

    switch (this.phase) {
      case 'calib-rest': {
        this.window.push({ t, angle, wrist });
        while (this.window.length && t - this.window[0].t > C.restMs) this.window.shift();
        const vals = this.window.map(s => s.angle);
        const span = this.window.length > 1 ? this.window.at(-1).t - this.window[0].t : 0;
        if (span >= C.restMs * 0.9 && Math.max(...vals) - Math.min(...vals) <= C.restToleranceDeg) {
          cal.neutral = mean(vals);
          const ws = this.window.map(s => s.wrist).filter(Boolean);
          cal.wrist0 = ws.length ? { x: mean(ws.map(w => w.x)), y: mean(ws.map(w => w.y)) } : null;
          ev.push(this.set('calib-up', t));
        }
        break;
      }
      case 'calib-up': {
        // Se aceptan las dos direcciones: si al pedir «hacia fuera» el ángulo va al revés
        // (cámara, mano izquierda…), se invierte el signo para el resto de la partida.
        const peak = Math.max(rel, -rel);
        if (peak > (this.p.peak ?? 0)) { this.p.peak = peak; this.p.peakSign = rel >= 0 ? 1 : -1; this.p.lastMax = t; }
        const moved = (this.p.peak ?? 0) >= C.calibMinDeg;
        if ((moved && t - (this.p.lastMax ?? t) >= C.calibPlateauMs) || since >= C.calibTimeoutMs) {
          if (moved && this.p.peakSign < 0) cal.sign = -1;
          cal.maxRel = this.p.peak ?? 0;
          cal.extRange = Math.max(C.minRangeDeg, cal.maxRel);
          if (!moved) cal.lowRange = true;
          ev.push(this.set('calib-down', t));
        }
        break;
      }
      case 'calib-down': {
        if (rel < cal.minRel) { cal.minRel = rel; this.p.lastMin = t; }
        const moved = -cal.minRel >= C.calibMinDeg;
        if ((moved && t - (this.p.lastMin ?? t) >= C.calibPlateauMs) || since >= C.calibTimeoutMs) {
          cal.flexRange = Math.max(C.minRangeDeg, -cal.minRel);
          if (!moved) cal.lowRange = true;
          ev.push(this.set('calib-return', t), { type: 'calibrated', calib: { ...cal } });
        }
        break;
      }
      case 'calib-return': {
        const t2 = this.thresholds();
        const ok = rel >= t2.neutralLo && rel <= t2.neutralHi;
        this.p.okMs = ok ? (this.p.okMs ?? 0) + dt : 0;
        if (this.p.okMs >= C.returnMs) ev.push(this.newRound(t));
        break;
      }
      case 'cast': {
        if (rel <= th.cast) {
          r.castAt = t; r.castFlexionDeg = Math.max(r.castFlexionDeg, -rel);
          ev.push(this.set('casting', t), { type: 'cast' });
        }
        break;
      }
      case 'casting': {
        r.castFlexionDeg = Math.max(r.castFlexionDeg, -rel);
        if (since >= C.castAnimMs) ev.push(this.set('wait', t));
        break;
      }
      case 'wait': {
        const ok = rel >= th.neutralLo && rel <= th.neutralHi;
        this.p.neutralMs = (this.p.neutralMs ?? 0) + (ok ? dt : 0);
        const delay = 600 + (C.waitDelaysMs[this.roundIndex] ?? 2000);
        this.nibbling = this.p.neutralMs >= delay - C.nibbleLeadMs;
        if (this.p.neutralMs >= delay) {
          r.biteAt = t; r.onsetAt = null; r.peakVelocity = 0;
          this.nibbling = false;
          ev.push(this.set('bite', t), { type: 'bite' });
        }
        break;
      }
      case 'bite': {
        if (r.onsetAt === null && (velocity >= C.onsetVelocity || rel > th.neutralHi + 3)) r.onsetAt = t;
        r.peakVelocity = Math.max(r.peakVelocity, velocity);
        r.peakExtensionDeg = Math.max(r.peakExtensionDeg, rel);
        if (rel >= th.hook) {
          r.hookAt = t; r.band = [...th.band];
          ev.push(this.set('reel', t), { type: 'hooked' });
        } else if (since >= C.biteWindowMs) {
          r.missedBites++;
          ev.push(this.set('wait', t), { type: 'missed' });
        }
        break;
      }
      case 'reel': {
        r.peakExtensionDeg = Math.max(r.peakExtensionDeg, rel);
        r.reelMs += dt;
        const inBand = rel >= r.band[0] && rel <= r.band[1];
        this.inBand = inBand;
        this.bandSide = inBand ? 0 : rel < r.band[0] ? -1 : 1;
        if (inBand) { r.inBandMs += dt; r.holdSamples.push({ t, rel }); }
        if (wrist && cal.wrist0 && Math.hypot(wrist.x - cal.wrist0.x, wrist.y - cal.wrist0.y) > C.compensationShift) r.compensation = true;
        if (r.inBandMs >= this.fish.holdMs) {
          r.caughtAt = t; this.inBand = false;
          ev.push(this.set('caught', t), { type: 'caught', fish: r.fish });
        }
        break;
      }
      case 'caught': {
        if (since >= C.caughtMs) {
          this.roundIndex++;
          ev.push(this.roundIndex >= C.sequence.length ? this.set('done', t) : this.newRound(t));
          if (this.phase === 'done') ev.push({ type: 'done' });
        }
        break;
      }
      default: break;
    }
    return ev;
  }

  // Progreso de la ronda actual (0..1) para la escena.
  get reelProgress() { const r = this.round, f = this.fish; return r && f ? Math.min(1, r.inBandMs / f.holdMs) : 0; }
  get calibrating() { return this.phase.startsWith('calib'); }
}
