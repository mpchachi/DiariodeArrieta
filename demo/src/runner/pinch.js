// Detección de pinza pulgar–índice para el Runner.
// Basado en la lógica validada del Pastillero v2, con dos cambios para juego:
//  - umbrales y tiempos parametrizables (respuesta más rápida al saltar),
//  - tolerancia a fotogramas inválidos sueltos sin perder la pinza en curso.
// Puro (sin DOM): se prueba con node --test.

import { RUNNER_CONFIG } from './config.js';
import { HandTracker } from '../vision/hands.js';

const DEFAULT = RUNNER_CONFIG.pinch;
const distance = (a, b, width, height) => Math.hypot((a.x - b.x) * width, (a.y - b.y) * height);
const failed = reason => ({ valid: false, eligible: false, ratio: null, reason });

// Con `strictQuality: false` solo se exige una mano con landmarks válidos; el
// resultado del control estricto se conserva en `quality` para el registro.
export function measurePinch(hand, frame, C = DEFAULT) {
  const strict = measureStrict(hand, frame, C);
  if (C.strictQuality || !hand || strict.reason === 'malformed') return strict;
  const p = hand.landmarks, { width, height } = frame;
  const palm = distance(p[0], p[9], width, height);
  if (!(palm > 0)) return failed('malformed');
  return { valid: true, eligible: true, ratio: distance(p[4], p[8], width, height) / palm,
    depthRatio: Math.abs(p[4].z - p[8].z) * width / palm, palmPixels: palm, reason: 'ok', quality: strict.reason };
}

function measureStrict(hand, frame, C) {
  if (!hand) return failed('missing');
  const p = hand.landmarks, { width, height, luminance } = frame;
  if (!(Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) ||
    !Array.isArray(p) || p.length !== 21 || !p.every(v => [v.x, v.y, v.z].every(Number.isFinite))) return failed('malformed');
  if (!Number.isFinite(hand.score) || hand.score < C.minHandedness) return failed('uncertain');
  if (!Number.isFinite(luminance) || luminance < C.minLuminance) return failed('dark');
  if (luminance > C.maxLuminance) return failed('bright');
  // Ver nota `allowPartialHand` en config.js (desactivado: se exige la mano completa).
  const checked = C.allowPartialHand ? C.partialHandRequired.map(i => p[i]) : p;
  const xs = checked.map(v => v.x), ys = checked.map(v => v.y);
  const palm = distance(p[0], p[9], width, height);
  if (palm > Math.min(width, height) * C.maxPalmScreenFraction ||
    Math.max(...xs) - Math.min(...xs) > C.maxHandScreenFraction ||
    Math.max(...ys) - Math.min(...ys) > C.maxHandScreenFraction) return failed('close');
  if (checked.some(v => v.x < C.edgeMargin || v.x > 1 - C.edgeMargin || v.y < C.edgeMargin || v.y > 1 - C.edgeMargin)) {
    return failed(C.allowPartialHand ? 'partial' : 'cropped');
  }
  if (palm < C.minPalmPixels) return failed('far');
  if (distance(p[5], p[17], width, height) / palm < C.minPalmWidthRatio) return failed('side');
  const ratio = distance(p[4], p[8], width, height) / palm;
  const depthRatio = Math.abs(p[4].z - p[8].z) * width / palm;
  const indexReach = distance(p[8], p[5], width, height) / palm;
  const reason = indexReach < C.minIndexReachRatio ? 'folded' :
    ratio <= C.closeRatio && depthRatio > C.maxTipDepthRatio ? 'depth' : 'ok';
  return { valid: true, eligible: reason === 'ok', ratio, depthRatio, palmPixels: palm, reason };
}

export class HandSelector {
  constructor(hand = 'Right', C = DEFAULT) { this.C = C; this.hand = hand; this.previous = null; this.tracker = new HandTracker({ preferred: hand }); }
  reset(hand = this.hand) { this.hand = hand; this.previous = null; this.tracker = new HandTracker({ preferred: hand }); }
  select(frame) {
    const C = this.C;
    if (!C.strictQuality) {
      // Cualquier mano plausible, siguiendo SIEMPRE a la misma (ver vision/hands.js).
      // `switched`: ha cambiado de mano → el juego debe reiniciar sus filtros.
      const r = this.tracker.select(frame);
      return { hand: r.hand, reason: r.hand ? 'ok' : r.reason, switched: r.switched };
    }
    const candidates = (frame.hands || []).filter(h => h.handedness === this.hand && h.score >= C.minHandedness && h.landmarks?.length === 21);
    if (!candidates.length) return { hand: null, reason: frame.hands?.some(h => h.handedness === this.hand) ? 'uncertain' : frame.hands?.length ? 'wrong' : 'missing' };
    if (candidates.length > 1) return { hand: null, reason: 'uncertain' };
    const h = candidates[0], p = h.landmarks;
    const palm = distance(p[0], p[9], frame.width, frame.height);
    const center = { x: (p[0].x + p[9].x) / 2, y: (p[0].y + p[9].y) / 2 };
    const prev = this.previous;
    if (prev && frame.t - prev.t < C.identityTimeoutMs) {
      const dt = Math.max(0, frame.t - prev.t) / 1000;
      const move = distance(center, prev.center, frame.width, frame.height) / Math.max(prev.palm, 1);
      if (move > C.identityBasePalmLengths + C.identityPalmLengthsPerSecond * dt ||
        Math.abs(Math.log(palm / prev.palm)) > C.maxScaleLogJump) return { hand: null, reason: 'jump' };
    }
    if (Number.isFinite(palm) && palm > 0) this.previous = { t: frame.t, center, palm };
    return { hand: h, reason: 'ok' };
  }
}

// Estados: acquiring -> open (armado) -> closed (pinza) -> open ...
// Eventos: 'grab' al cerrar (salto) y 'release' al volver a abrir (ciclo completo).
export class PinchController {
  constructor(C = DEFAULT) { this.C = C; this.reset(); }
  reset() {
    this.state = 'acquiring'; this.qualitySince = null; this.pending = null;
    this.lastT = null; this.lastValidT = null; this.openAt = null; this.closedAt = null;
    this.lastOpenT = null; this.maximum = 0; this.minimum = Infinity; this.afterRelease = false;
  }
  snapshot(event) {
    return { state: this.state, event, ready: this.state !== 'acquiring', held: this.state === 'closed' };
  }
  update(m, t) {
    const C = this.C;
    if (!Number.isFinite(t) || (this.lastT !== null && t <= this.lastT)) return this.snapshot(null);
    this.lastT = t;
    const valid = m.valid && m.eligible && Number.isFinite(m.ratio);
    if (!valid) {
      if (this.lastValidT === null || t - this.lastValidT > C.lossToleranceMs) { this.reset(); this.lastT = t; }
      return this.snapshot(null);
    }
    if (this.lastValidT !== null && t - this.lastValidT > C.maxGapMs) { this.reset(); this.lastT = t; }
    this.lastValidT = t;
    if (this.qualitySince === null) this.qualitySince = t;
    const open = m.ratio >= C.openRatio;
    const closed = m.ratio <= C.closeRatio;
    if (open) this.lastOpenT = t;
    if (this.state === 'acquiring') {
      if (!open) this.pending = null;
      else if (!this.pending) this.pending = { since: t };
      if (this.pending && t - this.qualitySince >= C.stableMs && t - this.pending.since >= C.stableMs / 2) {
        this.state = 'open'; this.openAt = t; this.maximum = m.ratio; this.pending = null;
      }
      return this.snapshot(null);
    }
    if (this.state === 'open') {
      this.maximum = Math.max(this.maximum, m.ratio);
      if (!closed) this.pending = null;
      else if (!this.pending) this.pending = { since: t };
      // Tras soltar (aunque sea a medias) basta un recorrido corto para volver a cerrar.
      const excursion = this.afterRelease ? (C.regrabExcursion ?? C.minExcursion) : C.minExcursion;
      if (this.pending && t - this.pending.since >= C.closeMs && this.maximum - m.ratio >= excursion) {
        this.state = 'closed'; this.closedAt = t; this.minimum = m.ratio; this.pending = null;
        const closingMs = this.lastOpenT !== null ? t - this.lastOpenT : null;
        return this.snapshot({ type: 'grab', t, ratio: m.ratio, maximum: this.maximum, closingMs,
          fullOpen: this.maximum >= C.openRatio });
      }
      return this.snapshot(null);
    }
    this.minimum = Math.min(this.minimum, m.ratio);
    // Suelta: separar un poco basta (no hace falta abrir del todo).
    const released = C.releaseRatio === undefined ? open
      : m.ratio >= C.releaseRatio && m.ratio >= this.minimum + (C.releaseDelta ?? 0);
    if (!released) this.pending = null;
    else if (!this.pending) this.pending = { since: t };
    if (this.pending && t - this.pending.since >= C.releaseMs) {
      const event = { type: 'release', t, startedAt: this.openAt, closedAt: this.closedAt,
        holdMs: this.pending.since - this.closedAt, durationMs: t - this.openAt,
        amplitude: this.maximum - this.minimum, minimum: this.minimum, maximum: this.maximum };
      this.state = 'open'; this.openAt = t; this.maximum = m.ratio; this.minimum = Infinity; this.pending = null;
      this.afterRelease = true;
      return this.snapshot(event);
    }
    return this.snapshot(null);
  }
}
