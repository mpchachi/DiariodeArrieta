import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../../store/useStore';
import { useReportStore } from '../../store/reportStore';
import { Card } from '../../components/Card';
import type { ReportSection, GeneratedReport } from '../../data/reportTypes';

type Tab = 'generar' | 'historial';

const ALL_SECTIONS: { id: ReportSection; label: string }[] = [
  { id: 'summary', label: 'Resumen' },
  { id: 'domain-scores', label: 'Puntuaciones por dominio' },
  { id: 'clinical-flags', label: 'Alertas clínicas' },
  { id: 'rehab-correlation', label: 'Correlación de rehabilitación' },
  { id: 'predictions', label: 'Predicciones' },
  { id: 'telemetry', label: 'Telemetría' },
];

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ─── Tab: Generar ────────────────────────────────────────────────────────────

function GenerarTab() {
  const patients = useStore((s) => s.patients);
  const templates = useReportStore((s) => s.templates);
  const addReport = useReportStore((s) => s.addReport);

  const [selectedPatients, setSelectedPatients] = useState<string[]>([]);
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [selectedSections, setSelectedSections] = useState<ReportSection[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [language, setLanguage] = useState<'es' | 'en'>('es');
  const [showDropdown, setShowDropdown] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [generatedPreview, setGeneratedPreview] = useState<GeneratedReport | null>(null);

  const visibleSections = ALL_SECTIONS;

  function togglePatient(id: string) {
    setSelectedPatients((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  }

  function toggleSection(id: ReportSection) {
    setSelectedSections((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  }

  function handleTemplateChange(templateId: string) {
    setSelectedTemplate(templateId);
    if (templateId) {
      const tpl = templates.find((t) => t.id === templateId);
      if (tpl) {
        const sections = tpl.sections;
        setSelectedSections(sections);
      }
    }
  }

  function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (selectedPatients.length === 0 || selectedSections.length === 0) return;

    const patientId = selectedPatients[0];
    const report: GeneratedReport = {
      id: `rep-${uid()}`,
      patientId,
      date: new Date().toISOString().slice(0, 10),
      templateId: selectedTemplate || 'custom',
      language,
      sections: selectedSections,
    };
    addReport(report);
    setGeneratedPreview(report);
    setSuccessMsg('Informe generado correctamente.');
    setTimeout(() => setSuccessMsg(''), 4000);
  }

  const previewPatient = generatedPreview
    ? patients.find((p) => p.id === generatedPreview.patientId)
    : null;

  return (
    <div className="space-y-6">
      <form onSubmit={handleGenerate} className="space-y-5">
        {/* Patient multi-select */}
        <div className="relative">
          <label className="block text-sm font-medium text-txt mb-1">Pacientes</label>
          <button
            type="button"
            onClick={() => setShowDropdown(!showDropdown)}
            className="w-full text-left px-4 py-2.5 rounded-xl border-[2.5px] border-clay-border bg-clay-surface-elevated text-sm text-txt shadow-clay-inset"
          >
            {selectedPatients.length === 0
              ? 'Seleccionar pacientes...'
              : `${selectedPatients.length} paciente(s) seleccionado(s)`}
          </button>
          {showDropdown && (
            <div className="absolute z-20 mt-1 w-full max-h-52 overflow-y-auto rounded-xl border-[2.5px] border-clay-border bg-clay-surface-solid shadow-clay p-2 space-y-1">
              {patients.map((p) => (
                <label
                  key={p.id}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-clay-surface-elevated cursor-pointer text-sm text-txt"
                >
                  <input
                    type="checkbox"
                    checked={selectedPatients.includes(p.id)}
                    onChange={() => togglePatient(p.id)}
                    className="accent-accent w-4 h-4"
                  />
                  {p.pseudonym}
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Date range */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-txt mb-1">Fecha de inicio</label>
            <input
              type="date"
              value={dateStart}
              onChange={(e) => setDateStart(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border-[2.5px] border-clay-border bg-clay-surface-elevated text-sm text-txt shadow-clay-inset"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-txt mb-1">Fecha de fin</label>
            <input
              type="date"
              value={dateEnd}
              onChange={(e) => setDateEnd(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border-[2.5px] border-clay-border bg-clay-surface-elevated text-sm text-txt shadow-clay-inset"
            />
          </div>
        </div>

        {/* Template selector */}
        <div>
          <label className="block text-sm font-medium text-txt mb-1">Plantilla</label>
          <select
            value={selectedTemplate}
            onChange={(e) => handleTemplateChange(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl border-[2.5px] border-clay-border bg-clay-surface-elevated text-sm text-txt shadow-clay-inset"
          >
            <option value="">Selección manual</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        {/* Section checklist */}
        <div>
          <label className="block text-sm font-medium text-txt mb-2">Secciones</label>
          <div className="grid grid-cols-2 gap-2">
            {visibleSections.map((sec) => (
              <label
                key={sec.id}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border-[2.5px] border-clay-border bg-clay-surface-elevated shadow-clay-inset cursor-pointer text-sm text-txt hover:border-accent/30 transition-colors"
              >
                <input
                  type="checkbox"
                  checked={selectedSections.includes(sec.id)}
                  onChange={() => toggleSection(sec.id)}
                  className="accent-accent w-4 h-4"
                />
                {sec.label}
              </label>
            ))}
          </div>
        </div>

        {/* Language toggle */}
        <div>
          <label className="block text-sm font-medium text-txt mb-1">Idioma</label>
          <div className="inline-flex rounded-xl border-[2.5px] border-clay-border overflow-hidden">
            <button
              type="button"
              onClick={() => setLanguage('es')}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                language === 'es'
                  ? 'bg-accent text-white'
                  : 'bg-clay-surface-elevated text-txt-secondary hover:text-txt'
              }`}
            >
              ES
            </button>
            <button
              type="button"
              onClick={() => setLanguage('en')}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                language === 'en'
                  ? 'bg-accent text-white'
                  : 'bg-clay-surface-elevated text-txt-secondary hover:text-txt'
              }`}
            >
              EN
            </button>
          </div>
        </div>

        {/* Generate button */}
        <button
          type="submit"
          disabled={selectedPatients.length === 0 || selectedSections.length === 0}
          className="px-6 py-3 rounded-xl bg-accent text-white font-bold text-sm shadow-clay hover:shadow-clay-hover transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Generar
        </button>

        {successMsg && (
          <p className="text-sm font-medium text-ok">{successMsg}</p>
        )}
      </form>

      {/* Preview */}
      {generatedPreview && previewPatient && (
        <Card className="space-y-3">
          <h3 className="font-display text-lg font-bold text-txt">Vista previa</h3>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-txt-secondary">Paciente:</span>
            <span className="font-medium text-txt">{previewPatient.pseudonym}</span>
            <span className="text-txt-muted">|</span>
            <span className="text-txt-secondary">Fecha:</span>
            <span className="font-medium text-txt">{generatedPreview.date}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {generatedPreview.sections.map((sec) => (
              <span
                key={sec}
                className="px-3 py-1 rounded-lg bg-accent/10 text-accent text-xs font-medium border border-accent/20"
              >
                {ALL_SECTIONS.find((s) => s.id === sec)?.label ?? sec}
              </span>
            ))}
            <span className="px-3 py-1 rounded-lg bg-warning/10 text-warning text-xs font-medium border border-warning/20">
              datos seudonimizados
            </span>
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            className="mt-2 px-5 py-2 rounded-xl border-[2.5px] border-accent/30 text-accent text-sm font-bold hover:bg-accent/5 transition-colors"
          >
            Exportar PDF
          </button>
          <p className="text-xs text-txt-muted italic mt-2">
            Apoyo a la visualización, no diagnóstico.
          </p>
        </Card>
      )}
    </div>
  );
}

// ─── Tab: Historial ──────────────────────────────────────────────────────────

function HistorialTab() {
  const history = useReportStore((s) => s.history);
  const patients = useStore((s) => s.patients);
  const templates = useReportStore((s) => s.templates);
  const navigate = useNavigate();

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left border-b-[2.5px] border-clay-border">
            <th className="py-3 px-3 text-txt-muted font-medium">Fecha</th>
            <th className="py-3 px-3 text-txt-muted font-medium">Paciente</th>
            <th className="py-3 px-3 text-txt-muted font-medium">Plantilla</th>
            <th className="py-3 px-3 text-txt-muted font-medium">Idioma</th>
            <th className="py-3 px-3 text-txt-muted font-medium">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {history.map((r) => {
            const pat = patients.find((p) => p.id === r.patientId);
            const tpl = templates.find((t) => t.id === r.templateId);
            return (
              <tr
                key={r.id}
                className="border-b border-clay-border/50 hover:bg-clay-surface-elevated/50 transition-colors"
              >
                <td className="py-3 px-3 tabular-nums text-txt">{r.date}</td>
                <td className="py-3 px-3 text-txt font-medium">{pat?.pseudonym ?? r.patientId}</td>
                <td className="py-3 px-3 text-txt-secondary">{tpl?.name ?? r.templateId}</td>
                <td className="py-3 px-3">
                  <span className="px-2 py-0.5 rounded-md bg-accent/10 text-accent text-xs font-medium uppercase">
                    {r.language}
                  </span>
                </td>
                <td className="py-3 px-3">
                  <button
                    type="button"
                    onClick={() => navigate(`/patient/${r.patientId}/report`)}
                    className="px-3 py-1.5 rounded-lg border-[2.5px] border-clay-border text-xs text-txt-secondary hover:text-accent hover:border-accent/30 transition-colors"
                  >
                    Ver
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {history.length === 0 && (
        <p className="text-center text-txt-muted py-8 text-sm">No hay informes en el historial.</p>
      )}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string }[] = [
  { id: 'generar', label: 'Generar' },
  { id: 'historial', label: 'Historial' },
];

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('generar');
  const { loaded, load } = useStore();

  useEffect(() => {
    if (!loaded) load();
  }, [loaded, load]);

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold text-txt">Informes</h1>

      {/* Tab bar */}
      <div className="flex gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-5 py-2.5 rounded-xl text-sm transition-all ${
              activeTab === tab.id
                ? 'bg-clay-surface-solid shadow-clay border-2 border-accent/20 text-accent font-bold'
                : 'text-txt-muted border-2 border-transparent hover:text-txt'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'generar' && <GenerarTab />}
        {activeTab === 'historial' && <HistorialTab />}
      </div>
    </div>
  );
}
