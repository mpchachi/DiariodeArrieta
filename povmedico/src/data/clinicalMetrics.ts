import type {
  EnrichedColumns,
  FlappyMetrics,
  GameResult,
  ScaleMetricResult,
  SlingshotMetrics,
  WaterMetrics,
} from './types';

type MetricBlueprint = Omit<ScaleMetricResult, 'value'> & {
  sourceGame: GameResult['game'];
  compute: (games: GameResult[]) => number | null;
};

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function inverseScale(value: number, min: number, max: number): number {
  if (max === min) return 50;
  return clamp(100 - ((value - min) / (max - min)) * 100);
}

function getMetrics<T>(games: GameResult[], gameId: GameResult['game']): T | null {
  return (games.find(game => game.game === gameId)?.metrics as T | undefined) ?? null;
}

function getEnriched(games: GameResult[], gameId: GameResult['game']): EnrichedColumns | null {
  return games.find(game => game.game === gameId)?.enriched ?? null;
}

export const CLINICAL_METRIC_BLUEPRINTS: MetricBlueprint[] = [
  {
    id: 'slingshot-m1-pinch-precision',
    technicalId: 'M1',
    label: 'Precisión de pinza',
    game: 'La carrera (pinza)',
    sourceGame: 'slingshot',
    unit: '%',
    priority: 'CORE',
    status: 'Captured',
    direction: 'higher-is-better',
    definition: 'Distancia pulgar(L4)-índice(L8) normalizada por la palma.',
    scaleLinks: [
      { scale: 'FMA-UE', item: 'Pinza pulgar-índice', coverage: 'Yes' },
      { scale: 'DASH', item: 'Manipular objetos pequeños', coverage: 'Analogous' },
    ],
    compute: games => {
      const metrics = getMetrics<SlingshotMetrics>(games, 'slingshot');
      return metrics ? metrics.accuracyRatio * 100 : null;
    },
  },
  {
    id: 'slingshot-reach-precision',
    technicalId: 'reach_precision',
    label: 'Precisión espacial (BVE)',
    game: 'La carrera (pinza)',
    sourceGame: 'slingshot',
    unit: '/100',
    priority: 'CORE',
    status: 'Captured',
    direction: 'higher-is-better',
    definition: 'Error medio de colocación respecto al objetivo (Bivariate Variable Error invertido). Menor error = mayor puntuación.',
    scaleLinks: [
      { scale: 'FMA-UE', item: 'Dedo-nariz (coordinación)', coverage: 'Analogous' },
      { scale: 'DASH', item: 'Transportar un objeto y colocarlo en un sitio', coverage: 'Analogous' },
    ],
    compute: games => {
      const enriched = getEnriched(games, 'slingshot');
      if (enriched?.endpointAccuracy != null) {
        return clamp(100 - enriched.endpointAccuracy * 200);
      }
      const metrics = getMetrics<SlingshotMetrics>(games, 'slingshot');
      return metrics ? metrics.accuracyRatio * 100 : null;
    },
  },
  {
    id: 'slingshot-endpoint-overshoot',
    technicalId: 'endpoint_overshoot',
    label: 'Sobrepaso del objetivo (dismetría)',
    game: 'La carrera (pinza)',
    sourceGame: 'slingshot',
    unit: '/100',
    priority: 'CORE',
    status: 'Captured',
    direction: 'lower-is-better',
    definition: 'Error máximo de endpoint respecto al target. Valores altos sugieren dismetría (overshooting).',
    scaleLinks: [
      { scale: 'FMA-UE', item: 'Dedo-nariz (coordinación)', coverage: 'Analogous' },
      { scale: 'DASH', item: 'Realizar tareas de motricidad fina con la mano', coverage: 'Analogous' },
    ],
    compute: games => {
      const enriched = getEnriched(games, 'slingshot');
      if (enriched?.bveValue != null) {
        return clamp(enriched.bveValue * 200, 0, 100);
      }
      const metrics = getMetrics<SlingshotMetrics>(games, 'slingshot');
      return metrics ? (1 - metrics.accuracyRatio) * 100 : null;
    },
  },
  {
    id: 'slingshot-m11-sparc',
    technicalId: 'M11',
    label: 'Suavidad (SPARC)',
    game: 'La carrera (pinza)',
    sourceGame: 'slingshot',
    unit: '/100',
    priority: 'CORE',
    status: 'Captured',
    direction: 'higher-is-better',
    definition: 'Longitud de arco espectral (SPARC) media per-repetición. Rango típico: -5 (muy fragmentado) a -1 (ideal).',
    scaleLinks: [
      { scale: 'FMA-UE', item: 'Suavidad / calidad del movimiento', coverage: 'Yes' },
      { scale: 'DASH', item: 'Realizar tareas de motricidad fina con la mano', coverage: 'Analogous' },
    ],
    compute: games => {
      const enriched = getEnriched(games, 'slingshot');
      if (enriched?.sparcMean != null) {
        return clamp(((enriched.sparcMean + 5) / 4) * 100);
      }
      const metrics = getMetrics<SlingshotMetrics>(games, 'slingshot');
      return metrics ? inverseScale(metrics.pullTremor, 0, 6) : null;
    },
  },
  {
    id: 'lamp-index-extension',
    technicalId: 'index_extension_acc',
    label: 'Precisión de extensión del índice',
    game: 'El globo (puño)',
    sourceGame: 'flappy',
    unit: '%',
    priority: 'CORE',
    status: 'Captured',
    direction: 'higher-is-better',
    definition: 'Extensión del índice hasta el objetivo; ángulo MCF.',
    scaleLinks: [
      { scale: 'FMA-UE', item: 'Extensión de dedos', coverage: 'Yes' },
      { scale: 'DASH', item: 'Girar una llave / interruptor', coverage: 'Analogous' },
    ],
    compute: games => {
      const metrics = getMetrics<FlappyMetrics>(games, 'flappy');
      return metrics ? metrics.maxExtension * 100 : null;
    },
  },
  {
    id: 'lamp-m2-hand-opening',
    technicalId: 'M2',
    label: 'Velocidad de apertura de la mano',
    game: 'El globo (puño)',
    sourceGame: 'flappy',
    unit: '/100',
    priority: 'CORE',
    status: 'Captured',
    direction: 'higher-is-better',
    definition: 'Velocidad de separación de los 5 dedos respecto al centroide palmar (p75 mm/s).',
    scaleLinks: [
      { scale: 'FMA-UE', item: 'Cierre de dedos (puño)', coverage: 'Partial' },
      { scale: 'FMA-UE', item: 'Extensión de dedos', coverage: 'Yes' },
    ],
    compute: games => {
      const enriched = getEnriched(games, 'flappy');
      if (enriched?.handOpeningSpeedP75 != null) {
        return clamp(enriched.handOpeningSpeedP75 / 3);
      }
      const metrics = getMetrics<FlappyMetrics>(games, 'flappy');
      return metrics ? (metrics.activationCount / 60) * 100 : null;
    },
  },
  {
    id: 'lamp-m11-sparc',
    technicalId: 'M11',
    label: 'Suavidad (SPARC)',
    game: 'El globo (puño)',
    sourceGame: 'flappy',
    unit: '/100',
    priority: 'CORE',
    status: 'Captured',
    direction: 'higher-is-better',
    definition: 'Longitud de arco espectral (SPARC) media per-repetición. Rango: -5 (fragmentado) a -1 (suave).',
    scaleLinks: [
      { scale: 'FMA-UE', item: 'Suavidad / calidad del movimiento', coverage: 'Yes' },
      { scale: 'DASH', item: 'Realizar tareas de motricidad fina con la mano', coverage: 'Analogous' },
    ],
    compute: games => {
      const enriched = getEnriched(games, 'flappy');
      if (enriched?.sparcMean != null) {
        return clamp(((enriched.sparcMean + 5) / 4) * 100);
      }
      const metrics = getMetrics<FlappyMetrics>(games, 'flappy');
      return metrics ? inverseScale(metrics.smoothnessJerk, 0, 6) : null;
    },
  },
  {
    id: 'jar-m4-rom',
    technicalId: 'M4',
    label: 'Rango de rotación',
    game: 'El huerto (giro)',
    sourceGame: 'water',
    unit: '/100',
    priority: 'CORE',
    status: 'Captured',
    direction: 'higher-is-better',
    definition: 'Ángulo de rotación máximo, normalizado por el máximo del paciente.',
    scaleLinks: [
      { scale: 'FMA-UE', item: 'Rango de movimiento (mano)', coverage: 'Yes' },
      { scale: 'DASH', item: 'Abrir un tarro apretado', coverage: 'Analogous' },
    ],
    compute: games => {
      const metrics = getMetrics<WaterMetrics>(games, 'water');
      return metrics ? ((metrics.maxSupination + metrics.maxPronation) / 180) * 100 : null;
    },
  },
  {
    id: 'jar-pronosup-speed',
    technicalId: 'pronosup_speed',
    label: 'Velocidad de pronosupinación',
    game: 'El huerto (giro)',
    sourceGame: 'water',
    unit: '/100',
    priority: 'CORE',
    status: 'Captured',
    direction: 'higher-is-better',
    definition: 'Velocidad angular media del giro repetido.',
    scaleLinks: [
      { scale: 'FMA-UE', item: 'Velocidad de pronosupinación', coverage: 'Yes' },
      { scale: 'DASH', item: 'Abrir una botella con tapón de rosca', coverage: 'Analogous' },
    ],
    compute: games => {
      const metrics = getMetrics<WaterMetrics>(games, 'water');
      return metrics ? inverseScale(metrics.averagePouringTime, 500, 5000) : null;
    },
  },
  {
    id: 'jar-pronosup-ratio',
    technicalId: 'pronosup_ratio',
    label: 'Proxy de pronosupinación',
    game: 'El huerto (giro)',
    sourceGame: 'water',
    unit: '/100',
    priority: 'EXPL',
    status: 'Proxy',
    direction: 'higher-is-better',
    definition: 'Ratio de visibilidad de landmarks palmares vs. dorsales (cualitativo).',
    scaleLinks: [
      { scale: 'FMA-UE', item: 'Pronación del antebrazo', coverage: 'Proxy' },
      { scale: 'FMA-UE', item: 'Supinación del antebrazo', coverage: 'Proxy' },
    ],
    compute: games => {
      const metrics = getMetrics<WaterMetrics>(games, 'water');
      if (!metrics) return null;
      const balance = 100 - Math.abs(metrics.maxSupination - metrics.maxPronation);
      return clamp(balance);
    },
  },
  {
    id: 'jar-m11-sparc',
    technicalId: 'M11',
    label: 'Suavidad de rotación (SPARC)',
    game: 'El huerto (giro)',
    sourceGame: 'water',
    unit: '/100',
    priority: 'CORE',
    status: 'Captured',
    direction: 'higher-is-better',
    definition: 'Longitud de arco espectral (SPARC) media per-repetición del giro. Nota: rondas >10s pueden saturar.',
    scaleLinks: [
      { scale: 'FMA-UE', item: 'Suavidad / calidad del movimiento', coverage: 'Yes' },
      { scale: 'DASH', item: 'Realizar tareas de motricidad fina con la mano', coverage: 'Analogous' },
    ],
    compute: games => {
      const enriched = getEnriched(games, 'water');
      if (enriched?.sparcMean != null) {
        return clamp(((enriched.sparcMean + 5) / 4) * 100);
      }
      const metrics = getMetrics<WaterMetrics>(games, 'water');
      return metrics ? inverseScale(metrics.smoothnessJerk, 0, 6) : null;
    },
  },
  {
    id: 'jar-grip-cylindrical',
    technicalId: 'grip_cylindrical',
    label: 'Calidad del agarre cilíndrico',
    game: 'El huerto (giro)',
    sourceGame: 'water',
    unit: '%',
    priority: 'V2',
    status: 'To be implemented',
    direction: 'higher-is-better',
    definition: 'Estabilidad de apertura y puntos de contacto en rotación sostenida.',
    scaleLinks: [
      { scale: 'FMA-UE', item: 'Agarre cilíndrico', coverage: 'Yes' },
      { scale: 'DASH', item: 'Realizar tareas con la firmeza/fuerza habitual', coverage: 'Analogous' },
    ],
    compute: games => {
      const metrics = getMetrics<WaterMetrics>(games, 'water');
      return metrics ? metrics.waterAccuracy : null;
    },
  },
  {
    id: 'lamp-m9-finger-individuation',
    technicalId: 'M9',
    label: 'Individuación digital',
    game: 'El globo (puño)',
    sourceGame: 'flappy',
    unit: '/100',
    priority: 'CORE',
    status: 'Captured',
    direction: 'higher-is-better',
    definition: 'Independencia de movimiento entre dedos (ratio de movimiento selectivo vs. en bloque). Valores altos = control selectivo; bajos = sincinesias.',
    scaleLinks: [
      { scale: 'FMA-UE', item: 'Individualización de dedos', coverage: 'Yes' },
      { scale: 'DASH', item: 'Realizar tareas de motricidad fina con la mano', coverage: 'Analogous' },
    ],
    compute: games => {
      const enriched = getEnriched(games, 'flappy');
      if (enriched?.fingerIndividuationMean != null) {
        return clamp(enriched.fingerIndividuationMean);
      }
      const metrics = getMetrics<FlappyMetrics>(games, 'flappy');
      if (!metrics) return null;
      return clamp(metrics.activationCount * 2);
    },
  },
  {
    id: 'slingshot-m3-velocity',
    technicalId: 'M3',
    label: 'Velocidad de movimiento',
    game: 'La carrera (pinza)',
    sourceGame: 'slingshot',
    unit: '/100',
    priority: 'CORE',
    status: 'Captured',
    direction: 'higher-is-better',
    definition: 'Velocidad de la mano p75 (mm/s normalizada). Bradicinesia = velocidad reducida. Indicador sensible de mejora temprana post-ictus.',
    scaleLinks: [
      { scale: 'FMA-UE', item: 'Velocidad del movimiento', coverage: 'Yes' },
      { scale: 'DASH', item: 'Transportar un objeto y colocarlo en un sitio', coverage: 'Analogous' },
    ],
    compute: games => {
      const enriched = getEnriched(games, 'slingshot');
      if (enriched?.palmSpeedP75 != null) {
        return clamp(enriched.palmSpeedP75 / 3);
      }
      const metrics = getMetrics<SlingshotMetrics>(games, 'slingshot');
      return metrics ? clamp(metrics.maxPullDistance / 5) : null;
    },
  },
  {
    id: 'lamp-finger-extension-active',
    technicalId: 'ext_active',
    label: 'Extensión activa de dedos',
    game: 'El globo (puño)',
    sourceGame: 'flappy',
    unit: '/5',
    priority: 'CORE',
    status: 'Captured',
    direction: 'higher-is-better',
    definition: 'Número máximo de dedos en extensión activa. Predictor de recuperación funcional a 6 meses (Nijland 2010).',
    scaleLinks: [
      { scale: 'FMA-UE', item: 'Extensión de dedos', coverage: 'Yes' },
      { scale: 'DASH', item: 'Realizar tareas de motricidad fina con la mano', coverage: 'Analogous' },
    ],
    compute: games => {
      const enriched = getEnriched(games, 'flappy');
      if (enriched?.fingersExtendedMax != null) {
        return (Math.min(5, enriched.fingersExtendedMax) / 5) * 100;
      }
      const metrics = getMetrics<FlappyMetrics>(games, 'flappy');
      if (!metrics) return null;
      const fingersMax = Math.min(5, Math.round(metrics.maxExtension * 5));
      return (fingersMax / 5) * 100;
    },
  },
  {
    id: 'slingshot-pinch-distance',
    technicalId: 'pinch_mm',
    label: 'Distancia de pinza',
    game: 'La carrera (pinza)',
    sourceGame: 'slingshot',
    unit: 'mm',
    priority: 'CORE',
    status: 'Captured',
    direction: 'lower-is-better',
    definition: 'Distancia media pulgar-índice durante la pinza (mm). Valores bajos = pinza precisa. Proxy FMA-UE ítems 7-11.',
    scaleLinks: [
      { scale: 'FMA-UE', item: 'Pinza pulgar-índice (ítems 7-11)', coverage: 'Yes' },
      { scale: 'DASH', item: 'Manipular objetos pequeños', coverage: 'Analogous' },
    ],
    compute: games => {
      const enriched = getEnriched(games, 'slingshot');
      if (enriched?.pinchDistanceMeanMm != null) {
        return clamp(100 - (enriched.pinchDistanceMeanMm * 2));
      }
      const metrics = getMetrics<SlingshotMetrics>(games, 'slingshot');
      if (!metrics) return null;
      return clamp(100 - (metrics.maxPinchOpen * 80));
    },
  },
  {
    id: 'slingshot-duration-per-rep',
    technicalId: 'rep_duration',
    label: 'Duración media por repetición',
    game: 'La carrera (pinza)',
    sourceGame: 'slingshot',
    unit: '/100',
    priority: 'CORE',
    status: 'Captured',
    direction: 'higher-is-better',
    definition: 'Tiempo medio por repetición (inversamente proporcional). Bradicinesia motora se refleja en tiempos prolongados.',
    scaleLinks: [
      { scale: 'FMA-UE', item: 'Velocidad del movimiento', coverage: 'Partial' },
      { scale: 'DASH', item: 'Transportar un objeto y colocarlo en un sitio', coverage: 'Analogous' },
    ],
    compute: games => {
      const enriched = getEnriched(games, 'slingshot');
      if (enriched?.meanDurationMs != null) {
        return clamp(100 - ((enriched.meanDurationMs - 1000) / 9000) * 100);
      }
      const game = games.find(g => g.game === 'slingshot');
      if (!game) return null;
      const metrics = game.metrics as SlingshotMetrics;
      const avgDurationMs = game.durationMs / Math.max(1, metrics.totalShots);
      return clamp(100 - ((avgDurationMs - 1000) / 9000) * 100);
    },
  },
];

export function computeScaleMetricResults(games: GameResult[]): ScaleMetricResult[] {
  return CLINICAL_METRIC_BLUEPRINTS
    .map(({ compute, sourceGame: _sourceGame, ...metric }) => {
      const value = compute(games);
      if (value === null) return null;
      return { ...metric, value: round(value) };
    })
    .filter((metric): metric is ScaleMetricResult => metric !== null);
}
