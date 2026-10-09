import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Patient, Session } from '../../data/types';
import { getPatients, getAllSessions, getLoadError } from '../../data/api';
import { PageHeader, Panel, Stat, Empty, Segmented, IconSearch, IconChevronRight, btn } from '../../components/ui';
import { SEX, TypeBadge, Notices, notices, fmtDate, fmtAgo, byDate, sessionTime, daysSince, initials } from './shared';

type Filter = 'all' | 'patient' | 'healthy';

export function PatientsPage() {
  const [patients, setPatients] = useState<Patient[] | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([getPatients(), getAllSessions()]).then(([p, s]) => { setSessions(s); setPatients(p); });
  }, []);

  const rows = useMemo(() => (patients ?? []).map(p => {
    const ss = sessions.filter(s => s.patientId === p.id).sort(byDate);
    return { p, ss, last: ss[ss.length - 1], notes: notices(ss) };
  }).sort((a, b) => (b.last ? sessionTime(b.last) : '').localeCompare(a.last ? sessionTime(a.last) : '') || a.p.pseudonym.localeCompare(b.p.pseudonym)), [patients, sessions]);

  const visible = rows.filter(r => (filter === 'all' || r.p.subjectType === filter) && r.p.pseudonym.toLowerCase().includes(q.trim().toLowerCase()));
  const platform = import.meta.env.BASE_URL.replace(/dashboard\/$/, '');
  const week = sessions.filter(s => (daysSince(sessionTime(s)) ?? 99) < 7).length;
  const withNotices = rows.filter(r => r.notes.some(n => n.tone === 'warning')).length;
  const error = getLoadError();

  return (
    <div>
      <PageHeader
        title="Pacientes"
        description="Pacientes y voluntarios de tu equipo, con su última sesión del viaje del zorro. Los pacientes se dan de alta desde la plataforma."
        actions={<a className={btn.secondary} href={platform}>Nuevo paciente en la plataforma</a>}
      />

      {patients === null ? (
        <div className="grid grid-cols-4 gap-3 mb-6">{[0, 1, 2, 3].map(i => <div key={i} className="h-[92px] rounded-[12px] border border-clay-border bg-clay-surface animate-pulse" />)}</div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <Stat label="Pacientes" value={rows.filter(r => r.p.subjectType === 'patient').length} />
          <Stat label="Voluntarios sanos" value={rows.filter(r => r.p.subjectType === 'healthy').length} hint="Grupo de referencia" />
          <Stat label="Sesiones en los últimos 7 días" value={week} />
          <Stat label="Con avisos en la última sesión" value={withNotices} hint="Seguimiento bajo o viaje incompleto" />
        </div>
      )}

      <Panel padded={false}>
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-clay-border">
          <label className="relative flex-1 min-w-[220px] max-w-[340px]">
            <span className="sr-only">Buscar paciente</span>
            <IconSearch className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-txt-muted" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nombre o pseudónimo"
              className="w-full h-9 pl-9 pr-3 rounded-[10px] border border-clay-border bg-clay-surface text-[14px] text-txt placeholder:text-txt-muted outline-none focus:border-clay-border-active focus:ring-2 focus:ring-[oklch(0.704_0.04_256.788/0.5)]" />
          </label>
          <Segmented label="Tipo" value={filter} onChange={setFilter}
            options={[{ value: 'all', label: 'Todos' }, { value: 'patient', label: 'Pacientes' }, { value: 'healthy', label: 'Voluntarios sanos' }]} />
          {patients && <span className="ml-auto text-[13px] text-txt-muted tabular-nums">{visible.length} de {rows.length}</span>}
        </div>

        {patients === null ? (
          <div className="divide-y divide-clay-border">{[0, 1, 2].map(i => <div key={i} className="h-14 px-4 flex items-center"><div className="h-3 w-1/3 rounded bg-clay-surface-elevated animate-pulse" /></div>)}</div>
        ) : error ? (
          <Empty title="No se han podido cargar los pacientes">Revisa la conexión y recarga la página. Detalle: {error}</Empty>
        ) : rows.length === 0 ? (
          <Empty title="Aún no hay pacientes" action={<a className={btn.primary} href={platform}>Ir a la plataforma</a>}>
            Da de alta a un paciente o voluntario en la plataforma (Pacientes → Nuevo paciente). Tras su primera partida, sus datos aparecerán aquí.
          </Empty>
        ) : visible.length === 0 ? (
          <Empty title="Ningún resultado" action={<button className={btn.secondary} onClick={() => { setQ(''); setFilter('all'); }}>Quitar filtros</button>}>
            Ningún paciente coincide con la búsqueda o el filtro.
          </Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[14px]">
              <thead>
                <tr className="text-left text-[12px] text-txt-muted border-b border-clay-border">
                  <th className="font-medium px-4 py-2.5">Paciente</th>
                  <th className="font-medium px-4 py-2.5">Tipo</th>
                  <th className="font-medium px-4 py-2.5 text-right">Sesiones</th>
                  <th className="font-medium px-4 py-2.5">Última sesión</th>
                  <th className="font-medium px-4 py-2.5 text-right">Calidad</th>
                  <th className="font-medium px-4 py-2.5">Avisos</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-clay-border">
                {visible.map(({ p, ss, last, notes }) => (
                  <tr key={p.id} onClick={() => navigate(`/patient/${p.id}`)} className="cursor-pointer hover:bg-clay-surface-hover transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="size-8 shrink-0 rounded-[8px] border border-clay-border bg-clay-surface-elevated grid place-items-center text-[12px] font-semibold text-txt-secondary">{initials(p.pseudonym)}</span>
                        <div className="min-w-0">
                          <Link to={`/patient/${p.id}`} onClick={e => e.stopPropagation()} className="font-medium text-txt no-underline hover:underline underline-offset-2">{p.pseudonym}</Link>
                          <p className="text-[13px] text-txt-muted">{p.age} años · {SEX(p.sex)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3"><TypeBadge p={p} /></td>
                    <td className="px-4 py-3 text-right tabular-nums">{ss.length}</td>
                    <td className="px-4 py-3">{last ? <><span>{fmtDate(sessionTime(last))}</span> <span className="text-txt-muted">· {fmtAgo(sessionTime(last))}</span></> : <span className="text-txt-muted">—</span>}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{last?.qualityPct != null ? `${Math.round(last.qualityPct)} %` : <span className="text-txt-muted">—</span>}</td>
                    <td className="px-4 py-3"><Notices list={notes} /></td>
                    <td className="px-2 text-txt-muted"><IconChevronRight className="size-4" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
