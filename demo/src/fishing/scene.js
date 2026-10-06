// Escena pixel de «El zorro pescador»: lago quieto en el bosque de las estaciones.
// El paisaje, el agua (con reflejo) y el muelle se pre-renderizan una vez; cada
// fotograma solo dibuja lo que se mueve: caña, sedal, corcho, peces y avisos.
// Las zonas de color alrededor de la caña indican siempre adónde mover la mano:
// azul = bajar para lanzar, amarillo = subir para enganchar, verde = mantener.

import { SEASONS } from '../pixel/seasons.js';
import { buildScenery, drawScenery } from '../pixel/scenery.js';
import { draw, snap, setPixelScale, getPixelScale, INK } from '../pixel/sprite.js';
import { mix, hash } from '../pixel/util.js';
import { glyph, handSprite, panel } from '../pixel/props.js';
import { FOX_SIT, foxSitSprite, bobberSprite, fishSprite, fishShadow, dockSprite, bucketSprite } from '../pixel/fishing.js';
import { createArt } from '../runner/art.js';

const H = 180, SHORE_Y = 133, WATER_Y = 136, DOCK_Y = 124, ROD_LEN = 54;
const REST_DEG = 18, UP_DEG = 72, DOWN_DEG = -32;

export class FishingScene {
  constructor(canvas, { season = 0 } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    if (!this.ctx) throw new Error('Canvas 2D no disponible');
    this.season = SEASONS[season] ?? SEASONS[0];
    this.view = { width: 320, height: H, groundY: 150 };
    this.art = createArt(this.ctx, this.view);
    this.t = 0; this.rodDeg = REST_DEG; this.hand = 'missing';
    this.ripples = []; this.drops = []; this.sparkles = []; this.phaseWall = 0; this.lastPhase = null;
    this.caughtFrom = null; this.bg = null;
    this.resize();
  }

  // --- Geometría ---
  get dockW() { return Math.round(this.view.width * 0.36); }
  get foxLeft() { return this.dockW - 30; }
  get foxTop() { return DOCK_Y - FOX_SIT.h + 1; }
  get pivot() { return { x: this.foxLeft + FOX_SIT.pivotX, y: this.foxTop + FOX_SIT.pivotY }; }
  get castX() { return Math.round(this.dockW + (this.view.width - this.dockW) * 0.55); }

  rodFor(rel, cal) {
    const ext = cal?.extRange ?? 30, flex = cal?.flexRange ?? 30;
    return rel >= 0 ? REST_DEG + Math.min(1, rel / ext) * (UP_DEG - REST_DEG) : REST_DEG - Math.min(1, -rel / flex) * (REST_DEG - DOWN_DEG);
  }
  tipAt(deg) { const a = deg * Math.PI / 180, p = this.pivot; return { x: p.x + Math.cos(a) * ROD_LEN, y: p.y - Math.sin(a) * ROD_LEN }; }

  // --- Fondo estático (por estación, ancho y escala) ---
  // Mismo paisaje pixel que el zorro y el globo, subido 16 px para que los árboles
  // queden en la orilla; debajo, el lago (franjas planas) con el reflejo del paisaje.
  buildBackground() {
    const W = this.view.width, s = this.season, R = 1;
    const c = document.createElement('canvas'); c.width = W * R; c.height = H * R;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.setTransform(R, 0, 0, R, 0, 0);
    const L = buildScenery(s, { groundY: 150, height: H, pixel: true });
    const lift = 150 - SHORE_Y;
    g.save(); g.translate(0, -lift);
    drawScenery(g, L, { width: W, top: lift, groundY: 150 }, 0, W - 56, v => v, false);
    g.restore();
    g.fillStyle = s.sky[4]; g.fillRect(0, SHORE_Y - 1, W, 2);
    // Orilla lejana: franja de hierba con borde iluminado y algunos juncos.
    const shore = s.snow ?? s.grass;
    g.fillStyle = shore; g.fillRect(0, SHORE_Y - 1, W, WATER_Y - SHORE_Y + 1);
    g.fillStyle = s.snow ? '#ffffff' : s.grassLight; g.fillRect(0, SHORE_Y - 1, W, 1);
    g.fillStyle = s.snow ? s.snowShade : s.grassDark; g.fillRect(0, WATER_Y - 1, W, 1);
    if (!s.snow) { // juncos: tres briznas de 1 px
      for (let x = 8; x < W; x += 23 + (x % 13)) for (const [d, h] of [[-1, 3], [0, 5], [1, 4]]) { g.fillStyle = s.grassDark; g.fillRect(x + d, SHORE_Y - 1 - h, 1, h); g.fillStyle = s.grassLight; g.fillRect(x + d, SHORE_Y - 1 - h, 1, 1); }
    }
    // Agua: degradado + reflejo suave del paisaje + líneas de brillo.
    const top = mix(s.sky[3], '#2f6b86', 0.45), deep = mix(s.sky[0], '#163c50', 0.6);
    const nb = 5, bh = (H - WATER_Y) / nb; // agua en 5 franjas planas
    for (let i = 0; i < nb; i++) { g.fillStyle = mix(top, deep, i / (nb - 1)); g.fillRect(0, Math.round(WATER_Y + i * bh), W, Math.ceil(bh)); }
    g.save(); g.globalAlpha = 0.28;
    g.translate(0, WATER_Y + 45); g.scale(1, -0.75); // fila de la orilla → borde del agua
    g.drawImage(c, 0, (SHORE_Y - 60) * R, W * R, 60 * R, 0, 0, W, 60);
    g.restore();
    g.fillStyle = 'rgba(255,255,255,0.22)';
    for (let i = 0; i < 8; i++) { const y = WATER_Y + 4 + i * 5, x = (i * 97) % W, w = 10 + (i * 31) % 22; g.fillRect(x, y, w, 1); g.fillRect(Math.round((x + W * 0.5) % W), y + 2, Math.round(w * 0.5), 1); }
    // Muelle (pixel art, como el zorro) con su reflejo.
    g.globalAlpha = 0.22; g.fillStyle = '#1d2a30';
    for (let x = 6; x < this.dockW; x += 24) g.fillRect(x, DOCK_Y + 34, 4, 10);
    g.globalAlpha = 1;
    draw(g, dockSprite(this.dockW), 0, DOCK_Y);
    this.bg = c; this.bgR = R;
  }

  // --- Eventos del motor (efectos) ---
  onEvent(ev, engine) {
    if (ev.type === 'cast') this.castFrom = this.tipAt(this.rodDeg);
    if (ev.type === 'bite') this.splash(this.castX + 2, WATER_Y, 6);
    if (ev.type === 'caught') { this.caughtFrom = { ...this.fishPos(engine) }; this.splash(this.caughtFrom.x, WATER_Y, 12); }
  }
  splash(x, y, n) {
    this.ripples.push({ x, y, r: 1, life: 1.2 });
    for (let i = 0; i < n; i++) this.drops.push({ x, y, vx: (Math.random() - 0.5) * 30, vy: -20 - Math.random() * 25, life: 0.7 });
  }

  fishPos(engine) {
    const p = engine.reelProgress, from = this.castX, to = this.dockW + 20;
    return { x: from - (from - to) * p, y: WATER_Y + 6 };
  }

  update(engine, dt, { hand = 'missing' } = {}) {
    this.t += dt; this.hand = hand;
    if (engine.phase !== this.lastPhase) { this.lastPhase = engine.phase; this.phaseWall = this.t; }
    const target = this.rodFor(engine.rel, engine.calib);
    this.rodDeg += (target - this.rodDeg) * Math.min(1, dt * 14);
    for (const r of this.ripples) { r.r += dt * 10; r.life -= dt; }
    this.ripples = this.ripples.filter(r => r.life > 0);
    for (const d of this.drops) { d.x += d.vx * dt; d.y += d.vy * dt; d.vy += 90 * dt; d.life -= dt; }
    this.drops = this.drops.filter(d => d.life > 0 && d.y < WATER_Y + 2);
    for (const s of this.sparkles) { s.y -= 12 * dt; s.life -= dt; }
    this.sparkles = this.sparkles.filter(s => s.life > 0);
    if (engine.phase === 'wait' && Math.random() < dt * 0.6) this.ripples.push({ x: this.castX + 2, y: WATER_Y, r: 1, life: 0.9 });
    this.art.updateParticles(this.season, dt);
    this.engine = engine;
  }

  // --- Dibujo ---
  dot(x, y, col) { this.ctx.fillStyle = col; this.ctx.fillRect(snap(x), snap(y), 1, 1); }
  line(a, b, col, step = 0.5) {
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
    for (let i = 0; i <= n; i++) this.dot(a.x + (b.x - a.x) * i / n, a.y + (b.y - a.y) * i / n, col);
  }
  curve(a, b, sag, col) {
    const c = { x: (a.x + b.x) / 2, y: Math.max(a.y, b.y) + sag };
    for (let i = 0; i <= 60; i++) {
      const u = i / 60, x = (1 - u) ** 2 * a.x + 2 * (1 - u) * u * c.x + u * u * b.x, y = (1 - u) ** 2 * a.y + 2 * (1 - u) * u * c.y + u * u * b.y;
      this.dot(x, y, col);
    }
  }
  arc(fromDeg, toDeg, color, dashed = false, r = ROD_LEN + 6) {
    const p = this.pivot, lo = Math.min(fromDeg, toDeg), hi = Math.max(fromDeg, toDeg);
    for (let d = lo; d <= hi; d += 1.2) {
      if (dashed && Math.floor((d - lo) / 4) % 2) continue;
      const a = d * Math.PI / 180;
      for (const rr of [r, r + 1, r + 2]) this.dot(p.x + Math.cos(a) * rr, p.y - Math.sin(a) * rr, rr === r + 1 ? color : mix(color, INK, 0.35));
    }
  }

  render() {
    const { ctx, view } = this, e = this.engine;
    if (!this.bg || this.bgR !== getPixelScale() || this.bg.width !== view.width * this.bgR) this.buildBackground();
    ctx.drawImage(this.bg, 0, 0, view.width, H);
    // Brillos suaves del agua.
    for (let i = 0; i < 5; i++) {
      const y = WATER_Y + 6 + i * 8, x = ((hash(i) * view.width + this.t * (3 + i)) % (view.width + 20)) - 10;
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(snap(x), y, 6 + i, 1);
    }
    if (!e) return;
    const ph = e.phase, cal = e.calib, th = e.thresholds();
    const since = this.t - this.phaseWall;

    // Cubo y zorro.
    draw(ctx, bucketSprite(e.rounds.filter(r => r?.caughtAt).length), 8, DOCK_Y - 12);
    const happy = ph === 'caught' && since > 0.6;
    draw(ctx, foxSitSprite({ blink: !happy && Math.floor(this.t * 0.4) % 6 === 0, happy }), this.foxLeft, this.foxTop);

    this.gauge(e, th);

    // Caña.
    const p = this.pivot, tip = this.tipAt(this.rodDeg), a = this.rodDeg * Math.PI / 180;
    const mid = { x: p.x + Math.cos(a) * 18, y: p.y - Math.sin(a) * 18 };
    this.line(p, mid, '#4f3219'); this.line({ x: p.x, y: p.y + 1 }, { x: mid.x, y: mid.y + 1 }, '#6a4422');
    this.line(mid, tip, '#7a5232');
    this.dot(p.x - 1, p.y + 1, '#9aa0a6'); this.dot(p.x, p.y + 2, '#9aa0a6');
    if (ph === 'reel' && e.inBand && Math.sin(this.t * 10) > 0) this.dot(tip.x, tip.y - 1, '#fff6a0');

    // Sedal, corcho y pez.
    const bob = bobberSprite();
    if (ph.startsWith('calib') || ph === 'cast') {
      const b = { x: tip.x, y: tip.y + 12 };
      this.line(tip, b, '#e8e4dc', 0.7); draw(ctx, bob, b.x - 2, b.y);
    } else if (ph === 'casting') {
      const u = Math.min(1, since / 0.9), from = this.castFrom ?? tip, to = { x: this.castX, y: WATER_Y - 3 };
      const b = { x: from.x + (to.x - from.x) * u, y: from.y + (to.y - from.y) * u - Math.sin(u * Math.PI) * 26 };
      this.curve(tip, b, 4, '#e8e4dc'); draw(ctx, bob, b.x - 2, b.y);
      if (u >= 1 && !this.landed) { this.landed = true; this.splash(this.castX + 2, WATER_Y, 5); }
    } else if (ph === 'wait' || ph === 'bite') {
      this.landed = false;
      const nib = ph === 'wait' && e.nibbling;
      const dip = ph === 'bite' ? 4 : nib ? (Math.sin(this.t * 14) > 0.4 ? 1 : 0) : Math.round(Math.sin(this.t * 2.5) * 0.6);
      const b = { x: this.castX, y: WATER_Y - 3 + dip };
      this.curve(tip, { x: b.x + 2, y: b.y }, 10, '#e8e4dc');
      draw(ctx, bob, b.x, b.y);
      if (ph === 'wait') {
        const kind = e.C.sequence[e.roundIndex];
        const approach = nib ? 6 : 40 - Math.min(34, since * 8);
        ctx.globalAlpha = 0.45; draw(ctx, fishShadow(kind), b.x + approach + Math.sin(this.t * 3) * 1.5, WATER_Y + 7); ctx.globalAlpha = 1;
      }
      ctx.fillStyle = mix(this.season.sky[3], '#2f6b86', 0.5); ctx.fillRect(snap(b.x) - 1, WATER_Y + 2, 6, 3);
      if (ph === 'bite') this.exclaim(b.x + 2, b.y - 16);
    } else if (ph === 'reel') {
      const f = this.fishPos(e), kind = e.round.fish;
      const wig = Math.sin(this.t * 16) * 1.2;
      this.line(tip, { x: f.x, y: f.y }, '#f2efe8', 0.6);
      ctx.globalAlpha = 0.85; draw(ctx, fishSprite(kind), f.x + wig, f.y); ctx.globalAlpha = 1;
      if (Math.random() < 0.06) this.splash(f.x + 4, WATER_Y, 3);
      this.progressBar(f.x - 2, WATER_Y - 14, e.reelProgress);
    } else if (ph === 'caught' && this.caughtFrom) {
      const u = Math.min(1, since / 0.9), to = { x: 12, y: DOCK_Y - 16 }, kind = e.round?.fish ?? 'small';
      const fx = this.caughtFrom.x + (to.x - this.caughtFrom.x) * u, fy = this.caughtFrom.y + (to.y - this.caughtFrom.y) * u - Math.sin(u * Math.PI) * 40;
      if (u < 1) { this.curve(tip, { x: fx, y: fy }, 0, '#e8e4dc'); draw(ctx, fishSprite(kind), fx, fy); }
      else if (Math.random() < 0.3) this.sparkles.push({ x: 10 + Math.random() * 12, y: DOCK_Y - 14, life: 0.6 });
    }

    // Ondas, gotas, chispas y partículas de estación.
    for (const r of this.ripples) {
      const col = `rgba(255,255,255,${Math.max(0, r.life * 0.5)})`;
      for (let d = 0; d < 360; d += 18) { const a2 = d * Math.PI / 180; ctx.fillStyle = col; ctx.fillRect(snap(r.x + Math.cos(a2) * r.r), snap(r.y + 1 + Math.sin(a2) * r.r * 0.3), 1, 1); }
    }
    for (const d of this.drops) this.dot(d.x, d.y, '#e3f1fb');
    for (const s of this.sparkles) { this.dot(s.x, s.y, '#ffd84a'); this.dot(s.x, s.y - 1, '#ffffff'); }
    this.art.drawParticles(this.t);
    this.hud(e);
  }

  // Medidor horizontal de la muñeca: se mueve como la mano en pantalla (vista espejo):
  // derecha = hacia fuera (extensión), izquierda = hacia dentro (flexión).
  gauge(e, th) {
    const { ctx, view } = this, ph = e.phase, cal = e.calib;
    const w = Math.min(150, Math.round(view.width * 0.42)), left = Math.round((view.width - w) / 2) + 10, right = left + w, y = H - 15;
    const mid = Math.round(left + w * 0.4);
    const ext = cal.extRange ?? Math.max(10, cal.maxRel), flex = cal.flexRange ?? Math.max(10, -cal.minRel);
    const xOf = rel => Math.round(rel >= 0 ? mid + Math.min(1, rel / ext) * (right - mid) : mid - Math.min(1, -rel / flex) * (mid - left));
    panel(ctx, left - 14, y - 5, w + 28, 12);
    ctx.fillStyle = '#d7c4a4'; ctx.fillRect(left, y - 1, w, 4);
    const zone = (a, b, col) => { const x0 = Math.min(xOf(a), xOf(b)), x1 = Math.max(xOf(a), xOf(b)); ctx.fillStyle = col; ctx.fillRect(x0, y - 1, Math.max(2, x1 - x0), 4); };
    const blink = Math.floor(this.t * 3) % 2 === 0;
    if (th && ph === 'cast') zone(th.cast, -flex, blink ? '#5aa9e6' : '#3f86c0');
    if (th && ph === 'bite') zone(th.hook, ext, blink ? '#ffd84a' : '#e0b030');
    if (th && ph === 'reel' && e.round?.band) zone(e.round.band[0], e.round.band[1], e.inBand ? '#7be05a' : '#4f9e3c');
    if (th && (ph === 'wait' || ph === 'calib-return')) zone(th.neutralLo, th.neutralHi, '#bfe3f2');
    ctx.fillStyle = '#8a7a60'; ctx.fillRect(mid, y - 2, 1, 6);
    const out = ph === 'calib-up' || ph === 'bite' || (ph === 'reel' && e.bandSide < 0);
    const inn = ph === 'calib-down' || ph === 'cast' || (ph === 'reel' && e.bandSide > 0);
    const arrow = (cx, dir, on) => {
      ctx.fillStyle = on ? (blink ? '#e8742a' : '#b5501f') : '#c9b99c';
      for (let i = 0; i < 4; i++) ctx.fillRect(cx + dir * i, y + 1 - i, 1, 1 + i * 2);
    };
    arrow(left - 10, -1, inn); arrow(right + 9, 1, out);
    const mx = snap(xOf(e.rel));
    ctx.fillStyle = INK; ctx.fillRect(mx - 1, y - 4, 3, 10);
    ctx.fillStyle = '#e8742a'; ctx.fillRect(mx, y - 3, 1, 8);
  }

  exclaim(x, y) {
    const { ctx } = this;
    if (Math.floor(this.t * 6) % 2) return;
    panel(ctx, snap(x) - 4, snap(y), 9, 12);
    ctx.fillStyle = '#d8263a'; ctx.fillRect(snap(x) - 1, snap(y) + 2, 2, 5); ctx.fillRect(snap(x) - 1, snap(y) + 8, 2, 2);
  }
  progressBar(x, y, p) {
    const { ctx } = this;
    panel(ctx, snap(x) - 2, snap(y), 26, 7);
    ctx.fillStyle = '#d7c4a4'; ctx.fillRect(snap(x) + 1, snap(y) + 2, 20, 3);
    ctx.fillStyle = '#6cc04f'; ctx.fillRect(snap(x) + 1, snap(y) + 2, Math.round(20 * p), 3);
  }
  hud(e) {
    const { ctx, view } = this;
    const caught = e.rounds.filter(r => r?.caughtAt).length, label = `${caught}/${e.C.sequence.length}`;
    panel(ctx, 4, 4, 26 + label.length * 6, 15);
    draw(ctx, fishSprite('small'), 7, 8);
    let x = 27;
    for (const ch of label) { const g = glyph(ch, '#5a3420'); if (g) draw(ctx, g, x, 8); x += 6; }
    panel(ctx, view.width - 21, 4, 17, 18);
    draw(ctx, handSprite(this.hand), view.width - 18, 7);
  }

  resize() {
    const cw = this.canvas.clientWidth || window.innerWidth, ch = this.canvas.clientHeight || window.innerHeight;
    this.view.width = Math.max(240, Math.min(440, Math.round(H * cw / Math.max(1, ch))));
    const k = Math.min(4, Math.max(1, Math.ceil(ch * (window.devicePixelRatio || 1) / H)));
    this.canvas.width = this.view.width * k; this.canvas.height = H * k;
    this.ctx.setTransform(k, 0, 0, k, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
    setPixelScale(k);
    this.bg = null;
  }

  dispose() { this.bg = null; }
}
