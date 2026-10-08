export interface ExerciseCatalogItem {
  id: string;
  name: string;
  domain: 'proximal-grip' | 'distal-flex-ext' | 'prono-supination';
  description: string;
  suggestedIntensity: 'low' | 'medium' | 'high';
  reps: string;
}

export type ReportSection =
  | 'summary'
  | 'domain-scores'
  | 'clinical-flags'
  | 'rehab-correlation'
  | 'predictions'
  | 'telemetry';

export interface ReportTemplate {
  id: string;
  name: string;
  sections: ReportSection[];
}

export interface GeneratedReport {
  id: string;
  patientId: string;
  date: string;
  templateId: string;
  language: 'es' | 'en';
  sections: ReportSection[];
}

export interface ScheduledReport {
  id: string;
  patientId: string | null;
  frequency: 'weekly' | 'biweekly' | 'monthly';
  recipient: string;
  templateId: string;
  active: boolean;
}
