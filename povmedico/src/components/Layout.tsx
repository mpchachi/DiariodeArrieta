import { type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { IconUsers, IconBook, IconHome } from './ui';

// Estructura del panel: barra lateral fija con dos secciones (Pacientes · Ejercicios y
// medidas) y vuelta a la plataforma. Sin elementos de navegación que lleven a pantallas
// sin datos.
export function Layout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const platform = import.meta.env.BASE_URL.replace(/dashboard\/$/, '');
  const inPatients = pathname === '/' || pathname.startsWith('/patient');

  return (
    <div className="min-h-screen bg-clay-bg flex print:block">
      <aside className="fixed top-0 left-0 h-screen w-[232px] bg-clay-surface border-r border-clay-border flex flex-col z-40 print:hidden">
        <Link to="/" className="h-16 px-5 flex items-center gap-2.5 border-b border-clay-border no-underline">
          <img src={`${import.meta.env.BASE_URL}logo.png`} alt="" className="w-7 h-7 rounded-[7px] object-cover" />
          <span className="text-[16px] font-semibold text-txt">FixedGap</span>
          <span className="ml-auto text-[11px] font-medium text-txt-muted border border-clay-border rounded-md px-1.5 py-0.5">Clínico</span>
        </Link>
        <nav className="flex-1 px-3 py-4 space-y-0.5" aria-label="Secciones">
          <NavItem to="/" active={inPatients} icon={<IconUsers className="size-[18px]" />}>Pacientes</NavItem>
          <NavItem to="/exercises" active={pathname === '/exercises'} icon={<IconBook className="size-[18px]" />}>Ejercicios y medidas</NavItem>
        </nav>
        <div className="p-3 border-t border-clay-border">
          <a href={platform} className="flex items-center gap-2.5 h-9 px-3 rounded-[8px] text-[14px] text-txt-secondary hover:bg-clay-surface-hover hover:text-txt no-underline transition-colors">
            <IconHome className="size-[18px]" />
            Volver a la plataforma
          </a>
        </div>
      </aside>
      <main className="ml-[232px] flex-1 min-h-screen print:ml-0">
        <div className="max-w-[1160px] mx-auto px-8 py-8 print:px-0 print:py-0">{children}</div>
      </main>
    </div>
  );
}

function NavItem({ to, active, icon, children }: { to: string; active: boolean; icon: ReactNode; children: ReactNode }) {
  return (
    <Link to={to} aria-current={active ? 'page' : undefined}
      className={`flex items-center gap-2.5 h-9 px-3 rounded-[8px] text-[14px] no-underline transition-colors ${active ? 'bg-clay-surface-elevated text-txt font-medium' : 'text-txt-secondary hover:bg-clay-surface-hover hover:text-txt'}`}>
      <span className={active ? 'text-txt' : 'text-txt-muted'}>{icon}</span>
      {children}
    </Link>
  );
}
