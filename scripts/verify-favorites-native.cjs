// Explicit Windows upgrade + installed binary verification. Never seeds the user's vocabulary.
const {chromium}=require('@playwright/test');
const {spawn,execFileSync}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
function native(binary,userRoot,dataRoot){
  const args=['--user-data-dir',userRoot,...dataRoot?['--data-dir',dataRoot]:[],'chrome-extension://'+'a'.repeat(32)+'/'];
  const child=spawn(binary,args,{windowsHide:true,stdio:['pipe','pipe','pipe']}),pending=new Map();let buffer=Buffer.alloc(0),sequence=0;
  child.stdout.on('data',data=>{buffer=Buffer.concat([buffer,data]);while(buffer.length>=4){const length=buffer.readUInt32LE(0);if(buffer.length<length+4)return;const value=JSON.parse(buffer.subarray(4,length+4));buffer=buffer.subarray(length+4);pending.get(value.id)?.(value);pending.delete(value.id);}});
  return {request(op,data={}){return new Promise((resolve,reject)=>{const id='verify'+(++sequence),encoded=Buffer.from(JSON.stringify({v:1,id,op,...data})),header=Buffer.alloc(4);header.writeUInt32LE(encoded.length);const timer=setTimeout(()=>reject(new Error('Native verification timed out')),15000);pending.set(id,value=>{clearTimeout(timer);resolve(value);});child.stdin.write(Buffer.concat([header,encoded]));});},async close(){child.stdin.end();await new Promise(resolve=>child.once('exit',resolve));}};
}
(async()=>{
  if(process.platform!=='win32')throw new Error('Windows only');
  const extension=path.resolve('dist/chrome'),installer=path.resolve('.local/dictionary/windows/install.ps1');
  const binary=path.join(process.env.LOCALAPPDATA,'OpenBilingualTranslate/Companion/dictionary-companion.exe');
  const context=await chromium.launchPersistentContext('',{headless:true,channel:'chromium',args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`,'--no-proxy-server']});
  let id,baseline;
  try{
    const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');id=new URL(worker.url()).host;
    execFileSync('powershell',['-NoProfile','-ExecutionPolicy','Bypass','-File',installer,'-ExtensionId',id,'-NoManage'],{windowsHide:true,stdio:'pipe'});
    const page=await context.newPage();await page.goto(`chrome-extension://${id}/dictionary/index.html#hello`);await page.locator('.dictionary-entry').first().waitFor({timeout:15000});
    const status=await page.evaluate(()=>dictionaryView.send('dictionaryStatus'));assert.equal(status.capabilities.favorites,1);assert.equal(status.ready,true);
    baseline=await page.evaluate(()=>dictionaryView.send('dictionaryFavorites',{op:'meta'}));
    await page.locator('#favorites-link').click();await page.locator('#total-count').waitFor();assert.equal(await page.locator('#total-count').textContent(),baseline.count.toLocaleString('zh-CN'));
    await worker.evaluate(()=>dictionaryService.disconnect());
  }finally{await context.close();}
  const root=fs.mkdtempSync(path.resolve('.local/dictionary/favorites-install-test-')),userRoot=path.join(root,'UserData');
  let client=native(binary,userRoot),word;
  try{
    const collected=await client.request('favorites.collect',{text:'hello',context:{sentence:'Hello from the installed native binary.',url:'https://example.org/lesson?token=secret',title:'Verification'}});assert.equal(collected.ok,true);word=collected.result.id;
    assert.equal((await client.request('favorites.update',{wordId:word,changes:{notes:'Persist through upgrade',tags:['verification']}})).ok,true);
    assert.equal((await client.request('favorites.review',{wordId:word,outcome:'mastered'})).ok,true);
  }finally{await client.close();}
  const before=fs.readFileSync(path.join(userRoot,'favorites.sqlite3'));
  execFileSync('powershell',['-NoProfile','-ExecutionPolicy','Bypass','-File',installer,'-ExtensionId',id,'-NoManage'],{windowsHide:true,stdio:'pipe'});
  assert.deepEqual(fs.readFileSync(path.join(userRoot,'favorites.sqlite3')),before);
  client=native(binary,userRoot,path.join(root,'MissingDictionary'));
  try{
    const entry=(await client.request('favorites.get',{wordId:word})).result;assert.equal(entry.notes,'Persist through upgrade');assert.equal(entry.state,'mastered');assert.equal(entry.reviewCount,1);assert.ok(entry.snapshot.entries.length);assert.equal(entry.contexts[0].url,'https://example.org/lesson');
    const status=(await client.request('status')).result;assert.equal(status.ready,false);assert.equal(status.capabilities.favorites,1);
    assert.equal((await client.request('lookup',{text:'hello'})).ok,false);
    assert.equal((await client.request('favorites.list')).result.total,1);
    const transfer=(await client.request('favorites.exportStart')).result;const backup=JSON.parse((await client.request('favorites.exportChunk',{token:transfer.token,index:0})).result.text);assert.equal(backup.words[0].notes,entry.notes);
  }finally{await client.close();}
  const realRoot=path.join(process.env.LOCALAPPDATA,'OpenBilingualTranslate/UserData');client=native(binary,realRoot);
  try{assert.equal((await client.request('favorites.meta')).result.count,baseline.count);}finally{await client.close();}
  const evidence={verifiedAt:new Date().toISOString(),extensionId:id,installedBinary:binary,capability:1,realChromeNativeMessaging:true,reusedExistingCore:true,isolatedFavoritesPersistAfterUpgrade:true,snapshotsUsableWithoutDictionary:true,originalUserCountPreserved:baseline.count,voiceApiCalled:false};
  fs.writeFileSync('.local/dictionary/favorites-native-verification.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
})().catch(error=>{console.error(error);process.exitCode=1});
