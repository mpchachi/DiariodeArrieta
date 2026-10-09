import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import type { Patient, Session } from '../../data/types';
import { getPatient, getSessions } from '../../data/api';
import { CHAPTERS, CHAPTER_ORDER, measuresOf, formatValue, formatDelta, chapterRow } from '../../data/measures';
import { Panel, Empty, btn, IconArrowLeft, IconPrinter } from '../../components/ui';
import { SEX, MOBILITY, fmtDate, fmtDateTime, byDate, sessionTime, daysSince } from '../patients/shared';

// Informe imprimible del paciente: solo datos medidos (última sesión, cambio respecto a la
// primera y lista de sesiones) y la nota metodológica. Se imprime o guarda en PDF desde el
// navegador.
export function PatientReport() {
  const { id } = useParams<{ id: string }>();
  const [patient, setPatient] = useState<Patient | null | undefined>(undefined);
  const [sessions, setSessions] = useState<Session[]>([]);
  useEffect(() => {
    if (!id) return;
    Promise.all([getPatient(id), getSessions(id)]).then(([p, s]) => { setSessions([...s].sort(byDate)); setPatient(p ?? null); });
  }, [id]);

  if (patient === undefined) return <div className="h-40 rounded-[12px] border border-clay-border bg-clay-surface animate-pulse" />;
  if (patient === null || sessions.length === 0) return <Panel><Empty title="No hay datos para el informe" action={<Link className={btn.secondary} to="/">Volver a pacientes</Link>}>El informe se genera a partir de las sesiones jugadas.</Empty></Panel>;

  const first = sessions[0], last = sessions[sessions.length - 1];
  const strokeDays = patient.strokeDate ? daysSince(patient.strokeDate) : null;

  return (
    <div className="max-w-[860px] mx-auto">
      <div className="flex items-center justify-between mb-6 print:hidden">
        <Link to={`/patient/${patient.id}`} className={btn.ghost}><IconArrowLeft className="size-4" />Volver a la ficha</Link>
        <button className={btn.primary} onClick={() => window.print()}><IconPrinter className="size-4" />Imprimir o guardar en PDF</button>
      </div>

      <article className="bg-clay-surface border border-clay-border rounded-[12px] p-10 print:border-0 print:p-0 print:rounded-none text-txt">
        <header className="flex items-start justify-between gap-6 pb-6 border-b border-clay-border">
          <div>
            <p className="text-[12px] text-txt-muted uppercase tracking-[0.08em]">Informe de seguimiento motor · FixedGap</p>
            <h1 className="mt-1 text-[24px] font-semibold">{patient.pseudonym}</h1>
            <p className="mt-1 text-[14px] text-txt-secondary">
              {patient.age} años · {SEX(patient.sex)} · {patient.subjectType === 'healthy' ? 'Voluntario sano (grupo de referencia)' : 'Paciente'}
              {patient.subjectType === 'patient' && patient.affectedSide && ` · Lado afectado ${patient.affectedSide === 'left' ? 'izquierdo' : 'derecho'}`}
              {patient.subjectType === 'patient' && strokeDays !== null && strokeDays >= 0 && ` · ${strokeDays} días desde el ictus`}
              {patient.subjectType === 'patient' && patient.mobility && ` · ${MOBILITY[patient.mobility]}`}
            </p>
          </div>
          <div className="text-right text-[13px] text-txt-secondary">
            <p>Emitido el {fmtDate(new Date().toISOString())}</p>
            <p>{sessions.length} {sessions.length === 1 ? 'sesión' : 'sesiones'}: {fmtDate(sessionTime(first))}{sessions.length > 1 ? ` – ${fmtDate(sessionTime(last))}` : ''}</p>
          </div>
        </header>

        <section className="py-6">
          <h2 className="text-[16px] font-semibold">Última sesión · {fmtDateTime(sessionTime(last))}</h2>
          <p className="text-[13px] text-txt-muted mt-0.5">
            {last.handUsed === 'left' ? 'Mano izquierda' : 'Mano derecha'}
            {last.qualityPct != null && ` · seguimiento de la mano ${Math.round(last.qualityPct)} %`}
            {sessions.length > 1 && ` · cambio respecto a la primera sesión (${fmtDate(sessionTime(first))})`}
          </p>
          {CHAPTER_ORDER.map(c => {
            const row = chapterRow(last, c), row0 = sessions.length > 1 ? chapterRow(first, c) : null;
            if (!row) return null;
            return (
              <div key={c} className="mt-5 break-inside-avoid">
                <h3 className="text-[14px] font-semibold">{CHAPTERS[c].order}. {CHAPTERS[c].title} — {CHAPTERS[c].gesture}</h3>
                <table className="mt-2 w-full text-[13px]">
                  <tbody className="divide-y divide-clay-border border-y border-clay-border">
                    {measuresOf(c).map(m => {
                      const v = formatValue(m, row);
                      if (v === null) return null;
                      const now = m.read(row), before = row0 ? m.read(row0) : null;
                      return (
                        <tr key={m.id}>
                          <td className="py-1.5 pr-4 text-txt-secondary">{m.label}</td>
                          <td className="py-1.5 pr-4 text-right font-medium tabular-nums whitespace-nowrap">{v}</td>
                          {sessions.length > 1 && <td className="py-1.5 text-right text-txt-muted tabular-nums whitespace-nowrap w-[120px]">{now !== null && before !== null ? formatDelta(m, now, before).text : '—'}</td>}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}
        </section>

        <section className="py-6 border-t border-clay-border break-inside-avoid">
          <h2 className="text-[16px] font-semibold">Sesiones</h2>
          <table className="mt-2 w-full text-[13px]">
            <thead><tr className="text-left text-txt-muted"><th className="font-medium py-1.5">Fecha</th><th className="font-medium py-1.5">Mano</th><th className="font-medium py-1.5">Ejercicios</th><th className="font-medium py-1.5 text-right">Seguimiento</th></tr></thead>
            <tbody className="divide-y divide-clay-border border-y border-clay-border">
              {[...sessions].reverse().map(s => (
                <tr key={s.id}>
                  <td className="py-1.5">{fmtDateTime(sessionTime(s))}</td>
                  <td className="py-1.5">{s.handUsed === 'left' ? 'Izquierda' : 'Derecha'}</td>
                  <td className="py-1.5">{s.games.length} de 3{s.completed === false ? ' (incompleta)' : ''}</td>
                  <td className="py-1.5 text-right tabular-nums">{s.qualityPct != null ? `${Math.round(s.qualityPct)} %` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <footer className="pt-6 border-t border-clay-border text-[12px] leading-relaxed text-txt-muted">
          Medidas obtenidas en el domicilio con la cámara del ordenador (vídeo 2D, MediaPipe Hands). Las distancias en mm son estimadas
          (palma de referencia de 9,5 cm). Útiles para el seguimiento longitudinal del mismo paciente; no constituyen un diagnóstico ni
          sustituyen la exploración clínica o una escala validada.
        </footer>
      </article>
    </div>
  );
}
