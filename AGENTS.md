# FixedGapMVP — notas para agentes

- App jugable en `demo/` (Vanilla JS + Vite + MediaPipe 0.10.35 local). Dashboard clínico en `povmedico/` (React), servido compilado en `demo/public/dashboard/`.
- Flujo actual: login → sujetos → **Jugar** = «El viaje del zorro» (`demo/src/pack/`): carrera (pinza) → globo (puño) → huerto (giro), con transiciones automáticas. Pastillero v2 y la sesión antigua de 3 juegos siguen como enlaces secundarios.
- Viaje completo sin login: `/runner.html` (`?estacion=0..3` fuerza la estación para demos). Juegos sueltos: `/flappy.html`, `/garden.html`.
- Config del Runner: `demo/src/runner/config.js` (umbrales de pinza, física, recorrido, flag futuro `allowPartialHand`).
- El puerto 5173 puede estar ocupado por otros proyectos: `npm run dev -- --host localhost --port 5181 --strictPort`.

## Estado (2026-10-02, fin de sesión)

Decidido: el producto son 2 juegos, **Flappy** (en otro repo, en low-poly; pendiente decidir si se rehace en pixel) y **Runner del zorro** (pinza). La Jarra queda fuera por ahora. Estilo pixel. Entrega: martes-miércoles.

Hecho: Runner completo en `demo/src/runner/`, conectado a «Jugar». Pasan tests, bot de UI y build. Sin commit.

2026-10-03, versión fácil (petición de Mateo):
- Un solo obstáculo (tronco 14×10) y un solo salto (sin salto alto).
- Velocidad 50 (antes 90), salto flotante de unos 1,4 s, ventana de salto de unos 780 ms.
- 16 obstáculos, unos 80 s; bayas sobre los troncos.
- `strictQuality: false`: solo se exige que haya una mano. Encuadre, luz, lateralidad y fps ya no bloquean y quedan en `quality` en el registro. Motivo: el aviso «la cámara va lenta» y similares eran demasiado ruidosos con cámara real.
- Protocolo `fixedgap-runner-pinch-v2`.

2026-10-03, Flappy integrado:
- Portado de `../FlappyVaina` (Next.js, de Marco) a `demo/src/flappy/` en JS.
- Se mantienen la escena 3D original (avión de papel, columnas griegas, nubes), el detector de puño, el suavizado y las métricas (`processFlappyMetrics`, mismo formato `FlappyMetrics` que el dashboard).
- Cambios: sin game over (al chocar, el avión parpadea y sigue), 10 columnas con semilla, algo más lento y con huecos más grandes, pausa si se pierde la mano, cámara oculta compartida (`RunnerCamera`).
- Secuencia: «Jugar» → Zorro → «Siguiente juego →» → Flappy → «Finalizar» → sujetos. Sin login: `/runner.html` encadena los dos; `/flappy.html` es el Flappy suelto.
- Datos en localStorage: `fixedgap_flappy_sessions`.

2026-10-03, mareo y puño:
- Zorro: 12 obstáculos (unos 62 s).
- Zorro, para que no maree:
  - Capas de fondo con desplazamiento entero (las siluetas ya no «ondulan»).
  - Menos partículas y más lentas.
  - Render a lienzo pequeño ampliado por factor entero.
- Flappy: el control usa landmarks 3D (`world`, añadidos a `PinchCamera`). Cada dedo debe doblar nudillo Y falanges (`measureFistCurl`); doblar solo nudillos o solo falanges ya no sube.
  - Calibrado con fotos reales: puño ≈ 0,86, mano abierta = 0.
  - El ratio 2D original se sigue registrando como `legacyStrength`.

2026-10-03, rediseño pixel (opción A):
- Motor pixel compartido en `demo/src/pixel/`:
  - `sprite.js`: pixmaps por tramos, contorno automático, horneado a canvas.
  - `fox.js`: sprites del zorro.
  - `layers.js`: fondos pre-renderizados en tiras de 512 px sin costura (cielo con tramado, nubes, 2 cordilleras, colinas, 2 filas de árboles, suelo).
  - `seasons.js`, `props.js`, `balloon.js`.
- Flappy → «El zorro en globo» (`flappy/pixelScene.js`): el puño enciende el quemador; cipreses abajo y nubes de tormenta arriba; mismo motor, detector y métricas.
  - El motor admite una caja (`planeHalfWidth/Up/Down`) además del radio original.
  - Se eliminó la escena Three.js del avión.
- `scripts/test-pinch-ui.mjs` (Pastillero v2) es intermitente (falla ~1 de cada 3 con «11/17 vs 12/17»). No depende del runner ni del globo.

2026-10-03, ajustes tras probar Mateo:
- Zorro redibujado (34×21): hocico largo, orejas grandes con punta negra, pecho blanco, «calcetines» negros y cola con punta blanca.
- Fin de los tirones del fondo:
  - Se dibuja directo en el lienzo visible con escala entera y posiciones redondeadas a 1/escala (`setPixelScale`/`snap` en `pixel/sprite.js`), ya no a píxel de juego entero.
  - Parallax más lento y menos tramado en copas y montañas.

2026-10-03, trompicones del globo:
- Escala del lienzo limitada a ×4 (antes hasta ×8 en retina, lienzo de unos 3500 px repintado cada fotograma).
- `RunnerCamera` más ligera:
  - 640×480 y 1 mano.
  - Detecta sobre el `<video>` sin lienzo espejado (espejo en coordenadas y lateralidad).
  - Luminancia cada 15 fotogramas.
- Si siguen los tirones: mirar `inferenceMs` en Ctrl+Mayús+D. Siguiente paso posible: inferencia en Web Worker.

2026-10-05, tercer juego «El zorro pescador» (`demo/src/fishing/`):
- Extensión/flexión de muñeca en postura clínica (Fugl-Meyer): mano boca abajo, antebrazo apoyado, muñeca libre.
- Medida: inclinación 3D muñeca→nudillos con landmarks `world` (`wrist.js`). Validada con fotos reales: dedos arriba +73°, horizontal +13°, abajo −60°.
- Partida:
  - Calibración (reposo, arriba, abajo).
  - 6 peces fijos (perca, trucha, salmón): bajar = lanzar; esperar relajado; «¡Pica!» → subir = enganchar; mantener en la zona verde = recoger.
  - Objetivos escalados al rango de cada paciente. No se puede perder.
- Escena quieta (sin scroll) con medidor vertical de muñeca (zona azul/amarilla/verde y flechas).
- Métricas: rangos, alcanza 15°, reacción, velocidad, tiempo en zona, estabilidad (desviación), temblor, fatiga y compensación con el brazo.
- Secuencia completa: Zorro → Globo → Pesca. `/fishing.html` suelto. Datos en `fixedgap_fishing_sessions`.
- Prueba: `npm run test:fishing-ui`.

2026-10-05, pesca: cambio de postura tras probar Mateo:
- Descartada la mano boca abajo: apuntando a la cámara solo se veían las yemas y se perdía la detección.
- Ahora: codo apoyado, **mano de canto** (como para dar la mano). Hacia fuera = extensión; hacia dentro = flexión.
- Medida 2D en la imagen (`wristTilt`). Validada con el modelo real: ±25° de giro dan ±25° medidos.
- La calibración detecta sola la dirección «hacia fuera» (invierte el signo si hace falta; sirve también para zurdos).
- Medidor horizontal que se mueve como la mano en pantalla.
- Compensación = desplazamiento de la muñeca en la imagen.
- Sin gravedad en contra: no es idéntico al ítem del Fugl-Meyer (anotado en `config.js`).
- `RunnerCamera`: umbrales de confianza 0,5 (antes 0,6), porque las manos de perfil puntúan más bajo.

2026-10-05, versión «calma» para personas mayores (zorro y globo):
- Fondo nuevo `buildCalmLayers`/`drawCalm` (`pixel/layers.js`): degradado liso, 2 colinas planas, pocos árboles en silueta, suelo liso, colores apagados. Sin tramados ni partículas.
- Zorro:
  - Velocidad 35 (antes 50); salto de unos 1,9 s con ventana de 1 s.
  - 7 troncos, unos 60 s; sin bayas ni estrellas.
  - Encuadre recortado (`cropTop: 30`) para que el zorro se vea más grande; marcador mínimo (camino + mano).
- Globo:
  - Más lento (0,42); huecos 1,9; física suave (gravedad 0,6, empuje 1,5, velocidad máxima 0,45); 8 pasos.
  - Cipreses y nubes lisos; sin chispas.
- La pesca queda pendiente de rediseño (a Mateo aún no le convence).
- Feedback de Mateo: «simple sí, pero sin bajar la calidad». El fondo en calma se rehízo con pocos elementos bien acabados:
  - Degradados lisos y perspectiva atmosférica.
  - Picos unidos con suavidad, luz gradual en las laderas y nieve que sigue la forma del pico.
  - Nubes con volumen y árboles a dos tonos con contorno del propio color.
  - Piedras redondeadas.
  - En el globo, nubes-obstáculo abultadas con luz y sombra; cipreses con contorno verde oscuro.

2026-10-05, fondos ilustrados en alta resolución (petición: «simple, pero no tan pixelado»):
- `src/pixel/scenery.js` (`buildScenery`/`drawScenery`): paisaje plano tipo Alto's Adventure dibujado con formas vectoriales a la escala real del lienzo (`getPixelScale`).
  - Elementos: cielo, sol con halo, 3 nubes, 2 cordilleras con cara de luz y nieve, neblina, colinas con bosque en silueta, 6 árboles a dos tonos y suelo.
  - Pre-renderizado por estación y escala.
- Los personajes y obstáculos siguen en pixel art.
- Lo usan el zorro y el globo (`runner/art.js` → `background`) y el lago de la pesca (mismo paisaje subido 16 px + agua con reflejo).
- `buildCalmLayers`/`drawCalm` (`layers.js`) quedan sin uso.
- Corrección (Mateo: «quiero pixel, pero limpio y bien diseñado»): `buildScenery(..., { pixel: true })` es lo que usan ahora los 3 juegos.
  - Mismo diseño, pero a resolución de juego (R = 1) y sin antialiasing (`crisp`): cada píxel es opaco o transparente.
  - Degradados en franjas planas (`vgrad` escalonado) y halo del sol en anillos.
  - La pesca usa agua en 5 franjas y juncos de 1 px.
  - El modo HD (`pixel: false`) queda como alternativa.

2026-10-05, tercer juego definitivo: «El huerto del zorro» (`demo/src/garden/`). La pesca queda aparcada en `/fishing.html`.
- Movimiento: pronación/supinación con el gesto de verter. Puño cerrado como agarrando el asa de una regadera, pulgar arriba; la mano solo se inclina, no se desplaza.
- Medida (`tilt.js`): línea de nudillos (MCP 5 → centro de 13/17) en la imagen. La cámara ve el puño de frente durante todo el giro.
  - Validada con el modelo real (`thumb.jpg` girada 0/±30/±60/±90°): detectada en todos los ángulos, ángulo 1:1 con un desfase de unos 5° y dispersión ≤ 1,3°.
  - Si la calidad baja (mano de perfil un instante), se mantiene el último valor.
- Juego: 5 flores, unos 30–60 s.
  - El zorro, sentado en un tocón, sujeta la regadera por el asa trasera y la regadera copia la inclinación. Inclinar hacia cualquier lado riega.
  - Fases de la flor: brote → tallo → capullo → flor. Hay que volver la mano a recto y el zorro salta al siguiente tocón.
  - Sin calibración visible (el recto se toma solo al empezar). El umbral de riego baja solo si al paciente le cuesta (25° → mínimo 12°). Nada se pierde; pausa si se pierde la mano (1,2 s).
- Datos: señal completa de inclinación por flor, giro máximo, tiempos, velocidades de ida y vuelta, fatiga y compensación (`fixedgap_garden_sessions`).
- Secuencia: Zorro → Globo → Huerto. `/garden.html` suelto. Prueba: `npm run test:garden-ui`.
- Mano elegida al empezar (dos botones; se recuerda en `fixedgap_garden_hand`).
  - Verter = giro natural hacia dentro (pronación): mano derecha `pourSign` −1, con la escena en espejo (el zorro riega hacia la izquierda); mano izquierda +1, escena normal.
  - Girar al lado contrario solo endereza la regadera (sin agua) y se registra como `peakOppositeDeg`.
  - Solo en este juego: en los otros dos la mano da igual.

2026-10-05, pinza del zorro: soltar sin abrir del todo (bug real de Mateo).
- Antes, soltar exigía ratio ≥ 0,45 (unos 4 cm), así que con 2-3 cm de separación seguía contando como pinza.
- Ahora (`runner/config.js`):
  - Cierre: ≤ 0,22.
  - Suelta: ≥ 0,28 y ≥ mínimo + 0,08.
  - Volver a cerrar tras soltar: recorrido de 0,06.
- Abrir del todo (`openRatio` 0,45) ya no bloquea el juego. Se registra por ciclo (`openingPalm`, `fullOpen`) y en el resumen (`incompleteOpenings` de `openingsMeasured`, `medianOpeningPalm`). Se muestra en «Datos técnicos».

2026-10-05, partidas más cortas (Mateo: «muy largos, sobre todo el globo»), con la misma velocidad y facilidad:
- Zorro: 5 troncos, unos 36 s.
- Globo: 5 pasos, unos 33 s.
- Huerto: 5 flores, unos 30 s.
- Sesión completa: unos 2 minutos.

2026-10-05, «El viaje del zorro» (`src/pack/`): los 3 juegos como un solo pack.
- Inicio: título y elección de mano (único clic). Después, por cada capítulo, una transición automática de 6,5 s: el zorro corre por el bosque y una tarjeta muestra el capítulo, su gesto y el progreso (✓ / actual / siguiente), con barra de tiempo. Empieza solo.
- Final: «¡Viaje completado!» con el resultado de cada capítulo y la exportación JSON conjunta (`fixedgap-fox-journey-v1`). La estación avanza al terminar el viaje completo (en modo pack el runner ya no la avanza).
- Una sola cámara (`sharedCamera.js`): un único `getUserMedia` y un único modelo para todo el viaje. El `<video>` se mueve al DOM de cada pantalla. Comprobado con un stream simulado: mano detectada en los 3 capítulos.
- Los juegos aceptan `onComplete` (modo pack): sin pantallas de título ni final propias, con botón «Saltar →». El huerto recibe `hand` ya elegida.
- Prueba: `npm run test:pack-ui`.

2026-10-05, detección con cámara real (Mateo: «si no está en condiciones perfectas no la detecta»).
- Medido con el modelo real y fotos: es robusto a luz baja (20 %), desenfoque (7 px), tamaño (25–150 % del alto) y mano algo cortada. Con 0,3–0,4 de confianza detecta manos pequeñas que con 0,5 se pierden.
- Causa probable: la palma no se ve entera (mano demasiado cerca del portátil o en el borde inferior), o mano de perfil.
- Cambios:
  - `RunnerCamera` con confianza 0,4.
  - `pack/framing.js` evalúa el encuadre por landmarks: cerca, lejos, borde, poca luz.
  - Pantalla «Coloca la mano» al inicio del viaje: única vista de cámara, con zona guía y caja de la mano. Avanza sola tras 1,5 s bien colocada y tiene «Continuar sin comprobar».
  - En pausa, los 3 juegos explican por qué se perdió la mano (p. ej. «Aleja un poco la mano»), según la última caja vista.

Pendiente / bugs vistos en el portátil de Mateo (Chrome, cámara real):
1. **No detecta la mano** (2026-10-03, pendiente de confirmar con cámara real). Cambios hechos:
   - Vídeo a tamaño completo tapado por el lienzo.
   - `RunnerCamera` (`src/runner/camera.js`): pasa a rAF si `requestVideoFrameCallback` no entrega fotogramas.
   - Mensajes de diagnóstico en preparación: «Esperando a la cámara…» y «La imagen está negra».
   - El panel de depuración muestra `video`, `luminance` y `detected`.

   Con imagen de mano real (`mediapipe-assets/victory.jpg` inyectada como cámara), el modelo detecta la mano a través del vídeo oculto.
2. **Encuadre** resuelto: el ancho interno se adapta a la ventana (240–440 px, alto 180).
3. Subir las partidas del Runner a Supabase (hace falta añadir `runner` al enum `game_key_type` y mapearlo en `uploadSession`/dashboard). Hoy solo se guarda en localStorage y se exporta en JSON.
4. Probar con mano real: etiqueta izquierda/derecha, sensación del salto alto (`superHoldMs`) y velocidad (`speed`).
5. Idea «wow» sin decidir (coach de voz durante la sesión era la favorita).

## Verificación (desde `demo/`)
- `npm test` — tests puros (pastillero + runner).
- `npm run test:ui` — UI del Pastillero v2 con landmarks sintéticos.
- `npm run test:runner-ui` — partida completa del Runner con un bot (`RUNNER_SHOTS=/tmp/x` guarda capturas).
- `npm run test:flappy-ui` — vuelo completo del Flappy con piloto automático.
- `npm run test:fishing-ui` — pesca completa con paciente sintético (calibración, picada ignorada, pausa).
- `npm run test:garden-ui` — huerto completo con puño sintético (mano derecha, pausa).
- `npm run test:pack-ui` — viaje completo: inicio, transiciones automáticas, 3 capítulos y final.
- `npm run build`.
