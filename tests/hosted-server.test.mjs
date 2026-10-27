import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createHostedApp } from '../hosted-server.mjs';
const secret = 'synthetic-test-secret-not-a-real-credential';

test('hosted backend denies unauthenticated, malformed and private targets before scanning; limits clients and targets', async () => {
  let calls = 0, time = 100000;
  const server = createHostedApp({ secret, now: () => time, scanner: async () => { calls++; return { synthetic: true }; } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const send = (body = { url: 'https://example.com' }, headers = {}, route = '/scan') => fetch(base + route, {
    method: 'POST', headers: { Authorization: `Bearer ${secret}`, Origin: 'https://tools.arcdrake.com',
      'Content-Type': 'application/json', 'X-Scanner-Client': 'a'.repeat(64), ...headers }, body: JSON.stringify(body) });
  try {
    assert.equal((await send({}, { Authorization: '' })).status, 403);
    assert.equal((await send({}, { Origin: 'https://evil.example' })).status, 403);
    assert.equal((await send({}, { 'X-Scanner-Client': 'spoofed' })).status, 403);
    assert.equal((await send({ url: 'http://127.0.0.1' })).status, 400);
    assert.equal((await send({ url: 'https://example.com', testMode: true })).status, 400);
    assert.equal((await send({ url: 'x'.repeat(5000) })).status, 413);
    assert.equal(calls, 0);
    for (let i = 0; i < 3; i++) assert.equal((await send()).status, 200);
    assert.equal((await send({ url: 'https://other.example' })).status, 429);
    assert.equal((await send(undefined, { 'X-Scanner-Client': 'b'.repeat(64) })).status, 429);
    time += 60001;
    assert.equal((await send()).status, 200);
    assert.equal(calls, 4);
    assert.equal((await send({}, {}, '/demo')).status, 200);
    assert.equal(calls, 4, 'demo never scans a target');
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});

test('hosted backend shares a two-scan concurrency cap across clients', async () => {
  const releases = [];
  const server = createHostedApp({ secret, scanner: () => new Promise(resolve => releases.push(resolve)) });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const send = i => fetch(`http://127.0.0.1:${server.address().port}/scan`, { method: 'POST', headers: {
    Authorization: `Bearer ${secret}`, Origin: 'https://tools.arcdrake.com', 'Content-Type': 'application/json',
    'X-Scanner-Client': String(i).repeat(64) }, body: JSON.stringify({ url: `https://target${i}.example` }) });
  try {
    const first = send(1), second = send(2);
    for (let i = 0; releases.length < 2 && i < 100; i++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(releases.length, 2);
    assert.equal((await send(3)).status, 429);
    releases.forEach(resolve => resolve({ synthetic: true }));
    assert.equal((await first).status, 200); assert.equal((await second).status, 200);
  } finally { releases.forEach(resolve => resolve({})); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
