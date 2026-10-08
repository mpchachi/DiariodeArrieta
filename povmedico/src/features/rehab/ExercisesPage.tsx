import { useEffect, useState, useMemo, type FormEvent } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceArea, ScatterChart, Scatter, ZAxis,
  BarChart, Bar, Cell,
} from 'recharts';
import { useExerciseStore } from '../../store/exerciseStore';
import { useStore } from '../../store/useStore';
import { Card } from '../../components/Card';
import { colors, chartTheme } from '../../design/tokens';
import type { ExerciseCatalogItem } from '../../data/reportTypes';
import type { Session, PrescribedExercise } from '../../data/types';
import { today } from '../../domain/clock';
import { DOMAIN_LABELS, INTENSITY_LABELS, type Domain, type Intensity } from '../../domain/labels';

// ─── Constants ───────────────────────────────────────────────────────────────

type TabId = 'catalogo' | 'prescripciones' | 'correlacion' | 'adherencia';

const DOMAIN_COLORS: Record<Domain, string> = {
  'proximal-grip': colors.proximal,
  'distal-flex-ext': colors.distal,
  'prono-supination': colors.pronosup,
};

const MONITORING_GAME_LABELS: Record<Domain, string> = {
  'proximal-grip': 'Juego de agarre y precisión',
  'distal-flex-ext': 'Juego de flexo-extensión',
  'prono-supination': 'Juego de vertido y rotación',
};

const DOMAIN_EXPLANATIONS: Record<Domain, string> = {
  'proximal-grip': 'los ejercicios de pinza y agarre deberían reflejarse en la apertura, la fuerza y la estabilidad del agarre durante el juego.',
  'distal-flex-ext': 'los ejercicios de cierre-apertura deberían reflejarse en activaciones más completas, menos fatiga y un movimiento más suave.',
  'prono-supination': 'los ejercicios de rotación deberían reflejarse en más rango, mejor precisión de vertido y menos error de control.',
};

const DOMAIN_SCORE_KEY: Record<Domain, keyof Session['derived']> = {
  'proximal-grip': 'proximalGripScore',
  'distal-flex-ext': 'distalFlexExtScore',
  'prono-supination': 'pronoSupScore',
};

const TABS: { id: TabId; label: string }[] = [
  { id: 'catalogo', label: 'Catálogo' },
  { id: 'prescripciones', label: 'Prescripciones' },
  { id: 'correlacion', label: 'Correlación' },
  { id: 'adherencia', label: 'Adherencia' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function computeAdherence14d(exercise: PrescribedExercise): number {
  const now = today();
  const twoWeeksAgo = new Date(now);
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

  const recent = exercise.adherenceLog.filter(l => {
    const d = new Date(l.date);
    return d >= twoWeeksAgo && d <= now;
  });

  if (recent.length === 0) return 0;
  return Math.round((recent.filter(l => l.completed).length / recent.length) * 100);
}

function computeExerciseAdherence(exercise: PrescribedExercise): number {
  if (exercise.adherenceLog.length === 0) return 0;
  const completed = exercise.adherenceLog.filter(l => l.completed).length;
  return Math.round((completed / exercise.adherenceLog.length) * 100);
}

function computeDomainDelta(sessions: Session[], domain: Domain): number {
  if (sessions.length < 2) return 0;
  const scoreKey = DOMAIN_SCORE_KEY[domain];
  const first = sessions[0].derived[scoreKey] as number;
  const last = sessions[sessions.length - 1].derived[scoreKey] as number;
  return Math.round((last - first) * 10) / 10;
}

function computePatientAdherence(patientExercises: PrescribedExercise[]): number {
  if (patientExercises.length === 0) return 0;
  const total = patientExercises.reduce((sum, exercise) => sum + computeExerciseAdherence(exercise), 0);
  return Math.round(total / patientExercises.length);
}

function computeBestDomainDelta(patientSessions: Session[], patientExercises: PrescribedExercise[]): number {
  if (patientSessions.length < 2 || patientExercises.length === 0) return 0;
  const domains = Array.from(new Set(patientExercises.map(exercise => exercise.targetDomain)));
  const deltas = domains.map(domain => computeDomainDelta(patientSessions, domain));
  return Math.max(...deltas);
}

function generateId(): string {
  return 'cat-' + Math.random().toString(36).slice(2, 8);
}

// ─── DomainChip ──────────────────────────────────────────────────────────────

function DomainChip({ domain }: { domain: Domain }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold text-white"
      style={{ backgroundColor: DOMAIN_COLORS[domain] }}
    >
      {DOMAIN_LABELS[domain]}
    </span>
  );
}

// ─── Tab Bar ─────────────────────────────────────────────────────────────────

function TabBar({ active, onChange }: { active: TabId; onChange: (t: TabId) => void }) {
  return (
    <div className="flex gap-1 mb-6">
      {TABS.map(tab => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={
            tab.id === active
              ? 'px-4 py-2 rounded-xl bg-clay-surface-solid shadow-clay border-2 border-accent/20 text-txt font-semibold text-sm transition-all'
              : 'px-4 py-2 rounded-xl text-txt-muted hover:text-txt text-sm font-medium transition-all'
          }
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

// ─── Catálogo Tab ────────────────────────────────────────────────────────────

function CatalogoTab() {
  const { catalog, addItem, updateItem, removeItem } = useExerciseStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-txt">Catálogo de pautas de rehabilitación</h2>
          <p className="text-sm text-txt-secondary mt-1">
            Ejercicios clínicos que el rehabilitador puede prescribir. No son el juego: son la intervención que después se contrasta con la telemonitorización.
          </p>
        </div>
        <button
          onClick={() => setShowAdd(prev => !prev)}
          className="px-3 py-1.5 rounded-lg bg-accent text-white text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          {showAdd ? 'Cancelar' : '+ Añadir'}
        </button>
      </div>

      {showAdd && (
        <Card className="mb-4">
          <CatalogForm
            onSubmit={(item) => {
              addItem(item);
              setShowAdd(false);
            }}
            onCancel={() => setShowAdd(false)}
          />
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {catalog.map(item => (
          <Card key={item.id} className="relative">
            {editingId === item.id ? (
              <CatalogForm
                initial={item}
                onSubmit={(updated) => {
                  updateItem(item.id, updated);
                  setEditingId(null);
                }}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="text-sm font-bold text-txt">{item.name}</h3>
                  <DomainChip domain={item.domain} />
                </div>
                <p className="text-xs text-txt-secondary mb-3">{item.description}</p>
                <div className="flex items-center gap-3 text-xs text-txt-muted">
                  <span>Intensidad: {INTENSITY_LABELS[item.suggestedIntensity]}</span>
                  <span>Reps: {item.reps}</span>
                </div>
                <div className="flex gap-2 mt-3 pt-3 border-t border-clay-border/50">
                  <button
                    onClick={() => setEditingId(item.id)}
                    className="text-xs text-accent font-medium hover:underline"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => removeItem(item.id)}
                    className="text-xs text-alert font-medium hover:underline"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

function CatalogForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial?: ExerciseCatalogItem;
  onSubmit: (item: ExerciseCatalogItem) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [domain, setDomain] = useState<Domain>(initial?.domain ?? 'proximal-grip');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [intensity, setIntensity] = useState<Intensity>(initial?.suggestedIntensity ?? 'medium');
  const [reps, setReps] = useState(initial?.reps ?? '');

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim() || !reps.trim()) return;
    onSubmit({
      id: initial?.id ?? generateId(),
      name: name.trim(),
      domain,
      description: description.trim(),
      suggestedIntensity: intensity,
      reps: reps.trim(),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-txt-muted mb-1">Nombre</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            required
            className="w-full px-3 py-1.5 rounded-lg border border-clay-border bg-clay-surface-solid text-sm text-txt focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
        </div>
        <div>
          <label className="block text-xs text-txt-muted mb-1">Dominio</label>
          <select
            value={domain}
            onChange={e => setDomain(e.target.value as Domain)}
            className="w-full px-3 py-1.5 rounded-lg border border-clay-border bg-clay-surface-solid text-sm text-txt focus:outline-none focus:ring-2 focus:ring-accent/30"
          >
            <option value="proximal-grip">Agarre</option>
            <option value="distal-flex-ext">Coordinación</option>
            <option value="prono-supination">Rotación</option>
          </select>
        </div>
      </div>
      <div>
        <label className="block text-xs text-txt-muted mb-1">Descripción</label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={2}
          className="w-full px-3 py-1.5 rounded-lg border border-clay-border bg-clay-surface-solid text-sm text-txt focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-txt-muted mb-1">Intensidad</label>
          <select
            value={intensity}
            onChange={e => setIntensity(e.target.value as Intensity)}
            className="w-full px-3 py-1.5 rounded-lg border border-clay-border bg-clay-surface-solid text-sm text-txt focus:outline-none focus:ring-2 focus:ring-accent/30"
          >
            <option value="low">Baja</option>
            <option value="medium">Media</option>
            <option value="high">Alta</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-txt-muted mb-1">Repeticiones</label>
          <input
            type="text"
            value={reps}
            onChange={e => setReps(e.target.value)}
            required
            className="w-full px-3 py-1.5 rounded-lg border border-clay-border bg-clay-surface-solid text-sm text-txt focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
        </div>
      </div>
      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          className="px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-semibold hover:opacity-90 transition-opacity"
        >
          {initial ? 'Guardar' : 'Crear'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 rounded-lg border border-clay-border text-xs text-txt-muted hover:text-txt transition-colors"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

// ─── Prescripciones Tab ──────────────────────────────────────────────────────

interface PrescriptionRow {
  patientPseudonym: string;
  patientId: string;
  exercise: PrescribedExercise;
  adherence14d: number;
}

function PrescripcionesTab() {
  const { patients, sessions } = useStore();
  const [domainFilter, setDomainFilter] = useState<Domain | ''>('');
  const [intensityFilter, setIntensityFilter] = useState<Intensity | ''>('');
  const [lowAdherenceOnly, setLowAdherenceOnly] = useState(false);

  const rows = useMemo<PrescriptionRow[]>(() => {
    const result: PrescriptionRow[] = [];

    for (const patient of patients) {
      for (const ex of patient.prescribedExercises) {
        result.push({
          patientPseudonym: patient.pseudonym,
          patientId: patient.id,
          exercise: ex,
          adherence14d: computeAdherence14d(ex),
        });
      }
    }

    return result;
  }, [patients, sessions]);

  const filteredRows = useMemo(() => {
    let r = rows;
    if (domainFilter) r = r.filter(row => row.exercise.targetDomain === domainFilter);
    if (intensityFilter) r = r.filter(row => row.exercise.intensity === intensityFilter);
    if (lowAdherenceOnly) r = r.filter(row => row.adherence14d < 50);
    return r;
  }, [rows, domainFilter, intensityFilter, lowAdherenceOnly]);

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-bold text-txt">Pautas activas por paciente</h2>
        <p className="text-sm text-txt-secondary mt-1">
          Qué ejercicios de rehabilitación tiene asignados cada paciente, con dominio motor, intensidad y adherencia reciente.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <select
          value={domainFilter}
          onChange={e => setDomainFilter(e.target.value as Domain | '')}
          className="px-3 py-1.5 rounded-lg border border-clay-border bg-clay-surface-solid text-sm text-txt focus:outline-none focus:ring-2 focus:ring-accent/30"
        >
          <option value="">Todos los dominios</option>
          <option value="proximal-grip">Agarre</option>
          <option value="distal-flex-ext">Coordinación</option>
          <option value="prono-supination">Rotación</option>
        </select>

        <select
          value={intensityFilter}
          onChange={e => setIntensityFilter(e.target.value as Intensity | '')}
          className="px-3 py-1.5 rounded-lg border border-clay-border bg-clay-surface-solid text-sm text-txt focus:outline-none focus:ring-2 focus:ring-accent/30"
        >
          <option value="">Todas las intensidades</option>
          <option value="low">Baja</option>
          <option value="medium">Media</option>
          <option value="high">Alta</option>
        </select>

        <label className="flex items-center gap-2 text-sm text-txt-secondary cursor-pointer">
          <input
            type="checkbox"
            checked={lowAdherenceOnly}
            onChange={e => setLowAdherenceOnly(e.target.checked)}
            className="rounded border-clay-border accent-accent"
          />
          Adherencia baja (&lt;50%)
        </label>
      </div>

      {/* Table */}
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-clay-border/50">
              <th className="text-left py-2 px-3 text-xs font-semibold text-txt-muted">Paciente</th>
              <th className="text-left py-2 px-3 text-xs font-semibold text-txt-muted">Ejercicio</th>
              <th className="text-left py-2 px-3 text-xs font-semibold text-txt-muted">Dominio</th>
              <th className="text-center py-2 px-3 text-xs font-semibold text-txt-muted">Frec./sem</th>
              <th className="text-center py-2 px-3 text-xs font-semibold text-txt-muted">Intensidad</th>
              <th className="text-left py-2 px-3 text-xs font-semibold text-txt-muted">Fechas</th>
              <th className="text-right py-2 px-3 text-xs font-semibold text-txt-muted">Adh. 14d</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map(row => (
              <tr key={`${row.patientId}-${row.exercise.id}`} className="border-b border-clay-border/30 last:border-0 hover:bg-clay-surface-elevated/50">
                <td className="py-2 px-3 text-txt font-medium">{row.patientPseudonym}</td>
                <td className="py-2 px-3 text-txt-secondary">{row.exercise.name}</td>
                <td className="py-2 px-3"><DomainChip domain={row.exercise.targetDomain} /></td>
                <td className="py-2 px-3 text-center text-txt-secondary">{row.exercise.frequencyPerWeek}</td>
                <td className="py-2 px-3 text-center text-txt-secondary">{INTENSITY_LABELS[row.exercise.intensity]}</td>
                <td className="py-2 px-3 text-xs text-txt-muted">
                  {row.exercise.startDate}{row.exercise.endDate ? ` → ${row.exercise.endDate}` : ' → activa'}
                </td>
                <td className="py-2 px-3 text-right">
                  <AdherenceBar value={row.adherence14d} />
                </td>
              </tr>
            ))}
            {filteredRows.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-txt-muted text-sm">
                  {rows.length === 0 ? 'No hay pautas de rehabilitación asignadas a ningún paciente.' : 'No se encontraron prescripciones con estos filtros.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function AdherenceBar({ value }: { value: number }) {
  const color = value >= 70 ? colors.ok : value >= 50 ? colors.warning : colors.alert;
  return (
    <div className="flex items-center gap-2 justify-end">
      <div className="w-16 h-2 rounded-full bg-clay-border/50 overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.min(value, 100)}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-xs font-semibold tabular-nums" style={{ color }}>
        {value}%
      </span>
    </div>
  );
}

// ─── Correlación Tab ─────────────────────────────────────────────────────────

function CorrelacionTab() {
  const { patients, sessions } = useStore();

  const [selectedPatientId, setSelectedPatientId] = useState<string>(patients[0]?.id ?? '');
  const [selectedDomain, setSelectedDomain] = useState<Domain>('proximal-grip');

  useEffect(() => {
    if (!selectedPatientId && patients.length > 0) {
      setSelectedPatientId(patients[0].id);
    }
  }, [patients, selectedPatientId]);

  const selectedPatient = patients.find(p => p.id === selectedPatientId);
  const patientSessions = useMemo(
    () => sessions.filter(s => s.patientId === selectedPatientId).sort((a, b) => a.date.localeCompare(b.date)),
    [sessions, selectedPatientId],
  );

  const scoreKey = DOMAIN_SCORE_KEY[selectedDomain];

  const lineData = useMemo(
    () => patientSessions.map(s => ({
      date: s.date.slice(5),
      score: s.derived[scoreKey] as number,
    })),
    [patientSessions, scoreKey],
  );

  const activeExercises = useMemo(
    () => selectedPatient?.prescribedExercises.filter(e => e.targetDomain === selectedDomain) ?? [],
    [selectedPatient, selectedDomain],
  );

  const domainDelta = useMemo(
    () => computeDomainDelta(patientSessions, selectedDomain),
    [patientSessions, selectedDomain],
  );

  const avgExerciseAdherence = useMemo(() => {
    if (activeExercises.length === 0) return 0;
    const total = activeExercises.reduce((sum, exercise) => sum + computeExerciseAdherence(exercise), 0);
    return Math.round(total / activeExercises.length);
  }, [activeExercises]);

  const scatterData = useMemo(() => {
    const points: { adherence: number; delta: number }[] = [];
    for (const exercise of activeExercises) {
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
        const weekSessions = patientSessions.filter(s => {
          const d = new Date(s.date);
          return d >= weekStart && d < weekEnd;
        });
        if (weekSessions.length < 2) continue;

        const first = weekSessions[0].derived[scoreKey] as number;
        const last = weekSessions[weekSessions.length - 1].derived[scoreKey] as number;
        points.push({ adherence: Math.round(adherence), delta: Math.round((last - first) * 10) / 10 });
      }
    }
    return points;
  }, [activeExercises, patientSessions, scoreKey]);

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-lg font-bold text-txt">Rehabilitación prescrita vs juego de monitorización</h2>
        <p className="text-sm text-txt-secondary mt-1 max-w-[760px]">
          Aquí se separa la pauta prescrita por el especialista en rehabilitación de la medición obtenida por FixedGap cuando el paciente juega en casa. La pregunta clínica es si hacer los ejercicios se refleja después en una mejor habilidad motora dentro del juego.
        </p>
      </div>

      <RehabFlow />

      {/* Selectors */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <select
          value={selectedPatientId}
          onChange={e => setSelectedPatientId(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-clay-border bg-clay-surface-solid text-sm text-txt focus:outline-none focus:ring-2 focus:ring-accent/30"
        >
          {patients.map(p => (
            <option key={p.id} value={p.id}>{p.pseudonym}</option>
          ))}
        </select>
        <select
          value={selectedDomain}
          onChange={e => setSelectedDomain(e.target.value as Domain)}
          className="px-3 py-1.5 rounded-lg border border-clay-border bg-clay-surface-solid text-sm text-txt focus:outline-none focus:ring-2 focus:ring-accent/30"
        >
          <option value="proximal-grip">Agarre</option>
          <option value="distal-flex-ext">Coordinación</option>
          <option value="prono-supination">Rotación</option>
        </select>
      </div>

      {patientSessions.length === 0 ? (
        <Card>
          <p className="text-sm text-txt-muted py-4 text-center">No hay sesiones para este paciente.</p>
        </Card>
      ) : (
        <>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">
          <BridgeMetric
            label="Ejercicios prescritos"
            value={activeExercises.length.toString()}
            detail={activeExercises.length > 0 ? activeExercises.map(e => e.name).join(' · ') : 'Sin pauta activa para este dominio'}
          />
          <BridgeMetric
            label="Adherencia a la pauta"
            value={`${avgExerciseAdherence}%`}
            detail="Registro de ejercicios de rehabilitación hechos fuera del juego."
            tone={avgExerciseAdherence >= 70 ? 'ok' : avgExerciseAdherence >= 50 ? 'warning' : 'alert'}
          />
          <BridgeMetric
            label={`Cambio en ${MONITORING_GAME_LABELS[selectedDomain]}`}
            value={`${domainDelta >= 0 ? '+' : ''}${domainDelta.toFixed(1)}`}
            detail="Variación de la puntuación medida por el juego de telemonitorización."
            tone={domainDelta >= 0 ? 'ok' : 'alert'}
          />
        </div>

        <Card className="mb-4 !bg-clay-surface-elevated">
          <div className="flex items-start gap-3">
            <div
              className="mt-1 h-3 w-3 rounded-full shrink-0"
              style={{ backgroundColor: DOMAIN_COLORS[selectedDomain] }}
            />
            <div>
              <div className="text-sm font-bold text-txt">
                Lectura clínica para {selectedPatient?.pseudonym}: {DOMAIN_LABELS[selectedDomain].toLowerCase()}
              </div>
              <p className="text-xs text-txt-secondary mt-1">
                Pauta de rehabilitación: {DOMAIN_EXPLANATIONS[selectedDomain]} El gráfico no dice que el ejercicio cause la mejora por sí solo; muestra si la evolución medida por el juego acompaña a la pauta y su adherencia.
              </p>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          {/* Line chart with exercise bands */}
          <Card>
            <div className="text-xs text-txt-muted mb-2 font-medium">
              Resultado del juego ({MONITORING_GAME_LABELS[selectedDomain]}) + periodos con ejercicio prescrito
            </div>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={lineData} margin={{ top: 5, right: 10, bottom: 5, left: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: chartTheme.axisText }} />
                  <YAxis tick={{ fontSize: 10, fill: chartTheme.axisText }} domain={[0, 100]} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: chartTheme.tooltipBg,
                      border: `1px solid ${chartTheme.tooltipBorder}`,
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  {activeExercises.map(ex => (
                    <ReferenceArea
                      key={ex.id}
                      x1={ex.startDate.slice(5)}
                      x2={ex.endDate?.slice(5) ?? lineData[lineData.length - 1]?.date}
                      fill={DOMAIN_COLORS[selectedDomain]}
                      fillOpacity={0.08}
                      stroke={DOMAIN_COLORS[selectedDomain]}
                      strokeDasharray="3 3"
                      strokeOpacity={0.3}
                    />
                  ))}
                  <Line
                    type="monotone"
                    dataKey="score"
                    stroke={DOMAIN_COLORS[selectedDomain]}
                    strokeWidth={2}
                    dot={{ r: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Scatter chart */}
          <Card>
            <div className="text-xs text-txt-muted mb-2 font-medium">
              Dosis-respuesta: adherencia semanal al ejercicio vs cambio en el juego
            </div>
            <div className="h-56">
              {scatterData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 5, right: 10, bottom: 5, left: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
                    <XAxis
                      dataKey="adherence"
                      name="Adherencia %"
                      tick={{ fontSize: 10, fill: chartTheme.axisText }}
                      domain={[0, 100]}
                    />
                    <YAxis
                      dataKey="delta"
                      name="Δ Puntuación"
                      tick={{ fontSize: 10, fill: chartTheme.axisText }}
                    />
                    <ZAxis range={[40, 40]} />
                    <Tooltip
                      cursor={{ strokeDasharray: '3 3' }}
                      contentStyle={{
                        backgroundColor: chartTheme.tooltipBg,
                        border: `1px solid ${chartTheme.tooltipBorder}`,
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Scatter data={scatterData} fill={DOMAIN_COLORS[selectedDomain]} />
                  </ScatterChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-sm text-txt-muted">
                  Datos insuficientes para estimar la relación semanal.
                </div>
              )}
            </div>
          </Card>
        </div>
        </>
      )}

      {/* Disclaimer */}
      <Card className="border-warning/20">
        <p className="text-xs text-txt-secondary italic">
          Correlación exploratoria: ayuda a ver si la pauta de rehabilitación va acompañada de cambios en las métricas del juego. No implica causalidad ni diagnóstico automático.
        </p>
      </Card>
    </div>
  );
}

function RehabFlow() {
  const steps = [
    {
      label: '1. Pauta de rehabilitación',
      text: 'El rehabilitador prescribe ejercicios: pinza, apertura, flexo-extensión o rotación.',
    },
    {
      label: '2. Adherencia del paciente',
      text: 'Se registra si el paciente realiza esa pauta en casa y con qué frecuencia.',
    },
    {
      label: '3. Juego FixedGap',
      text: 'El paciente juega; el sistema mide agarre, coordinación y rotación con telemetría motora.',
    },
    {
      label: '4. Evolución observable',
      text: 'El médico ve si la pauta se refleja en mejores puntuaciones, menos fatiga o más control.',
    },
  ];

  return (
    <Card className="mb-5">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {steps.map((step, index) => (
          <div key={step.label} className="relative">
            <div className="text-[10px] text-accent uppercase tracking-wider font-bold font-display mb-1">{step.label}</div>
            <p className="text-xs text-txt-secondary leading-relaxed">{step.text}</p>
            {index < steps.length - 1 && (
              <div className="hidden md:block absolute top-3 -right-2 w-4 h-px bg-clay-border-active" />
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

function BridgeMetric({ label, value, detail, tone = 'default' }: {
  label: string;
  value: string;
  detail: string;
  tone?: 'default' | 'ok' | 'warning' | 'alert';
}) {
  const toneClass = {
    default: 'text-txt',
    ok: 'text-ok',
    warning: 'text-warning',
    alert: 'text-alert',
  }[tone];

  return (
    <Card>
      <div className="text-[10px] text-txt-muted uppercase tracking-wider font-bold font-display mb-1">{label}</div>
      <div className={`text-2xl font-display font-extrabold tabular-nums ${toneClass}`}>{value}</div>
      <p className="text-xs text-txt-secondary mt-1 line-clamp-2">{detail}</p>
    </Card>
  );
}

// ─── Adherencia Tab ──────────────────────────────────────────────────────────

function AdherenciaTab() {
  const { patients } = useStore();
  const [domainFilter] = useState<Domain | ''>('');

  const patientAdherences = useMemo(() => {
    return patients.map(patient => {
      const exercises = patient.prescribedExercises.filter(e => domainFilter ? e.targetDomain === domainFilter : true);
      if (exercises.length === 0) return { patient, avgAdherence: 0, meetsTarget: false };

      const adherences = exercises.map(computeAdherence14d);
      const avg = Math.round(adherences.reduce((a, b) => a + b, 0) / adherences.length);
      return { patient, avgAdherence: avg, meetsTarget: avg >= 70 };
    });
  }, [patients, domainFilter]);

  const meetingTarget = patientAdherences.filter(p => p.meetsTarget).length;
  const totalWithExercises = patientAdherences.filter(p => p.patient.prescribedExercises.length > 0).length;
  const meetingPct = totalWithExercises > 0 ? Math.round((meetingTarget / totalWithExercises) * 100) : 0;

  const domainDistribution = useMemo(() => {
    const domains: Domain[] = ['proximal-grip', 'distal-flex-ext', 'prono-supination'];
    return domains.map(domain => {
      const exercises = patients.flatMap(p =>
        p.prescribedExercises.filter(e => e.targetDomain === domain)
      );
      if (exercises.length === 0) return { domain, label: DOMAIN_LABELS[domain], avg: 0, color: DOMAIN_COLORS[domain] };
      const avg = Math.round(exercises.map(computeAdherence14d).reduce((a, b) => a + b, 0) / exercises.length);
      return { domain, label: DOMAIN_LABELS[domain], avg, color: DOMAIN_COLORS[domain] };
    });
  }, [patients]);

  const lowestAdherence = useMemo(
    () => [...patientAdherences]
      .filter(p => p.patient.prescribedExercises.length > 0)
      .sort((a, b) => a.avgAdherence - b.avgAdherence)
      .slice(0, 5),
    [patientAdherences],
  );

  return (
    <div>
      <h2 className="text-lg font-bold text-txt mb-4">Resumen de adherencia</h2>

      {/* Summary card */}
      <Card className="mb-4">
        <div className="flex items-center gap-6">
          <div className="text-center">
            <div className="text-3xl font-bold text-accent">{meetingPct}%</div>
            <div className="text-xs text-txt-muted mt-1">Pacientes que cumplen objetivo</div>
          </div>
          <div className="h-12 w-px bg-clay-border/50" />
          <div className="text-sm text-txt-secondary">
            <span className="font-semibold text-txt">{meetingTarget}</span> de{' '}
            <span className="font-semibold text-txt">{totalWithExercises}</span> pacientes con prescripciones
            alcanzan al menos un 70% de adherencia en los últimos 14 días.
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* Bar chart by domain */}
        <Card>
          <div className="text-xs text-txt-muted mb-3 font-medium">Adherencia media por dominio</div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={domainDistribution} margin={{ top: 5, right: 10, bottom: 5, left: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: chartTheme.axisText }} />
                <YAxis tick={{ fontSize: 10, fill: chartTheme.axisText }} domain={[0, 100]} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: chartTheme.tooltipBg,
                    border: `1px solid ${chartTheme.tooltipBorder}`,
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(value) => [`${value}%`, 'Adherencia']}
                />
                <Bar dataKey="avg" radius={[6, 6, 0, 0]}>
                  {domainDistribution.map((entry, idx) => (
                    <Cell key={idx} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Lowest adherence patients */}
        <Card>
          <div className="text-xs text-txt-muted mb-3 font-medium">5 pacientes con menor adherencia</div>
          <div className="space-y-2">
            {lowestAdherence.map(({ patient, avgAdherence }) => (
              <div key={patient.id} className="flex items-center justify-between py-2 border-b border-clay-border/30 last:border-0">
                <div>
                  <div className="text-sm font-medium text-txt">{patient.pseudonym}</div>
                  <div className="text-xs text-txt-muted">
                    {patient.prescribedExercises.length} ejercicio{patient.prescribedExercises.length !== 1 ? 's' : ''} prescrito{patient.prescribedExercises.length !== 1 ? 's' : ''}
                  </div>
                </div>
                <AdherenceBar value={avgAdherence} />
              </div>
            ))}
            {lowestAdherence.length === 0 && (
              <p className="text-sm text-txt-muted text-center py-4">Sin datos de adherencia.</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ─── Main Page Component ─────────────────────────────────────────────────────

function ExercisesPage() {
  const [activeTab, setActiveTab] = useState<TabId>('correlacion');
  const { loaded, load, patients, sessions } = useStore();

  useEffect(() => {
    if (!loaded) load();
  }, [loaded, load]);

  const hospitalImpact = useMemo(() => {
    const patientsWithExercises = patients.filter(patient => patient.prescribedExercises.length > 0);
    let reviewCandidates = 0;
    let nonResponders = 0;

    for (const patient of patientsWithExercises) {
      const patientSessions = sessions
        .filter(session => session.patientId === patient.id)
        .sort((a, b) => a.date.localeCompare(b.date));
      const adherence = computePatientAdherence(patient.prescribedExercises);
      const bestDelta = computeBestDomainDelta(patientSessions, patient.prescribedExercises);

      if (adherence < 50 || bestDelta < -3) reviewCandidates += 1;
      if (adherence >= 70 && bestDelta <= 0) nonResponders += 1;
    }

    return {
      monitoredPatients: patientsWithExercises.length,
      reviewCandidates,
      nonResponders,
    };
  }, [patients, sessions]);

  return (
    <div className="p-6">
      <div className="mb-5">
        <h1 className="text-2xl font-display font-bold text-txt">Ejercicios y respuesta motora</h1>
        <p className="text-sm text-txt-secondary mt-1 max-w-[780px]">
          Vista para entender qué ejercicios de rehabilitación hace cada paciente y si esos ejercicios se reflejan en la habilidad motora medida por los juegos de FixedGap.
        </p>
      </div>
      <HospitalImpactStrip
        monitoredPatients={hospitalImpact.monitoredPatients}
        reviewCandidates={hospitalImpact.reviewCandidates}
        nonResponders={hospitalImpact.nonResponders}
      />
      <TabBar active={activeTab} onChange={setActiveTab} />

      {activeTab === 'catalogo' && <CatalogoTab />}
      {activeTab === 'prescripciones' && <PrescripcionesTab />}
      {activeTab === 'correlacion' && <CorrelacionTab />}
      {activeTab === 'adherencia' && <AdherenciaTab />}
    </div>
  );
}

export default ExercisesPage;

function HospitalImpactStrip({ monitoredPatients, reviewCandidates, nonResponders }: {
  monitoredPatients: number;
  reviewCandidates: number;
  nonResponders: number;
}) {
  return (
    <Card className="mb-5 !bg-clay-surface-elevated">
      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr_1fr] gap-4 items-center">
        <div>
          <div className="text-[10px] text-accent uppercase tracking-wider font-bold font-display mb-1">
            Beneficio operativo para el hospital
          </div>
          <p className="text-sm text-txt-secondary">
            Permite priorizar revisiones entre visitas y detectar la falta de respuesta antes de la próxima consulta presencial.
          </p>
        </div>
        <div>
          <div className="text-[10px] text-txt-muted uppercase tracking-wider font-bold font-display mb-1">
            Revisiones priorizables
          </div>
          <div className="text-2xl font-display font-extrabold tabular-nums text-warning">
            {reviewCandidates}
            <span className="text-sm text-txt-muted font-semibold">/{monitoredPatients}</span>
          </div>
          <p className="text-xs text-txt-muted mt-1">Adherencia baja o caída de puntuación.</p>
        </div>
        <div>
          <div className="text-[10px] text-txt-muted uppercase tracking-wider font-bold font-display mb-1">
            Falta de respuesta
          </div>
          <div className="text-2xl font-display font-extrabold tabular-nums text-alert">
            {nonResponders}
          </div>
          <p className="text-xs text-txt-muted mt-1">Adherencia alta sin mejora observable.</p>
        </div>
      </div>
    </Card>
  );
}
