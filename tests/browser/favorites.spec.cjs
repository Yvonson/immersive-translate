const {test,expect,chromium}=require('@playwright/test');
const {spawn}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let context,worker,id,host,server,root,endpoint,buffer=Buffer.alloc(0),waiting=new Map(),errors=[];
test.describe.configure({mode:'serial'});
function startHost(damaged=false){
  const python=process.env.OBT_TEST_PYTHON || (fs.existsSync('.local/dictionary/venv/Scripts/python.exe')?path.resolve('.local/dictionary/venv/Scripts/python.exe'):'python');
  buffer=Buffer.alloc(0);
  host=spawn(python,['-B',path.resolve('tests/browser/favorites-fixture.py'),root,...damaged?['--damaged']:[]],{windowsHide:true,stdio:['pipe','pipe','pipe']});
  host.stderr.on('data',data=>errors.push(data.toString()));
  host.stdout.on('data',data=>{
    buffer=Buffer.concat([buffer,data]);
    while(buffer.length>=4){const length=buffer.readUInt32LE(0);if(buffer.length<length+4)return;const value=JSON.parse(buffer.subarray(4,4+length).toString('utf8'));buffer=buffer.subarray(4+length);waiting.get(value.id)?.(value);waiting.delete(value.id);}
  });
}
test.beforeAll(async()=>{
  fs.mkdirSync('.local/browser-results',{recursive:true});root=fs.mkdtempSync(path.resolve('.local/browser-results/favorites-data-'));startHost();
  server=http.createServer(async(req,res)=>{
    res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','content-type');
    if(req.method==='OPTIONS'){res.end();return;}
    if(req.url!==endpoint){res.writeHead(404);res.end();return;}
    let body='';for await(const chunk of req)body+=chunk;
    const message=JSON.parse(body),data=Buffer.from(JSON.stringify(message)),header=Buffer.alloc(4);header.writeUInt32LE(data.length);
    waiting.set(message.id,value=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));});host.stdin.write(Buffer.concat([header,data]));
  });
  endpoint='/native-'+require('node:crypto').randomUUID();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url=`http://127.0.0.1:${server.address().port}${endpoint}`,extension=path.resolve('dist/chrome');
  context=await chromium.launchPersistentContext('',{headless:true,channel:'chromium',executablePath:process.env.OBT_TEST_BROWSER,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`,'--no-proxy-server']});
  worker=context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');id=new URL(worker.url()).host;
  context.on('page',page=>page.on('pageerror',error=>errors.push(error.message)));
  await worker.evaluate(url=>{
    globalThis.favoriteNativeCalls=[];
    chrome.runtime.connectNative=()=>{
      let listener,closed=false;
      return {onMessage:{addListener:fn=>listener=fn},onDisconnect:{addListener(){}},disconnect(){closed=true;},postMessage(message){favoriteNativeCalls.push(message);fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(message)}).then(response=>response.json()).then(value=>{if(!closed)listener(value);});}};
    };
  },url);
});
test.afterAll(async()=>{await context?.close();host?.stdin.end();host?.kill();await new Promise(resolve=>server?.close(resolve));});
async function api(op,data={}){return worker.evaluate(async({op,data})=>dictionaryService.handle({action:'dictionaryFavorites',op,...data},{id:chrome.runtime.id,url:chrome.runtime.getURL('dictionary/favorites.html'),documentId:'test-page'}),{op,data});}
async function card(page,fn){
  const cdp=await context.newCDPSession(page);
  try{await cdp.send('DOM.enable');const tree=await cdp.send('DOM.getDocument',{depth:-1,pierce:true});function find(node){if(node.attributes?.includes('word-card'))return node;for(const child of [...node.children||[],...node.shadowRoots||[]]){const found=find(child);if(found)return found;}}
    const node=find(tree.root);if(!node)return null;const remote=await cdp.send('DOM.resolveNode',{backendNodeId:node.backendNodeId});return (await cdp.send('Runtime.callFunctionOn',{objectId:remote.object.objectId,functionDeclaration:fn,returnByValue:true})).result.value;
  }finally{await cdp.detach();}
}
test('card star and right-click persist only visible original contexts in real SQLite',async()=>{
  const page=await context.newPage();await page.route('https://reading.example.org/**',route=>route.fulfill({contentType:'text/html',body:'<html lang="en"><title>Reading lesson</title><body style="font:20px Georgia;padding:60px"><p id="text">Say <b>hello</b> to a stranger.<span hidden>隐藏元数据</span><span style="display:none">了解细节</span><button>合集</button><span data-obt-translation>插件译文</span></p></body></html>'}));
  await page.goto('https://reading.example.org/lesson?token=private');await page.waitForTimeout(300);
  async function select(){await page.locator('b').evaluate(element=>{const range=document.createRange();range.selectNodeContents(element);getSelection().removeAllRanges();getSelection().addRange(range);element.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:90,clientY:80}));});}
  await select();const tabId=await worker.evaluate(async()=> (await chrome.tabs.query({})).find(tab=>tab.url?.startsWith('https://reading.example.org/lesson')).id);
  await worker.evaluate(tabId=>dictionaryService.openSelection({selectionText:'hello',frameId:0},{id:tabId}),tabId);
  await expect.poll(()=>card(page,'function(){return this.textContent}')).toContain('☆ 收藏');
  await card(page,'function(){this.querySelector(".favorite-button").click()}');
  await expect.poll(()=>card(page,'function(){return this.textContent}')).toContain('★ 已收藏');
  await page.keyboard.press('Escape');
  let saved=(await api('list',{filters:{search:'hello'}})).items[0];expect(saved.word).toBe('hello');let entry=await api('get',{wordId:saved.id});
  expect(entry.contexts[0].sentence).toBe('Say hello to a stranger.');expect(entry.contexts[0].url).toBe('https://reading.example.org/lesson');expect(JSON.stringify(entry)).not.toContain('private');
  const before=entry.firstCollectedAt;await select();const pages=context.pages().length;await worker.evaluate(tabId=>dictionaryService.openSelection({selectionText:'hello',frameId:0},{id:tabId},true),tabId);
  await expect.poll(async()=> (await api('get',{wordId:saved.id})).lastCollectedAt).not.toBe(before);expect(context.pages().length).toBe(pages);entry=await api('get',{wordId:saved.id});expect(entry.contexts).toHaveLength(1);expect(entry.firstCollectedAt).toBe(before);
  await page.close();
});

test('favorites page handles 5,001 records, combined filters, notes and mobile detail navigation',async()=>{
  const page=await context.newPage();await page.setViewportSize({width:1440,height:1050});await page.goto(`chrome-extension://${id}/dictionary/favorites.html`);
  await expect(page.locator('#total-count')).toHaveText('5,001');await expect(page.locator('.word-row')).toHaveCount(50);await expect(page.locator('#page-info')).toHaveText('1 / 101');
  await page.locator('#next-page').click();await expect(page.locator('#page-info')).toHaveText('2 / 101');await expect(page.locator('.word-row')).toHaveCount(50);
  await page.locator('#search-words').fill('serendipity');await expect(page.locator('.word-row')).toHaveCount(1);await page.locator('.word-row').click();await expect(page.locator('.saved-snapshot h1')).toHaveText('serendipity');
  await page.locator('#learning-tags').fill('日常阅读, 精读');await page.locator('#personal-meaning').fill('偶然发现美好的东西');await page.locator('#learning-notes').fill('Remember the quiet bookshop.');await page.locator('#learning-state').selectOption('learning');await page.getByRole('button',{name:'保存学习记录',exact:true}).click();await expect(page.getByText('已保存到本机',{exact:true})).toBeVisible();
  await page.locator('#filter-state').selectOption('learning');await page.locator('#filter-domain').selectOption('reading.example.org');await page.locator('.tags-filter summary').click();await page.locator('#tag-options').getByText('精读',{exact:true}).click();await expect(page.locator('#match-count')).toHaveText('1 个匹配');await page.locator('.tags-filter summary').click();
  await page.locator('#date-range').selectOption('custom');await page.locator('#date-from').fill('2026-10-18');await page.locator('#date-to').fill('2026-10-18');await expect(page.locator('.word-row')).toHaveCount(1);await page.locator('#date-to').fill('2026-10-17');await expect(page.locator('#notice')).toContainText('开始日期不能晚于');await page.locator('#date-range').selectOption('all');
  await page.screenshot({path:'.local/browser-results/favorites-desktop.png',fullPage:true});
  await worker.evaluate(()=>twpConfig.set('darkMode','yes'));await expect(page.locator('html')).toHaveAttribute('data-theme','dark');await page.screenshot({path:'.local/browser-results/favorites-dark.png',fullPage:true});
  await worker.evaluate(()=>twpConfig.set('darkMode','no'));await page.setViewportSize({width:390,height:844});await expect(page.locator('#detail')).toBeVisible();await page.getByRole('button',{name:'← 返回列表'}).click();await expect(page.locator('#word-list')).toBeVisible();await page.locator('.word-row').click();await expect(page.locator('#detail')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'.local/browser-results/favorites-mobile.png',fullPage:true});
  await page.close();
});

test('review hides meaning until flip, persists each rating, excludes mastered and keeps exit progress',async()=>{
  const page=await context.newPage();await page.goto(`chrome-extension://${id}/dictionary/favorites.html`);await page.locator('#search-words').fill('serendipity');await expect(page.locator('.word-row')).toHaveCount(1);await page.locator('#start-review').click();
  await expect(page.locator('#review-dialog')).toBeVisible();await expect(page.locator('.review-word')).toHaveText('serendipity');await expect(page.locator('#review-card')).not.toContainText('不期而遇');await expect(page.locator('#ratings')).toBeHidden();
  await page.keyboard.press('3');const saved=(await api('list',{filters:{search:'serendipity'}})).items[0];expect((await api('get',{wordId:saved.id})).reviewCount).toBe(0);
  await page.keyboard.press('Space');await expect(page.locator('#ratings')).toBeVisible();await expect(page.locator('#review-card')).toContainText('不期而遇');await page.screenshot({path:'.local/browser-results/favorites-review.png'});await page.keyboard.press('3');await expect(page.locator('#review-card')).toContainText('个词，多熟悉了一点');await page.keyboard.press('Escape');expect((await api('get',{wordId:saved.id})).reviewCount).toBe(1);
  await page.locator('#start-review').click();await expect(page.locator('#notice')).toContainText('没有可复习');await page.locator('#include-mastered').check();await page.locator('#start-review').click();await expect(page.locator('.review-word')).toHaveText('serendipity');await page.keyboard.press('Space');await expect(page.locator('#ratings')).toBeVisible();await page.keyboard.press('1');await expect(page.locator('#review-card')).toContainText('个词，多熟悉了一点');await page.keyboard.press('Escape');expect((await api('get',{wordId:saved.id})).state).toBe('learning');
  await page.close();
});

test('chunked JSON backup restores snapshots and survives damaged dictionary resources',async()=>{
  const page=await context.newPage();await page.goto(`chrome-extension://${id}/dictionary/favorites.html`);
  const downloadEvent=page.waitForEvent('download');await page.locator('#export').click();const download=await downloadEvent;const backupPath=path.join(root,'backup.json');await download.saveAs(backupPath);const backup=JSON.parse(fs.readFileSync(backupPath,'utf8'));expect(backup.words).toHaveLength(5001);expect(backup.schemaVersion).toBe(1);
  const saved=backup.words.find(word=>word.word==='serendipity');await api('remove',{wordId:saved.id});page.once('dialog',dialog=>dialog.accept());await page.locator('#backup-file').setInputFiles(backupPath);await expect(page.locator('#notice')).toContainText('新增 1 个词',{timeout:60000});expect((await api('list',{filters:{search:'serendipity'}})).items).toHaveLength(1);
  page.once('dialog',dialog=>dialog.accept());await page.locator('#backup-file').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({...backup,words:[{...saved,state:'bad'}]}))});await expect(page.locator('#notice')).toContainText('原数据未改动');expect((await api('meta')).count).toBe(5001);
  await worker.evaluate(()=>dictionaryService.disconnect());host.stdin.end();host.kill();startHost(true);
  await page.reload();await expect(page.locator('#total-count')).toHaveText('5,001');await page.locator('#search-words').fill('serendipity');await expect(page.locator('.word-row')).toHaveCount(1);await page.locator('.word-row').click();await expect(page.locator('.saved-snapshot')).toContainText('不期而遇');
  await page.locator('#start-review').click();await expect(page.locator('.review-word')).toHaveText('serendipity');await page.keyboard.press('Space');await expect(page.locator('#review-card')).toContainText('不期而遇');await page.keyboard.press('Escape');await page.close();expect(errors).toEqual([]);
});
