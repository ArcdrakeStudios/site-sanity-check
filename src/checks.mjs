import { performance } from 'node:perf_hooks';
import { createFetcher } from './network.mjs';
import { normalize, redact, redactAt, safeUrl } from './safety.mjs';

const families=['https','wordpress','secrets','placeholders'];
const item=(code,evidence,severity='attention')=>({code,evidence,severity});
function evidence(response,offset) {
  let excerpt='';
  if (offset!==undefined) {
    const masked=redactAt(response.body,offset);
    excerpt=masked.text.slice(Math.max(0,masked.offset-60),masked.offset+180);
  }
  return {url:safeUrl(response.url.href),method:'GET',status:response.status,chain:response.chain,
    headers:{'content-type':redact(response.headers['content-type']??''),'strict-transport-security':redact(response.headers['strict-transport-security']??'')},excerpt};
}
// Disjoint indexOf scans keep hostile unclosed markup linear and preserve source offsets.
export function visibleText(body) {
  const lower=body.replace(/[A-Z]/g,c=>c.toLowerCase()),parts=[];let cursor=0,wordpress=false;
  while(cursor<body.length){
    const open=body.indexOf('<',cursor);
    if(open<0){parts.push(body.slice(cursor));break;}
    parts.push(body.slice(cursor,open));
    const close=body.indexOf('>',open+1);
    if(close<0){parts.push(' '.repeat(body.length-open));break;}
    const tag=lower.slice(open,close+1);
    if(/^<meta\s/.test(tag)&&tag.includes('generator')&&tag.includes('wordpress'))wordpress=true;
    const hidden=tag.match(/^<(script|style)(?:\s|>|\/)/)?.[1];
    let end=close+1;
    if(hidden){const closing=lower.indexOf(`</${hidden}`,end);const closingEnd=closing<0?-1:body.indexOf('>',closing);end=closingEnd<0?body.length:closingEnd+1;}
    parts.push(' '.repeat(end-open));cursor=end;
  }
  return {text:parts.join(''),wordpress};
}
function* tags(body) {
  let cursor=0;
  while(cursor<body.length){const open=body.indexOf('<',cursor);if(open<0)return;const end=body.indexOf('>',open+1);if(end<0)return;yield body.slice(open,end+1);cursor=end+1;}
}
export function analyze(response) {
  const found={wordpress:[],secrets:[],placeholders:[]};
  const html=/text\/html/i.test(response.headers['content-type']??'');
  const parsed=visibleText(response.body),visible=parsed.text;
  const wp=parsed.wordpress||/wp-content\/|wp-includes\//i.test(response.body);
  if (html) {
    for (const [code,pattern] of [['wp_tagline',/Just another WordPress site/i],['wp_demo',/\bHello world!|\bSample Page\b/i],['shortcode',/\[(?:vc_row|vc_column|et_pb_[a-z_]{1,64}|fusion_[a-z_]{1,64}|elementor-template)\b[^\]]{0,200}\]/i],['directory_listing',/\bIndex of \/|\bDirectory listing for\b/i]]) {
      const m=visible.match(pattern);if(m&&(code!=='wp_demo'||wp))found.wordpress.push(item(code,evidence(response,m.index)));
    }
    for(const [code,pattern] of [['lorem',/\blorem\s+ipsum\b/i],['template',/\{\{\s*(?:title|content|company_name|your_name)\s*\}\}|\bYOUR COMPANY NAME\b|\bInsert (?:text|title|content) here\b/i]]) {
      const m=visible.match(pattern);if(m)found.placeholders.push(item(code,evidence(response,m.index)));
    }
  }
  // Indicators only. Values are never tested against a service.
  for(const [code,pattern] of [['private_key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],['credential_pattern',/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b|\b(?:ghp_|github_pat_|sk_live_)[A-Za-z0-9_]{20,}/],['secret_assignment',/\b(?:api[_-]?key|secret[_-]?key|access[_-]?token)\s*(?:["']\s*)?[:=]\s*["'][A-Za-z0-9_+\/-]{24,}["']/i]]) {
    const m=response.body.match(pattern);if(m)found.secrets.push(item(code,evidence(response,m.index)));
  }
  return found;
}
export async function scan(input,{fetcher,signal}={}) {
  const start=performance.now(),target=normalize(input),fetch=fetcher??createFetcher({signal});
  const result={target:safeUrl(target.href),families:Object.fromEntries(families.map(k=>[k,{state:'inconclusive',findings:[],notes:[]}])),sampled:[],elapsedMs:0,requests:0};
  const addSample=r=>result.sampled.push(evidence(r));
  try {
    const main=await fetch.fetch(target.href);addSample(main);
    if(main.status<200||main.status>=300) {
      for(const f of Object.values(result.families))f.notes.push(main.status===403||main.status===429?'blocked':'http_error');
      result.families.https.findings.push(item('http_error',evidence(main),'inconclusive'));
    } else {
      if (/checking your browser|verify you are human|cf-chl-|captcha challenge|just a moment\.\.\./i.test(main.body)) {
        for(const family of Object.values(result.families))family.notes.push('blocked');
        result.requests=fetch.count;result.elapsedMs=Math.round(performance.now()-start);return result;
      }
      const html=/text\/html/i.test(main.headers['content-type']??'');
      for(const k of ['wordpress','placeholders']) {result.families[k].state=html?'ok':'inconclusive';result.families[k].notes.push(html?'sample_only':'not_html');}
      result.families.secrets.state='ok';result.families.secrets.notes.push('patterns_only');
      const merge=r=>{for(const [k,findings] of Object.entries(analyze(r))){result.families[k].findings.push(...findings);if(findings.length)result.families[k].state='attention';}};
      merge(main);
      const tls=result.families.https;
      tls.state='ok';tls.notes.push('edge_tls_only');
      if(main.url.protocol!=='https:'){tls.state='attention';tls.findings.push(item('unencrypted',evidence(main)));}
      else {
        if(!/\bmax-age\s*=\s*[1-9]\d*\b/i.test(main.headers['strict-transport-security']??'')){tls.state='attention';tls.findings.push(item('missing_hsts',evidence(main)));}
        if(main.tls?.validTo) {
          const expires=Date.parse(main.tls.validTo);
          if(Number.isFinite(expires)){tls.certificateExpires=new Date(expires).toISOString();if(expires-Date.now()<30*86400000){tls.state='attention';tls.findings.push(item('certificate_soon',evidence(main)));}}
        }
      }
      if(target.protocol==='https:'&&main.chain.some(step=>step.url.startsWith('http:'))){tls.state='attention';tls.findings.push(item('unencrypted',evidence(main)));}
      // A single HTTP variant, not arbitrary apex/www enumeration.
      const httpVariant=new URL(target);httpVariant.protocol='http:';
      if(target.protocol==='https:') {
        try {
          const probe=await fetch.fetch(httpVariant.href);addSample(probe);
          if(probe.status<200||probe.status>=300){tls.notes.push('http_probe_inconclusive');if(tls.state==='ok')tls.state='inconclusive';}
          else if(probe.url.protocol!=='https:'){tls.state='attention';tls.findings.push(item('http_not_enforced',evidence(probe)));}
        } catch {tls.notes.push('http_probe_inconclusive');if(tls.state==='ok')tls.state='inconclusive';}
      }
      if(html) {
        const assets=[];
        for(const tag of tags(main.body)) {
          const match=tag.match(/^<(?:script|link)\b[^>]*?\b(?:src|href)\s*=\s*["']([^"']+)["'][^>]*>/i);
          if(!match)continue;
          try {const u=normalize(new URL(match[1].replace(/&amp;/g,'&'),main.url).href);if(u.origin===main.url.origin&&/\.(?:js|css)$/i.test(u.pathname)&&!assets.includes(u.href))assets.push(u.href);}catch{}
          if(assets.length===3)break;
        }
        if(assets.length>2)result.families.secrets.notes.push('asset_sample_truncated');
        for(const asset of assets.slice(0,2)) {
          try {const r=await fetch.fetch(asset,{sameOrigin:main.url.origin});addSample(r);if(r.status>=200&&r.status<300)merge(r);else throw Error();}
          catch {result.families.secrets.notes.push('asset_incomplete');if(result.families.secrets.state==='ok')result.families.secrets.state='inconclusive';}
        }
      }
    }
  } catch(error) {
    for(const f of Object.values(result.families))f.notes.push(error.code??'connection_failed');
    if(error.chain?.length)result.sampled.push({chain:error.chain});
  }
  result.requests=fetch.count;result.elapsedMs=Math.round(performance.now()-start);
  return result;
}

export async function demo() {
  const url=new URL('https://example.com/');
  const response={url,status:200,headers:{'content-type':'text/html'},chain:[{url:url.href,method:'GET',status:200}],body:'<html><p>Just another WordPress site</p><p>Lorem ipsum dolor sit amet</p><script src="/wp-content/demo.js"></script></html>',tls:null};
  const fixtureFetch=async input=>input.endsWith('.js')?{...response,url:new URL(input),headers:{'content-type':'application/javascript'},body:`const exampleToken = "ghp_${'F'.repeat(36)}";`,chain:[{url:input,method:'GET',status:200}]}:{...response,url:new URL(input),chain:[{url:input,method:'GET',status:200}]};
  return {...await scan(url.href,{fetcher:{count:0,fetch:fixtureFetch}}),demo:true};
}
