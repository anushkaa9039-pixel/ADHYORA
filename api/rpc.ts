// Vercel function: every request from the app goes through here. See server/handler.ts.
import { handle, readJsonBody } from '../server/handler.js';

export default async function handler(req: any, res: any) {
  const send = (status: number, body: unknown) => {
    res.statusCode = status;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    res.end(JSON.stringify(body));
  };
  if (req.method !== 'POST') return send(405, { error: 'Use POST.' });
  try {
    const input = await readJsonBody(req);
    const out = await handle((input ?? {}) as Record<string, unknown>);
    send(out.status, out.body);
  } catch (e: any) {
    console.error(e);
    send(e?.status === 413 ? 413 : 500, { error: e?.status === 413 ? e.message : 'Something went wrong on the server.' });
  }
}
