// Efectos chiptune con WebAudio (sin archivos). Se crea tras un gesto del usuario.

export function createAudio() {
  let ctx = null, muted = false;
  const ensure = () => {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) ctx = new AC();
    }
    if (ctx?.state === 'suspended') ctx.resume();
    return ctx;
  };
  function tone(freqs, { type = 'square', step = 0.06, gain = 0.06, slide = 0 } = {}) {
    if (muted || !ensure()) return;
    const t0 = ctx.currentTime;
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator(), g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(f, t0 + i * step);
      if (slide) osc.frequency.linearRampToValueAtTime(f + slide, t0 + (i + 1) * step);
      g.gain.setValueAtTime(gain, t0 + i * step);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + (i + 1) * step);
      osc.connect(g).connect(ctx.destination);
      osc.start(t0 + i * step);
      osc.stop(t0 + (i + 1) * step + 0.01);
    });
  }
  return {
    unlock: ensure,
    jump: () => tone([392], { step: 0.12, slide: 260 }),
    berry: () => tone([988, 1319], { step: 0.07, gain: 0.05 }),
    hit: () => tone([180, 120], { type: 'triangle', step: 0.09, gain: 0.12 }),
    count: () => tone([660], { step: 0.12, gain: 0.05 }),
    go: () => tone([880], { step: 0.25, gain: 0.05 }),
    finish: () => tone([523, 659, 784, 659, 784, 1047], { step: 0.11, gain: 0.05 }),
    toggle() { muted = !muted; return muted; },
    get muted() { return muted; },
    close() { ctx?.close(); ctx = null; },
  };
}
