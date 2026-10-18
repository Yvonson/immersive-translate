"use strict";
/* Shared text-only renderer used by the word card and the full dictionary page. */
var dictionaryView = (() => {
  const labels = {"en-US":"美音","en-GB":"英音","unknown":"音标",n:"名词",noun:"名词",v:"动词",verb:"动词",adj:"形容词",adv:"副词",p:"过去式",d:"过去分词",i:"现在分词","3":"第三人称单数",s:"复数",r:"比较级",t:"最高级","0":"原形"};
  function node(tag,text,className) { const result=document.createElement(tag); if(text !== undefined)result.textContent=text; if(className)result.className=className;return result; }
  function button(text, action, className) { const result=node("button",text,className); result.type="button"; result.addEventListener("click",action); return result; }
  async function send(action, data={}) {
    const reply=await chrome.runtime.sendMessage({action,...data});
    if(!reply?.ok)throw Object.assign(new Error(reply?.error?.message || "词典组件没有响应，请在设置中重新连接。"),{code:reply?.error?.code});
    return reply.result;
  }
  function link(text,url) { const result=node("a",text); try {const parsed=new URL(url); if(parsed.protocol!=="https:")throw new Error(); result.href=parsed.href;result.target="_blank";result.rel="noopener noreferrer";}catch(_){} return result; }
  const favoriteControls = new Set();
  function disposeFavorites(root){for(const item of favoriteControls)if(!item.wrap.isConnected || root?.contains(item.wrap))favoriteControls.delete(item);}
  function favoriteButton(text, context={}) {
    disposeFavorites();
    const wrap=node("span",undefined,"favorite-control"), status=node("small","","favorite-status");status.setAttribute("role","status");
    let savedId, busy=false;
    const control=button("☆ 收藏",async()=>{
      if(busy)return;
      if(savedId){send("dictionaryOpenFavorites",{wordId:savedId}).catch(error=>status.textContent=error.message);return;}
      busy=true;control.disabled=true;status.textContent="正在保存……";
      try{const result=await send("dictionaryFavorites",{op:"collect",text,context});savedId=result.id;control.textContent="★ 已收藏";control.setAttribute("aria-pressed","true");status.textContent="已保存到本机";}
      catch(error){status.textContent=error.message;}
      finally{busy=false;control.disabled=false;}
    },"favorite-button");control.setAttribute("aria-pressed","false");
    const refresh=async()=>{if(busy)return;try{const state=await send("dictionaryFavorites",{op:"state",text});savedId=state.saved?state.id:null;control.textContent=state.saved?"★ 已收藏":"☆ 收藏";control.setAttribute("aria-pressed",String(state.saved));}catch(error){status.textContent=error.message;}};
    wrap.append(control,status);favoriteControls.add({wrap,refresh});refresh();return wrap;
  }
  chrome.storage.onChanged.addListener(changes=>{if(!changes.dictionaryFavoritesRevision)return;for(const item of favoriteControls){if(item.wrap.isConnected)item.refresh();else favoriteControls.delete(item);}});
  function render(root,result,{details=false,lookup=()=>{},favorite=true,favoriteContext={}}={}) {
    root.replaceChildren();
    const title=node("div",undefined,"word-heading");title.append(node("h1",result.query),node("span","本地词典","local-label"));if(favorite)title.append(favoriteButton(result.query,favoriteContext));root.append(title);
    if(result.lemmas?.length)root.append(node("p","原形："+result.lemmas.join(" / "),"muted"));
    const sounds=node("div",undefined,"pronunciations"), status=node("p","点击播放读音。使用词典设置中选择的语音服务；在线音色只发送当前单词或短语。","audio-status muted");status.setAttribute("role","status");
    const speed=document.createElement("select");speed.setAttribute("aria-label","发音速度");
    for(const [value,text] of [["1","正常语速"],["0.75","慢速 0.75×"]]){const option=node("option",text);option.value=value;speed.append(option);}
    let defaultAccent="en-GB";
    chrome.storage.local.get("dictionaryPreferences",value=>{speed.value=value.dictionaryPreferences?.speed===.75?"0.75":"1";defaultAccent=value.dictionaryPreferences?.accent || "en-GB";const preferred=sounds.querySelector(`[data-accent="${defaultAccent}"]`);if(preferred){preferred.title="默认口音 · "+preferred.title;sounds.prepend(preferred);}});
    speed.addEventListener("change",async()=>{const value=await chrome.storage.local.get("dictionaryPreferences");chrome.storage.local.set({dictionaryPreferences:{...value.dictionaryPreferences,speed:Number(speed.value)}});});
    let playing=0;
    const play=async(accent)=>{
      const current=++playing;
      status.textContent="正在准备"+(accent==="en-GB"?"英音":"美音")+"……";
      try{const response=await send("dictionaryPronounce",{text:result.query,accent,speed:Number(speed.value)});
        if(current===playing)status.textContent="正在播放 · "+response.source+" · 合成读音可能因词义不同而有差异";
      }catch(error){if(current===playing && error.code!=="CANCELLED")status.textContent=error.message;}
    };
    for(const accent of ["en-GB","en-US"]){
      const control=button("▶ "+labels[accent],()=>play(accent),"sound-button");
      control.dataset.accent=accent;control.title="使用已选择的语音服务 · "+labels[accent];sounds.append(control);
    }
    sounds.append(speed);root.append(sounds);
    const exactEntries=(result.entries || []).filter(entry=>entry.headword===result.query);
    const matchingEntries=exactEntries.length?exactEntries:(result.entries || []).filter(entry=>entry.headword.toLowerCase()===result.query.toLowerCase());
    const phonetics=[...new Map(matchingEntries.flatMap(entry=>(entry.pronunciations || []).map(item=>[`${item.accent}:${item.ipa}:${item.note}`,item]))).values()];
    if(phonetics.length){const line=node("div",undefined,"phonetics");for(const sound of phonetics.slice(0,details?30:6)){const phonetic=node("span",`${labels[sound.accent] || "音标"} /${sound.ipa.replace(/^\/|\/$/g,"")}/`,"phonetic");phonetic.title=sound.note || "";line.append(phonetic);}root.append(line);}
    root.append(status);
    if(!result.entries?.length){root.append(node("h2","本地词库暂未收录"),node("p","可检查拼写，或在设置中更新词库。","muted"));for(const suggestion of result.suggestions || [])root.append(button(suggestion,()=>lookup(suggestion),"suggestion"));return;}
    for(const entry of (details?result.entries:result.entries.slice(0,2))){const section=node("section",undefined,"dictionary-entry");
      const header=node("div",undefined,"entry-heading");header.append(node("h2",entry.headword+(entry.pos?" · "+(labels[entry.pos] || entry.pos):"")),node("small",entry.source));section.append(header);
      const senses=node("ol",undefined,"senses");for(const sense of (entry.senses || []).slice(0,details?100:5)){const item=node("li",sense.zh || "");if(sense.labels?.length)item.append(node("small",sense.labels.join(" · "),"sense-label"));if(details)for(const example of sense.examples || []){const quote=node("blockquote");quote.append(node("p",example.text));if(example.translation)quote.append(node("p",example.translation,"muted"));item.append(quote);}senses.append(item);}section.append(senses);
      if(details && entry.english)section.append(node("h3","英文解释"),node("p",entry.english,"pre-lines"));
      if(details && entry.forms){const forms=Object.entries(entry.forms).filter(([key])=>labels[key]).map(([key,value])=>`${labels[key]}：${value}`).join("　");if(forms)section.append(node("p",forms,"forms"));}
      if(details && entry.etymology)section.append(node("h3","词源"),node("p",entry.etymology,"pre-lines"));
      if(details && entry.related?.length){const row=node("div");row.append(node("h3","相关词"));for(const item of entry.related)row.append(button(item.word,()=>lookup(item.word),"suggestion"));section.append(row);}
      if(details)section.append(link("词条来源 ↗",entry.sourceUrl),node("small"," · "+entry.license,"muted"));root.append(section);
    }
    if(!details)root.append(button("详细解释与例句 ↗",()=>send("dictionaryOpenDetails",{text:result.query}),"detail-link"));
  }
  return {node,button,send,render,favoriteButton,disposeFavorites};
})();
