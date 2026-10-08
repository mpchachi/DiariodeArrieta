export const colors = {
  background: '#F7F5F1',
  surface: '#FDFBF9',
  surfaceElevated: '#F3F0EB',
  surfaceHover: '#EEEBE5',
  border: '#E2DFDA',
  borderActive: '#C4C0BA',

  accent: '#1E1A15',
  accentSoft: '#EBE7E1',

  proximal: '#AE643C',
  distal: '#358189',
  pronosup: '#646298',

  ok: '#3F774D',
  warning: '#B27923',
  alert: '#AF3D36',

  text: '#1E1A15',
  textSecondary: '#4F4943',
  textMuted: '#75716B',
} as const;

export const shadows = {
  clay: '0 4px 14px rgba(44, 36, 32, 0.06), 0 1.5px 4px rgba(44, 36, 32, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.8)',
  clayHover: '0 8px 24px rgba(44, 36, 32, 0.09), 0 2px 6px rgba(44, 36, 32, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.9)',
  elevated: '0 12px 40px rgba(44, 36, 32, 0.1), 0 3px 10px rgba(44, 36, 32, 0.06), inset 0 1.5px 0 rgba(255, 255, 255, 0.85)',
  inset: 'inset 0 2px 6px rgba(44, 36, 32, 0.06), inset 0 0 0 1px rgba(44, 36, 32, 0.03)',
} as const;

export const radii = {
  sm: '12px',
  md: '16px',
  lg: '24px',
  xl: '32px',
} as const;

export const chartTheme = {
  grid: '#E2DFDA',
  axisText: '#75716B',
  labelText: '#4F4943',
  tooltipBg: '#FDFBF9',
  tooltipBorder: '#E2DFDA',
} as const;
