import { useEffect, useMemo, useState, Fragment } from 'react';
import { useParams, Link } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import type { Patient, Session } from '../../data/types';
import { getPatient, getSessions } from '../../data/api';
import { canCompare, comparisonReason, measurementOf, DIMENSIONS, OBSERVATION_STATUS } from '../../data/comparability';
import { CHAPTERS, CHAPTER_ORDER, MEASURES, QUALITY_MEASURE, RELIABILITY_LABEL, reliabilityOf, reliabilityReasons, sessionReliability, measuresOf, formatValue, formatDelta, chapterRow, repetitions, PALM_MM, type ChapterKey, type Measure, type Row } from '../../data/measures';
import { PageHeader, Panel, Badge, Empty, btn, IconArrowLeft, IconPrinter, IconChevronDown, IconChevronRight, IconAlert, IconPlay } from '../../components/ui';
import { SEX, MOBILITY, TypeBadge, fmtDate, fmtDateTime, fmtAgo, byDate, sessionTime, daysSince, QUALITY_MIN } from './shared';

const handLabel = (h?: string | null) => (h === 'left' ? 'Mano izquierda' : h === 'right' ? 'Mano derecha' : 'Mano no registrada');
const totalMinutes = (s: Session) => s.games.reduce((a, g) => a + (g.durationMs || 0), 0) / 60000;

export function PatientPage() {
  const { id } = useParams<{ id: string }>();
  const [patient, setPatient] = useState<Patient | null | undefined>(undefined);
  const [sessions, setSessions] = useState<Session[]>([]);

  useEffect(() => {
    if (!id) return;
    Promise.all([getPatient(id), getSessions(id)]).then(([p, s]) => { setSessions([...s].sort(byDate)); setPatient(p ?? null); });
  }, [id]);

  if (patient === undefined) return <div className="h-40 rounded-[12px] border border-clay-border bg-clay-surface animate-pulse" />;
  if (patient === null) return <Panel><Empty title="Paciente no encontrado" action={<Link className={btn.secondary} to="/">Volver a pacientes</Link>}>Puede que se haya eliminado o que no pertenezca a tu equipo.</Empty></Panel>;

  const last = sessions[sessions.length - 1];
  const prev = sessions[sessions.length - 2];
  const strokeDays = patient.strokeDate ? daysSince(patient.strokeDate) : null;
  const platform = import.meta.env.BASE_URL.replace(/dashboard\/$/, '');

  return (
    <div>
      <PageHeader
        back={<Link to="/" className={btn.ghost}><IconArrowLeft className="size-4" />Pacientes</Link>}
        title={patient.pseudonym}
        description={
          <div className="flex flex-wrap items-center gap-1.5 mt-1">
            <Badge>{patient.age} años · {SEX(patient.sex)}</Badge>
            <TypeBadge p={patient} />
            {patient.subjectType === 'patient' && patient.affectedSide && <Badge>Lado afectado: {patient.affectedSide === 'left' ? 'izquierdo' : 'derecho'}</Badge>}
            {patient.subjectType === 'patient' && strokeDays !== null && strokeDays >= 0 && <Badge>{strokeDays} días desde el ictus</Badge>}
            {patient.subjectType === 'patient' && patient.mobility && <Badge>{MOBILITY[patient.mobility]}</Badge>}
            <Badge>{sessions.length} {sessions.length === 1 ? 'sesión' : 'sesiones'}</Badge>
          </div>
        }
        actions={<>
          <a className={btn.secondary} href={platform}><IconPlay className="size-4" />Jugar desde la plataforma</a>
          {sessions.length > 0 && <Link className={btn.secondary} to={`/patient/${patient.id}/report`}><IconPrinter className="size-4" />Informe</Link>}
        </>}
      />

      {patient.notes && <Panel className="mb-6" title="Notas del alta"><p className="text-[14px] text-txt-secondary whitespace-pre-line">{patient.notes}</p></Panel>}

      {!last ? (
        <Panel><Empty title="Todavía no hay partidas">Cuando el paciente juegue el viaje del zorro (Pacientes → Jugar, en la plataforma), sus medidas aparecerán aquí al terminar.</Empty></Panel>
      ) : (
        <div className="space-y-6">
          <LastSession last={last} prev={prev} />
          <Evolution sessions={sessions} />
          <SessionsList sessions={sessions} />
          <p className="text-[13px] text-txt-muted">
            Medidas obtenidas con la cámara del ordenador (vídeo 2D). Son útiles para seguir la evolución del mismo paciente; no sustituyen la exploración ni una escala clínica validada.{' '}
            <Link to="/exercises" className="text-txt underline underline-offset-2">Cómo se obtiene cada medida</Link>.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Última sesión ──
function LastSession({ last, prev }: { last: Session; prev?: Session }) {
  const q = last.qualityPct;
  const rel = sessionReliability(last);
  return (
    <Panel
      title="Última sesión"
      description={<>{fmtDateTime(sessionTime(last))} · {fmtAgo(sessionTime(last))} · {handLabel(last.handUsed)} · {totalMinutes(last).toFixed(1).replace('.', ',')} min de juego</>}
      actions={<div className="flex flex-wrap gap-1.5">
        {q != null && <Badge tone={q < QUALITY_MIN ? 'warning' : 'neutral'} icon={q < QUALITY_MIN ? <IconAlert className="size-3" /> : undefined}>Mano detectada {Math.round(q)} %</Badge>}
        {rel && <Badge tone={rel === 'low' ? 'warning' : 'neutral'} icon={rel !== 'high' ? <IconAlert className="size-3" /> : undefined}>{RELIABILITY_LABEL[rel]}</Badge>}
      </div>}
    >
      {q != null && q < QUALITY_MIN && (
        <p className="mb-4 text-[13px] text-txt-secondary">La mano se detectó solo el {Math.round(q)} % del tiempo: interpreta estas cifras con cautela (encuadre, luz o mano fuera de cámara).</p>
      )}
      {rel && rel !== 'high' && (
        <p className="mb-4 text-[13px] text-txt-secondary">
          {RELIABILITY_LABEL[rel]}: {[...new Set(CHAPTER_ORDER.flatMap(c => { const r = reliabilityOf(chapterRow(last, c)); return r ? reliabilityReasons(r) : []; }))].join('; ')}. Interpreta estas cifras con cautela.
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        {CHAPTER_ORDER.map(c => <ChapterSummary key={c} chapter={c} row={chapterRow(last, c)} prevRow={prev ? chapterRow(prev, c) : null} />)}
      </div>
      <p className="mt-3 text-[13px] text-txt-muted">Movimiento observado durante el juego, no capacidad máxima ni recuperación clínica. Las cifras de rendimiento y los registros históricos se conservan en el detalle de sesiones.</p>
      {prev && <p className="mt-2 text-[12px] text-txt-muted">Diferencias descriptivas respecto al {fmtDate(sessionTime(prev))} solo con versiones y contexto compatibles. No se ha establecido un cambio mínimo detectable.</p>}
    </Panel>
  );
}

function ChapterSummary({ chapter, row, prevRow }: { chapter: ChapterKey; row: Row | null; prevRow: Row | null }) {
  const ch = CHAPTERS[chapter];
  const context = measurementOf(row);
  const ms = measuresOf(chapter).filter(m => m.key && context && row && formatValue(m, row) !== null);
  const reason = prevRow ? comparisonReason(row, prevRow) : 'Sin sesión previa para comparar';
  return (
    <div className="rounded-[10px] border border-clay-border">
      <div className="px-4 py-3 border-b border-clay-border flex items-center gap-2">
        <span className="size-2 rounded-full" style={{ background: ch.colorVar }} aria-hidden />
        <div><p className="text-[14px] font-semibold text-txt">{DIMENSIONS[chapter]}</p>
        <p className="text-[13px] text-txt-muted">{ch.title}</p></div>
      </div>
      {!row ? (
        <p className="px-4 py-4 text-[13px] text-txt-muted">No se jugó en esta sesión.</p>
      ) : !ms.length ? (
        <p className="px-4 py-4 text-[13px] text-txt-muted">{context ? 'Sin suficientes muestras utilizables de juego autónomo. Consulte las oportunidades registradas.' : 'Registro histórico: sus cifras se conservan en el detalle, sin reinterpretarlas con el método nuevo.'}</p>
      ) : (
        <dl className="divide-y divide-clay-border">
          {ms.map(m => {
            const v = m.read(row), pv = prevRow ? m.read(prevRow) : null;
            const delta = !reason && v !== null && pv !== null ? formatDelta(m, v, pv) : null;
            return (
              <div key={m.id} className="px-4 py-2.5 flex items-baseline justify-between gap-3" title={m.meaning}>
                <dt className="text-[13px] text-txt-secondary">{m.label}</dt>
                <dd className="text-right">
                  <span className="text-[15px] font-semibold tabular-nums text-txt">{formatValue(m, row)}</span>
                  {delta && <span className={`block text-[12px] tabular-nums ${delta.tone === 'good' ? 'text-ok' : delta.tone === 'bad' ? 'text-alert' : 'text-txt-muted'}`}>{delta.text}</span>}
                </dd>
              </div>
            );
          })}
        </dl>
      )}
      {row && reason && <p className="px-4 pb-3 text-[12px] text-txt-muted">{reason}.</p>}
    </div>
  );
}

// ── Evolución ──
const shortDate = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' });
function Evolution({ sessions }: { sessions: Session[] }) {
  // Solo medidas con valor en al menos dos sesiones (con una sola no hay evolución que mostrar).
  const available = MEASURES.filter(m => m.key && sessions.filter(s => {
    const r = chapterRow(s, m.chapter), latest = sessions.length ? chapterRow(sessions[sessions.length - 1], m.chapter) : null;
    return r && canCompare(latest, r) && m.read(r) !== null;
  }).length >= 2);
  const [mid, setMid] = useState<string>(available[0]?.id ?? '');
  const m = available.find(x => x.id === mid) ?? available[0];
  const data = useMemo(() => !m ? [] : sessions.map(s => {
    const r = chapterRow(s, m.chapter);
    const latest = chapterRow(sessions[sessions.length - 1], m.chapter);
    return { t: sessionTime(s), ts: new Date(sessionTime(s)).getTime(), value: r && canCompare(latest, r) ? m.read(r) : null };
  }), [m, sessions]);

  if (sessions.length < 2) {
    return <Panel title="Evolución"><p className="text-[14px] text-txt-secondary">La evolución se muestra a partir de la segunda sesión. Por ahora hay {sessions.length === 1 ? 'una' : sessions.length}.</p></Panel>;
  }
  if (!m) return <Panel title="Evolución"><p className="text-[14px] text-txt-secondary">No hay dos sesiones con medidas y contexto compatibles con la última. No se mezclan manos, versiones, configuraciones, ayudas o capturas con incidencias. Los registros siguen disponibles en el detalle.</p></Panel>;

  const first = data.find(d => d.value !== null)?.value as number;
  const fmt = (v: number) => `${v.toLocaleString('es-ES', { maximumFractionDigits: m.decimals })}${!m.unit ? '' : m.unit === '°' ? '°' : ` ${m.unit}`}`;
  return (
    <Panel
      title="Evolución"
      description={m.meaning}
      actions={
        <label className="flex items-center gap-2 text-[13px] text-txt-secondary">
          <span className="sr-only">Medida</span>
          <select value={m.id} onChange={e => setMid(e.target.value)} className="h-9 rounded-[10px] border border-clay-border bg-clay-surface px-3 text-[14px] text-txt cursor-pointer">
            {CHAPTER_ORDER.map(c => (
              <optgroup key={c} label={CHAPTERS[c].title}>
                {available.filter(x => x.chapter === c).map(x => <option key={x.id} value={x.id}>{x.label}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
      }
    >
      <div className="h-[280px]" role="img" aria-label={`Evolución de ${m.label}: ${data.map(d => `${shortDate.format(d.ts)} ${d.value === null ? 'No comparable' : fmt(d.value)}`).join(', ')}`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
            <CartesianGrid stroke="#E2E8F0" vertical={false} />
            {/* Eje temporal real: la separación entre puntos refleja los días entre sesiones. */}
            <XAxis dataKey="ts" type="number" scale="time" domain={['dataMin', 'dataMax']} padding={{ left: 16, right: 16 }}
              tickFormatter={(v: number) => shortDate.format(v)} tick={{ fontSize: 12, fill: '#64748B' }} tickLine={false} axisLine={{ stroke: '#E2E8F0' }} />
            <YAxis tick={{ fontSize: 12, fill: '#64748B' }} tickLine={false} axisLine={false} width={56}
              tickFormatter={(v: number) => `${v.toLocaleString('es-ES', { maximumFractionDigits: m.decimals })}${m.unit && m.unit !== '°' ? ` ${m.unit}` : m.unit}`} domain={m.text ? [0, 'auto'] : ['auto', 'auto']} allowDecimals={m.decimals > 0} />
            <Tooltip separator=": " formatter={(v: unknown) => [fmt(Number(v)), m.label]} labelFormatter={(_l, p) => (p?.[0] ? fmtDateTime((p[0].payload as { t: string }).t) : '')}
              contentStyle={{ borderRadius: 10, border: '1px solid #E2E8F0', boxShadow: 'none', fontSize: 13 }} />
            <ReferenceLine y={first} stroke="#CBD5E1" strokeDasharray="4 4" />
            <Line type="linear" connectNulls={false} dataKey="value" stroke={CHAPTERS[m.chapter].hex} strokeWidth={2} dot={{ r: 3.5, strokeWidth: 0, fill: CHAPTERS[m.chapter].hex }} activeDot={{ r: 5 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-[12px] text-txt-muted">{m.how} La línea discontinua marca la primera sesión compatible ({fmt(first)}). Los huecos indican datos ausentes o no comparables. Coincidir en estos controles no garantiza igual postura ni exactitud clínica.</p>
    </Panel>
  );
}

// ── Sesiones ──
function SessionsList({ sessions }: { sessions: Session[] }) {
  const ordered = [...sessions].reverse();
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Panel title="Sesiones" description="Pulsa una sesión para ver todas sus medidas y cada repetición." padded={false}>
      <table className="w-full text-[14px]">
        <thead>
          <tr className="text-left text-[12px] text-txt-muted border-b border-clay-border">
            <th className="font-medium px-4 py-2.5 w-8" />
            <th className="font-medium px-2 py-2.5">Fecha</th>
            <th className="font-medium px-4 py-2.5">Mano</th>
            <th className="font-medium px-4 py-2.5">Capítulos</th>
            <th className="font-medium px-4 py-2.5 text-right">Duración</th>
            <th className="font-medium px-4 py-2.5 text-right">Mano detectada</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-clay-border">
          {ordered.map(s => {
            const isOpen = open === s.id;
            return (
              <Fragment key={s.id}>
                <tr onClick={() => setOpen(isOpen ? null : s.id)} className="cursor-pointer hover:bg-clay-surface-hover transition-colors" aria-expanded={isOpen}>
                  <td className="px-4 py-3 text-txt-muted">{isOpen ? <IconChevronDown className="size-4" /> : <IconChevronRight className="size-4" />}</td>
                  <td className="px-2 py-3">{fmtDateTime(sessionTime(s))}</td>
                  <td className="px-4 py-3">{handLabel(s.handUsed)}</td>
                  <td className="px-4 py-3">{s.games.length} de 3{s.completed === false && <span className="ml-2"><Badge tone="warning">Incompleto</Badge></span>}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{totalMinutes(s).toFixed(1).replace('.', ',')} min</td>
                  <td className="px-4 py-3 text-right tabular-nums">{s.qualityPct != null ? `${Math.round(s.qualityPct)} %` : '—'}</td>
                </tr>
                {isOpen && (
                  <tr><td colSpan={6} className="bg-clay-bg px-4 py-4"><SessionDetail s={s} /></td></tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </Panel>
  );
}

export function SessionDetail({ s }: { s: Session }) {
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      {CHAPTER_ORDER.map(c => {
        const row = chapterRow(s, c);
        const ch = CHAPTERS[c];
        return (
          <div key={c} className="rounded-[10px] border border-clay-border bg-clay-surface">
            <div className="px-4 py-3 border-b border-clay-border flex items-center gap-2">
              <span className="size-2 rounded-full" style={{ background: ch.colorVar }} aria-hidden />
              <p className="text-[14px] font-semibold">{ch.title}</p>
              {row && <p className="ml-auto text-[12px] text-txt-muted tabular-nums">{Math.round(((row.duration_ms as number) || 0) / 1000)} s · mano detectada {QUALITY_MEASURE.read(row) === null ? '—' : `${Math.round(QUALITY_MEASURE.read(row) as number)} %`}</p>}
            </div>
            {row && <><ReliabilityLine row={row} /><ObservationDetails row={row} /></>}
            {!row ? <p className="px-4 py-4 text-[13px] text-txt-muted">No se jugó.</p> : (
              <>
                <dl className="divide-y divide-clay-border">
                  {measuresOf(c).map(m => <MeasureLine key={m.id} m={m} row={row} />)}
                </dl>
                <Repetitions chapter={c} row={row} />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ObservationDetails({ row }: { row: Row }) {
  const context = measurementOf(row);
  if (!context) return <p className="px-4 py-3 text-[12px] text-txt-muted">Histórico sin trazabilidad completa. Se conservan los valores originales; no se comparan automáticamente con la versión nueva.</p>;
  return <details className="border-b border-clay-border">
    <summary className="px-4 py-3 text-[13px] cursor-pointer">Oportunidades registradas ({context.observations.length})</summary>
    <p className="px-4 pb-2 text-[12px] text-txt-muted">Una oportunidad es una ventana del ejercicio, no necesariamente un intento voluntario. No completar no equivale a incapacidad.</p>
    <ul className="px-4 pb-3 space-y-2 text-[12px]">
      {context.observations.map((o, i) => <li key={o.id}>
        <strong>{i + 1}. {o.stage === 'active' ? 'Autónoma' : o.stage === 'tutorial' ? 'Guiada' : 'Preparación'}</strong>: {OBSERVATION_STATUS[o.status]} · {o.usableCount} / {o.sampleCount} muestras.
        {o.p95 !== null && <span> Intervalo observado P05–P95: {o.p05?.toFixed(2)}–{o.p95.toFixed(2)} {context.game === 'fox_runner' ? 'palmas' : '°'}.</span>}
      </li>)}
    </ul>
  </details>;
}

function MeasureLine({ m, row }: { m: Measure; row: Row }) {
  const v = formatValue(m, row);
  if (v === null) return null;
  return (
    <div className="px-4 py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <dt className="text-[13px] text-txt">{m.label}</dt>
        <dd className="text-[14px] font-semibold tabular-nums">{v}</dd>
      </div>
      <p className="mt-0.5 text-[12px] leading-snug text-txt-muted">{m.meaning}</p>
    </div>
  );
}

const FLOWER: Record<string, string> = { tulip: 'Tulipán', daisy: 'Margarita', sunflower: 'Girasol', lavender: 'Lavanda', rose: 'Rosa' };
const n0 = (v: unknown, d = 0) => (typeof v === 'number' ? v.toLocaleString('es-ES', { maximumFractionDigits: d }) : '—');
function Repetitions({ chapter, row }: { chapter: ChapterKey; row: Row }) {
  const reps = repetitions(row);
  if (!reps.length) return null;
  const head = (cols: string[]) => <tr className="text-left text-[11px] text-txt-muted">{cols.map(c => <th key={c} className="font-medium px-2 py-1.5 first:pl-4 whitespace-nowrap">{c}</th>)}</tr>;
  let body: React.ReactNode, cols: string[];
  if (chapter === 'fox_runner') {
    cols = ['Pinza', 'Apertura previa', 'Supera umbral', 'Cierre', 'Mantiene'];
    body = reps.map((r, i) => <tr key={i}>{[`${i + 1}`, typeof r.opening_palm === 'number' ? `${n0((r.opening_palm as number) * PALM_MM)} mm` : '—', r.full_open === true ? 'Sí' : r.full_open === false ? 'No' : '—', `${n0(r.closing_ms)} ms`, `${n0(r.hold_ms)} ms`].map((c, j) => <td key={j} className="px-2 py-1.5 first:pl-4 tabular-nums whitespace-nowrap">{c}</td>)}</tr>);
  } else if (chapter === 'fox_balloon') {
    cols = ['Paso', 'Superado', 'Choque'];
    body = reps.map((r, i) => <tr key={i}>{[`${i + 1}`, r.passed ? 'Sí' : 'No', r.hit ? 'Sí' : 'No'].map((c, j) => <td key={j} className="px-2 py-1.5 first:pl-4">{c}</td>)}</tr>);
  } else {
    cols = ['Flor', 'Inclinación', 'Contrario', 'Hasta regar', 'Vel. máx.'];
    body = reps.map((r, i) => <tr key={i}>{[FLOWER[r.kind as string] ?? `${i + 1}`, `${n0(r.peak_tilt_deg)}°`, `${n0(r.peak_opposite_deg)}°`, typeof r.time_to_bloom_ms === 'number' ? `${n0(r.time_to_bloom_ms / 1000, 1)} s` : '—', `${n0(r.peak_velocity_out)} °/s`].map((c, j) => <td key={j} className="px-2 py-1.5 first:pl-4 tabular-nums whitespace-nowrap">{c}</td>)}</tr>);
  }
  return (
    <details className="border-t border-clay-border">
      <summary className="px-4 py-2.5 text-[13px] text-txt-secondary cursor-pointer hover:text-txt">Ver cada repetición ({reps.length})</summary>
      <div className="overflow-x-auto pb-2">
        <table className="w-full text-[13px]"><thead>{head(cols)}</thead><tbody className="divide-y divide-clay-border">{body}</tbody></table>
      </div>
    </details>
  );
}

// Fiabilidad de un capítulo: nivel y sus tres componentes (solo en partidas nuevas).
function ReliabilityLine({ row }: { row: Row }) {
  const context = measurementOf(row);
  if (context) return <div className="px-4 py-3 border-b border-clay-border text-[12px] text-txt-muted">
    <p className="font-medium text-txt">Condiciones de captura · {context.selectedHand === 'Left' ? 'mano izquierda' : 'mano derecha'}</p>
    <p>{context.capture.usable} / {context.capture.frames} muestras utilizables en juego autónomo. Hueco máximo: {context.capture.maxGapMs} ms.</p>
    <p>{context.comparable ? 'Sin incidencias que bloqueen la comparación técnica.' : 'Revisar captura o ejercicio incompleto antes de comparar.'} No garantiza exactitud clínica.</p>
    <p className="break-words">Versión: {context.version} · {context.source}</p>
    {context.adaptation.length > 0 && <p>Umbrales de ayuda registrados: {context.adaptation.map(a => `${a.threshold}°`).join(' → ')}.</p>}
  </div>;
  const r = reliabilityOf(row);
  if (!r) return null;
  const n = (v: number | null) => (v == null ? '—' : `${Math.round(v)} %`);
  return (
    <p className="px-4 py-2 border-b border-clay-border text-[12px] text-txt-muted" title={reliabilityReasons(r).join('; ') || 'Sin incidencias'}>
      <span className={r.level === 'low' ? 'text-alert font-medium' : 'text-txt font-medium'}>{RELIABILITY_LABEL[r.level]}</span>
      {' · '}descartadas {n(r.rejectedPct)} · encuadre correcto {n(r.framingOkPct)}
    </p>
  );
}
