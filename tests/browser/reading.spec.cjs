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
  expect(await p.locator('[data-obt-ui]').evaluateAll(nodes=>nodes.filter(node=>node.tagName==='DIV').every(node=>getComputedStyle(node).display==='none'))).toBe(true);await p.close();expect(failures).toEqual([]);
});
test('options exposes editable page keys and actual native bindings',async()=>{
  const extensionId=new URL(worker.url()).host;const p=await context.newPage();await p.goto(`chrome-extension://${extensionId}/options/options.html#hotkeys`);
  const input=p.getByRole('textbox',{name:'翻译 / 恢复原文',exact:true});await expect(input).toBeEnabled();await input.focus();await p.keyboard.press('Alt+e');await expect(input).toHaveValue('Alt+E');
  await expect(p.locator('#obt-native-keys')).toContainText('翻译 / 恢复原文');await p.close();
});
