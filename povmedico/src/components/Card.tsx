import type { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
  hover?: boolean;
}

export function Card({ children, className = '', style, onClick, hover = false }: CardProps) {
  return (
    <div
      onClick={onClick}
      // Si es clicable, también accesible por teclado.
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
      style={style}
      className={`bg-clay-surface-solid rounded-2xl border border-clay-border shadow-clay p-5 transition-all duration-300 animate-[fadeInUp_0.4s_ease-out_both] ${hover ? 'hover:shadow-clay-hover hover:-translate-y-1 active:scale-[0.98] cursor-pointer' : ''} ${onClick ? 'cursor-pointer' : ''} ${className}`}
    >
      {children}
    </div>
  );
}
