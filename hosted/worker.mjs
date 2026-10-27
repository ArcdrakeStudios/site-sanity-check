import { Container, getContainer } from '@cloudflare/containers';
import { admit } from './admission.mjs';

export class ScannerContainer extends Container {
  defaultPort = 43148;
  sleepAfter = '1m';
  enableInternet = true;
  constructor(ctx, env) {
    super(ctx, env);
    this.envVars = { NODE_ENV: 'production', SCANNER_LISTEN_HOST: '0.0.0.0',
      PORT: '43148', SCANNER_SECRET: env.SCANNER_SECRET ?? '' };
  }
  async fetch(request) {
    const error = await admit(this.ctx.storage);
    if (error) return Response.json({ error }, { status: 429, headers: { 'Cache-Control': 'no-store' } });
    return this.containerFetch(request);
  }
}

// Private service binding only: no routes, workers.dev or preview URL.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method !== 'POST' || url.origin !== 'https://scanner.internal' || url.search ||
        !['/scan', '/demo'].includes(url.pathname) || request.headers.get('Origin') !== 'https://tools.arcdrake.com' ||
        typeof env.SCANNER_SECRET !== 'string' || env.SCANNER_SECRET.length < 32 ||
        request.headers.get('Authorization') !== `Bearer ${env.SCANNER_SECRET}`)
      return Response.json({ error: 'request_denied' }, { status: 403 });
    return getContainer(env.SCANNER, 'single-release-v1').fetch(request);
  },
};
