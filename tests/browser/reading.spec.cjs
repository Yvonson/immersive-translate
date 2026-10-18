const { test, expect, chromium } = require('@playwright/test');
const http = require('node:http');
const path = require('node:path');
let server, context, worker, base, requests = [], failures = [], apiDelay = 0, stripMarkers = false, testRevision = 0;
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>body{font:18px/1.6 Georgia;color:#19342d;margin:40px} main{max-width:760px}h1{font-size:32px}strong{color:#943028}a{color:#276aad}video{width:640px;height:360px;background:#222} li,td,p{padding:4px}td{border:1px solid #aaa}</style></head><body><main><h1 id="heading">Reading tools</h1><p id="one">Hello <strong>bold world</strong> and <a id="link" href="/next">a link</a> with <code>x = 1</code>.</p><p id="two">Another paragraph</p><ul><li id="item">List item</li></ul><table><tbody><tr><td id="cell">Table cell</td></tr></tbody></table><input aria-label="editor"><video id="video"></video></main><script>window.originalNode=document.querySelector('#one');window.originalText=originalNode.firstChild;window.clicks=0;document.querySelector('#link').addEventListener('click',event=>{event.preventDefault();window.clicks++});</script></body></html>`;
test.beforeAll(async () => {
  server = http.createServer(async (req,res) => {
    if (req.url === '/v1/chat/completions') {
      let body = ''; for await (const part of req) body += part;
      const value = JSON.parse(body); const texts = JSON.parse(value.messages[1].content); requests.push(texts);
      const delay = apiDelay; await new Promise(resolve => setTimeout(resolve, delay));
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(texts.map(text => '译：'+(stripMarkers ? text.replace(/⟦OBT\d+⟧/g,'') : text)))}}]})); return;
    }
    res.writeHead(200,{'Content-Type':'text/html'}); res.end(html);
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve)); base=`http://127.0.0.1:${server.address().port}`;
  const extension=path.resolve('dist/chrome');
  context = await chromium.launchPersistentContext('',{headless:true,channel:'chromium',executablePath:process.env.OBT_TEST_BROWSER,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`,'--no-proxy-server']});
  worker=context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  context.on('page',page=>page.on('pageerror',error=>failures.push(error.message)));
  await worker.evaluate(async base => { await twpConfig.onReady(); await chrome.storage.local.set({pageTranslatorService:'local',targetLanguage:'zh-CN',aiProviderSettings:{local:{baseUrl:base+'/v1',model:'fixture',apiKey:''}},pageShortcuts:{'hotkey-toggle-translation':'Alt+Q','hotkey-toggle-dual':'Alt+D'}}); },base);
});
test.afterAll(async () => { await context?.close(); await new Promise(resolve => server?.close(resolve)); });
test.beforeEach(async () => { requests=[];apiDelay=0;failures=[];stripMarkers=false;await worker.evaluate(async ({base,revision})=>{await chrome.storage.local.set({aiProviderSettings:{local:{baseUrl:base+'/v1',model:'fixture-'+revision,apiKey:''}}});},{base,revision:++testRevision}); });
test.afterEach(async ({},info) => { if (info.status !== info.expectedStatus) console.log({requests,failures,background:await worker.evaluate(()=>({service:twpConfig.get('pageTranslatorService'),language:twpConfig.get('targetLanguage'),exact:typeof translationService.translateExact}))}); });
async function page() { const page=await context.newPage(); await page.goto(base); await page.waitForTimeout(350); return page; }
async function ctrl(page,selector) { await page.locator(selector).hover(); await page.keyboard.press('Control'); }
async function translation(page,selector) { return page.locator(selector).evaluate(node=>node.nextElementSibling?.matches('[data-obt-translation]')?node.nextElementSibling.textContent:node.querySelector('[data-obt-translation]')?.textContent); }
test('Ctrl keeps originals, typography, inline links, code and other blocks',async()=>{
  const p=await page();await ctrl(p,'#one');await expect.poll(()=>translation(p,'#one')).toContain('译：Hello');
  expect(await p.evaluate(()=>originalNode===document.querySelector('#one')&&originalText===originalNode.firstChild)).toBe(true);
  expect(await p.locator('#two').textContent()).toBe('Another paragraph');
  const translated=p.locator('#one + [data-obt-translation]');await expect(translated.locator('strong')).toHaveText('bold world');await expect(translated.locator('code')).toHaveText('x = 1');
  expect(await translated.evaluate(node=>getComputedStyle(node).fontSize)).toBe('18px');
  expect(await translated.locator('a').getAttribute('href')).toBe(base+'/next');
  await p.screenshot({path:'.local/paragraph-preview.png'});
  await p.locator('#link').click();expect(await p.evaluate(()=>clicks)).toBe(1);
  await ctrl(p,'#one');await expect(p.locator('#one + [data-obt-translation]')).toHaveCount(0);await p.close();expect(failures).toEqual([]);
});
test('Ctrl combinations, editable focus and repeat are not paragraph actions',async()=>{
  const p=await page();await p.locator('#one').hover();await p.keyboard.press('Control+c');await p.waitForTimeout(200);expect(requests.length).toBe(0);
  await p.locator('input').focus();await p.keyboard.press('Control');await p.waitForTimeout(200);expect(requests.length).toBe(0);await p.close();
});

test('paragraph extraction keeps visible prose and excludes hidden metadata and controls',async()=>{
  const p=await page();
  await p.locator('#one').evaluate(node=>{
    node.innerHTML='<span>夏凪の『鼓動』最高過ぎる</span><span hidden>合集</span><span style="display:none">了解细节</span><span style="visibility:hidden">Invisible metadata</span><span inert>Inert controls</span><span role="tooltip">Learn more tooltip</span><span role="button">Reply control</span><span style="display:contents"> with <strong>visible formatting</strong></span><code>const value = 1<span hidden>Hidden code label</span></code>';
  });
  await ctrl(p,'#one > span:first-child');
  await expect(p.locator('#one + [data-obt-translation] [data-obt-result]')).toBeVisible();
  const sent=requests.flat().join('');
  expect(sent).toContain('夏凪の『鼓動』最高過ぎる'); expect(sent).toContain('visible formatting');
  for(const noise of ['合集','了解细节','Invisible metadata','Inert controls','Learn more tooltip','Reply control','Hidden code label']) {
    expect(sent).not.toContain(noise); expect(await translation(p,'#one')).not.toContain(noise);
  }
  await expect(p.locator('#one > [hidden]')).toHaveText('合集');
  await expect(p.locator('#one + [data-obt-translation] strong')).toHaveText('visible formatting');
  await expect(p.locator('#one + [data-obt-translation] code')).toHaveText('const value = 1');
  // These words remain valid when they are part of the actual visible prose.
  await ctrl(p,'#two'); await ctrl(p,'#two');
  await p.locator('#two').evaluate(node=>{node.textContent='合集、了解细节 are visible prose here.'});
  await ctrl(p,'#two'); await expect.poll(()=>translation(p,'#two')).toContain('合集、了解细节');
  await p.keyboard.press('Alt+d'); await p.waitForTimeout(400);
  await expect(p.locator('#one + [data-obt-translation] [data-obt-result]')).toBeVisible();
  await p.keyboard.press('Alt+d'); await expect(p.locator('#one > span:first-child')).toBeVisible();
  await p.locator('#one code').evaluate(node=>{node.firstChild.nodeValue='const value = 2'});
  await expect(p.locator('#one + [data-obt-translation] code')).toHaveText('const value = 2');
  await p.close(); expect(failures).toEqual([]);
});

test('Google HTML requests contain only readable text and visibility changes refresh translations',async()=>{
  let p;
  await worker.evaluate(()=>{
    globalThis.fixtureOriginalFetch=globalThis.fetch; globalThis.fixtureGoogleInputs=[];
    globalThis.fetch=async(url,options)=>{
      if (!String(url).startsWith('https://translate.googleapis.com/translate_a/t')) return fixtureOriginalFetch(url,options);
      const inputs=new URLSearchParams(options.body).getAll('q'); fixtureGoogleInputs.push(...inputs);
      return new Response(JSON.stringify(inputs.map(text=>[text.replace('<pre>','<pre>谷歌测试：'),'ja'])),{headers:{'Content-Type':'application/json'}});
    };
    twpConfig.set('pageTranslatorService','google');
  });
  try {
    p=await page();
    await p.locator('#one').evaluate(node=>{node.innerHTML='<span>夏凪の『鼓動』最高過ぎる</span><span id="newVisible" hidden>New visible sentence</span><span role="tooltip">合集 了解细节</span>'});
    await ctrl(p,'#one > span:first-child');
    await expect.poll(()=>translation(p,'#one')).toContain('谷歌测试：');
    let sent=await worker.evaluate(()=>fixtureGoogleInputs.join(''));
    expect(sent).not.toContain('合集'); expect(sent).not.toContain('了解细节'); expect(sent).not.toContain('New visible sentence');
    await p.locator('#newVisible').evaluate(node=>{node.hidden=false});
    await expect.poll(()=>translation(p,'#one')).toContain('New visible sentence');
    await p.locator('#newVisible').evaluate(node=>{node.style.display='none'});
    await expect.poll(()=>translation(p,'#one')).not.toContain('New visible sentence');
    sent=await worker.evaluate(()=>fixtureGoogleInputs.join('')); expect(sent).not.toContain('合集'); expect(sent).not.toContain('了解细节');
    await expect(p.locator('#one [role=tooltip]')).toHaveText('合集 了解细节');
  } finally {
    await p?.close();
    await worker.evaluate(()=>{globalThis.fetch=fixtureOriginalFetch; delete globalThis.fixtureOriginalFetch; delete globalThis.fixtureGoogleInputs; twpConfig.set('pageTranslatorService','local');});
  }
  expect(failures).toEqual([]);
});

test('YouTube inline comment roots exclude adjacent metadata for Ctrl and whole-page translation',async()=>{
  const p=await context.newPage();
  await p.route('https://www.youtube.com/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>body{font:18px/1.6 sans-serif;margin:40px}ytd-comment-thread-renderer{display:block}#body{padding:12px}#content-text{display:inline}</style></head><body><main><ytd-comment-thread-renderer><div id="body"><div id="header">5年前 · Comment author</div><span id="content-text"><span>夏凪の『鼓動』最高過ぎる</span><span hidden>合集</span><tp-yt-paper-tooltip>了解细节</tp-yt-paper-tooltip></span><div id="toolbar"><span>Recommendations outside comment</span><button>Reply</button></div></div></ytd-comment-thread-renderer></main></body></html>'}));
  await p.goto('https://www.youtube.com/watch?v=comment-fixture');
  await ctrl(p,'#content-text > span:first-child');
  await expect(p.locator('#content-text + [data-obt-translation] [data-obt-result]')).toBeVisible();
  for(const value of ['5年前','Comment author','Recommendations outside comment','合集','了解细节']) expect(requests.flat().join('')).not.toContain(value);
  await p.reload(); await p.waitForTimeout(350);
  await p.keyboard.press('Alt+q');
  await expect(p.locator('#content-text + [data-obt-translation] [data-obt-result]')).toBeVisible();
  await expect(p.locator('[data-obt-translation]')).toHaveCount(1);
  const count=requests.length;
  await p.locator('#content-text [hidden]').evaluate(node=>{node.textContent='Hidden metadata updated'});
  await p.waitForTimeout(350); expect(requests.length).toBe(count);
  await p.locator('#content-text > span:first-child').evaluate(node=>{node.textContent+=' 改訂';});
  await expect.poll(()=>p.locator('#content-text + [data-obt-translation]').textContent()).toContain('改訂');
  await p.keyboard.press('Alt+q'); await expect(p.locator('[data-obt-translation]')).toHaveCount(0);
  await expect(p.locator('#header')).toHaveText('5年前 · Comment author');
  await expect(p.locator('#content-text [hidden]')).toBeHidden(); await p.close(); expect(failures).toEqual([]);
});
test('whole page and Ctrl deduplicate; lists/tables and restore preserve grammar',async()=>{
  const p=await page();await ctrl(p,'#one');await expect.poll(()=>translation(p,'#one')).toContain('译：');await p.keyboard.press('Alt+q');
  await expect.poll(()=>translation(p,'#two')).toContain('译：');await expect(p.locator('#one + [data-obt-translation]')).toHaveCount(1);
  await expect.poll(()=>p.locator('#item [data-obt-translation]').textContent()).toContain('译：');await expect.poll(()=>p.locator('#cell [data-obt-translation]').textContent()).toContain('译：');
  await ctrl(p,'#one');await p.locator('#two').evaluate(node=>node.append(' changed'));await p.waitForTimeout(400);await expect(p.locator('#one + [data-obt-translation]')).toHaveCount(0);
  await p.keyboard.press('Alt+q');await expect(p.locator('[data-obt-translation]')).toHaveCount(0);expect(await p.evaluate(()=>originalNode===document.querySelector('#one'))).toBe(true);await p.close();
});
test('late paragraph response cannot resurrect a closed translation',async()=>{
  const p=await page();apiDelay=700;await ctrl(p,'#two');await expect.poll(()=>requests.length).toBe(1);await ctrl(p,'#two');await p.waitForTimeout(900);await expect(p.locator('#two + [data-obt-translation]')).toHaveCount(0);await p.close();
});
test('damaged format markers retry same engine by runs without inserting HTML',async()=>{
  const p=await page();stripMarkers=true;await ctrl(p,'#one');const translated=p.locator('#one + [data-obt-translation]');await expect(translated.locator('[data-obt-result]')).toBeVisible();expect(requests.length).toBeGreaterThan(1);await expect(translated.locator('strong')).toHaveText('译：bold world');await expect(translated.locator('code')).toHaveText('x = 1');await p.close();
});
test('only-translation mode restores the same original text nodes and code',async()=>{
  const p=await page();await ctrl(p,'#one');await expect.poll(()=>translation(p,'#one')).toContain('译：');await p.keyboard.press('Alt+d');await expect(p.locator('#one code')).toBeHidden();await p.keyboard.press('Alt+d');await expect(p.locator('#one code')).toBeVisible();expect(await p.evaluate(()=>originalNode===document.querySelector('#one')&&originalText===originalNode.firstChild)).toBe(true);await p.close();
});
test('Ctrl resolves text in open shadow roots and focused same-origin frames',async()=>{
  const p=await page();await p.evaluate(()=>{const host=document.createElement('x-reader');host.attachShadow({mode:'open'}).innerHTML='<p id="shadow">Shadow paragraph</p>';document.querySelector('main').prepend(host);const frame=document.createElement('iframe');frame.id='frame';frame.srcdoc='<html lang="en"><body><p id="inside">Frame paragraph</p></body></html>';document.querySelector('main').prepend(frame)});
  await ctrl(p,'x-reader p');await expect.poll(()=>p.locator('x-reader').locator('[data-obt-translation]').textContent()).toContain('译：Shadow');
  const inside=p.frameLocator('#frame').locator('#inside');await inside.click();await inside.hover();await p.keyboard.press('Control');await expect.poll(()=>p.frameLocator('#frame').locator('[data-obt-translation]').textContent()).toContain('译：Frame');await expect(p.locator('#one + [data-obt-translation]')).toHaveCount(0);await p.close();
});
test('subtitle VTT timeline, seeking and disable work in a real DOM',async()=>{
  const p=await page();
  await p.evaluate(()=>{const v=document.querySelector('video');const t=v.addTextTrack('subtitles','English','en');t.addCue(new VTTCue(0,3,'Hello caption'));t.addCue(new VTTCue(3,6,'Next caption'));t.mode='showing'});
  // Extension panels use closed roots: inspect through test CDP, not page-accessible hooks.
  const cdp=await context.newCDPSession(p);const worlds=[];cdp.on('Runtime.executionContextCreated',event=>worlds.push(event.context));await cdp.send('Runtime.enable');
  let contentWorld;
  for(const world of worlds){const value=await cdp.send('Runtime.evaluate',{contextId:world.id,expression:'typeof pageTranslator'});if(value.result.value==='object'){contentWorld=world.id;break}}
  expect(contentWorld).toBeTruthy();
  await cdp.send('Runtime.evaluate',{contextId:contentWorld,expression:"globalThis.fixtureTime=1;Object.defineProperty(document.querySelector('video'),'currentTime',{configurable:true,get:()=>globalThis.fixtureTime})"});
  const root=await cdp.send('DOM.getDocument',{depth:-1,pierce:true});
  function find(node,predicate){if(predicate(node))return node;for(const child of [...(node.children||[]),...(node.shadowRoots||[])]){const result=find(child,predicate);if(result)return result}}
  const button=find(root.root,node=>node.nodeName==='BUTTON'&&node.attributes?.includes('双语字幕设置'));expect(button).toBeTruthy();
  const remote=await cdp.send('DOM.resolveNode',{nodeId:button.nodeId});await cdp.send('Runtime.callFunctionOn',{objectId:remote.object.objectId,functionDeclaration:'function(){this.click()}'});
  await p.screenshot({path:'.local/subtitle-menu-preview.png'});
  const next=await cdp.send('DOM.getDocument',{depth:-1,pierce:true});const checkbox=find(next.root,node=>node.nodeName==='INPUT'&&node.attributes?.includes('checkbox'));
  const menu=find(next.root,node=>node.nodeName==='SECTION'&&node.attributes?.includes('menu'));const panel=await cdp.send('DOM.resolveNode',{nodeId:menu.nodeId});
  const bounds=await cdp.send('Runtime.callFunctionOn',{objectId:panel.object.objectId,functionDeclaration:'function(){const r=this.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:innerHeight}}',returnByValue:true});expect(bounds.result.value.top).toBeGreaterThanOrEqual(0);expect(bounds.result.value.bottom).toBeLessThanOrEqual(bounds.result.value.height);
  const check=await cdp.send('DOM.resolveNode',{nodeId:checkbox.nodeId});await cdp.send('Runtime.callFunctionOn',{objectId:check.object.objectId,functionDeclaration:'function(){this.click()}'});
  await expect.poll(()=>requests.flat().includes('Hello caption')).toBe(true);await p.waitForTimeout(300);
  await cdp.send('Runtime.evaluate',{contextId:contentWorld,expression:"fixtureTime=4;document.querySelector('video').dispatchEvent(new Event('seeking'))"});await expect.poll(()=>requests.flat().includes('Next caption')).toBe(true);
  await cdp.send('Runtime.callFunctionOn',{objectId:check.object.objectId,functionDeclaration:'function(){this.click()}'});await p.waitForTimeout(100);
  expect(await p.locator('[data-obt-subtitle-overlay]').evaluateAll(nodes=>nodes.every(node=>getComputedStyle(node).display==='none'))).toBe(true);await p.close();expect(failures).toEqual([]);
});
test('options exposes editable page keys and actual native bindings',async()=>{
  const extensionId=new URL(worker.url()).host;const p=await context.newPage();await p.goto(`chrome-extension://${extensionId}/options/options.html#hotkeys`);
  const input=p.getByRole('textbox',{name:'翻译 / 恢复原文',exact:true});await expect(input).toBeEnabled();await input.focus();await p.keyboard.press('Alt+Shift+e');await expect(input).toHaveValue('Alt+Shift+E');
  await expect(p.locator('#obt-native-keys')).toContainText('翻译 / 恢复原文');await p.close();
});

async function closedUI(p) {
  const cdp = await context.newCDPSession(p);
  function find(node,predicate) { if (predicate(node)) return node; for (const child of [...(node.children || []),...(node.shadowRoots || [])]) { const value = find(child,predicate); if (value) return value; } }
  return async (predicate,fn) => {
    const {root} = await cdp.send('DOM.getDocument',{depth:-1,pierce:true});
    const node = find(root,predicate); expect(node).toBeTruthy();
    // Fullscreen can invalidate CDP's frontend node IDs between these commands.
    // Backend IDs identify the DOM node across that document-tree refresh.
    const {object} = await cdp.send('DOM.resolveNode',{backendNodeId:node.backendNodeId});
    const result = await cdp.send('Runtime.callFunctionOn',{objectId:object.objectId,functionDeclaration:fn,returnByValue:true});
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };
}

test('settings regrouping, themes and subtitle appearance preserve private model settings',async()=>{
  const id = new URL(worker.url()).host, p = await context.newPage();
  const saved = await worker.evaluate(async()=> (await chrome.storage.local.get('aiProviderSettings')).aiProviderSettings);
  await p.goto(`chrome-extension://${id}/options/options.html#subtitles`);
  await expect(p.locator('#itemSelectedName')).toHaveText('视频字幕');
  await p.locator('#subtitle-size').fill('28');
  await expect.poll(()=>worker.evaluate(()=>twpConfig.get('subtitleStyle').size)).toBe(28);
  await p.locator('#subtitle-mode').selectOption('translation');
  await expect(p.getByText('A new way to read the world.',{exact:true})).toBeHidden();
  await p.locator('a[href="#main"]').click(); await p.locator('#darkMode').selectOption('yes');
  await expect(p.locator('html')).toHaveAttribute('data-theme','dark');
  await p.screenshot({path:'.local/settings-dark.png',fullPage:true});
  await p.locator('#darkMode').selectOption('no');
  await p.locator('a[href="#translations"]').click();
  await p.screenshot({path:'.local/settings-services.png',fullPage:true});
  await p.evaluate(()=>location.hash='#removed-section');
  await expect(p.locator('#main')).toBeVisible(); await expect(p.locator('#itemSelectedName')).toHaveText('基础设置');
  expect(await worker.evaluate(async()=> (await chrome.storage.local.get('aiProviderSettings')).aiProviderSettings)).toEqual(saved);
  await p.setViewportSize({width:390,height:844}); await expect(p.locator('#btnOpenMenu')).toBeVisible(); await p.locator('#btnOpenMenu').click(); await expect(p.locator('#sideBar')).toBeVisible();
  await p.locator('a[href="#hotkeys"]').click(); await expect(p.locator('#hotkeys')).toBeVisible(); await expect(p.locator('#sideBar')).toBeHidden();
  await worker.evaluate(()=>twpConfig.set('subtitleStyle',{mode:'dual',order:'source-first',size:22,color:'#ffffff',opacity:.75,offset:12}));
  await p.close(); expect(failures).toEqual([]);
});

test('popup selects all engines and translates/restores the original tab',async()=>{
  const content = await page(); const p = await context.newPage(); await content.bringToFront();
  const id = new URL(worker.url()).host;
  await worker.evaluate(()=>twpConfig.set('paragraphTrigger','Shift'));
  await p.goto(`chrome-extension://${id}/popup/old-popup.html`);
  await expect(p.locator('#hoverLabel')).toContainText('Shift');
  await expect(p.locator('#selectService option')).toHaveCount(5);
  await p.locator('#selectService').selectOption('deepseek');
  await expect(p.locator('#configureService')).toBeVisible();
  await expect.poll(()=>worker.evaluate(()=>twpConfig.get('pageTranslatorService'))).toBe('deepseek');
  await p.locator('#selectService').selectOption('local');
  await p.screenshot({path:'.local/popup-redesign.png'});
  await p.locator('#btnTranslate').click();
  await expect.poll(()=>translation(content,'#one')).toContain('译：Hello');
  await p.locator('#btnRestore').click(); await expect(content.locator('[data-obt-translation]')).toHaveCount(0);
  await worker.evaluate(()=>twpConfig.set('paragraphTrigger','Control'));
  await p.close(); await content.close(); expect(failures).toEqual([]);
});

test('YouTube-style controls anchor the menu inside normal, theater, zoom and fullscreen players',async()=>{
  const p=await context.newPage(); await p.setViewportSize({width:1280,height:900});
  await p.route('https://www.youtube.com/**',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html lang="en"><head><meta charset="utf-8"><style>body{background:#111;color:#fff;margin:20px}.html5-video-player{position:relative;width:960px;height:540px;background:linear-gradient(140deg,#28233b,#101b2a);margin-top:60px}.html5-video-player:fullscreen{width:100vw!important;height:100vh!important;zoom:1!important;margin:0}video{width:100%;height:100%}.ytp-chrome-bottom{position:absolute;bottom:0;left:0;right:0;height:48px;background:#0007}.ytp-right-controls{float:right;height:48px;display:flex}.ytp-button{border:0;background:transparent;color:white;width:48px;height:48px;font-size:22px}.ytp-settings-menu{position:absolute;right:12px;bottom:60px;background:#333;padding:25px}.title{position:absolute;top:30px;left:30px;font:28px Georgia}</style></head><body><div class="html5-video-player"><video></video><span class="title">Bilingual reading, in motion.</span><div class="ytp-chrome-bottom"><div class="ytp-right-controls"><button class="ytp-subtitles-button ytp-button" aria-pressed="true">▤</button><button class="ytp-settings-button ytp-button" aria-expanded="false">⚙</button><button class="ytp-fullscreen-button ytp-button">⛶</button></div></div><div class="ytp-settings-menu" hidden>Native settings</div></div><script>const gear=document.querySelector('.ytp-settings-button');gear.onclick=()=>{gear.setAttribute('aria-expanded',String(gear.getAttribute('aria-expanded')!=='true'));document.querySelector('.ytp-settings-menu').hidden=gear.getAttribute('aria-expanded')!=='true'};document.querySelector('.ytp-fullscreen-button').onclick=()=>document.querySelector('.html5-video-player').requestFullscreen();</script></body></html>`}));
  await p.goto('https://www.youtube.com/watch?v=layout-fixture');
  await expect(p.locator('.obt-subtitle-control')).toHaveCount(1);
  expect(await p.locator('.ytp-subtitles-button').evaluate(node=>node.nextElementSibling.matches('.obt-subtitle-control'))).toBe(true);
  const ui=await closedUI(p), button=node=>node.nodeName==='BUTTON'&&node.attributes?.includes('双语字幕设置'), menu=node=>node.nodeName==='SECTION'&&node.attributes?.includes('menu');
  const click=()=>ui(button,'function(){this.click()}');
  async function bounds() {
    const value=await ui(menu,'function(){const r=this.getBoundingClientRect(),p=this.getRootNode().host.parentElement.getBoundingClientRect(),b=p.bottom;return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,pl:Math.max(p.left,0),pr:Math.min(p.right,innerWidth),pt:Math.max(p.top,0),pb:Math.min(b,innerHeight)}}');
    expect(value.left).toBeGreaterThanOrEqual(value.pl); expect(value.right).toBeLessThanOrEqual(value.pr); expect(value.top).toBeGreaterThanOrEqual(value.pt); expect(value.bottom).toBeLessThanOrEqual(value.pb);
    const rect=await p.locator('.obt-subtitle-control').boundingBox(); expect(value.bottom).toBeLessThanOrEqual(rect.y);
  }
  await p.locator('.ytp-settings-button').click(); await click(); await expect(p.locator('.ytp-settings-button')).toHaveAttribute('aria-expanded','false'); await bounds();
  await p.screenshot({path:'.local/youtube-menu-redesign.png'});
  await ui(node=>node.nodeName==='BUTTON'&&node.attributes?.includes('字幕样式'),'function(){this.click()}');
  await p.keyboard.press('Escape'); expect(await ui(menu,'function(){return this.hidden}')).toBe(false);
  await p.keyboard.press('Escape'); expect(await ui(menu,'function(){return this.hidden}')).toBe(true);
  await click(); await p.locator('.ytp-settings-button').click(); expect(await ui(menu,'function(){return this.hidden}')).toBe(true);
  for(const style of [{width:'1120px',height:'630px',zoom:'1'},{width:'360px',height:'203px',zoom:'1'},{width:'440px',height:'248px',zoom:'2'}]) {
    await p.locator('.html5-video-player').evaluate((node,style)=>Object.assign(node.style,style),style); await click(); await p.waitForTimeout(300); await bounds(); await click();
  }
  await p.locator('.html5-video-player').evaluate(node=>Object.assign(node.style,{width:'960px',height:'540px',zoom:'1'}));
  await p.locator('.ytp-fullscreen-button').click(); await expect.poll(()=>p.evaluate(()=>!!document.fullscreenElement)).toBe(true); await click(); await bounds();
  await p.screenshot({path:'.local/youtube-menu-fullscreen.png'}); await p.evaluate(()=>document.exitFullscreen());
  await p.locator('.ytp-right-controls').evaluate(node=>node.replaceWith(node.cloneNode(true))); await expect(p.locator('.ytp-right-controls .obt-subtitle-control')).toHaveCount(1);
  await p.close(); expect(failures).toEqual([]);
});
