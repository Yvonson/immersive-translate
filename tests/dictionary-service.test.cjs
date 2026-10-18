const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function service(scenario={}) {
  let nativeMessage, messages=[], plays=[], spoken=[], requests=[], store={};
  const port={onMessage:{addListener:fn=>nativeMessage=fn},onDisconnect:{addListener(){}},disconnect(){},postMessage(message){messages.push(message);if(scenario.delay===message.op)return;queueMicrotask(()=>nativeMessage({v:1,id:message.id,ok:true,result:{query:message.text,ready:true,capabilities:scenario.old?{}:{favorites:1},token:'token-fixture',id:'f'.repeat(32),saved:true}}));}};
  const available=[{voiceName:'Windows UK',lang:'en-GB',remote:false},{voiceName:'Google US',lang:'en-US',remote:true},{voiceName:'Other US',lang:'en-US'}];
  const chrome={runtime:{id:'a'.repeat(32),getURL:path=>'chrome-extension://'+'a'.repeat(32)+'/'+path,connectNative:()=>port,getContexts:async()=>[{}],sendMessage:async value=>{plays.push(value);return {ok:true}},onMessage:{addListener(){}}},offscreen:{},tabs:{create:async()=>{}},storage:{local:{get:async keys=>Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(key=>[key,store[key]])),set:async data=>Object.assign(store,data),remove:async key=>{delete store[key]}}},tts:{getVoices:fn=>fn(available),stop(){spoken.push({stop:true})},speak(text,options,done){spoken.push({text,options});done();queueMicrotask(()=>options.onEvent({type:'start'}));}}};
  const context=vm.createContext({chrome,console,setTimeout,clearTimeout,atob,AbortController,TextEncoder,fetch:async(url,options)=>{requests.push({url,...options});return {ok:true,text:async()=>JSON.stringify({audioContent:Buffer.from('audio fixture').toString('base64')})}},clients:{matchAll:async()=>[]}});
  vm.runInContext(fs.readFileSync('src/background/dictionaryService.js','utf8'),context);
  const sender={id:'a'.repeat(32),url:'https://example.com',tab:{id:1},frameId:2,documentId:'doc'};
  return {context,api:context.dictionaryService,messages,plays,chrome,store,spoken,requests,available,sender,respond:value=>nativeMessage(value),settings:{...sender,url:chrome.runtime.getURL('options/options.html')}};
}
test('dictionary lookup remains local; sender and selection boundaries are enforced',async()=>{
  const {api,messages,sender,requests}=service();
  try {
    assert.equal((await api.handle({action:'dictionaryLookup',text:'hello'},sender)).query,'hello');
    await assert.rejects(api.handle({action:'dictionaryLookup',text:'x'.repeat(121)},sender),/120/);
    await assert.rejects(api.handle({action:'dictionaryLookup',text:'hello'},{...sender,id:'b'.repeat(32)}),/来源/);
    await assert.rejects(api.handle({action:'dictionaryStatus'},sender),/设置页/);
    await assert.rejects(api.handle({action:'dictionarySpeechSettings'},sender),/设置页/);
    assert.equal(messages.filter(item=>item.op==='lookup').length,1);assert.equal(requests.length,0);
  } finally {api.disconnect();}
});
test('browser speech prefers available Google voice of the requested accent, without native audio',async()=>{
  const {api,spoken,messages,sender,available,requests}=service();
  try {
    const result=await api.handle({action:'dictionaryPronounce',text:'hello',accent:'en-US',speed:.75},sender);
    assert.equal(result.kind,'browser');assert.match(result.source,/Google US.*在线/);
    const speech=spoken.find(value=>value.text);assert.equal(speech.options.rate,.75);assert.equal(speech.options.voiceName,'Google US');
    assert.equal(messages.length,0);assert.equal(requests.length,0);
    available.splice(0,1);
    await assert.rejects(api.handle({action:'dictionaryPronounce',text:'hello',accent:'en-GB'},sender),/英音/);
    assert.equal(spoken.filter(item=>item.text).length,1);
  } finally {await api.handle({action:'dictionaryCancel'},sender);api.disconnect();}
});
test('Google Cloud uses a separate secret, sends only text, bounds playback and never falls back',async()=>{
  const {api,store,requests,plays,spoken,sender,settings,chrome}=service();
  try {
    const key='key_fixture_for_tests_only_12345';
    const result=await api.handle({action:'dictionarySpeechSettings',save:true,provider:'googleCloud',apiKey:key},settings);
    assert.equal(result.hasKey,true);assert.ok(!JSON.stringify(result).includes(key));
    await api.handle({action:'dictionaryPronounce',text:'hello',accent:'en-GB',speed:.75},sender);
    assert.equal(requests.length,1);const request=requests[0];assert.equal(request.url,'https://texttospeech.googleapis.com/v1/text:synthesize');
    assert.equal(request.headers['x-goog-api-key'],key);assert.equal(request.redirect,'error');assert.equal(request.credentials,'omit');
    const body=JSON.parse(request.body);assert.deepEqual(body.input,{text:'hello'});assert.equal(body.voice.name,'en-GB-Standard-A');assert.ok(!JSON.stringify(body).includes('example.com'));
    assert.equal(plays.find(item=>item.op==='play').speed,.75);
    await api.handle({action:'dictionaryCancel'},{...sender,documentId:'old-doc'});assert.notEqual(plays.at(-1).op,'stop');
    await api.handle({action:'dictionaryCancel'},sender);assert.equal(plays.at(-1).op,'stop');
    await api.handle({action:'dictionarySpeechSettings',save:true,provider:'googleCloud',removeKey:true},settings);
    await assert.rejects(api.handle({action:'dictionaryPronounce',text:'hello',accent:'en-US'},sender),/API Key/);
    assert.equal(spoken.filter(item=>item.text).length,0);assert.ok(!store.dictionaryVoiceSecrets);
  } finally {await api.handle({action:'dictionaryCancel'},sender);api.disconnect();}
});
test('cancelled Cloud request is aborted and cannot start stale playback',async()=>{
  const {api,context,store,sender,plays}=service();store.dictionaryVoiceConfig={provider:'googleCloud'};store.dictionaryVoiceSecrets={googleCloud:'fixture'};
  let release,signal;
  context.fetch=async(url,options)=>{signal=options.signal;await new Promise(resolve=>release=resolve);return {ok:true,text:async()=>JSON.stringify({audioContent:'YQ=='})}};
  const pending=api.handle({action:'dictionaryPronounce',text:'hello',accent:'en-US'},sender);
  const outcome=assert.rejects(pending,error=>error.code==='CANCELLED');
  while(!release)await new Promise(resolve=>setTimeout(resolve,0));
  await api.handle({action:'dictionaryCancel'},sender);assert.equal(signal.aborted,true);release();await outcome;
  assert.equal(plays.filter(item=>item.op==='play').length,0);api.disconnect();
});

test('favorites saves survive closing the card and do not expose the collection to content scripts',async()=>{
  const {api,messages,sender,settings,respond,store}=service({delay:'favorites.collect'});
  try{
    const saving=api.handle({action:'dictionaryFavorites',op:'collect',text:'hello',context:{sentence:'Hello stranger.',url:'https://untrusted.test/token',title:'Lesson'}},sender);
    while(!messages.some(message=>message.op==='favorites.collect'))await new Promise(resolve=>setTimeout(resolve,0));
    await api.handle({action:'dictionaryCancel'},sender);
    const request=messages.find(message=>message.op==='favorites.collect');
    assert.equal(request.context.url,sender.url);assert.equal(request.context.sentence,'Hello stranger.');
    assert.ok(!messages.some(message=>message.op==='cancel' && message.target===request.id));
    respond({v:1,id:request.id,ok:true,result:{id:'f'.repeat(32),saved:true}});
    assert.equal((await saving).saved,true);assert.ok(store.dictionaryFavoritesRevision);
    for(const op of ['list','meta','ids','get','update','remove','review','exportStart','importCommit'])await assert.rejects(api.handle({action:'dictionaryFavorites',op},sender),error=>error.code==='FORBIDDEN');
    await assert.rejects(api.handle({action:'dictionaryFavorites',op:'collect',text:'hello'},{...sender,tab:{id:1,incognito:true}}),error=>error.code==='INCOGNITO');
    const transfer=await api.handle({action:'dictionaryFavorites',op:'importStart'},settings);
    await assert.rejects(api.handle({action:'dictionaryFavorites',op:'importChunk',token:transfer.token,text:'{}',index:0},{...settings,documentId:'different'}),error=>error.code==='TRANSFER_EXPIRED');
    await assert.rejects(api.handle({action:'dictionaryFavorites',op:'update',wordId:'f'.repeat(32),changes:{notes:'中'.repeat(5000)}},settings),error=>error.code==='INVALID_FAVORITE');
  }finally{api.disconnect();}
});

test('old native hosts keep lookup while favorites explicitly require component upgrade',async()=>{
  const {api,sender}=service({old:true});
  try{await assert.rejects(api.handle({action:'dictionaryFavorites',op:'state',text:'hello'},sender),error=>error.code==='UPDATE_REQUIRED');assert.equal((await api.handle({action:'dictionaryLookup',text:'hello'},sender)).query,'hello');}
  finally{api.disconnect();}
});
