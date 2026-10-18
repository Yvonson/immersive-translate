const {test,expect,chromium}=require('@playwright/test');
const path=require('node:path');
const fs=require('node:fs');
let context,worker,id,errors=[];
test.beforeAll(async()=>{
  // Only the test copy gets webNavigation, to discover native frame IDs.
  const extension=path.resolve('.local/dictionary-test-extension');
  fs.cpSync(path.resolve('dist/chrome'),extension,{recursive:true});
  const manifest=JSON.parse(fs.readFileSync(path.join(extension,'manifest.json'),'utf8'));
  manifest.permissions.push('webNavigation');manifest.optional_permissions=manifest.optional_permissions.filter(item=>item!=='webNavigation');
  fs.writeFileSync(path.join(extension,'manifest.json'),JSON.stringify(manifest));
  context=await chromium.launchPersistentContext('',{headless:true,channel:'chromium',executablePath:process.env.OBT_TEST_BROWSER,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`,'--no-proxy-server']});
  worker=context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');id=new URL(worker.url()).host;
  context.on('page',page=>page.on('pageerror',error=>errors.push(error.message)));
  await worker.evaluate(()=>{
    globalThis.dictionaryFixtureCalls=[];globalThis.dictionaryFixtureDelay=0;
    const wav=new Uint8Array(4844),view=new DataView(wav.buffer);const ascii=(at,text)=>[...text].forEach((c,i)=>view.setUint8(at+i,c.charCodeAt(0)));
    ascii(0,'RIFF');view.setUint32(4,4836,true);ascii(8,'WAVEfmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,24000,true);view.setUint32(28,48000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);ascii(36,'data');view.setUint32(40,4800,true);
    globalThis.dictionaryFixtureCloudMode='success';globalThis.dictionaryCloudRequests=[];
    const originalFetch=fetch;
    globalThis.fetch=async(url,options)=>{
      if(url!=='https://texttospeech.googleapis.com/v1/text:synthesize')return originalFetch(url,options);
      dictionaryCloudRequests.push(JSON.parse(options.body));
      return new Response(dictionaryFixtureCloudMode==='success'?JSON.stringify({audioContent:btoa(String.fromCharCode(...wav))}):'fixture auth failure',{status:dictionaryFixtureCloudMode==='success'?200:403,headers:{'Content-Type':'application/json'}});
    };
    chrome.tts.getVoices=callback=>callback([{voiceName:'Fixture US',lang:'en-US',remote:false},{voiceName:'Fixture UK',lang:'en-GB',remote:false}]);
    chrome.tts.stop=()=>{};
    chrome.tts.speak=(text,options,callback)=>{dictionaryFixtureCalls.push({op:'browserSpeech',text,rate:options.rate});callback();queueMicrotask(()=>options.onEvent({type:'start'}));};
    chrome.runtime.connectNative=()=>{
      let onMessage,onDisconnect,closed=false;
      return {onMessage:{addListener:fn=>onMessage=fn},onDisconnect:{addListener:fn=>onDisconnect=fn},disconnect(){closed=true;},postMessage(message){
        dictionaryFixtureCalls.push(message);
        setTimeout(()=>{
          if(closed)return;
          const send=value=>onMessage({v:1,id:message.id,...value});
          if(message.op==='lookup'){
            if(message.text.length>120){send({ok:false,error:{code:'INVALID_QUERY',message:'请选择不超过 120 个字符、8 个词的单词或短语。'}});return;}
            send({ok:true,result:{query:message.text,lemmas:[],entries:message.text==='zzzz'?[]:[{headword:message.text,source:'ECDICT fixture',senses:[{zh:'你好；问候语',examples:[{text:'Hello, Sam!',translation:'你好，山姆！'}]}],pronunciations:[{ipa:'həˈləʊ',accent:'en-GB'}],sourceUrl:'https://example.com',license:'Fixture'}],suggestions:['hello']}});return;
          }
          send({ok:true,result:{ready:true,offline:true,resources:[{component:'core',revision:'fixture',bytes:1024,counts:{ecdictEntries:4,wiktionaryEntries:1}}]}});
        },message.op==='lookup'?dictionaryFixtureDelay:0);
      }};
    };
  });
});
test.afterAll(async()=>{await context?.close();});
async function cardText(page,expression='this.textContent'){
  const cdp=await context.newCDPSession(page);
  try{await cdp.send('DOM.enable');const tree=await cdp.send('DOM.getDocument',{depth:-1,pierce:true});
    function find(node){if(node.attributes?.includes('word-card'))return node;for(const child of [...node.children || [],...node.shadowRoots || []]){const found=find(child);if(found)return found;}}
    const node=find(tree.root);if(!node)return null;const remote=await cdp.send('DOM.resolveNode',{backendNodeId:node.backendNodeId});return (await cdp.send('Runtime.callFunctionOn',{objectId:remote.object.objectId,functionDeclaration:`function(){return ${expression}}`,returnByValue:true})).result.value;
  }finally{await cdp.detach();}
}
test('dictionary details render sources, examples, audio and missing-word states offline',async()=>{
  const page=await context.newPage();await page.goto(`chrome-extension://${id}/dictionary/index.html#hello`);
  await expect(page.locator('h1')).toHaveText('hello');await expect(page.locator('blockquote')).toContainText('你好，山姆！');
  expect(page.url()).not.toContain('#hello');
  await context.setOffline(true);
  await page.getByRole('button',{name:'▶ 美音',exact:true}).click();await expect(page.locator('.audio-status')).toContainText('Fixture US');
  await page.locator('#word').fill('zzzz');await page.getByRole('button',{name:'查词',exact:true}).click();await expect(page.getByText('本地词库暂未收录')).toBeVisible();
  await context.setOffline(false);await page.screenshot({path:'.local/dictionary-empty.png'});await page.close();
});
test('context-menu route shows a card in the selected frame, discards late results and validates input',async()=>{
  const page=await context.newPage();await page.route('https://example.com/**',route=>route.fulfill({contentType:'text/html',body:route.request().url().endsWith('/frame')?'<html lang="en"><body><p>hello from a frame</p></body></html>':'<html lang="en"><body style="background:#f5f5f5;font:18px Georgia;padding:60px"><p id="word">hello stranger, welcome to this page.</p><iframe src="https://example.com/frame"></iframe></body></html>'}));
  await page.route('https://frame.example.org/**',route=>route.fulfill({contentType:'text/html',body:'<html lang="en"><body><p>hello from a cross-origin frame</p></body></html>'}));
  await page.goto('https://example.com/main');await page.waitForTimeout(400);
  const tabId=await worker.evaluate(async()=>{const tabs=await chrome.tabs.query({});return tabs.find(tab=>tab.url==='https://example.com/main').id;});
  await page.locator('#word').evaluate(node=>{const range=document.createRange();range.selectNodeContents(node);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);node.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:80,clientY:90}));});
  await worker.evaluate(async tabId=>dictionaryService.openSelection({selectionText:'hello',frameId:0},{id:tabId}),tabId);
  await expect.poll(()=>cardText(page)).toContain('你好；问候语');await page.screenshot({path:'.local/dictionary-card.png'});
  // Closed root is not available to page scripts and is excluded by the reading renderer.
  expect(await page.locator('[data-obt-ui]').evaluate(node=>node.shadowRoot)).toBeNull();
  await page.keyboard.press('Escape');await expect(page.locator('[data-obt-ui]')).toHaveCount(0);
  await page.locator('iframe').evaluate(frame=>{frame.src='https://frame.example.org/inner'});
  await expect.poll(()=>page.frames().some(frame=>frame.url()==='https://frame.example.org/inner')).toBe(true);
  const frames=page.frames().filter(frame=>frame.url()==='https://frame.example.org/inner');expect(frames.length).toBeGreaterThan(0);
  const frameId=await worker.evaluate(async tabId=>new Promise(resolve=>chrome.webNavigation.getAllFrames({tabId},frames=>resolve(frames.find(frame=>frame.url==='https://frame.example.org/inner')?.frameId))),tabId);
  await worker.evaluate(async({tabId,frameId})=>dictionaryService.openSelection({selectionText:'hello',frameId},{id:tabId}),{tabId,frameId});
  await expect.poll(()=>page.frameLocator('iframe').first().locator('[data-obt-ui]').count()).toBe(1);
  await expect(page.locator('[data-obt-ui]')).toHaveCount(0);
  await worker.evaluate(()=>{dictionaryFixtureDelay=600;});
  await worker.evaluate(async tabId=>dictionaryService.openSelection({selectionText:'late',frameId:0},{id:tabId}),tabId);await page.keyboard.press('Escape');await page.waitForTimeout(800);await expect(page.locator(':scope > [data-obt-ui]')).toHaveCount(0);
  await worker.evaluate(()=>{dictionaryFixtureDelay=0;});await worker.evaluate(async tabId=>dictionaryService.openSelection({selectionText:'a'.repeat(121),frameId:0},{id:tabId}),tabId);await expect.poll(()=>cardText(page)).toContain('120');
  await page.close();
});
test('dictionary settings show identity-specific install command and resource health',async()=>{
  const page=await context.newPage();await page.goto(`chrome-extension://${id}/options/options.html#dictionary`);await expect(page.locator('#itemSelectedName')).toHaveText('本地词典');
  await expect(page.locator('#dictionaryInstallCommand')).toContainText(id);await page.locator('#dictionaryReconnect').click();await expect(page.locator('#dictionaryConnection')).toContainText('已连接');await expect(page.locator('.resource-tile')).toHaveCount(1);
  await expect(page.locator('#dictionaryVoiceProvider')).toHaveValue('browser');
  await page.locator('#dictionaryVoiceProvider').selectOption('googleCloud');await expect(page.locator('#dictionaryCloudVoice')).toBeVisible();
  await page.locator('#dictionaryCloudKey').fill('fixture_key_for_tests_12345');await page.locator('#dictionarySaveVoice').click();await expect(page.locator('#dictionaryCloudKeyStatus')).toContainText('已保存 Key');await expect(page.locator('#dictionaryCloudKey')).toHaveValue('');
  await page.locator('#dictionaryRemoveKey').click();await expect(page.locator('#dictionaryCloudKeyStatus')).toContainText('尚未保存');
  await page.locator('#dictionaryVoiceProvider').selectOption('browser');await page.locator('#dictionarySaveVoice').click();await expect(page.locator('#dictionarySaveVoiceStatus')).toContainText('已保存');
  await page.locator('#dictionarySpeed').selectOption('0.75');await page.reload();await expect(page.locator('#dictionarySpeed')).toHaveValue('0.75');await page.screenshot({path:'.local/dictionary-settings.png',fullPage:true});await page.close();
  expect(errors).toEqual([]);
});

test('optional Cloud speech plays decoded audio in the offscreen page and handles auth without fallback',async()=>{
  const page=await context.newPage();await worker.evaluate(()=>chrome.storage.local.set({dictionaryVoiceConfig:{provider:'googleCloud'},dictionaryVoiceSecrets:{googleCloud:'fixture_key_for_tests_12345'}}));
  try{
    await page.goto(`chrome-extension://${id}/dictionary/index.html#hello`);
    await page.getByRole('button',{name:'▶ 英音',exact:true}).click();await expect(page.locator('.audio-status')).toContainText('Google Cloud');
    const request=await worker.evaluate(()=>dictionaryCloudRequests.at(-1));expect(request.input).toEqual({text:'hello'});expect(request.voice.name).toBe('en-GB-Standard-A');
    const before=await worker.evaluate(()=>dictionaryFixtureCalls.filter(item=>item.op==='browserSpeech').length);
    await worker.evaluate(()=>dictionaryFixtureCloudMode='auth');await page.getByRole('button',{name:'▶ 美音',exact:true}).click();await expect(page.locator('.audio-status')).toContainText('Google Cloud 拒绝请求');
    expect(await worker.evaluate(()=>dictionaryFixtureCalls.filter(item=>item.op==='browserSpeech').length)).toBe(before);
  }finally{await page.close();await worker.evaluate(()=>{dictionaryFixtureCloudMode='success';return chrome.storage.local.set({dictionaryVoiceConfig:{provider:'browser'},dictionaryVoiceSecrets:{}})});}
});
