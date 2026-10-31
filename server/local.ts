// Local / self-hosted server: `npm run dev` (with Vite) or `npm start` (serves the built site from dist/).
// On Vercel this file is not used: the same handler runs from api/rpc.ts.
import express from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { aiOn, checkAi, modelName, provider } from './ai.js';
import { handle } from './handler.js';

// Load .env from the folder the server was started in, then from the project root, so it works however the server is launched. Real environment variables always win.
for (const f of ['.env', join(import.meta.dirname, '..', '.env')]) { try { process.loadEnvFile(f); break; } catch { /* not there */ } }

const app = express();
app.use(express.json({ limit: '6mb' }));
app.post('/api/rpc', async (req, res) => { const out = await handle(req.body ?? {}); res.status(out.status).json(out.body); });
app.get('/api/health', async (_q, res) => { const out = await handle({ method: 'GET', path: '/health' }); res.status(out.status).json(out.body.data); });

const dist = join(process.cwd(), 'dist');
if (existsSync(dist)) { app.use(express.static(dist)); app.get('*', (_q, res) => res.sendFile(join(dist, 'index.html'))); }

const port = Number(process.env.PORT || 3001);
app.listen(port, () => {
  console.log(`Adhyora API on http://localhost:${port} (AI ${aiOn() ? `on: ${provider()}, ${modelName()}` : 'OFF: no ANTHROPIC_API_KEY or GEMINI_API_KEY'})`);
  if (aiOn()) checkAi().then((r) => console.log(r.ok ? 'AI check: OK' : 'AI check FAILED: ' + r.message));
});
