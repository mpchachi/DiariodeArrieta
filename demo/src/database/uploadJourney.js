import { supabase } from './supabaseClient.js';
import { buildJourneyRows } from '../pack/journeyRecord.js';

// Guarda un viaje del zorro en Supabase: una sesión + una fila de game_results por capítulo
// jugado (máx. 3; con los 3 la sesión queda «completa» por trigger). Reintenta las
// llamadas que fallen por red. Devuelve { ok, sessionId?, error? }.
//   subjectId: paciente · startedAt: inicio del viaje (Date/ISO) · hand: 'Right'|'Left'
//   results: { runner, flappy, garden } (resultado de cada juego o null si se saltó)

const retry = async (fn, tries = 3) => {
  let last;
  for (let i = 0; i < tries; i++) {
    const res = await fn();
    if (!res.error) return res;
    last = res;
    if (res.error?.code && String(res.error.code).startsWith('4') && res.error.code !== '408') break; // error de datos/permiso: no insistir
    await new Promise(r => setTimeout(r, 600 * (i + 1)));
  }
  return last;
};

export async function uploadJourney({ subjectId, startedAt = null, hand = null, results }) {
  if (!subjectId) return { ok: false, error: 'Sin paciente: el viaje no se ha iniciado desde la lista de pacientes.' };
  const rows = buildJourneyRows(results || {});
  if (!rows.length) return { ok: false, error: 'No hay resultados que guardar (se saltaron todos los capítulos).' };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'La sesión del médico ha caducado. Vuelve a iniciar sesión.' };

  const quality = rows.map(r => r.quality_frames_pct).filter(Number.isFinite);
  const session = await retry(() => supabase.from('sessions').insert({
    subject_id: subjectId, operator_id: user.id,
    started_at: startedAt ? new Date(startedAt).toISOString() : new Date().toISOString(),
    device: {
      userAgent: navigator.userAgent, screenWidth: screen.width, screenHeight: screen.height, platform: navigator.platform,
      handUsed: hand === 'Left' ? 'left' : 'right', app: 'fox-journey', protocol: 'fixedgap-fox-journey-v1',
    },
    quality_frames_pct: quality.length ? Math.round(quality.reduce((a, b) => a + b, 0) / quality.length * 10) / 10 : null,
  }).select('id').single());
  if (session.error) return { ok: false, error: session.error.message };

  const sessionId = session.data.id;
  const inserted = await retry(() => supabase.from('game_results').insert(rows.map(r => ({ ...r, session_id: sessionId }))));
  if (inserted.error) return { ok: false, sessionId, error: inserted.error.message };
  return { ok: true, sessionId };
}
