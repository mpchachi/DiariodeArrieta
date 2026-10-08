import { create } from 'zustand';
import type { ReportTemplate, GeneratedReport, ScheduledReport } from '../data/reportTypes';

interface ReportStore {
  templates: ReportTemplate[];
  history: GeneratedReport[];
  scheduled: ScheduledReport[];

  addTemplate: (t: ReportTemplate) => void;
  updateTemplate: (id: string, t: Partial<ReportTemplate>) => void;
  removeTemplate: (id: string) => void;

  addReport: (r: GeneratedReport) => void;

  addScheduled: (s: ScheduledReport) => void;
  updateScheduled: (id: string, s: Partial<ScheduledReport>) => void;
  removeScheduled: (id: string) => void;
  toggleScheduled: (id: string) => void;
}

const defaultTemplates: ReportTemplate[] = [
  { id: 'tpl-01', name: 'Seguimiento semanal', sections: ['summary', 'domain-scores', 'clinical-flags'] },
  { id: 'tpl-02', name: 'Informe de alta', sections: ['summary', 'domain-scores', 'clinical-flags', 'rehab-correlation', 'predictions'] },
  { id: 'tpl-03', name: 'Resumen para fisioterapeuta', sections: ['summary', 'domain-scores', 'rehab-correlation', 'telemetry'] },
  { id: 'tpl-04', name: 'Informe completo', sections: ['summary', 'domain-scores', 'clinical-flags', 'rehab-correlation', 'predictions', 'telemetry'] },
];

export const useReportStore = create<ReportStore>((set) => ({
  templates: defaultTemplates,
  // Sin datos de ejemplo: el historial empieza vacío.
  history: [],
  scheduled: [],

  addTemplate: (t) => set(s => ({ templates: [...s.templates, t] })),
  updateTemplate: (id, updates) => set(s => ({
    templates: s.templates.map(t => t.id === id ? { ...t, ...updates } as ReportTemplate : t),
  })),
  removeTemplate: (id) => set(s => ({ templates: s.templates.filter(t => t.id !== id) })),

  addReport: (r) => set(s => ({ history: [r, ...s.history] })),

  addScheduled: (sc) => set(s => ({ scheduled: [...s.scheduled, sc] })),
  updateScheduled: (id, updates) => set(s => ({
    scheduled: s.scheduled.map(sc => sc.id === id ? { ...sc, ...updates } as ScheduledReport : sc),
  })),
  removeScheduled: (id) => set(s => ({ scheduled: s.scheduled.filter(sc => sc.id !== id) })),
  toggleScheduled: (id) => set(s => ({
    scheduled: s.scheduled.map(sc => sc.id === id ? { ...sc, active: !sc.active } : sc),
  })),
}));
