import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';

// Official NASA Solar System Exploration 3D GLB model URLs (from the 11 attached NASA HTML snapshots)
const NASA_GLB_SOURCES: Record<string, string> = {
  sun: 'https://solarsystem.nasa.gov/rails/active_storage/blobs/redirect/eyJfcmFpbHMiOnsibWVzc2FnZSI6IkJBaHBBblVRIiwiZXhwIjpudWxsLCJwdXIiOiJibG9iX2lkIn19--abda6331ea1271cb16bf7b8b08f42b0ad49115b2/Sun_1_1391000.glb',
  mercury: 'https://solarsystem.nasa.gov/rails/active_storage/blobs/redirect/eyJfcmFpbHMiOnsibWVzc2FnZSI6IkJBaHBBc0lRIiwiZXhwIjpudWxsLCJwdXIiOiJibG9iX2lkIn19--5e8289c1b4c52f66ff97e4d5d6d51b0059a7bf90/Mercury_1_4878.glb',
  venus: 'https://solarsystem.nasa.gov/rails/active_storage/blobs/redirect/eyJfcmFpbHMiOnsibWVzc2FnZSI6IkJBaHBBa3NRIiwiZXhwIjpudWxsLCJwdXIiOiJibG9iX2lkIn19--5f5ad92049d2716b9c09198aba1df70727b272ed/Venus(surface)_1_12103.glb',
  earth: 'https://solarsystem.nasa.gov/rails/active_storage/blobs/redirect/eyJfcmFpbHMiOnsibWVzc2FnZSI6IkJBaHBBaTBSIiwiZXhwIjpudWxsLCJwdXIiOiJibG9iX2lkIn19--7c1183d35fdc9e4b5143c8601376552b89b5d99f/Earth_1_12756.glb',
  moon: 'https://solarsystem.nasa.gov/rails/active_storage/blobs/redirect/eyJfcmFpbHMiOnsibWVzc2FnZSI6IkJBaHBBcllRIiwiZXhwIjpudWxsLCJwdXIiOiJibG9iX2lkIn19--7d626e5badbf2157a4fa43b9e891ab22ca767f3e/Moon_1_3474.glb',
  mars: 'https://solarsystem.nasa.gov/rails/active_storage/blobs/redirect/eyJfcmFpbHMiOnsibWVzc2FnZSI6IkJBaHBBdEFRIiwiZXhwIjpudWxsLCJwdXIiOiJibG9iX2lkIn19--9ddbf780bb3c564b8e561bb238a2f6713d445c42/Mars_1_6792.glb',
  jupiter: 'https://solarsystem.nasa.gov/rails/active_storage/blobs/redirect/eyJfcmFpbHMiOnsibWVzc2FnZSI6IkJBaHBBdDRRIiwiZXhwIjpudWxsLCJwdXIiOiJibG9iX2lkIn19--a6aec8a66b65f7cc0251efbb84d424e7348718a6/Jupiter_1_142984.glb',
  saturn: 'https://solarsystem.nasa.gov/rails/active_storage/blobs/redirect/eyJfcmFpbHMiOnsibWVzc2FnZSI6IkJBaHBBb01RIiwiZXhwIjpudWxsLCJwdXIiOiJibG9iX2lkIn19--949c201a04c03a8983b0bc33367b0098c8598033/Saturn_1_120536.glb',
  uranus: 'https://solarsystem.nasa.gov/rails/active_storage/blobs/redirect/eyJfcmFpbHMiOnsibWVzc2FnZSI6IkJBaHBBbE1RIiwiZXhwIjpudWxsLCJwdXIiOiJibG9iX2lkIn19--ce25f40673da6e48ed13a4a4495e94657fb29acc/Uranus_1_51118.glb',
  neptune: 'https://solarsystem.nasa.gov/rails/active_storage/blobs/redirect/eyJfcmFpbHMiOnsibWVzc2FnZSI6IkJBaHBBcTBRIiwiZXhwIjpudWxsLCJwdXIiOiJibG9iX2lkIn19--54e36d6798a272476d7ff54d1dc5705a65627b3e/Neptune_1_49528.glb',
  pluto: 'https://solarsystem.nasa.gov/rails/active_storage/blobs/redirect/eyJfcmFpbHMiOnsibWVzc2FnZSI6IkJBaHBBbzBRIiwiZXhwIjpudWxsLCJwdXIiOiJibG9iX2lkIn19--e71f4af790ea5d07f267c5e4667d57b1c4e1b208/Pluto_1_2374.glb',
};

const CACHE_DIR = path.join(__dirname, '.cache', 'nasa-glb');

async function createServer() {
  const app = express();

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, models: Object.keys(NASA_GLB_SOURCES) });
  });

  // Same-origin proxy + disk cache for official NASA Solar System Exploration GLB models
  app.get('/api/nasa-glb/:slug', async (req, res) => {
    const slug = String(req.params.slug || '').toLowerCase().replace(/[^a-z]/g, '');
    const sourceUrl = NASA_GLB_SOURCES[slug];
    if (!sourceUrl) {
      res.status(404).json({ error: 'Unknown NASA 3D model slug' });
      return;
    }

    const cacheFile = path.join(CACHE_DIR, `${slug}.glb`);
    try {
      const cached = await fs.readFile(cacheFile);
      res.setHeader('Content-Type', 'model/gltf-binary');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.send(cached);
      return;
    } catch {
      // Cache miss; fetch from official NASA URL
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const upstream = await fetch(sourceUrl, {
        redirect: 'follow',
        signal: controller.signal,
        headers: { 'User-Agent': 'Astrix-NASA-Space-Simulator/1.0' },
      });
      if (!upstream.ok) {
        res.status(502).json({ error: `NASA upstream returned ${upstream.status}` });
        return;
      }
      const buf = Buffer.from(await upstream.arrayBuffer());
      await fs.mkdir(CACHE_DIR, { recursive: true });
      await fs.writeFile(cacheFile, buf).catch(() => {});
      res.setHeader('Content-Type', 'model/gltf-binary');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.send(buf);
    } catch (err) {
      res.status(504).json({ error: err instanceof Error ? err.message : 'NASA GLB fetch failed' });
    } finally {
      clearTimeout(timeout);
    }
  });

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Astrix server running on http://0.0.0.0:${PORT}`);
  });
}

createServer();
