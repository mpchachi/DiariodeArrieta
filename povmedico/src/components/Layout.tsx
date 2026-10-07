import { type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';

export function Layout({ children }: { children: ReactNode }) {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-clay-bg flex">
      {/* Sidebar */}
      <aside className="fixed top-0 left-0 h-screen w-[230px] bg-clay-surface-solid border-r border-clay-border flex flex-col z-50 shadow-clay">
        {/* Logo */}
        <Link to="/" className="px-5 h-[72px] flex items-center gap-3 border-b border-clay-border no-underline hover:bg-clay-surface-hover transition-colors">
          <img src={`${import.meta.env.BASE_URL}logo.png`} alt="FixedGap" className="w-9 h-9 rounded-xl object-cover shadow-clay" />
          <span className="font-display font-extrabold text-txt text-[18px] tracking-tight">FixedGap</span>
        </Link>

        {/* Nav */}
        <nav className="flex-1 px-3 py-5 space-y-1.5">
          <SidebarLink to="/" icon={<TriageIcon />} label="Triaje" active={location.pathname === '/'} />
          <SidebarLink to="/analytics" icon={<AnalyticsIcon />} label="Analítica" active={location.pathname === '/analytics'} />

          <div className="pt-4 mt-4 border-t border-clay-border" />

          <div className="text-[9px] text-txt-muted uppercase tracking-widest font-bold font-display px-4 mb-2">Herramientas</div>
          <SidebarLink to="/exercises" icon={<ExerciseIcon />} label="Ejercicios" active={location.pathname === '/exercises'} />
          <SidebarLink to="/reports" icon={<ReportIcon />} label="Informes" active={location.pathname === '/reports'} />
        </nav>

        {/* Actions */}
        <div className="px-4 py-4 mt-auto">
          <a
            // Vuelve a la app del operador (la carpeta superior al dashboard: «/» o «/plataforma/»).
            href={import.meta.env.BASE_URL.replace(/dashboard\/$/, '')}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-[13px] font-medium text-txt bg-clay-surface border border-clay-border hover:bg-clay-surface-hover hover:-translate-y-0.5 transition-all duration-300 shadow-clay w-full no-underline"
          >
            <span className="w-5 h-5 flex items-center justify-center text-accent">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
            </span>
            <span className="font-display text-center flex-1 pr-5">Volver al Operador</span>
          </a>
        </div>
      </aside>

      {/* Main */}
      <main className="ml-[230px] flex-1 min-h-screen">
        <div className="max-w-[1200px] mx-auto px-8 py-8">
          {children}
        </div>
      </main>
    </div>
  );
}

function SidebarLink({ to, icon, label, active }: { to: string; icon: ReactNode; label: string; active: boolean }) {
  return (
    <Link
      to={to}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl text-[13px] font-medium no-underline transition-all duration-300 ${
        active
          ? 'bg-accent/10 text-accent shadow-clay-inset'
          : 'text-txt-secondary hover:text-txt hover:bg-clay-surface-hover hover:translate-x-1'
      }`}
    >
      <span className={`w-5 h-5 flex items-center justify-center transition-colors duration-300 ${active ? 'text-accent' : 'text-txt-muted'}`}>
        {icon}
      </span>
      <span className="font-display">{label}</span>
    </Link>
  );
}

function TriageIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function AnalyticsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 20V10" />
      <path d="M12 20V4" />
      <path d="M6 20v-6" />
    </svg>
  );
}


function ExerciseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}

function ReportIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}
