import { useStore } from '../../store/useStore';

export function CohortFilters() {
  const { filters, setFilter, resetFilters } = useStore();

  const selectClasses = "px-3 py-2 rounded-xl border-[2px] border-clay-border bg-clay-surface-solid text-[13px] text-txt font-medium focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent/40 transition-all cursor-pointer shadow-clay-inset";
  const hasActiveFilters = filters.mobility || filters.affectedSide || filters.strokeType || filters.onlyAlerts || filters.search;

  return (
    <div className="flex flex-wrap items-center gap-3 p-5 bg-clay-surface-solid rounded-2xl border-[2.5px] border-clay-border shadow-clay">
      <div className="relative">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3 top-1/2 -translate-y-1/2 text-txt-muted pointer-events-none">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          type="text"
          placeholder="Buscar paciente..."
          aria-label="Buscar paciente"
          value={filters.search}
          onChange={e => setFilter('search', e.target.value)}
          className="pl-10 pr-3 py-2 rounded-xl border-[2px] border-clay-border bg-clay-surface-elevated text-[13px] text-txt font-medium placeholder:text-txt-muted focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent/40 transition-all w-52 shadow-clay-inset"
        />
      </div>
      <select aria-label="Filtrar por movilidad" value={filters.mobility ?? ''} onChange={e => setFilter('mobility', e.target.value || null)} className={selectClasses}>
        <option value="">Toda la movilidad</option>
        <option value="agile">Ágil</option>
        <option value="moderate">Moderado</option>
        <option value="reduced">Reducido</option>
      </select>
      <select aria-label="Filtrar por lado afecto" value={filters.affectedSide ?? ''} onChange={e => setFilter('affectedSide', e.target.value || null)} className={selectClasses}>
        <option value="">Ambos lados</option>
        <option value="left">Izquierdo</option>
        <option value="right">Derecho</option>
      </select>
      <select aria-label="Filtrar por tipo de ictus" value={filters.strokeType ?? ''} onChange={e => setFilter('strokeType', e.target.value || null)} className={selectClasses}>
        <option value="">Tipo de ictus</option>
        <option value="ischemic">Isquémico</option>
        <option value="hemorrhagic">Hemorrágico</option>
      </select>
      <label className="flex items-center gap-2 text-[13px] text-txt-secondary font-medium cursor-pointer select-none group">
        <div className={`w-5 h-5 rounded-lg border-[2.5px] transition-all flex items-center justify-center shadow-clay-inset ${filters.onlyAlerts ? 'bg-accent border-accent' : 'border-clay-border-active group-hover:border-txt-muted'}`}>
          {filters.onlyAlerts && (
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          )}
        </div>
        <input type="checkbox" aria-label="Solo pacientes con alertas" checked={filters.onlyAlerts} onChange={e => setFilter('onlyAlerts', e.target.checked)} className="sr-only" />
        Solo alertas
      </label>
      {hasActiveFilters && (
        <button
          onClick={resetFilters}
          className="px-3 py-2 rounded-xl text-[13px] text-txt-muted font-medium hover:text-alert hover:bg-alert/8 hover:border-alert/20 border-2 border-transparent transition-all flex items-center gap-1.5"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
          Limpiar
        </button>
      )}
    </div>
  );
}
