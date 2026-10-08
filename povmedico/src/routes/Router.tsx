import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { CohortView } from '../features/cohort/CohortView';
import { PatientDetail } from '../features/patient/PatientDetail';
import { RehabCorrelation } from '../features/rehab/RehabCorrelation';
import { PredictionsView } from '../features/predictions/PredictionsView';
import { AnalyticsView } from '../features/analytics/AnalyticsView';
import { ReportView } from '../features/reporting/ReportView';
import { supabase } from '../data/supabaseClient';

const Anatomy3DPage = lazy(() => import('../features/anatomy3d/Anatomy3DPage'));
const ExercisesPage = lazy(() => import('../features/rehab/ExercisesPage'));
const ReportsPage = lazy(() => import('../features/reporting/ReportsPage'));

// URL de la app del operador (misma constante que «Volver al Operador» en Layout).
const OPERATOR_URL = import.meta.env.BASE_URL.replace(/dashboard\/$/, '');

function Loading() {
  return <div className="flex items-center justify-center h-32 text-txt-muted">Cargando...</div>;
}

// Captura errores de render para no dejar la pantalla en blanco.
class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('Error en el dashboard:', error instanceof Error ? error.message : error);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="p-8 text-center">
        <h1 className="text-lg font-semibold text-txt mb-2">Algo ha fallado al mostrar esta pantalla</h1>
        <p className="text-sm text-txt-secondary mb-4">Prueba a volver al inicio. Si se repite, avisa al equipo.</p>
        <Link to="/" className="text-accent text-sm font-medium">Volver al inicio</Link>
      </div>
    );
  }
}

// Sin sesión de Supabase no se muestra nada: hay que entrar por la app del operador.
function RequireAuth({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAuthed(!!data.session)).catch(() => setAuthed(false));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setAuthed(!!session));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (authed === undefined) return <Loading />;
  if (!authed) {
    return (
      <div className="p-8 text-center">
        <h1 className="text-lg font-semibold text-txt mb-2">Inicia sesión en la app del operador</h1>
        <p className="text-sm text-txt-secondary mb-4">El panel médico usa la misma sesión que la app del operador.</p>
        <a href={OPERATOR_URL} className="text-accent text-sm font-medium">Ir a la app del operador</a>
      </div>
    );
  }
  return <>{children}</>;
}

export function Router() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <Layout>
        <ErrorBoundary>
          <RequireAuth>
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
          </RequireAuth>
        </ErrorBoundary>
      </Layout>
    </BrowserRouter>
  );
}
