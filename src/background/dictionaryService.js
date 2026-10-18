"use strict";
/* Local lookup transport. Pronunciation is selected separately from translation. */
var dictionaryService = (() => {
  const host = "org.openbilingual.dictionary", pending = new Map();
  let port, idle, audioOwner, sequence = 0, playback = 0, creatingOffscreen, speechAbort, rejectSpeech;
  const failure = (code, message) => Object.assign(new Error(message), {code});
  const owner = sender => sender.tab ? `${sender.tab.id}:${sender.frameId || 0}:${sender.documentId || ""}` : sender.documentId || sender.url;
  function armIdle() { clearTimeout(idle); if (port && !pending.size) idle = setTimeout(disconnect, 120000); }
  function disconnect() {
    clearTimeout(idle);
    const previous = port; port = null;
    previous?.disconnect();
    for (const item of pending.values()) { clearTimeout(item.timeout); item.reject(failure("DISCONNECTED", "本地词典连接已断开，请重新连接。")); }
    pending.clear();
  }
  function connect() {
    clearTimeout(idle);
    if (port) return port;
    if (!chrome.runtime.connectNative) throw failure("UNSUPPORTED", "本地词典首版需要 Windows 和 Chrome。");
    const native = chrome.runtime.connectNative(host); port = native;
    native.onMessage.addListener(message => {
      const item = pending.get(message.id);
      if (!item || message.v !== 1) return;
      try {
        if (typeof message.ok === "boolean") {
          clearTimeout(item.timeout); pending.delete(message.id);
          if (!message.ok) item.reject(failure(message.error?.code || "NATIVE_ERROR", message.error?.message || "本地词典查询失败。"));
          else item.resolve(message.result);
          armIdle();
        }
      } catch (_) {
        pending.delete(message.id); clearTimeout(item.timeout); item.reject(failure("PROTOCOL_ERROR", "本地词典响应异常，请修复组件。"));
      }
    });
    native.onDisconnect.addListener(() => {
      const ignored = chrome.runtime.lastError;
      if (port !== native) return;
      port = null;
      for (const item of pending.values()) { clearTimeout(item.timeout); item.reject(failure("HOST_UNAVAILABLE", "未连接到本地词典。请安装伴随程序，或在设置中检查当前扩展 ID 的注册。")); }
      pending.clear();
    });
    return native;
  }
  function request(operation, data, key) {
    return new Promise((resolve, reject) => {
      const id = "d" + Date.now().toString(36) + "_" + (++sequence);
      let timeout;
      try {
        const native = connect();
        timeout = setTimeout(() => {
          pending.delete(id); reject(failure("TIMEOUT", "本地词典响应超时，请重试或修复资源。"));
          try { native.postMessage({v:1,id:"c"+(++sequence),op:"cancel",target:id}); } catch (_) { /* Disconnected meanwhile. */ }
          armIdle();
        }, 15000);
        pending.set(id, {resolve, reject, timeout, owner:key});
        native.postMessage({v:1, id, op:operation, ...data});
      } catch (error) { clearTimeout(timeout); pending.delete(id); reject(error); armIdle(); }
    });
  }
  async function offscreen() {
    if (!chrome.offscreen) throw failure("UNSUPPORTED", "此浏览器缺少音频播放接口。");
    const url = chrome.runtime.getURL("dictionary/audio.html");
    const exists = chrome.runtime.getContexts ? (await chrome.runtime.getContexts({contextTypes:["OFFSCREEN_DOCUMENT"],documentUrls:[url]})).length : (await clients.matchAll()).some(client => client.url === url);
    if (!exists) {
      if (!creatingOffscreen) creatingOffscreen = chrome.offscreen.createDocument({url:"dictionary/audio.html",reasons:["AUDIO_PLAYBACK"],justification:"Play explicitly requested dictionary pronunciation"}).finally(()=>{creatingOffscreen=null;});
      await creatingOffscreen;
    }
  }
  async function stop(key) {
    if (audioOwner === key) {
      playback++;
      audioOwner = null;
      speechAbort?.abort(); speechAbort=null;
      rejectSpeech?.(failure("CANCELLED", "已取消")); rejectSpeech=null;
      chrome.tts?.stop();
      await chrome.runtime.sendMessage({target:"dictionaryAudio",op:"stop"}).catch(()=>{});
    }
    for (const [id,item] of pending) if (item.owner === key) {
      pending.delete(id); clearTimeout(item.timeout); item.reject(failure("CANCELLED", "已取消"));
      try { port?.postMessage({v:1,id:"c"+(++sequence),op:"cancel",target:id}); } catch (_) { /* Already disconnected. */ }
    }
    armIdle();
  }
  function normalize(text) {
    if (typeof text !== "string") throw failure("INVALID_QUERY", "请选择英文单词或短语。");
    const result = text.normalize("NFKC").replace(/\s+/g," ").trim();
    if (!result || result.length > 120 || result.split(" ").length > 8 || /[\u0000-\u001f\u007f]/.test(result)) throw failure("INVALID_QUERY", "请选择不超过 120 个字符、8 个词的单词或短语。");
    return result;
  }
  function trusted(sender) {
    return sender.id === chrome.runtime.id && (sender.url?.startsWith(chrome.runtime.getURL("")) || (sender.tab && /^(https?:|file:|about:)/.test(sender.url || "")));
  }
  function extensionPage(sender) { return sender.url?.startsWith(chrome.runtime.getURL("")); }
  function voices() {
    return new Promise(resolve => {
      if (!chrome.tts) return resolve([]);
      chrome.tts.getVoices(items => resolve(chrome.runtime.lastError ? [] : items.filter(item => /^en-(US|GB)$/i.test(item.lang || "")).map(item => ({name:item.voiceName,lang:item.lang,remote:!!item.remote,extensionId:item.extensionId || ""}))));
    });
  }
  async function speechSettings(message) {
    if (message.save) {
      if (!["browser","googleCloud"].includes(message.provider)) throw failure("INVALID_QUERY", "请选择有效的发音服务。");
      const available=await voices(), selected={};
      for (const accent of ["en-GB","en-US"]) {
        const name=message.browserVoices?.[accent] || "";
        if (name && !available.some(voice=>voice.lang.toLowerCase()===accent.toLowerCase() && voice.name===name)) throw failure("VOICE_UNAVAILABLE", "该浏览器音色已不可用，请刷新音色列表。");
        selected[accent]=name;
      }
      const update={dictionaryVoiceConfig:{provider:message.provider,browserVoices:selected}};
      if (message.apiKey && !message.removeKey) {
        if (typeof message.apiKey!=="string" || !/^[A-Za-z0-9_-]{20,256}$/.test(message.apiKey)) throw failure("INVALID_QUERY", "API Key 格式无效。");
        update.dictionaryVoiceSecrets={googleCloud:message.apiKey};
      }
      await chrome.storage.local.set(update);
      if (message.removeKey) await chrome.storage.local.remove("dictionaryVoiceSecrets");
    }
    const data=await chrome.storage.local.get(["dictionaryVoiceConfig","dictionaryVoiceSecrets"]);
    return {provider:data.dictionaryVoiceConfig?.provider || "browser",browserVoices:data.dictionaryVoiceConfig?.browserVoices || {},hasKey:!!data.dictionaryVoiceSecrets?.googleCloud,voices:await voices()};
  }
  async function pronounce(text, accent, speed, key) {
    // Invalidate synchronously before awaiting anything, so stale requests cannot start audio.
    const stopped=stop(audioOwner), token=++playback; audioOwner=key;
    const current=()=>{if(audioOwner!==key || playback!==token)throw failure("CANCELLED", "已取消");};
    await stopped; current();
    const {dictionaryVoiceConfig:config={},dictionaryVoiceSecrets:secrets={}}=await chrome.storage.local.get(["dictionaryVoiceConfig","dictionaryVoiceSecrets"]); current();
    if (!config.provider || config.provider==="browser") {
      const available=(await voices()).filter(voice=>voice.lang.toLowerCase()===accent.toLowerCase()); current();
      const selected=config.browserVoices?.[accent];
      const voice=selected ? available.find(item=>item.name===selected) : available.find(item=>/google/i.test(item.name)) || available[0];
      if (!voice) throw failure("VOICE_UNAVAILABLE", "浏览器没有可用的"+(accent==="en-GB"?"英音":"美音")+"音色。请安装系统英文语音，或在词典设置选择 Google Cloud。");
      await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>{if(playback===token)chrome.tts.stop();done(failure("VOICE_TIMEOUT", "语音未能开始播放，请检查音色与网络。"));},10000);
        const done=error=>{clearTimeout(timer);if(rejectSpeech===cancel)rejectSpeech=null;error?reject(error):resolve();};
        const cancel=error=>done(error); rejectSpeech=cancel;
        chrome.tts.speak(text,{lang:accent,voiceName:voice.name,...(voice.extensionId?{extensionId:voice.extensionId}:{}),rate:speed,enqueue:false,onEvent:event=>{
          if(event.type==="start")done();
          else if(event.type==="error")done(failure("VOICE_FAILED", "浏览器语音播放失败，请检查音色与网络。"));
          else if(["interrupted","cancelled"].includes(event.type))done(failure("CANCELLED", "已取消"));
        }},()=>{if(chrome.runtime.lastError)done(failure("VOICE_FAILED", "浏览器语音不可用，请检查系统语音设置。"));});
      }); current();
      return {kind:"browser",source:voice.name+(voice.remote?"（在线）":"（本机）")};
    }
    if (config.provider!=="googleCloud") throw failure("INVALID_PROVIDER", "请在词典设置选择发音服务。");
    if (!secrets.googleCloud) throw failure("API_KEY_MISSING", "请先在词典设置保存 Google Cloud API Key。");
    const controller=new AbortController(); speechAbort=controller;
    const timer=setTimeout(()=>controller.abort(),15000);
    try {
      const response=await fetch("https://texttospeech.googleapis.com/v1/text:synthesize",{method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":secrets.googleCloud},credentials:"omit",referrerPolicy:"no-referrer",redirect:"error",signal:controller.signal,body:JSON.stringify({input:{text},voice:{languageCode:accent,name:accent+"-Standard-A"},audioConfig:{audioEncoding:"LINEAR16"}})}); current();
      if (!response.ok) throw failure("API_ERROR", response.status===429?"Google Cloud 语音配额或请求频率超限，请稍后重试。": [401,403].includes(response.status)?"Google Cloud 拒绝请求，请检查 Key、API 启用状态、限制与结算账户。":"Google Cloud 语音请求失败（HTTP "+response.status+"）。");
      const raw=await response.text(); current();
      if(raw.length>4*1024*1024)throw failure("AUDIO_INVALID", "语音响应过大。");
      const data=JSON.parse(raw), encoded=data.audioContent;
      if(typeof encoded!=="string" || !encoded.length || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded))throw failure("AUDIO_INVALID", "Google Cloud 没有返回有效音频。");
      const audio={mime:"audio/wav",bytes:atob(encoded).length,chunks:[encoded]};
      await offscreen(); current();
      const played=await chrome.runtime.sendMessage({target:"dictionaryAudio",op:"play",audio,speed}); current();
      if(!played?.ok)throw failure("PLAYBACK_FAILED", "音频无法播放，请重试。");
      return {kind:"googleCloud",source:"Google Cloud · "+accent+"-Standard-A"};
    } catch(error) {
      current();
      if(typeof error.code==="string")throw error;
      throw failure("API_FAILED", controller.signal.aborted?"Google Cloud 语音请求超时，请检查网络。":"Google Cloud 语音不可用，请检查网络和 API 设置。");
    } finally {clearTimeout(timer);if(speechAbort===controller)speechAbort=null;}
  }
  async function handle(message, sender) {
    if (!trusted(sender)) throw failure("FORBIDDEN", "无效的词典请求来源。");
    const key = owner(sender);
    if (message.action === "dictionarySpeechSettings") {
      if(!extensionPage(sender)) throw failure("FORBIDDEN", "请从设置页配置发音。");
      return speechSettings(message);
    }
    if (message.action === "dictionaryStatus") {
      if (!extensionPage(sender)) throw failure("FORBIDDEN", "请从设置页检查连接。");
      if (message.reconnect) disconnect();
      return request("status", {}, key);
    }
    if (message.action === "dictionaryCancel") { await stop(key); return {}; }
    if (message.action === "dictionaryOpenDetails") {
      const text = normalize(message.text);
      await chrome.tabs.create({url:chrome.runtime.getURL("dictionary/index.html") + "#" + encodeURIComponent(text)}); return {};
    }
    if (message.action === "dictionaryOpenSettings") { await chrome.tabs.create({url:chrome.runtime.getURL("options/options.html#dictionary")}); return {}; }
    if (message.action === "dictionaryLookup") { await stop(key); return request("lookup", {text:normalize(message.text)}, key); }
    if (message.action === "dictionaryPronounce") {
      const text = normalize(message.text);
      if (!["en-GB","en-US"].includes(message.accent)) throw failure("INVALID_QUERY", "发音选项无效。");
      return pronounce(text,message.accent,message.speed===.75?.75:1,key);
    }
    throw failure("INVALID_OPERATION", "无效的词典操作。");
  }
  chrome.runtime.onMessage.addListener((message,sender,reply) => {
    if (typeof message?.action !== "string" || !message.action.startsWith("dictionary")) return;
    handle(message,sender).then(result=>reply({ok:true,result}),error=>reply({ok:false,error:{code:error.code || "NATIVE_ERROR",message:error.message}}));
    return true;
  });
  async function openSelection(info, tab) {
    if (!tab?.id || !info.selectionText) return;
    try {
      const result = await chrome.tabs.sendMessage(tab.id, {action:"dictionaryShow",text:info.selectionText}, {frameId:info.frameId || 0});
      if (result?.ok) return;
    } catch (_) { /* Restricted pages have no content script. */ }
    // Encode the full input; the details page shows a validation message for long selections.
    await chrome.tabs.create({url:chrome.runtime.getURL("dictionary/index.html") + "#" + encodeURIComponent(info.selectionText.slice(0,4096))});
  }
  return {openSelection, handle, disconnect, normalize};
})();
