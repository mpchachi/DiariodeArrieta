import { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea } from 'recharts';
import type { Patient, Session } from '../../data/types';
import { Card } from '../../components/Card';

type Domain = 'proximal' | 'distal' | 'pronosup';

interface MetricConfig {
  key: string;
  label: string;
  color: string;
  threshold?: { value: number; direction: 'above' | 'below' };
}

const metricsByDomain: Record<Domain, MetricConfig[]> = {
  proximal: [
    { key: 'accuracyRatio', label: 'Precisión de pinza M1', color: '#AE643C' },
    { key: 'maxPinchOpen', label: 'Apertura pulgar-índice', color: '#AF3D36' },
    { key: 'maxPullDistance', label: 'Velocidad de alcance', color: '#932B27' },
    { key: 'pullTremor', label: 'Índice de temblor', color: '#AF3D36', threshold: { value: 3.5, direction: 'above' } },
  ],
  distal: [
    { key: 'maxExtension', label: 'Extensión del índice', color: '#358189' },
    { key: 'maxFlexion', label: 'Flexión máxima', color: '#358189' },
    { key: 'activationCount', label: 'Activaciones de apertura', color: '#2C6C73' },
    { key: 'fatigueIndex', label: 'Fatiga motora', color: '#AF3D36', threshold: { value: -20, direction: 'below' } },
    { key: 'smoothnessJerk', label: 'Fragmentación (jerk)', color: '#B27923', threshold: { value: 4, direction: 'above' } },
  ],
  pronosup: [
    { key: 'maxSupination', label: 'Supinación (est.)', color: '#646298' },
    { key: 'maxPronation', label: 'Pronación (est.)', color: '#55538A' },
    { key: 'waterAccuracy', label: 'Precisión de vertido', color: '#55538A' },
    { key: 'poisonError', label: 'Errores de vertido', color: '#AF3D36' },
    { key: 'smoothnessJerk', label: 'Fragmentación rotación', color: '#B27923', threshold: { value: 4, direction: 'above' } },
    { key: 'averagePouringTime', label: 'Tiempo medio de vertido', color: '#75716B' },
  ],
};

const domainLabels: Record<Domain, { title: string; game: string; color: string }> = {
  proximal: { title: 'Mano distal', game: 'La carrera (pinza)', color: '#AE643C' },
  distal: { title: 'Extensión / coordinación', game: 'El globo (puño)', color: '#358189' },
  pronosup: { title: 'Pronosupinación', game: 'El huerto (giro)', color: '#646298' },
};

interface Props {
  sessions: Session[];
  patient: Patient;
}

export function TimeSeriesPanel({ sessions, patient }: Props) {
  const [activeDomain, setActiveDomain] = useState<Domain>('proximal');
  const [selectedMetric, setSelectedMetric] = useState<string>(metricsByDomain.proximal[0].key);

  const domainInfo = domainLabels[activeDomain];
  const metrics = metricsByDomain[activeDomain];
  const currentMetricConfig = metrics.find(m => m.key === selectedMetric) ?? metrics[0];

  const gameMap: Record<Domain, string> = { proximal: 'slingshot', distal: 'flappy', pronosup: 'water' };
  const gameId = gameMap[activeDomain];

  const chartData = sessions.map(s => {
    const gameResult = s.games.find(g => g.game === gameId);
    const metricsObj = gameResult?.metrics as Record<string, number> | undefined;
    return {
      date: s.date.slice(5),
      value: metricsObj?.[selectedMetric] ?? null,
    };
  }).filter(d => d.value !== null);

  const baselineSession = sessions[0];
  const baselineGameResult = baselineSession?.games.find(g => g.game === gameId);
  const baselineMetrics = baselineGameResult?.metrics as Record<string, number> | undefined;
  const baselineValue = baselineMetrics?.[selectedMetric];

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold" style={{ color: domainInfo.color }}>{domainInfo.title}</h2>
          <p className="text-xs text-clay-text-muted">Métricas Excel · Juego: {domainInfo.game}</p>
        </div>
        <div className="flex gap-1">
          {(Object.keys(domainLabels) as Domain[]).map(d => (
            <button
              key={d}
              onClick={() => { setActiveDomain(d); setSelectedMetric(metricsByDomain[d][0].key); }}
              className={`px-3 py-1 rounded-clay-sm text-xs font-medium transition-colors ${activeDomain === d ? 'text-white' : 'text-clay-text-secondary hover:bg-clay-border/30'}`}
              style={activeDomain === d ? { backgroundColor: domainLabels[d].color } : undefined}
            >
              {domainLabels[d].title.split(' ')[0]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {metrics.map(m => (
          <button
            key={m.key}
            onClick={() => setSelectedMetric(m.key)}
            className={`px-2 py-1 rounded-clay-sm text-xs transition-colors ${selectedMetric === m.key ? 'bg-clay-text text-white' : 'bg-clay-border/30 text-clay-text-secondary hover:bg-clay-border/60'}`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E2DFDA" />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#75716B' }} />
            <YAxis tick={{ fontSize: 11, fill: '#75716B' }} />
            <Tooltip
              contentStyle={{ borderRadius: '12px', border: '1px solid #E2DFDA', boxShadow: '0 4px 16px rgba(44,36,32,0.06)' }}
              labelStyle={{ color: '#1E1A15', fontWeight: 600 }}
            />
            {baselineValue !== undefined && (
              <ReferenceLine y={baselineValue} stroke="#75716B" strokeDasharray="5 5" label={{ value: 'Basal', fill: '#75716B', fontSize: 10 }} />
            )}
            {currentMetricConfig.threshold && (
              <ReferenceArea
                y1={currentMetricConfig.threshold.direction === 'above' ? currentMetricConfig.threshold.value : undefined}
                y2={currentMetricConfig.threshold.direction === 'below' ? currentMetricConfig.threshold.value : undefined}
                fill="#AF3D36"
                fillOpacity={0.05}
                stroke="#AF3D36"
                strokeDasharray="3 3"
                strokeOpacity={0.3}
              />
            )}
            {/* Event markers as reference lines */}
            {patient.eventMarkers.map(ev => {
              const shortDate = ev.date.slice(5);
              if (chartData.some(d => d.date === shortDate)) {
                return (
                  <ReferenceLine
                    key={ev.id}
                    x={shortDate}
                    stroke="#B27923"
                    strokeDasharray="4 2"
                    label={{ value: ev.label.slice(0, 12), fill: '#B27923', fontSize: 9, position: 'top' }}
                  />
                );
              }
              return null;
            })}
            <Line
              type="monotone"
              dataKey="value"
              stroke={currentMetricConfig.color}
              strokeWidth={2.5}
              strokeLinecap="round"
              dot={{ r: 2, fill: currentMetricConfig.color }}
              activeDot={{ r: 5, strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      
      {patient.eventMarkers.length === 0 && (
        <div className="mt-3 text-center text-[10px] text-clay-text-muted italic border-t border-clay-border/50 pt-2">
          La línea de tiempo no muestra eventos médicos cruzados porque no hay ninguno registrado para este paciente.
        </div>
      )}
    </Card>
  );
}
