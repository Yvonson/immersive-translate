const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('legacy provider selection never silently sends text to a different provider',()=>{
  const context=vm.createContext({chrome:{i18n:{getMessage:()=>''}}});
  vm.runInContext(fs.readFileSync('src/lib/languages.js','utf8'),context);
  const api=vm.runInContext('twpLang',context);
  for(const service of ['google','yandex','deepseek','local','custom']) {
    assert.equal(api.getAlternativeService('unsupported-language',service,true),service);
  }
  assert.equal(api.getAlternativeService('unsupported-language','bing',false),'bing');
  assert.throws(()=>api.getAlternativeService('zh-CN','unknown',false),/自行选择/);
  assert.throws(()=>api.getAlternativeService('zh-CN','deepl',true),/自行选择/);
});
