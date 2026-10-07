import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';

// FIXEDGAP_BASE: ruta donde se publica la app (p. ej. «/plataforma/» dentro de fixedgap.com).
// En desarrollo, «/». Todo lo interno usa import.meta.env.BASE_URL, así que funciona bajo cualquier ruta.
export default defineConfig({
  base: process.env.FIXEDGAP_BASE || '/',
  server: {
    open: true,
    // Fixed, stable origin so localStorage (Alpha's session history) persists
    // across days. 'host:true' + a shifting port would change the origin and
    // make previous sessions "disappear".
    host: 'localhost',
    port: 5173,
    strictPort: true,
  },
  build: {
    target: 'esnext',
    minify: 'oxc',
    rolldownOptions: {
      input: {
        main: path.resolve(import.meta.dirname, 'index.html'),
        pinch: path.resolve(import.meta.dirname, 'pinch.html'),
        runner: path.resolve(import.meta.dirname, 'runner.html'),
        flappy: path.resolve(import.meta.dirname, 'flappy.html'),
        fishing: path.resolve(import.meta.dirname, 'fishing.html'),
        garden: path.resolve(import.meta.dirname, 'garden.html'),
        tutorial: path.resolve(import.meta.dirname, 'tutorial.html'),
      },
    },
  },
  plugins: [
    {
      name: 'serve-dashboard',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url && req.url.startsWith('/dashboard')) {
            const urlPath = req.url.replace(/\?.*$/, '');
            const filePath = path.join(process.cwd(), 'public', urlPath);

            if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
              return next();
            }

            const indexPath = path.join(process.cwd(), 'public', 'dashboard', 'index.html');
            res.setHeader('Content-Type', 'text/html');
            res.end(fs.readFileSync(indexPath, 'utf-8'));
            return;
          }
          next();
        });
      },
    },
  ],
});
