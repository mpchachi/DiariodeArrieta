import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { PatientsPage } from '../features/patients/PatientsPage';
import { PatientPage } from '../features/patients/PatientPage';
import { PatientReport } from '../features/reporting/PatientReport';
import { ExercisesGuide } from '../features/exercises/ExercisesGuide';

// Pantallas del panel clínico. Las antiguas (predicciones, correlación con ejercicios
// prescritos, anatomía 3D, analítica de cohorte y generador de informes) se retiraron:
// mostraban datos simulados o calculados sin base suficiente. Sus rutas redirigen.
export function Router() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <Layout>
        <Routes>
          <Route path="/" element={<PatientsPage />} />
          <Route path="/patient/:id" element={<PatientPage />} />
          <Route path="/patient/:id/report" element={<PatientReport />} />
          <Route path="/exercises" element={<ExercisesGuide />} />
          <Route path="/patient/:id/*" element={<Navigate to=".." relative="path" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
