// Inclinación de la mano «agarrando una regadera» (puño cerrado, pulgar arriba).
// Se mide la línea de los nudillos (índice MCP 5 → centro de anular/meñique MCP 13/17)
// en la imagen, con la relación de aspecto real. Puño recto = 0°; al verter hacia
// cualquier lado el ángulo crece (±). Es una rotación dentro del plano de la imagen:
// la cámara ve el puño de frente durante todo el giro (pronación/supinación).
// Puro (sin DOM).

import { handSize } from '../vision/hands.js';

export function knuckleTilt(landmarks, width, height) {
  if (!landmarks || landmarks.length < 21 || !(width > 0 && height > 0)) return null;
  const a = landmarks[5], b13 = landmarks[13], b17 = landmarks[17];
  const bx = (b13.x + b17.x) / 2, by = (b13.y + b17.y) / 2;
  const dx = (bx - a.x) * width, dy = (by - a.y) * height;
  const len = Math.hypot(dx, dy);
  // Tamaño de referencia que no se colapsa en escorzo (puño de jarra con el antebrazo
  // hacia la cámara): solo baja la calidad cuando la mano se pone de canto.
  const size = handSize(landmarks, width, height);
  if (!(len > 1e-3) || !(size > 1e-3)) return null;
  return { angle: Math.atan2(-dx, dy) * 180 / Math.PI, quality: Math.min(1, len / (size * 0.45)) };
}

// Suavizado del ángulo con velocidad; si la medida es de baja calidad (mano de
// perfil un instante) se mantiene el último valor en vez de dar saltos.
export class TiltFilter {
  constructor(alpha = 0.35, minQuality = 0.35) { this.alpha = alpha; this.minQuality = minQuality; this.reset(); }
  reset() { this.value = null; this.velocity = 0; this.t = null; }
  update(m, t) {
    if (!m) return this.value;
    if (this.value === null) { this.value = m.angle; this.t = t; return this.value; }
    if (m.quality < this.minQuality) return this.value;
    const prev = this.value, dt = (t - this.t) / 1000;
    let d = m.angle - prev;
    if (d > 180) d -= 360; else if (d < -180) d += 360;
    this.value = prev + this.alpha * d;
    if (dt > 0) this.velocity += 0.3 * ((this.value - prev) / dt - this.velocity);
    this.t = t;
    return this.value;
  }
}
