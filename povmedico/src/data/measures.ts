// Catálogo de medidas del «Viaje del zorro». ÚNICA fuente de lo que el panel muestra:
// cada medida lee una columna real de game_results (o de su outcome/repeticiones),
// con su unidad, cómo se obtiene y qué indica. Si el dato no existe en la partida, la
// medida no se muestra (nunca se rellena ni se estima en el panel).
//
// Las cifras se obtienen con la cámara del ordenador (vídeo 2D, ~30 fps, MediaPipe Hands).
// Las distancias en mm son ESTIMADAS (se asume una palma de 9,5 cm): sirven para comparar
// sesiones del mismo paciente, no como medida absoluta ni para comparar entre pacientes.

import type { Session } from './types';
import { measurementOf } from './comparability';

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
    movement: 'Inclinación de la mano observada en la imagen durante el vertido. No aísla pronación/supinación del antebrazo ni compensaciones del brazo.',
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
  {
    id: 'runner_aperture_relative', chapter: 'fox_runner', label: 'Apertura relativa observada', unit: 'palmas', decimals: 2, key: true,
    read: r => measurementOf(r)?.summary.upper ?? null,
    meaning: 'Separación pulgar–índice relativa al tamaño visible de la palma. No mide capacidad máxima ni distancia física calibrada.',
    how: 'Versión 2: mediana de los percentiles 95 por oportunidad autónoma con al menos 10 muestras utilizables, incluidas las no completadas. Depende de la orientación de la mano.',
  },
  {
    id: 'garden_tilt_observed', chapter: 'fox_garden', label: 'Inclinación observada hacia el vertido', unit: '°', decimals: 0, key: true,
    read: r => { const value = measurementOf(r)?.summary.upper; return value == null ? null : Math.max(0, value); },
    meaning: 'Giro de la mano en la imagen respecto a su posición inicial. No equivale a rango anatómico máximo de pronación.',
    how: 'Versión 2: mediana de los percentiles 95 por flor con al menos 10 muestras utilizables, incluidas las no completadas. Se registra por separado la ayuda adaptativa.',
  },
  // ── La carrera (pinza) ──
  {
    id: 'runner_obstacles', chapter: 'fox_runner', label: 'Troncos superados', unit: '', decimals: 0, key: false,
    read: r => num(obj(outcome(r).obstacles).cleared),
    text: r => ofTotal(obj(outcome(r).obstacles).cleared, obj(outcome(r).obstacles).total),
    meaning: 'Rendimiento en la tarea: cuántas veces la pinza llegó a tiempo para saltar el tronco.',
    how: 'Troncos saltados sin chocar sobre el total de la partida.',
    better: 'higher',
  },
  {
    id: 'runner_aperture', chapter: 'fox_runner', label: 'Apertura pulgar-índice', unit: 'mm', decimals: 0, key: false,
    read: r => num(r.grip_aperture_mean_mm),
    meaning: 'Capacidad de separar pulgar e índice antes de pinzar (extensión y abducción del pulgar).',
    how: 'Mediana de la máxima separación entre yemas antes de cada pinza, relativa a la palma y convertida a mm (estimación).',
    better: 'higher',
  },
  {
    id: 'runner_incomplete', chapter: 'fox_runner', label: 'Aperturas bajo el umbral del juego', unit: '', decimals: 0, key: false,
    read: r => num(outcome(r).incompleteOpenings),
    text: r => ofTotal(outcome(r).incompleteOpenings, outcome(r).openingsMeasured),
    meaning: 'Ciclos que no alcanzaron la apertura de referencia del juego. Ese umbral no define apertura anatómica completa.',
    how: 'Aperturas entre pinzas que no alcanzan el 45 % de la longitud de la palma (≈ 4 cm).',
    better: 'lower',
  },
  {
    id: 'runner_closed', chapter: 'fox_runner', label: 'Distancia con la pinza cerrada', unit: 'mm', decimals: 0,
    read: r => num(r.pinch_distance_mean_mm),
    meaning: 'Distancia proyectada entre yemas durante cierres reconocidos por el juego. La superposición en imagen no demuestra contacto físico.',
    how: 'Mediana de la distancia entre yemas mientras la pinza está cerrada (estimación en mm).',
    better: 'lower',
  },
  {
    id: 'runner_speed', chapter: 'fox_runner', label: 'Velocidad de cierre', unit: 'mm/s', decimals: 0, key: false,
    read: r => num(r.mean_peak_velocity),
    meaning: 'Velocidad media estimada del cierre que activó el juego, no velocidad pico. Depende del umbral y la postura; un valor bajo no diagnostica bradicinesia.',
    how: 'Mediana del recorrido de cierre dividido por su duración, por pinza.',
    better: 'higher',
  },
  {
    id: 'runner_hold', chapter: 'fox_runner', label: 'Tiempo que mantiene la pinza', unit: 's', decimals: 1,
    read: r => (num(outcome(r).medianHoldMs) === null ? null : (outcome(r).medianHoldMs as number) / 1000),
    meaning: 'Tiempo que mantiene el cierre registrado. Puede depender de las instrucciones o de la estrategia; no mide por sí solo dificultad para relajar.',
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
    meaning: 'Variación de amplitud dentro de la sesión. No identifica fatiga: también influyen aprendizaje, estrategia y captura.',
    how: 'Diferencia porcentual entre la amplitud media del último tercio de pinzas y la del primer tercio.',
  },

  // ── El globo (puño) ──
  {
    id: 'balloon_steps', chapter: 'fox_balloon', label: 'Pasos superados sin chocar', unit: '', decimals: 0, key: false,
    read: r => num(obj(outcome(r).columns).cleared),
    text: r => ofTotal(obj(outcome(r).columns).cleared, obj(outcome(r).columns).total),
    meaning: 'Rendimiento en la tarea: control de cuándo cerrar y abrir para mantener la altura.',
    how: 'Pasos entre obstáculos superados sin tocarlos, sobre el total.',
    better: 'higher',
  },
  {
    id: 'balloon_flex_max', chapter: 'fox_balloon', label: 'Ángulo combinado al cerrar (estimado)', unit: '°', decimals: 0, key: true,
    read: r => measurementOf(r)?.summary.upper ?? num(obj(outcome(r).fingerFlexion).maxDeg),
    meaning: 'Suma angular estimada, promediada en cuatro dedos. No equivale a goniometría clínica ni a fuerza de agarre; no dispone de valores normativos.',
    how: 'Versión 2: proyección del nudillo sobre el plano de flexión y ángulos entre falanges, a partir de puntos 3D inferidos. Mediana de P95 por oportunidad autónoma. El histórico usa otro método.',
    better: 'higher',
  },
  {
    id: 'balloon_flex_min', chapter: 'fox_balloon', label: 'Ángulo combinado al abrir (estimado)', unit: '°', decimals: 0, key: true,
    read: r => measurementOf(r)?.summary.lower ?? num(obj(outcome(r).fingerFlexion).minDeg),
    meaning: 'Ángulo observado durante la apertura en el juego. No demuestra extensión completa ni permite diagnosticar una limitación articular.',
    how: 'Versión 2: mediana de P05 por oportunidad autónoma con al menos 10 muestras utilizables. No se usan valores mantenidos por el filtro cuando faltan puntos 3D.',
    better: 'lower',
  },
  {
    id: 'balloon_arc', chapter: 'fox_balloon', label: 'Recorrido angular observado (estimado)', unit: '°', decimals: 0, key: true,
    read: r => measurementOf(r)?.summary.excursion ?? num(obj(outcome(r).fingerFlexion).arcDeg),
    meaning: 'Variación de los ángulos estimados al abrir y cerrar durante la tarea. No equivale al movimiento activo total (TAM) clínico.',
    how: 'Versión 2: mediana de las diferencias P95−P05 por oportunidad autónoma. No es necesariamente la diferencia de las dos medianas mostradas arriba.',
    better: 'higher',
  },
  {
    id: 'balloon_reps', chapter: 'fox_balloon', label: 'Cierres de puño', unit: '', decimals: 0,
    read: r => num(outcome(r).activations) ?? num(r.rep_count),
    meaning: 'Activaciones de la señal de control para subir el globo. No equivalen a puños anatómicamente completos ni a fuerza muscular.',
    how: 'Cierres que superan el umbral de puño, separados por una apertura.',
  },

  // ── El huerto (giro) ──
  {
    id: 'garden_flowers', chapter: 'fox_garden', label: 'Flores regadas', unit: '', decimals: 0,
    read: r => num(outcome(r).flowersBloomed) ?? num(r.rep_count),
    text: r => ofTotal(outcome(r).flowersBloomed, outcome(r).flowersTotal),
    meaning: 'Flores completadas en el juego, sin garantizar retorno a posición inicial ni amplitud máxima. Depende del umbral de ayuda.',
    how: 'Flores que llegan a florecer.',
    better: 'higher',
  },
  {
    id: 'garden_pronation', chapter: 'fox_garden', label: 'Máxima inclinación hacia el vertido (histórico)', unit: '°', decimals: 0, key: false,
    read: r => num(r.max_pronation_deg),
    meaning: 'Valor histórico de giro en la imagen. No es una medida aislada de pronación del antebrazo.',
    how: 'Máxima inclinación de la línea de nudillos respecto a la postura recta inicial, en la imagen.',
    better: 'higher',
  },
  {
    id: 'garden_supination', chapter: 'fox_garden', label: 'Máximo giro contrario (histórico)', unit: '°', decimals: 0, key: false,
    read: r => num(r.max_supination_deg),
    meaning: 'Giro en una dirección que el juego no solicita. No mide capacidad máxima de supinación ni demuestra confusión.',
    how: 'Máxima inclinación hacia el lado contrario. El juego no la pide: aparece cuando el paciente gira al otro lado.',
  },
  {
    id: 'garden_rom', chapter: 'fox_garden', label: 'Arco total de giro', unit: '°', decimals: 0,
    read: r => num(r.rom_deg_p90),
    meaning: 'Suma histórica de giros máximos en la imagen. No es un rango articular validado ni su aumento implica mejoría.',
    how: 'Máxima inclinación hacia el vertido + máximo giro contrario.',
    better: 'higher',
  },
  {
    id: 'garden_speed', chapter: 'fox_garden', label: 'Velocidad máxima de giro', unit: '°/s', decimals: 0, key: false,
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
    meaning: 'Descriptor exploratorio del perfil de movimiento. No diagnostica espasticidad ni tiene umbrales clínicos propios validados.',
    how: 'Versión 2: SPARC de la ventana de ida hasta el máximo de cada oportunidad, remuestreada a 30 Hz sin unir pérdidas de señal. No comparable con la implementación histórica.',
    better: 'higher',
  },
  {
    id: 'garden_wrong', chapter: 'fox_garden', label: 'Flores con giro hacia el lado contrario', unit: '', decimals: 0,
    read: r => num(outcome(r).wrongDirectionFlowers),
    text: r => ofTotal(outcome(r).wrongDirectionFlowers, outcome(r).flowersTotal),
    meaning: 'Oportunidades con giro hacia el lado contrario. El registro no determina si se debió a exploración, comprensión o control motor.',
    how: 'Flores cuyo máximo contrario supera 15° durante la fase de riego; no determina que el giro fuera inicial.',
  },
  {
    id: 'garden_fatigue', chapter: 'fox_garden', label: 'Cambio de inclinación (inicio → final)', unit: '%', decimals: 0,
    read: r => num(r.fatigue_index),
    meaning: 'Cambio de inclinación entre las primeras y últimas flores. Puede depender del aprendizaje y la ayuda adaptativa; no diagnostica fatiga.',
    how: 'Diferencia porcentual entre la inclinación máxima de las 2 últimas flores y la de las 2 primeras.',
  },
];

/** Medida común: porcentaje de la partida con la mano detectada (no garantiza que las medidas sean exactas). */
export const QUALITY_MEASURE = {
  label: 'Mano detectada',
  read: (r: Row) => num(r.quality_frames_pct),
  meaning: 'Cobertura operativa del seguimiento: históricamente tiempo válido en la carrera y fotogramas seguidos en globo/huerto. No es exactitud clínica; consulte las muestras utilizables de cada medida.',
} as const;

// Fiabilidad de la partida (vision/reliability.js en el juego). Solo existe en partidas nuevas.
export type ReliabilityLevel = 'high' | 'medium' | 'low';
export interface Reliability { level: ReliabilityLevel; reasons: string[]; detectedPct: number | null; rejectedPct: number | null; framingOkPct: number | null; framingIssues?: Record<string, number> }
export const RELIABILITY_LABEL: Record<ReliabilityLevel, string> = { high: 'Captura sin avisos del filtro antiguo', medium: 'Captura con avisos', low: 'Captura a revisar' };
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
  if (CHAPTER_ORDER.some(c => measurementOf(chapterRow(s, c)))) return null;
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
  return { text, tone: 'neutral' };
}

/** Fila de un capítulo en una sesión (o null si no se jugó). */
export function chapterRow(s: Session, c: ChapterKey): Row | null {
  return (s.games.find(g => g.key === c)?.raw as Row | undefined) ?? null;
}

export const repetitions = (r: Row): Row[] => (Array.isArray(r.repetitions) ? (r.repetitions as Row[]) : []);
export { PALM_MM };
