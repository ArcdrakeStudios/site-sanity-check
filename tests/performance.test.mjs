import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {performance} from 'node:perf_hooks';
import {setTimeout as delay} from 'node:timers/promises';
import {createFetcher,requestPinned,LIMITS} from '../src/network.mjs';
import {scan} from '../src/checks.mjs';
import {CheckError} from '../src/safety.mjs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
test('controlled ordinary scan and total-budget cancellation remain bounded',async()=>{
  const transport=async(_url,_pin,signal)=>{await delay(20,null,{signal});return{status:200,headers:{'content-type':'text/html','strict-transport-security':'max-age=31536000'},body:'<p>A real small page</p>'};};
  const resolve=async()=>({address:'8.8.8.8',family:4});
  const start=performance.now();const r=await scan('example.com',{fetcher:createFetcher({resolve,transport})});assert.ok(r.elapsedMs<1000);assert.ok(performance.now()-start<1000);
  const f=createFetcher({resolve,transport:async(_u,_p,signal)=>{await delay(5000,null,{signal});return{};},limits:{...LIMITS,totalMs:40}});const before=performance.now();await assert.rejects(f.fetch('https://example.com'),{code:'total_timeout'});assert.ok(performance.now()-before<500);
});
test('total deadline supersedes transport and DNS cancellation labels',async()=>{
  const cancelled=async(_a,signal)=>{try{await delay(5000,null,{signal});}catch{throw new CheckError('dns_failed');}};
  await assert.rejects(createFetcher({resolve:cancelled,limits:{...LIMITS,totalMs:25}}).fetch('https://example.com'),{code:'total_timeout'});
  const controller=new AbortController();controller.abort();await assert.rejects(createFetcher({signal:controller.signal}).fetch('https://example.com'),{code:'cancelled'});
});
test('real stalled HTTP response hits absolute request deadline',async()=>{
  const server=http.createServer((_req,_res)=>{});server.listen(0,'127.0.0.1');await once(server,'listening');const before=performance.now();
  try{await assert.rejects(requestPinned(new URL(`http://fixture.example:${server.address().port}`),{address:'127.0.0.1',family:4},new AbortController().signal),{code:'request_timeout'});const elapsed=performance.now()-before;assert.ok(elapsed>=4900&&elapsed<6500,`elapsed ${elapsed}`);}
  finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
test('assignment whitespace and repeated unclosed shortcodes have bounded CPU in an isolated child',async()=>{
  const {stdout}=await promisify(execFile)(process.execPath,[fileURLToPath(new URL('../scripts/hostile-probe.mjs',import.meta.url))],{timeout:2500});assert.ok(JSON.parse(stdout).elapsedMs<1000);
});
