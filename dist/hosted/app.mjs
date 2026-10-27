import {measurement} from './feedback.mjs';
import {copy} from './hosted-copy.mjs';
const $=id=>document.getElementById(id);
let lang=navigator.language?.startsWith('de')?'de':'en';try{const saved=localStorage.getItem('arcdrake-tools-language');if(['en','de'].includes(saved))lang=saved;}catch{}
const requestedLanguage=new URL(location.href).searchParams.get('lang');if(['en','de'].includes(requestedLanguage))lang=requestedLanguage;
let last=null,controller=null,generation=0,lastStatus=null;
const el=(tag,text,className)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;};
const t=key=>copy[lang][key];
function status(key,note=false){lastStatus=key?{key,note}:null;$('status').textContent=key?(note?copy[lang].notes[key]??copy[lang].notes.request_failed:t(key)):'';}
function evidence(data){const d=el('details');d.append(el('summary',t('evidence')));const list=el('dl');for(const [key,label]of [['url','request'],['status','status'],['chain','redirects'],['headers','headers'],['excerpt','excerpt']]){if(data[key]===undefined||data[key]==='')continue;list.append(el('dt',t(label)));const value=el('dd');value.append(el('pre',typeof data[key]==='object'?JSON.stringify(data[key],null,2):String(data[key])));list.append(value);}d.append(list);return d;}
function render(){
  if(!last)return;$('results').hidden=false;$('target').textContent=last.target;$('demo-label').hidden=!last.demo;$('timing').textContent=`${(last.elapsedMs/1000).toFixed(1)} ${t('seconds')} · ${last.requests} ${t('requests')}`;
  $('cards').replaceChildren();
  for(const [key,value]of Object.entries(last.families)){const card=el('article',undefined,'card');card.append(el('span',t(value.state),`badge ${value.state}`),el('h3',t(key)));if(!value.findings.length&&value.state==='ok')card.append(el('p',t('none')));
    for(const f of value.findings){const row=el('section',undefined,'finding');const words=copy[lang].findings[f.code];row.append(el('h4',words?.[0]??t('inconclusive')),el('p',words?.[1]??''),evidence(f.evidence));card.append(row);}
    for(const note of [...new Set(value.notes)])card.append(el('p',copy[lang].notes[note]??copy[lang].notes.request_failed));
    if(value.certificateExpires)card.append(el('p',`${t('certificate')}: ${new Date(value.certificateExpires).toLocaleDateString(lang)}`));$('cards').append(card);
  }
  $('sample-list').replaceChildren(...last.sampled.map(evidence));
}
function translate(){document.documentElement.lang=lang;$('language').value=lang;document.title=`${t('title')} · ARCDRAKE`;document.querySelectorAll('[data-t]').forEach(n=>n.textContent=t(n.dataset.t));render();window.dispatchEvent(new CustomEvent('arcdrake-language-change',{detail:{language:lang}}));if(lastStatus)status(lastStatus.key,lastStatus.note);}
$('language').addEventListener('change',()=>{lang=$('language').value;try{localStorage.setItem('arcdrake-tools-language',lang);}catch{}translate();});
function busy(state){$('submit').disabled=state;$('demo').disabled=state;$('cancel').hidden=!state;$('results').setAttribute('aria-busy',String(state));}
async function run(isDemo=false){
  if(!isDemo)void measurement.track('tool_start');
  const own=++generation;controller?.abort();controller=new AbortController();busy(true);status('loading');last=null;$('results').hidden=true;
  const timer=setTimeout(()=>controller?.abort(),28000);
  try{const response=await fetch(isDemo?'/api/site-check/demo':'/api/site-check/scan',{method:'POST',credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:$('url').value.trim()}),signal:controller.signal});const data=await response.json();if(own!==generation)return;if(!response.ok)throw Error(data.error);last=data;if(!isDemo)void measurement.track('tool_complete');render();status('done');$('results-title').focus();}
  catch(error){if(own===generation)status(error.name==='AbortError'?'cancelled':error.message,error.name!=='AbortError');}
  finally{clearTimeout(timer);if(own===generation){controller=null;busy(false);}}
}
$('check-form').addEventListener('submit',e=>{e.preventDefault();run();});$('demo').addEventListener('click',()=>run(true));$('cancel').addEventListener('click',()=>controller?.abort());$('clear').addEventListener('click',()=>{generation++;controller?.abort();controller=null;last=null;busy(false);$('url').value='';status(null);$('results').hidden=true;$('cards').replaceChildren();$('sample-list').replaceChildren();$('target').textContent='';$('url').focus();});translate();
