import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart, BarChart, Bar } from 'recharts';
import type { Patient, PatientPrediction } from '../../data/types';
import { getPatient, getSessions, getPrediction } from '../../data/api';
import { Card } from '../../components/Card';
import { Disclaimer } from '../../components/Disclaimer';
import type { Session } from '../../data/types';

export function PredictionsView() {
  const { id } = useParams<{ id: string }>();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [prediction, setPrediction] = useState<PatientPrediction | null>(null);
  const [metric, setMetric] = useState('globalMotorScore');

  useEffect(() => {
    if (!id) return;
    getPatient(id).then(p => setPatient(p ?? null));
    getSessions(id).then(s => setSessions(s.sort((a, b) => a.date.localeCompare(b.date))));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    getPrediction(id, metric).then(setPrediction);
  }, [id, metric]);

  if (!patient || !prediction) return <div className="text-clay-text-muted p-8">Cargando predicciones...</div>;

  const historicalData = sessions.slice(-20).map(s => ({
    date: s.date.slice(5),
    value: s.derived[metric as keyof typeof s.derived] as number,
  }));

  const projectedData = prediction.trajectory.filter((_, i) => i % 7 === 0).map(t => ({
    date: t.date.slice(5),
    predicted: t.predicted,
    ciLow: t.ciLow,
    ciHigh: t.ciHigh,
  }));

  const combinedData = [
    ...historicalData.map(d => ({ ...d, predicted: null as number | null, ciLow: null as number | null, ciHigh: null as number | null })),
    ...projectedData.map(d => ({ ...d, value: null as number | null, date: d.date })),
  ];

  const milestoneData = prediction.milestoneProbability[0]?.byWeek ?? [];

  return (
    <div>
      <div className="mb-4">
        <Link to={`/patient/${id}`} className="text-sm text-clay-distal hover:underline">← Volver al paciente</Link>
      </div>

      <h1 className="text-2xl font-bold text-clay-text mb-2">Predicciones</h1>
      <p className="text-sm text-clay-text-secondary mb-4">{patient.pseudonym}</p>
      <Disclaimer className="mb-6" />

      {/* Metric selector */}
      <div className="flex gap-2 mb-6">
        {['globalMotorScore', 'proximalGripScore', 'distalFlexExtScore', 'pronoSupScore'].map(m => (
          <button
            key={m}
            onClick={() => setMetric(m)}
            className={`px-3 py-1.5 rounded-clay-sm text-xs font-medium ${metric === m ? 'bg-clay-distal text-white' : 'bg-clay-border/30 text-clay-text-secondary hover:bg-clay-border/60'}`}
          >
            {m.replace('Score', '').replace('global', 'Global').replace('proximalGrip', 'Proximal').replace('distalFlexExt', 'Distal').replace('pronoSup', 'Prono-Sup')}
          </button>
        ))}
      </div>

      {/* Trajectory chart */}
      <Card className="mb-6">
        <h2 className="text-lg font-bold text-clay-text mb-4">Trayectoria prevista</h2>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={combinedData} margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2DFDA" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#75716B' }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#75716B' }} />
              <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #E2DFDA' }} />
              <Area type="monotone" dataKey="ciHigh" stroke="none" fill="#75A9AF" fillOpacity={0.1} />
              <Area type="monotone" dataKey="ciLow" stroke="none" fill="#FFFFFF" fillOpacity={1} />
              <Line type="monotone" dataKey="value" stroke="#75A9AF" strokeWidth={2.5} dot={{ r: 2 }} connectNulls={false} />
              <Line type="monotone" dataKey="predicted" stroke="#75A9AF" strokeWidth={2} strokeDasharray="6 3" dot={{ r: 2 }} connectNulls={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center gap-4 mt-3 text-xs text-clay-text-muted">
          <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-clay-distal inline-block" /> Histórico</span>
          <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-clay-distal inline-block border-dashed" style={{ borderTop: '2px dashed #75A9AF', height: 0 }} /> Predicción</span>
          <span className="flex items-center gap-1"><span className="w-4 h-3 bg-clay-distal/10 inline-block rounded" /> Intervalo de confianza</span>
        </div>
      </Card>

      {/* Risk gauges and milestone */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <h3 className="text-sm font-bold text-clay-text mb-3">Riesgo de meseta</h3>
          <GaugeBar value={prediction.plateauRisk * 100} color="#B27923" />
          <div className="text-center text-2xl font-bold tabular-nums mt-2" style={{ color: prediction.plateauRisk > 0.6 ? '#AF3D36' : '#B27923' }}>
            {Math.round(prediction.plateauRisk * 100)}%
          </div>
        </Card>
        <Card>
          <h3 className="text-sm font-bold text-clay-text mb-3">Riesgo de abandono</h3>
          <GaugeBar value={prediction.dropoutRisk * 100} color="#AF3D36" />
          <div className="text-center text-2xl font-bold tabular-nums mt-2" style={{ color: prediction.dropoutRisk > 0.5 ? '#AF3D36' : '#B27923' }}>
            {Math.round(prediction.dropoutRisk * 100)}%
          </div>
        </Card>
        <Card>
          <h3 className="text-sm font-bold text-clay-text mb-3">Probabilidad de hito</h3>
          {prediction.milestoneProbability.length > 0 && (
            <div className="text-xs text-clay-text-secondary mb-2">{prediction.milestoneProbability[0].milestone}</div>
          )}
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={milestoneData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2DFDA" />
                <XAxis dataKey="week" tick={{ fontSize: 9, fill: '#75716B' }} label={{ value: 'Semana', fontSize: 9, fill: '#75716B' }} />
                <YAxis domain={[0, 1]} tick={{ fontSize: 9, fill: '#75716B' }} />
                <Line type="monotone" dataKey="p" stroke="#3F774D" strokeWidth={2} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Explainability */}
      <Card>
        <h2 className="text-lg font-bold text-clay-text mb-4">Explicabilidad — Factores de la predicción</h2>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={prediction.drivers} layout="vertical" margin={{ top: 5, right: 30, bottom: 5, left: 100 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2DFDA" />
              <XAxis type="number" tick={{ fontSize: 10, fill: '#75716B' }} />
              <YAxis dataKey="feature" type="category" tick={{ fontSize: 11, fill: '#5F5A54' }} width={95} />
              <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #E2DFDA' }} />
              <Bar dataKey="weight" fill="#75A9AF" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <Disclaimer className="mt-4" />
      </Card>
    </div>
  );
}

function GaugeBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="w-full h-4 bg-clay-border/30 rounded-clay-sm overflow-hidden">
      <div
        className="h-full rounded-clay-sm transition-all duration-500"
        style={{ width: `${Math.min(100, value)}%`, backgroundColor: color }}
      />
    </div>
  );
}
