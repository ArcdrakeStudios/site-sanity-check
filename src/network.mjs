import http from 'node:http';
import https from 'node:https';
import { performance } from 'node:perf_hooks';
import { CheckError, normalize, resolvePublic, safeUrl } from './safety.mjs';

export const LIMITS=Object.freeze({requests:6,redirects:3,bytes:262144,totalMs:25000,requestMs:5000});
export function requestPinned(url, pinned, signal) {
  return new Promise((resolve,reject)=>{
    let settled=false;
    const finish=(error,result)=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve(result);};
    const client=url.protocol==='https:'?https:http;
    const req=client.request(url,{
      method:'GET',agent:false,signal,maxHeaderSize:16384,
      family:pinned.family,
      lookup:(_host,options,cb)=>options.all?cb(null,[pinned]):cb(null,pinned.address,pinned.family),
      rejectUnauthorized:true,
      headers:{'User-Agent':'SiteSanityCheck/0.1 (bounded passive check)','Accept':'text/html,text/plain,text/javascript,application/javascript,text/css;q=0.5','Accept-Encoding':'identity'},
    },res=>{
      const headers=res.headers, status=res.statusCode;
      const cert=url.protocol==='https:'?res.socket.getPeerCertificate():null;
      const tls=cert?{validTo:cert.valid_to,authorized:res.socket.authorized}:null;
      // Redirect bodies, errors, binary and compressed representations are never consumed.
      if ([301,302,303,307,308].includes(status)) {res.destroy();finish(null,{status,headers,body:'',tls});return;}
      if (headers['content-encoding'] && headers['content-encoding']!=='identity') {res.destroy();finish(new CheckError('unsupported_encoding'));return;}
      if (!/^(?:text\/(?:html|plain|css|javascript)|application\/(?:javascript|x-javascript))(?:;|$)/i.test(headers['content-type']??'')) {res.destroy();finish(new CheckError('unsupported_content'));return;}
      const charset=(headers['content-type']??'').match(/charset\s*=\s*["']?([^;\s"']+)/i)?.[1];
      if(charset&&!/^(?:utf-8|utf8|us-ascii)$/i.test(charset)){res.destroy();finish(new CheckError('unsupported_encoding'));return;}
      if (Number(headers['content-length'])>LIMITS.bytes) {res.destroy();finish(new CheckError('body_limit'));return;}
      let size=0;const chunks=[];
      res.on('data',chunk=>{size+=chunk.length;if(size>LIMITS.bytes){res.destroy();finish(new CheckError('body_limit'));}else chunks.push(chunk);});
      res.on('end',()=>finish(null,{status,headers,body:Buffer.concat(chunks).toString('utf8'),tls}));
      res.on('error',()=>finish(new CheckError('connection_failed')));
    });
    const timer=setTimeout(()=>{req.destroy();finish(new CheckError('request_timeout'));},LIMITS.requestMs);
    req.on('error',error=>finish(new CheckError(signal.aborted?'cancelled':/CERT|TLS|SSL/.test(error.code??'')?'tls_failed':'connection_failed')));
    req.end();
  });
}
export function createFetcher({resolve=resolvePublic,transport=requestPinned,signal,limits=LIMITS}={}) {
  let count=0; const started=performance.now();
  const scopeSignal=signal?AbortSignal.any([signal,AbortSignal.timeout(limits.totalMs)]):AbortSignal.timeout(limits.totalMs);
  return {
    get count(){return count;},
    async fetch(input,{sameOrigin}={}) {
      let url=normalize(input);const seen=new Set(),chain=[];
      try {
        for(let hop=0;hop<=limits.redirects;hop++) {
          scopeSignal.throwIfAborted();
          if (performance.now()-started>=limits.totalMs) throw new CheckError('total_timeout');
          if (count>=limits.requests) throw new CheckError('request_limit');
          if (seen.has(url.href)) throw new CheckError('redirect_loop');
          if (sameOrigin && url.origin!==sameOrigin) throw new CheckError('cross_origin_asset');
          seen.add(url.href);
          const pinned=await resolve(url.hostname,scopeSignal);
          scopeSignal.throwIfAborted();count++;
          const response=await transport(url,pinned,scopeSignal);
          chain.push({url:safeUrl(url.href),method:'GET',status:response.status});
          if ([301,302,303,307,308].includes(response.status)) {
            if (!response.headers.location) throw new CheckError('redirect_missing');
            if (hop===limits.redirects) throw new CheckError('redirect_limit');
            url=normalize(new URL(response.headers.location,url).href);continue;
          }
          return {...response,url,chain};
        }
      } catch(error) {
        const failure=new CheckError(scopeSignal.aborted?(scopeSignal.reason?.name==='TimeoutError'?'total_timeout':'cancelled'):error instanceof CheckError?error.code:'connection_failed');
        failure.chain=chain;throw failure;
      }
    },
  };
}
