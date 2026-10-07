// Configuración del Runner «El Zorro de las Estaciones».
// Todo lo ajustable (umbrales de pinza, física, recorrido) vive aquí.

export const RUNNER_CONFIG = Object.freeze({
  protocol: 'fixedgap-runner-pinch-v2',
  algorithm: '2.0.0',

  // --- Pinza (separación yemas pulgar–índice / longitud muñeca–MCP medio) ---
  pinch: Object.freeze({
    // false (actual): solo se exige que haya una mano y se mide pulgar–índice.
    // Los controles de encuadre, distancia, luz, orientación, lateralidad, fps
    // y saltos de identidad quedan registrados pero NO bloquean el juego
    // (en pruebas reales eran demasiado ruidosos). true = comportamiento del Pastillero v2.
    strictQuality: false,
    // Razones = distancia pulgar–índice / palma (muñeca → nudillo medio, ~9-10 cm).
    closeRatio: 0.22, // ≤ ~2 cm: pinza
    // Soltar: basta separar un poco (≥ releaseRatio y ≥ mínimo + releaseDelta), sin
    // tener que abrir del todo. Antes se exigía openRatio y con 2-3 cm de separación el
    // juego seguía creyendo que había pinza.
    releaseRatio: 0.28, // ~2,5-3 cm
    releaseDelta: 0.08,
    regrabExcursion: 0.06, // tras soltar a medias, volver a cerrar basta con este recorrido
    openRatio: 0.45, // apertura «completa»: ya no bloquea el juego, se registra por ciclo
    minExcursion: 0.18,
    closeMs: 50,
    releaseMs: 90,
    stableMs: 300,
    // Fotogramas inválidos sueltos (oclusión momentánea, desenfoque) no rompen
    // la pinza en curso si la señal vuelve antes de este margen.
    lossToleranceMs: 400,
    maxGapMs: 400,
    identityTimeoutMs: 800,
    minHandedness: 0.75,
    identityBasePalmLengths: 0.65,
    identityPalmLengthsPerSecond: 5,
    maxScaleLogJump: 0.35,
    edgeMargin: 0.025,
    minPalmPixels: 32,
    maxPalmScreenFraction: 0.32,
    maxHandScreenFraction: 0.86,
    minPalmWidthRatio: 0.32,
    minIndexReachRatio: 0.18,
    maxTipDepthRatio: 0.65,
    minLuminance: 18,
    maxLuminance: 248,
    minCaptureFps: 14,
    minTrialCoverage: 0.85,
    maxSamples: 12000,

    // FUTURO (no activo, solo aplica con strictQuality: true): permitir jugar aunque la mano NO esté entera en cámara.
    // Con `allowPartialHand: true` se aceptaría el fotograma siempre que se vean
    // muñeca (0), MCP índice (5), MCP medio (9), MCP meñique (17), yema pulgar (4)
    // e yema índice (8). Pensado para pacientes que no pueden mostrar la mano
    // completa o cámaras con encuadre estrecho. Antes de activarlo hay que validar
    // con personas reales que la normalización por palma sigue siendo fiable con
    // dedos fuera de plano, y marcar las sesiones afectadas en el registro.
    allowPartialHand: false,
    partialHandRequired: Object.freeze([0, 4, 5, 8, 9, 17]),
  }),

  // --- Mano ---
  // Siempre se juega con la mano DERECHA del paciente (sin selector). En nuestra
  // captura espejada MediaPipe etiqueta esa mano como 'Left' (comprobado con la
  // webcam de un portátil). Si hay varias manos en cuadro se prefiere esta etiqueta.
  patientHand: 'Right',
  detectedHandLabel: 'Left',

  // --- Mundo (píxeles de la resolución interna) ---
  width: 320,
  minWidth: 240,
  maxWidth: 440,
  height: 180,
  groundY: 150,
  foxX: 64,
  speed: 35, // lento: pensado para personas mayores

  // --- Salto (uno solo: pinza = salto). Muy flotante: ~1,9 s en el aire, ventana de ~1 s.
  jumpVelocity: 95,
  gravity: 100,

  // --- Recorrido (fijo y con semilla: todas las sesiones son comparables) ---
  courseSeed: 20261002,
  obstacleCount: 5, // ~30-35 s (la misma velocidad lenta y el mismo salto fácil)
  introCount: 2,
  introSpacing: 220,
  minSpacing: 200,
  maxSpacing: 230,
  startOffset: 180,
  berries: false, // sin bayas: menos cosas en pantalla
  // Encuadre más cerrado (se ocultan los 30 px de arriba): el zorro se ve más grande.
  cropTop: 30,
  finishOffset: 260,

  // --- Ronda introductoria ---
  // En los primeros `tutorialJumps` troncos el juego se detiene y una mano animada enseña
  // la pinza; sigue cuando el paciente la hace (la pinza ya es el salto que supera el
  // tronco). Se para a esta distancia del tronco (dentro de la ventana de despegue, de
  // −45 a −10 px). Tras el último salto guiado, el juego sigue solo.
  tutorialJumps: 2,
  tutorialOffsetPx: -30,

  // --- Sesión ---
  countdownSeconds: 3,
  pauseAfterLossMs: 800,
  resumeDelayMs: 600,
  resumeClearance: 150,
  stumbleMs: 650,
  maxSeasons: 4,
});

export const RUNNER_REASONS = Object.freeze({
  ok: 'Mano visible.',
  missing: 'Pon la mano delante de la cámara.',
  wrong: 'Usa la mano que has elegido.',
  uncertain: 'Deja solo una mano delante de la cámara.',
  cropped: 'Centra la mano: tiene que verse entera.',
  partial: 'Centra la mano: tiene que verse entera.',
  close: 'Aleja un poco la mano.',
  far: 'Acerca un poco la mano.',
  dark: 'Necesito un poco más de luz.',
  bright: 'Evita la luz directa sobre la mano.',
  side: 'Gira la palma hacia la pantalla.',
  jump: 'Mantén la mano quieta un momento.',
  malformed: 'Recuperando la mano…',
  folded: 'Deja el índice estirado, sin cerrar el puño.',
  depth: 'Gira un poco la mano para que vea las dos yemas.',
  slow: 'La cámara va lenta. Cierra otras aplicaciones o busca más luz.',
  stalled: 'No llegan imágenes de la cámara.',
});
