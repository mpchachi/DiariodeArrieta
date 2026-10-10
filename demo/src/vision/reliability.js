// Fiabilidad de las medidas de una partida (común a los tres juegos). Puro (sin DOM).
// Cuenta, fotograma a fotograma mientras se juega:
//  - Mano detectada: hay una mano válida y es la que se sigue.
//  - Descartadas: había una mano en la imagen pero se descartó (forma imposible, salto
//    brusco o cambio de mano de un solo fotograma). Muchas = detección inestable.
//  - Encuadre correcto: de los fotogramas con mano, los que no estaban demasiado cerca,
//    lejos, en un borde o con poca luz (ver pack/framing.js).
// El nivel (alta / media / baja) es un criterio interno de FixedGap, no un estándar:
// se muestra siempre junto a sus tres componentes.

import { handSize } from './hands.js';

export const RELIABILITY = Object.freeze({
  high: { detected: 90, rejected: 5, framing: 80 },
  low: { detected: 75, rejected: 15, framing: 50 },
  // «Demasiado lejos» se decide por el tamaño de la palma (no cambia al cerrar el puño), no por
  // la altura de la caja de la mano, que con el puño o la regadera es la mitad que con la mano
  // abierta. Palma < 8 % del alto de la imagen ≈ mano a más de ~1,5 m de una webcam normal.
  minPalmFrac: 0.08,
});

const pct = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);

export function reliabilityLevel({ detectedPct, rejectedPct, framingOkPct }, R = RELIABILITY) {
  if (detectedPct == null) return null;
  const reasons = [];
  if (detectedPct < R.high.detected) reasons.push('detected');
  if ((rejectedPct ?? 0) > R.high.rejected) reasons.push('rejected');
  if (framingOkPct != null && framingOkPct < R.high.framing) reasons.push('framing');
  const low = detectedPct < R.low.detected || (rejectedPct ?? 0) > R.low.rejected || (framingOkPct != null && framingOkPct < R.low.framing);
  return { level: low ? 'low' : reasons.length ? 'medium' : 'high', reasons };
}

export class ReliabilityMeter {
  constructor() { this.reset(); }
  reset() { this.frames = 0; this.detected = 0; this.rejected = 0; this.framed = 0; this.issues = {}; }

  /**
   * @param {{ reason: string, handsInFrame: number, hint?: { ok: boolean, code: string }, hand?: object, width?: number, height?: number }} s
   *   reason: resultado del seguimiento ('ok' = mano válida seguida; 'implausible' | 'jump' | 'glitch' = descartada; 'missing' = no hay mano).
   */
  add({ reason, handsInFrame = 0, hint = null, hand = null, width = 640, height = 480 }) {
    this.frames++;
    if (reason === 'ok') {
      this.detected++;
      const farButFine = hint?.code === 'far' && hand?.landmarks?.length === 21 && handSize(hand.landmarks, width, height) / height >= RELIABILITY.minPalmFrac;
      if (hint?.ok || farButFine) this.framed++;
      else if (hint?.code) this.issues[hint.code] = (this.issues[hint.code] || 0) + 1;
    } else if (handsInFrame > 0) this.rejected++;
  }

  summary() {
    if (!this.frames) return null;
    const out = {
      frames: this.frames,
      detectedPct: pct(this.detected, this.frames),
      rejectedPct: pct(this.rejected, this.frames),
      framingOkPct: pct(this.framed, this.detected),
      framingIssues: Object.fromEntries(Object.entries(this.issues).map(([k, v]) => [k, pct(v, this.detected)])),
    };
    return { ...out, ...reliabilityLevel(out) };
  }
}
