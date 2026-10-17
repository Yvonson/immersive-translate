const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
function setup(){let handler;const calls=[];const sandbox={AbortController,Promise,Map,Set,Error,Date,JSON,URL,setTimeout,clearTimeout,TextDecoder,fetch:async()=>new Response('WEBVTT\n\n00:01.000 --> 00:02.000\nHello'),chrome:{storage:{onChanged:{addListener(){}}},runtime:{onMessage:{addListener:f=>{handler=f}},getURL:()=> 'chrome-extension://fixture/'},tabs:{onRemoved:{addListener(){}}}},twpConfig:{onReady:async()=>{},get:key=>key==='pageTranslatorService'?'local':'zh-CN'},translationService:{translateExact:async(service,language,texts,privateMode)=>{calls.push({service,language,texts,privateMode});return texts.map(text=>'译'+text)}}};vm.createContext(sandbox);vm.runInContext(fs.readFileSync('src/background/readingService.js','utf8'),sandbox);return{calls,send:(request,sender)=>new Promise(resolve=>handler(request,sender,resolve))};}
const sender={tab:{id:1,incognito:false},frameId:0,url:'https://learn.deeplearning.ai/course'};
test('reading requests use configured provider, cached by text, with private isolation',async()=>{
 const env=setup(),request={action:'translateSubtitleBatch',session:'one',items:[{id:'a',text:'Hello'}]};
 assert.equal((await env.send(request,sender)).items[0].text,'译Hello');await env.send(request,sender);assert.equal(env.calls.length,1);assert.equal(env.calls[0].service,'local');
 await env.send(request,{...sender,tab:{id:2,incognito:true}});await env.send(request,{...sender,tab:{id:2,incognito:true}});assert.equal(env.calls.length,3);assert.equal(env.calls[2].privateMode,true);
});
test('VTT loader denies foreign origins, credentials and non-VTT URLs',async()=>{
 const env=setup();
 for(const url of ['https://evil.example/track.vtt','https://video.deeplearning.ai.evil.example/track.vtt','http://video.deeplearning.ai/track.vtt','https://user:pass@video.deeplearning.ai/a.vtt','https://video.deeplearning.ai/a.mp4']) assert.ok((await env.send({action:'loadSubtitleTrack',url},sender)).error);
 assert.ok((await env.send({action:'loadSubtitleTrack',url:'https://video.deeplearning.ai/a.vtt'},{...sender,url:'https://evil.example'})).error);
 assert.ok((await env.send({action:'loadSubtitleTrack',url:'https://video.deeplearning.ai/a.vtt'},sender)).text.startsWith('WEBVTT'));
});
