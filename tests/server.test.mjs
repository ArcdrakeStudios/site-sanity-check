import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import http from 'node:http';
import {createApp} from '../server.mjs';
test('local API enforces origin, host, content type, rate and no body-controlled fixture bypass',async()=>{
  let calls=0;const server=createApp({port:43146,scanner:async()=>{calls++;return {ok:true};}});server.listen(43146,'127.0.0.1');await once(server,'listening');
  const base='http://127.0.0.1:43146';const send=(headers={},body={url:'https://example.com'})=>fetch(base+'/api/scan',{method:'POST',headers:{Origin:base,'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
  try{
    assert.equal((await fetch(base)).status,200);
    assert.equal((await send({Origin:'https://evil.example'})).status,403);
    assert.equal((await send({'Content-Type':'text/plain'})).status,403);
    const badHost=await new Promise((resolve,reject)=>{const r=http.request(base+'/api/scan',{method:'POST',headers:{Host:'evil.example',Origin:base,'Content-Type':'application/json'}},res=>{res.resume();resolve(res.statusCode);});r.on('error',reject);r.end('{}');});
    assert.equal(badHost,403);
    const large=await send({}, {url:'x'.repeat(4100)});assert.equal(large.status,413);assert.equal((await large.json()).error,'request_too_large');
    assert.equal((await send({}, {url:'http://127.0.0.1',testMode:true})).status,400);
    assert.equal(calls,0);
    for(let i=0;i<3;i++)assert.equal((await send()).status,200);assert.equal((await send()).status,429);assert.equal(calls,3);
    const demo=await fetch(base+'/api/demo',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:'{}'});assert.equal((await demo.json()).demo,true);assert.equal(calls,3);
  }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
