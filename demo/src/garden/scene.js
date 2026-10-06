// Escena pixel de «El huerto del zorro». El zorro está sentado en un tocón junto a la
// flor y sujeta la regadera por el asa trasera; la regadera copia la inclinación de la
// mano. Entre flor y flor baja de un salto, camina y sube al siguiente tocón (el
// suelo solo se mueve esos segundos). Mismo fondo pixel que los otros juegos.
// `mirror`: con la mano derecha la escena se dibuja en espejo (el zorro riega hacia la
// izquierda), para que verter coincida con el giro natural de esa mano.

import { SEASONS } from '../pixel/seasons.js';
import { draw, snap, setPixelScale } from '../pixel/sprite.js';
import { foxSprites, FOX_ANCHOR } from '../pixel/fox.js';
import { canSprite, plantSprite, PLANT_ANCHOR, soilSprite, flowerIcon, stumpSprite } from '../pixel/garden.js';
import { FOX_SIT, foxSitSprite } from '../pixel/fishing.js';
import { glyph, handSprite, panel } from '../pixel/props.js';
import { createArt } from '../runner/art.js';

// CROP: se recortan 78 px de cielo → se ven 102 px de alto: todo se ve grande.
const H = 180, GROUND = 150, CROP = 78, MOUTH = { x: 34, y: 9 }, STUMP_H = 20, CAN_GAIN = 1.2;
const ease = u => u * u * (3 - 2 * u);
const clamp01 = v => Math.max(0, Math.min(1, v));

export class GardenScene {
  constructor(canvas, { season = 0, mirror = false } = {}) {
    this.mirror = mirror;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    if (!this.ctx) throw new Error('Canvas 2D no disponible');
    this.season = SEASONS[season] ?? SEASONS[0];
    this.view = { width: 260, height: H, groundY: GROUND, top: CROP };
    this.art = createArt(this.ctx, this.view);
    this.t = 0; this.canDeg = 0; this.hand = 'missing'; this.drops = []; this.sparkles = [];
    this.scroll = 0; this.walkU = 0;
    this.resize();
  }

  get baseX() { return Math.round(this.view.width * 0.28); } // centro del tocón actual
  get foxLeft() { return this.baseX - 10; }
  get foxTop() { return GROUND - STUMP_H - FOX_SIT.h; }
  // Patas que sujetan el asa (sprite sentado: pivote (19,14) + 1 px de margen).
  get paws() { return { x: this.foxLeft + FOX_SIT.pivotX + 1, y: this.foxTop + FOX_SIT.pivotY + 1 }; }
  // La flor se planta donde cae el agua con la regadera a ~50°.
  get plantOffset() { const c = canSprite(60), p = this.paws; return Math.round(p.x + c.spout.x - c.pivot.x + 3) - this.baseX; }

  update(engine, dt, { hand = 'missing', now = 0 } = {}) {
    this.t += dt; this.hand = hand; this.engine = engine;
    // La regadera se inclina algo más que la mano (CAN_GAIN) para que los giros pequeños se noten.
    const target = engine.phase === 'walk' || engine.phase === 'neutral' ? 0 : Math.max(-24, Math.min(100, engine.pour * CAN_GAIN));
    this.canDeg += (target - this.canDeg) * Math.min(1, dt * 16);
    const spacing = engine.C.potSpacing;
    this.walkU = engine.walkProgress(now);
    // Caminata: salto abajo (0–20 %), camino (20–80 %), salto arriba (80–100 %).
    this.scroll = (engine.index + ease(clamp01((this.walkU - 0.2) / 0.6))) * spacing;
    const flow = engine.flow;
    if (flow > 0) for (let i = 0; i < 1 + Math.round(flow * 2); i++) this.drops.push({ u: 0, speed: 1.6 + Math.random() * 0.6, off: (Math.random() - 0.5) * (1 + flow * 2) });
    for (const d of this.drops) d.u += d.speed * dt;
    this.drops = this.drops.filter(d => d.u < 1);
    if (engine.phase === 'bloom' && Math.random() < dt * 14) {
      const a = Math.random() * Math.PI * 2;
      this.sparkles.push({ x: this.baseX + this.plantOffset + Math.cos(a) * 9, y: GROUND - 16 + Math.sin(a) * 8, life: 0.7 });
    }
    for (const s of this.sparkles) { s.y -= 10 * dt; s.life -= dt; }
    this.sparkles = this.sparkles.filter(s => s.life > 0);
  }

  render() {
    const { ctx, view } = this, e = this.engine;
    ctx.save();
    if (this.mirror) { ctx.translate(view.width, 0); ctx.scale(-1, 1); }
    this.world(e);
    ctx.restore();
    if (e) this.hud(e);
  }

  world(e) {
    const { ctx, view } = this;
    this.art.background(this.season, this.scroll);
    if (!e) return;
    const spacing = e.C.potSpacing, off = this.plantOffset;
    // Tocones y plantas: regadas, la actual (según crecimiento) y las siguientes (tierra).
    e.C.flowers.forEach((kind, j) => {
      const sx = this.baseX + j * spacing - this.scroll, x = sx + off;
      if (x < -30 || sx > view.width + 30) return;
      draw(ctx, stumpSprite(this.season), sx - 9, GROUND - STUMP_H - 1);
      draw(ctx, soilSprite(this.season), x - 7, GROUND - 3);
      const f = e.flowers[j], g = f ? f.growth : 0;
      const stage = !f ? 0 : g >= 1 ? 4 : g >= 0.7 ? 3 : g >= 0.35 ? 2 : g > 0.02 ? 1 : 0;
      if (stage) draw(ctx, plantSprite(kind, stage), x - PLANT_ANCHOR.x, GROUND - 2 - PLANT_ANCHOR.y);
    });
    const walking = e.phase === 'walk', sp = foxSprites();
    let can, cx, cy;
    if (walking) {
      // Baja del tocón, camina y sube al siguiente; lleva la regadera en la boca.
      const u = this.walkU, hop = u < 0.2 ? u / 0.2 : u > 0.8 ? (1 - u) / 0.2 : null;
      const lift = hop === null ? 0 : STUMP_H * (1 - hop) + Math.sin(hop * Math.PI) * 6;
      const y = GROUND - Math.round(lift);
      const fox = hop !== null ? sp.jump : sp.run[Math.floor(this.t * 7) % 4];
      ctx.fillStyle = 'rgba(40,30,20,0.18)'; ctx.fillRect(this.baseX - 12, GROUND, 26, 1);
      draw(ctx, fox, this.baseX - FOX_ANCHOR.x, y - FOX_ANCHOR.y);
      can = canSprite(0);
      cx = this.baseX - FOX_ANCHOR.x + MOUTH.x - can.pivot.x;
      cy = y - FOX_ANCHOR.y + MOUTH.y - can.pivot.y + Math.round(Math.sin(this.t * 14));
      draw(ctx, can.img, cx, cy);
    } else {
      const happy = e.phase === 'bloom';
      draw(ctx, foxSitSprite({ happy, blink: !happy && Math.floor(this.t * 0.5) % 7 === 0 }), this.foxLeft, this.foxTop);
      can = canSprite(this.canDeg);
      const p = this.paws;
      cx = p.x - can.pivot.x; cy = p.y - can.pivot.y;
      draw(ctx, can.img, cx, cy);
    }
    // Chorro: del pitorro a la tierra de la flor, en curva suave.
    if (this.drops.length && !walking) {
      const s0 = { x: cx + can.spout.x, y: cy + can.spout.y }, s1 = { x: this.baseX + off, y: GROUND - 3 };
      const c = { x: Math.max(s0.x, s1.x) + 2, y: s0.y };
      for (const d of this.drops) {
        const u = d.u;
        const x = (1 - u) ** 2 * s0.x + 2 * (1 - u) * u * c.x + u * u * s1.x + d.off * u;
        const y = (1 - u) ** 2 * s0.y + 2 * (1 - u) * u * c.y + u * u * s1.y;
        ctx.fillStyle = u > 0.9 ? '#e3f4ff' : '#7cc3ec'; ctx.fillRect(snap(x), snap(y), 1, 1);
        ctx.fillStyle = '#b7e0f7'; ctx.fillRect(snap(x), snap(y) - 1, 1, 1);
      }
    }
    for (const s of this.sparkles) {
      ctx.fillStyle = '#fff3a0'; ctx.fillRect(snap(s.x), snap(s.y), 1, 1);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(snap(s.x), snap(s.y) - 1, 1, 1);
    }
  }

  hud(e) {
    const { ctx, view } = this, top = CROP + 4;
    const done = e.flowers.filter(f => f?.bloomAt !== null && f?.bloomAt !== undefined).length;
    const label = `${done}/${e.C.flowers.length}`;
    panel(ctx, 4, top, 18 + label.length * 6, 15);
    draw(ctx, flowerIcon(), 7, top + 3);
    let x = 18;
    for (const ch of label) { const g = glyph(ch, '#5a3420'); if (g) draw(ctx, g, x, top + 4); x += 6; }
    panel(ctx, view.width - 21, top, 17, 18);
    draw(ctx, handSprite(this.hand), view.width - 18, top + 3);
  }

  resize() {
    const cw = this.canvas.clientWidth || window.innerWidth, ch = this.canvas.clientHeight || window.innerHeight;
    const viewH = H - CROP;
    this.view.width = Math.max(150, Math.min(300, Math.round(viewH * cw / Math.max(1, ch))));
    const k = Math.min(8, Math.max(1, Math.ceil(ch * (window.devicePixelRatio || 1) / viewH)));
    this.canvas.width = this.view.width * k; this.canvas.height = viewH * k;
    this.ctx.setTransform(k, 0, 0, k, 0, -CROP * k);
    this.ctx.imageSmoothingEnabled = false;
    setPixelScale(k);
  }

  dispose() {}
}
