import { mountMeasurementFeedback, NOTICES } from './shared/measurement-feedback-client.mjs';
let language = navigator.language?.startsWith('de') ? 'de' : 'en';
try { const saved = localStorage.getItem('arcdrake-tools-language'); if (['en', 'de'].includes(saved)) language = saved; } catch {}
const requested = new URL(location.href).searchParams.get('lang'); if (['en', 'de'].includes(requested)) language = requested;
const container = document.getElementById('measurement-feedback');
const ui = mountMeasurementFeedback(container, { product: 'sitecheck', language });
// Translate visible UI text without remounting, replacing form controls or
// touching drafts. The shared client owns the in-flight request and receipt.
function localize() {
  const target = NOTICES[language], source = NOTICES[language === 'de' ? 'en' : 'de'];
  const pairs = Object.keys(target).filter(key => source[key] !== target[key]).map(key => [source[key], target[key]]);
  const walk = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  while (walk.nextNode()) {
    const node = walk.currentNode;
    if (node.parentElement?.closest('textarea,input')) continue;
    for (const [before, after] of pairs) {
      if (node.nodeValue === before) { node.nodeValue = after; break; }
      if (before === source.sent && node.nodeValue.startsWith(before)) {
        node.nodeValue = after + node.nodeValue.slice(before.length); break;
      }
    }
  }
  container.parentElement.setAttribute('aria-label', language === 'de' ? 'Feedback und Datenschutz' : 'Feedback and privacy choices');
}
const observer = new MutationObserver(localize);
observer.observe(container, { childList: true, subtree: true, characterData: true });
localize();
export const measurement = ui.client;
void measurement.track('page_view');
window.addEventListener('arcdrake-language-change', event => {
  if (!['en', 'de'].includes(event.detail?.language)) return;
  language = event.detail.language; localize();
  const prefix = language === 'de' ? '/de' : '';
  const links = container.querySelectorAll('a');
  links[0].href = `https://tools.arcdrake.com${prefix}/privacy/`;
  links[1].href = `https://arcdrake.com${prefix}/contact/`;
});
