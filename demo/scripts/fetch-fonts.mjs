// Descarga una vez los woff2 (subconjunto latin) de Nunito e Inter y escribe public/fonts/fonts.css.
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const out = process.argv[2];
await mkdir(out, { recursive: true });
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';
const url = 'https://fonts.googleapis.com/css2?family=Nunito:wght@600;700;800&family=Inter:wght@500;600;700&display=swap';
const css = await (await fetch(url, { headers: { 'User-Agent': UA } })).text();
const blocks = css.split('}').filter(b => /\/\* latin \*\//.test(b));
let outCss = '/* Autohospedadas: Nunito e Inter (subconjunto latin, OFL). Generado por scripts/fetch-fonts.mjs */\n';
for (const b of blocks) {
  const fam = b.match(/font-family:\s*'([^']+)'/)[1];
  const w = b.match(/font-weight:\s*(\d+)/)[1];
  const src = b.match(/url\((https:[^)]+)\)/)[1];
  const file = `${fam.toLowerCase()}-${w}.woff2`;
  const buf = Buffer.from(await (await fetch(src)).arrayBuffer());
  await writeFile(join(out, file), buf);
  outCss += `@font-face { font-family: '${fam}'; font-style: normal; font-weight: ${w}; font-display: swap; src: url('./${file}') format('woff2'); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }\n`;
  console.log(file, buf.length);
}
await writeFile(join(out, 'fonts.css'), outCss);
