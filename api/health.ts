// Open https://YOUR-SITE/api/health to see whether the backend runs and whether an AI key is set. It never shows the key.
import { handle } from '../server/handler.js';

export default async function handler(_req: any, res: any) {
  const out = await handle({ method: 'GET', path: '/health' });
  res.statusCode = out.status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(out.body.data ?? out.body));
}
