"use strict";
(() => {
  let anchor, host, root, generation=0, previousFocus, resize, menuCapture, cardInvocation, openingRange;
  const saving=new Map(), held=new Set(), modifiers=new Set();
  const capture=()=>({sentence:globalThis.pageTranslator?.selectionContext?.() || "",title:document.title.slice(0,500)});
  const comparable=text=>text.normalize("NFKC").replace(/\s+/g," ").trim().replace(/^["“”‘’.,;:!?()[\]{}]+|["“”‘’.,;:!?()[\]{}]+$/g,"").toLowerCase();
  function selection(){
    const selected=getSelection();
    let element=selected?.anchorNode?.nodeType===Node.ELEMENT_NODE?selected.anchorNode:selected?.anchorNode?.parentElement;
    for(let current=element;current;current=current.parentElement || current.getRootNode().host)if(current.matches?.("[data-obt-ui]"))return null;
    const box=selected?.rangeCount?selected.getRangeAt(0).getBoundingClientRect():null;
    return {text:selected?.toString().trim() || "",context:capture(),anchor:box?.width?{x:box.left,y:box.bottom}:null,range:selected?{anchorNode:selected.anchorNode,anchorOffset:selected.anchorOffset,focusNode:selected.focusNode,focusOffset:selected.focusOffset}:null};
  }
  function menuInvocation(text){
    const current=selection();
    const match=[current,menuCapture].find(item=>item?.text && comparable(item.text).includes(comparable(text)));
    return {text,context:match?.context || {sentence:"",title:document.title.slice(0,500)},anchor:match?.anchor || current?.anchor};
  }
  function focused(){return document.hasFocus() && !["IFRAME","FRAME","EMBED","OBJECT"].includes(document.activeElement?.tagName);}
  document.addEventListener("contextmenu",event=>{
    menuCapture=selection();
    if(menuCapture && !menuCapture.anchor)menuCapture.anchor={x:event.clientX,y:event.clientY};
  },true);
  function close(){generation++;resize?.disconnect();dictionaryView.disposeFavorites(root);host?.remove();host=null;root=null;cardInvocation=null;openingRange=null;menuCapture=null;dictionaryView.send("dictionaryCancel").catch(()=>{});previousFocus?.focus?.({preventScroll:true});previousFocus=null;}
  async function show(invocation){
    const {text,context}=invocation;anchor=invocation.anchor;cardInvocation=invocation;openingRange=selection()?.range;
    if(!host)previousFocus=document.activeElement;
    resize?.disconnect();dictionaryView.disposeFavorites(root);host?.remove();
    host=document.createElement("div");host.setAttribute("data-obt-ui","");host.setAttribute("data-obt-dictionary-card","");host.setAttribute("translate","no");
    host.style.setProperty("all","initial","important");host.style.setProperty("position","fixed","important");host.style.setProperty("z-index","2147483647","important");
    root=host.attachShadow({mode:"closed"});
    const sheet=document.createElement("link");sheet.rel="stylesheet";sheet.href=chrome.runtime.getURL("dictionary/dictionary.css");
    const theme=document.createElement("link");theme.rel="stylesheet";theme.href=chrome.runtime.getURL("ui/theme.css");
    const style=document.createElement("style");style.textContent=":host{--canvas:#f6f7f9;--surface:#fff;--surface-soft:#f9fafb;--ink:#252632;--muted:#737582;--line:#e8e9ef;--accent:#c72e65;--accent-soft:#fff0f5;--focus:#df487a;--shadow:0 12px 45px #0002;color-scheme:light;font:14px/1.6 'Segoe UI','Microsoft YaHei UI',sans-serif;color:var(--ink)}:host([data-theme=dark]){--surface:#23242c;--surface-soft:#2b2c35;--ink:#f0f0f5;--muted:#b0b0bf;--line:#3a3b46;--accent:#ff91b5;--accent-soft:#402936;color-scheme:dark}.word-card{background:var(--surface);color:var(--ink);width:min(390px,calc(100vw - 24px));max-height:min(560px,calc(100vh - 24px));border:1px solid var(--line);border-radius:16px;box-shadow:var(--shadow);padding:18px;overflow:auto}.card-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}.card-top small{font-size:11px;letter-spacing:.08em;color:var(--muted)}.card-top button{padding:3px 9px}.word-heading h1{font-size:32px}.entry-heading{display:block}.dictionary-entry{padding-top:14px;margin-top:14px}.audio-status{margin-bottom:12px}.pronunciations{gap:6px}.pronunciations button,.pronunciations select{padding:7px 10px;font-size:12px}";
    const panel=dictionaryView.node("section",undefined,"word-card");panel.tabIndex=-1;panel.setAttribute("role","dialog");panel.setAttribute("aria-label","本地词典查词结果");
    const top=dictionaryView.node("div",undefined,"card-top");top.append(dictionaryView.node("small","本地词典"),dictionaryView.favoriteButton(text,context),dictionaryView.button("×",close));top.lastChild.setAttribute("aria-label","关闭词卡");updateHints(top);
    const body=dictionaryView.node("div","正在查询本地词库……");panel.append(top,body);root.append(theme,sheet,style,panel);document.documentElement.append(host);
    const mode=twpConfig.get("darkMode");host.dataset.theme=mode==="yes" || mode==="auto" && matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";
    const position=()=>{if(!host)return;const bounds=panel.getBoundingClientRect(), point=anchor || {x:20,y:60};host.style.setProperty("left",Math.max(12,Math.min(point.x,innerWidth-bounds.width-12))+"px","important");host.style.setProperty("top",Math.max(12,Math.min(point.y+8,innerHeight-bounds.height-12))+"px","important");};
    position();resize=new ResizeObserver(position);resize.observe(panel);panel.focus({preventScroll:true});const current=++generation;
    try{const result=await dictionaryView.send("dictionaryLookup",{text});if(current!==generation || !host)return;dictionaryView.render(body,result,{lookup:word=>show({text:word,context:{sentence:"",title:document.title.slice(0,500)},anchor}),favorite:false});}
    catch(error){if(current!==generation || !host || error.code==="CANCELLED")return;body.replaceChildren(dictionaryView.node("h2","暂时无法查词"),dictionaryView.node("p",error.message),dictionaryView.button("打开词典设置",()=>dictionaryView.send("dictionaryOpenSettings")));}
    if(current===generation)requestAnimationFrame(position);
  }
  document.addEventListener("keydown",event=>{if(host && event.key==="Escape"){event.preventDefault();event.stopImmediatePropagation();close();}},true);
  document.addEventListener("pointerdown",event=>{if(host && !event.composedPath().includes(host))close();},true);
  addEventListener("pagehide",()=>{if(host)close();});
  function updateHints(top=root?.querySelector(".card-top")){
    if(!top)return;
    const key=readingShortcuts.hint("hotkey-dictionary-collect"), star=top.querySelector(".favorite-button");
    if(star)star.title=key?"收藏当前词 · "+key:"收藏当前词（可在设置中绑定快捷键）";
    top.querySelector("small").title="查询选词 · "+(readingShortcuts.hint("hotkey-dictionary-lookup") || "未绑定");
  }
  twpConfig.onChanged(name=>{if(["pageShortcuts","hotkeys"].includes(name))updateHints();});
  readingShortcuts.onNative(()=>updateHints());
  function notification(message){
    const toast=document.createElement("div");toast.setAttribute("data-obt-ui","");toast.setAttribute("data-obt-dictionary-toast","");toast.setAttribute("translate","no");
    toast.style.cssText="all:initial!important;position:fixed!important;z-index:2147483647!important;right:20px!important;top:20px!important";
    const shadow=toast.attachShadow({mode:"closed"}), style=document.createElement("style");style.textContent="div{max-width:360px;background:#252632;color:white;border-radius:12px;padding:14px 18px;box-shadow:0 8px 32px #0003;font:14px/1.6 'Segoe UI','Microsoft YaHei',sans-serif}button{background:none;color:#ffb2cb;border:0;padding:8px;cursor:pointer;font:inherit}";
    const panel=dictionaryView.node("div",message);panel.setAttribute("role","status");shadow.append(style,panel);document.documentElement.append(toast);
    return {panel,finish(){panel.append(dictionaryView.button("关闭",()=>toast.remove()));setTimeout(()=>toast.remove(),12000);}};
  }
  function hint(message){const toast=notification(message);toast.finish();}
  function collect({text,context}){
    const key=JSON.stringify([text.normalize("NFKC").trim(),context,location.href]);
    if(saving.has(key))return saving.get(key);
    const toast=notification("正在保存到本地生词本……");
    const work=(async()=>{
      try{const result=await dictionaryView.send("dictionaryFavorites",{op:"collect",text,context});toast.panel.textContent="★ 已收藏 "+result.word;toast.panel.append(dictionaryView.button("查看收藏",()=>dictionaryView.send("dictionaryOpenFavorites",{wordId:result.id})));}
      catch(error){toast.panel.textContent=error.message;}
      finally{toast.finish();saving.delete(key);}
    })();saving.set(key,work);return work;
  }
  function shortcut(command,invocationSource){
    if(!focused() || !readingShortcuts.canUse() || held.has(command))return;
    // A native command can arrive after the physical key-up. Do not leave a
    // latch behind in that case and swallow the user's next invocation.
    if(invocationSource?.source!=="native" || modifiers.size)held.add(command);
    const current=selection();
    // Capture before opening/focusing the card. A keyboard action never uses the
    // last context-menu snapshot; only the open card may supply a fallback word.
    const unchanged=openingRange && current?.range && Object.keys(openingRange).every(key=>openingRange[key]===current.range[key]);
    const useCard=command==="hotkey-dictionary-collect" && host?.isConnected && (!current?.text || unchanged);
    const invocation=useCard?cardInvocation:current?.text?current:null;
    if(!invocation?.text){hint("请先选中词语，再使用查词或收藏快捷键。");return;}
    const text=invocation.text.normalize("NFKC").replace(/\s+/g," ").trim();
    if(text.length>120 || text.split(" ").length>8 || /[\u0000-\u001f\u007f]/.test(text)){hint("请选择不超过 120 个字符、8 个词的单词或短语。");return;}
    if(command==="hotkey-dictionary-lookup")show({...invocation,text});else collect({...invocation,text});
  }
  for(const command of ["hotkey-dictionary-lookup","hotkey-dictionary-collect"])readingShortcuts.register(command,source=>shortcut(command,source));
  window.addEventListener("keydown",event=>{if(["Alt","Control","Meta","Shift"].includes(event.key))modifiers.add(event.key);},true);
  window.addEventListener("keyup",event=>{modifiers.delete(event.key);held.clear();},true);
  document.addEventListener("pointerdown",()=>held.clear(),true);
  window.addEventListener("blur",()=>{held.clear();modifiers.clear();});
  chrome.runtime.onMessage.addListener((message,sender,reply)=>{
    if(sender.id!==chrome.runtime.id)return;
    if(message.action==="dictionaryShortcutProbe"){
      if(focused())dictionaryView.send("dictionaryShortcutClaim",{requestId:message.requestId}).catch(()=>{});
      return;
    }
    if(message.action==="dictionaryShortcutExecute"){
      if(focused() && ["hotkey-dictionary-lookup","hotkey-dictionary-collect"].includes(message.command))readingShortcuts.execute(message.command,{source:"native"});
      reply({ok:true});return;
    }
    if(!["dictionaryShow","dictionaryCollectSelection"].includes(message.action))return;
    const invocation=menuInvocation(message.text);
    if(message.action==="dictionaryCollectSelection")collect(invocation);else show(invocation);reply({ok:true});
  });
})();
