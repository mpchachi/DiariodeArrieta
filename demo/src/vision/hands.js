// Calidad e identidad de la mano, comunes a todos los juegos. Puro (sin DOM).
//  - isPlausibleHand: descarta detecciones anatómicamente imposibles (esqueleto
//    colapsado, dedos más largos que el brazo, coordenadas absurdas…) antes de que
//    lleguen al juego o a las métricas.
//  - HandTracker: sigue SIEMPRE a la misma mano entre fotogramas (continuidad
//    espacial), aunque aparezca la otra mano o la de otra persona. Señala cuándo
//    cambia de mano (`switched`) para que el juego reinicie sus filtros, y descarta
//    saltos de un solo fotograma (`glitch`).

export const VISION = Object.freeze({
  minScore: 0.35, // confianza mínima de la mano (el modelo ya filtra a 0,4)
  minPalmPx: 14, // tamaño de mano mínimo en píxeles (ver handSize)
  coordMargin: 0.25, // landmarks fuera de [−0,25, 1,25] = basura
  maxBoneRatio: 1.3, // ningún hueso del dedo puede medir más que 1,3 «tamaños de mano»
  maxFingerRatio: 2.8, // ni un dedo entero más de 2,8
  // Identidad
  lostMs: 600, // tras este tiempo sin la mano, se acepta una mano nueva
  gateBasePalms: 1.6, // la misma mano no se mueve más de esto entre fotogramas…
  gatePalmsPerSecond: 9, // …más esto por segundo transcurrido
  maxScaleJump: 2.2, // ni cambia de tamaño más de ×2,2 de golpe (con el tamaño robusto)
  glitchConfirmFrames: 3, // un salto se acepta como real si se repite 3 fotogramas
});

const FINGERS = [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]];
const px = (a, b, w, h) => Math.hypot((a.x - b.x) * w, (a.y - b.y) * h);

// Tamaño de la mano en la imagen que NO se colapsa al girarla. La longitud de la palma
// (muñeca → nudillo medio) se acorta mucho cuando el antebrazo apunta a la cámara —p. ej.
// al coger una jarra—; la línea de nudillos (5–17) se acorta cuando la mano se pone de
// canto. Se toma la mayor de varias medidas (la de nudillos, escalada a «palmas»).
export function handSize(lm, width, height) {
  return Math.max(px(lm[0], lm[9], width, height), px(lm[0], lm[5], width, height), px(lm[0], lm[17], width, height),
    px(lm[5], lm[17], width, height) * 1.25);
}

export function palmMetrics(lm, width, height) {
  const palm = handSize(lm, width, height);
  // Centro estable: muñeca + los cuatro nudillos.
  const ids = [0, 5, 9, 13, 17];
  const center = { x: ids.reduce((s, i) => s + lm[i].x, 0) / 5, y: ids.reduce((s, i) => s + lm[i].y, 0) / 5 };
  return { palm, center, palmWidth: px(lm[5], lm[17], width, height) };
}

// Devuelve { ok, reason }. Razones: malformed, low-score, out-of-frame, tiny, anatomy.
// Todo se mide respecto a handSize: una mano vista en escorzo (jarra, puño, de canto) es válida.
export function isPlausibleHand(hand, width, height, V = VISION) {
  const lm = hand?.landmarks;
  if (!Array.isArray(lm) || lm.length !== 21 || !(width > 0 && height > 0)) return { ok: false, reason: 'malformed' };
  if (!lm.every(p => p && Number.isFinite(p.x) && Number.isFinite(p.y))) return { ok: false, reason: 'malformed' };
  if (Number.isFinite(hand.score) && hand.score < V.minScore) return { ok: false, reason: 'low-score' };
  if (lm.some(p => p.x < -V.coordMargin || p.x > 1 + V.coordMargin || p.y < -V.coordMargin || p.y > 1 + V.coordMargin)) return { ok: false, reason: 'out-of-frame' };
  const palm = handSize(lm, width, height);
  if (!(palm >= V.minPalmPx)) return { ok: false, reason: 'tiny' };
  for (const f of FINGERS) {
    let total = 0;
    const chain = [f[0] === 1 ? 0 : f[0], ...f];
    for (let i = 1; i < chain.length; i++) {
      const bone = px(lm[chain[i - 1]], lm[chain[i]], width, height) / palm;
      if (bone > V.maxBoneRatio) return { ok: false, reason: 'anatomy' };
      total += bone;
    }
    if (total > V.maxFingerRatio) return { ok: false, reason: 'anatomy' };
  }
  return { ok: true, reason: 'ok' };
}

export class HandTracker {
  constructor({ preferred = null, required = false, V = VISION } = {}) { this.V = V; this.preferred = preferred; this.required = required; this.reset(); }
  reset() { this.track = null; this.pending = null; this.id = 0; this.rejected = null; }

  // frame: { t (ms), width, height, hands: [{ landmarks, handedness, score }] }
  // → { hand, reason, switched, id }. reason: ok | missing | implausible | jump | glitch
  select(frame) {
    const V = this.V, { width, height } = frame;
    const visible = frame.hands || [];
    const all = this.required && this.preferred ? visible.filter(h => h.handedness === this.preferred) : visible;
    if (!all.length && visible.length) return { hand: null, reason: 'wrong-hand', switched: false, id: this.id };
    const checks = all.map(h => isPlausibleHand(h, width, height, V));
    const cands = all.filter((h, i) => checks[i].ok).map(h => ({ hand: h, ...palmMetrics(h.landmarks, width, height) }));
    this.rejected = checks.find(c => !c.ok)?.reason ?? null;
    const tr = this.track, t = frame.t;
    const lost = !tr || t - tr.t > V.lostMs;
    if (!cands.length) return { hand: null, reason: all.length ? 'implausible' : 'missing', switched: false, id: this.id };

    if (lost) {
      // Mano nueva: la preferida (lateralidad elegida) si hay varias; si no, la más grande (la más cercana).
      const pref = this.preferred ? cands.filter(c => c.hand.handedness === this.preferred) : [];
      const pick = (pref.length ? pref : cands).reduce((a, b) => (b.palm > a.palm ? b : a));
      return this.accept(pick, t, true);
    }
    const dt = Math.max(0, t - tr.t) / 1000;
    const gate = (V.gateBasePalms + V.gatePalmsPerSecond * dt) * tr.palm;
    const scored = cands.map(c => ({ c, d: px(c.center, tr.center, width, height), s: Math.abs(Math.log(c.palm / tr.palm)) }));
    const near = scored.filter(x => x.d <= gate && x.s <= Math.log(V.maxScaleJump)).sort((a, b) => a.d - b.d)[0];
    if (near) { this.pending = null; return this.accept(near.c, t, false); }
    // Nada encaja con la mano seguida: puede ser un fallo de un fotograma o un cambio real.
    const best = scored.sort((a, b) => a.d - b.d)[0].c;
    const p = this.pending;
    if (p && px(best.center, p.center, width, height) <= gate) {
      p.count++; p.center = best.center;
      if (p.count >= V.glitchConfirmFrames) { this.pending = null; return this.accept(best, t, true); }
    } else this.pending = { center: best.center, count: 1 };
    return { hand: null, reason: cands.length > 1 ? 'jump' : 'glitch', switched: false, id: this.id };
  }

  accept(c, t, isNew) {
    if (isNew) this.id++;
    this.track = { t, center: c.center, palm: c.palm };
    return { hand: c.hand, reason: 'ok', switched: isNew && this.id > 1, id: this.id };
  }
}
