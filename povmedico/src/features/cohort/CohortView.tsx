import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../../store/useStore';
import { FlagChip } from '../../components/FlagChip';
import { Sparkline } from '../../components/Sparkline';
import { ScoreRing } from '../../components/ScoreRing';
import { AdherenceHeatmap } from '../../components/AdherenceHeatmap';
import { BodyIcon } from '../../components/BodyIcon';
import { CohortFilters } from './CohortFilters';
import { colors } from '../../design/tokens';
import type { Session, Patient, ScaleMetricResult, SlingshotMetrics, FlappyMetrics, WaterMetrics } from '../../data/types';
import { FLAG_LABELS, TREMOR_PATHOLOGICAL, SPASTICITY_JERK, FATIGUE_PCT } from '../../domain/thresholds';
import { MOBILITY_LABELS } from '../../domain/labels';

type ViewMode = 'cards' | 'table';

export function CohortView() {
  const { loaded, load, error, sessions, getFilteredPatients } = useStore();
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!loaded) load();
  }, [loaded, load]);

  if (!loaded) {
    return (
      <div className="space-y-5">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-28 rounded-2xl animate-shimmer" />
        ))}
      </div>
    );
  }

  if (error) return <div className="p-8 text-alert">Error cargando datos: {error}</div>;

  const patients = getFilteredPatients();
  const alertCount = patients.filter(p => p.lastSession && (
    p.lastSession.derived.tremorFlag || p.lastSession.derived.spasticityFlag ||
    p.lastSession.derived.fatigueFlag || p.lastSession.derived.impulseControlFlag
  )).length;

  const spotlightPatients = patients.filter(p => p.priorityScore >= 2.5).slice(0, 5);
  const restPatients = patients.filter(p => !spotlightPatients.includes(p));
  const deterioratingCount = patients.filter(p => {
    const patientSessions = getPatientSessions(sessions, p.id);
    return computeDelta7d(patientSessions) < -5;
  }).length;
  const avgAdherence = computeAverageAdherence(patients);
  const lastSync = getLastSessionDate(sessions);

  return (
    <div>
      {/* Header */}
      <div className="flex items-end justify-between mb-7">
        <div>
          <h1 className="font-display text-[26px] font-extrabold text-txt tracking-tight">Triaje remoto post-ictus</h1>
          <p className="text-[14px] text-txt-secondary mt-1.5 max-w-[680px]">
            Monitorización motora domiciliaria para priorizar la revisión clínica según evolución, adherencia y señales de movimiento.
          </p>
          <p className="text-[13px] text-txt-secondary mt-1">
            {patients.length} pacientes · <span className="text-alert font-semibold">{alertCount} con alertas activas</span>
          </p>
        </div>
        {/* View toggle */}
        <div className="flex items-center gap-1 p-1 bg-clay-surface-elevated rounded-xl border-2 border-clay-border shadow-clay-inset">
          <ViewToggle active={viewMode === 'cards'} onClick={() => setViewMode('cards')} label="Tarjetas" icon={<GridIcon />} />
          <ViewToggle active={viewMode === 'table'} onClick={() => setViewMode('table')} label="Tabla" icon={<TableIcon />} />
        </div>
      </div>

      <ImpactStrip
        patientsCount={patients.length}
        alertCount={alertCount}
        deterioratingCount={deterioratingCount}
        avgAdherence={avgAdherence}
        lastSync={lastSync}
      />

      <CohortFilters />

      {/* Spotlight: urgent */}
      {spotlightPatients.length > 0 && (
        <section className="mt-8">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-2.5 h-2.5 rounded-full bg-alert animate-pulse-dot" />
            <h2 className="font-display text-[14px] font-bold text-alert uppercase tracking-wider">Requieren atención</h2>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start stagger-children">
            {spotlightPatients.map(p => (
              <PatientCard
                key={p.id}
                patient={p}
                sessions={sessions}
                expanded={expandedId === p.id}
                onToggle={() => setExpandedId(expandedId === p.id ? null : p.id)}
                onNavigate={() => navigate(`/patient/${p.id}`)}
                variant="spotlight"
              />
            ))}
          </div>
        </section>
      )}

      {/* Rest patients */}
      {restPatients.length > 0 && (
        <section className="mt-10">
          <h2 className="font-display text-[14px] font-bold text-txt-secondary uppercase tracking-wider mb-5">
            Monitorizados ({restPatients.length})
          </h2>

          {viewMode === 'cards' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start stagger-children">
              {restPatients.map(p => (
                <PatientCard
                  key={p.id}
                  patient={p}
                  sessions={sessions}
                  expanded={expandedId === p.id}
                  onToggle={() => setExpandedId(expandedId === p.id ? null : p.id)}
                  onNavigate={() => navigate(`/patient/${p.id}`)}
                  variant="rest"
                />
              ))}
            </div>
          ) : (
            /* Dense table view */
            <div className="bg-clay-surface-solid rounded-2xl border-[2.5px] border-clay-border shadow-clay overflow-hidden">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b-2 border-clay-border bg-clay-surface-elevated">
                    <th className="text-left py-3 px-4 text-[10px] text-txt-muted uppercase tracking-wider font-bold font-display">Paciente</th>
                    <th className="text-center py-3 px-3 text-[10px] text-txt-muted uppercase tracking-wider font-bold font-display">Puntuación</th>
                    <th className="text-center py-3 px-3 text-[10px] text-txt-muted uppercase tracking-wider font-bold font-display">Δ 7d</th>
                    <th className="text-center py-3 px-3 text-[10px] text-txt-muted uppercase tracking-wider font-bold font-display">Tendencia</th>
                    <th className="text-left py-3 px-3 text-[10px] text-txt-muted uppercase tracking-wider font-bold font-display">Alertas</th>
                    <th className="text-center py-3 px-3 text-[10px] text-txt-muted uppercase tracking-wider font-bold font-display">Adherencia</th>
                    <th className="text-right py-3 px-4 text-[10px] text-txt-muted uppercase tracking-wider font-bold font-display">Prior.</th>
                  </tr>
                </thead>
                <tbody>
                  {restPatients.map((p, i) => {
                    const patientSessions = getPatientSessions(sessions, p.id);
                    const last10 = patientSessions.slice(-10).map(s => s.derived.globalMotorScore);
                    const delta7d = computeDelta7d(patientSessions);
                    const adherenceLogs = p.prescribedExercises.flatMap(e => e.adherenceLog);
                    const lastSession = p.lastSession;

                    return (
                      <tr
                        key={p.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => navigate(`/patient/${p.id}`)}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/patient/${p.id}`); } }}
                        className={`cursor-pointer transition-colors hover:bg-clay-surface-hover ${i < restPatients.length - 1 ? 'border-b-2 border-clay-border/40' : ''}`}
                      >
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            {p.affectedSide && <BodyIcon side={p.affectedSide} size={16} />}
                            <span className="font-semibold text-txt">{p.pseudonym}</span>
                            <MobilityTag mobility={p.mobility} />
                            <span className="text-[10px] text-txt-muted">{p.age !== null ? `${p.age} a` : '—'}</span>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-center">
                          {lastSession && (
                            <span className="font-display font-bold tabular-nums" style={{ color: getScoreColor(lastSession.derived.globalMotorScore) }}>
                              {Math.round(lastSession.derived.globalMotorScore)}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center">
                          {delta7d !== 0 && (
                            <span className={`text-[11px] font-bold tabular-nums ${delta7d > 0 ? 'text-ok' : 'text-alert'}`}>
                              {delta7d > 0 ? '+' : ''}{delta7d.toFixed(1)}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <Sparkline data={last10} width={52} height={16} color={getTrendColor(last10)} />
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex gap-1">
                            {lastSession && (
                              <>
                                <FlagChip active={lastSession.derived.tremorFlag} label="T" tooltip="Temblor patológico" variant="tremor" />
                                <FlagChip active={lastSession.derived.spasticityFlag} label="F" tooltip="Fragmentación" variant="spasticity" />
                                <FlagChip active={lastSession.derived.fatigueFlag} label="Ft" tooltip="Fatiga motora" variant="fatigue" />
                                <FlagChip active={lastSession.derived.impulseControlFlag} label="P" tooltip="Precisión reducida" variant="impulse" />
                              </>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-center">
                          {p.prescribedExercises.length > 0 ? (
                            <AdherenceHeatmap logs={adherenceLogs} />
                          ) : (
                            <span className="text-[10px] text-txt-muted italic">Sin pauta</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <span className="font-display font-bold tabular-nums text-txt-secondary">{p.priorityScore.toFixed(1)}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

/* ── Patient Card ── */

type EnrichedPatient = Patient & { priorityScore: number; lastSession?: Session };

function PatientCard({ patient: p, sessions, expanded, onToggle, onNavigate, variant }: {
  patient: EnrichedPatient;
  sessions: Session[];
  expanded: boolean;
  onToggle: () => void;
  onNavigate: () => void;
  variant: 'spotlight' | 'rest';
}) {
  const lastSession = p.lastSession;
  if (!lastSession && variant === 'spotlight') return null;

  const patientSessions = getPatientSessions(sessions, p.id);
  const delta7d = computeDelta7d(patientSessions);

  const activeFlags = lastSession ? [
    lastSession.derived.tremorFlag && FLAG_LABELS.tremorFlag,
    lastSession.derived.spasticityFlag && FLAG_LABELS.spasticityFlag,
    lastSession.derived.fatigueFlag && FLAG_LABELS.fatigueFlag,
    lastSession.derived.impulseControlFlag && FLAG_LABELS.impulseControlFlag,
  ].filter(Boolean) as string[] : [];

  const isSpotlight = variant === 'spotlight';
  const ringSize = isSpotlight ? 48 : 38;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onNavigate}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNavigate(); } }}
      className={`bg-clay-surface-solid rounded-2xl border-[2.5px] cursor-pointer transition-all duration-200 active:scale-[0.98] ${
        isSpotlight
          ? 'border-alert/30 hover:shadow-clay-hover hover:-translate-y-1'
          : 'border-clay-border shadow-clay hover:shadow-clay-hover hover:-translate-y-0.5'
      } ${expanded ? 'ring-2 ring-accent/20' : ''}`}
      style={isSpotlight ? { borderLeftWidth: '5px' } : undefined}
    >
      {/* Collapsed: simple state overview */}
      <div className={`flex items-center gap-3 ${isSpotlight ? 'p-4' : 'p-3.5'}`}>
        {lastSession && <ScoreRing score={lastSession.derived.globalMotorScore} size={ringSize} delta={delta7d} />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`font-display font-bold text-txt ${isSpotlight ? 'text-[15px]' : 'text-[14px]'}`}>{p.pseudonym}</span>
            <MobilityTag mobility={p.mobility} />
            {p.affectedSide && <BodyIcon side={p.affectedSide} size={isSpotlight ? 18 : 16} />}
          </div>
          {activeFlags.length > 0 && (
            <div className="flex gap-1 mt-1.5">
              {activeFlags.map(flag => (
                <span key={flag} className="text-[10px] px-1.5 py-0.5 rounded-md bg-alert/10 text-alert font-semibold">
                  {flag}
                </span>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          className="p-1.5 rounded-lg hover:bg-clay-surface-elevated transition-colors"
          aria-label={expanded ? 'Contraer métricas' : 'Ver métricas'}
        >
          <svg
            className={`w-4 h-4 text-txt-muted transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>

      {/* Expanded: full metrics */}
      {expanded && lastSession && (
        <div className="px-4 pb-4 pt-0 border-t-2 border-clay-border/40 mt-0 animate-fadeIn" onClick={(e) => e.stopPropagation()}>
          <div className="pt-3 space-y-3">
            {/* Domain scores */}
            <div className="flex items-center gap-4">
              <DomainDot label="Agarre" score={lastSession.derived.proximalGripScore} color={colors.proximal} />
              <DomainDot label="Coord." score={lastSession.derived.distalFlexExtScore} color={colors.distal} />
              <DomainDot label="Rotación" score={lastSession.derived.pronoSupScore} color={colors.pronosup} />
            </div>

            {/* Clinical flags detail */}
            <div className="flex flex-wrap gap-1.5">
              <FlagChip active={lastSession.derived.tremorFlag} label="Temblor" tooltip="Oscilación en banda patológica (3-6 Hz)" variant="tremor" />
              <FlagChip active={lastSession.derived.spasticityFlag} label="Fragmentación" tooltip="Movimiento interrumpido — posible espasticidad o co-contracción" variant="spasticity" />
              <FlagChip active={lastSession.derived.fatigueFlag} label="Fatiga" tooltip="Caída >20% de velocidad pico entre primeras y últimas repeticiones" variant="fatigue" />
              <FlagChip active={lastSession.derived.impulseControlFlag} label="Precisión" tooltip="Errores frecuentes en tarea de vertido" variant="impulse" />
            </div>

            <ClinicalEvidenceList session={lastSession} />

            <ScaleMetricPreview metrics={lastSession.derived.scaleMetrics} />

            {/* Trend + adherence */}
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[9px] text-txt-muted font-semibold uppercase tracking-wider mb-1">Tendencia 10 sesiones</div>
                <Sparkline data={patientSessions.slice(-10).map(s => s.derived.globalMotorScore)} width={90} height={28} color={getTrendColor(patientSessions.slice(-10).map(s => s.derived.globalMotorScore))} />
              </div>
              <div>
                <div className="text-[9px] text-txt-muted font-semibold uppercase tracking-wider mb-1 text-right">Adherencia 7d</div>
                {p.prescribedExercises.length > 0 ? (
                  <AdherenceHeatmap logs={p.prescribedExercises.flatMap(e => e.adherenceLog)} />
                ) : (
                  <span className="text-[10px] text-txt-muted italic block text-right mt-2">Sin pauta</span>
                )}
              </div>
            </div>

            {/* Info row */}
            <div className="text-[11px] text-txt-muted font-medium pt-2 space-y-1">
              <div>{p.age !== null ? `${p.age} a` : 'Edad no consta'} · {p.strokeType ? `${p.strokeType === 'ischemic' ? 'Isquémico' : 'Hemorrágico'} · ` : ''}Prioridad {p.priorityScore.toFixed(1)}</div>
              <div>Puntuación global = media de agarre, coordinación y rotación. Prioridad = alertas, deterioro reciente y adherencia.</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Helpers ── */

function getPatientSessions(sessions: Session[], patientId: string): Session[] {
  return sessions.filter(s => s.patientId === patientId).sort((a, b) => a.date.localeCompare(b.date));
}

function computeDelta7d(sessions: Session[]): number {
  if (sessions.length < 2) return 0;
  const recent = sessions[sessions.length - 1].derived.globalMotorScore;
  const weekAgoIdx = Math.max(0, sessions.length - 8);
  const weekAgo = sessions[weekAgoIdx].derived.globalMotorScore;
  return recent - weekAgo;
}

function computeAverageAdherence(patients: EnrichedPatient[]): number | null {
  const patientsWithExercises = patients.filter(p => p.prescribedExercises.length > 0);
  if (patientsWithExercises.length === 0) return null;
  const logs = patientsWithExercises.flatMap(p => p.prescribedExercises.flatMap(e => e.adherenceLog));
  if (logs.length === 0) return 0;
  const completed = logs.filter(log => log.completed).length;
  return Math.round((completed / logs.length) * 100);
}

function getLastSessionDate(sessions: Session[]): string {
  const last = sessions.reduce<Session | null>((latest, session) => {
    if (!latest || session.date > latest.date) return session;
    return latest;
  }, null);

  return last ? last.date : 'Sin sesiones';
}

function getScoreColor(score: number): string {
  if (score >= 70) return colors.ok;
  if (score >= 40) return colors.warning;
  return colors.alert;
}

function getTrendColor(scores: number[]): string {
  if (scores.length < 2) return colors.distal;
  const last = scores[scores.length - 1];
  const first = scores[0];
  if (last > first + 5) return colors.ok;
  if (last < first - 5) return colors.alert;
  return colors.warning;
}

function MobilityTag({ mobility }: { mobility: string | null }) {
  if (!mobility) return null;
  return (
    <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-clay-surface-elevated border-2 border-clay-border text-txt-muted uppercase tracking-wider font-bold font-display shadow-clay-inset">
      {MOBILITY_LABELS[mobility] ?? mobility}
    </span>
  );
}

function DomainDot({ label, score, color }: { label: string; score: number; color: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-3 h-3 rounded-full border-2 shadow-clay-inset" style={{ borderColor: color, backgroundColor: `${color}20` }} />
      <div>
        <div className="text-[9px] text-txt-muted font-semibold leading-none">{label}</div>
        <div className="text-[12px] font-bold tabular-nums font-display" style={{ color }}>{Math.round(score)}</div>
      </div>
    </div>
  );
}

function ViewToggle({ active, onClick, label, icon }: { active: boolean; onClick: () => void; label: string; icon: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold font-display transition-all ${
        active ? 'bg-clay-surface-solid text-accent shadow-clay border-2 border-accent/20' : 'text-txt-muted hover:text-txt border-2 border-transparent'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function ImpactStrip({ patientsCount, alertCount, deterioratingCount, avgAdherence, lastSync }: {
  patientsCount: number;
  alertCount: number;
  deterioratingCount: number;
  avgAdherence: number | null;
  lastSync: string;
}) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
      <ImpactMetric label="Pacientes monitorizados" value={patientsCount.toString()} />
      <ImpactMetric label="Alertas activas" value={alertCount.toString()} tone={alertCount > 0 ? 'alert' : 'default'} />
      <ImpactMetric label="Deterioro 7 días" value={deterioratingCount.toString()} tone={deterioratingCount > 0 ? 'warning' : 'default'} />
      <ImpactMetric label="Adherencia media" value={avgAdherence !== null ? `${avgAdherence}%` : 'N/A'} tone={avgAdherence !== null && avgAdherence < 70 ? 'warning' : 'ok'} />
      <ImpactMetric label="Última sincronización" value={lastSync} />
    </div>
  );
}

function ImpactMetric({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'alert' | 'warning' | 'ok' }) {
  const toneClass = {
    default: 'text-txt',
    alert: 'text-alert',
    warning: 'text-warning',
    ok: 'text-ok',
  }[tone];

  return (
    <div className="bg-clay-surface-solid rounded-2xl border-2 border-clay-border px-4 py-3 shadow-clay">
      <div className="text-[10px] text-txt-muted uppercase tracking-wider font-bold font-display mb-1">{label}</div>
      <div className={`text-[20px] font-display font-extrabold tabular-nums ${toneClass}`}>{value}</div>
    </div>
  );
}

function ClinicalEvidenceList({ session }: { session: Session }) {
  const evidence = getClinicalEvidence(session).filter(item => item.active);

  if (evidence.length === 0) {
    return (
      <div className="text-[10px] text-txt-muted bg-clay-surface-elevated rounded-lg border border-clay-border px-2.5 py-2">
        No hay señales clínicas fuera de umbral en la última sesión.
      </div>
    );
  }

  return (
    <div className="space-y-1.5 bg-clay-surface-elevated rounded-lg border border-clay-border px-2.5 py-2">
      <div className="text-[9px] text-txt-muted font-semibold uppercase tracking-wider">Evidencia de alerta</div>
      {evidence.map(item => (
        <div key={item.label} className="text-[10px] text-txt-secondary">
          <span className="font-semibold text-txt">{item.label}:</span> {item.evidence}
        </div>
      ))}
    </div>
  );
}

function ScaleMetricPreview({ metrics }: { metrics: ScaleMetricResult[] }) {
  const previewMetrics = metrics.filter(metric => metric.priority === 'CORE').slice(0, 4);

  return (
    <div className="bg-clay-surface-elevated rounded-lg border border-clay-border px-2.5 py-2">
      <div className="text-[9px] text-txt-muted font-semibold uppercase tracking-wider mb-1.5">Métricas de escalas</div>
      <div className="grid grid-cols-2 gap-1.5">
        {previewMetrics.map(metric => (
          <div key={metric.id} className="min-w-0">
            <div className="text-[9px] text-txt-muted truncate">{metric.technicalId} · {metric.label}</div>
            <div className="text-[12px] font-bold tabular-nums text-txt">
              {metric.value.toFixed(1)}
              {metric.unit && <span className="text-[9px] text-txt-muted ml-0.5">{metric.unit}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function getClinicalEvidence(session: Session): { label: string; active: boolean; evidence: string }[] {
  const slingshot = session.games.find(g => g.game === 'slingshot')?.metrics as SlingshotMetrics | undefined;
  const flappy = session.games.find(g => g.game === 'flappy')?.metrics as FlappyMetrics | undefined;
  const water = session.games.find(g => g.game === 'water')?.metrics as WaterMetrics | undefined;

  return [
    {
      label: FLAG_LABELS.tremorFlag,
      active: session.derived.tremorFlag,
      evidence: `oscilación de agarre ${formatMetric(slingshot?.pullTremor)} y suavidad de rotación ${formatMetric(water?.smoothnessJerk)}; umbral >${TREMOR_PATHOLOGICAL} / >${SPASTICITY_JERK}.`,
    },
    {
      label: FLAG_LABELS.spasticityFlag,
      active: session.derived.spasticityFlag,
      evidence: `jerk de flexo-extensión ${formatMetric(flappy?.smoothnessJerk)}; umbral >${SPASTICITY_JERK}.`,
    },
    {
      label: FLAG_LABELS.fatigueFlag,
      active: session.derived.fatigueFlag,
      evidence: `índice de fatiga ${formatMetric(flappy?.fatigueIndex)}; alerta si cae por debajo de ${FATIGUE_PCT}%.`,
    },
    {
      label: FLAG_LABELS.impulseControlFlag,
      active: session.derived.impulseControlFlag,
      evidence: `error de vertido ${formatMetric(water?.poisonError)}%; umbral >25%.`,
    },
  ];
}

function formatMetric(value: number | undefined): string {
  return typeof value === 'number' ? value.toFixed(1) : 's/d';
}

function GridIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
    </svg>
  );
}

function TableIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}
