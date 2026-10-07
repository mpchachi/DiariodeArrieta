// Genera el SQL de los pacientes de DEMOSTRACIÓN (datos ficticios) para el dashboard:
// 8 pacientes con distintas evoluciones y 6–9 sesiones semanales del viaje del zorro
// (3 capítulos cada una), con las mismas columnas y escalas que las partidas reales.
//   node scripts/seed-demo-data.mjs > database/seed/demo_patients.sql          (SQL)
//   SEED_USER=mateo SEED_PASSWORD=… node scripts/seed-demo-data.mjs --upload   (API, con RLS)
// Se asignan al médico que sube (equipo piloto → los ve todo el equipo). Determinista.
// Para borrarlos: DELETE FROM subjects WHERE patient_data->>'demo' = 'true';

const PALM_MM = 95;
function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rng = mulberry32(20261007);
const rand = (a, b) => a + rng() * (b - a);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const r2 = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
const band = t => (t > 3.5 ? 'pathological' : t > 1.5 ? 'physiological' : 'none');
const q = v => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const j = o => `'${JSON.stringify(o).replace(/'/g, "''")}'::jsonb`;

const PATIENTS = [
  { code: 'PT-3764', year: 1948, sex: 'male', hand: 'right', side: 'right', mob: 'reduced', stroke: 'ischemic', traj: 'regressing', n: 8, tremor: 1.5 },
  { code: 'PT-5250', year: 1956, sex: 'female', hand: 'right', side: 'left', mob: 'agile', stroke: 'hemorrhagic', traj: 'irregular', n: 7, tremor: 1.2 },
  { code: 'PT-7740', year: 1944, sex: 'female', hand: 'left', side: 'left', mob: 'reduced', stroke: 'ischemic', traj: 'regressing', n: 6, tremor: 0.8 },
  { code: 'PT-4645', year: 1961, sex: 'male', hand: 'right', side: 'left', mob: 'agile', stroke: 'ischemic', traj: 'improving', n: 9, tremor: 0 },
  { code: 'PT-2865', year: 1952, sex: 'female', hand: 'right', side: 'right', mob: 'moderate', stroke: 'ischemic', traj: 'plateau', n: 8, tremor: 0.2 },
  { code: 'PT-8338', year: 1958, sex: 'male', hand: 'right', side: 'left', mob: 'moderate', stroke: 'hemorrhagic', traj: 'improving', n: 7, tremor: 0.3 },
  { code: 'PT-1192', year: 1950, sex: 'male', hand: 'left', side: 'right', mob: 'moderate', stroke: 'ischemic', traj: 'improving', n: 6, tremor: 0.4 },
  { code: 'PT-6021', year: 1964, sex: 'female', hand: 'right', side: 'right', mob: 'agile', stroke: 'ischemic', traj: 'plateau', n: 8, tremor: 0 },
];
const traj = (kind, p) => {
  const noise = rand(-0.05, 0.05);
  if (kind === 'improving') return 0.35 + p * 0.5 + noise;
  if (kind === 'plateau') return 0.55 + noise * 2;
  if (kind === 'regressing') return 0.72 - p * 0.42 + noise;
  return rand(0.25, 0.8);
};

function rows(t, tremorBias) {
  const pullTremor = clamp((1 - t) * 4 + tremorBias * 2 + rand(-0.4, 0.4), 0.3, 6);
  const runner = {
    game_key: 'fox_runner', play_order: 1, duration_ms: Math.round(rand(34000, 52000)),
    pinch_count: Math.round(rand(5, 9)), rep_count: 5,
    pinch_distance_mean_mm: r2((1 - t) * 18 + 6 + rand(-2, 2), 1), grip_aperture_mean_mm: r2(clamp(t * 0.9 + rand(-0.08, 0.08), 0.2, 1) * PALM_MM, 1),
    grip_aperture_cv: r2(clamp((1 - t) * 0.4 + rand(-0.05, 0.05), 0.03, 0.6), 3), mean_duration_ms: Math.round((1 - t) * 3000 + 4500 + rand(-300, 300)),
    session_sparc: r2(-1.4 - (1 - t) * 2.4 + rand(-0.2, 0.2), 3), tremor_amp_mean: r2(pullTremor / 100, 4), tremor_band: band(pullTremor),
    fatigue_index: r2(clamp(-(1 - t) * 22 + rand(-4, 4), -40, 5), 1), quality_frames_pct: r2(rand(86, 99), 1), avg_fps: r2(rand(26, 31), 1),
    metrics_display: { maxPinchOpen: r2(clamp(t * 0.95 + rand(-0.08, 0.08), 0.15, 1), 3), maxPullDistance: r2(clamp(t * 420 + rand(-40, 40), 40, 500), 1),
      pullTremor: r2(pullTremor, 2), accuracyRatio: r2(clamp(Math.round(clamp(t * 5 + rand(-0.8, 0.8), 1, 5)) / 5, 0.2, 1), 3), totalShots: Math.round(rand(5, 9)) },
  };
  const ext = clamp(t * 0.9 + rand(-0.08, 0.08), 0.1, 1), flex = clamp(t * 0.92 + rand(-0.08, 0.08), 0.15, 1);
  const balloon = {
    game_key: 'fox_balloon', play_order: 2, duration_ms: Math.round(rand(32000, 45000)),
    hand_open_pct_p90: r2(ext * 100, 1), hand_open_pct_p10: r2((1 - flex) * 100, 1), rep_count: Math.round(t * 16 + rand(2, 5)),
    session_sparc: r2(-1.6 - (1 - t) * 2.2 + rand(-0.2, 0.2), 3), fatigue_index: r2(clamp(-(1 - t) * 25 + rand(-3, 3), -30, 0), 1),
    tremor_band: band(pullTremor * 0.8), quality_frames_pct: r2(rand(85, 99), 1),
    metrics_display: { maxExtension: r2(ext, 3), maxFlexion: r2(flex, 3), activationCount: Math.round(clamp(t * 45 + rand(-5, 5), 5, 60)),
      fatigueIndex: r2(clamp(-(1 - t) * 25 + rand(-3, 3), -30, 0), 1), smoothnessJerk: r2(clamp((1 - t) * 4.5 + rand(-0.4, 0.4), 0, 6), 2) },
  };
  const pron = clamp(t * 78 + rand(-5, 5), 10, 90), sup = clamp(t * 70 + rand(-6, 6), 5, 90);
  const garden = {
    game_key: 'fox_garden', play_order: 3, duration_ms: Math.round(rand(28000, 60000)),
    max_pronation_deg: r2(pron, 1), max_supination_deg: r2(sup, 1), rom_deg_p90: r2(pron + sup, 1),
    mean_peak_velocity: r2(t * 160 + rand(10, 30), 1), peak_velocity_cv: r2(clamp((1 - t) * 0.5 + rand(-0.05, 0.05), 0.05, 0.7), 3),
    session_sparc: r2(-1.3 - (1 - t) * 2.5 + rand(-0.2, 0.2), 3), rep_count: 5, mean_duration_ms: Math.round((1 - t) * 4000 + 1800 + rand(-200, 200)),
    fatigue_index: r2(clamp(-(1 - t) * 20 + rand(-4, 4), -35, 5), 1), tremor_band: band(pullTremor * 0.9), quality_frames_pct: r2(rand(84, 99), 1),
    metrics_display: { maxSupination: r2(sup, 1), maxPronation: r2(pron, 1), smoothnessJerk: r2(clamp((1 - t) * 4.5 + tremorBias + rand(-0.4, 0.4), 0, 6), 2),
      waterAccuracy: r2(clamp(t * 95 + rand(-5, 5), 20, 100), 1), poisonError: r2(clamp((1 - t) * 38 + rand(-5, 5), 0, 50), 1),
      averagePouringTime: Math.round(clamp((1 - t) * 4000 + 1500 + rand(-200, 200), 500, 5000)) },
  };
  return [runner, balloon, garden].map(r => ({ ...r, outcome: { demo: true, completed: true }, repetitions: [] }));
}

// Plan de datos (independiente del formato de salida).
const today = Date.UTC(2026, 9, 7);
const plan = PATIENTS.map(p => {
  const strokeDate = new Date(today - Math.round(rand(60, 220)) * 864e5).toISOString().slice(0, 10);
  const lastDaysAgo = Math.round(rand(1, 6));
  const sessions = [];
  for (let s = 0; s < p.n; s++) {
    const daysAgo = lastDaysAgo + (p.n - 1 - s) * 7 + Math.round(rand(-1, 1));
    const date = new Date(today - daysAgo * 864e5 + Math.round(rand(9, 18)) * 36e5).toISOString();
    const t = clamp(traj(p.traj, p.n > 1 ? s / (p.n - 1) : 1), 0.12, 0.98);
    sessions.push({ date, device: { handUsed: p.side === 'left' ? 'left' : 'right', app: 'fox-journey', demo: true }, rows: rows(t, p.tremor) });
  }
  return { subject: { display_name: `${p.code} (demo)`, birth_year: p.year, sex: p.sex, dominant_hand: p.hand, subject_type: 'patient',
    patient_data: { demo: true, strokeType: p.stroke, strokeDate, affectedSide: p.side, mobility: p.mob }, notes: 'Paciente de demostración (datos ficticios)' }, sessions };
});

if (process.argv.includes('--upload')) {
  const { createClient } = await import('@supabase/supabase-js');
  const { readFileSync } = await import('node:fs');
  const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n').filter(l => /^VITE_SUPABASE_/.test(l)).map(l => l.split('=')));
  const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const u = String(process.env.SEED_USER || '').toLowerCase();
  const { data: auth, error } = await sb.auth.signInWithPassword({ email: u.includes('@') ? u : `${u}@fixedgap.local`, password: process.env.SEED_PASSWORD || '' });
  if (error) { console.error('Login:', error.message); process.exit(1); }
  const me = auth.user.id;
  const { count } = await sb.from('subjects').select('id', { count: 'exact', head: true }).eq('patient_data->>demo', 'true');
  if (count) { console.log(`Ya hay ${count} pacientes de demostración; no se duplican.`); process.exit(0); }
  let nS = 0, nR = 0;
  for (const p of plan) {
    const { data: subj, error: e1 } = await sb.from('subjects').insert({ ...p.subject, operator_id: me }).select('id').single();
    if (e1) throw e1;
    for (const s of p.sessions) {
      const { data: sess, error: e2 } = await sb.from('sessions').insert({ subject_id: subj.id, operator_id: me, started_at: s.date, device: s.device }).select('id').single();
      if (e2) throw e2;
      const { error: e3 } = await sb.from('game_results').insert(s.rows.map(r => ({ ...r, session_id: sess.id })));
      if (e3) throw e3;
      nS++; nR += s.rows.length;
    }
  }
  console.log(`✓ ${plan.length} pacientes de demostración, ${nS} sesiones y ${nR} resultados subidos.`);
  await sb.auth.signOut();
  process.exit(0);
}

const out = [`-- Pacientes de demostración (datos ficticios) — generado por scripts/seed-demo-data.mjs`, 'BEGIN;',
  `DO $$ DECLARE op uuid; subj uuid; sess uuid; BEGIN`,
  `  SELECT id INTO op FROM public.operators WHERE username = 'mateo';`,
  `  IF op IS NULL THEN RAISE EXCEPTION 'No existe el médico mateo'; END IF;`,
  `  IF EXISTS (SELECT 1 FROM public.subjects WHERE patient_data->>'demo' = 'true') THEN RAISE NOTICE 'Ya hay pacientes de demostración'; RETURN; END IF;`];
for (const p of plan) {
  out.push(`  INSERT INTO public.subjects (operator_id, display_name, birth_year, sex, dominant_hand, subject_type, patient_data, notes)`,
    `  VALUES (op, ${q(p.subject.display_name)}, ${p.subject.birth_year}, ${q(p.subject.sex)}, ${q(p.subject.dominant_hand)}, 'patient', ${j(p.subject.patient_data)}, ${q(p.subject.notes)}) RETURNING id INTO subj;`);
  for (const s of p.sessions) {
    out.push(`  INSERT INTO public.sessions (subject_id, operator_id, started_at, device) VALUES (subj, op, ${q(s.date)}, ${j(s.device)}) RETURNING id INTO sess;`);
    for (const r of s.rows) {
      const cols = Object.keys(r);
      out.push(`  INSERT INTO public.game_results (session_id, ${cols.join(', ')}) VALUES (sess, ${cols.map(c => (typeof r[c] === 'object' && r[c] !== null ? j(r[c]) : q(r[c]))).join(', ')});`);
    }
  }
}
out.push('END $$;', 'COMMIT;');
console.log(out.join('\n'));
