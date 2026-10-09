import gsap from 'gsap';
import { createSubject } from '../database/subjects.js';
import { mountShell } from './shell.js';

// Alta de paciente: formulario por secciones (título y explicación a la izquierda, campos a
// la derecha), con selectores de botón en vez de desplegables. Los datos clínicos (solo
// pacientes) se guardan en subjects.patient_data y los usa la ficha del dashboard.
const NOW = new Date();
const MAX_YEAR = Math.min(NOW.getFullYear(), 2025); // límite del esquema (birth_year ≤ 2025)
const thisMonth = `${NOW.getFullYear()}-${String(NOW.getMonth() + 1).padStart(2, '0')}`;

const choice = (name, options, { value = null, required = true } = {}) => `
  <div class="nf-choice" role="radiogroup" data-name="${name}">
    ${options.map(([v, label, hint]) => `
      <label class="nf-option${hint ? ' has-hint' : ''}">
        <input type="radio" name="${name}" value="${v}"${v === value ? ' checked' : ''}${required ? ' required' : ''} />
        <span class="nf-option-label">${label}</span>
        ${hint ? `<span class="nf-option-hint">${hint}</span>` : ''}
      </label>`).join('')}
  </div>`;

export function showCreateSubject(container, onCreated, onCancel) {
  // Misma estructura que la lista (barra lateral + cabecera); volver a Pacientes o ir al Foro cancela el alta.
  const shell = mountShell(container, {
    active: 'pacientes', crumbs: ['Plataforma', 'Pacientes', 'Nuevo paciente'],
    onNavigate: tab => { if (tab === 'foro') history.replaceState(null, '', '#foro'); cancel(); },
  });
  shell.main.innerHTML = `
      <div class="ui-page nf-main">
        <div class="ui-page-head">
          <div>
            <h1>Nuevo paciente</h1>
            <p>Registra a un paciente o a un voluntario sano para el grupo de referencia.</p>
          </div>
        </div>

        <form id="create-subject-form" class="nf-form" novalidate>
          <section class="nf-section">
            <div class="nf-aside">
              <h2>Identificación</h2>
              <p>Usa un pseudónimo o unas iniciales: no hace falta el nombre completo.</p>
            </div>
            <div class="nf-fields">
              <label class="nf-field nf-span-2">
                <span class="nf-label">Nombre o pseudónimo</span>
                <input type="text" id="display-name" maxlength="60" autocomplete="off" required />
              </label>
              <label class="nf-field">
                <span class="nf-label">Año de nacimiento</span>
                <input type="number" id="birth-year" inputmode="numeric" min="1920" max="${MAX_YEAR}" required />
                <span class="nf-help" data-role="age">&nbsp;</span>
              </label>
              <div class="nf-field">
                <span class="nf-label">Sexo</span>
                ${choice('sex', [['female', 'Mujer'], ['male', 'Hombre'], ['other', 'Otro']])}
              </div>
            </div>
          </section>

          <section class="nf-section">
            <div class="nf-aside">
              <h2>Perfil</h2>
              <p>Los voluntarios sanos forman el grupo de referencia con el que se comparan los pacientes.</p>
            </div>
            <div class="nf-fields">
              <div class="nf-field nf-span-2">
                <span class="nf-label">Tipo</span>
                ${choice('subject-type', [
                  ['patient', 'Paciente', 'En rehabilitación tras un ictus.'],
                  ['healthy', 'Voluntario sano', 'Sin patología motora; datos de referencia.'],
                ], { value: 'healthy' })}
              </div>
              <div class="nf-field nf-span-2">
                <span class="nf-label">Mano dominante</span>
                ${choice('dominant-hand', [['right', 'Derecha'], ['left', 'Izquierda'], ['ambidextrous', 'Ambidiestro']])}
              </div>
            </div>
          </section>

          <section class="nf-section" data-role="clinical">
            <div class="nf-aside">
              <h2>Datos clínicos</h2>
              <p>Se muestran en la ficha del dashboard: días desde el ictus, lado afectado y movilidad.</p>
            </div>
            <div class="nf-fields">
              <div class="nf-field nf-span-2">
                <span class="nf-label">Lado afectado</span>
                ${choice('affected-side', [['left', 'Izquierdo'], ['right', 'Derecho']])}
              </div>
              <label class="nf-field">
                <span class="nf-label">Fecha del ictus</span>
                <input type="month" id="stroke-date" min="1990-01" max="${thisMonth}" required />
                <span class="nf-help">Mes y año aproximados.</span>
              </label>
              <div class="nf-field nf-span-2">
                <span class="nf-label">Movilidad</span>
                ${choice('mobility', [
                  ['agile', 'Ágil', 'Se mueve con soltura.'],
                  ['moderate', 'Moderada', 'Algo de limitación.'],
                  ['reduced', 'Reducida', 'Limitación importante.'],
                ], { value: 'moderate' })}
              </div>
            </div>
          </section>

          <section class="nf-section">
            <div class="nf-aside">
              <h2>Notas</h2>
              <p>Opcional. Lo que ayude al equipo a interpretar las sesiones.</p>
            </div>
            <div class="nf-fields">
              <label class="nf-field nf-span-2">
                <span class="nf-label">Notas <span class="nf-optional">(opcional)</span></span>
                <textarea id="notes" rows="3" maxlength="2000"></textarea>
              </label>
            </div>
          </section>

          <footer class="nf-footer">
            <p id="form-error" class="nf-error" role="alert"></p>
            <button type="button" class="ui-btn ui-btn-outline" data-action="cancel">Cancelar</button>
            <button type="submit" class="ui-btn ui-btn-primary nf-submit">Registrar paciente</button>
          </footer>
        </form>
      </div>
  `;

  const screen = shell.root;
  const form = document.getElementById('create-subject-form');
  const errorEl = document.getElementById('form-error');
  const btn = form.querySelector('.nf-submit');
  const clinical = form.querySelector('[data-role="clinical"]');
  const yearEl = document.getElementById('birth-year');
  const ageEl = form.querySelector('[data-role="age"]');
  const val = name => form.querySelector(`input[name="${name}"]:checked`)?.value ?? null;

  gsap.fromTo(screen, { opacity: 0 }, { opacity: 1, duration: 0.3 });
  document.getElementById('display-name').focus();

  // Datos clínicos solo para pacientes.
  const syncType = () => {
    const isPatient = val('subject-type') === 'patient';
    clinical.hidden = !isPatient;
    clinical.querySelectorAll('input').forEach(i => { i.disabled = !isPatient; });
    btn.textContent = isPatient ? 'Registrar paciente' : 'Registrar voluntario';
  };
  form.querySelectorAll('input[name="subject-type"]').forEach(i => i.addEventListener('change', syncType));
  syncType();

  yearEl.addEventListener('input', () => {
    const y = parseInt(yearEl.value, 10);
    ageEl.textContent = y >= 1920 && y <= MAX_YEAR ? `${NOW.getFullYear() - y} años` : '\u00a0';
  });

  function cancel() { gsap.to(screen, { opacity: 0, duration: 0.2, onComplete: () => { shell.dispose(); onCancel(); } }); }
  form.querySelectorAll('[data-action="cancel"]').forEach(b => b.addEventListener('click', cancel));

  const fail = (msg, el) => {
    errorEl.textContent = msg;
    el?.closest('.nf-field')?.classList.add('is-invalid');
    (el?.matches?.('input[type="radio"]') ? el : el)?.focus?.();
  };
  // Al corregir un campo se quitan su marca roja y el mensaje de error.
  const clearError = el => { const f = el.closest('.nf-field'); if (f?.classList.contains('is-invalid')) { f.classList.remove('is-invalid'); errorEl.textContent = ''; } };
  form.addEventListener('input', e => clearError(e.target));
  form.addEventListener('change', e => clearError(e.target));

  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (btn.disabled) return;
    errorEl.textContent = '';
    form.querySelectorAll('.is-invalid').forEach(f => f.classList.remove('is-invalid'));

    const name = document.getElementById('display-name');
    const year = parseInt(yearEl.value, 10);
    const isPatient = val('subject-type') === 'patient';
    if (!name.value.trim()) return fail('Escribe un nombre o pseudónimo.', name);
    if (!(year >= 1920 && year <= MAX_YEAR)) return fail(`El año de nacimiento debe estar entre 1920 y ${MAX_YEAR}.`, yearEl);
    for (const [n, msg] of [['sex', 'Indica el sexo.'], ['dominant-hand', 'Indica la mano dominante.']]) {
      if (!val(n)) return fail(msg, form.querySelector(`input[name="${n}"]`));
    }
    const strokeDate = document.getElementById('stroke-date');
    if (isPatient) {
      if (!val('affected-side')) return fail('Indica el lado afectado.', form.querySelector('input[name="affected-side"]'));
      if (!strokeDate.value || strokeDate.value > thisMonth) return fail('Indica el mes y el año del ictus.', strokeDate);
    }

    btn.disabled = true;
    const result = await createSubject({
      displayName: name.value.trim(),
      birthYear: year,
      sex: val('sex'),
      dominantHand: val('dominant-hand'),
      subjectType: isPatient ? 'patient' : 'healthy',
      notes: document.getElementById('notes').value.trim() || null,
      patientData: isPatient ? {
        affectedSide: val('affected-side'),
        strokeDate: `${strokeDate.value}-01`, mobility: val('mobility'),
      } : null,
    });

    if (result.ok) {
      gsap.to(screen, { opacity: 0, duration: 0.25, onComplete: () => { shell.dispose(); onCreated(result.subject); } });
    } else {
      btn.disabled = false;
      errorEl.textContent = 'No se ha podido registrar. Revisa la conexión e inténtalo de nuevo.';
    }
  });
}
