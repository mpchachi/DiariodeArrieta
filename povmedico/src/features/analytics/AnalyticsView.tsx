import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { getCohorteStats, getPatient, getSessions } from '../../data/api';
import type { Patient, Session } from '../../data/types';
import { Card } from '../../components/Card';
import { useStore } from '../../store/useStore';
import { chartTheme, colors } from '../../design/tokens';

export function AnalyticsView() {
  const { patients, sessions, loaded, load } = useStore();
  const [stats, setStats] = useState<Awaited<ReturnType<typeof getCohorteStats>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loaded) load();
    getCohorteStats().then(setStats).catch(e => setError(e.message));
  }, [loaded, load]);

  if (error) return <div className="p-8 text-alert">Error cargando datos: {error}</div>;

  if (!stats) {
    return (
      <div className="space-y-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 rounded-lg animate-shimmer" />
        ))}
      </div>
    );
  }

  const latestByPatient = new Map<string, Session>();
  for (const s of sessions) {
    const existing = latestByPatient.get(s.patientId);
    if (!existing || s.date > existing.date) latestByPatient.set(s.patientId, s);
  }

  const flaggedCount = Array.from(latestByPatient.values()).filter(s =>
    s.derived.tremorFlag || s.derived.spasticityFlag || s.derived.fatigueFlag || s.derived.impulseControlFlag
  ).length;

  return (
    <div>
      <h1 className="text-xl font-semibold text-txt tracking-tight mb-6">Analítica de cohorte</h1>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6 stagger-children">
        <Card>
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[11px] text-txt-muted uppercase tracking-wider font-medium mb-1">Puntuación global media</div>
              <div className="text-3xl font-bold tabular-nums text-txt animate-countUp">{stats.avgGlobalScore.toFixed(1)}</div>
            </div>
            <div className="p-2 rounded-md bg-dom-distal/10 border border-dom-distal/20">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-dom-distal"><path d="M22 12h-4l-3 9-4-18-3 9H2"/></svg>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[11px] text-txt-muted uppercase tracking-wider font-medium mb-1">Adherencia media</div>
              <div className="text-3xl font-bold tabular-nums text-txt animate-countUp">{stats.avgAdherence.toFixed(0)}%</div>
            </div>
            <div className="p-2 rounded-md bg-ok/10 border border-ok/20">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-ok"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[11px] text-txt-muted uppercase tracking-wider font-medium mb-1">Pacientes con alertas</div>
              <div className="text-3xl font-bold tabular-nums text-alert animate-countUp">{flaggedCount}</div>
              <div className="text-[11px] text-txt-muted">de {patients.length}</div>
            </div>
            <div className="p-2 rounded-md bg-alert/10 border border-alert/20">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-alert"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[11px] text-txt-muted uppercase tracking-wider font-medium mb-1">Sesiones totales</div>
              <div className="text-3xl font-bold tabular-nums text-txt animate-countUp">{sessions.length}</div>
            </div>
            <div className="p-2 rounded-md bg-dom-pronosup/10 border border-dom-pronosup/20">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-dom-pronosup"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            </div>
          </div>
        </Card>
      </div>

      {/* Score distribution */}
      <Card className="mb-6 animate-fadeInUp">
        <h2 className="text-[15px] font-semibold text-txt mb-4">Distribución de puntuaciones globales</h2>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.scoreDistribution} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
              <XAxis dataKey="range" tick={{ fontSize: 11, fill: chartTheme.axisText }} />
              <YAxis tick={{ fontSize: 11, fill: chartTheme.axisText }} />
              <Tooltip
                contentStyle={{ backgroundColor: chartTheme.tooltipBg, borderRadius: '8px', border: `1px solid ${chartTheme.tooltipBorder}`, color: colors.text }}
                itemStyle={{ color: colors.text }}
                labelStyle={{ color: colors.textSecondary, fontWeight: 600 }}
              />
              <Bar dataKey="count" fill={colors.distal} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Flags breakdown */}
      <Card className="mb-6 animate-fadeInUp" style={{ animationDelay: '100ms' }}>
        <h2 className="text-[15px] font-semibold text-txt mb-4">Prevalencia de alertas clínicas</h2>
        <div className="grid grid-cols-4 gap-4">
          <FlagStat label="Temblor" value={stats.flagPercentages.tremor} />
          <FlagStat label="Fragmentación" value={stats.flagPercentages.spasticity} />
          <FlagStat label="Fatiga" value={stats.flagPercentages.fatigue} />
          <FlagStat label="Precisión" value={stats.flagPercentages.impulse} />
        </div>
      </Card>

      {/* Mobility breakdown */}
      <Card className="animate-fadeInUp" style={{ animationDelay: '200ms' }}>
        <h2 className="text-[15px] font-semibold text-txt mb-4">Pacientes por movilidad</h2>
        <div className="grid grid-cols-3 gap-4">
          {['agile', 'moderate', 'reduced'].map(level => {
            const count = patients.filter(p => p.mobility === level).length;
            const mobilityLabels: Record<string, string> = { agile: 'Ágil', moderate: 'Moderado', reduced: 'Reducido' };
            return (
              <div key={level} className="text-center p-4 rounded-lg bg-clay-surface-elevated border border-clay-border">
                <div className="text-2xl font-bold tabular-nums text-txt animate-countUp">{count}</div>
                <div className="text-[11px] text-txt-secondary capitalize mt-1">{mobilityLabels[level]}</div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

export function PatientCohortComparison() {
  const { id } = useParams<{ id: string }>();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { patients, sessions: allSessions, loaded, load } = useStore();

  useEffect(() => {
    if (!loaded) load();
  }, [loaded, load]);

  useEffect(() => {
    if (!id) return;
    getPatient(id).then(p => setPatient(p ?? null)).catch(e => setError(e.message));
    getSessions(id).then(s => setSessions(s.sort((a, b) => a.date.localeCompare(b.date)))).catch(e => setError(e.message));
  }, [id]);

  if (error) return <Card className="mt-6 text-alert text-sm">Error cargando la cohorte: {error}</Card>;
  if (!patient || sessions.length === 0) return null;

  const lastSession = sessions[sessions.length - 1];
  // Emparejamiento solo con datos que constan.
  const matchedPatients = patients.filter(p =>
    p.id !== patient.id &&
    p.mobility === patient.mobility &&
    (patient.age === null || p.age === null || Math.abs(p.age - patient.age) <= 10) &&
    p.strokeType === patient.strokeType
  );

  // Sin última sesión no hay puntuación: no se rellena con 50.
  const cohortScores = matchedPatients.flatMap(p => {
    const pSessions = allSessions.filter(s => s.patientId === p.id).sort((a, b) => a.date.localeCompare(b.date));
    const last = pSessions[pSessions.length - 1];
    return last ? [last.derived.globalMotorScore] : [];
  }).sort((a, b) => a - b);

  const patientScore = lastSession.derived.globalMotorScore;
  const percentile = cohortScores.length >= 3
    ? Math.round((cohortScores.filter(s => s <= patientScore).length / cohortScores.length) * 100)
    : null;

  return (
    <Card className="mt-6 animate-fadeInUp">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[15px] font-semibold text-txt">Posición en la cohorte emparejada</h3>
        <Link to="/analytics" className="text-[12px] text-accent hover:text-accent/80 transition-colors no-underline flex items-center gap-1">
          Ver analítica
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
        </Link>
      </div>
      <p className="text-[11px] text-txt-muted mb-3">
        Comparado con {cohortScores.length} pacientes (movilidad {patient.mobility ? { agile: 'ágil', moderate: 'moderada', reduced: 'reducida' }[patient.mobility] : 'no consta'}, ±10 años{patient.strokeType ? `, ${patient.strokeType === 'ischemic' ? 'isquémico' : 'hemorrágico'}` : ''})
      </p>
      {percentile === null ? (
        <p className="text-sm text-txt-secondary">Datos insuficientes: hacen falta al menos 3 pacientes comparables.</p>
      ) : (
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <div className="h-3 bg-clay-surface-elevated rounded-md overflow-hidden relative border border-clay-border">
            <div className="h-full bg-gradient-to-r from-accent/40 to-accent/60 rounded-md transition-all duration-700" style={{ width: `${percentile}%` }} />
            <div className="absolute top-0 h-full w-0.5 bg-accent shadow-clay" style={{ left: `${percentile}%` }} />
          </div>
        </div>
        <div className="text-right">
          <div className="text-xl font-bold tabular-nums text-accent">P{percentile}</div>
          <div className="text-[10px] text-txt-muted uppercase tracking-wider">percentil</div>
        </div>
      </div>
      )}
    </Card>
  );
}

function FlagStat({ label, value }: { label: string; value: number }) {
  const barColor = value > 50 ? colors.alert : value > 25 ? colors.warning : colors.ok;
  return (
    <div className="text-center">
      <div className={`text-xl font-bold tabular-nums ${value > 50 ? 'text-alert' : value > 25 ? 'text-warning' : 'text-ok'}`}>
        {Math.round(value)}%
      </div>
      <div className="text-[11px] text-txt-muted mb-2">{label}</div>
      <div className="h-1.5 bg-clay-surface-elevated rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${value}%`, backgroundColor: barColor }} />
      </div>
    </div>
  );
}
