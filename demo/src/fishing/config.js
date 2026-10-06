// Configuración de «El zorro pescador»: extensión/flexión de muñeca.
// Postura: codo apoyado, mano vertical «de canto» (como para dar la mano). Mano hacia
// fuera (dorso por delante) = extensión; hacia dentro (palma por delante) = flexión.
// Se descartó la mano boca abajo: apuntando a la cámara solo se ven las yemas y se
// pierde la detección. Sin gravedad en contra: no es idéntico al ítem del Fugl-Meyer.
// Todos los objetivos se escalan al rango medido en la calibración de cada paciente.

export const FISHING_CONFIG = Object.freeze({
  protocol: 'fixedgap-fishing-wrist-v2',
  algorithm: '2.0.0',
  posture: 'handshake',
  // +1: con la mano derecha en vista espejo, la extensión mueve la mano a la derecha.
  extensionSign: 1,

  // --- Filtro del ángulo (grados) ---
  angleAlpha: 0.35,
  velocityAlpha: 0.3,

  // --- Calibración ---
  restMs: 1500, // mano quieta en reposo
  restToleranceDeg: 8,
  calibMinDeg: 8, // movimiento mínimo para dar por buena una dirección
  calibPlateauMs: 1000, // sin superar el máximo durante este tiempo = fin
  calibTimeoutMs: 7000,
  minRangeDeg: 5, // rango mínimo para escalar (pacientes con muy poco movimiento)
  returnMs: 400,

  // --- Umbrales relativos al rango del paciente ---
  castFraction: 0.5, // bajar ≥ 50 % del rango de flexión = lanzar
  neutralFraction: 0.35, // ±35 % del rango = «mano relajada»
  neutralMinDeg: 6,
  hookFraction: 0.5, // subir ≥ 50 % del rango de extensión = enganchar
  hookMinDeg: 6,
  onsetVelocity: 25, // °/s: inicio del movimiento tras «¡Pica!»
  biteWindowMs: 5000, // si no engancha, el pez vuelve a intentarlo (sin penalizar)
  castAnimMs: 900,
  nibbleLeadMs: 900,
  caughtMs: 1800,
  compensationShift: 0.08, // la muñeca se desplaza en la imagen = mueve el brazo, no la muñeca

  // --- Peces (secuencia fija: sesiones comparables) ---
  // band: zona verde como fracción del rango de extensión; holdMs: tiempo dentro.
  fishTypes: Object.freeze({
    small: { name: 'Perca', band: [0.25, 0.55], holdMs: 2500 },
    medium: { name: 'Trucha', band: [0.45, 0.75], holdMs: 3000 },
    big: { name: 'Salmón', band: [0.65, 0.95], holdMs: 3500 },
  }),
  sequence: Object.freeze(['small', 'medium', 'small', 'big', 'medium', 'big']),
  waitDelaysMs: Object.freeze([2000, 2800, 1800, 3200, 2400, 2600]),
  minBandDeg: 6,

  // --- Sesión ---
  pauseAfterLossMs: 800,
});
