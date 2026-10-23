// Run only as a test child with NODE_EXTRA_CA_CERTS pointing at the disposable fixture CA.
import https from 'node:https';
import {readFile} from 'node:fs/promises';
import {once} from 'node:events';
import assert from 'node:assert/strict';
import {requestPinned} from '../src/network.mjs';
const root=new URL('../tests/fixtures/',import.meta.url);
const server=https.createServer({key:await readFile(new URL('key.pem',root)),cert:await readFile(new URL('cert.pem',root))},(_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<h1>Controlled TLS fixture</h1>');});
server.listen(0,'127.0.0.1');await once(server,'listening');
try{
  const fetch=host=>requestPinned(new URL(`https://${host}:${server.address().port}/`),{address:'127.0.0.1',family:4},AbortSignal.timeout(2000));
  const result=await fetch('fixture.example');assert.equal(result.status,200);assert.equal(result.tls.authorized,true);assert.ok(Date.parse(result.tls.validTo));assert.match(result.body,/Controlled/);
  await assert.rejects(fetch('wrong.example'),{code:'tls_failed'});console.log('Trusted TLS, expiry observation and hostname mismatch rejection passed.');
}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
