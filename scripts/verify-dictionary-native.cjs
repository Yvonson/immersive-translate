// Explicit Windows installation/verification, not part of ordinary npm test.
const {chromium}=require('@playwright/test');
const path=require('node:path');
const fs=require('node:fs');
const {execFileSync}=require('node:child_process');

(async()=>{
  if(process.platform!=='win32')throw new Error('Windows installation verification only');
  const extension=path.resolve('dist/chrome');
  const context=await chromium.launchPersistentContext('',{headless:true,channel:'chromium',executablePath:process.env.OBT_TEST_BROWSER,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`,'--no-proxy-server']});
  try{
    const worker=context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const id=new URL(worker.url()).host;
    const installer=path.resolve('.local/dictionary/windows/install.ps1');
    execFileSync('powershell',['-NoProfile','-ExecutionPolicy','Bypass','-File',installer,'-ExtensionId',id,'-NoManage'],{stdio:'pipe',windowsHide:true});
    const binary=path.join(process.env.LOCALAPPDATA,'OpenBilingualTranslate','Companion','dictionary-companion.exe');
    const diagnostics=JSON.parse(execFileSync(binary,['--diagnose'],{encoding:'utf8',windowsHide:true,timeout:30000}));
    for(const name of ['core'])execFileSync(binary,['--import-pack',path.resolve(`.local/dictionary/packages/dictionary-${name}.zip`)],{stdio:'pipe',windowsHide:true,timeout:180000});
    execFileSync(binary,['--verify'],{stdio:'pipe',windowsHide:true,timeout:180000});
    const page=await context.newPage();
    await page.goto(`chrome-extension://${id}/dictionary/index.html#hello`);
    await page.locator('.dictionary-entry').first().waitFor({timeout:20000});
    const status=await page.evaluate(()=>dictionaryView.send('dictionaryStatus'));
    await context.setOffline(true);
    const outcomes=[];
    for(const word of ['hello','took','US','us','record','read','neural network','zzzzzzunlisted']){
      await page.locator('#word').fill(word);await page.getByRole('button',{name:'查词',exact:true}).click();
      await page.waitForFunction(word=>document.querySelector('h1')?.textContent===word && !document.getElementById('status').textContent.includes('正在'),word,{timeout:15000});
      outcomes.push({word,entries:await page.locator('.dictionary-entry').count()});
    }
    await page.locator('#word').fill('hello');await page.getByRole('button',{name:'查词',exact:true}).click();await page.locator('.dictionary-entry').first().waitFor();
    const speech=await page.evaluate(()=>dictionaryView.send('dictionarySpeechSettings'));
    for(const accent of ['en-GB','en-US']){
      const available=speech.voices.filter(voice=>voice.lang.toLowerCase()===accent.toLowerCase());
      const played=await page.evaluate(async accent=>{try{return {ok:true,result:await dictionaryView.send('dictionaryPronounce',{text:'hello',accent,speed:.75})}}catch(error){return {ok:false,code:error.code,message:error.message}}},accent);
      if(!available.length && played.code!=='VOICE_UNAVAILABLE')throw new Error('Missing-accent error was not explicit');
      outcomes.push({accent,available:available.map(item=>item.name),playback:played});
    }
    await page.screenshot({path:'.local/dictionary-real-offline.png',fullPage:true});
    const output={extensionId:id,definitionsVerifiedOffline:true,diagnostics,status,speech,outcomes,verifiedAt:new Date().toISOString()};
    fs.writeFileSync('.local/dictionary/native-verification.json',JSON.stringify(output,null,2));
    console.log(JSON.stringify(output,null,2));
  }finally{await context.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
