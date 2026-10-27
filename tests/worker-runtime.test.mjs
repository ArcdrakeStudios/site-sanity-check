import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { readFile } from 'node:fs/promises';

test('real workerd executes private Worker/SQLite DO, scan, limits, restart quota and explicit TLS limitation', async () => {
  const config = JSON.parse(await readFile(new URL('../wrangler.hosted.json', import.meta.url)));
  assert.ok(config.compatibility_flags.includes('global_fetch_strictly_public'));
  assert.equal(config.workers_dev, false); assert.equal(config.preview_urls, false);
  assert.equal(config.containers, undefined); assert.equal(config.services, undefined); assert.equal(config.vpc_services, undefined);
  const bundle = await build({ entryPoints: [new URL('../hosted/worker.mjs', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')],
    bundle: true, format: 'esm', platform: 'neutral', external: ['node:*'], write: false });
  let contacts = [];
  const options = { name: 'scanner-test', modules: true, script: bundle.outputFiles[0].text + `\nexport class TestScanner extends Scanner { async fetch(req) { if(new URL(req.url).origin === 'https://fixture.internal') { const prior = await this.ctx.storage.get('admission'); await this.ctx.storage.put('admission', {...prior, daily:100, minutely:0}); return Response.json(prior); } return super.fetch(req); } }`,
    compatibilityDate: config.compatibility_date, compatibilityFlags: config.compatibility_flags,
    bindings: { SCANNER_SECRET: 's'.repeat(40) },
    durableObjects: { SCANNER: { className: 'TestScanner', useSQLite: true } },
    outboundService: async req => {
      const url = new URL(req.url); contacts.push(url.href);
      if (url.hostname === 'cloudflare-dns.com') return new Response(JSON.stringify({ Status: 0, Answer:
        url.searchParams.get('type') === 'A' ? [{ type: 1, data: url.searchParams.get('name') === 'private.example.com' ? '10.0.0.1' : '93.184.216.34' }] : [] }),
      { headers: { 'Content-Type': 'application/dns-json' } });
      if (url.hostname === 'redirect.example.com') return new Response('', { status: 302, headers: { Location: 'http://127.0.0.1/' } });
      if (url.protocol === 'http:') return new Response('', { status: 301, headers: { Location: req.url.replace('http:', 'https:') } });
      return new Response('<html><p>Lorem ipsum</p><script src="/app.js"></script></html>', {
        headers: { 'Content-Type': 'text/html', 'Strict-Transport-Security': 'max-age=31536000' } });
    },
  };
  const mf = new Miniflare(convertV4MiniflareOptions(options));
  const headers = { Origin: 'https://tools.arcdrake.com', 'Content-Type': 'application/json', Authorization: 'Bearer ' + 's'.repeat(40), 'X-Scanner-Client': 'a'.repeat(64) };
  const run = (url, client = 'a', path = '/scan') => mf.dispatchFetch('https://scanner.internal' + path, {
    method: 'POST', headers: { ...headers, 'X-Scanner-Client': client.repeat(64) }, body: JSON.stringify({ url }),
  });
  try {
    assert.equal((await mf.dispatchFetch('https://scanner.internal/scan', { method: 'POST', body: '{}' })).status, 403);
    assert.equal(contacts.length, 0);
    assert.equal((await run('http://127.0.0.1')).status, 400); assert.equal(contacts.length, 0);
    const result = await (await run('https://example.com/')).json();
    assert.equal(result.families.placeholders.state, 'attention', JSON.stringify({result,contacts}));
    assert.equal(result.families.https.state, 'inconclusive');
    assert.ok(result.families.https.notes.includes('certificate_unavailable'));
    assert.equal(result.families.https.certificateExpires, undefined);
    assert.equal(result.requests, 4);
    const blocked = await (await run('https://private.example.com/', 'b')).json();
    assert.ok(blocked.families.https.notes.includes('unsafe_address'));
    assert.ok(!contacts.some(u => new URL(u).hostname === 'private.example.com'));
    const redirect = await (await run('https://redirect.example.com/', 'c')).json();
    assert.ok(redirect.families.https.notes.includes('unsafe_address'));
    assert.ok(!contacts.some(u => new URL(u).hostname === '127.0.0.1'));
    for (let i = 0; i < 3; i++) assert.equal((await run(undefined, 'd', '/demo')).status, 200);
    assert.equal((await run(undefined, 'd', '/demo')).status, 429);
    const ns = await mf.getDurableObjectNamespace('SCANNER');
    const prior = await (await ns.get(ns.idFromName('single-release-v1')).fetch('https://fixture.internal/seed')).json();
    assert.ok(prior.daily > 0); assert.deepEqual(Object.keys(prior).sort(), ['daily','day','minute','minutely']);
    await mf.setOptions(convertV4MiniflareOptions(options)); // Recreate isolate, preserving the storage authority.
    const denied = await run('https://example.com/', 'e');
    assert.equal(denied.status, 429); assert.equal((await denied.json()).error, 'daily_capacity');
  } finally { await mf.dispose(); }
});
