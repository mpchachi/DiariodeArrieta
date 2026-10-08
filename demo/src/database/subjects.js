import { supabase } from './supabaseClient.js';

// patientData (solo pacientes): { affectedSide, strokeType, strokeDate, mobility } — lo lee el dashboard.
export async function createSubject({ displayName, birthYear, sex, dominantHand, subjectType = 'healthy', notes = null, patientData = null }) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not authenticated' };

  const { data, error } = await supabase
    .from('subjects')
    .insert({
      operator_id: user.id,
      display_name: displayName,
      birth_year: birthYear,
      sex,
      dominant_hand: dominantHand,
      subject_type: subjectType,
      patient_data: subjectType === 'patient' ? patientData : null,
      notes,
    })
    .select()
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, subject: data };
}

export async function listSubjects() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('subjects')
    .select('*')
    .eq('is_active', true)
    // Sin filtro por médico: la base de datos (RLS) ya devuelve los pacientes del equipo.
    .order('created_at', { ascending: false });

  if (error) return [];
  // Los pacientes de demostración (patient_data.demo) solo se ven en el dashboard, no en la
  // lista del operador: aquí solo aparecen los creados a mano desde la interfaz.
  return data.filter(s => s.patient_data?.demo !== true);
}

export async function getSubject(subjectId) {
  const { data } = await supabase
    .from('subjects')
    .select('*')
    .eq('id', subjectId)
    .single();
  return data;
}

export async function deactivateSubject(subjectId) {
  const { error } = await supabase
    .from('subjects')
    .update({ is_active: false })
    .eq('id', subjectId);
  return !error;
}
