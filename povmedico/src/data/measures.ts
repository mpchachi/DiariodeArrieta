// Catálogo de medidas del «Viaje del zorro». ÚNICA fuente de lo que el panel muestra:
// cada medida lee una columna real de game_results (o de su outcome/repeticiones),
// con su unidad, cómo se obtiene y qué indica. Si el dato no existe en la partida, la
// medida no se muestra (nunca se rellena ni se estima en el panel).
//
// Las cifras se obtienen con la cámara del ordenador (vídeo 2D, ~30 fps, MediaPipe Hands).
// Las distancias en mm son ESTIMADAS (se asume una palma de 9,5 cm): sirven para comparar
// sesiones del mismo paciente, no como medida absoluta ni para comparar entre pacientes.

import type { Session } from './types';

export type ChapterKey = 'fox_runner' | 'fox_balloon' | 'fox_garden';
export type Row = Record<string, unknown>;

export interface Chapter {
  key: ChapterKey;
  order: number;
  title: string;
  gesture: string;
  movement: string;
  patientAction: string;
  structure: string;
  colorVar: string;
  /** Mismo color en hex para las gráficas (los atributos SVG no admiten variables CSS). */
  hex: string;
}

export const CHAPTERS: Record<ChapterKey, Chapter> = {
  fox_runner: {
    key: 'fox_runner', order: 1, title: 'La carrera', gesture: 'Pinza pulgar-índice',
    movement: 'Oposición del pulgar y pinza fina (apertura y cierre pulgar-índice).',
    patientAction: 'El zorro corre por el bosque; el paciente junta pulgar e índice para que salte cada tronco y vuelve a separarlos.',
    structure: '5 troncos · ≈ 35–45 s · ritmo lento, sin penalización por fallar.',
    colorVar: 'var(--color-dom-proximal)', hex: '#AE643C',
  },
  fox_balloon: {
    key: 'fox_balloon', order: 2, title: 'El globo', gesture: 'Cierre y apertura de la mano',
    movement: 'Flexión de los dedos (puño) y extensión completa de la mano.',
    patientAction: 'Cerrar el puño enciende el quemador y el globo sube; abrir la mano lo deja bajar. Hay que pasar entre cipreses y nubes.',
    structure: '5 pasos · ≈ 35–45 s · sin «game over»: al chocar, el globo sigue.',
    colorVar: 'var(--color-dom-distal)', hex: '#358189',
  },
  fox_garden: {
    key: 'fox_garden', order: 3, title: 'El huerto', gesture: 'Giro de la muñeca (verter)',
    movement: 'Pronosupinación del antebrazo con la mano cerrada, como al inclinar una regadera.',
    patientAction: 'Con el puño cerrado y el pulgar arriba, el paciente inclina la mano para regar cada flor y la vuelve a poner recta.',
    structure: '5 flores · ≈ 30–70 s · la mano no se desplaza, solo gira.',
    colorVar: 'var(--color-dom-pronosup)', hex: '#646298',
  },
};

export const CHAPTER_ORDER: ChapterKey[] = ['fox_runner', 'fox_balloon', 'fox_garden'];

export interface Measure {
  id: string;
  chapter: ChapterKey;
  label: string;
  unit: string;
  decimals: number;
  /** Valor numérico (para evolución y comparación) o null si la partida no lo tiene. */
  read: (r: Row) => number | null;
  /** Texto alternativo (p. ej. «4 de 5»); si no, se usa el número con su unidad. */
  text?: (r: Row) => string | null;
  /** Qué indica, en lenguaje clínico. */
  meaning: string;
  /** Cómo se obtiene. */
  how: string;
  /** Sentido favorable, solo cuando es inequívoco; si no, el panel no colorea el cambio. */
  better?: 'higher' | 'lower';
  /** Se muestra en el resumen de la sesión (el resto, en el detalle). */
  key?: boolean;
}

const PALM_MM = 95;
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const obj = (v: unknown): Row => (v && typeof v === 'object' ? (v as Row) : {});
const outcome = (r: Row) => obj(r.outcome);
const ofTotal = (a: unknown, b: unknown) => (num(a) !== null && num(b) !== null ? `${a} de ${b}` : null);

export const MEASURES: Measure[] = [
  // ── La carrera (pinza) ──
  {
    id: 'runner_obstacles', chapter: 'fox_runner', label: 'Troncos superados', unit: '', decimals: 0, key: true,
    read: r => num(obj(outcome(r).obstacles).cleared),
    text: r => ofTotal(obj(outcome(r).obstacles).cleared, obj(outcome(r).obstacles).total),
    meaning: 'Rendimiento en la tarea: cuántas veces la pinza llegó a tiempo para saltar el tronco.',
    how: 'Troncos saltados sin chocar sobre el total de la partida.',
    better: 'higher',
  },
  {
    id: 'runner_aperture', chapter: 'fox_runner', label: 'Apertura pulgar-índice', unit: 'mm', decimals: 0, key: true,
    read: r => num(r.grip_aperture_mean_mm),
    meaning: 'Capacidad de separar pulgar e índice antes de pinzar (extensión y abducción del pulgar).',
    how: 'Mediana de la máxima separación entre yemas antes de cada pinza, relativa a la palma y convertida a mm (estimación).',
    better: 'higher',
  },
  {
    id: 'runner_incomplete', chapter: 'fox_runner', label: 'Aperturas incompletas', unit: '', decimals: 0, key: true,
    read: r => num(outcome(r).incompleteOpenings),
    text: r => ofTotal(outcome(r).incompleteOpenings, outcome(r).openingsMeasured),
    meaning: 'Veces que el paciente volvió a pinzar sin haber abierto del todo la mano.',
    how: 'Aperturas entre pinzas que no alcanzan el 45 % de la longitud de la palma (≈ 4 cm).',
    better: 'lower',
  },
  {
    id: 'runner_closed', chapter: 'fox_runner', label: 'Distancia con la pinza cerrada', unit: 'mm', decimals: 0,
    read: r => num(r.pinch_distance_mean_mm),
    meaning: 'Lo que llega a cerrarse la pinza: cuanto menor, más contacto real entre yemas.',
    how: 'Mediana de la distancia entre yemas mientras la pinza está cerrada (estimación en mm).',
    better: 'lower',
  },
  {
    id: 'runner_speed', chapter: 'fox_runner', label: 'Velocidad de cierre', unit: 'mm/s', decimals: 0, key: true,
    read: r => num(r.mean_peak_velocity),
    meaning: 'Rapidez con la que se cierra la pinza (bradicinesia si es baja).',
    how: 'Mediana del recorrido de cierre dividido por su duración, por pinza.',
    better: 'higher',
  },
  {
    id: 'runner_hold', chapter: 'fox_runner', label: 'Tiempo que mantiene la pinza', unit: 's', decimals: 1,
    read: r => (num(outcome(r).medianHoldMs) === null ? null : (outcome(r).medianHoldMs as number) / 1000),
    meaning: 'Cuánto sostiene la pinza antes de soltar. Valores muy altos pueden indicar dificultad para relajar.',
    how: 'Mediana del tiempo entre el cierre y la apertura de cada pinza.',
  },
  {
    id: 'runner_timing', chapter: 'fox_runner', label: 'Desfase con el momento del salto', unit: 's', decimals: 2,
    read: r => (num(outcome(r).timingMedianAbsErrorMs) === null ? null : (outcome(r).timingMedianAbsErrorMs as number) / 1000),
    meaning: 'Coordinación visuomotora: lo cerca del momento ideal que pinza ante cada tronco.',
    how: 'Mediana de la diferencia absoluta entre la pinza y el centro de la ventana de salto.',
    better: 'lower',
  },
  {
    id: 'runner_cv', chapter: 'fox_runner', label: 'Variabilidad de la apertura', unit: '%', decimals: 0,
    read: r => (num(r.grip_aperture_cv) === null ? null : (r.grip_aperture_cv as number) * 100),
    meaning: 'Regularidad del gesto entre repeticiones: cuanto menor, más consistente.',
    how: 'Coeficiente de variación de la amplitud de pinza entre repeticiones.',
    better: 'lower',
  },
  {
    id: 'runner_fatigue', chapter: 'fox_runner', label: 'Cambio de amplitud (inicio → final)', unit: '%', decimals: 0,
    read: r => num(r.fatigue_index),
    meaning: 'Indicio de fatiga: un valor negativo indica que la amplitud baja al final de la partida.',
    how: 'Diferencia porcentual entre la amplitud media del último tercio de pinzas y la del primer tercio.',
  },

  // ── El globo (puño) ──
  {
    id: 'balloon_steps', chapter: 'fox_balloon', label: 'Pasos superados sin chocar', unit: '', decimals: 0, key: true,
    read: r => num(obj(outcome(r).columns).cleared),
    text: r => ofTotal(obj(outcome(r).columns).cleared, obj(outcome(r).columns).total),
    meaning: 'Rendimiento en la tarea: control de cuándo cerrar y abrir para mantener la altura.',
    how: 'Pasos entre obstáculos superados sin tocarlos, sobre el total.',
    better: 'higher',
  },
  {
    id: 'balloon_flex_max', chapter: 'fox_balloon', label: 'Flexión máxima de los dedos', unit: '°', decimals: 0, key: true,
    read: r => num(obj(outcome(r).fingerFlexion).maxDeg),
    meaning: 'Cuánto llega a cerrar la mano. Orientativo: un puño completo en una mano sana suma unos 260° (MCF 85° + IFP 110° + IFD 65°); con la cámara suele salir algo menos.',
    how: 'Por fotograma, media de los 4 dedos de la flexión MCF + IFP + IFD (ángulos 3D estimados por MediaPipe); percentil 95 de la partida.',
    better: 'higher',
  },
  {
    id: 'balloon_flex_min', chapter: 'fox_balloon', label: 'Flexión residual con la mano abierta', unit: '°', decimals: 0, key: true,
    read: r => num(obj(outcome(r).fingerFlexion).minDeg),
    meaning: 'Cuánto quedan doblados los dedos al abrir. 0° = dedos totalmente rectos; con la cámara, una mano sana abierta suele dar menos de 70°.',
    how: 'Mismo cálculo; percentil 5 de la partida.',
    better: 'lower',
  },
  {
    id: 'balloon_arc', chapter: 'fox_balloon', label: 'Arco activo de los dedos', unit: '°', decimals: 0, key: true,
    read: r => num(obj(outcome(r).fingerFlexion).arcDeg),
    meaning: 'Recorrido entre la mano más abierta y el puño más cerrado: aproximación al movimiento activo total (TAM) medio por dedo.',
    how: 'Flexión máxima − flexión residual.',
    better: 'higher',
  },
  {
    id: 'balloon_reps', chapter: 'fox_balloon', label: 'Cierres de puño', unit: '', decimals: 0,
    read: r => num(outcome(r).activations) ?? num(r.rep_count),
    meaning: 'Número de cierres completos que hizo el paciente para mantener el globo.',
    how: 'Cierres que superan el umbral de puño, separados por una apertura.',
  },

  // ── El huerto (giro) ──
  {
    id: 'garden_flowers', chapter: 'fox_garden', label: 'Flores regadas', unit: '', decimals: 0,
    read: r => num(outcome(r).flowersBloomed) ?? num(r.rep_count),
    text: r => ofTotal(outcome(r).flowersBloomed, outcome(r).flowersTotal),
    meaning: 'Repeticiones completas del gesto de verter y volver a recto.',
    how: 'Flores que llegan a florecer.',
    better: 'higher',
  },
  {
    id: 'garden_pronation', chapter: 'fox_garden', label: 'Pronación máxima', unit: '°', decimals: 0, key: true,
    read: r => num(r.max_pronation_deg),
    meaning: 'Rango activo hacia el lado de verter (mano derecha: hacia la izquierda).',
    how: 'Máxima inclinación de la línea de nudillos respecto a la postura recta inicial, en la imagen.',
    better: 'higher',
  },
  {
    id: 'garden_supination', chapter: 'fox_garden', label: 'Supinación máxima', unit: '°', decimals: 0, key: true,
    read: r => num(r.max_supination_deg),
    meaning: 'Rango activo hacia el lado contrario al de verter.',
    how: 'Máxima inclinación hacia el lado contrario. El juego no la pide: aparece cuando el paciente gira al otro lado.',
  },
  {
    id: 'garden_rom', chapter: 'fox_garden', label: 'Arco total de giro', unit: '°', decimals: 0,
    read: r => num(r.rom_deg_p90),
    meaning: 'Suma de la pronación y la supinación máximas.',
    how: 'Pronación máxima + supinación máxima.',
    better: 'higher',
  },
  {
    id: 'garden_speed', chapter: 'fox_garden', label: 'Velocidad máxima de giro', unit: '°/s', decimals: 0, key: true,
    read: r => num(r.mean_peak_velocity),
    meaning: 'Rapidez del gesto de verter.',
    how: 'Mediana, por flor, de la velocidad angular máxima al inclinar.',
    better: 'higher',
  },
  {
    id: 'garden_time', chapter: 'fox_garden', label: 'Tiempo hasta regar cada flor', unit: 's', decimals: 1,
    read: r => (num(r.mean_duration_ms) === null ? null : (r.mean_duration_ms as number) / 1000),
    meaning: 'Tiempo desde que aparece la flor hasta que florece (incluye iniciar el gesto y sostenerlo).',
    how: 'Mediana por flor.',
    better: 'lower',
  },
  {
    id: 'garden_sparc', chapter: 'fox_garden', label: 'Suavidad del giro (SPARC)', unit: '', decimals: 2,
    read: r => num(r.session_sparc),
    meaning: 'Fluidez del movimiento: valores más próximos a 0 indican un giro más suave; más negativos, más fragmentado.',
    how: 'Spectral Arc Length del perfil de velocidad de cada vertido (Balasubramanian et al., 2012).',
    better: 'higher',
  },
  {
    id: 'garden_wrong', chapter: 'fox_garden', label: 'Flores con giro inicial al lado contrario', unit: '', decimals: 0,
    read: r => num(outcome(r).wrongDirectionFlowers),
    text: r => ofTotal(outcome(r).wrongDirectionFlowers, outcome(r).flowersTotal),
    meaning: 'Orientación en la tarea: veces que buscó primero el giro hacia el otro lado (no es un error motor).',
    how: 'Flores con más de 15° de giro hacia el lado contrario antes de regar.',
  },
  {
    id: 'garden_fatigue', chapter: 'fox_garden', label: 'Cambio de inclinación (inicio → final)', unit: '%', decimals: 0,
    read: r => num(r.fatigue_index),
    meaning: 'Indicio de fatiga: un valor negativo indica menos inclinación en las últimas flores.',
    how: 'Diferencia porcentual entre la inclinación máxima de las 2 últimas flores y la de las 2 primeras.',
  },
];

/** Medida común: porcentaje de la partida con la mano detectada (no garantiza que las medidas sean exactas). */
export const QUALITY_MEASURE = {
  label: 'Mano detectada',
  read: (r: Row) => num(r.quality_frames_pct),
  meaning: 'Porcentaje del tiempo de juego en que se vio la mano. Que se vea no garantiza que las medidas sean exactas: para eso está la fiabilidad.',
} as const;

// Fiabilidad de la partida (vision/reliability.js en el juego). Solo existe en partidas nuevas.
export type ReliabilityLevel = 'high' | 'medium' | 'low';
export interface Reliability { level: ReliabilityLevel; reasons: string[]; detectedPct: number | null; rejectedPct: number | null; framingOkPct: number | null; framingIssues?: Record<string, number> }
export const RELIABILITY_LABEL: Record<ReliabilityLevel, string> = { high: 'Fiabilidad alta', medium: 'Fiabilidad media', low: 'Fiabilidad baja' };
const REASON_TEXT: Record<string, string> = {
  detected: 'la mano no se vio todo el tiempo',
  rejected: 'se descartaron detecciones inestables (formas imposibles o saltos)',
  framing: 'la mano estuvo a menudo mal encuadrada (cerca, lejos o en un borde)',
};
export const reliabilityReasons = (r: Reliability) => r.reasons.map(k => REASON_TEXT[k] ?? k);
export function reliabilityOf(r: Row | null): Reliability | null {
  const rel = r ? obj(outcome(r).reliability) : {};
  return typeof rel.level === 'string' ? (rel as unknown as Reliability) : null;
}
/** Peor fiabilidad de los capítulos de una sesión (o null si es una partida antigua). */
export function sessionReliability(s: Session): ReliabilityLevel | null {
  const levels = CHAPTER_ORDER.map(c => reliabilityOf(chapterRow(s, c))?.level).filter(Boolean) as ReliabilityLevel[];
  if (!levels.length) return null;
  return levels.includes('low') ? 'low' : levels.includes('medium') ? 'medium' : 'high';
}

export const measuresOf = (c: ChapterKey) => MEASURES.filter(m => m.chapter === c);

export function formatValue(m: Measure, r: Row): string | null {
  const t = m.text?.(r);
  if (t) return t;
  const v = m.read(r);
  if (v === null) return null;
  const n = v.toLocaleString('es-ES', { minimumFractionDigits: m.decimals, maximumFractionDigits: m.decimals });
  return !m.unit ? n : m.unit === '°' ? `${n}°` : `${n} ${m.unit}`;
}

export function formatDelta(m: Measure, now: number, before: number): { text: string; tone: 'good' | 'bad' | 'neutral' } {
  const d = now - before;
  const n = Math.abs(d).toLocaleString('es-ES', { minimumFractionDigits: m.decimals, maximumFractionDigits: m.decimals });
  const zero = Number(n.replace(',', '.')) === 0;
  const text = zero ? 'Sin cambios' : `${d > 0 ? '+' : '−'}${n}${m.unit && m.unit !== '%' && m.unit !== '°' ? ` ${m.unit}` : m.unit}`;
  if (zero || !m.better) return { text, tone: 'neutral' };
  return { text, tone: (d > 0) === (m.better === 'higher') ? 'good' : 'bad' };
}

/** Fila de un capítulo en una sesión (o null si no se jugó). */
export function chapterRow(s: Session, c: ChapterKey): Row | null {
  return (s.games.find(g => g.key === c)?.raw as Row | undefined) ?? null;
}

export const repetitions = (r: Row): Row[] => (Array.isArray(r.repetitions) ? (r.repetitions as Row[]) : []);
export { PALM_MM };
