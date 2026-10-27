import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkerFetcher, readBounded } from '../hosted/network.mjs';

const dns = (url, answers = ['93.184.216.34']) => new Response(JSON.stringify({ Status: 0,
  Answer: new URL(url).searchParams.get('type') === 'A' ? answers.map(data => ({ type: 1, data })) : [] }),
{ headers: { 'Content-Type': 'application/dns-json' } });
const html = body => new Response(body, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
test('Worker transport uses manual redirects, fixed headers, fresh DNS and no credentials', async () => {
  const calls = [];
  const f = createWorkerFetcher({ fetchImpl: async (url, opts) => {
    calls.push([url, opts]);
    if (url.startsWith('https://cloudflare-dns.com/')) return dns(url);
    return url.endsWith('/next') ? html('safe') : new Response('', { status: 302, headers: { Location: '/next' } });
  } });
  const r = await f.fetch('https://example.com/');
  assert.equal(r.body, 'safe'); assert.equal(r.tls, null); assert.equal(r.chain.length, 2);
  assert.equal(calls.filter(([u]) => u.startsWith('https://cloudflare-dns.com/')).length, 4);
  const opts = calls.at(-1)[1]; assert.equal(opts.redirect, 'manual'); assert.equal(opts.cache, 'no-store');
  assert.equal(opts.headers.Authorization, undefined); assert.equal(opts.headers.Cookie, undefined);
});
test('Worker rejects mixed private DNS, private redirect, literal IP and external asset redirect', async () => {
  let calls = 0;
  const mixed = createWorkerFetcher({ fetchImpl: async url => { calls++; return dns(url, ['93.184.216.34', '127.0.0.1']); } });
  await assert.rejects(mixed.fetch('https://example.com'), { code: 'unsafe_address' }); assert.equal(calls, 2);
  for (const [location, code, options] of [['http://169.254.169.254/', 'unsafe_address', {}], ['https://other.example.com/x.js', 'cross_origin_asset', { sameOrigin: 'https://example.com' }]]) {
    const f = createWorkerFetcher({ fetchImpl: async url => url.startsWith('https://cloudflare-dns.com/') ? dns(url) : new Response('', { status: 302, headers: { Location: location } }) });
    await assert.rejects(f.fetch('https://example.com/x.js', options), { code });
  }
  await assert.rejects(createWorkerFetcher({ fetchImpl: () => assert.fail() }).fetch('https://8.8.8.8'), { code: 'hostname_required' });
});
test('Worker resolves each redirect and rejects a changed private DNS answer', async () => {
  let resolves = 0, targets = 0;
  const f = createWorkerFetcher({ fetchImpl: async url => {
    if (url.startsWith('https://cloudflare-dns.com/')) return dns(url, ++resolves > 2 ? ['10.0.0.1'] : undefined);
    targets++; return new Response('', { status: 302, headers: { Location: '/next' } });
  } });
  await assert.rejects(f.fetch('https://example.com'), { code: 'unsafe_address' }); assert.equal(targets, 1);
});
test('Worker body reader enforces byte limits on streams and aborts stalled bodies', async () => {
  let cancelled = false;
  const stream = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(262145)); }, cancel() { cancelled = true; } });
  await assert.rejects(readBounded(new Response(stream), 262144), { code: 'body_limit' }); assert.ok(cancelled);
  const controller = new AbortController();
  const pending = readBounded(new Response(new ReadableStream()), 4096, controller.signal);
  controller.abort(); await assert.rejects(pending, { name: 'AbortError' });
});
test('Worker rejects unsupported content, encoding, DNS failures and response overflow', async () => {
  for (const [response, code] of [
    [new Response('x', { headers: { 'Content-Type': 'image/png' } }), 'unsupported_content'],
    [new Response('x', { headers: { 'Content-Type': 'text/html', 'Content-Encoding': 'gzip' } }), 'unsupported_encoding'],
    [html('x'.repeat(262145)), 'body_limit'],
  ]) {
    const f = createWorkerFetcher({ fetchImpl: async url => url.startsWith('https://cloudflare-dns.com/') ? dns(url) : response });
    await assert.rejects(f.fetch('https://example.com'), { code });
  }
  await assert.rejects(createWorkerFetcher({ fetchImpl: async () => new Response('{}', { status: 500 }) }).fetch('https://example.com'), { code: 'dns_failed' });
});

 test('hosted note codes and limitations resolve in both languages', async () => {
  const {copy} = await import('../hosted/copy.mjs');
  const codes = ['hostname_required','header_limit','certificate_unavailable','daily_capacity','unavailable','unsafe_address','dns_failed','body_limit','request_timeout','total_timeout','cancelled','unsupported_content','unsupported_encoding','request_limit','redirect_loop','redirect_limit','redirect_missing','cross_origin_asset','request_denied','request_failed'];
  for (const lang of ['en','de']) for (const code of codes) assert.equal(typeof copy[lang].notes[code], 'string', lang+':'+code);
  assert.match(copy.en.limits,/Certificate expiry/); assert.match(copy.de.limits,/Zertifikatsablauf/);
});
