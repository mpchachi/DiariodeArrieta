import { it } from 'node:test';
import assert from 'node:assert/strict';
import { PinchCamera } from './pinchCamera.js';

function setup(t) {
  const saved = new Map();
  const set = (key, value) => { saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value }); };
  t.after(() => { for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });
  const callbacks = new Map(); let id = 0, stopped = 0, closed = 0;
  const stream = { getTracks: () => [{ stop: () => stopped++, addEventListener() {}, removeEventListener() {} }] };
  const canvas = () => ({ width: 0, height: 0, getContext: () => ({ setTransform() {}, drawImage() {},
    getImageData: () => ({ data: new Uint8ClampedArray(24 * 24 * 4).fill(100) }) }) });
  set('window', { isSecureContext: true, addEventListener() {}, removeEventListener() {} });
  set('document', { hidden: false, createElement: canvas, addEventListener() {}, removeEventListener() {} });
  set('navigator', { mediaDevices: { getUserMedia: async () => stream } });
  set('requestAnimationFrame', callback => { callbacks.set(++id, callback); return id; });
  set('cancelAnimationFrame', key => callbacks.delete(key));
  const video = { srcObject: null, readyState: 4, videoWidth: 640, videoHeight: 480, currentTime: 1, play: async () => {} };
  const times = [], frames = [], errors = [];
  const model = { close: () => closed++, detectForVideo: (_, timestamp) => { times.push(timestamp); return { landmarks: [] }; } };
  const camera = new PinchCamera({ create: async () => model, onFrame: f => frames.push(f), onError: e => errors.push(e) });
  const tick = () => { const [key, cb] = callbacks.entries().next().value; callbacks.delete(key); cb(); };
  return { camera, video, model, stream, callbacks, tick, frames, errors, times, stopped: () => stopped, closed: () => closed };
}

it('la captura procesa imágenes nuevas, programa un solo RAF y libera cámara/modelo', async t => {
  const env = setup(t);
  assert.equal(await env.camera.start(env.video), true);
  for (let i = 0; i < 4; i++) { env.video.currentTime += .033; env.tick(); assert.equal(env.callbacks.size, 1); }
  assert.equal(env.frames.length, 4);
  env.tick(); assert.equal(env.frames.length, 4);
  assert.ok(Math.abs(env.times[0] - 1033) < 1e-6);
  env.camera.stop();
  assert.equal(env.callbacks.size, 0); assert.equal(env.video.srcObject, null);
  assert.equal(env.stopped(), 1); assert.equal(env.closed(), 1);
});

it('un permiso que llega después de detener no deja una cámara encendida', async t => {
  const env = setup(t); let resolve;
  navigator.mediaDevices.getUserMedia = () => new Promise(r => { resolve = r; });
  const pending = env.camera.start(env.video);
  env.camera.stop(); resolve(env.stream);
  assert.equal(await pending, false); assert.equal(env.stopped(), 1); assert.equal(env.callbacks.size, 0);
});

it('un modelo que acaba de cargar tras detener se cierra', async t => {
  const env = setup(t); let resolve;
  env.camera.create = () => new Promise(r => { resolve = r; });
  const pending = env.camera.start(env.video);
  await new Promise(r => setImmediate(r));
  env.camera.stop(); resolve(env.model);
  assert.equal(await pending, false); assert.equal(env.closed(), 1); assert.equal(env.callbacks.size, 0);
});

it('falla GPU y recurre a CPU sin cambiar el contrato de captura', async t => {
  const env = setup(t), attempts = [];
  env.camera.create = async delegate => { attempts.push(delegate); if (delegate === 'GPU') throw new Error('GPU unavailable'); return env.model; };
  assert.equal(await env.camera.start(env.video), true);
  assert.deepEqual(attempts, ['GPU', 'CPU']); assert.equal(env.camera.delegate, 'CPU');
  env.camera.stop();
});

it('usa mediaTime del callback de vídeo, no el reloj del renderizado', async t => {
  const env = setup(t); let callback, canceled = false;
  env.video.currentTime = 90;
  env.video.requestVideoFrameCallback = cb => { callback = cb; return 8; };
  env.video.cancelVideoFrameCallback = key => { canceled = key === 8; };
  await env.camera.start(env.video);
  callback(99999, { mediaTime: 2.75 });
  assert.deepEqual(env.times, [2750]); assert.equal(env.frames[0].t, 2750);
  assert.equal(env.callbacks.size, 0);
  env.camera.stop(); assert.equal(canceled, true);
});

it('un error de inferencia para el bucle y avisa en lugar de mantener una mano vieja', async t => {
  const env = setup(t);
  env.model.detectForVideo = () => { throw new Error('failed'); };
  await env.camera.start(env.video); env.tick();
  assert.equal(env.frames.length, 0); assert.equal(env.errors.length, 1);
  assert.equal(env.callbacks.size, 0); assert.equal(env.stopped(), 1);
});
