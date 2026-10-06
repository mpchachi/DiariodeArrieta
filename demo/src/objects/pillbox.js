import * as THREE from 'three';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { COMPARTMENT_MAT, COMPARTMENT_DONE_MAT, TABLE_MAT, GHOST_MAT, PILL_MATS } from './materials.js';
import { createPillGeometry } from './pillGeometry.js';

// NOTE: the 3D font (helvetiker_bold) has no accented glyphs (É, Á),
// which render as "?". Keep these labels accent-free.
const DAYS = ['LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB', 'DOM'];
const COMP_W = 1.2;
const COMP_D = 2.0;
const COMP_WALL = 0.08;
const COMP_FLOOR_H = 0.06;
const GAP = 0.15;
const TOTAL_W = 7 * COMP_W + 6 * GAP;

const DAY_COLORS = ['#d94f4f', '#e8a838', '#6bab7d', '#5a8fc7', '#9b7dc7', '#d4a843', '#c76b8a'];

export class Pillbox {
  constructor(scene) {
    this._scene = scene;
    this._disposed = false;
    this._compartments = [];
    this._ghostMeshes = [];
    this._group = new THREE.Group();
    this._group.position.set(0, 0, -2.2);
    scene.add(this._group);

    this._buildBase();
    this._buildCompartments();
    this._loadLabels();
  }

  _buildBase() {
    // Main body — rounded-looking box (clay slab)
    const baseGeo = new THREE.BoxGeometry(TOTAL_W + 0.7, 0.22, COMP_D + 1.0);
    baseGeo.translate(0, -0.11, 0);
    const baseMat = new THREE.MeshStandardMaterial({ color: '#d4cfc6', roughness: 0.85, metalness: 0 });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.castShadow = true;
    base.receiveShadow = true;
    this._group.add(base);

    // Lid hinge visual (back edge, like a real pillbox)
    const hingeGeo = new THREE.CylinderGeometry(0.06, 0.06, TOTAL_W + 0.5, 12);
    hingeGeo.rotateZ(Math.PI / 2);
    const hingeMat = new THREE.MeshStandardMaterial({ color: '#b8b0a4', roughness: 0.8, metalness: 0.1 });
    const hinge = new THREE.Mesh(hingeGeo, hingeMat);
    hinge.position.set(0, 0.05, -COMP_D / 2 - 0.42);
    hinge.castShadow = true;
    this._group.add(hinge);
  }

  _buildCompartments() {
    const startX = -TOTAL_W / 2 + COMP_W / 2;

    for (let i = 0; i < 7; i++) {
      const x = startX + i * (COMP_W + GAP);

      // Compartment: open box (floor + 4 walls)
      const floorGeo = new THREE.BoxGeometry(COMP_W, COMP_FLOOR_H, COMP_D);
      floorGeo.translate(0, COMP_FLOOR_H / 2, 0);
      const floor = new THREE.Mesh(floorGeo, COMPARTMENT_MAT.clone());
      floor.position.set(x, 0, 0);
      floor.receiveShadow = true;
      this._group.add(floor);

      // Walls
      const wallH = 0.3;
      const wallMat = new THREE.MeshStandardMaterial({ color: '#e0d8cc', roughness: 0.85, metalness: 0 });

      // Left wall
      const lwGeo = new THREE.BoxGeometry(COMP_WALL, wallH, COMP_D);
      const lw = new THREE.Mesh(lwGeo, wallMat);
      lw.position.set(x - COMP_W / 2, wallH / 2, 0);
      this._group.add(lw);

      // Right wall
      const rw = new THREE.Mesh(lwGeo, wallMat);
      rw.position.set(x + COMP_W / 2, wallH / 2, 0);
      this._group.add(rw);

      // Back wall
      const bwGeo = new THREE.BoxGeometry(COMP_W + COMP_WALL * 2, wallH, COMP_WALL);
      const bw = new THREE.Mesh(bwGeo, wallMat);
      bw.position.set(x, wallH / 2, -COMP_D / 2);
      this._group.add(bw);

      // Front wall (shorter, so you can see inside)
      const fwGeo = new THREE.BoxGeometry(COMP_W + COMP_WALL * 2, wallH * 0.5, COMP_WALL);
      const fw = new THREE.Mesh(fwGeo, wallMat);
      fw.position.set(x, wallH * 0.25, COMP_D / 2);
      this._group.add(fw);

      this._compartments.push({
        mesh: floor,
        worldX: x,
        index: i,
      });
    }
  }

  _loadLabels() {
    const loader = new FontLoader();
    loader.load('/fonts/helvetiker_bold.typeface.json', (font) => {
      if (this._disposed) return;
      const startX = -TOTAL_W / 2 + COMP_W / 2;

      for (let i = 0; i < 7; i++) {
        const x = startX + i * (COMP_W + GAP);

        const textGeo = new TextGeometry(DAYS[i], {
          font,
          size: 0.22,
          depth: 0.08,
          curveSegments: 6,
          bevelEnabled: true,
          bevelThickness: 0.02,
          bevelSize: 0.015,
          bevelSegments: 3,
        });
        textGeo.computeBoundingBox();
        const bb = textGeo.boundingBox;
        const textW = bb.max.x - bb.min.x;
        textGeo.translate(-textW / 2, 0, 0);

        const textMat = new THREE.MeshStandardMaterial({
          color: DAY_COLORS[i],
          roughness: 0.7,
          metalness: 0,
        });
        const textMesh = new THREE.Mesh(textGeo, textMat);
        textMesh.position.set(x, 0.01, COMP_D / 2 + 0.35);
        textMesh.rotation.x = -Math.PI / 2;
        textMesh.castShadow = true;
        this._group.add(textMesh);
      }
    });
  }

  dispose() {
    this._disposed = true;
  }

  getSlotPositionForType(compartmentIndex, pillType, compartments) {
    const comp = compartments[compartmentIndex];

    const allSlots = [];
    for (const [type, qty] of Object.entries(comp.needs)) {
      for (let n = 0; n < qty; n++) {
        const filled = comp.filled[type] || 0;
        allSlots.push({ type, filled: n < filled });
      }
    }

    const totalSlots = allSlots.length;
    const startX = -TOTAL_W / 2 + COMP_W / 2;
    const cx = startX + compartmentIndex * (COMP_W + GAP);
    const spacing = Math.min(0.55, (COMP_D - 0.4) / totalSlots);
    const offsetZ = -(totalSlots - 1) * spacing / 2;

    let targetSlotIdx = 0;
    let count = 0;
    for (let j = 0; j < allSlots.length; j++) {
      if (allSlots[j].type === pillType) {
        count++;
        if (count === (comp.filled[pillType] || 0)) {
          targetSlotIdx = j;
          break;
        }
      }
    }

    return new THREE.Vector3(
      this._group.position.x + cx,
      0.15,
      this._group.position.z + offsetZ + targetSlotIdx * spacing
    );
  }

  getCompartmentBounds() {
    const startX = -TOTAL_W / 2 + COMP_W / 2;
    const bounds = [];
    for (let i = 0; i < 7; i++) {
      const cx = this._group.position.x + startX + i * (COMP_W + GAP);
      const cz = this._group.position.z;
      bounds.push({
        index: i,
        minX: cx - COMP_W / 2,
        maxX: cx + COMP_W / 2,
        minZ: cz - COMP_D / 2,
        maxZ: cz + COMP_D / 2,
        centerX: cx,
        centerZ: cz,
        y: 0.15,
      });
    }
    return bounds;
  }

  setDayComplete(index, complete) {
    const comp = this._compartments[index];
    comp.mesh.material.dispose();
    comp.mesh.material = complete ? COMPARTMENT_DONE_MAT.clone() : COMPARTMENT_MAT.clone();
  }

  updateGhosts(compartments) {
    for (const m of this._ghostMeshes) {
      this._group.remove(m);
      m.geometry.dispose();
      m.material.dispose();
    }
    this._ghostMeshes = [];

    const startX = -TOTAL_W / 2 + COMP_W / 2;

    for (let i = 0; i < 7; i++) {
      const comp = compartments[i];
      if (comp.complete) continue;

      const allSlots = [];
      for (const [type, qty] of Object.entries(comp.needs)) {
        const filled = comp.filled[type] || 0;
        for (let n = 0; n < qty; n++) {
          allSlots.push({ type, filled: n < filled });
        }
      }

      const totalSlots = allSlots.length;
      if (totalSlots === 0) continue;

      const cx = startX + i * (COMP_W + GAP);
      const spacing = Math.min(0.55, (COMP_D - 0.4) / totalSlots);
      const offsetZ = -(totalSlots - 1) * spacing / 2;

      for (let j = 0; j < totalSlots; j++) {
        if (allSlots[j].filled) continue;

        const geo = createPillGeometry(allSlots[j].type);
        const mat = PILL_MATS[allSlots[j].type].clone();
        mat.transparent = true;
        mat.opacity = 0.3;
        const ghost = new THREE.Mesh(geo, mat);
        ghost.position.set(cx, 0.12, offsetZ + j * spacing);
        ghost.scale.setScalar(0.7);
        this._group.add(ghost);
        this._ghostMeshes.push(ghost);
      }
    }
  }
}
