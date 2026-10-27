import test from 'node:test';
import assert from 'node:assert/strict';
import { Scanner } from '../hosted/worker.mjs';
const secret = 's'.repeat(40);
const request = (client = 'a', url = 'https://example.com') => new Request('https://scanner.internal/scan', {
  method: 'POST', headers: { Origin: 'https://tools.arcdrake.com', Authorization: 'Bearer '+secret,
    'Content-Type': 'application/json', 'X-Scanner-Client': client.repeat(64) }, body: JSON.stringify({ url }),
});
test('Worker reserves concurrency before awaiting input/storage and clears expired abuse identities', async () => {
  let release; const latch = new Promise(r => { release = r; });
  const values = new Map(); const tx = { get: async k => values.get(k), put: async (k,v) => values.set(k,v) };
  const scanner = new Scanner({ storage: { ...tx, setAlarm: async () => latch, transaction: fn => fn(tx) } }, { SCANNER_SECRET: secret });
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response('{}', { status: 500 });
  try {
    const first = scanner.fetch(request('a')); const second = scanner.fetch(request('b'));
    const third = await scanner.fetch(request('c'));
    assert.equal(third.status, 429); assert.equal(scanner.active, 2);
    release(); await Promise.all([first, second]); assert.equal(scanner.active, 0);
    scanner.clients.set('expired', [Date.now()-70000]); scanner.targets.set('expired.example.com', [Date.now()-70000]);
    await scanner.alarm(); assert.ok(!scanner.clients.has('expired')); assert.ok(!scanner.targets.has('expired.example.com'));
  } finally { release(); globalThis.fetch = original; }
});
