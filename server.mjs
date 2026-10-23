import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { scan,demo } from './src/checks.mjs';
import { normalize } from './src/safety.mjs';

export function createApp({scanner=scan,port=43145}={}) {
  let active=0;const requests=[];const hosts=new Map();
  const allowedHosts=new Set([`127.0.0.1:${port}`,`localhost:${port}`]);
  const assets=new Map([['/',['index.html','text/html; charset=utf-8']],['/app.mjs',['app.mjs','text/javascript; charset=utf-8']],['/style.css',['style.css','text/css; charset=utf-8']],['/i18n.mjs',['i18n.mjs','text/javascript; charset=utf-8']]]);
  return http.createServer({maxHeaderSize:8192,requestTimeout:10000,headersTimeout:10000},async(req,res)=>{
    res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cache-Control','no-store');
    const send=(status,data)=>{if(!res.destroyed){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));}};
    if(!allowedHosts.has(req.headers.host)){send(403,{error:'request_denied'});return;}
    if(req.method==='GET'&&assets.has(req.url)) {
      const [name,type]=assets.get(req.url);res.setHeader('Content-Type',type);res.end(await readFile(new URL(`./public/${name}`,import.meta.url)));return;
    }
    if(req.method!=='POST'||!['/api/scan','/api/demo'].includes(req.url)){send(404,{error:'not_found'});return;}
    if(req.headers.origin!==`http://${req.headers.host}`||req.headers['content-type']!=='application/json'||(req.headers['sec-fetch-site']&&!['same-origin','none'].includes(req.headers['sec-fetch-site']))) {send(403,{error:'request_denied'});return;}
    let body='';
    try {
      for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>4096){send(413,{error:'request_too_large'});return;}}
      const input=JSON.parse(body);
      if(req.url==='/api/demo'){send(200,await demo());return;}
      const target=normalize(input.url);const now=Date.now();
      while(requests.length&&requests[0]<now-60000)requests.shift();
      for(const [host,times] of hosts){const recent=times.filter(t=>t>now-60000);if(recent.length)hosts.set(host,recent);else hosts.delete(host);}
      const recent=hosts.get(target.hostname)??[];
      if(active>=2||requests.length>=10||recent.length>=3){send(429,{error:'rate_limit'});return;}
      requests.push(now);hosts.set(target.hostname,[...recent,now]);active++;
      const controller=new AbortController();const cancel=()=>controller.abort();res.on('close',cancel);
      try{send(200,await scanner(target.href,{signal:controller.signal}));}
      finally{active--;res.removeListener('close',cancel);controller.abort();}
    } catch(error) {send(400,{error:['invalid_url','unsafe_address'].includes(error.code)?error.code:'request_failed'});}
  });
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const port=Number(process.env.PORT??43145);
  if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid PORT');
  createApp({port}).listen(port,'127.0.0.1',()=>console.log(`Local: http://127.0.0.1:${port}`));
}
