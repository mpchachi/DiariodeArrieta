import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { CohortView } from '../features/cohort/CohortView';
import { PatientDetail } from '../features/patient/PatientDetail';
import { RehabCorrelation } from '../features/rehab/RehabCorrelation';
import { PredictionsView } from '../features/predictions/PredictionsView';
import { AnalyticsView } from '../features/analytics/AnalyticsView';
import { ReportView } from '../features/reporting/ReportView';

const Anatomy3DPage = lazy(() => import('../features/anatomy3d/Anatomy3DPage'));
const ExercisesPage = lazy(() => import('../features/rehab/ExercisesPage'));
const ReportsPage = lazy(() => import('../features/reporting/ReportsPage'));

function Loading() {
  return <div className="flex items-center justify-center h-32 text-txt-muted">Cargando...</div>;
}

export function Router() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <Layout>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={<CohortView />} />
            <Route path="/exercises" element={<ExercisesPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/patient/:id" element={<PatientDetail />} />
            <Route path="/patient/:id/predictions" element={<PredictionsView />} />
            <Route path="/patient/:id/rehab" element={<RehabCorrelation />} />
            <Route path="/patient/:id/anatomy" element={<Anatomy3DPage />} />
            <Route path="/patient/:id/report" element={<ReportView />} />
            <Route path="/analytics" element={<AnalyticsView />} />
          </Routes>
        </Suspense>
      </Layout>
    </BrowserRouter>
  );
}
