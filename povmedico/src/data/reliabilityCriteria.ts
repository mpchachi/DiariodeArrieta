// Mismos umbrales que el juego (demo/src/vision/reliability.js). Se muestran en la guía.
export const RELIABILITY = {
  high: { detected: 90, rejected: 5, framing: 80 },
  low: { detected: 75, rejected: 15, framing: 50 },
} as const;
