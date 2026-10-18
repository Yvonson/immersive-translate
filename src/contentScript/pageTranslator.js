"use strict";
// Shared by page, hover and transcript translation. Original nodes stay in place.
var pageTranslator = {};
(() => {
  const records = new Map(), observers = [], languageObservers = [], transcriptRoots = new WeakSet(), sourceWrappers = new WeakSet();
  const blocks = "p,h1,h2,h3,h4,h5,h6,li,td,th,blockquote,figcaption,dt,dd,pre";
  const excluded = "[data-obt-ui],[data-obt-translation],script,style,noscript,textarea,input,select,button,video,audio,svg,math,[hidden],[inert],[role=tooltip],[role=button],[role=menu],[role=menuitem],tp-yt-paper-tooltip,.sr-only,.screen-reader-text,.visually-hidden,[contenteditable]:not([contenteditable=false]),[translate=no],.notranslate,.ytp-caption-window-container,.vds-captions";
  const typography = ["font-family","font-size","font-weight","font-style","line-height","letter-spacing","word-spacing","color","text-align","text-transform","text-decoration","direction","white-space"];
  const inline = new Set(["A","B","STRONG","I","EM","U","S","SMALL","SUB","SUP","CODE","KBD","MARK","SPAN","ABBR","CITE","Q"]);
  let ready = false, wholePage = false, language = document.documentElement.lang || "und", target, service, session = "", serial = 0;
  let pointer, tap, nativeBindings = [], mutationTimer, configTimer, intersection;
  let ruleCache, ruleURL;
  function rule() {
    if (ruleCache !== undefined && ruleURL === location.href) return ruleCache;
    ruleURL = location.href;
    for (const value of twpConfig.get("specialRules") || []) try {
      const candidate = typeof value === "string" ? JSON.parse(value) : value;
      const hosts = Array.isArray(candidate.hostname) ? candidate.hostname : [candidate.hostname];
      const patterns = Array.isArray(candidate.regex) ? candidate.regex : [candidate.regex];
      if (hosts.includes(location.hostname) || patterns.some(pattern => pattern && new RegExp(pattern).test(location.href))) return (ruleCache = candidate);
    } catch (_) { /* Invalid custom rules are ignored. */ }
    return (ruleCache = getPageSpecialConfig({tabUrl:location.href,twpConfig}));
  }
  function excludedByRule(node) {
    try { const selectors = rule()?.noTranslateSelectors; return !!(selectors?.length && node.closest(selectors.join(","))); } catch (_) { return false; }
  }
  function message(request) {
    return new Promise((resolve, reject) => chrome.runtime.sendMessage(request, response => {
      const error = chrome.runtime.lastError;
      if (error || response === undefined || response?.error) reject(new Error(error ? "扩展已更新，请刷新页面。" : response?.error || "翻译服务没有响应。")); else resolve(response);
    }));
  }
  function newSession() {
    if (session) chrome.runtime.sendMessage({action:"cancelTranslationSession",session}, () => { void chrome.runtime.lastError; });
    session = `page-${Date.now()}-${++serial}`;
  }
  function state() { return wholePage || [...records.values()].some(r => r.visible) ? "translated" : "original"; }
  function notify() {
    if (window === window.top) chrome.runtime.sendMessage({action:"setPageLanguageState",pageLanguageState:state()}, () => { void chrome.runtime.lastError; });
    observers.forEach(callback => callback(state()));
  }
  function visible(element) {
    if (!element.isConnected || (element.closest(excluded) && !transcriptRoots.has(element))) return false;
    const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  }
  function hidden(element) {
    const style = getComputedStyle(element);
    return style.display === "none" || ["hidden","collapse"].includes(style.visibility) || style.contentVisibility === "hidden";
  }
  // Read-only capture for explicit vocabulary collection. Reuse source wrapper
  // identity and the same visibility rules as translation; never read translations.
  pageTranslator.selectionContext = () => {
    const selection = getSelection();
    const element = selection?.anchorNode?.nodeType === Node.ELEMENT_NODE ? selection.anchorNode : selection?.anchorNode?.parentElement;
    const root = resolve(element);
    if (!root || !selection?.toString().trim()) return "";
    let value = "";
    function walk(node) {
      if (value.length > 20000) return;
      if (node.nodeType === Node.TEXT_NODE) { value += node.nodeValue; return; }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      if (!sourceWrappers.has(node) && (node.matches(excluded) || node.matches("[data-obt-result]") || excludedByRule(node) || hidden(node))) return;
      if (node.tagName === "BR") value += " ";
      node.childNodes.forEach(walk);
    }
    root.childNodes.forEach(walk);
    value = value.replace(/\s+/g," ").trim();
    const selected = selection.toString().trim(), at = value.indexOf(selected);
    const start = Math.max(0,at - 800);
    return value.slice(start,start + 2000);
  };
  function resolve(element) {
    if (!element?.closest || element.closest(excluded) || excludedByRule(element) || readingShortcuts.editable(element) || (twpConfig.get("translateTag_pre") === "no" && element.closest("pre"))) return null;
    let boundary;
    try { const selectors = rule()?.selectors; if (selectors?.length) boundary = element.closest(selectors.join(",")); } catch (_) { /* Ignore invalid user selectors. */ }
    let node = element;
    while (node && node !== document.body && node !== document.documentElement) {
      if (hidden(node)) return null;
      // Explicit site text selectors are boundaries, including inline comment roots.
      if (node === boundary) return visible(node) ? node : null;
      if (node.matches(blocks)) return visible(node) ? node : null;
      if (["block","flex","grid","list-item"].includes(getComputedStyle(node).display) && !node.querySelector(blocks) && visible(node)) return node;
      node = node.parentElement || node.getRootNode().host;
    }
    return null;
  }
  function copyStyle(from, to) {
    const style = getComputedStyle(from);
    typography.forEach(name => to.style.setProperty(name,style.getPropertyValue(name)));
  }
  function snapshot(root) {
    const tokens = [], nodes = [];
    let text = "";
    function readable(node) { return !node.matches(excluded) && !excludedByRule(node) && !hidden(node); }
    function literalText(node) {
      if (node.nodeType === Node.TEXT_NODE) return node.nodeValue;
      if (node.nodeType !== Node.ELEMENT_NODE || (!sourceWrappers.has(node) && !readable(node))) return "";
      return [...node.childNodes].map(literalText).join("");
    }
    function mark(kind,node) { text += `⟦OBT${tokens.length}⟧`; tokens.push({kind,node,...(kind === "literal" ? {text:literalText(node)} : {})}); }
    function walk(node) {
      if (node.nodeType === Node.TEXT_NODE) { nodes.push(node); text += node.nodeValue; return; }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      // Our translation-only wrappers hide source text deliberately. Treat them
      // as transparent so visibility filtering cannot invalidate our own records.
      if (sourceWrappers.has(node)) { node.childNodes.forEach(walk); return; }
      if (node.matches(blocks) || !readable(node)) return;
      if (node.tagName === "BR") { mark("break",node); return; }
      if (["CODE","KBD","TIME"].includes(node.tagName) || (transcriptRoots.has(root) && /^\s*(?:\d{1,2}:)?\d{1,2}:\d{2}\s*$/.test(node.textContent))) { mark("literal",node); return; }
      const tagged = inline.has(node.tagName);
      if (tagged) mark("open",node);
      node.childNodes.forEach(walk);
      if (tagged) mark("close",node);
    }
    root.childNodes.forEach(walk);
    const dictionary = twpConfig.get("customDictionary");
    if (dictionary instanceof Map) for (const [key,replacement] of dictionary) {
      if (!key || typeof key !== "string") continue;
      const escaped = key.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
      text = text.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`,"giu"), value => {
        const id = tokens.length; tokens.push({kind:"dictionary",text:replacement || value}); return `⟦OBT${id}⟧`;
      });
    }
    return {text,tokens,nodes,fingerprint:JSON.stringify([nodes.map(node => node.nodeValue),tokens.filter(token => token.kind === "literal").map(token => token.text)])};
  }
  function cloneInline(node) {
    const element = document.createElement(node.tagName.toLowerCase()); copyStyle(node,element);
    if (node.tagName === "A") try {
      const url = new URL(node.getAttribute("href"),location.href);
      if (["http:","https:","mailto:"].includes(url.protocol)) { element.href = url.href; element.rel = "noopener noreferrer"; }
    } catch (_) { /* Never copy executable URLs. */ }
    return element;
  }
  function render(container,text,data) {
    const seen = new Set(), stack = [container], opened = [];
    for (const part of text.split(/(⟦OBT\d+⟧)/g)) {
      const match = /^⟦OBT(\d+)⟧$/.exec(part), parent = stack.at(-1);
      if (!match) { parent.appendChild(document.createTextNode(part)); continue; }
      const id = Number(match[1]), token = data.tokens[id];
      if (!token || seen.has(id)) throw new Error("译文格式标记不匹配。");
      seen.add(id);
      if (token.kind === "open") { const child = cloneInline(token.node); parent.appendChild(child); stack.push(child); opened.push(token.node); }
      else if (token.kind === "close") { if (opened.pop() !== token.node || stack.length < 2) throw new Error("译文标签顺序不匹配。"); stack.pop(); }
      else if (token.kind === "break") parent.appendChild(document.createElement("br"));
      else if (token.kind === "dictionary") parent.appendChild(document.createTextNode(token.text));
      else { const literal = cloneInline(token.node); literal.textContent = token.text; parent.appendChild(literal); }
    }
    if (seen.size !== data.tokens.length || stack.length !== 1) throw new Error("译文格式标记缺失。");
  }
  function restoreSource(record) { for (const wrapper of record.wrappers) wrapper.replaceWith(...wrapper.childNodes); record.wrappers = []; }
  function displayMode(record) {
    restoreSource(record);
    if (!record.visible || !record.container?.querySelector("[data-obt-result]") || twpConfig.get("isShowDualLanguage") !== "no") return;
    for (const node of record.data.nodes) if (node.isConnected && node.nodeValue.trim()) {
      const wrapper = document.createElement("span"); wrapper.style.setProperty("display","none","important");
      sourceWrappers.add(wrapper);
      node.before(wrapper); wrapper.appendChild(node); record.wrappers.push(wrapper);
    }
    for (const token of record.data.tokens.filter(token => token.kind === "literal")) if (token.node.isConnected) {
      const wrapper = document.createElement("span"); wrapper.style.setProperty("display","none","important"); sourceWrappers.add(wrapper); token.node.before(wrapper); wrapper.appendChild(token.node); record.wrappers.push(wrapper);
    }
  }
  function style(record) {
    const container = record.container; container.removeAttribute("style"); copyStyle(record.root,container);
    container.style.cssText += ";display:block!important;margin-block:.35em 0;overflow-wrap:anywhere;max-width:100%;";
    if (container.parentElement !== record.root) { const source = getComputedStyle(record.root); container.style.paddingInlineStart = source.paddingInlineStart; container.style.paddingInlineEnd = source.paddingInlineEnd; }
    const theme = twpConfig.get("dualStyle");
    if (theme === "underline") container.style.borderBottom = "2px solid #72ece9";
    if (theme === "highlight") container.style.background = "#ead0b3";
    if (theme === "weakening") container.style.opacity = ".55";
    if (twpConfig.get("customDualStyle")) container.style.cssText += ";" + twpConfig.get("customDualStyle");
  }
  function getRecord(root) {
    if (!records.has(root)) records.set(root,{root,visible:false,version:0,wrappers:[],suppressed:false});
    return records.get(root);
  }
  function hide(record,suppressed = false) {
    record.version++; record.visible = false; record.suppressed = suppressed; restoreSource(record);
    record.container?.remove(); record.container = null;
  }
  async function translate(root,priority = "interactive") {
    if (!ready || !visible(root)) return;
    const record = getRecord(root); if (record.visible) return;
    restoreSource(record); const data = snapshot(root);
    if (!data.text.replace(/⟦OBT\d+⟧/g,"").trim()) return;
    record.visible = true; record.suppressed = false; record.data = data;
    const stamp = ++record.version, currentSession = session;
    const container = document.createElement("span"); container.setAttribute("data-obt-translation",""); container.setAttribute("translate","no"); container.className = "notranslate"; container.lang = target; container.dir = "auto";
    if (root.matches("li,td,th,dt,dd,blockquote,pre") || root.querySelector(blocks)) root.appendChild(container); else root.after(container);
    record.container = container; style(record); container.textContent = "正在翻译…"; container.setAttribute("aria-live","polite"); notify();
    const valid = () => stamp === record.version && currentSession === session && root.isConnected && snapshot(root).fingerprint === data.fingerprint;
    try {
      const response = await message({action:"translateStructuredParagraphs",session:currentSession,priority,items:[{id:"paragraph",text:data.text}]});
      if (!valid()) return;
      const result = document.createElement("span"); result.setAttribute("data-obt-result","");
      try { render(result,response.items[0].text,data); }
      catch (_) {
        const fragments = data.text.split(/(⟦OBT\d+⟧)/g), indexes = [];
        fragments.forEach((text,i) => { if (text.trim() && !/^⟦OBT\d+⟧$/.test(text)) indexes.push(i); });
        for (let offset = 0; offset < indexes.length; offset += 12) {
          if (!valid()) return;
          const batch = indexes.slice(offset,offset + 12);
          const fallback = await message({action:"translateStructuredParagraphs",session:currentSession,priority,items:batch.map(i => ({id:String(i),text:fragments[i]}))});
          fallback.items.forEach(item => { fragments[Number(item.id)] = item.text; });
        }
        if (!valid()) return;
        result.replaceChildren(); render(result,fragments.join(""),data);
        container.title = "按格式片段翻译，语句连贯性可能有所降低。";
      }
      container.replaceChildren(result); displayMode(record);
    } catch (error) {
      if (!valid()) return;
      container.textContent = `翻译失败：${error.message} `;
      const retry = document.createElement("button"); retry.textContent = "重试";
      retry.addEventListener("click",() => { hide(record); translate(root,priority); }); container.appendChild(retry);
    }
  }
  function candidates(root) {
    const found = new Set();
    const walker = document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode:node => node.nodeValue.trim() && !node.parentElement?.closest(excluded) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT});
    let text; while ((text = walker.nextNode())) { const node = resolve(text.parentElement); if (node) found.add(node); }
    for (const host of root.querySelectorAll("*")) if (host.shadowRoot) for (const node of candidates(host.shadowRoot)) found.add(node);
    return found;
  }
  function scan() {
    for (const [root,record] of records) {
      if (!root.isConnected) { hide(record); records.delete(root); continue; }
      if (record.visible && snapshot(root).fingerprint !== record.data.fingerprint) { hide(record); translate(root,"page"); }
    }
    if (!wholePage) return;
    let roots = [document.querySelector("main,article,[role=main]") || document.body];
    try { const config = rule(); if (config?.selectors?.length) { const selected = [...document.querySelectorAll(config.selectors.join(","))]; if (selected.length) roots = selected; } } catch (_) { /* Bad user selectors cannot stop the page. */ }
    const all = new Set(); roots.forEach(root => { if (root.matches(blocks) && visible(root)) all.add(root); candidates(root).forEach(node => all.add(node)); });
    for (const root of all) { const record = getRecord(root); if (!record.suppressed && !record.visible) intersection ? intersection.observe(root) : translate(root,"page"); }
  }
  function refreshStyles() { for (const record of records.values()) if (record.container) style(record); }
  function contentMutation(mutation) {
    const node = mutation.target.nodeType === Node.ELEMENT_NODE ? mutation.target : mutation.target.parentElement;
    if (node?.closest("[data-obt-translation],[data-obt-ui]")) return false;
    if (mutation.type !== "attributes") return true;
    // Player progress bars and other unrelated style changes must not rescan
    // every translated paragraph. Watch attributes only in reading content.
    if ([...records.keys()].some(root => root.contains(node) || node?.contains(root))) return true;
    if (!wholePage) return false;
    try {
      const selectors = rule()?.selectors;
      if (selectors?.length) return !!(node?.closest(selectors.join(",")) || node?.querySelector(selectors.join(",")));
    } catch (_) { /* Ignore invalid selectors. */ }
    return true;
  }
  pageTranslator.translatePage = code => { if (!ready) return twpConfig.onReady(() => pageTranslator.translatePage(code)); if (code && code !== target) twpConfig.set("targetLanguage",code); wholePage = true; scan(); notify(); };
  pageTranslator.restorePage = () => { wholePage = false; newSession(); for (const record of records.values()) hide(record); records.clear(); intersection?.disconnect(); notify(); };
  pageTranslator.toggleParagraph = root => { const record = getRecord(root); record.visible ? hide(record,true) : translate(root); notify(); };
  pageTranslator.translateParagraph = root => translate(root);
  pageTranslator.translateTranscript = root => { transcriptRoots.add(root); return translate(root); };
  pageTranslator.onPageLanguageStateChange = callback => observers.push(callback);
  pageTranslator.onGetOriginalTabLanguage = callback => ready ? callback(language) : languageObservers.push(callback);
  pageTranslator.swapTranslationService = () => twpConfig.set("pageTranslatorService",service === "google" ? "yandex" : "google");
  function command(action) {
    if (action === "hotkey-toggle-translation") wholePage ? pageTranslator.restorePage() : pageTranslator.translatePage();
    if (action === "hotkey-toggle-dual") twpConfig.set("isShowDualLanguage",twpConfig.get("isShowDualLanguage") === "no" ? "yes" : "no");
  }
  document.addEventListener("pointermove",event => {
    const element = event.composedPath()[0];
    pointer = element.closest?.("[data-obt-translation]") ? [...records.values()].find(r => r.container?.contains(element))?.root : resolve(element);
  },{passive:true,capture:true});
  document.addEventListener("keydown",event => {
    if (!ready || !event.isTrusted || event.isComposing) return;
    const trigger = twpConfig.get("paragraphTrigger") || "Control";
    if (event.key === trigger && !event.repeat && ![event.ctrlKey && trigger !== "Control",event.altKey && trigger !== "Alt",event.shiftKey && trigger !== "Shift",event.metaKey].some(Boolean) && twpConfig.get("paragraphTranslation") !== "no" && !readingShortcuts.editable(event.composedPath()[0])) tap = pointer;
    else if (event.key !== trigger) tap = null;
    if (event.repeat || readingShortcuts.editable(event.composedPath()[0])) return;
    const chord = readingShortcuts.chord(event); if (!chord || nativeBindings.some(item => item.shortcut === chord)) return;
    const bindings = twpConfig.get("pageShortcuts") || {}, action = Object.keys(bindings).find(key => bindings[key] === chord);
    if (action) { event.preventDefault(); event.stopPropagation(); if (window === window.top) command(action); else chrome.runtime.sendMessage({action:"readingCommand",command:action},() => { void chrome.runtime.lastError; }); }
  },true);
  document.addEventListener("keyup",event => { if (event.key === (twpConfig.get("paragraphTrigger") || "Control")) { const root = tap; tap = null; if (root && event.isTrusted && !readingShortcuts.editable(event.composedPath()[0])) pageTranslator.toggleParagraph(root); } },true);
  ["pointerdown","wheel"].forEach(name => document.addEventListener(name,() => { tap = null; },{passive:true,capture:true}));
  window.addEventListener("blur",() => { tap = null; });
  window.addEventListener("focus",() => message({action:"getNativeShortcuts"}).then(value => { nativeBindings = value; }).catch(() => {}));
  window.addEventListener("resize",refreshStyles);
  chrome.runtime.onMessage.addListener((request,sender,reply) => {
    if (!ready) return;
    if (request.action === "translatePage") request.targetLanguage === "original" ? pageTranslator.restorePage() : pageTranslator.translatePage(request.targetLanguage);
    if (request.action === "restorePage") pageTranslator.restorePage();
    if (request.action === "toggle-translation") command("hotkey-toggle-translation");
    if (request.action === "swapTranslationService" && window === window.top) pageTranslator.swapTranslationService();
    if (request.action === "readingCommand") command(request.command);
    if (request.action === "getOriginalTabLanguage") reply(language);
    if (request.action === "getCurrentPageLanguage") reply(wholePage ? target : language);
    if (request.action === "getCurrentPageLanguageState") reply(state());
    if (request.action === "getCurrentPageTranslatorService") reply(service);
  });
  twpConfig.onChanged(name => {
    if (name === "specialRules") ruleCache = undefined;
    if (["pageTranslatorService","targetLanguage","customDictionary","specialRules"].includes(name)) { clearTimeout(configTimer); configTimer = setTimeout(() => { target = twpConfig.get("targetLanguage"); service = twpConfig.get("pageTranslatorService"); newSession(); const active = [...records.values()].filter(r => r.visible).map(r => r.root); active.forEach(root => { hide(records.get(root)); translate(root,"page"); }); },0); }
    if (name === "isShowDualLanguage") for (const record of records.values()) displayMode(record);
    if (["dualStyle","customDualStyle"].includes(name)) refreshStyles();
  });
  chrome.storage.onChanged.addListener(changes => {
    if (!changes.aiProviderSettings || !ready) return;
    newSession(); const active = [...records.values()].filter(record => record.visible).map(record => record.root);
    active.forEach(root => { hide(records.get(root)); translate(root); });
  });
  twpConfig.onReady(async () => {
    ready = true; target = twpConfig.get("targetLanguage"); service = twpConfig.get("pageTranslatorService"); newSession();
    message({action:"getNativeShortcuts"}).then(value => { nativeBindings = value; }).catch(() => {});
    try { language = (await message({action:"detectTabLanguage"})) || language; } catch (_) { /* Keep document language. */ }
    languageObservers.forEach(callback => callback(language));
    intersection = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting && wholePage) { intersection.unobserve(entry.target); if (!getRecord(entry.target).suppressed) translate(entry.target,"page"); } }),{rootMargin:"100px"});
    new MutationObserver(mutations => { if (mutationTimer || !mutations.some(contentMutation)) return; mutationTimer = setTimeout(() => { mutationTimer = null; scan(); },150); }).observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:["hidden","inert","class","style","role"]});
    const themes = new MutationObserver(refreshStyles);
    themes.observe(document.documentElement,{attributes:true,attributeFilter:["class","style","data-theme"]});
    themes.observe(document.body,{attributes:true,attributeFilter:["class","style","data-theme"]});
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change",refreshStyles);
    if (window === window.top && !(twpConfig.get("neverTranslateSites") || []).includes(location.hostname) && ((twpConfig.get("alwaysTranslateSites") || []).includes(location.hostname) || ((twpConfig.get("alwaysTranslateLangs") || []).includes(language) && language !== target))) pageTranslator.translatePage();
  });
})();
