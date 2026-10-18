"use strict";
(() => {
  const $=id=>document.getElementById(id), connection=$("dictionaryConnection"), resources=$("dictionaryResources");
  $("dictionaryInstallCommand").textContent=`powershell -NoProfile -ExecutionPolicy Bypass -File .\\install.ps1 -ExtensionId ${chrome.runtime.id}`;
  $("dictionaryCopyCommand").onclick=async()=>{try{await navigator.clipboard.writeText($("dictionaryInstallCommand").textContent);$("dictionaryCopyCommand").textContent="已复制";}catch(_){$("dictionaryCopyCommand").textContent="请选中上方命令复制";}};
  $("dictionaryReconnect").onclick=async()=>{connection.textContent="正在连接本地词典……";resources.replaceChildren();
    try{const status=await dictionaryView.send("dictionaryStatus",{reconnect:true});connection.textContent=status.ready?"已连接 · 本地词库可用 · 释义离线查询":"已连接伴随程序，请导入词库资源包。";
      for(const resource of status.resources.filter(item=>item.component==="core")){const tile=dictionaryView.node("div",undefined,"resource-tile");tile.append(dictionaryView.node("strong","本地英汉词库"),dictionaryView.node("small",`${(resource.bytes/1024/1024).toFixed(1)} MB · ${resource.revision}`),dictionaryView.node("small",`${resource.counts.ecdictEntries || 0} 条英汉词条 · ${resource.counts.wiktionaryEntries || 0} 条扩展释义`));resources.append(tile);}
    }catch(error){connection.textContent=error.message;}
  };
  chrome.storage.local.get("dictionaryPreferences",value=>{const preferences=value.dictionaryPreferences || {};$("dictionaryAccent").value=preferences.accent || "en-GB";$("dictionarySpeed").value=preferences.speed===.75?"0.75":"1";});
  for(const id of ["dictionaryAccent","dictionarySpeed"])$(id).onchange=()=>chrome.storage.local.set({dictionaryPreferences:{accent:$("dictionaryAccent").value,speed:Number($("dictionarySpeed").value)}});
  function providerUI(){const cloud=$("dictionaryVoiceProvider").value==="googleCloud";$("dictionaryCloudVoice").hidden=!cloud;$("dictionaryBrowserVoices").hidden=cloud;}
  async function loadVoice(){
    try{const result=await dictionaryView.send("dictionarySpeechSettings");$("dictionaryVoiceProvider").value=result.provider;
      for(const [accent,id] of [["en-GB","dictionaryUKVoice"],["en-US","dictionaryUSVoice"]]){const select=$(id);select.replaceChildren();const available=result.voices.filter(item=>item.lang.toLowerCase()===accent.toLowerCase());const option=dictionaryView.node("option",available.length?"自动选择（同口音，Google 优先）":"未找到此口音，请安装系统英文语音或选择 Cloud");option.value="";select.append(option);for(const voice of available){const item=dictionaryView.node("option",voice.name+(voice.remote?" · 在线":" · 本机"));item.value=voice.name;select.append(item);}select.value=result.browserVoices[accent] || "";if(select.selectedIndex<0)select.value="";}
      $("dictionaryCloudKeyStatus").textContent=result.hasKey?"已保存 Key（不回显）。":"尚未保存 Key。";providerUI();
    }catch(error){$("dictionarySaveVoiceStatus").textContent=error.message;}
  }
  $("dictionaryVoiceProvider").onchange=providerUI;
  $("dictionaryRefreshVoices").onclick=loadVoice;
  $("dictionarySaveVoice").onclick=async()=>{try{await dictionaryView.send("dictionarySpeechSettings",{save:true,provider:$("dictionaryVoiceProvider").value,browserVoices:{"en-GB":$("dictionaryUKVoice").value,"en-US":$("dictionaryUSVoice").value},apiKey:$("dictionaryCloudKey").value.trim()});$("dictionaryCloudKey").value="";await loadVoice();$("dictionarySaveVoiceStatus").textContent="已保存。播放失败时不会自动切换服务。";}catch(error){$("dictionarySaveVoiceStatus").textContent=error.message;}};
  $("dictionaryRemoveKey").onclick=async()=>{try{await dictionaryView.send("dictionarySpeechSettings",{save:true,provider:$("dictionaryVoiceProvider").value,browserVoices:{"en-GB":$("dictionaryUKVoice").value,"en-US":$("dictionaryUSVoice").value},removeKey:true});$("dictionaryCloudKey").value="";await loadVoice();}catch(error){$("dictionarySaveVoiceStatus").textContent=error.message;}};
  $("dictionaryTestVoice").onclick=async()=>{const status=$("dictionaryVoiceStatus");status.textContent="正在准备发音（使用已保存的服务）……";try{const response=await dictionaryView.send("dictionaryPronounce",{text:"hello",accent:$("dictionaryAccent").value,speed:Number($("dictionarySpeed").value)});status.textContent="正在播放 · "+response.source;}catch(error){if(error.code!=="CANCELLED")status.textContent=error.message;}};
  loadVoice();
  addEventListener("pagehide",()=>dictionaryView.send("dictionaryCancel").catch(()=>{}));
})();
