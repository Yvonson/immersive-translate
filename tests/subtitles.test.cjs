const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup() {
  let tick, changed, time = 0;
  const requests = [], elements = [];
  const config = { subtitleTranslation: 'yes', targetLanguage: 'zh-CN', pageTranslatorService: 'local' };
  function element() {
    const node = { style: {}, setAttribute() {}, append() {}, remove() {}, attachShadow() { return element(); } };
    elements.push(node);
    return node;
  }
  const track = { kind: 'subtitles', mode: 'showing', activeCues: [{ text: 'Hello', getCueAsHTML: () => ({ textContent: 'Hello' }) }] };
  const video = { isConnected: true, ended: false, readyState: 4, textTracks: [track], getBoundingClientRect: () => ({ left: 0, top: 0, bottom: 600, width: 800, height: 600 }) };
  const document = { hidden: false, body: element(), createElement: element, querySelectorAll: () => [video] };
  const sandbox = {
    document, location: { hostname: 'example.com' }, innerWidth: 1200, innerHeight: 900,
    Date: { now: () => time }, setInterval: cb => { tick = cb; },
    twpConfig: { onReady: cb => cb(), onChanged: cb => { changed = cb; }, get: key => config[key] },
    chrome: { runtime: { sendMessage: (message, cb) => requests.push({ message, cb }) } },
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync('src/contentScript/subtitleTranslator.js', 'utf8'), sandbox);
  return {
    requests, elements, document,
    tick: () => tick(), advance: n => { time += n; tick(); },
    cue: text => { track.activeCues = text ? [{ text, getCueAsHTML: () => ({ textContent: text }) }] : []; },
    disable: () => { config.subtitleTranslation = 'no'; changed('subtitleTranslation'); },
  };
}

test('subtitle translations are debounced, stale responses discarded and output is plain text', () => {
  const state = setup();
  state.tick(); assert.equal(state.requests.length, 0);
  state.advance(300); assert.equal(state.requests.length, 1);
  assert.equal(state.requests[0].message.source, 'Hello');
  state.cue('Next line'); state.advance(300);
  state.requests[0].cb({ text: '迟到的译文' });
  assert.ok(!state.elements.some(node => node.textContent === '迟到的译文'));
  state.advance(300); assert.equal(state.requests.length, 2);
  state.requests[1].cb({ text: '<script>plain text</script>' });
  assert.ok(state.elements.some(node => node.textContent === '<script>plain text</script>'));
  const overlay = state.elements.find(node => node.className === 'notranslate');
  assert.equal(overlay.hidden, false);
  state.disable(); assert.equal(overlay.hidden, true);
  state.advance(1000); assert.equal(state.requests.length, 2);
});

test('clearing a cue hides the overlay and hidden tabs make no requests', () => {
  const state = setup();
  state.tick(); state.advance(300);
  state.requests[0].cb({ text: '你好' });
  const overlay = state.elements.find(node => node.className === 'notranslate');
  state.cue(''); state.advance(300); assert.equal(overlay.hidden, true);
  state.document.hidden = true; state.cue('Hidden cue'); state.advance(1000);
  assert.equal(state.requests.length, 1);
  state.document.hidden = false; state.tick(); state.advance(300);
  assert.equal(state.requests.length, 2);
});
