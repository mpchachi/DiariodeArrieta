// «El huerto del zorro»: pronación/supinación (gesto de verter con una regadera).
// Postura: mano cerrada como agarrando el asa, pulgar arriba; solo se inclina, no se
// desplaza. Sin calibración visible: «recto» = cómo está la mano al empezar.
// Se elige la mano al empezar: la escena se gira para que verter sea siempre el giro
// natural hacia dentro (pronación). Nada se pierde.

export const GARDEN_CONFIG = Object.freeze({
  protocol: 'fixedgap-garden-tilt-v1',
  algorithm: '1.0.0',
  flowers: Object.freeze(['tulip', 'daisy', 'sunflower', 'lavender', 'rose']),

  // --- Medida ---
  tiltAlpha: 0.35,
  minQuality: 0.35, // por debajo (mano de perfil un instante) se mantiene el último ángulo

  // --- «Recto» automático ---
  neutralMs: 800, // mano quieta este tiempo = posición recta
  neutralToleranceDeg: 10,
  neutralTimeoutMs: 4000, // si no se queda quieta, se usa la media igualmente

  // --- Regar ---
  pourStartDeg: 25, // empieza a salir agua
  pourMinStartDeg: 12, // mínimo tras adaptarse (pacientes con poco giro)
  pourRangeDeg: 35, // de «empieza» a «chorro máximo»
  adaptAfterMs: 6000, // si no consigue regar en este tiempo, el umbral baja…
  adaptStepDeg: 4, // …estos grados cada `adaptEveryMs`
  adaptEveryMs: 3000,
  growPerSecond: 0.5, // con chorro máximo, una flor crece en 2 s

  // --- Ritmo ---
  bloomMs: 1300,
  returnDeg: 12, // «mano recta otra vez» (también ≤ mitad del umbral de regar)
  walkMs: 2400,
  potSpacing: 84, // px del mundo entre flores

  compensationShift: 0.1, // la muñeca se desplaza en la imagen = mueve el brazo
  pauseAfterLossMs: 1200,
});
