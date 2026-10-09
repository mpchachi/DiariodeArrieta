import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import type { Patient, Session } from '../../data/types';
import { getPatient, getSessions } from '../../data/api';
import { AnatomyModel } from './AnatomyModel';
import { Card } from '../../components/Card';

export default function Anatomy3DPage() {
  const { id } = useParams<{ id: string }>();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);

  useEffect(() => {
    if (!id) return;
    getPatient(id).then(p => setPatient(p ?? null));
    getSessions(id).then(s => setSessions(s.sort((a, b) => a.date.localeCompare(b.date))));
  }, [id]);

  if (!patient || sessions.length === 0) return <div className="text-clay-text-muted p-8">Cargando...</div>;

  const lastSession = sessions[sessions.length - 1];

  return (
    <div>
      <div className="mb-4">
        <Link to={`/patient/${id}`} className="text-sm text-clay-distal hover:underline">← Volver al paciente</Link>
      </div>
      <h1 className="text-2xl font-bold text-clay-text mb-2">Modelo anatómico 3D</h1>
      <p className="text-sm text-clay-text-secondary mb-4">{patient.pseudonym} · {patient.subjectType === 'healthy' ? 'Voluntario sano' : `Lado afecto: ${patient.affectedSide ? (patient.affectedSide === 'left' ? 'Izquierdo' : 'Derecho') : 'No consta'}`}</p>

      <Card>
        <AnatomyModel derived={lastSession.derived} affectedSide={patient.affectedSide ?? 'right'} />
      </Card>
    </div>
  );
}
