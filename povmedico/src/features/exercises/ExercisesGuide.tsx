import { CHAPTERS, CHAPTER_ORDER, measuresOf, QUALITY_MEASURE } from '../../data/measures';
import { DIMENSIONS, MEASUREMENT_VERSION } from '../../data/comparability';
import { PageHeader, Panel } from '../../components/ui';
import { QUALITY_MIN, INACTIVE_DAYS } from '../patients/shared';

// Guía de referencia: qué hace el paciente en cada ejercicio, qué movimiento se evalúa y
// cómo se obtiene cada medida que aparece en las fichas. Se genera del mismo catálogo que
// usan las fichas, así que no puede describir medidas que el panel no muestra.
export function ExercisesGuide() {
  return (
    <div>
      <PageHeader
        title="Ejercicios y medidas"
        description="El viaje del zorro son tres ejercicios seguidos (unos 2 minutos de juego; unos 3 con las explicaciones) que el paciente hace en casa con la cámara del ordenador. Aquí se explica qué se pide en cada uno y cómo se obtiene cada medida de las fichas."
      />

      <div className="grid gap-4 lg:grid-cols-2 mb-6">
        <Panel title="Condiciones para una medición fiable">
          <ul className="list-disc pl-5 space-y-1.5 text-[14px] text-txt-secondary">
            <li>Sentado a una mesa, con el ordenador delante y a unos 50–70 cm de la cámara.</li>
            <li>La mano a la altura de la pantalla, entera dentro de la imagen y con la palma o el puño hacia la cámara.</li>
            <li>Luz frontal o lateral; evitar una ventana detrás del paciente.</li>
            <li>Una sola mano en la imagen. Al empezar se elige con qué mano se juega; el huerto adapta el sentido del giro a esa mano.</li>
          </ul>
          <p className="mt-3 text-[13px] text-txt-muted">Antes de empezar, la plataforma comprueba el encuadre («Coloca la mano») y cada juego enseña el gesto con una mano animada.</p>
        </Panel>
        <Panel title="Cómo interpretar las cifras">
          <ul className="list-disc pl-5 space-y-1.5 text-[14px] text-txt-secondary">
            <li>Están pensadas para <strong className="font-semibold text-txt">seguir la evolución del mismo paciente</strong>, no para compararlo con otros ni con valores normativos.</li>
            <li>Se calculan sobre vídeo 2D (MediaPipe Hands, ≈ 30 fps). Las distancias en mm son estimadas suponiendo una palma de 9,5 cm.</li>
            <li>No son una escala clínica validada (FMA-UE, ARAT) ni un diagnóstico.</li>
            <li>{QUALITY_MEASURE.meaning}</li>
          </ul>
        </Panel>
      </div>

      <div className="space-y-6">
        {CHAPTER_ORDER.map(c => {
          const ch = CHAPTERS[c];
          return (
            <Panel key={c} padded={false}
              title={<span className="flex items-center gap-2"><span className="size-2 rounded-full" style={{ background: ch.colorVar }} aria-hidden />{ch.order}. {DIMENSIONS[c]} · {ch.title}</span>}
              description={ch.structure}>
              <div className="grid gap-4 md:grid-cols-2 px-5 py-4 border-b border-clay-border text-[14px]">
                <div><p className="text-[12px] text-txt-muted mb-1">Qué hace el paciente</p><p className="text-txt-secondary">{ch.patientAction}</p></div>
                <div><p className="text-[12px] text-txt-muted mb-1">Movimiento que se evalúa</p><p className="text-txt-secondary">{ch.movement}</p></div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[14px]">
                  <thead>
                    <tr className="text-left text-[12px] text-txt-muted border-b border-clay-border">
                      <th className="font-medium px-5 py-2.5 w-[24%]">Medida</th>
                      <th className="font-medium px-3 py-2.5 w-[8%]">Unidad</th>
                      <th className="font-medium px-3 py-2.5">Qué indica</th>
                      <th className="font-medium px-5 py-2.5">Cómo se obtiene</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-clay-border align-top">
                    {measuresOf(c).map(m => (
                      <tr key={m.id}>
                        <td className="px-5 py-3 font-medium text-txt">{m.label}</td>
                        <td className="px-3 py-3 text-txt-secondary">{m.unit || (m.text ? 'n de N' : '—')}</td>
                        <td className="px-3 py-3 text-txt-secondary">{m.meaning}</td>
                        <td className="px-5 py-3 text-txt-muted">{m.how}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          );
        })}

        <Panel title="Condiciones de captura y comparabilidad">
          <p className="text-[14px] text-txt-secondary mb-2">Una mano detectada no garantiza medidas exactas. La versión {MEASUREMENT_VERSION} conserva muestras escalares, fase, oportunidad, incidencias y configuración, sin imágenes ni vídeo.</p>
          <ul className="list-disc pl-5 space-y-1.5 text-[14px] text-txt-secondary">
            <li>El tutorial y la preparación quedan separados del juego autónomo.</li>
            <li>Una oportunidad no completada conserva las medidas disponibles. Si no hay señal utilizable, no se rellena con cero.</li>
            <li>Las medidas usan datos actuales de la mano elegida; un valor mantenido por el filtro no es una muestra nueva.</li>
            <li>Los cambios solo se calculan entre versiones, manos, métodos, configuraciones, resoluciones y secuencias de ayuda equivalentes.</li>
            <li>De forma conservadora se bloquea la comparación automática si hay muestras autónomas no utilizables, huecos de más de 250 ms, truncamiento o ejercicios interrumpidos. Son controles técnicos, no umbrales clínicos.</li>
          </ul>
          <p className="mt-3 text-[13px] text-txt-muted">Las sesiones antiguas se conservan sin recalcular. La compatibilidad registrada no garantiza igual postura, esfuerzo o cámara física. No se han establecido valores normativos ni cambio mínimo detectable.</p>
        </Panel>

        <Panel title="Avisos de la lista de pacientes">
          <p className="text-[14px] text-txt-secondary mb-2">Son avisos sobre la calidad o la regularidad de los datos, no alertas clínicas:</p>
          <ul className="list-disc pl-5 space-y-1.5 text-[14px] text-txt-secondary">
            <li><strong className="font-semibold text-txt">Mano poco detectada:</strong> la mano se vio menos del {QUALITY_MIN} % del tiempo en la última sesión.</li>
            <li><strong className="font-semibold text-txt">Captura a revisar:</strong> incidencias del registro, no una conclusión sobre el estado motor de la persona.</li>
            <li><strong className="font-semibold text-txt">Viaje incompleto:</strong> se saltó o no se terminó algún ejercicio.</li>
            <li><strong className="font-semibold text-txt">Días sin jugar:</strong> han pasado más de {INACTIVE_DAYS} días desde la última sesión.</li>
          </ul>
        </Panel>
      </div>
    </div>
  );
}
