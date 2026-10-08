import gsap from 'gsap';
import { createSubject } from '../database/subjects.js';

export function showCreateSubject(container, onCreated, onCancel) {
  container.innerHTML = `
    <div class="form-screen">
      <div class="form-card">
        <button id="cancel-btn" class="icon-button back-button" aria-label="Volver">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
        </button>
        <h2 class="form-title">Nuevo paciente</h2>
        <p class="form-subtitle">Registra un paciente o voluntario sano.</p>
        
        <form id="create-subject-form">
          <div class="input-group">
            <label for="display-name">Nombre o Pseudónimo</label>
            <input type="text" id="display-name" required placeholder="E.g. Paciente A" />
          </div>
          
          <div class="input-row">
            <div class="input-group">
              <label for="birth-year">Año de Nacimiento</label>
              <input type="number" id="birth-year" required min="1920" max="2025" placeholder="YYYY" />
            </div>
            
            <div class="input-group">
              <label for="sex">Sexo</label>
              <select id="sex" required>
                <option value="" disabled selected>Selecciona...</option>
                <option value="female">Mujer</option>
                <option value="male">Hombre</option>
                <option value="other">Otro</option>
              </select>
            </div>
          </div>

          <div class="input-row">
            <div class="input-group">
              <label for="dominant-hand">Mano Dominante</label>
              <select id="dominant-hand" required>
                <option value="" disabled selected>Selecciona...</option>
                <option value="right">Derecha (Diestro)</option>
                <option value="left">Izquierda (Zurdo)</option>
                <option value="ambidextrous">Ambidextro</option>
              </select>
            </div>
            
            <div class="input-group">
              <label for="subject-type">Tipo</label>
              <select id="subject-type" required>
                <option value="healthy" selected>Sujeto Sano (Normativo)</option>
                <option value="patient">Paciente</option>
              </select>
            </div>
          </div>
          
          <div class="input-group">
            <label for="notes">Notas (Opcional)</label>
            <textarea id="notes" rows="2" placeholder="Información clínica relevante..."></textarea>
          </div>

          <p id="form-error" class="error-message"></p>
          
          <button type="submit" class="auth-button">
            <span class="btn-text">Registrar paciente</span>
            <div class="btn-loader"></div>
          </button>
        </form>
      </div>
    </div>
  `;

  const formScreen = container.querySelector('.form-screen');
  const formCard = container.querySelector('.form-card');
  const form = document.getElementById('create-subject-form');
  const errorEl = document.getElementById('form-error');
  const btn = form.querySelector('.auth-button');

  gsap.fromTo(formScreen, { opacity: 0 }, { opacity: 1, duration: 0.4 });
  gsap.fromTo(formCard, { x: 30, opacity: 0 }, { x: 0, opacity: 1, duration: 0.5, ease: 'power3.out' });

  document.getElementById('cancel-btn').addEventListener('click', () => {
    gsap.to(formCard, { x: 30, opacity: 0, duration: 0.3 });
    gsap.to(formScreen, { opacity: 0, duration: 0.3, onComplete: onCancel });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.textContent = '';
    btn.classList.add('loading');

    const subjectData = {
      displayName: document.getElementById('display-name').value.trim(),
      birthYear: parseInt(document.getElementById('birth-year').value, 10),
      sex: document.getElementById('sex').value,
      dominantHand: document.getElementById('dominant-hand').value,
      subjectType: document.getElementById('subject-type').value,
      notes: document.getElementById('notes').value.trim() || null,
    };

    const result = await createSubject(subjectData);

    if (result.ok) {
      gsap.to(formCard, { scale: 0.95, opacity: 0, duration: 0.3 });
      gsap.to(formScreen, { 
        opacity: 0, 
        duration: 0.3, 
        delay: 0.1, 
        onComplete: () => onCreated(result.subject) 
      });
    } else {
      btn.classList.remove('loading');
      errorEl.textContent = result.error || 'Error al crear sujeto.';
      gsap.fromTo(formCard, { x: -10 }, { x: 0, duration: 0.4, ease: "elastic.out(1, 0.3)" });
    }
  });
}
