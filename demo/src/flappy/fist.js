// Detector de puño y suavizado portados tal cual de FlappyVaina
// (lib/fist-detector.ts y el EMA de components/FlappyGame.tsx). Puro (sin DOM).

import { FLAPPY_CONFIG } from './config.js';

const DEFAULT = FLAPPY_CONFIG.fist;
const dist3D = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

// Misma proyección a coordenadas de escena que el original (afecta a la razón 3D).
export function mapLandmarks(raw) {
  return raw.map(lm => ({ x: -(lm.x - 0.5) * 3.0, y: -(lm.y - 0.5) * 2.0 - 0.2, z: -lm.z * 0.5 }));
}

export class HandSmoother {
  constructor(C = DEFAULT, zFactor = 0.35) { this.C = C; this.zFactor = zFactor; this.prev = []; this.lostFrames = 0; }
  reset() { this.prev = []; this.lostFrames = 0; }
  smooth(raw) {
    const a = this.C.emaAlpha;
    if (!raw) {
      if (this.prev.length && this.lostFrames < this.C.maxLostFrames) {
        this.lostFrames++;
        return this.prev.map(l => ({ ...l }));
      }
      this.prev = [];
      return null;
    }
    this.lostFrames = 0;
    if (!this.prev.length) { this.prev = raw.map(l => ({ ...l })); return raw; }
    this.prev = raw.map((l, i) => {
      const p = this.prev[i];
      return { x: p.x + a * (l.x - p.x), y: p.y + a * (l.y - p.y), z: p.z + a * this.zFactor * (l.z - p.z) };
    });
    return this.prev.map(l => ({ ...l }));
  }
}

// Fuerza 0 (mano abierta) … 1 (puño cerrado) a partir de la distancia media
// yema–MCP de índice, medio, anular y meñique normalizada por muñeca–MCP medio.
export function measureFist(landmarks, C = DEFAULT) {
  if (!landmarks || landmarks.length < 21) return { state: 'open', strength: 0, averageRatio: 1, valid: false };
  const palm = dist3D(landmarks[0], landmarks[9]);
  if (palm < 0.001) return { state: 'open', strength: 0, averageRatio: 1, valid: false };
  const averageRatio = (dist3D(landmarks[8], landmarks[5]) + dist3D(landmarks[12], landmarks[9]) +
    dist3D(landmarks[16], landmarks[13]) + dist3D(landmarks[20], landmarks[17])) / 4 / palm;
  const strength = Math.max(0, Math.min(1, (C.openThreshold - averageRatio) / (C.openThreshold - C.closeThreshold)));
  return { state: strength > 0.5 ? 'closed' : 'open', strength, averageRatio, valid: true };
}

// --- Puño real (3D) ---
// Problema del detector original: bajar los dedos (doblarlos por los nudillos o
// solo encogerlos) ya acercaba las yemas a los nudillos en la imagen y contaba
// como «propulsión máxima». Aquí se usan los landmarks 3D (world, en metros) y se
// exige que cada dedo esté doblado por el NUDILLO (MCP) y por las falanges
// (PIP + DIP) a la vez, que es lo que define un puño.
const FINGERS = [[5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]];
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
function angleDeg(u, v) {
  const d = u.x * v.x + u.y * v.y + u.z * v.z, n = Math.hypot(u.x, u.y, u.z) * Math.hypot(v.x, v.y, v.z);
  return n > 0 ? Math.acos(Math.max(-1, Math.min(1, d / n))) * 180 / Math.PI : 0;
}
const ramp = (v, lo, hi) => Math.max(0, Math.min(1, (v - lo) / (hi - lo)));

export function fingerFlexion(world) {
  return FINGERS.map(([mcp, pip, dip, tip]) => {
    const meta = sub(world[mcp], world[0]), prox = sub(world[pip], world[mcp]);
    const mid = sub(world[dip], world[pip]), dist = sub(world[tip], world[dip]);
    return { mcp: angleDeg(meta, prox), pip: angleDeg(prox, mid), dip: angleDeg(mid, dist) };
  });
}

export function measureFistCurl(world, C = DEFAULT) {
  if (!world || world.length < 21 || !world.every(p => [p.x, p.y, p.z].every(Number.isFinite))) {
    return { state: 'open', strength: 0, valid: false, fingers: null };
  }
  const fingers = fingerFlexion(world);
  const per = fingers.map(f => Math.min(ramp(f.mcp, C.mcpOpenDeg, C.mcpClosedDeg), ramp(f.pip + f.dip, C.curlOpenDeg, C.curlClosedDeg)));
  const strength = ramp(per.reduce((a, b) => a + b, 0) / per.length, C.strengthFloor, C.strengthFull);
  return { state: strength > 0.5 ? 'closed' : 'open', strength, valid: true, fingers, perFinger: per };
}
