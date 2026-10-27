// Assemble static /site-check/ assets without running, provisioning or publishing a service.
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { copy } from '../hosted/copy.mjs';
const root = path.resolve(import.meta.dirname, '..');
const out = path.resolve(root, process.argv[2] ?? '.runtime/hosted');
if (!out.startsWith(root + path.sep) || existsSync(out)) throw Error('Use a fresh output directory inside the checkout');
mkdirSync(out, { recursive: true });
let html = readFileSync(path.join(root, 'public/index.html'), 'utf8');
html = html.replace('href="/style.css"', 'href="./style.css"').replace('src="/app.mjs"', 'src="./app.mjs"');
html = html.replace('href="/" aria-label="ARCDRAKE home"', 'href="https://tools.arcdrake.com/" aria-label="All Arcdrake tools"');
// No pre-hydration claim that a public server is the visitor's local computer.
html = html.replace(/(<p data-t="privacy">)[\s\S]*?(<\/p>)/, (_, before, after) => before + copy.en.privacy + after);
html = html.replace(/(<p id="url-help"[^>]*>)[\s\S]*?(<\/p>)/, (_, before, after) => before + copy.en.help + after);
html = html.replace('Runs on your computer · English &amp; Deutsch', 'An Arcdrake tool · English &amp; Deutsch').replace('Runs on your computer · English & Deutsch', 'An Arcdrake tool · English & Deutsch');
html = html.replace(/(<p data-t="limits">)[\s\S]*?(<\/p>)/, (_, before, after) => before + copy.en.limits + after);
html = html.replace('</footer>', '<nav aria-label="Footer"><a href="https://tools.arcdrake.com/">All tools / Alle Werkzeuge</a> · <a href="https://arcdrake.com/">Arcdrake</a> · <a href="https://tools.arcdrake.com/privacy/">Privacy</a> · <a href="https://tools.arcdrake.com/de/privacy/">Datenschutz</a> · <a href="https://buymeacoffee.com/arcdrakestudios" rel="noopener noreferrer">Support / Unterstützen</a></nav></footer>');
html = html.replace('</main>', '<section aria-label="Feedback and privacy choices"><div id="measurement-feedback"></div></section></main>');
html = html.replace('</head>', '<link rel="canonical" href="https://tools.arcdrake.com/site-check/"></head>');
writeFileSync(path.join(out, 'index.html'), html);
let app = readFileSync(path.join(root, 'public/app.mjs'), 'utf8');
app = app.replace("from './i18n.mjs'", "from './hosted-copy.mjs'");
app = "import {measurement} from './feedback.mjs';\n" + app;
app = app.replace("let lang='en';try{lang=localStorage.getItem('site-check-language')==='de'?'de':'en';}catch{}", "let lang=navigator.language?.startsWith('de')?'de':'en';try{const saved=localStorage.getItem('arcdrake-tools-language');if(['en','de'].includes(saved))lang=saved;}catch{}").replaceAll('site-check-language', 'arcdrake-tools-language');
app = app.replace("isDemo?'/api/demo':'/api/scan'", "isDemo?'/api/site-check/demo':'/api/site-check/scan'");
app = app.replace("{method:'POST',headers:", "{method:'POST',credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store',headers:");
app = app.replace('async function run(isDemo=false){', "async function run(isDemo=false){\n  if(!isDemo)void measurement.track('tool_start');");
app = app.replace('last=data;render();', "last=data;if(!isDemo)void measurement.track('tool_complete');render();");
app = app.replace("render();if(lastStatus)", "render();window.dispatchEvent(new CustomEvent('arcdrake-language-change',{detail:{language:lang}}));if(lastStatus)");
app = app.replace("let last=null", "const requestedLanguage=new URL(location.href).searchParams.get('lang');if(['en','de'].includes(requestedLanguage))lang=requestedLanguage;\nlet last=null");
writeFileSync(path.join(out, 'app.mjs'), app);
for (const name of ['style.css', 'i18n.mjs']) copyFileSync(path.join(root, 'public', name), path.join(out, name));
writeFileSync(path.join(out, 'hosted-copy.mjs'), readFileSync(path.join(root, 'hosted/copy.mjs'), 'utf8').replace("from '../public/i18n.mjs'", "from './i18n.mjs'"));
copyFileSync(path.join(root, 'hosted/feedback.mjs'), path.join(out, 'feedback.mjs'));
mkdirSync(path.join(out, 'shared'));
for (const name of ['measurement-contract.mjs', 'measurement-feedback-client.mjs'])
  copyFileSync(path.join(root, 'hosted/shared', name), path.join(out, 'shared', name));
console.log(out);
