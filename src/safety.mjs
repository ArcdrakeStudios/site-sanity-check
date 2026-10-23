import net from 'node:net';
import { Resolver } from 'node:dns/promises';

export class CheckError extends Error {
  constructor(code) { super(code); this.code = code; }
}
export function normalize(input) {
  if (typeof input !== 'string' || input.length > 2048 || /[\x00-\x20\x7f\\]/.test(input)) throw new CheckError('invalid_url');
  let url;
  try { url = new URL(/^[a-z][a-z\d+.-]*:/i.test(input) ? input : `https://${input}`); }
  catch { throw new CheckError('invalid_url'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port || !url.hostname || url.hostname.endsWith('.')) throw new CheckError('invalid_url');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!net.isIP(host) && (!host.includes('.') || !/^[a-z\d.-]+$/i.test(host) || host.split('.').some(x => !x || x.length > 63 || x.startsWith('-') || x.endsWith('-')))) throw new CheckError('invalid_url');
  if (net.isIP(host) && !isPublicAddress(host)) throw new CheckError('unsafe_address');
  if (/(?:^|\.)(localhost|local|internal|test|invalid|onion|home|lan)$/i.test(host)) throw new CheckError('unsafe_address');
  url.hash = '';
  return url;
}
function v4num(s) { return s.split('.').reduce((n, p) => n * 256 + Number(p), 0); }
function in4(value, base, bits) { return Math.floor(value / 2 ** (32-bits)) === Math.floor(v4num(base) / 2 ** (32-bits)); }
function v6num(s) {
  if (s.includes('.') || s.includes('%')) return null;
  const [a,b] = s.split('::');
  const left = a ? a.split(':') : [], right = b ? b.split(':') : [];
  const parts = b === undefined ? left : [...left, ...Array(8-left.length-right.length).fill('0'), ...right];
  return parts.reduce((n,p) => (n<<16n) + BigInt(`0x${p}`), 0n);
}
export function isPublicAddress(ip) {
  const family = net.isIP(ip);
  if (family === 4) {
    const n=v4num(ip);
    return ![['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.88.99.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',3]].some(([base,bits])=>in4(n,base,bits));
  }
  if (family !== 6) return false;
  const n=v6num(ip);
  if (n===null || n>>125n !== 1n) return false; // Only native global 2000::/3; no mapped/NAT64/tunnel/local addresses.
  const in6=(base,bits)=>n>>BigInt(128-bits)===v6num(base)>>BigInt(128-bits);
  return !in6('2001::',23) && !in6('2001:db8::',32) && !in6('2002::',16) && !in6('3fff::',20);
}
export async function resolvePublic(host, signal) {
  host=host.replace(/^\[|\]$/g,'');
  if (net.isIP(host)) {
    if (!isPublicAddress(host)) throw new CheckError('unsafe_address');
    return { address:host, family:net.isIP(host) };
  }
  const resolver=new Resolver({timeout:1800,tries:1});
  const cancel=()=>resolver.cancel();
  signal?.throwIfAborted();
  signal?.addEventListener('abort',cancel,{once:true});
  const timer=setTimeout(cancel,2000);
  try {
    const responses=await Promise.allSettled([resolver.resolve4(host),resolver.resolve6(host)]);
    // A timeout or other unresolved family is not evidence that all answers are safe.
    if (responses.some(r=>r.status==='rejected' && !['ENODATA','ENOTFOUND'].includes(r.reason.code))) throw new CheckError('dns_failed');
    const addresses=responses.flatMap(r=>r.status==='fulfilled'?r.value:[]);
    if (!addresses.length) throw new CheckError('dns_failed');
    if (addresses.length>32 || addresses.some(ip=>!isPublicAddress(ip))) throw new CheckError('unsafe_address');
    return {address:addresses[0],family:net.isIP(addresses[0])};
  } finally { clearTimeout(timer); signal?.removeEventListener('abort',cancel); }
}

// Conservative masking is broader than the finding rules. Never return raw headers/errors.
export function redact(value) {
  return redactAt(value,0).text;
}
export function redactAt(value,offset) {
  let text=String(value),position=offset;
  const rules=[
    [/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?(?:-----END [^-]*PRIVATE KEY-----|$)/g,()=> '[REDACTED PRIVATE KEY]'],
    [/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,()=> '[REDACTED]'],
    [/\b(?:gh[pousr]_|github_pat_|sk_(?:live|test)_|sk-proj-|sk-)[A-Za-z0-9_-]{8,}/g,()=> '[REDACTED]'],
    [/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,()=> '[REDACTED]'],
    [/((?:password|passwd|secret|token|api[_-]?key|authorization)\s*(?:["']\s*)?[:=]\s*["']?)[^\s"'<>;,}]+/gi,(_m,prefix)=>`${prefix}[REDACTED]`],
    [/\b[A-Za-z0-9_+/=-]{24,}\b/g,()=> '[REDACTED LONG VALUE]'],
  ];
  for(const [pattern,replacement] of rules){
    const originalPosition=position;let delta=0,mapped=null;
    text=text.replace(pattern,(...args)=>{
      const match=args[0],start=args.at(-2),output=replacement(...args);
      if(start<=originalPosition&&originalPosition<start+match.length)mapped=start+delta;
      if(start+match.length<=originalPosition)delta+=output.length-match.length;
      return output;
    });
    position=mapped??originalPosition+delta;
  }
  return {text,offset:position};
}
export function safeUrl(value) {
  try {
    const u=new URL(value); u.username='';u.password='';u.hash='';
    for(const key of [...u.searchParams.keys()]) u.searchParams.set(key,'[REDACTED]');
    // Percent encoding must not hide a token from redaction.
    let path=u.pathname; try { path=decodeURIComponent(path); } catch { path='[unreadable path]'; }
    let sensitive=false;
    path=path.split('/').map(segment=>{
      const masked=sensitive || (segment.length>=12&&/[a-z]/i.test(segment)&&/\d/.test(segment)&&/^[a-z\d_-]+$/i.test(segment));
      sensitive=/^(?:reset|password-reset|token|secret|auth|invite|verify|key)$/i.test(segment);
      return masked&&segment?'[REDACTED PATH]':segment;
    }).join('/');
    return redact(`${u.protocol}//${u.host}${path}${u.search ? '?[query values redacted]' : ''}`);
  } catch { return '[invalid URL]'; }
}
