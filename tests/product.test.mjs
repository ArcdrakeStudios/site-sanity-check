import test from 'node:test';
import assert from 'node:assert/strict';
import {analyze,scan,demo} from '../src/checks.mjs';
import {copy} from '../public/i18n.mjs';
const response=(body='',extras={})=>({url:new URL('https://example.com/'),status:200,headers:{'content-type':'text/html','strict-transport-security':'max-age=31536000'},body,chain:[{url:'https://example.com/',method:'GET',status:200}],...extras});
const mock=r=>({count:1,fetch:async()=>r});
test('all content families report inspectable masked evidence',()=>{
  const secret='ghp_'+'Q'.repeat(36);const result=analyze(response(`<p>Just another WordPress site</p><p>[vc_row] Lorem ipsum</p><script>const key="${secret}";</script>`));
  assert.equal(result.wordpress.length,2);assert.equal(result.placeholders.length,1);assert.equal(result.secrets.length,1);
  assert.ok(!JSON.stringify(result).includes(secret));assert.ok(result.secrets[0].evidence.excerpt.includes('REDACTED'));
});
test('WP presence and script-only placeholder strings are not a hygiene defect',()=>{
  const result=analyze(response('<script src="/wp-content/a.js">const x="Lorem ipsum";</script><h1>Welcome</h1>'));
  assert.equal(result.wordpress.length,0);assert.equal(result.placeholders.length,0);
});
test('missing HTML and failed fetch never imply clean coverage',async()=>{
  const r=await scan('example.com',{fetcher:mock(response('x',{headers:{'content-type':'text/plain'}}))});assert.equal(r.families.wordpress.state,'inconclusive');
  const fail=await scan('example.com',{fetcher:{count:1,fetch:async()=>{throw Object.assign(Error(),{code:'tls_failed'});}}});for(const f of Object.values(fail.families))assert.equal(f.state,'inconclusive');
});
test('HTTP errors and missing HSTS carry actionable evidence',async()=>{
  const blocked=await scan('example.com',{fetcher:mock(response('',{status:403}))});assert.equal(blocked.families.secrets.state,'inconclusive');assert.equal(blocked.families.https.state,'inconclusive');
  const missing=await scan('example.com',{fetcher:mock(response('',{headers:{'content-type':'text/html'}}))});assert.ok(missing.families.https.findings.some(f=>f.code==='missing_hsts'));
});
test('asset failures downgrade secret coverage, external assets are not fetched',async()=>{
  const calls=[];const f={count:2,fetch:async u=>{calls.push(u);if(u.endsWith('.js'))throw Error();return response('<script src="https://evil.example/a.js"></script><script src="/a.js"></script>');}};
  const r=await scan('example.com',{fetcher:f});assert.equal(r.families.secrets.state,'inconclusive');assert.ok(!calls.some(u=>u.includes('evil')));
});
test('bilingual keys and every emitted demo finding/note resolve',async()=>{
  const r=await demo();assert.equal(r.demo,true);for(const lang of ['en','de'])for(const f of Object.values(r.families)){assert.ok(copy[lang][f.state]);for(const n of f.notes)assert.ok(copy[lang].notes[n],n);for(const finding of f.findings)assert.ok(copy[lang].findings[finding.code],finding.code);}
});
test('HTTP-200 challenge page is inconclusive in all families',async()=>{
  const r=await scan('example.com',{fetcher:mock(response('<title>Just a moment...</title><p>Checking your browser</p>'))});for(const f of Object.values(r.families))assert.equal(f.state,'inconclusive');
});
test('HSTS max-age zero is flagged rather than accepted',async()=>{
  const r=await scan('example.com',{fetcher:mock(response('',{headers:{'content-type':'text/html','strict-transport-security':'max-age=0'}}))});assert.ok(r.families.https.findings.some(f=>f.code==='missing_hsts'));
});
test('visible excerpt uses source offsets, not an earlier script occurrence',()=>{
  const body='<script>const s="Lorem ipsum";</script>'+' '.repeat(300)+'<p>Lorem <b>ipsum</b> here</p>';
  const found=analyze(response(body)).placeholders[0];assert.match(found.evidence.excerpt,/<p>Lorem <b>ipsum/);assert.ok(!found.evidence.excerpt.includes('const s'));
});
test('sampling cap is visible and HTTP probe behavior is exercised',async()=>{
  const body='<script src="/a.js"></script><script src="/b.js"></script><script src="/c.js"></script>';
  const calls=[];const f={count:0,fetch:async input=>{calls.push(input);return response(input.endsWith('.js')?'':body,{url:new URL(input)});}};
  const r=await scan('example.com',{fetcher:f});assert.ok(r.families.secrets.notes.includes('asset_sample_truncated'));assert.ok(r.families.https.findings.some(f=>f.code==='http_not_enforced'));assert.ok(!calls.some(u=>u.endsWith('c.js')));
  const failed=await scan('example.com',{fetcher:{count:1,fetch:async input=>{if(input.startsWith('http:'))throw Error();return response();}}});assert.equal(failed.families.https.state,'inconclusive');assert.ok(failed.families.https.notes.includes('http_probe_inconclusive'));
});
test('hostile unclosed markup and repeated generator starts stay bounded',async()=>{
  for(const body of ['<script>'.repeat(32768),'<script '.repeat(32768),'name="generator" '.repeat(15000)]){
    const before=performance.now();await scan('example.com',{fetcher:mock(response(body))});assert.ok(performance.now()-before<1000);
  }
});
test('Unicode case expansion before script does not shift visibility offsets',()=>{
  const hidden=analyze(response('İ'.repeat(30)+'<script>Lorem ipsum</script><p>Finished page</p>'));assert.equal(hidden.placeholders.length,0);
  const found=analyze(response('İ'.repeat(30)+'<script>nothing</script><p>Lorem ipsum</p>'));assert.equal(found.placeholders.length,1);assert.match(found.placeholders[0].evidence.excerpt,/<p>Lorem ipsum/);
});
test('blocked HTTP probe is inconclusive and never claims enforcement failure',async()=>{
  for(const status of [403,429,500]){const r=await scan('example.com',{fetcher:{count:2,fetch:async input=>response('',{url:new URL(input),status:input.startsWith('http:')?status:200})}});assert.equal(r.families.https.state,'inconclusive');assert.ok(!r.families.https.findings.some(f=>f.code==='http_not_enforced'));}
});
