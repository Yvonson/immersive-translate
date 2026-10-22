const {test,expect,chromium} = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
let context,worker,server;
const screenshots = '.local/subtitle-layout';

function fixture(kind = 'course', captions = true) {
  const bili = kind === 'bilibili', legacy = kind === 'legacy';
  const root = bili ? 'bpx-player-container' : legacy ? 'bilibili-player' : kind === 'course' ? 'lesson-video-player' : '';
  const row = bili ? 'bpx-player-control-bottom' : legacy ? 'bilibili-player-video-control-bottom' : 'vds-controls-group';
  const group = bili ? 'bpx-player-control-bottom-right' : legacy ? 'bilibili-player-video-control-bottom-right' : '';
  const cc = bili ? 'bpx-player-ctrl-btn bpx-player-ctrl-subtitle' : legacy ? 'bilibili-player-video-btn bilibili-player-video-btn-subtitle' : 'vds-button vds-caption-button';
  const gear = bili ? 'bpx-player-ctrl-btn bpx-player-ctrl-setting' : legacy ? 'bilibili-player-video-btn bilibili-player-video-btn-setting' : 'vds-button vds-menu-button';
  const controls = kind === 'generic' ? '<div class="toolbar" role="toolbar"><button id="play">▶</button><button id="gear">⚙</button></div>' : `
    <div class="native-wrap ${bili ? 'bpx-player-control-wrap' : legacy ? 'bilibili-player-video-control-wrap' : 'vds-controls'}">
      <div class="progress" role="slider" aria-label="Seek"></div>
      <div class="native-row ${row}">
        <div class="left-controls"><button id="play">▶</button><span>4:53 / 10:25</span></div>
        ${bili || legacy ? `<div class="right-controls ${group}">` : '<span class="vds-chapter-title">Course chapter</span>'}
        ${captions ? `<button id="cc" class="${cc}" aria-label="Captions">CC</button>${kind === 'course' ? '<span class="vds-tooltip-content" hidden>Captions</span>' : ''}` : ''}
        <div class="${kind === 'course' ? 'vds-settings-menu vds-menu' : ''}"><button id="gear" class="${gear}" aria-label="Settings" aria-expanded="false">⚙</button></div>
        <button id="full" class="${kind === 'course' ? 'vds-button vds-fullscreen-button' : ''}" aria-label="Fullscreen">⛶</button>
        ${bili || legacy ? '</div>' : ''}
      </div>
    </div>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}body{margin:24px;background:#111;color:white;font:14px sans-serif}
    .test-player{position:relative;width:960px;height:540px;margin-top:56px;background:#1f2630}
    .surface,video{display:block;width:100%;height:100%}.surface{position:relative}
    .surface:fullscreen,.test-player.web-full{width:100vw!important;height:100vh!important;zoom:1!important;margin:0}
    .test-player.web-full{position:fixed;inset:0;z-index:99}.title{position:absolute;top:45%;left:10%;font-size:26px}
    .help{position:absolute;right:12px;top:10px}.native-wrap,.toolbar{position:absolute;bottom:0;left:0;right:0;background:#0009}
    .native-row{display:flex;align-items:center;height:40px;padding:0 8px}.progress{height:4px;background:#aaa}
    button{border:0;color:white;background:transparent;width:38px;height:38px;cursor:pointer}
    .left-controls{display:flex;align-items:center;gap:12px;flex-shrink:0;white-space:nowrap}.vds-chapter-title{flex:1;min-width:100px;padding:0 16px}
    .right-controls{display:flex;align-items:center;margin-left:auto;flex-shrink:0}
    .bpx-player-control-bottom,.bilibili-player-video-control-bottom{height:35px}.right-controls button{width:36px;height:22px;margin:0 6px}
    .toolbar{height:48px;display:flex;justify-content:flex-end;align-items:center}.native-panel{position:absolute;right:12px;bottom:52px;background:#333;padding:25px}
    [hidden]{display:none!important}.auto-hide .native-wrap{opacity:0;visibility:hidden;transform:translateY(10px)}.auto-hide .bpx-player-control-bottom{opacity:0}
  </style></head><body><div class="test-player ${root}"><div class="surface"><video></video><span class="title">Learning, with bilingual captions.</span><button class="help" aria-label="Help">?</button>${controls}<div class="native-panel" role="menu" hidden>Native settings</div></div></div>
  <script>window.playbackClicks=0;window.controlLocks=[];document.querySelector('.surface').addEventListener('click',()=>window.playbackClicks++);
  const gear=document.querySelector('#gear');gear.onclick=()=>{gear.setAttribute('aria-expanded',String(gear.getAttribute('aria-expanded')!=='true'));document.querySelector('.native-panel').hidden=gear.getAttribute('aria-expanded')!=='true'};
  document.querySelector('#full')?.addEventListener('click',()=>document.querySelector('.surface').requestFullscreen());
  for(const name of ['media-pause-controls-request','media-resume-controls-request'])document.addEventListener(name,()=>window.controlLocks.push(name));
  </script></body></html>`;
}
async function page(kind='course',captions=true) {
  const p=await context.newPage(); await p.setViewportSize({width:1280,height:900});
  const url=kind==='course' ? 'https://learn.deeplearning.ai/courses/layout/lesson/one' : kind==='generic' ? 'https://layout.example/player' : 'https://www.bilibili.com/video/BVlayout';
  await p.route(url+'**',route=>route.fulfill({contentType:'text/html',body:fixture(kind,captions)}));
  await p.goto(url); await expect(p.locator('.obt-subtitle-control')).toHaveCount(1); return p;
}
async function ui(p,selector,fn='function(){this.click()}',arg) {
  const cdp=await context.newCDPSession(p);
  try {
    const {root}=await cdp.send('DOM.getDocument',{depth:-1,pierce:true});
    const find=n=>{if(selector==='双语字幕设置' ? n.nodeName==='BUTTON'&&n.attributes?.includes(selector) : selector==='INPUT' ? n.nodeName==='INPUT'&&n.attributes?.includes('checkbox') : n.nodeName===selector||n.attributes?.includes(selector))return n;for(const c of [...n.children||[],...(n.shadowRoots||[]).filter(r=>r.shadowRootType!=='user-agent')]){const found=find(c);if(found)return found;}};
    const node=find(root); expect(node,selector).toBeTruthy();
    const {object}=await cdp.send('DOM.resolveNode',{backendNodeId:node.backendNodeId});
    const result=await cdp.send('Runtime.callFunctionOn',{objectId:object.objectId,functionDeclaration:fn,arguments:arg===undefined?[]:[{value:arg}],returnByValue:true});
    if(result.exceptionDetails)throw new Error(JSON.stringify(result.exceptionDetails));return result.result.value;
  } finally {await cdp.detach();}
}
const menuHidden=p=>ui(p,'obt-subtitle-menu','function(){return this.hidden}');
const pressed=p=>ui(p,'双语字幕设置','function(){return this.getAttribute("aria-pressed")}');
async function bounds(p) {
  const value=await ui(p,'obt-subtitle-menu',`function(){const r=this.getBoundingClientRect(),p=this.getRootNode().host.parentElement.getBoundingClientRect();return {x:r.left,y:r.top,right:r.right,bottom:r.bottom,w:r.width,h:r.height,left:Math.max(p.left,0),top:Math.max(p.top,0),pr:Math.min(p.right,innerWidth),pb:Math.min(p.bottom,innerHeight)}}`);
  expect(value.w).toBeGreaterThan(0);expect(value.h).toBeGreaterThan(0);
  expect(value.x).toBeGreaterThanOrEqual(value.left);expect(value.y).toBeGreaterThanOrEqual(value.top);
  expect(value.right).toBeLessThanOrEqual(value.pr+1);expect(value.bottom).toBeLessThanOrEqual(value.pb+1);
  expect(value.bottom).toBeLessThanOrEqual((await p.locator('.obt-subtitle-control').boundingBox()).y);return value;
}
test.beforeAll(async()=>{
  fs.mkdirSync(screenshots,{recursive:true});
  server=http.createServer(async(req,res)=>{let body='';for await(const c of req)body+=c;const texts=JSON.parse(JSON.parse(body).messages[1].content);res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content:JSON.stringify(texts.map(t=>'译：'+t))}}]}));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const extension=path.resolve('dist/chrome');
  context=await chromium.launchPersistentContext('',{headless:true,channel:'chromium',executablePath:process.env.OBT_TEST_BROWSER,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`,'--no-proxy-server']});
  worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
  await worker.evaluate(async url=>{await twpConfig.onReady();await chrome.storage.local.set({pageTranslatorService:'local',targetLanguage:'zh-CN',subtitleTranslation:'no',aiProviderSettings:{local:{baseUrl:url,model:'layout-fixture',apiKey:''}}});},`http://127.0.0.1:${server.address().port}/v1`);
});
test.afterAll(async()=>{await context?.close();await new Promise(resolve=>server?.close(resolve));});
test.afterEach(async()=>{for(const p of context.pages())await p.close();});

for(const kind of ['course','bilibili','legacy'])test(`${kind}: captions-adjacent placement, keyboard, native menu and reconstruction`,async()=>{
  const p=await page(kind);const errors=[];p.on('pageerror',e=>errors.push(e.message));
  const placement=kind==='course'?'vidstack':'bilibili';
  await expect(p.locator('.obt-subtitle-control')).toHaveAttribute('data-obt-placement',placement);
  expect(await p.locator('#cc').evaluate(n=>{let next=n.nextElementSibling;if(next?.matches('.vds-tooltip-content'))next=next.nextElementSibling;return next?.matches('.obt-subtitle-control');})).toBe(true);
  expect(await p.locator('.native-row').evaluate(n=>n.firstElementChild.classList.contains('left-controls'))).toBe(true);
  const r=await p.locator('.obt-subtitle-control').boundingBox();expect(r.height).toBe(kind==='course'?38:35);expect(r.width).toBe(kind==='course'?38:36);
  await p.locator('#cc').focus();await p.keyboard.press('Tab');
  expect(await ui(p,'双语字幕设置','function(){return this===this.getRootNode().activeElement}')).toBe(true);
  await p.keyboard.press('Enter');await bounds(p);expect(await p.evaluate(()=>window.playbackClicks)).toBe(0);
  await p.screenshot({path:`${screenshots}/${kind}-menu.png`});
  await ui(p,'字幕样式');await p.keyboard.press('Escape');expect(await menuHidden(p)).toBe(false);
  await p.keyboard.press('Escape');expect(await menuHidden(p)).toBe(true);
  expect(await ui(p,'双语字幕设置','function(){return this===this.getRootNode().activeElement}')).toBe(true);
  await p.keyboard.press('Space');expect(await menuHidden(p)).toBe(false);
  await p.locator('#gear').click();expect(await menuHidden(p)).toBe(true);
  await p.locator('.obt-subtitle-control').click();await expect(p.locator('#gear')).toHaveAttribute('aria-expanded','false');await bounds(p);
  await p.locator('#cc').evaluate(n=>n.remove());
  await expect.poll(()=>p.locator('.obt-subtitle-control').evaluate(n=>{let next=n.nextElementSibling;return next?.id==='gear'||!!next?.querySelector('#gear');})).toBe(true);
  await p.locator('.native-row').evaluate(n=>n.replaceWith(n.cloneNode(true)));
  await expect(p.locator('.obt-subtitle-control')).toHaveCount(1);await expect(p.locator('.native-row .obt-subtitle-control')).toHaveCount(1);
  expect(errors).toEqual([]);
});

for(const kind of ['course','bilibili'])test(`${kind}: resize, zoom, web fullscreen and nested browser fullscreen retain state`,async()=>{
  const p=await page(kind);await p.locator('.obt-subtitle-control').click();await ui(p,'INPUT');expect(await pressed(p)).toBe('true');
  await p.keyboard.press('Escape');
  for(const style of [{width:'1120px',height:'630px',zoom:'1'},{width:'360px',height:'203px',zoom:'1'},{width:'440px',height:'248px',zoom:'2'}]) {
    await p.locator('.test-player').evaluate((n,s)=>Object.assign(n.style,s),style);await p.locator('.test-player').hover({position:{x:10,y:10}});
    await expect(p.locator('.obt-subtitle-control')).toBeVisible();await p.locator('.obt-subtitle-control').click();await bounds(p);await p.keyboard.press('Escape');
  }
  await p.locator('.test-player').evaluate(n=>{Object.assign(n.style,{width:'960px',height:'540px',zoom:'1'});n.classList.add('web-full');});
  await p.locator('.obt-subtitle-control').click();await bounds(p);await p.keyboard.press('Escape');
  await p.locator('.test-player').evaluate(n=>n.classList.remove('web-full'));
  await p.locator('#full').click();await expect.poll(()=>p.evaluate(()=>!!document.fullscreenElement)).toBe(true);
  await p.locator('.obt-subtitle-control').click();await bounds(p);expect(await pressed(p)).toBe('true');
  expect(await p.locator('.obt-subtitle-control').evaluate(n=>document.fullscreenElement.contains(n))).toBe(true);
  await p.screenshot({path:`${screenshots}/${kind}-fullscreen.png`});await p.evaluate(()=>document.exitFullscreen());
  await expect.poll(()=>p.locator('[data-obt-subtitle-overlay]').evaluate(n=>n.parentElement.classList.contains('test-player'))).toBe(true);
  await expect(p.locator('.obt-subtitle-control')).toHaveCount(1);expect(await pressed(p)).toBe('true');
});

test('Bilibili: late controls replace fallback, crowded row restores, reparenting and multiple videos',async()=>{
  const p=await page('bilibili');
  await p.evaluate(()=>{window.savedControls=document.querySelector('.native-wrap');savedControls.remove();});
  await expect(p.locator('.obt-subtitle-control')).toHaveAttribute('data-obt-placement','floating');
  await p.locator('.test-player').hover();await p.locator('.obt-subtitle-control').click();await ui(p,'INPUT');await p.keyboard.press('Escape');
  await p.evaluate(()=>document.querySelector('.surface').appendChild(savedControls));
  await expect(p.locator('.obt-subtitle-control')).toHaveAttribute('data-obt-placement','bilibili');
  await p.locator('.test-player').evaluate(n=>n.style.width='260px');
  await expect(p.locator('.obt-subtitle-control')).toHaveAttribute('data-obt-placement','floating');await p.waitForTimeout(750);
  await expect(p.locator('.obt-subtitle-control')).toHaveAttribute('data-obt-placement','floating');
  await p.locator('.test-player').evaluate(n=>n.style.width='960px');
  await expect(p.locator('.obt-subtitle-control')).toHaveAttribute('data-obt-placement','bilibili');expect(await pressed(p)).toBe('true');
  await p.evaluate(()=>{const old=document.querySelector('.test-player'),fresh=document.createElement('div');fresh.className=old.className;old.after(fresh);fresh.appendChild(old.querySelector('.surface'));old.remove();});
  await expect(p.locator('.test-player .obt-subtitle-control')).toHaveCount(1);expect(await pressed(p)).toBe('true');
  await p.evaluate(()=>{const clone=document.querySelector('.test-player').cloneNode(true);document.body.appendChild(clone);});
  await expect(p.locator('.obt-subtitle-control')).toHaveCount(2);
  await p.locator('.test-player').first().evaluate(n=>n.remove());await expect(p.locator('.obt-subtitle-control')).toHaveCount(1);
});

test('floating: lower-right avoidance, captions, idle hiding, keyboard and no safe position',async()=>{
  const p=await page('generic');const host=p.locator('.obt-subtitle-control');await expect(host).toHaveAttribute('data-obt-placement','floating');
  await p.locator('.test-player').hover({position:{x:10,y:10}});await expect(host).toHaveCSS('opacity','1');
  const root=await p.locator('.test-player').boundingBox(),initial=await host.boundingBox();
  expect(initial.y).toBeGreaterThan(root.y+root.height/2);expect(initial.x+initial.width).toBeCloseTo(root.x+root.width-12);
  await p.evaluate(()=>{const b=document.createElement('button');b.id='blocker';b.textContent='Other';b.style.cssText='position:absolute;right:12px;bottom:55px;width:100px;height:40px';document.querySelector('.surface').appendChild(b);});
  await expect.poll(async()=>{const b=await p.locator('#blocker').boundingBox(),h=await host.boundingBox();return h.x+h.width<=b.x-8;}).toBe(true);
  await p.evaluate(()=>{const t=document.querySelector('video').addTextTrack('subtitles','English','en');t.addCue(new VTTCue(0,30,'A caption to keep clear'));t.mode='showing';});
  await host.click();await ui(p,'INPUT');await expect(p.locator('[data-obt-subtitle-overlay]')).toBeVisible();
  await expect.poll(()=>ui(p,'translation','function(){return this.textContent}')).toContain('译：');await p.keyboard.press('Escape');
  const caption=await ui(p,'lines','function(){const r=this.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}}'),h=await host.boundingBox();
  expect(h.x+h.width<=caption.x-8||h.x>=caption.x+caption.w+8||h.y+h.height<=caption.y-8||h.y>=caption.y+caption.h+8).toBe(true);
  await ui(p,'双语字幕设置','function(){this.blur()}');await p.mouse.move(0,0);await expect(host).toHaveCSS('opacity','0',{timeout:4000});
  await ui(p,'双语字幕设置','function(){this.focus()}');await expect(host).toHaveCSS('opacity','1');
  await p.keyboard.press('Enter');await bounds(p);await p.mouse.move(0,0);await p.waitForTimeout(2200);await expect(host).toHaveCSS('opacity','1');
  await p.screenshot({path:`${screenshots}/floating-menu.png`});await p.keyboard.press('Escape');
  await p.evaluate(()=>{document.head.querySelector('style').textContent=document.head.querySelector('style').textContent.replace('[hidden]{display:none!important}','');const cover=document.createElement('div');cover.id='cover';cover.setAttribute('role','dialog');cover.style.cssText='position:absolute;inset:0;background:#222';document.querySelector('.surface').appendChild(cover);});
  await expect(host).toBeHidden();await p.locator('#cover').evaluate(n=>n.remove());await expect(host).toBeVisible();
});

test('Vidstack: controls stay visible for menu and locks release on close and destroy',async()=>{
  const p=await page();await p.locator('.obt-subtitle-control').click();await p.locator('.test-player').evaluate(n=>n.classList.add('auto-hide'));
  await expect(p.locator('.vds-controls')).toHaveCSS('opacity','1');await bounds(p);await p.keyboard.press('Escape');
  await expect(p.locator('.vds-controls')).toHaveCSS('opacity','0');
  expect(await p.evaluate(()=>controlLocks)).toEqual(['media-pause-controls-request','media-resume-controls-request']);
  await p.locator('.test-player').evaluate(n=>n.classList.remove('auto-hide'));await p.locator('.obt-subtitle-control').click();
  await p.locator('video').evaluate(n=>n.remove());await expect(p.locator('.obt-subtitle-control')).toHaveCount(0);
  await expect(p.locator('.obt-menu-open')).toHaveCount(0);expect(await p.locator('style[data-obt-ui]').count()).toBe(0);
});

test('Bilibili: auto-hidden bottom row remains visible only while its menu is open',async()=>{
  const p=await page('bilibili');await p.locator('.obt-subtitle-control').click();await p.locator('.test-player').evaluate(n=>n.classList.add('auto-hide'));
  await expect(p.locator('.bpx-player-control-bottom')).toHaveCSS('opacity','1');await bounds(p);await p.keyboard.press('Escape');
  await expect(p.locator('.bpx-player-control-bottom')).toHaveCSS('opacity','0');
  await expect(p.locator('.obt-subtitle-control')).toHaveAttribute('data-obt-placement','bilibili');
});

test('Bilibili: icon follows compact native baseline while retaining a full-height hit target',async()=>{
  const p=await page('bilibili');await p.locator('.right-controls').evaluate(n=>n.style.alignItems='flex-start');
  await expect.poll(async()=>{
    const center=await ui(p,'双语字幕设置','function(){const r=this.querySelector("svg").getBoundingClientRect();return r.top+r.height/2}');
    const gear=await p.locator('#gear').boundingBox();return Math.abs(center-gear.y-gear.height/2);
  }).toBeLessThan(1);
  expect((await p.locator('.obt-subtitle-control').boundingBox()).height).toBe(35);
});

test('YouTube: split right-control subgroups keep the icon immediately after CC',async()=>{
  const p=await context.newPage();await p.route('https://www.youtube.com/**',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><style>body{margin:20px}.html5-video-player{position:relative;width:900px;height:500px;background:#222}video{width:100%;height:100%}.ytp-chrome-bottom{position:absolute;bottom:0;left:0;right:0;height:40px}.ytp-right-controls,.ytp-right-controls-left,.ytp-right-controls-right{display:flex;float:right}.ytp-button{width:48px;height:40px;background:transparent;border:0;color:white}</style><div class="html5-video-player"><video></video><div class="ytp-chrome-bottom"><div class="ytp-right-controls"><div class="ytp-right-controls-left"><button class="ytp-subtitles-button ytp-button">CC</button></div><div class="ytp-right-controls-right"><button class="ytp-settings-button ytp-button">⚙</button></div></div></div></div>`}));
  await p.goto('https://www.youtube.com/watch?v=split-layout');
  await expect(p.locator('.ytp-right-controls-left .obt-subtitle-control')).toHaveCount(1);
  expect(await p.locator('.ytp-subtitles-button').evaluate(n=>n.nextElementSibling.matches('.obt-subtitle-control'))).toBe(true);
  await p.locator('.obt-subtitle-control').click();await bounds(p);await p.screenshot({path:`${screenshots}/youtube-menu.png`});
});
