import { startOfToday } from 'date-fns';

// Fecha de referencia única del dashboard (hoy a las 00:00, hora local).
export const today = () => startOfToday();
