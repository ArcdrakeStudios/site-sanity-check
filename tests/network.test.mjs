import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {createFetcher,requestPinned,LIMITS} from '../src/network.mjs';
import {CheckError} from '../src/safety.mjs';
const ok={status:200,headers:{'content-type':'text/html'},body:'hello'};
const resolve=async()=>({address:'8.8.8.8',family:4});
test('redirect to private target is blocked before any second connection',async()=>{
  let calls=0;const f=createFetcher({resolve,transport:async()=>{calls++;return {status:302,headers:{location:'http://127.0.0.1/'}};}});
  await assert.rejects(f.fetch('https://example.com'),{code:'unsafe_address'});assert.equal(calls,1);
});
test('each redirect resolves again; DNS rebinding is rejected',async()=>{
  let resolutions=0,calls=0;const f=createFetcher({resolve:async()=>{if(++resolutions===2)throw new CheckError('unsafe_address');return resolve();},transport:async()=>{calls++;return{status:302,headers:{location:'/next'}};}});
  await assert.rejects(f.fetch('https://example.com'),{code:'unsafe_address'});assert.equal(calls,1);assert.equal(resolutions,2);
});
test('loops and cumulative request budget fail closed',async()=>{
  const f=createFetcher({resolve,transport:async()=>({status:301,headers:{location:'/'}})});await assert.rejects(f.fetch('https://example.com'),{code:'redirect_loop'});
  const g=createFetcher({resolve,transport:async()=>ok});for(let i=0;i<6;i++)await g.fetch('https://example.com');await assert.rejects(g.fetch('https://example.com'),{code:'request_limit'});
});
test('asset redirects cannot leave their original origin',async()=>{
  let calls=0;const f=createFetcher({resolve,transport:async()=>{calls++;return{status:302,headers:{location:'https://other.example.com/x.js'}};}});
  await assert.rejects(f.fetch('https://example.com/a.js',{sameOrigin:'https://example.com'}),{code:'cross_origin_asset'});assert.equal(calls,1);
});
test('pre-cancelled fetch does not resolve or connect',async()=>{
  const f=createFetcher({signal:AbortSignal.abort(),resolve:()=>assert.fail(),transport:()=>assert.fail()});await assert.rejects(f.fetch('https://example.com'));
});
test('actual HTTP transport pins IP while retaining Host; size/encoding/content and cancellation limits',async()=>{
  let observed='';const server=http.createServer((req,res)=>{observed=req.headers.host;res.setHeader('Content-Type','text/html');if(req.url==='/large')res.end('x'.repeat(LIMITS.bytes+1));else if(req.url==='/gzip'){res.setHeader('Content-Encoding','gzip');res.end('x');}else if(req.url==='/binary'){res.setHeader('Content-Type','image/png');res.end('x');}else if(req.url==='/js'){res.setHeader('Content-Type','text/javascript; charset=utf-8');res.end('const x=1;');}else if(req.url==='/utf16'){res.setHeader('Content-Type','text/html; charset=utf-16');res.end('x');}else if(req.url==='/stall'){}else res.end('fixture');});
  server.listen(0,'127.0.0.1');await once(server,'listening');const port=server.address().port;
  // Test directly injects the local address into the low-level transport. Public normalization has no such option.
  const send=(path,signal=AbortSignal.timeout(1000))=>requestPinned(new URL(`http://unresolvable.example.invalid:${port}${path}`),{address:'127.0.0.1',family:4},signal);
  try{assert.equal((await send('/')).body,'fixture');assert.equal(observed,`unresolvable.example.invalid:${port}`);assert.equal((await send('/js')).body,'const x=1;');await assert.rejects(send('/utf16'),{code:'unsupported_encoding'});await assert.rejects(send('/large'),{code:'body_limit'});await assert.rejects(send('/gzip'),{code:'unsupported_encoding'});await assert.rejects(send('/binary'),{code:'unsupported_content'});await assert.rejects(send('/stall',AbortSignal.timeout(30)),{code:'cancelled'});}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
