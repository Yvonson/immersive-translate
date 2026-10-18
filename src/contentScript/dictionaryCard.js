"use strict";
(() => {
  let anchor, host, root, generation=0, previousFocus, resize, captured;
  const capture=()=>({sentence:globalThis.pageTranslator?.selectionContext?.() || "",title:document.title.slice(0,500)});
  document.addEventListener("contextmenu",event=>{
    const selection=getSelection();
    const box=selection?.rangeCount?selection.getRangeAt(0).getBoundingClientRect():null;
    anchor={x:box?.width?box.left:event.clientX,y:box?.height?box.bottom:event.clientY};
    captured=capture();
  },true);
  function close(){generation++;resize?.disconnect();host?.remove();host=null;dictionaryView.send("dictionaryCancel").catch(()=>{});previousFocus?.focus?.({preventScroll:true});}
  async function show(text){
    const context=captured || capture();
    resize?.disconnect();host?.remove();previousFocus=document.activeElement;
    host=document.createElement("div");host.setAttribute("data-obt-ui","");host.setAttribute("translate","no");
    host.style.setProperty("all","initial","important");host.style.setProperty("position","fixed","important");host.style.setProperty("z-index","2147483647","important");
    root=host.attachShadow({mode:"closed"});
    const sheet=document.createElement("link");sheet.rel="stylesheet";sheet.href=chrome.runtime.getURL("dictionary/dictionary.css");
    const theme=document.createElement("link");theme.rel="stylesheet";theme.href=chrome.runtime.getURL("ui/theme.css");
    const style=document.createElement("style");style.textContent=":host{--canvas:#f6f7f9;--surface:#fff;--surface-soft:#f9fafb;--ink:#252632;--muted:#737582;--line:#e8e9ef;--accent:#c72e65;--accent-soft:#fff0f5;--focus:#df487a;--shadow:0 12px 45px #0002;color-scheme:light;font:14px/1.6 'Segoe UI','Microsoft YaHei UI',sans-serif;color:var(--ink)}:host([data-theme=dark]){--surface:#23242c;--surface-soft:#2b2c35;--ink:#f0f0f5;--muted:#b0b0bf;--line:#3a3b46;--accent:#ff91b5;--accent-soft:#402936;color-scheme:dark}.word-card{background:var(--surface);color:var(--ink);width:min(390px,calc(100vw - 24px));max-height:min(560px,calc(100vh - 24px));border:1px solid var(--line);border-radius:16px;box-shadow:var(--shadow);padding:18px;overflow:auto}.card-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}.card-top small{font-size:11px;letter-spacing:.08em;color:var(--muted)}.card-top button{padding:3px 9px}.word-heading h1{font-size:32px}.entry-heading{display:block}.dictionary-entry{padding-top:14px;margin-top:14px}.audio-status{margin-bottom:12px}.pronunciations{gap:6px}.pronunciations button,.pronunciations select{padding:7px 10px;font-size:12px}";
    const panel=dictionaryView.node("section",undefined,"word-card");panel.tabIndex=-1;panel.setAttribute("role","dialog");panel.setAttribute("aria-label","本地词典查词结果");
    const top=dictionaryView.node("div",undefined,"card-top");top.append(dictionaryView.node("small","本地词典"),dictionaryView.favoriteButton(text,context),dictionaryView.button("×",close));top.lastChild.setAttribute("aria-label","关闭词卡");
    const body=dictionaryView.node("div","正在查询本地词库……");panel.append(top,body);root.append(theme,sheet,style,panel);document.documentElement.append(host);
    const mode=twpConfig.get("darkMode");host.dataset.theme=mode==="yes" || mode==="auto" && matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";
    const position=()=>{if(!host)return;const bounds=panel.getBoundingClientRect(), point=anchor || {x:20,y:60};host.style.setProperty("left",Math.max(12,Math.min(point.x,innerWidth-bounds.width-12))+"px","important");host.style.setProperty("top",Math.max(12,Math.min(point.y+8,innerHeight-bounds.height-12))+"px","important");};
    position();resize=new ResizeObserver(position);resize.observe(panel);panel.focus({preventScroll:true});const current=++generation;
    try{const result=await dictionaryView.send("dictionaryLookup",{text});if(current!==generation || !host)return;dictionaryView.render(body,result,{lookup:show,favorite:false});}
    catch(error){if(current!==generation || !host || error.code==="CANCELLED")return;body.replaceChildren(dictionaryView.node("h2","暂时无法查词"),dictionaryView.node("p",error.message),dictionaryView.button("打开词典设置",()=>dictionaryView.send("dictionaryOpenSettings")));}
    if(current===generation)requestAnimationFrame(position);
  }
  document.addEventListener("keydown",event=>{if(host && event.key==="Escape"){event.preventDefault();event.stopImmediatePropagation();close();}},true);
  document.addEventListener("pointerdown",event=>{if(host && !event.composedPath().includes(host))close();},true);
  addEventListener("pagehide",()=>{if(host)close();});
  async function collect(text){
    const context=captured || capture(), toast=document.createElement("div");toast.setAttribute("data-obt-ui","");toast.setAttribute("translate","no");
    toast.style.cssText="all:initial!important;position:fixed!important;z-index:2147483647!important;right:20px!important;top:20px!important";
    const shadow=toast.attachShadow({mode:"closed"}), style=document.createElement("style");style.textContent="div{max-width:360px;background:#252632;color:white;border-radius:12px;padding:14px 18px;box-shadow:0 8px 32px #0003;font:14px/1.6 'Segoe UI','Microsoft YaHei',sans-serif}button{background:none;color:#ffb2cb;border:0;padding:8px;cursor:pointer;font:inherit}";
    const panel=dictionaryView.node("div","正在保存到本地生词本……");panel.setAttribute("role","status");shadow.append(style,panel);document.documentElement.append(toast);
    try{const result=await dictionaryView.send("dictionaryFavorites",{op:"collect",text,context});panel.textContent="★ 已收藏 "+result.word;panel.append(dictionaryView.button("查看收藏",()=>dictionaryView.send("dictionaryOpenFavorites",{wordId:result.id})));}
    catch(error){panel.textContent=error.message;}
    panel.append(dictionaryView.button("关闭",()=>toast.remove()));setTimeout(()=>toast.remove(),12000);
  }
  chrome.runtime.onMessage.addListener((message,sender,reply)=>{if(!["dictionaryShow","dictionaryCollectSelection"].includes(message.action))return;if(sender.id!==chrome.runtime.id)return;if(message.action==="dictionaryCollectSelection")collect(message.text);else show(message.text);reply({ok:true});});
})();
