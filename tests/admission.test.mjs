import test from 'node:test';
import assert from 'node:assert/strict';
import { admit } from '../hosted/admission.mjs';
test('persistent capacity survives runtime recreation, rolls minutes/days, and stores no scan identity', async () => {
  const map = new Map();
  const storage = { transaction: fn => fn({ get: async key => map.get(key), put: async (key, value) => map.set(key, value) }) };
  const day = 86400000;
  for (let i = 0; i < 10; i++) assert.equal(await admit(storage, day), null);
  assert.equal(await admit(storage, day), 'rate_limit');
  for (let minute = 1; minute < 10; minute++) for (let i = 0; i < 10; i++)
    assert.equal(await admit(storage, day + minute * 60000), null);
  assert.equal(await admit({ ...storage }, day + 20 * 60000), 'daily_capacity');
  assert.deepEqual(Object.keys(map.get('admission')).sort(), ['daily', 'day', 'minute', 'minutely']);
  assert.equal(await admit(storage, day * 2), null);
});
