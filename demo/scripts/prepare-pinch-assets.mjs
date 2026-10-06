import { mkdir, readFile, writeFile, copyFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const target = join(root, 'public', 'pinch-assets');
const require = createRequire(import.meta.url);
const installed = dirname(require.resolve('@mediapipe/tasks-vision'));
const pkg = JSON.parse(await readFile(join(installed, 'package.json'), 'utf8'));
if (pkg.version !== '0.10.35') throw new Error('La versión de MediaPipe del protocolo debe ser 0.10.35.');
await mkdir(join(target, 'wasm'), { recursive: true });
const modelPath = join(target, 'hand_landmarker.task');
const modelUrl = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const modelSha = 'fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1';
const digest = data => createHash('sha256').update(data).digest('hex');
let model;
try { model = await readFile(modelPath); } catch (error) { if (error.code !== 'ENOENT') throw error; }
if (!model) {
  const response = await fetch(modelUrl);
  if (!response.ok) throw new Error(`No se pudo descargar el modelo: HTTP ${response.status}`);
  model = Buffer.from(await response.arrayBuffer());
}
const modelHash = digest(model);
if (modelHash !== modelSha) throw new Error(`El hash del modelo no coincide: ${modelHash}`);
await writeFile(modelPath, model);
const manifest = { library: '@mediapipe/tasks-vision', version: pkg.version, modelUrl, sha256: { 'hand_landmarker.task': modelHash } };
for (const name of await readdir(join(installed, 'wasm'))) {
  if (!/\.(js|wasm)$/.test(name)) continue;
  await copyFile(join(installed, 'wasm', name), join(target, 'wasm', name));
  manifest.sha256[`wasm/${name}`] = digest(await readFile(join(target, 'wasm', name)));
}
await writeFile(join(target, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`Recursos locales de pinza preparados: MediaPipe ${pkg.version}.`);
