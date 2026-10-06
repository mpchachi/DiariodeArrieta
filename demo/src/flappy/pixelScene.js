// Escena pixel del juego del globo: el zorro vuela en globo sobre el bosque de
// las estaciones, entre cipreses (abajo) y nubes de tormenta (arriba).
// Cerrar el puño = encender el quemador (la llama crece con la fuerza).

import { FLAPPY_CONFIG as C } from './config.js';
import { createArt } from '../runner/art.js';
import { SEASONS } from '../pixel/seasons.js';
import { draw, snap, setPixelScale } from '../pixel/sprite.js';
import { foxSprites } from '../pixel/fox.js';
import { BALLOON, balloonSprite, basketSprite, drawFlame, cypressSprite, stormCloudSprite, fistHandSprite } from '../pixel/balloon.js';
import { glyph, handSprite, panel } from '../pixel/props.js';

const H = 180, GROUND = 150, CENTER_Y = 86;

export class PixelFlappyScene {
  constructor(canvas, { season = 0 } = {}) {
    this.canvas = canvas;
    // Dibujo directo en el lienzo visible con escala entera y posiciones a píxel de pantalla.
    this.ctx = canvas.getContext('2d');
    if (!this.ctx) throw new Error('Canvas 2D no disponible');
    this.view = { width: 320, height: H, groundY: GROUND };
    this.art = createArt(this.ctx, this.view);
    this.season = SEASONS[season] ?? SEASONS[0];
    this.scroll = 0; this.t = 0; this.strength = 0; this.hand = 'missing';
    this.sparks = []; this.hitShake = new Map();
    this.resize();
  }

  setInput({ strength = 0, hand = 'missing' } = {}) { this.strength = Math.max(0, Math.min(1, strength)); this.hand = hand; }

  sx(x) { return snap(this.view.width * 0.3 + (x - C.planeX) * C.pxPerUnit); }
  sy(y) { return snap(CENTER_Y - y * C.pxPerUnit); }

  update(state, dt) {
    this.t += dt;
    const moving = state.status === 'playing' && dt > 0;
    this.scroll += (moving ? C.scrollSpeed * C.pxPerUnit : 6) * dt;
    this.state = state;
    for (const p of this.sparks) { p.y += p.vy * dt; p.life -= dt; }
    this.sparks = this.sparks.filter(p => p.life > 0);
    this.art.updateParticles(this.season, dt);
  }

  render() {
    const { ctx, view, season: s } = this, st = this.state;
    this.art.background(s, this.scroll);
    if (st) {
      for (const col of st.columns) {
        const cx = this.sx(col.x);
        if (cx < -30 || cx > view.width + 30) continue;
        const shake = col.hit && st.recoveryMs > 0 ? Math.round(Math.sin(this.t * 50)) : 0;
        const bottomTop = this.sy(col.gapY - col.gapSize / 2), topBottom = this.sy(col.gapY + col.gapSize / 2);
        const tree = cypressSprite(Math.round(GROUND - bottomTop), s, col.id);
        ctx.fillStyle = 'rgba(30,20,15,0.25)'; ctx.fillRect(cx - 11, GROUND, 22, 1);
        draw(ctx, tree, cx - 10 + shake, bottomTop);
        draw(ctx, stormCloudSprite(Math.round(topBottom), s, col.id), cx - 15 + shake, 0);
      }
      this.drawBalloon(st);
    }
    for (const p of this.sparks) { ctx.fillStyle = p.life > 0.2 ? '#ffd84a' : '#ff8a3a'; ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1); }
    this.art.drawParticles(this.t);
    if (st) this.drawHud(st);
  }

  drawBalloon(st) {
    const { ctx } = this;
    // planeY = centro del globo completo (envoltura + cesta).
    const cx = this.sx(C.planeX), top = this.sy(st.planeY) - BALLOON.h / 2;
    const left = cx - BALLOON.cx;
    const lift = GROUND - (top + BALLOON.basketY + 10);
    const sw = Math.max(6, 22 - lift / 5);
    ctx.fillStyle = 'rgba(30,20,15,0.22)'; ctx.fillRect(snap(cx - sw / 2), GROUND, Math.round(sw), 1);
    if (st.recoveryMs > 0 && Math.floor(this.t * 8) % 2) return;
    const fox = foxSprites();
    draw(ctx, balloonSprite(), left, top);
    drawFlame(ctx, left + BALLOON.cx, top + BALLOON.burnerY, this.strength, this.t);
    draw(ctx, fox.tail, left + 1, top + BALLOON.basketY - 2);
    draw(ctx, Math.floor(this.t * 0.5) % 7 === 0 ? fox.headBlink : fox.head, left + 8, top + BALLOON.basketY - 10);
    draw(ctx, basketSprite(), left + 6, top + BALLOON.basketY);
  }

  drawHud(st) {
    const { ctx, view } = this;
    const passed = st.columns.filter(c => c.passed).length, label = `${passed}/${st.columns.length}`;
    panel(ctx, 4, 4, 20 + label.length * 6, 15);
    const icon = cypressSprite(11, this.season, 99);
    ctx.save(); ctx.translate(7, 6); ctx.scale(0.5, 1); draw(ctx, icon, 0, 0); ctx.restore();
    let x = 19;
    for (const ch of label) { const g = glyph(ch, '#5a3420'); if (g) draw(ctx, g, x, 8); x += 6; }
    // Medidor de la llama (fuerza del puño).
    const bw = 90, bx = Math.round((view.width - bw) / 2), by = 163;
    panel(ctx, bx - 14, by - 4, bw + 20, 11);
    drawFlame(ctx, bx - 7, by + 4, 0.45, 0);
    ctx.fillStyle = '#d7c4a4'; ctx.fillRect(bx, by, bw, 3);
    const w = Math.round(bw * this.strength);
    ctx.fillStyle = this.strength > 0.8 ? '#ff6a2a' : '#ffb43a'; ctx.fillRect(bx, by, w, 3);
    ctx.fillStyle = '#fff4b0'; ctx.fillRect(bx, by, w, 1);
    panel(ctx, view.width - 21, 4, 17, 18);
    draw(ctx, this.hand === 'fist' ? fistHandSprite() : handSprite(this.hand === 'open' ? 'ready' : 'missing'), view.width - 18, 7);
  }

  resize() {
    const cw = this.canvas.clientWidth || window.innerWidth, ch = this.canvas.clientHeight || window.innerHeight;
    this.view.width = Math.max(240, Math.min(440, Math.round(H * cw / Math.max(1, ch))));
    const k = Math.min(4, Math.max(1, Math.ceil(ch * (window.devicePixelRatio || 1) / H))); // ver runner/game.js
    this.canvas.width = this.view.width * k; this.canvas.height = H * k;
    this.ctx.setTransform(k, 0, 0, k, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
    setPixelScale(k);
  }

  dispose() { this.sparks = []; }
}
