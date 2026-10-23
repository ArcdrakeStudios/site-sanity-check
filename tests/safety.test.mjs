import test from 'node:test';
import assert from 'node:assert/strict';
import {isPublicAddress,normalize,redact,redactAt,safeUrl,resolvePublic} from '../src/safety.mjs';
import {Resolver} from 'node:dns/promises';

test('blocks nonpublic IPv4 and IPv6, including alternate URL spellings',()=>{
  for(const ip of ['0.0.0.0','10.1.2.3','100.64.0.1','127.0.0.1','169.254.169.254','172.31.255.255','192.168.0.1','192.0.0.9','192.0.2.1','198.18.0.1','198.51.100.3','203.0.113.4','224.0.0.1','255.255.255.255','::1','::','::ffff:8.8.8.8','::ffff:808:808','fc00::1','fe80::1','ff00::1','64:ff9b::808:808','2001:db8::1','2002:0808:0808::1','2001::1','3fff::1'])assert.equal(isPublicAddress(ip),false,ip);
  for(const input of ['http://2130706433','http://0x7f000001','http://127.1','http://0177.0.0.1','http://[::ffff:127.0.0.1]','http://169.254.169.254/latest/meta-data'])assert.throws(()=>normalize(input));
  for(const ip of ['8.8.8.8','1.1.1.1','2001:4860:4860::8888','2606:4700:4700::1111'])assert.equal(isPublicAddress(ip),true,ip);
});
test('URL normalization rejects ambiguous or privileged targets',()=>{
  for(const input of ['file:///etc/passwd','ftp://example.com','https://user:pw@example.com','https://example.com:8443','https://localhost','https://foo.local','https://example.com.','https://a..com','https://a\\@example.com','https://example.com/\n','http://[fe80::1%25eth0]','http://foo','https://example.com/a b'])assert.throws(()=>normalize(input),input);
  assert.equal(normalize('example.com').href,'https://example.com/');
  assert.equal(normalize('https://bücher.de/').hostname,'xn--bcher-kva.de');
  assert.equal(normalize('https://example.com/#secret').hash,'');
});
test('masking protects credential values, encoded paths and query values',()=>{
  const token='ghp_'+'Z'.repeat(36);
  for(const input of [`secret="${token}"`,token,`-----BEGIN PRIVATE KEY-----\n${'a'.repeat(100)}`,`api_key="${'b'.repeat(28)}"`])assert.ok(!redact(input).includes(token)&&!redact(input).includes('b'.repeat(28)));
  const url=safeUrl(`https://example.com/${encodeURIComponent(token)}?q=${token}#${token}`);assert.ok(!url.includes(token));assert.ok(!url.includes('ghp_'));assert.ok(url.includes('redacted'));
});
test('DNS validates all families, rejects mixed and unresolved answers, no transport involved',async()=>{
  const a=Resolver.prototype.resolve4,b=Resolver.prototype.resolve6;
  try {
    Resolver.prototype.resolve4=async()=>['8.8.8.8'];Resolver.prototype.resolve6=async()=>['::1'];
    await assert.rejects(resolvePublic('example.com'),{code:'unsafe_address'});
    Resolver.prototype.resolve6=async()=>{throw Object.assign(Error(),{code:'ETIMEOUT'});};await assert.rejects(resolvePublic('example.com'),{code:'dns_failed'});
    Resolver.prototype.resolve6=async()=>{throw Object.assign(Error(),{code:'ENODATA'});};assert.deepEqual(await resolvePublic('example.com'),{address:'8.8.8.8',family:4});
  }finally{Resolver.prototype.resolve4=a;Resolver.prototype.resolve6=b;}
});
test('redaction maps excerpt offsets and masks shorter URL path tokens',()=>{
  const body='ghp_'+'Q'.repeat(36)+' preceding Lorem ipsum';const mapped=redactAt(body,body.indexOf('Lorem'));assert.equal(mapped.text.slice(mapped.offset),'Lorem ipsum');
  assert.ok(!safeUrl('https://example.com/reset/shortcode').includes('shortcode'));assert.ok(!safeUrl('https://example.com/Abcd1234Efgh5678').includes('Abcd1234Efgh5678'));
});
