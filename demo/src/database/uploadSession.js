import { supabase } from './supabaseClient.js';
import { createSession, updateSessionQuality } from './sessions.js';
import { transformGameResult } from './metricsTransform.js';

// Orchestrates the full upload of a completed playthrough to Supabase.
// Called once at the end of a 3-game session.
//
// Parameters:
//   subjectId  - UUID of the subject who played
//   games      - Array of {finalized, accumulator} for each game in play order
//
// Returns: { ok, sessionId, error? }

export async function uploadPlaythrough(subjectId, games, startedAt = null) {
  if (!subjectId || !games || games.length === 0) {
    return { ok: false, error: 'Missing subjectId or games' };
  }

  // 1. Transformar primero: si algún juego no es válido no se crea una sesión vacía.
  let rows;
  try {
    rows = games.map(({ finalized, accumulator }, i) => finalized ? transformGameResult(finalized, null, i + 1, accumulator) : null).filter(Boolean);
  } catch (e) {
    console.error('[upload] resultado no válido:', e.message);
    return { ok: false, error: e.message };
  }
  if (!rows.length) return { ok: false, error: 'No games to upload' };

  // 2. Create session (startedAt captures the real moment the player started)
  const sessionResult = await createSession(subjectId, startedAt);
  if (!sessionResult.ok) {
    console.error('[upload] Session creation failed:', sessionResult.error);
    return { ok: false, error: sessionResult.error };
  }

  const sessionId = sessionResult.session.id;

  // 3. Insert each game result
  const errors = [];
  for (const row0 of rows) {
    const row = { ...row0, session_id: sessionId };
    const i = row.play_order - 1;
    const { error, status, statusText } = await supabase
      .from('game_results')
      .insert(row);

    if (error) {
      console.error(`[upload] game_results insert FAILED for game ${i + 1} (${row.game_key}):`, {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
        status,
        statusText,
      });
      errors.push(`${row.game_key}: ${error.message} (${error.code || 'no-code'})`);
    } else {
      console.log(`[upload] game_results inserted OK: game ${i + 1} (${row.game_key})`);
    }
  }

  // 3. Update session quality (average across games)
  const accsWithData = games.filter(g => g.accumulator);
  if (accsWithData.length > 0) {
    let totalGoodFrames = 0;
    let totalAttemptedFrames = 0;
    let totalDurationMs = 0;

    for (const g of accsWithData) {
      const acc = g.accumulator;
      const goodFrames = acc.frames || 0;
      const attemptedFrames = acc._totalFramesAttempted || goodFrames || 1;
      totalGoodFrames += goodFrames;
      totalAttemptedFrames += attemptedFrames;
      totalDurationMs += (g.finalized?.durationMs || 0);
    }

    const qualityPct = totalAttemptedFrames > 0
      ? Math.round((totalGoodFrames / totalAttemptedFrames) * 100 * 10) / 10
      : null;
    const avgFps = totalDurationMs > 0
      ? Math.round((totalGoodFrames / (totalDurationMs / 1000)) * 10) / 10
      : null;

    await updateSessionQuality(sessionId, qualityPct, avgFps);
  }

  if (errors.length > 0) {
    return { ok: false, sessionId, error: errors.join('; ') };
  }

  return { ok: true, sessionId };
}
