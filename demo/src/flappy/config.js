// Configuración del Flappy (portado de FlappyVaina): ahora el zorro en globo, controlado con el puño.
// Valores originales anotados donde se han cambiado para la versión fácil.

export const FLAPPY_CONFIG = Object.freeze({
  protocol: 'fixedgap-flappy-fist-v3',
  algorithm: '3.0.0',

  // --- Detector de puño (idéntico a FlappyVaina/lib/fist-detector.ts) ---
  fist: Object.freeze({
    closeThreshold: 0.38,
    openThreshold: 0.65,
    emaAlpha: 0.55,
    maxLostFrames: 12,
    activationOn: 0.5,
    activationOff: 0.4,
    // Puño 3D (ver measureFistCurl): ángulos de flexión en grados (0 = dedo recto).
    // Cada dedo cuenta como cerrado solo si dobla nudillo Y falanges.
    // Calibrado con fotos reales: puño ≈ 40–65° en nudillos y 150–190° en falanges;
    // mano abierta ≈ 20–37° y < 40°.
    mcpOpenDeg: 30,
    mcpClosedDeg: 50,
    curlOpenDeg: 50,
    curlClosedDeg: 140,
    // Media de los 4 dedos → fuerza: por debajo de `strengthFloor` = 0, desde `strengthFull` = 1.
    strengthFloor: 0.15,
    strengthFull: 0.9,
  }),

  // --- Motor (unidades del juego; la escena pixel usa `pxPerUnit`) ---
  // Versión «zorro en globo»: tamaños ajustados a los sprites (globo ≈ 26 px,
  // cipreses ≈ 20 px). Física del original: puño = empuje, gravedad suave.
  pxPerUnit: 46,
  planeX: -0.4,
  // Caja del globo con cesta (≈ 28×48 px) alrededor de su centro (original avión: círculo de 0.06).
  planeHalfWidth: 0.28,
  planeUp: 0.5,
  planeDown: 0.5,
  columnWidth: 0.42, // ancho del ciprés / nube (original columna: 0.16)
  minY: -0.85, // la cesta toca la hierba
  maxY: 1.05,
  // Versión para personas mayores: subida/bajada suaves, lento y huecos muy grandes.
  gravity: 0.6,
  thrust: 1.5, // flotar = fuerza 0,4 (igual que antes)
  maxVelocity: 0.45,
  scrollSpeed: 0.42,
  columnSpacing: 2.4,
  gapSize: 1.9,
  gapRange: 0.5, // centro del hueco en ±gapRange/2
  firstColumnX: 2.6,
  columnCount: 5, // ~30 s (original: infinito hasta chocar)

  // Versión fácil: chocar no termina la partida (original: game over).
  hitRecoveryMs: 900,

  // --- Sesión ---
  countdownSeconds: 5,
  pauseAfterLossMs: 800,
  courseSeed: 20261003,
});
