// Etiquetas compartidas entre Ejercicios, Informe y Correlación.
export type Domain = 'proximal-grip' | 'distal-flex-ext' | 'prono-supination';
export type Intensity = 'low' | 'medium' | 'high';

export const DOMAIN_LABELS: Record<Domain, string> = {
  'proximal-grip': 'Agarre',
  'distal-flex-ext': 'Coordinación',
  'prono-supination': 'Rotación',
};

export const INTENSITY_LABELS: Record<Intensity, string> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
};

export const MOBILITY_LABELS: Record<string, string> = { agile: 'Ágil', moderate: 'Moderado', reduced: 'Reducido' };
export const SEX_LABELS: Record<string, string> = { M: 'Hombre', F: 'Mujer', other: 'Otro' };
