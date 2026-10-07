// Encuadre de la mano: el modelo es robusto a luz y desenfoque, pero falla cuando la
// palma no se ve entera (mano demasiado cerca de la cámara o en el borde inferior,
// típico con el portátil delante). Aquí se evalúa el encuadre a partir de los
// landmarks y se da una indicación sencilla. Puro (sin DOM).

import { isPlausibleHand } from '../vision/hands.js';

export const FRAMING = Object.freeze({
  edge: 0.03, // a menos de esto del borde = cortada
  maxHeight: 0.62, // más alta que esto = demasiado cerca
  minHeight: 0.18, // más baja = demasiado lejos
  darkLuminance: 40,
});

export function handBox(landmarks) {
  if (!landmarks?.length) return null;
  const xs = landmarks.map(p => p.x), ys = landmarks.map(p => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  return { x0, x1, y0, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}

// `box`: caja de la mano detectada (o la última vista si ahora no se detecta).
export function framingHint({ box = null, detected = false, luminance = 120 } = {}, F = FRAMING) {
  if (!detected && luminance < F.darkLuminance) return { ok: false, code: 'dark', text: 'Hay poca luz. Enciende una luz o ponte de cara a una ventana.' };
  if (box) {
    const nearEdge = { bottom: 1 - box.y1 < F.edge, top: box.y0 < F.edge, left: box.x0 < F.edge, right: 1 - box.x1 < F.edge };
    if (box.h > F.maxHeight || ((nearEdge.top || nearEdge.bottom) && box.h > 0.45)) return { ok: false, code: 'close', text: 'Aleja un poco la mano de la cámara.' };
    if (nearEdge.bottom) return { ok: false, code: 'low', text: 'Sube un poco la mano.' };
    if (nearEdge.top) return { ok: false, code: 'high', text: 'Baja un poco la mano.' };
    if (nearEdge.left || nearEdge.right) return { ok: false, code: 'side', text: 'Lleva la mano hacia el centro.' };
    if (detected && box.h < F.minHeight) return { ok: false, code: 'far', text: 'Acerca un poco la mano.' };
    if (detected) return { ok: true, code: 'ok', text: '¡Perfecto! Mantén la mano así.' };
  }
  return { ok: false, code: 'missing', text: 'Pon la mano delante de la cámara, con la palma hacia la pantalla.' };
}

// Recuerda la última caja vista para explicar por qué se ha perdido la mano.
export class FramingTracker {
  constructor() { this.box = null; this.seenAt = null; this.detected = false; this.luminance = 120; }
  update(frame) {
    // Con dos manos en imagen, se evalúa la plausible más grande (la del paciente, más cerca).
    const hand = (frame.hands || []).filter(h => isPlausibleHand(h, frame.width || 640, frame.height || 480).ok)
      .map(h => ({ h, b: handBox(h.landmarks) })).sort((a, b) => b.b.h - a.b.h)[0]?.h;
    this.detected = !!hand; this.luminance = frame.luminance ?? 120;
    if (hand) { this.box = handBox(hand.landmarks); this.seenAt = frame.t; }
    return this.hint();
  }
  hint() { return framingHint({ box: this.box, detected: this.detected, luminance: this.luminance }); }
}
