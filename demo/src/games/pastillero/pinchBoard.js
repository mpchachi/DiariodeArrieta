import * as THREE from 'three';
import { createScene } from '../../engine/scene.js';
import { createFloor } from '../../objects/floor.js';
import { Pillbox } from '../../objects/pillbox.js';
import { Tray } from '../../objects/tray.js';
import { Pills3D } from '../../objects/pills3D.js';
import { createGameState, tryPlace } from '../../game/state.js';
import { DAYS, MED_TYPES } from '../../game/prescription.js';
import { selectPillTarget } from './pinchLogic.js';
import { PINCH_CONFIG as C } from './pinchConfig.js';

export function createPastilleroBoard(canvas) {
  const view = createScene(canvas);
  const { scene, renderer, camera } = view;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  createFloor(scene);
  const pillbox = new Pillbox(scene), tray = new Tray(scene), pills = new Pills3D(scene);
  const homes = new Map(), flights = new Map();
  const ring = new THREE.Mesh(new THREE.RingGeometry(.42, .48, 48), new THREE.MeshBasicMaterial({
    color: '#b27c32', side: THREE.DoubleSide, depthWrite: false,
  }));
  ring.rotation.x = -Math.PI / 2;
  scene.add(ring);
  const pointer = new THREE.Mesh(new THREE.ConeGeometry(.1, .2, 3), new THREE.MeshBasicMaterial({ color: '#b27c32' }));
  pointer.rotation.z = Math.PI;
  scene.add(pointer);
  const target = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-.54, 0, -.92), new THREE.Vector3(.54, 0, -.92),
    new THREE.Vector3(.54, 0, .92), new THREE.Vector3(-.54, 0, .92),
  ]), new THREE.LineBasicMaterial({ color: '#b27c32' }));
  scene.add(target);
  let game, selection, held = false, disposed = false, raf, lastPaint = -Infinity;

  const fit = () => {
    const aspect = window.innerWidth / window.innerHeight;
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(42 / 2)) * Math.max(1, 1.6 / aspect)));
    camera.updateProjectionMatrix();
    renderer.shadowMap.needsUpdate = true;
  };
  window.addEventListener('resize', fit);
  fit();

  function selectNext() {
    selection = selectPillTarget(game);
    canvas.dataset.selected = selection ? String(selection.pillId) : '';
    canvas.dataset.placed = String(game.placed);
    canvas.dataset.total = String(game.totalPills);
    ring.visible = pointer.visible = target.visible = !!selection;
    if (selection) {
      const bounds = pillbox.getCompartmentBounds()[selection.compartmentIndex];
      target.position.set(bounds.centerX, .08, bounds.centerZ);
    }
  }
  function move(id, to, duration, arc = 0) {
    const mesh = pills.getMesh(id);
    if (mesh) flights.set(id, { from: mesh.position.clone(), to: to.clone(), start: performance.now(), duration, arc });
  }
  function reset() {
    flights.clear();
    for (const id of homes.keys()) {
      pills.getMesh(id)?.material.dispose();
      pills.removePill(id);
    }
    homes.clear(); held = false; canvas.dataset.held = 'false';
    game = createGameState();
    const bounds = tray.getBounds(), columns = 6;
    game.trayPills.forEach((pill, i) => {
      const home = new THREE.Vector3(bounds.minX + (i % columns + 1) * (bounds.maxX - bounds.minX) / (columns + 1), bounds.y, bounds.minZ + .3 + Math.floor(i / columns) * .55);
      homes.set(pill.id, home);
      pills.createPill(pill, home);
    });
    for (let i = 0; i < 7; i++) pillbox.setDayComplete(i, false);
    pillbox.updateGhosts(game.compartments);
    renderer.shadowMap.needsUpdate = true;
    selectNext();
  }
  function grab() {
    if (!selection || held || disposed) return false;
    held = true; canvas.dataset.held = 'true';
    const mesh = pills.getMesh(selection.pillId);
    mesh.scale.setScalar(1.15);
    move(selection.pillId, homes.get(selection.pillId).clone().add(new THREE.Vector3(0, .65, 0)), 140);
    return true;
  }
  function cancelGrab() {
    if (!held || !selection || disposed) return;
    held = false; canvas.dataset.held = 'false';
    pills.getMesh(selection.pillId).scale.setScalar(1);
    move(selection.pillId, homes.get(selection.pillId), 180);
  }
  function release() {
    if (!held || !selection || disposed) return false;
    const { pillId, type, compartmentIndex } = selection;
    const outcome = tryPlace(game, pillId, compartmentIndex);
    if (!outcome.accepted) return false;
    held = false; canvas.dataset.held = 'false';
    pills.getMesh(pillId).scale.setScalar(1);
    const position = pillbox.getSlotPositionForType(compartmentIndex, type, game.compartments);
    move(pillId, position, C.transferMs, .9);
    if (outcome.dayComplete) pillbox.setDayComplete(compartmentIndex, true);
    pillbox.updateGhosts(game.compartments);
    selectNext();
    return true;
  }
  function render(now) {
    if (disposed) return;
    raf = requestAnimationFrame(render);
    if (now - lastPaint < 1000 / C.sceneFps) return;
    lastPaint = now;
    const moving = flights.size > 0;
    for (const [id, flight] of flights) {
      const u = Math.min(1, Math.max(0, (now - flight.start) / flight.duration));
      const smooth = u * u * (3 - 2 * u), mesh = pills.getMesh(id);
      mesh.position.lerpVectors(flight.from, flight.to, smooth);
      mesh.position.y += Math.sin(Math.PI * u) * flight.arc;
      if (u >= 1) flights.delete(id);
    }
    if (selection) {
      ring.position.copy(pills.getMesh(selection.pillId).position);
      pointer.position.copy(ring.position).add(new THREE.Vector3(0, .55, 0));
      ring.position.y = homes.get(selection.pillId).y - .1;
    }
    if (moving) renderer.shadowMap.needsUpdate = true;
    renderer.render(scene, camera);
  }
  reset();
  raf = requestAnimationFrame(render);
  return {
    reset, grab, release, cancelGrab,
    get placed() { return game.placed; },
    get total() { return game.totalPills; },
    get destination() { return selection ? `${Object.values(MED_TYPES).find(med => med.id === selection.type)?.label ?? selection.type} · ${DAYS[selection.compartmentIndex]}` : 'Pastillero completo'; },
    dispose() {
      if (disposed) return;
      disposed = true; cancelAnimationFrame(raf); flights.clear(); window.removeEventListener('resize', fit);
      pillbox.dispose();
      const geometries = new Set(), materials = new Set();
      scene.traverse(object => {
        if (object.geometry) geometries.add(object.geometry);
        if (object.material) for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
      });
      geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
      view.dispose(); renderer.forceContextLoss();
    },
  };
}
