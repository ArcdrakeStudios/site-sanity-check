// Private Node backend for the hosted Tools edition. Never expose the local
// application's loopback API by simply relaxing its Host/Origin checks.
import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { scan, demo } from './src/checks.mjs';
import { normalize } from './src/safety.mjs';

export function createHostedApp({ secret, scanner = scan, now = Date.now } = {}) {
  if (typeof secret !== 'string' || Buffer.byteLength(secret) < 32) throw Error('Scanner secret must have at least 32 bytes');
  const expected = Buffer.from(`Bearer ${secret}`);
  let active = 0;
  const starts = [];
  const clients = new Map(), targets = new Map();
  const prune = (map, since) => {
    for (const [key, values] of map) {
      const recent = values.filter(value => value > since);
      if (recent.length) map.set(key, recent); else map.delete(key);
    }
  };
  const server = http.createServer({ maxHeaderSize: 8192, requestTimeout: 6000, headersTimeout: 5000 }, async (req, res) => {
    const send = (status, data) => {
      if (res.destroyed || res.writableEnded) return;
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff', ...(status === 429 ? { 'Retry-After': '60' } : {}) });
      res.end(JSON.stringify(data));
    };
    const auth = Buffer.from(req.headers.authorization ?? '');
    if (auth.length !== expected.length || !timingSafeEqual(auth, expected)) return send(403, { error: 'request_denied' });
    if (req.method !== 'POST' || !['/scan', '/demo'].includes(req.url)) return send(404, { error: 'not_found' });
    if (req.headers.origin !== 'https://tools.arcdrake.com' || req.headers['content-type'] !== 'application/json' ||
        !/^[a-f0-9]{64}$/.test(req.headers['x-scanner-client'] ?? '')) return send(403, { error: 'request_denied' });
    if (Number(req.headers['content-length']) > 4096) return send(413, { error: 'request_too_large' });
    let body = '';
    // An application deadline also covers slow streamed input, independently of
    // Node's periodic requestTimeout checks.
    const readTimer = setTimeout(() => { send(408, { error: 'request_failed' }); req.destroy(); }, 5000);
    try {
      for await (const chunk of req) {
        body += chunk;
        if (Buffer.byteLength(body) > 4096) return send(413, { error: 'request_too_large' });
      }
    } catch { return send(400, { error: 'request_failed' }); }
    finally { clearTimeout(readTimer); }
    let input, target;
    try {
      input = JSON.parse(body);
      if (!input || typeof input !== 'object' || Array.isArray(input) ||
          Object.keys(input).some(key => key !== 'url')) throw Error('invalid');
      if (req.url === '/scan') target = normalize(input.url);
    } catch (error) { return send(400, { error: error.code === 'unsafe_address' ? error.code : 'invalid_url' }); }
    const time = now(), since = time - 60000, client = req.headers['x-scanner-client'];
    while (starts.length && starts[0] <= since) starts.shift();
    prune(clients, since); prune(targets, since);
    const clientStarts = clients.get(client) ?? [], targetStarts = targets.get(target?.hostname) ?? [];
    if (active >= 2 || starts.length >= 10 || clientStarts.length >= 3 || targetStarts.length >= 3)
      return send(429, { error: 'rate_limit' });
    starts.push(time); clients.set(client, [...clientStarts, time]);
    if (target) targets.set(target.hostname, [...targetStarts, time]);
    active++;
    const controller = new AbortController();
    const cancel = () => controller.abort();
    res.on('close', cancel);
    const deadline = setTimeout(cancel, 26000);
    try { send(200, target ? await scanner(target.href, { signal: controller.signal }) : await demo()); }
    catch { send(400, { error: 'request_failed' }); }
    finally { clearTimeout(deadline); active--; res.removeListener('close', cancel); controller.abort(); }
  });
  const sweep = setInterval(() => {
    const since = now() - 60000;
    prune(clients, since); prune(targets, since);
    while (starts.length && starts[0] <= since) starts.shift();
  }, 5000);
  sweep.unref();
  server.once('close', () => clearInterval(sweep));
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 43148);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('Invalid PORT');
  // Container ingress is an explicit deployment setting, never a default LAN listener.
  const host = process.env.SCANNER_LISTEN_HOST ?? '127.0.0.1';
  if (!['127.0.0.1', '0.0.0.0'].includes(host)) throw Error('Invalid listen host');
  createHostedApp({ secret: process.env.SCANNER_SECRET }).listen(port, host, () => console.log('Scanner backend ready'));
}
