import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceArea, ScatterChart, Scatter, ZAxis } from 'recharts';
import type { Patient, Session, PrescribedExercise } from '../../data/types';
import { getPatient, getSessions } from '../../data/api';
import { Card } from '../../components/Card';
import { CorrelationDisclaimer } from '../../components/Disclaimer';
import { DOMAIN_LABELS, INTENSITY_LABELS } from '../../domain/labels';

export function RehabCorrelation() {
  const { id } = useParams<{ id: string }>();
  // undefined = cargando, null = no encontrado
  const [patient, setPatient] = useState<Patient | null | undefined>(undefined);
  const [sessions, setSessions] = useState<Session[] | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    getPatient(id).then(p => setPatient(p ?? null)).catch(e => { setError(e.message); setPatient(null); });
    getSessions(id).then(s => setSessions(s.sort((a, b) => a.date.localeCompare(b.date)))).catch(e => setError(e.message));
  }, [id]);

  if (error) return <div className="p-8 text-alert">Error cargando datos: {error}</div>;
  if (patient === undefined || sessions === undefined) return <div className="text-clay-text-muted p-8">Cargando...</div>;
  if (patient === null) return <div className="p-8 text-txt-secondary">Paciente no encontrado. <Link to="/" className="text-accent">Volver al triaje</Link></div>;
  if (sessions.length === 0) return <div className="p-8 text-txt-secondary">Sin sesiones todavía. <Link to={`/patient/${id}`} className="text-accent">Volver al paciente</Link></div>;

  const domainScoreKey: Record<string, keyof Session['derived']> = {
    'proximal-grip': 'proximalGripScore',
    'distal-flex-ext': 'distalFlexExtScore',
    'prono-supination': 'pronoSupScore',
  };

  const domainColors: Record<string, string> = {
    'proximal-grip': '#AE643C',
    'distal-flex-ext': '#358189',
    'prono-supination': '#646298',
  };

  return (
    <div>
      <div className="mb-4">
        <Link to={`/patient/${id}`} className="text-sm text-clay-distal hover:underline">← Volver al paciente</Link>
      </div>

      <h1 className="text-2xl font-bold text-clay-text mb-2">Correlación rehabilitación vs juegos</h1>
      <p className="text-sm text-clay-text-secondary mb-4">{patient.pseudonym}</p>
      <CorrelationDisclaimer className="mb-6" />

      {patient.prescribedExercises.length === 0 && (
        <Card className="mb-6 flex flex-col items-center justify-center py-12 text-center !bg-clay-surface-elevated border-dashed border-2 border-clay-border/50">
          <div className="w-12 h-12 mb-3 opacity-50">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-clay-text-muted">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
          </div>
          <h3 className="text-base font-bold text-clay-text">Sin pautas de rehabilitación</h3>
          <p className="text-sm text-clay-text-secondary max-w-sm mt-1">
            Este paciente todavía no tiene ejercicios clínicos prescritos. 
            La gráfica de correlación se generará cuando el rehabilitador asigne una pauta.
          </p>
        </Card>
      )}

      {patient.prescribedExercises.map(exercise => (
        <ExerciseCorrelation
          key={exercise.id}
          exercise={exercise}
          sessions={sessions}
          scoreKey={domainScoreKey[exercise.targetDomain]}
          color={domainColors[exercise.targetDomain]}
          events={patient.eventMarkers}
        />
      ))}

      {/* Before/After comparison for events */}
      <Card className="mt-6">
        <h2 className="text-lg font-bold text-clay-text mb-4">Comparación antes/después de cambios de rutina</h2>
        
        {(() => {
          const filteredEvents = patient.eventMarkers.filter(e => e.type === 'exercise-change' || e.type === 'botox' || e.type === 'medication');
          
          if (filteredEvents.length === 0) {
            return (
              <div className="py-6 text-center">
                <p className="text-sm text-clay-text-muted italic">No hay eventos médicos ni cambios de rutina registrados para evaluar el impacto.</p>
              </div>
            );
          }

          return filteredEvents.map(event => {
            const eventDate = new Date(event.date);
            const before = sessions.filter(s => new Date(s.date) < eventDate).slice(-5);
            const after = sessions.filter(s => new Date(s.date) >= eventDate).slice(0, 5);

            const avgBefore = before.length > 0 ? before.reduce((s, ses) => s + ses.derived.globalMotorScore, 0) / before.length : 0;
            const avgAfter = after.length > 0 ? after.reduce((s, ses) => s + ses.derived.globalMotorScore, 0) / after.length : 0;
            const delta = avgAfter - avgBefore;

            return (
              <div key={event.id} className="flex items-center gap-4 py-3 border-b border-clay-border/50 last:border-0">
                <div className="w-2 h-2 rounded-full bg-warning" />
                <div className="flex-1">
                  <div className="text-sm font-medium text-clay-text">{event.label}</div>
                  <div className="text-xs text-clay-text-muted">{event.date}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-clay-text-muted">Antes → Después</div>
                  <div className="flex items-center gap-2 tabular-nums text-sm">
                    <span>{avgBefore.toFixed(1)}</span>
                    <span>→</span>
                    <span className={delta >= 0 ? 'text-ok font-semibold' : 'text-alert font-semibold'}>
                      {avgAfter.toFixed(1)} ({delta >= 0 ? '+' : ''}{delta.toFixed(1)})
                    </span>
                  </div>
                </div>
              </div>
            );
          });
        })()}
      </Card>
    </div>
  );
}

function ExerciseCorrelation({
  exercise, sessions, scoreKey, color, events,
}: {
  exercise: PrescribedExercise;
  sessions: Session[];
  scoreKey: keyof Session['derived'];
  color: string;
  events: Patient['eventMarkers'];
}) {
  const chartData = sessions.map(s => ({
    date: s.date.slice(5),
    fullDate: s.date,
    score: s.derived[scoreKey] as number,
  }));

  const startDate = exercise.startDate.slice(5);
  const endDate = exercise.endDate?.slice(5);

  // Dose-response scatter: weekly adherence vs weekly score delta
  const scatterData = computeDoseResponse(exercise, sessions, scoreKey);

  return (
    <Card className="mb-4">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
        <div>
          <h3 className="text-sm font-bold text-clay-text">{exercise.name}</h3>
          <p className="text-xs text-clay-text-muted">
            {DOMAIN_LABELS[exercise.targetDomain]} · {INTENSITY_LABELS[exercise.intensity]} · {exercise.frequencyPerWeek}x/sem · desde {exercise.startDate}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Overlay chart */}
        <div>
          <div className="text-xs text-clay-text-muted mb-2">Puntuación del dominio + periodo de ejercicio activo</div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2DFDA" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#75716B' }} />
                <YAxis tick={{ fontSize: 10, fill: '#75716B' }} domain={[0, 100]} />
                <Tooltip />
                <ReferenceArea
                  x1={startDate}
                  x2={endDate ?? chartData[chartData.length - 1]?.date}
                  fill={color}
                  fillOpacity={0.08}
                  stroke={color}
                  strokeDasharray="3 3"
                  strokeOpacity={0.3}
                />
                {events.filter(e => e.type === 'exercise-change').map(ev => (
                  <ReferenceArea key={ev.id} x1={ev.date.slice(5)} x2={ev.date.slice(5)} stroke="#B27923" strokeDasharray="4 2" />
                ))}
                <Line type="monotone" dataKey="score" stroke={color} strokeWidth={2} dot={{ r: 1.5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Dose-response scatter */}
        <div>
          <div className="text-xs text-clay-text-muted mb-2">Dosis-respuesta: adherencia semanal vs Δ puntuación</div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2DFDA" />
                <XAxis dataKey="adherence" name="Adherencia %" tick={{ fontSize: 10, fill: '#75716B' }} domain={[0, 100]} />
                <YAxis dataKey="delta" name="Δ Puntuación" tick={{ fontSize: 10, fill: '#75716B' }} />
                <ZAxis range={[30, 30]} />
                <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                <Scatter data={scatterData} fill={color} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </Card>
  );
}

function computeDoseResponse(
  exercise: PrescribedExercise,
  sessions: Session[],
  scoreKey: keyof Session['derived'],
): { adherence: number; delta: number }[] {
  const points: { adherence: number; delta: number }[] = [];
  const startDate = new Date(exercise.startDate);

  for (let week = 0; week < 12; week++) {
    const weekStart = new Date(startDate);
    weekStart.setDate(weekStart.getDate() + week * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const weekLogs = exercise.adherenceLog.filter(l => {
      const d = new Date(l.date);
      return d >= weekStart && d < weekEnd;
    });

    if (weekLogs.length === 0) continue;

    const adherence = (weekLogs.filter(l => l.completed).length / weekLogs.length) * 100;

    const weekSessions = sessions.filter(s => {
      const d = new Date(s.date);
      return d >= weekStart && d < weekEnd;
    });

    if (weekSessions.length < 2) continue;

    const first = weekSessions[0].derived[scoreKey] as number;
    const last = weekSessions[weekSessions.length - 1].derived[scoreKey] as number;
    const delta = last - first;

    points.push({ adherence: Math.round(adherence), delta: Math.round(delta * 10) / 10 });
  }

  return points;
}
