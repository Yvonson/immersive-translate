"use strict";
const readingShortcuts = (() => {
  const names = {"hotkey-toggle-translation":"翻译 / 恢复原文","hotkey-toggle-dual":"双语 / 仅译文","hotkey-dictionary-lookup":"查询选词","hotkey-dictionary-collect":"收藏选词"};
  const handlers = new Map(), before = new Set(), nativeObservers = new Set();
  let nativeBindings = [], composing = false;
  function chord(event) {
    if (!/^(Key[A-Z]|Digit[0-9])$/.test(event.code)) return "";
    return [event.ctrlKey && "Ctrl", event.altKey && "Alt", event.shiftKey && "Shift", event.metaKey && "Command", event.code.replace(/^(Key|Digit)/, "")].filter(Boolean).join("+");
  }
  function editable(node) { return !!(node?.closest && (node.isContentEditable || node.closest("input,textarea,select,[contenteditable]:not([contenteditable=false]),[role=textbox]"))); }
  function activeEditable() {
    let element=document.activeElement;
    while(element?.shadowRoot?.activeElement)element=element.shadowRoot.activeElement;
    return editable(element);
  }
  function canonical(value) { return (value || "").replace(/\s/g,"").replace(/MacCtrl/g,"Ctrl").replace(/Option/g,"Alt").replace(/⌘/g,"Command"); }
  function validate(value, command, bindings, native = nativeBindings) {
    if (!value) return "";
    if (!/^(?:(?:Ctrl|Alt|Shift|Command)\+)+[A-Z0-9]$/.test(value) || (!value.includes("Ctrl+") && !value.includes("Alt+") && !value.includes("Command+")) || value.includes("Ctrl+") && value.includes("Alt+")) return "使用 Ctrl 或 Alt 加字母 / 数字，可带 Shift；避免 Ctrl+Alt 与输入法冲突。";
    if (/^(Ctrl|Command)\+(?:[CVXATWLRNPFSQ]|Shift\+[TWNQ])$/.test(value) || /^Alt\+[EF]$/.test(value)) return "此组合键是常用浏览器 / 编辑快捷键，请换一个。";
    if (Object.entries(bindings).some(([other,key]) => other !== command && key && canonical(key) === canonical(value))) return "此组合键已用于另一个动作。";
    if (native.some(item => item.name !== command && item.shortcut && canonical(item.shortcut) === canonical(value))) return "此组合键已被本插件的另一个 Chrome 原生命令占用。请换键或修改原生绑定。";
    return "";
  }
  function resolve(event, bindings, native = nativeBindings, allowRepeat = false) {
    if (!event.isTrusted || event.isComposing || composing || event.repeat && !allowRepeat || event.getModifierState?.("AltGraph") || editable(event.composedPath?.()[0] || event.target)) return "";
    const value = chord(event);
    if (!value || native.some(item => item.shortcut && canonical(item.shortcut) === value)) return "";
    return Object.keys(names).find(command => bindings[command] === value) || "";
  }
  function execute(command, invocation = {}) {
    const handler = handlers.get(command);
    if (!handler) return false;
    before.forEach(callback => callback());
    handler(invocation);
    return true;
  }
  async function refreshNative() {
    try { nativeBindings = await chrome.runtime.sendMessage({action:"getNativeShortcuts"}) || []; nativeObservers.forEach(callback=>callback()); } catch (_) { /* Page may be closing. */ }
  }
  // Options pages only use validation. The shared listener is installed explicitly
  // by content scripts, once per document, before registering individual actions.
  let listening = false;
  function listen() {
    if (listening) return;
    listening = true;
    document.addEventListener("compositionstart",()=>{composing=true;before.forEach(callback=>callback());},true);
    document.addEventListener("compositionend",()=>{composing=false;},true);
    document.addEventListener("keydown",event=>{
      const command = resolve(event,twpConfig.get("pageShortcuts") || {},nativeBindings,true);
      if (!handlers.has(command)) return;
      event.preventDefault();event.stopImmediatePropagation();if(!event.repeat)execute(command,{source:"page",event});
    },true);
    window.addEventListener("blur",()=>{composing=false;});
    window.addEventListener("focus",refreshNative);
    twpConfig.onReady(refreshNative);
    twpConfig.onChanged(name=>{if(name==="hotkeys")refreshNative();});
  }
  function hint(command) {
    const page = twpConfig.get("pageShortcuts")?.[command] || "";
    const native = nativeBindings.find(item=>item.name===command)?.shortcut || "";
    return [...new Set([page,native].filter(Boolean))].join(" / ");
  }
  return {chord,editable,canonical,validate,resolve,execute,listen,hint,names,
    register:(command,handler)=>handlers.set(command,handler),before:callback=>before.add(callback),
    canUse:()=>!composing && !activeEditable(),native:()=>nativeBindings,onNative:callback=>nativeObservers.add(callback)};
})();
