# Demo Gregorio — FixedGap

Demo de telemonitorización de rehabilitación motora post-ictus para la
presentación en el Hospital Gregorio Marañón.

El repositorio contiene **dos proyectos** que funcionan juntos:

```
demo/        # Juego 3D (Vanilla JS + Three.js + MediaPipe). El producto jugable.
povmedico/   # Panel médico (React + TS + Vite). Código fuente del dashboard clínico.
```

## Pastillero original: control de pinza asistido

El botón principal de cada sujeto es **Jugar al Pastillero**. Conserva la escena Three.js original: bandeja, geometrías y colores de pastillas, compartimentos, letras de los días, materiales e iluminación. Se ha retirado la mano 3D y se ha cambiado el control, no el entorno del juego. La sesión antigua sigue disponible mediante **Sesión anterior de 3 juegos**, con su mecánica y puntuaciones anteriores.

También se puede abrir `/pinch.html` directamente, sin autenticación ni acceso a datos clínicos. Es el mismo componente, pero sin sujeto asociado. Por ejemplo, con el servidor en el puerto 5181: `http://127.0.0.1:5181/pinch.html`.

- No hay mano 3D, puntería ni arrastre. El juego señala una pastilla de la bandeja y su compartimento. Cerrar pulgar–índice la levanta y volver a separar las yemas la traslada automáticamente al día correcto, usando la prescripción original de 17 pastillas. No se evalúa precisión espacial ni elección de medicamento.
- Elegir mano, activar cámara, separar suavemente pulgar e índice y esperar a «Listo». Pulsar Empezar inicia tres segundos de cuenta atrás. La prueba termina al completar las 17 pastillas, al pulsar Terminar o a los 90 segundos.
- El detector usa separación 2D en píxeles dividida por longitud muñeca–MCP medio, con histéresis y permanencia en milisegundos. No usa el dedo medio como sustituto del índice. La profundidad relativa se utiliza solo como comprobación heurística de superposiciones ambiguas, no como distancia clínica.
- La identidad combina lateralidad y continuidad espacial. Mano parcial, demasiado cercana/pequeña, lateral, saltos, exposición extrema o cadencia insuficiente impiden acciones. Son controles heurísticos, no una garantía de que los landmarks sean correctos.
- Al perder señal, un agarre pendiente se cancela sin depositar ni penalizar. Es necesario volver a separar los dedos antes de contar otro ciclo. No se interpolan gestos durante pérdidas.
- Los umbrales y tiempos están en `demo/src/games/pastillero/pinchConfig.js`. Son provisionales y deben probarse con personas reales; un movimiento que no los alcanza no constituye un diagnóstico. No se exige abrir todos los dedos, pero sí separar pulgar–índice para armar el gesto; una limitación motora puede requerir otro protocolo de interacción.
- Ctrl+Mayús+D o el desplegable Depuración muestra señal, umbrales, fps procesados, tiempo de procesamiento, tamaño de palma, profundidad relativa y motivo de rechazo. El tiempo de procesamiento no es una medida de latencia completa desde la exposición de cámara.

### Registro y privacidad del nuevo modo

Este modo **no usa `BiomarkerAccumulator`, no escribe en ALPHA y no sube a Supabase**. El protocolo `fixedgap-pastillero-assisted-pinch-v2` registra cobertura temporal, interrupciones, excursión normalizada, duración de los ciclos de interacción y pastillas colocadas. No se mezcla con el prototipo anterior de ocho casillas (`fixedgap-pinch-only-v1`) ni con la tarea antigua de arrastre. No calcula puntuación clínica ni equivale a las medidas de precisión espacial del juego anterior.

Los datos permanecen en memoria y se descargan solo con Exportar prueba JSON. Se incluyen versión, configuración, mano, sujeto si se abrió desde su ficha, muestras y repeticiones; opcionalmente los landmarks de la mano seleccionada para inspección técnica. Nunca imágenes ni vídeo. Al salir se pierde lo no exportado. No importar estos registros en las normas del protocolo antiguo.

MediaPipe Tasks está fijado a 0.10.35, modelo `hand_landmarker/float16/1`, servido localmente y comprobado por SHA-256. `npm run assets:pinch` descarga el modelo y copia WASM desde el paquete instalado; también se ejecuta antes de `dev` y `build`. Los artefactos generados están ignorados por Git y se incluyen en `dist/`. La inferencia intenta GPU y recurre a CPU si falla la inicialización; continúa siendo síncrona. La escena original se renderiza con un máximo de 30 fps y sombras actualizadas durante los movimientos de las pastillas. La cadencia efectiva se comprueba y no se asume que el fallback CPU sea suficientemente rápido.

### Verificación del modo pinza

Desde `demo/`:

```bash
npm ci
npm test
npx playwright install chromium
npm run test:ui
npm run build
npm run dev -- --host 127.0.0.1 --port 5181 --strictPort
```

Los tests puros cubren escala, traslación, encuadre, pulgar–medio, puño sintético, profundidad ambigua, identidad, tiempos a 15/30/60 fps, ruido y pérdida sin depósito. Los de cámara cubren permisos pendientes, modelos tardíos, liberación de recursos, fallback GPU→CPU y timestamps reales de vídeo. El test de interfaz levanta un servidor efímero y usa landmarks sintéticos inyectados solo desde Playwright: renderiza la escena original y comprueba 17 ciclos, las colocaciones en los compartimentos, falsos depósitos por pérdida, exportación aislada y tamaño de canvas en móvil. No demuestra precisión visual del modelo.

Prueba física pendiente: repetir con distintas personas/cámaras, comprobar primero la etiqueta izquierda/derecha, acercar/alejar, mostrar una mano parcial, moverla abierta, hacer pinza pulgar–medio, cerrar el puño y retirar/reintroducir la mano mientras se sostiene una pastilla. Guardar los JSON técnicos (con consentimiento si contienen datos de otra persona) y medir falsos positivos y falsos negativos; no limitarse a contar los aciertos. La exactitud en puño/oclusiones y la equivalencia entre dispositivos todavía no están validadas.

## Cómo funciona el flujo completo anterior

1. El paciente juega la secuencia de 3 ejercicios en `demo/`:
   **Pastillero → Jarra → Interruptores**.
   Se avanza con el botón "Siguiente juego" (o al completar cada ejercicio).
2. Durante el juego se capturan biomarcadores en vivo desde los landmarks de
   MediaPipe (pinza, extensión, apertura, rotación de muñeca, temblor,
   suavidad, fatiga...).
3. Al terminar, la sesión se guarda en `localStorage` como histórico del
   paciente real **ALPHA-001**.
4. Se redirige al **Panel Médico** (`/dashboard`), donde ALPHA-001 aparece el
   primero, con sus biomarcadores reales y su evolución sesión a sesión.
   El resto de pacientes son datos sintéticos de ejemplo.

> El panel médico compilado ya está incluido en `demo/public/dashboard/`, así
> que para la demo basta con arrancar `demo`.

## Arrancar la demo (lo habitual)

```bash
cd demo
npm install
npm run dev
```

Abre `http://localhost:5173`. El panel médico se sirve bajo `/dashboard` desde
el mismo servidor (mismo origen → comparte el `localStorage` con el juego).

Requiere webcam y un contexto seguro (localhost o HTTPS). El puerto está fijado
a 5173 para que el histórico de ALPHA-001 persista entre sesiones.

## Modificar el panel médico

El dashboard servido en `demo/public/dashboard/` es el **build** de `povmedico`.
Para cambiarlo:

```bash
cd povmedico
npm install
npm run dev        # desarrollo en http://localhost:4000 (datos sintéticos)
npm run build      # genera dist/ con base /dashboard/
```

Después copia el contenido de `povmedico/dist/` a `demo/public/dashboard/`
(reemplazando el anterior) para que la demo lo use.

> Nota: en `npm run dev` de `povmedico` (puerto 4000) NO se ve el histórico de
> ALPHA-001, porque el `localStorage` lo escribe el juego en el origen del
> `demo` (5173). ALPHA-001 solo aparece con datos cuando el dashboard se sirve
> desde el mismo origen que el juego.

## Notas

- No es una herramienta diagnóstica. Produce visualización y análisis de apoyo
  para revisión clínica.
- Los pacientes distintos de ALPHA-001 son sintéticos (generador con semilla).
