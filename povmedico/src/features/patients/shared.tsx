import type { Patient, Session } from '../../data/types';
import { sessionReliability } from '../../data/measures';
import { Badge, IconAlert } from '../../components/ui';

export const SEX = (s: Patient['sex']) => (s === 'M' ? 'Hombre' : s === 'F' ? 'Mujer' : 'Otro');
export const MOBILITY: Record<string, string> = { agile: 'Movilidad ágil', moderate: 'Movilidad moderada', reduced: 'Movilidad reducida' };

const dtf = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
const dtfTime = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
export const fmtDate = (iso?: string) => (iso ? dtf.format(new Date(iso)) : '—');
export const fmtDateTime = (iso?: string) => (iso ? dtfTime.format(new Date(iso)) : '—');
export const daysSince = (iso?: string) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 864e5) : null);
export const fmtAgo = (iso?: string) => {
  const d = daysSince(iso);
  return d === null ? '' : d < 1 ? 'hoy' : rtf.format(-d, 'day');
};
export const sessionTime = (s: Session) => s.startedAt ?? s.date;
export const byDate = (a: Session, b: Session) => sessionTime(a).localeCompare(sessionTime(b));

export const QUALITY_MIN = 80;
export const INACTIVE_DAYS = 14;

/** Avisos objetivos (no diagnósticos) a partir de la última sesión. */
export function notices(sessions: Session[]): { tone: 'warning' | 'neutral'; text: string }[] {
  const last = sessions[sessions.length - 1];
  if (!last) return [{ tone: 'neutral', text: 'Sin sesiones' }];
  const out: { tone: 'warning' | 'neutral'; text: string }[] = [];
  if (last.qualityPct != null && last.qualityPct < QUALITY_MIN) out.push({ tone: 'warning', text: `Mano poco detectada (${Math.round(last.qualityPct)} %)` });
  if (sessionReliability(last) === 'low') out.push({ tone: 'warning', text: 'Fiabilidad baja' });
  if (last.completed === false) out.push({ tone: 'warning', text: 'Viaje incompleto' });
  const d = daysSince(sessionTime(last));
  if (d !== null && d > INACTIVE_DAYS) out.push({ tone: 'neutral', text: `${d} días sin jugar` });
  return out;
}

export function Notices({ list }: { list: ReturnType<typeof notices> }) {
  if (!list.length) return <span className="text-[13px] text-txt-muted">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {list.map(n => <Badge key={n.text} tone={n.tone} icon={n.tone === 'warning' ? <IconAlert className="size-3" /> : undefined}>{n.text}</Badge>)}
    </div>
  );
}

export const TypeBadge = ({ p }: { p: Patient }) => (
  <Badge tone={p.subjectType === 'healthy' ? 'neutral' : 'info'}>{p.subjectType === 'healthy' ? 'Voluntario sano' : 'Paciente'}</Badge>
);

export function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}
