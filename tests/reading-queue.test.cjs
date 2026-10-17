const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
function setup(){const listeners=[];const sandbox={AbortController,Promise,Map,Set,Error,Date,JSON,URL,setTimeout,clearTimeout,TextDecoder,chrome:{storage:{onChanged:{addListener(){}}},tabs:{onRemoved:{addListener(){}}},runtime:{onMessage:{addListener:f=>listeners.push(f)}}}};vm.createContext(sandbox);vm.runInContext(fs.readFileSync('src/background/readingService.js','utf8')+'\nglobalThis.service=readingService;',sandbox);return sandbox.service;}
test('queue admits one prefetch, prioritizes current reading and cancels queued work',async()=>{
 const service=setup(),started=[],release=[];const signal=new AbortController();
 const job=(name,priority,prefetch=false,controller=signal)=>service.schedule(()=>{started.push(name);return new Promise(resolve=>release.push(resolve));},{priority,prefetch,signal:controller.signal});
 const first=job('prefetch1',2,true),second=job('prefetch2',2,true),current=job('current',0),visible=job('visible',1);
 await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(started,['prefetch1','current']);
 release[1]('ok');await current;await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(started,['prefetch1','current','visible']);
 const controller=new AbortController(),cancelled=job('cancelled',0,false,controller);controller.abort();await assert.rejects(cancelled,/取消/);
 release[2]('ok');release[0]('ok');await Promise.all([visible,first]);await new Promise(resolve=>setImmediate(resolve));assert.equal(started.at(-1),'prefetch2');release[3]('ok');await second;
});
