const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function shortcuts(){const context=vm.createContext({});vm.runInContext(fs.readFileSync('src/lib/readingShortcuts.js','utf8'),context);return vm.runInContext('readingShortcuts',context);}
const event=(extra={})=>({isTrusted:true,code:'KeyQ',altKey:true,composedPath:()=>[{closest:()=>null}],...extra});
test('shortcut dispatch distinguishes webpage and native owners and ignores editing, composition and repeat',()=>{
  const api=shortcuts(),bindings={'hotkey-dictionary-lookup':'Alt+Q','hotkey-dictionary-collect':'Alt+S'};
  assert.equal(api.resolve(event(),bindings,[]),'hotkey-dictionary-lookup');
  assert.equal(api.resolve(event(),bindings,[{name:'hotkey-dictionary-lookup',shortcut:'Alt+Q'}]),'');
  for(const extra of [{isTrusted:false},{isComposing:true},{repeat:true},{getModifierState:()=>true},{composedPath:()=>[{closest:()=>({})}]}])assert.equal(api.resolve(event(extra),bindings,[]),'');
  const calls=[];api.before(()=>calls.push('cancel-paragraph'));api.register('hotkey-dictionary-lookup',()=>calls.push('lookup'));
  assert.equal(api.execute('hotkey-dictionary-lookup'),true);assert.deepEqual(calls,['cancel-paragraph','lookup']);assert.equal(api.execute('not-an-action'),false);
});
test('shortcut validation rejects internal/native collisions and editing keys while allowing clear and same native action',()=>{
  const api=shortcuts(),bindings={'hotkey-dictionary-lookup':'Alt+Q','hotkey-dictionary-collect':'Alt+S'},lookup='hotkey-dictionary-lookup';
  assert.match(api.validate('Alt+S',lookup,bindings,[]),/另一个动作/);
  assert.match(api.validate('Alt+K',lookup,bindings,[{name:'hotkey-toggle-dual',shortcut:'Alt+K'}]),/原生命令/);
  assert.equal(api.validate('Alt+Q',lookup,bindings,[{name:lookup,shortcut:'Alt+Q'}]),'');assert.equal(api.validate('',lookup,bindings,[]),'');
  for(const key of ['Ctrl+C','Ctrl+W','Ctrl+Shift+T','Command+Q','Alt+E','Alt+F'])assert.match(api.validate(key,lookup,{},[]),/浏览器/);
  for(const key of ['S','Ctrl+Alt+Q'])assert.ok(api.validate(key,lookup,{},[]));
});
function config(saved){
  const store={targetLanguages:['zh-CN'],...saved};
  const chrome={i18n:{getAcceptLanguages:callback=>callback(['zh-CN'])},storage:{local:{get:(_,callback)=>callback(store),set:()=>{}},onChanged:{addListener(){}}},commands:{getAll:callback=>callback([])}};
  const context=vm.createContext({chrome,twpLang:{fixTLanguageCode:value=>value},console,structuredClone});vm.runInContext(fs.readFileSync('src/lib/config.js','utf8'),context);return vm.runInContext('twpConfig',context);
}
test('old profiles gain dictionary defaults without overwriting cleared or conflicting customized keys',()=>{
  let api=config({pageShortcuts:{'hotkey-toggle-translation':'Alt+E','hotkey-toggle-dual':''}});
  assert.equal(api.get('pageShortcuts')['hotkey-dictionary-lookup'],'Alt+Q');assert.equal(api.get('pageShortcuts')['hotkey-toggle-dual'],'');
  api=config({pageShortcuts:{'hotkey-toggle-translation':'Alt+Q','hotkey-toggle-dual':'Alt+S'}});
  assert.equal(api.get('pageShortcuts')['hotkey-dictionary-lookup'],'');assert.equal(api.get('pageShortcuts')['hotkey-dictionary-collect'],'');assert.equal(api.get('pageShortcuts')['hotkey-toggle-translation'],'Alt+Q');
  api=config({pageShortcuts:{'hotkey-dictionary-lookup':'','hotkey-dictionary-collect':'Alt+E'}});assert.equal(api.get('pageShortcuts')['hotkey-dictionary-lookup'],'');assert.equal(api.get('pageShortcuts')['hotkey-dictionary-collect'],'Alt+E');
  const original=api.getDefault('pageShortcuts');original['hotkey-dictionary-lookup']='changed';assert.equal(api.getDefault('pageShortcuts')['hotkey-dictionary-lookup'],'Alt+Q');
});
