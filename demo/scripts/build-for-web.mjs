// Compila la plataforma (app de juegos + dashboard del médico) con base /plataforma/.
//
//   node scripts/build-for-web.mjs --vercel
//       → dist-vercel/plataforma/ : lo que despliega el proyecto de Vercel de la plataforma
//         (vercel.json). fixedgap.com/plataforma lo sirve a través de un rewrite de la web.
//   node scripts/build-for-web.mjs <ruta-al-repo-de-la-web>
//       → <web>/public/plataforma/ (método antiguo: copia estática dentro de la web).
//
// No toca demo/public/dashboard (el desarrollo local sigue en «/»).

import { execSync } from 'node:child_process';
import { cpSync, rmSync, existsSync, mkdtempSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = '/plataforma/';
const demo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const povmedico = resolve(demo, '../povmedico');
const vercel = process.argv.includes('--vercel');
const web = !vercel && process.argv[2] ? resolve(process.argv[2]) : null;
if (!vercel && (!web || !existsSync(join(web, 'next.config.ts')))) {
  console.error('Uso: node scripts/build-for-web.mjs --vercel | <ruta-al-repo-de-la-web (con next.config.ts)>');
  process.exit(1);
}
const env = { ...process.env, FIXEDGAP_BASE: BASE };
const run = (cmd, cwd) => { console.log(`\n$ ${cmd}   (${cwd})`); execSync(cmd, { cwd, env, stdio: 'inherit' }); };

// 1. Dashboard del médico con base /plataforma/dashboard/ (a una carpeta temporal).
const dash = mkdtempSync(join(tmpdir(), 'fixedgap-dashboard-'));
if (!existsSync(join(povmedico, 'node_modules'))) run('npm ci', povmedico);
run(`npx vite build --outDir "${dash}" --emptyOutDir`, povmedico);

// 2. App de juegos con base /plataforma/.
run('npm run build', demo);
const dist = join(demo, 'dist');
rmSync(join(dist, 'dashboard'), { recursive: true, force: true });
cpSync(dash, join(dist, 'dashboard'), { recursive: true });
// MediaPipe solo carga las variantes «internal» y «nosimd»; la de módulo (11 MB) sobra.
for (const f of ['vision_wasm_module_internal.js', 'vision_wasm_module_internal.wasm']) rmSync(join(dist, 'pinch-assets/wasm', f), { force: true });

// 3. Copia al destino.
const target = vercel ? join(demo, 'dist-vercel', 'plataforma') : join(web, 'public', 'plataforma');
if (vercel) rmSync(join(demo, 'dist-vercel'), { recursive: true, force: true });
rmSync(target, { recursive: true, force: true });
cpSync(dist, target, { recursive: true });
rmSync(dash, { recursive: true, force: true });

const size = dir => readdirSync(dir).reduce((s, f) => { const p = join(dir, f), st = statSync(p); return s + (st.isDirectory() ? size(p) : st.size); }, 0);
console.log(`\n✓ Plataforma copiada a ${target} (${(size(target) / 1e6).toFixed(1)} MB). Base: ${BASE}`);
