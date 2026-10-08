import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { ScaleMetricResult, Session, SlingshotMetrics, FlappyMetrics, WaterMetrics } from '../../data/types';
import { getSession } from '../../data/api';
import { Card } from '../../components/Card';
import { colors } from '../../design/tokens';

interface Props {
  sessionId: string;
}

// Formatea un número o devuelve 's/d' si la métrica no consta.
function fmt(v?: number, d = 2): string {
  return typeof v === 'number' && Number.isFinite(v) ? v.toFixed(d) : 's/d';
}

export function SessionDrilldown({ sessionId }: Props) {
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSession(sessionId).then(s => setSession(s ?? null)).catch(e => setError(e.message));
  }, [sessionId]);

  if (error) return <Card className="mt-4 text-alert text-sm">Error cargando la sesión: {error}</Card>;
  if (!session) return null;

  const hasFrames = session.games.some(g => g.frames && g.frames.length > 0);

  return (
    <Card className="mt-4">
      <h3 className="text-[15px] font-semibold text-txt mb-4">Detalle de sesión — {session.date}</h3>

      {/* Metrics summary (always shown) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        {session.games.map(game => {
          const gameLabels: Record<string, string> = { slingshot: 'La carrera (pinza)', flappy: 'El globo (puño)', water: 'El huerto (giro)' };
          const gameColors: Record<string, string> = { slingshot: colors.proximal, flappy: colors.distal, water: colors.pronosup };

          return (
            <div key={game.game} className="p-3 rounded-lg bg-clay-surface-elevated border border-clay-border">
              <h4 className="text-[12px] font-semibold mb-2" style={{ color: gameColors[game.game] }}>
                {gameLabels[game.game]}
              </h4>
              <div className="space-y-1 text-[11px]">
                {game.game === 'slingshot' && <SlingshotSummary metrics={game.metrics as SlingshotMetrics} />}
                {game.game === 'flappy' && <FlappySummary metrics={game.metrics as FlappyMetrics} />}
                {game.game === 'water' && <WaterSummary metrics={game.metrics as WaterMetrics} />}
                <div className="text-txt-muted pt-1 border-t border-clay-border/50">
                  Duración: {Math.round(game.durationMs / 1000)}s
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <ScaleMetricSummary metrics={session.derived.scaleMetrics} />

      {/* Telemetry charts (only if frames available) */}
      {hasFrames ? (
        <div>
          <h4 className="text-[13px] font-medium text-txt-secondary mb-3">Telemetría fotograma a fotograma</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {session.games.map(game => {
              if (!game.frames || game.frames.length === 0) return null;

              const gameLabels: Record<string, string> = { slingshot: 'La carrera (pinza)', flappy: 'El globo (puño)', water: 'El huerto (giro)' };
              const gameColors: Record<string, string> = { slingshot: colors.proximal, flappy: colors.distal, water: colors.pronosup };

              let dataKey: string;
              let dataLabel: string;
              if (game.game === 'slingshot') { dataKey = 'pinchRatio'; dataLabel = 'Precisión de pinza M1'; }
              else if (game.game === 'flappy') { dataKey = 'fistStrength'; dataLabel = 'index_extension_acc'; }
              else { dataKey = 'pitcherRotationZ'; dataLabel = 'Rango de rotación M4'; }

              const frameData = game.frames.map((f, i) => ({
                t: i,
                value: (f as unknown as Record<string, number>)[dataKey] ?? 0,
              }));

              return (
                <div key={game.game}>
                  <div className="text-[11px] font-medium text-txt-secondary mb-1">
                    {gameLabels[game.game]} — {dataLabel}
                  </div>
                  <div className="h-36 bg-clay-surface-elevated rounded-lg p-2 border border-clay-border/50">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={frameData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E2DFDA" />
                        <XAxis dataKey="t" tick={{ fontSize: 9, fill: '#75716B' }} />
                        <YAxis tick={{ fontSize: 9, fill: '#75716B' }} />
                        <Tooltip contentStyle={{ borderRadius: '10px', border: '1px solid #E2DFDA', fontSize: '11px' }} />
                        <Line type="monotone" dataKey="value" stroke={gameColors[game.game]} strokeWidth={1.5} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="text-[10px] text-txt-muted mt-1">{game.frames.length} fotogramas</div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="text-[12px] text-txt-muted py-2 px-3 rounded-lg bg-clay-surface-elevated border border-clay-border/50">
          Telemetría fotograma a fotograma solo disponible para la sesión más reciente.
        </div>
      )}
    </Card>
  );
}

function MetricRow({ label, value, unit }: { label: string; value: string | number; unit?: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-txt-muted">{label}</span>
      <span className="font-medium text-txt tabular-nums">{value}{unit && <span className="text-txt-muted ml-0.5">{unit}</span>}</span>
    </div>
  );
}

function ScaleMetricSummary({ metrics }: { metrics: ScaleMetricResult[] }) {
  const coreMetrics = metrics.filter(metric => metric.priority === 'CORE');

  return (
    <div className="mb-4 rounded-lg bg-clay-surface-elevated border border-clay-border p-3">
      <div className="text-[12px] font-semibold text-txt mb-2">Resultados normalizados del catálogo FixedGap</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-1">
        {coreMetrics.map(metric => (
          <MetricRow
            key={metric.id}
            label={`${metric.technicalId} · ${metric.label}`}
            value={fmt(metric.value, 1)}
            unit={metric.unit}
          />
        ))}
      </div>
    </div>
  );
}

function SlingshotSummary({ metrics }: { metrics: SlingshotMetrics }) {
  return (
    <>
      <MetricRow label="Precisión de pinza (M1)" value={fmt(metrics.accuracyRatio * 100, 0)} unit="%" />
      <MetricRow label="Apertura pulgar-índice" value={fmt(metrics.maxPinchOpen)} />
      <MetricRow label="Velocidad de alcance" value={fmt(metrics.maxPullDistance, 0)} unit="px/s" />
      <MetricRow label="Índice de temblor" value={fmt(metrics.pullTremor)} />
      <MetricRow label="Repeticiones" value={metrics.totalShots ?? 's/d'} />
    </>
  );
}

function FlappySummary({ metrics }: { metrics: FlappyMetrics }) {
  return (
    <>
      <MetricRow label="Extensión del índice" value={fmt(metrics.maxExtension * 100, 0)} unit="%" />
      <MetricRow label="Flexión máxima" value={fmt(metrics.maxFlexion * 100, 0)} unit="%" />
      <MetricRow label="Activaciones de apertura" value={metrics.activationCount ?? 's/d'} />
      <MetricRow label="Fatiga motora" value={fmt(metrics.fatigueIndex, 1)} unit="%" />
      <MetricRow label="Fragmentación (jerk)" value={fmt(metrics.smoothnessJerk)} />
    </>
  );
}

function WaterSummary({ metrics }: { metrics: WaterMetrics }) {
  return (
    <>
      <MetricRow label="Supinación (est.)" value={fmt(metrics.maxSupination, 0)} unit="°" />
      <MetricRow label="Pronación (est.)" value={fmt(metrics.maxPronation, 0)} unit="°" />
      <MetricRow label="Rango de rotación (M4)" value={fmt(((metrics.maxSupination + metrics.maxPronation) / 180) * 100, 0)} unit="/100" />
      <MetricRow label="Tiempo medio vertido" value={fmt(metrics.averagePouringTime / 1000, 1)} unit="s" />
      <MetricRow label="Precisión de vertido" value={fmt(metrics.waterAccuracy, 0)} unit="%" />
    </>
  );
}
