import test from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import {readFile} from 'node:fs/promises';
import {once} from 'node:events';
import {requestPinned} from '../src/network.mjs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
test('untrusted TLS fixture is rejected without disabling certificate validation',async()=>{
  const server=https.createServer({key:await readFile(new URL('./fixtures/key.pem',import.meta.url)),cert:await readFile(new URL('./fixtures/cert.pem',import.meta.url))},(_req,res)=>res.end('never trusted'));
  server.listen(0,'127.0.0.1');await once(server,'listening');
  try{await assert.rejects(requestPinned(new URL(`https://fixture.example:${server.address().port}/`),{address:'127.0.0.1',family:4},AbortSignal.timeout(1000)),{code:'tls_failed'});}
  finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
test('trusted TLS success observes expiry and rejects hostname mismatch in an isolated child',async()=>{
  const {stdout}=await promisify(execFile)(process.execPath,[fileURLToPath(new URL('../scripts/tls-probe.mjs',import.meta.url))],{env:{...process.env,NODE_EXTRA_CA_CERTS:fileURLToPath(new URL('./fixtures/cert.pem',import.meta.url))},timeout:10000});assert.match(stdout,/passed/);
});
