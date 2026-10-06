// Fondo de las pantallas del viaje: el mismo bosque pixel con el zorro corriendo
// despacio (sensación de viaje continuo entre capítulos).

import { RUNNER_CONFIG as C } from '../runner/config.js';
import { createArt } from '../runner/art.js';
import { setPixelScale } from '../pixel/sprite.js';
import { SEASONS } from '../pixel/seasons.js';

export class TravelScene {
  constructor(canvas, { season = 0, running = true } = {}) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.season = SEASONS[season] ?? SEASONS[0];
    this.running = running; this.scroll = 0; this.t = 0; this.last = performance.now();
    this.view = { width: C.width, height: C.height, groundY: C.groundY, top: C.cropTop ?? 0 };
    if (!this.ctx) return;
    this.art = createArt(this.ctx, this.view);
    this.fit = this.fit.bind(this); this.fit();
    window.addEventListener('resize', this.fit);
    this.raf = requestAnimationFrame(now => this.loop(now));
  }

  fit() {
    const viewH = C.height - this.view.top, ch = this.canvas.clientHeight || window.innerHeight, cw = this.canvas.clientWidth || window.innerWidth;
    this.view.width = Math.max(C.minWidth, Math.min(C.maxWidth, Math.round(viewH * cw / Math.max(1, ch))));
    const k = Math.min(4, Math.max(1, Math.ceil(ch * (window.devicePixelRatio || 1) / viewH)));
    this.canvas.width = this.view.width * k; this.canvas.height = viewH * k;
    this.ctx.setTransform(k, 0, 0, k, 0, -this.view.top * k);
    this.ctx.imageSmoothingEnabled = false;
    setPixelScale(k);
  }

  loop(now) {
    if (this.stopped) return;
    this.raf = requestAnimationFrame(n => this.loop(n));
    // El primer sello de rAF puede ser anterior a performance.now(): dt nunca negativo.
    const dt = Math.max(0, Math.min(0.05, (now - this.last) / 1000)); this.last = now; this.t += dt;
    if (this.running) this.scroll += C.speed * 0.6 * dt;
    this.art.background(this.season, this.scroll);
    this.art.fox(Math.round(this.view.width * 0.5), C.groundY, { onGround: true, vy: 0, frame: Math.floor(Math.max(0, this.scroll) / 7) % 4, t: this.t });
  }

  stop() { this.stopped = true; cancelAnimationFrame(this.raf); window.removeEventListener('resize', this.fit); }
}
