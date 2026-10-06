// Postura actual: «mano de canto» (como para dar la mano), codo apoyado. La extensión
// y la flexión mueven la mano en el plano de la imagen, así que se mide en 2D
// (`wristTilt`), que es lo más fiable con webcam. `wristPitch` (3D) se conserva
// para la postura boca abajo, descartada porque la cámara solo ve la punta de los dedos.

// Inclinación de la mano en la imagen (grados) respecto a la vertical, con la relación
// de aspecto real. Vector muñeca → centro de los nudillos. `sign` = +1 si la extensión
// mueve la mano hacia la derecha de la pantalla (mano derecha en vista espejo).
export function wristTilt(landmarks, width, height, sign = 1) {
  if (!landmarks || landmarks.length < 21 || !(width > 0 && height > 0)) return null;
  const w = landmarks[0];
  let dx = 0, dy = 0;
  for (const i of MCPS) { dx += (landmarks[i].x - w.x) * width; dy += (landmarks[i].y - w.y) * height; }
  if (!(Math.hypot(dx, dy) > 1e-3)) return null;
  return sign * Math.atan2(dx, -dy) * 180 / Math.PI;
}

// Inclinación de la mano (grados) a partir de los landmarks 3D de MediaPipe (world,
// en metros, ejes de la cámara: y hacia abajo). Se usa el vector muñeca → centro de
// los nudillos (MCP 5, 9, 13, 17): 0° = mano horizontal, + arriba (extensión),
// − abajo (flexión). Con el antebrazo apoyado y horizontal equivale al ángulo de la
// muñeca; el desfase de cada persona se elimina con la calibración en reposo.
// Puro (sin DOM).

const MCPS = [5, 9, 13, 17];

export function wristPitch(world) {
  if (!world || world.length < 21) return null;
  const w = world[0];
  let vx = 0, vy = 0, vz = 0;
  for (const i of MCPS) { vx += world[i].x - w.x; vy += world[i].y - w.y; vz += world[i].z - w.z; }
  const len = Math.hypot(vx, vy, vz);
  if (!(len > 1e-5)) return null;
  return Math.asin(Math.max(-1, Math.min(1, -vy / len))) * 180 / Math.PI;
}

// Suavizado exponencial del ángulo y de su velocidad (°/s).
export class AngleFilter {
  constructor(alpha = 0.35, velocityAlpha = 0.3) { this.alpha = alpha; this.va = velocityAlpha; this.reset(); }
  reset() { this.value = null; this.velocity = 0; this.t = null; }
  update(angle, t) {
    if (angle === null || !Number.isFinite(angle)) return null;
    if (this.value === null) { this.value = angle; this.t = t; return this.value; }
    const prev = this.value, dt = (t - this.t) / 1000;
    this.value = prev + this.alpha * (angle - prev);
    if (dt > 0) this.velocity += this.va * ((this.value - prev) / dt - this.velocity);
    this.t = t;
    return this.value;
  }
}
