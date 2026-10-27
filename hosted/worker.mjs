import { admit } from './admission.mjs';
import { createWorkerFetcher, readBounded } from './network.mjs';
import { scan, demo } from '../src/checks.mjs';
import { normalize } from '../src/safety.mjs';

const send = (status, data) => Response.json(data, { status, headers: {
  'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
  ...(status === 429 ? { 'Retry-After': '60' } : {}),
} });
function authorized(request, env) {
  const url = new URL(request.url);
  return request.method === 'POST' && url.origin === 'https://scanner.internal' && !url.search &&
    ['/scan', '/demo'].includes(url.pathname) && request.headers.get('Origin') === 'https://tools.arcdrake.com' &&
    request.headers.get('Content-Type') === 'application/json' &&
    /^[a-f0-9]{64}$/.test(request.headers.get('X-Scanner-Client') ?? '') &&
    typeof env.SCANNER_SECRET === 'string' && env.SCANNER_SECRET.length >= 32 &&
    request.headers.get('Authorization') === `Bearer ${env.SCANNER_SECRET}`;
}
// Singleton SQLite Durable Object: scan compute and aggregate admission, no Container.
export class Scanner {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; this.active = 0; this.clients = new Map(); this.targets = new Map(); }
  prune(time = Date.now()) {
    for (const map of [this.clients, this.targets]) for (const [key, times] of map) {
      const recent = times.filter(t => t > time - 60000);
      if (recent.length) map.set(key, recent); else map.delete(key);
    }
  }
  async alarm() { this.prune(); }
  async fetch(request) {
    if (!authorized(request, this.env)) return send(403, { error: 'request_denied' });
    if (this.active >= 2) return send(429, { error: 'rate_limit' });
    this.active++;
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(25000)]);
    try {
      let input, target;
      try {
        input = JSON.parse(await readBounded(request, 4096, AbortSignal.any([signal, AbortSignal.timeout(5000)])));
        if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k => k !== 'url')) throw Error();
        if (new URL(request.url).pathname === '/scan') {
          target = normalize(input.url);
          if (/^[\d.]+$/.test(target.hostname) || target.hostname.includes(':')) return send(400, { error: 'hostname_required' });
        }
      } catch (error) { return send(error.code === 'body_limit' ? 413 : 400, { error: error.code === 'unsafe_address' ? error.code : 'invalid_url' }); }
      const time = Date.now(), client = request.headers.get('X-Scanner-Client'); this.prune(time);
      const clients = this.clients.get(client) ?? [], targets = this.targets.get(target?.hostname) ?? [];
      if (clients.length >= 3 || targets.length >= 3) return send(429, { error: 'rate_limit' });
      // Reserve before awaiting storage, preventing concurrent bypass.
      this.clients.set(client, [...clients, time]);
      if (target) this.targets.set(target.hostname, [...targets, time]);
      await this.ctx.storage.setAlarm(time + 65000);
      const error = await admit(this.ctx.storage);
      if (error) return send(429, { error });
      const result = target ? await scan(target.href, { signal, fetcher: createWorkerFetcher({ signal }) }) : await demo();
      if (target) {
        const https = result.families.https;
        https.notes.push('certificate_unavailable');
        if (https.state === 'ok') https.state = 'inconclusive';
        result.limitations = ['certificate_expiry_not_checked', 'no_javascript_execution', 'bounded_public_sample'];
      }
      return send(200, result);
    } catch { return send(503, { error: 'unavailable' }); }
    finally { this.active--; }
  }
}
export default {
  async fetch(request, env) {
    if (!authorized(request, env)) return send(403, { error: 'request_denied' });
    try { return await env.SCANNER.get(env.SCANNER.idFromName('single-release-v1')).fetch(request); }
    catch { return send(503, { error: 'unavailable' }); }
  },
};
