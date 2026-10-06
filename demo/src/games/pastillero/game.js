import * as THREE from 'three';
export { startPinchGame as startPastilleroGame } from './pinchGame.js';
import { createScene } from '../../engine/scene.js';
import { createFloor } from '../../objects/floor.js';
import { Pillbox } from '../../objects/pillbox.js';
import { Tray } from '../../objects/tray.js';
import { Pills3D } from '../../objects/pills3D.js';
import { Hand3D } from '../../objects/hand3D.js';
import { HandTracker } from '../../tracking/HandTracker.js';
import { PinchDetector } from '../../tracking/PinchDetector.js';
import { PipSkeleton } from '../../tracking/pipSkeleton.js';
import { createGameState, tryPlace } from '../../game/state.js';
import { createClinicalButton, removeClinicalButton, openClinicalView } from '../../clinical/clinicalView.js';
import { BiomarkerAccumulator } from '../../clinical/sessionMetrics.js';
import { recordGame } from '../../clinical/sessionRecorder.js';

export function startLegacyPastilleroGame(container) {
  container.innerHTML = `
    <canvas id="main"></canvas>
    <div id="pip">
      <video id="pip-video" autoplay playsinline muted width="960" height="720"></video>
      <canvas id="pip-skeleton"></canvas>
    </div>
    <div id="hud">
      <h3>Progreso</h3>
      <div class="row"><span>Tiempo</span><span class="val" id="hud-time">0:00</span></div>
      <div class="row"><span>Colocadas</span><span class="val" id="hud-placed">0 / 17</span></div>
      <div class="row"><span>Errores</span><span class="val" id="hud-errors">0</span></div>
      <div class="row"><span>Eficiencia</span><span class="val" id="hud-eff">—</span></div>
    </div>
    <div id="stats"></div>
    <div id="modal-overlay">
      <div id="modal">
        <h2>¡Sesión completa!</h2>
        <p id="modal-time"></p>
        <p id="modal-placed"></p>
        <p id="modal-errors"></p>
        <p id="modal-eff"></p>
        <button id="modal-btn">Siguiente juego</button>
      </div>
    </div>
  `;

  const { renderer, scene, camera } = createScene(document.getElementById('main'));
  createFloor(scene);

  const pillbox = new Pillbox(scene);
  const tray = new Tray(scene);
  const pills3D = new Pills3D(scene);
  const hand3D = new Hand3D(scene);
  const compartmentBounds = pillbox.getCompartmentBounds();

  let state = createGameState();
  let heldPillId = null;
  let prevPinching = false;

  function layoutTrayPills() {
    const bounds = tray.getBounds();
    const cols = 6;
    const spacingX = (bounds.maxX - bounds.minX) / (cols + 1);
    const spacingZ = 0.55;

    for (let i = 0; i < state.trayPills.length; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = bounds.minX + spacingX * (col + 1);
      const z = bounds.minZ + 0.3 + row * spacingZ;
      const pos = new THREE.Vector3(x, bounds.y, z);
      state.trayPills[i].worldPos = pos.clone();
      pills3D.createPill(state.trayPills[i], pos);
    }
  }
  layoutTrayPills();
  pillbox.updateGhosts(state.compartments);

  // --- Tracking ---
  const pinchDetector = new PinchDetector();
  const pipSkeleton = new PipSkeleton();
  const handTracker = new HandTracker({ maxHands: 2 });
  let latestLandmarks = [];

  // --- Biomarker capture (live, from the same landmarks) ---
  const biomarkers = new BiomarkerAccumulator('pastillero');
  let gameRecorded = false;
  // B1: First stimulus = game start (pills are visible)
  setTimeout(() => biomarkers.markStimulus(), 500);

  handTracker.onResults((landmarks, meta) => {
    latestLandmarks = landmarks;
    pinchDetector.update(landmarks);
    hand3D.update(landmarks, pinchDetector.isPinching, pinchDetector.pinchType);
    biomarkers.update(landmarks);
  });

  handTracker.onRawResults((results) => {
    pipSkeleton.draw(results);
  });

  handTracker.start(document.getElementById('pip-video'));

  // --- Game logic ---
  function findNearestPill(worldPos) {
    let nearest = null;
    let nearestDist = 1.2;
    for (const pill of state.trayPills) {
      const mesh = pills3D.getMesh(pill.id);
      if (!mesh) continue;
      const dx = mesh.position.x - worldPos.x;
      const dz = mesh.position.z - worldPos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = pill;
      }
    }
    return nearest;
  }

  function findCompartmentAt(worldPos) {
    for (const b of compartmentBounds) {
      if (worldPos.x >= b.minX && worldPos.x <= b.maxX &&
          worldPos.z >= b.minZ && worldPos.z <= b.maxZ) {
        return b.index;
      }
    }
    return -1;
  }

  function gameUpdate() {
    const pinchPos = hand3D.getPinchWorldPos(latestLandmarks, pinchDetector.pinchType);
    const nowPinching = pinchDetector.isPinching;

    if (nowPinching && !prevPinching && pinchPos) {
      const pill = findNearestPill(pinchPos);
      if (pill) {
        heldPillId = pill.id;
        pills3D.setHeld(pill.id, true);
        // B5: Record grip aperture at grasp onset
        biomarkers.recordGripAperture(biomarkers._lastPinchMm);
      }
    }

    if (heldPillId !== null && nowPinching && pinchPos) {
      pills3D.setPosition(heldPillId, { x: pinchPos.x, y: 0.6, z: pinchPos.z });
    }

    if (!nowPinching && prevPinching && heldPillId !== null) {
      pills3D.setHeld(heldPillId, false);
      const mesh = pills3D.getMesh(heldPillId);
      const dropPos = mesh ? mesh.position.clone() : null;

      if (dropPos) {
        const compIdx = findCompartmentAt(dropPos);
        if (compIdx >= 0) {
          const pill = state.trayPills.find(p => p.id === heldPillId);
          const pillType = pill ? pill.type : null;
          const result = tryPlace(state, heldPillId, compIdx);
          if (result.accepted) {
            const slotPos = pillbox.getSlotPositionForType(compIdx, pillType, state.compartments);
            pills3D.animateTo(heldPillId, slotPos, 350);
            if (result.dayComplete) pillbox.setDayComplete(compIdx, true);
            pillbox.updateGhosts(state.compartments);
            // B3: Record endpoint for BVE (drop position vs intended target)
            biomarkers.recordEndpoint(
              { x: dropPos.x, z: dropPos.z },
              { x: slotPos.x, z: slotPos.z }
            );
            biomarkers.markRepetition({ success: true });
            biomarkers.markStimulus();
          } else {
            const pill2 = state.trayPills.find(p => p.id === heldPillId);
            if (pill2 && pill2.worldPos) pills3D.animateBounce(heldPillId, pill2.worldPos, 500);
            biomarkers.markRepetition({ success: false });
            biomarkers.markStimulus();
          }
        } else {
          const pill2 = state.trayPills.find(p => p.id === heldPillId);
          if (pill2 && pill2.worldPos) pills3D.animateBounce(heldPillId, pill2.worldPos, 400);
        }
      }
      heldPillId = null;
    }

    prevPinching = nowPinching;

    if (!state.complete) state.elapsed = Date.now() - state.startTime;
    if (state.complete && !state._modalShown) {
      state._modalShown = true;
      showModal();
    }
  }

  function updateHUD() {
    const secs = Math.floor(state.elapsed / 1000);
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    document.getElementById('hud-time').textContent = `${m}:${s.toString().padStart(2, '0')}`;
    document.getElementById('hud-placed').textContent = `${state.placed} / ${state.totalPills}`;
    document.getElementById('hud-errors').textContent = state.errors;
    document.getElementById('hud-eff').textContent = state.placed > 0
      ? `${Math.round((state.placed / (state.placed + state.errors)) * 100)}%` : '—';
  }

  function showModal() {
    const secs = Math.floor(state.elapsed / 1000);
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    const eff = Math.round((state.placed / (state.placed + state.errors)) * 100);
    document.getElementById('modal-time').textContent = `Tiempo: ${m}:${s.toString().padStart(2, '0')}`;
    document.getElementById('modal-placed').textContent = `Colocadas: ${state.placed}`;
    document.getElementById('modal-errors').textContent = `Errores: ${state.errors}`;
    document.getElementById('modal-eff').textContent = `Eficiencia: ${eff}%`;
    document.getElementById('modal-overlay').classList.add('visible');
  }

  function resetGame() {
    for (const pill of state.trayPills) pills3D.removePill(pill.id);
    state = createGameState();
    layoutTrayPills();
    pillbox.updateGhosts(state.compartments);
    for (let i = 0; i < 7; i++) pillbox.setDayComplete(i, false);
    heldPillId = null;
  }

  document.getElementById('modal-btn').addEventListener('click', () => {
    // The demo orchestrator handles cleanup + advancing when this fires.
    window.dispatchEvent(new CustomEvent('demo:next'));
  });

  // --- Clinical View Button ---
  const clinicalBtn = createClinicalButton();
  let clinicalCleanup = null;

  clinicalBtn.addEventListener('click', () => {
    if (animId) cancelAnimationFrame(animId);
    handTracker.stop();
    clinicalCleanup = openClinicalView(container, () => {
      clinicalCleanup = null;
      startLegacyPastilleroGame(container);
    });
  });

  // --- Render loop ---
  let lastTime = performance.now();
  const fpsBuf = [];
  let animId = null;

  function frame() {
    animId = requestAnimationFrame(frame);
    const now = performance.now();
    const dt = (now - lastTime) / 1000;
    lastTime = now;

    fpsBuf.push(dt);
    if (fpsBuf.length > 60) fpsBuf.shift();
    const fps = Math.round(1 / (fpsBuf.reduce((a, b) => a + b, 0) / fpsBuf.length));
    const cvFps = handTracker.getFPS();
    document.getElementById('stats').textContent = `${fps} FPS | CV: ${cvFps}`;

    gameUpdate();
    updateHUD();
    renderer.render(scene, camera);
  }

  frame();

  function cleanup() {
    if (!gameRecorded) {
      gameRecorded = true;
      biomarkers.setOutcome({
        placed: state.placed,
        errors: state.errors,
        totalPills: state.totalPills,
      });
      recordGame(biomarkers.finalize(), biomarkers);
    }
    handTracker.stop();
    if (animId) cancelAnimationFrame(animId);
    renderer.dispose();
    removeClinicalButton();
    if (clinicalCleanup) clinicalCleanup();
  }

  return cleanup;
}
