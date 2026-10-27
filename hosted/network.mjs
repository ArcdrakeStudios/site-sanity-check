import { createFetcher, LIMITS } from '../src/network.mjs';
import { CheckError, isPublicAddress, normalize } from '../src/safety.mjs';

// Safety also depends on global_fetch_strictly_public and no private-network
// bindings. DNS preflight alone is NOT DNS pinning.
export async function readBounded(response, maxBytes, signal) {
  signal?.throwIfAborted();
  if (Number(response.headers.get('content-length')) > maxBytes) {
    await response.body?.cancel(); throw new CheckError('body_limit');
  }
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks = []; let size = 0;
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    for (;;) {
      const { done, value } = await reader.read();
      signal?.throwIfAborted(); if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new CheckError('body_limit');
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return new TextDecoder().decode(bytes);
  } finally { cancel(); signal?.removeEventListener('abort', cancel); }
}

export function createWorkerFetcher({ signal, fetchImpl = fetch, requestMs = LIMITS.requestMs } = {}) {
  const resolve = async (hostname, parentSignal) => {
    const host = hostname.replace(/^\[|\]$/g, '');
    if (/^[\d.]+$/.test(host) || host.includes(':')) throw new CheckError('hostname_required');
    const deadline = AbortSignal.any([parentSignal, AbortSignal.timeout(2000)]);
    const addresses = [];
    for (const type of ['A', 'AAAA']) {
      const url = new URL('https://cloudflare-dns.com/dns-query');
      url.searchParams.set('name', host); url.searchParams.set('type', type);
      let response;
      try {
        response = await fetchImpl(url.href, { redirect: 'manual', signal: deadline,
          headers: { Accept: 'application/dns-json' }, cache: 'no-store' });
        if (!response.ok || !response.headers.get('content-type')?.startsWith('application/dns-json')) throw Error();
        const data = JSON.parse(await readBounded(response, 16384, deadline));
        if (![0, 3].includes(data.Status) || data.TC) throw Error();
        for (const answer of data.Answer ?? []) if ([1, 28].includes(answer.type)) addresses.push(answer.data);
      } catch { await response?.body?.cancel().catch(() => {}); throw new CheckError('dns_failed'); }
    }
    if (!addresses.length) throw new CheckError('dns_failed');
    if (addresses.length > 32 || addresses.some(ip => !isPublicAddress(ip))) throw new CheckError('unsafe_address');
    return { address: addresses[0] }; // Preflight evidence, not a pinned connection.
  };
  const transport = async (url, _preflight, parentSignal) => {
    normalize(url.href);
    const deadline = AbortSignal.any([parentSignal, AbortSignal.timeout(requestMs)]);
    let response;
    try {
      response = await fetchImpl(url.href, { method: 'GET', redirect: 'manual', signal: deadline,
        cache: 'no-store', headers: { 'User-Agent': 'SiteSanityCheck/0.1 (bounded passive check)',
          Accept: 'text/html,text/plain,text/javascript,application/javascript,text/css;q=0.5', 'Accept-Encoding': 'identity' } });
      let headerBytes = 0;
      for (const [name, value] of response.headers) headerBytes += new TextEncoder().encode(name + value).byteLength;
      if (headerBytes > 16384) throw new CheckError('header_limit');
      const headers = Object.fromEntries(response.headers);
      if ([301,302,303,307,308].includes(response.status)) {
        await response.body?.cancel(); return { status: response.status, headers, body: '', tls: null };
      }
      if (headers['content-encoding'] && headers['content-encoding'] !== 'identity') throw new CheckError('unsupported_encoding');
      if (!/^(?:text\/(?:html|plain|css|javascript)|application\/(?:javascript|x-javascript))(?:;|$)/i.test(headers['content-type'] ?? '')) throw new CheckError('unsupported_content');
      const charset = headers['content-type']?.match(/charset\s*=\s*["']?([^;\s"']+)/i)?.[1];
      if (charset && !/^(?:utf-8|utf8|us-ascii)$/i.test(charset)) throw new CheckError('unsupported_encoding');
      const body = await readBounded(response, LIMITS.bytes, deadline);
      return { status: response.status, headers, body, tls: null };
    } catch (error) {
      await response?.body?.cancel().catch(() => {});
      throw new CheckError(parentSignal.aborted ? 'cancelled' : deadline.aborted ? 'request_timeout' :
        error instanceof CheckError ? error.code : 'connection_failed');
    }
  };
  return createFetcher({ signal, resolve, transport });
}
