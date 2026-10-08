import { supabase } from './supabaseClient.js';
import { buildJourneyRows } from '../pack/journeyRecord.js';

// Guarda un viaje del zorro en Supabase: una sesión + una fila de game_results por capítulo
// jugado (máx. 3; con los 3 la sesión queda «completa» por trigger). Reintenta las
// llamadas que fallen por red. Devuelve { ok, sessionId?, error? }.
//   subjectId: paciente · startedAt: inicio del viaje (Date/ISO) · hand: 'Right'|'Left'
//   results: { runner, flappy, garden } (resultado de cada juego o null si se saltó)
//   sessionId: opcional; si se repite la llamada con el mismo id (botón «Reintentar»,
//   respuesta perdida por red) no se crea una segunda sesión ni filas duplicadas.

const DUPLICATE = '23505'; // unique_violation: la fila ya estaba, cuenta como éxito

const retry = async (fn, tries = 3) => {
  let last;
  for (let i = 0; i < tries; i++) {
    const res = await fn();
    if (!res.error || res.error.code === DUPLICATE) return { ...res, error: null };
    last = res;
    const code = String(res.error?.code ?? '');
    if ((code.startsWith('4') && code !== '408') || code.startsWith('PGRST3')) break; // datos/permiso/JWT: no insistir
    await new Promise(r => setTimeout(r, 600 * (i + 1)));
  }
  return last;
};

const newId = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));

export async function uploadJourney({ subjectId, startedAt = null, hand = null, results, sessionId = null }) {
  if (!subjectId) return { ok: false, error: 'Sin paciente: el viaje no se ha iniciado desde la lista de pacientes.' };
  const rows = buildJourneyRows(results || {});
  if (!rows.length) return { ok: false, error: 'No hay resultados que guardar (se saltaron todos los capítulos).' };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'La sesión del médico ha caducado. Vuelve a iniciar sesión.' };

  const id = sessionId || newId();
  const quality = rows.map(r => r.quality_frames_pct).filter(Number.isFinite);
  const session = await retry(() => supabase.from('sessions').upsert({
    id, subject_id: subjectId, operator_id: user.id,
    started_at: startedAt ? new Date(startedAt).toISOString() : new Date().toISOString(),
    device: {
      userAgent: navigator.userAgent, screenWidth: screen.width, screenHeight: screen.height, platform: navigator.platform,
      handUsed: hand === 'Left' ? 'left' : 'right', app: 'fox-journey', protocol: 'fixedgap-fox-journey-v1',
    },
    quality_frames_pct: quality.length ? Math.round(quality.reduce((a, b) => a + b, 0) / quality.length * 10) / 10 : null,
  }, { onConflict: 'id', ignoreDuplicates: true }));
  if (session.error) return { ok: false, sessionId: id, error: session.error.message };

  const inserted = await retry(() => supabase.from('game_results')
    .upsert(rows.map(r => ({ ...r, session_id: id })), { onConflict: 'session_id,game_key', ignoreDuplicates: true }));
  if (inserted.error) return { ok: false, sessionId: id, error: inserted.error.message };
  return { ok: true, sessionId: id };
}
