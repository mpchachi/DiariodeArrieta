import { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import type { Patient, Session } from '../../data/types';
import { getPatient, getSessions } from '../../data/api';
import { Card } from '../../components/Card';
import { ScoreBadge } from '../../components/ScoreBadge';
import { Disclaimer } from '../../components/Disclaimer';
import { FLAG_LABELS } from '../../domain/thresholds';
import { DOMAIN_LABELS, INTENSITY_LABELS, MOBILITY_LABELS } from '../../domain/labels';

export function ReportView() {
  const { id } = useParams<{ id: string }>();
  // undefined = cargando, null = no encontrado
  const [patient, setPatient] = useState<Patient | null | undefined>(undefined);
  const [sessions, setSessions] = useState<Session[] | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id) return;
    getPatient(id).then(p => setPatient(p ?? null)).catch(e => { setError(e.message); setPatient(null); });
    getSessions(id).then(s => setSessions(s.sort((a, b) => a.date.localeCompare(b.date)))).catch(e => setError(e.message));
  }, [id]);

  if (error) return <div className="p-8 text-alert">Error cargando datos: {error}</div>;
  if (patient === undefined || sessions === undefined) return <div className="text-clay-text-muted p-8">Cargando...</div>;
  if (patient === null) return <div className="p-8 text-txt-secondary">Paciente no encontrado. <Link to="/" className="text-accent">Volver al triaje</Link></div>;
  if (sessions.length === 0) return <div className="p-8 text-txt-secondary">Sin sesiones todavía. <Link to={`/patient/${id}`} className="text-accent">Volver al paciente</Link></div>;

  const lastSession = sessions[sessions.length - 1];
  const firstSession = sessions[0];

  const handlePrint = () => {
    window.print();
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link to={`/patient/${id}`} className="text-sm text-clay-distal hover:underline">← Volver al paciente</Link>
        <div className="flex gap-3">
          <button
            onClick={handlePrint}
            className="px-4 py-2 rounded-md bg-clay-pronosup text-white text-sm font-medium hover:bg-clay-pronosup/90"
          >
            Exportar PDF (Imprimir)
          </button>
        </div>
      </div>

      <div ref={reportRef} className="space-y-6 print:space-y-4">
        {/* Report Header */}
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-clay-text">Informe de evolución</h1>
              <p className="text-sm text-clay-text-secondary mt-1">
                Paciente: {patient.pseudonym} · Generado: {new Date().toLocaleDateString('es-ES')}
              </p>
            </div>
            <div className="text-right text-xs text-clay-text-muted">
              <div>Datos seudonimizados</div>
              <div>Plataforma FixedGap</div>
            </div>
          </div>
        </Card>

        {/* Patient Summary */}
        <Card>
          <h2 className="text-lg font-bold text-clay-text mb-3">Resumen del paciente</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div><span className="text-clay-text-muted">Edad:</span> {patient.age !== null ? `${patient.age} años` : 'No consta'}</div>
            <div><span className="text-clay-text-muted">Movilidad:</span> {patient.mobility ? MOBILITY_LABELS[patient.mobility] : 'No consta'}</div>
            <div><span className="text-clay-text-muted">Lado afecto:</span> {patient.affectedSide ? (patient.affectedSide === 'left' ? 'Izquierdo' : 'Derecho') : 'No consta'}</div>
            <div><span className="text-clay-text-muted">Tipo de ictus:</span> {patient.strokeType ? (patient.strokeType === 'ischemic' ? 'Isquémico' : 'Hemorrágico') : 'No consta'}</div>
            <div><span className="text-clay-text-muted">Fecha del ictus:</span> {patient.strokeDate ?? 'No consta'}</div>
            <div><span className="text-clay-text-muted">Sesiones:</span> {sessions.length}</div>
            <div><span className="text-clay-text-muted">Periodo:</span> {firstSession.date} — {lastSession.date}</div>
          </div>
        </Card>

        {/* Scores */}
        <Card>
          <h2 className="text-lg font-bold text-clay-text mb-3">Puntuaciones actuales vs basal</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-clay-text-muted border-b border-clay-border">
                <th className="py-2">Dominio</th>
                <th className="py-2">Basal</th>
                <th className="py-2">Actual</th>
                <th className="py-2">Delta</th>
              </tr>
            </thead>
            <tbody>
              {[
                { label: 'Motor global', key: 'globalMotorScore' as const },
                { label: 'Agarre proximal', key: 'proximalGripScore' as const },
                { label: 'Flex-ext distal', key: 'distalFlexExtScore' as const },
                { label: 'Prono-supinación', key: 'pronoSupScore' as const },
              ].map(row => {
                const current = lastSession.derived[row.key];
                const baseline = firstSession.derived[row.key];
                const delta = current - baseline;
                return (
                  <tr key={row.key} className="border-b border-clay-border/50">
                    <td className="py-2 font-medium">{row.label}</td>
                    <td className="py-2 tabular-nums">{baseline.toFixed(1)}</td>
                    <td className="py-2"><ScoreBadge score={current} size="sm" /></td>
                    <td className={`py-2 tabular-nums font-semibold ${delta >= 0 ? 'text-ok' : 'text-alert'}`}>
                      {delta >= 0 ? '+' : ''}{delta.toFixed(1)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>

        {/* Clinical Flags */}
        <Card>
          <h2 className="text-lg font-bold text-clay-text mb-3">Alertas clínicas actuales</h2>
          <div className="grid grid-cols-2 gap-3">
            <FlagRow label={FLAG_LABELS.tremorFlag} active={lastSession.derived.tremorFlag} />
            <FlagRow label={FLAG_LABELS.spasticityFlag} active={lastSession.derived.spasticityFlag} />
            <FlagRow label={FLAG_LABELS.fatigueFlag} active={lastSession.derived.fatigueFlag} />
            <FlagRow label={FLAG_LABELS.impulseControlFlag} active={lastSession.derived.impulseControlFlag} />
          </div>
        </Card>

        {/* Exercises */}
        <Card>
          <h2 className="text-lg font-bold text-clay-text mb-3">Ejercicios prescritos</h2>
          {patient.prescribedExercises.length === 0 && <p className="text-sm text-clay-text-muted">Sin pauta registrada.</p>}
          {patient.prescribedExercises.map(ex => {
            const completed = ex.adherenceLog.filter(l => l.completed).length;
            const total = ex.adherenceLog.length;
            return (
              <div key={ex.id} className="flex items-center justify-between py-2 border-b border-clay-border/50 last:border-0 text-sm">
                <div>
                  <span className="font-medium">{ex.name}</span>
                  <span className="text-clay-text-muted ml-2">({DOMAIN_LABELS[ex.targetDomain]}, {INTENSITY_LABELS[ex.intensity]})</span>
                </div>
                <span className="tabular-nums">{total > 0 ? Math.round((completed / total) * 100) : 0}% de adherencia</span>
              </div>
            );
          })}
        </Card>

        {/* Events */}
        <Card>
          <h2 className="text-lg font-bold text-clay-text mb-3">Eventos relevantes</h2>
          {patient.eventMarkers.length === 0 && <p className="text-sm text-clay-text-muted">Sin eventos registrados.</p>}
          {patient.eventMarkers.map(ev => (
            <div key={ev.id} className="flex items-center gap-3 py-2 border-b border-clay-border/50 last:border-0 text-sm">
              <span className="text-clay-text-muted tabular-nums">{ev.date}</span>
              <span className="px-2 py-0.5 rounded-sm bg-clay-border/50 text-xs capitalize">{ev.type.replace('-', ' ')}</span>
              <span>{ev.label}</span>
            </div>
          ))}
        </Card>

        <Disclaimer />

        <div className="text-center text-xs text-clay-text-muted py-4 print:py-2">
          Este informe se generó automáticamente. No constituye un diagnóstico médico.
          <br />Plataforma FixedGap · {new Date().toLocaleDateString('es-ES')}
        </div>
      </div>

      {/* Scheduled report config (mock) */}
      <Card className="mt-6 print:hidden">
        <h2 className="text-lg font-bold text-clay-text mb-3">Informe programado (simulado)</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-clay-text-muted">Frecuencia</label>
            <select className="w-full mt-1 px-3 py-1.5 rounded-sm border border-clay-border bg-clay-surface-elevated text-sm">
              <option>Semanal</option>
              <option>Quincenal</option>
              <option>Mensual</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-clay-text-muted">Destinatario</label>
            <input
              type="email"
              placeholder="medico@clinica.com"
              className="w-full mt-1 px-3 py-1.5 rounded-sm border border-clay-border bg-clay-surface-elevated text-sm placeholder:text-clay-text-muted"
            />
          </div>
        </div>
        <button className="mt-3 px-4 py-2 rounded-md bg-clay-border/30 text-sm text-clay-text-secondary hover:bg-clay-border/50">
          Guardar configuración (solo local)
        </button>
      </Card>
    </div>
  );
}

function FlagRow({ label, active }: { label: string; active: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`w-3 h-3 rounded-full ${active ? 'bg-alert' : 'bg-ok'}`} />
      <span className="text-sm">{label}</span>
      <span className={`text-xs font-semibold ${active ? 'text-alert' : 'text-clay-text-muted'}`}>
        {active ? 'ACTIVO' : 'Normal'}
      </span>
    </div>
  );
}
