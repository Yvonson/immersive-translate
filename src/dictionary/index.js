"use strict";
(() => {
  const input=document.getElementById("word"), result=document.getElementById("result"), status=document.getElementById("status");
  let generation=0;
  async function count(){try{const meta=await dictionaryView.send("dictionaryFavorites",{op:"meta"});document.getElementById("favorites-link").textContent="★ 我的收藏 · "+meta.count;}catch(_){/* Link still opens the setup/error state. */}}
  count();chrome.storage.onChanged.addListener(changes=>{if(changes.dictionaryFavoritesRevision)count();});
  async function lookup(text){const current=++generation;input.value=text;status.textContent="正在查询本地词库……";
    try{const response=await dictionaryView.send("dictionaryLookup",{text});if(current!==generation)return;dictionaryView.render(result,response,{details:true,lookup});status.textContent="结果来自本地词库 · 未向在线翻译服务发送查询";}
    catch(error){if(current!==generation || error.code==="CANCELLED")return;result.replaceChildren(dictionaryView.node("h2","暂时无法查词"),dictionaryView.node("p",error.message),dictionaryView.button("打开词典设置",()=>dictionaryView.send("dictionaryOpenSettings")));status.textContent="";}
  }
  document.getElementById("search").addEventListener("submit",event=>{event.preventDefault();lookup(input.value);});
  addEventListener("pagehide",()=>dictionaryView.send("dictionaryCancel").catch(()=>{}));
  if(location.hash){try{const text=decodeURIComponent(location.hash.slice(1));history.replaceState(null,"",location.pathname);lookup(text);}catch(_){status.textContent="查询内容无效，请重新输入。";}}
})();
