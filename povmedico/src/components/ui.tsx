// Componentes base del panel clínico. Estilo plano (Swiss / shadcn-Square UI): superficies
// blancas con filete de 1 px, sin sombras en reposo, sin bordes de color, una sola
// tipografía (Inter, como la plataforma) y cifras tabulares. El color se reserva para los datos.
import type { ReactNode, SVGProps } from 'react';

export function PageHeader({ title, description, actions, back }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <header className="mb-8">
      {back && <div className="mb-4">{back}</div>}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.01em] text-txt">{title}</h1>
          {description && <div className="mt-1.5 text-[15px] text-txt-secondary max-w-[70ch]">{description}</div>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export function Panel({ title, description, actions, children, className = '', padded = true }: {
  title?: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; padded?: boolean;
}) {
  return (
    <section className={`bg-clay-surface border border-clay-border rounded-[12px] ${className}`}>
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-clay-border">
          <div className="min-w-0">
            {title && <h2 className="text-[15px] font-semibold text-txt">{title}</h2>}
            {description && <p className="mt-0.5 text-[13px] text-txt-muted">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      <div className={padded ? 'p-5' : ''}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, hint }: { label: ReactNode; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="bg-clay-surface border border-clay-border rounded-[12px] px-5 py-4">
      <p className="text-[13px] text-txt-muted">{label}</p>
      <p className="mt-1 text-[24px] font-semibold tabular-nums text-txt leading-tight">{value}</p>
      {hint && <p className="mt-1 text-[12px] text-txt-muted">{hint}</p>}
    </div>
  );
}

type Tone = 'neutral' | 'alert' | 'warning' | 'ok' | 'info';
const TONES: Record<Tone, string> = {
  neutral: 'bg-clay-surface-elevated text-txt-secondary border-clay-border',
  info: 'bg-clay-surface-elevated text-txt border-clay-border-active',
  alert: 'bg-[oklch(96%_0.03_27)] text-alert border-[oklch(85%_0.07_27)]',
  warning: 'bg-[oklch(96%_0.04_80)] text-[oklch(42%_0.09_70)] border-[oklch(85%_0.08_80)]',
  ok: 'bg-[oklch(96%_0.03_150)] text-ok border-[oklch(85%_0.05_150)]',
};
export function Badge({ tone = 'neutral', children, icon }: { tone?: Tone; children: ReactNode; icon?: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2 py-0.5 text-[12px] font-medium ${TONES[tone]}`}>
      {icon}{children}
    </span>
  );
}

export function Empty({ title, children, action }: { title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center px-6 py-12">
      <div className="size-10 rounded-[10px] border border-clay-border bg-clay-surface-elevated flex items-center justify-center text-txt-muted mb-3">
        <IconInfo className="size-5" />
      </div>
      <p className="text-[15px] font-semibold text-txt">{title}</p>
      {children && <div className="mt-1 text-[14px] text-txt-secondary max-w-[52ch]">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, label }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-[10px] border border-clay-border bg-clay-surface-elevated p-0.5">
      {options.map(o => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={`px-3 h-8 rounded-[8px] text-[13px] font-medium transition-colors cursor-pointer ${value === o.value ? 'bg-clay-surface text-txt border border-clay-border' : 'text-txt-secondary hover:text-txt border border-transparent'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const btn = {
  primary: 'inline-flex items-center gap-2 h-9 px-4 rounded-[10px] bg-accent text-[oklch(0.984_0.003_247.858)] text-[14px] font-medium hover:opacity-90 transition-opacity no-underline cursor-pointer',
  secondary: 'inline-flex items-center gap-2 h-9 px-4 rounded-[10px] border border-clay-border bg-clay-surface text-txt text-[14px] font-medium hover:bg-clay-surface-hover transition-colors no-underline cursor-pointer',
  ghost: 'inline-flex items-center gap-1.5 h-8 px-2 -ml-2 rounded-[8px] text-[14px] text-txt-secondary hover:text-txt hover:bg-clay-surface-hover transition-colors no-underline cursor-pointer',
};

// ── Iconos (trazo 1,75 px, currentColor; geometría tipo Lucide) ──
type IP = SVGProps<SVGSVGElement>;
const base = (p: IP) => ({ width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true, ...p });
export const IconUsers = (p: IP) => <svg {...base(p)}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
export const IconBook = (p: IP) => <svg {...base(p)}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z" /><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5" /></svg>;
export const IconArrowLeft = (p: IP) => <svg {...base(p)}><path d="M19 12H5M12 19l-7-7 7-7" /></svg>;
export const IconChevronRight = (p: IP) => <svg {...base(p)}><path d="m9 18 6-6-6-6" /></svg>;
export const IconChevronDown = (p: IP) => <svg {...base(p)}><path d="m6 9 6 6 6-6" /></svg>;
export const IconSearch = (p: IP) => <svg {...base(p)}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>;
export const IconPrinter = (p: IP) => <svg {...base(p)}><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><path d="M6 14h12v8H6z" /></svg>;
export const IconAlert = (p: IP) => <svg {...base(p)}><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></svg>;
export const IconInfo = (p: IP) => <svg {...base(p)}><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>;
export const IconHome = (p: IP) => <svg {...base(p)}><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M9 22V12h6v10" /></svg>;
export const IconPlay = (p: IP) => <svg {...base(p)}><path d="m6 4 14 8-14 8z" /></svg>;
