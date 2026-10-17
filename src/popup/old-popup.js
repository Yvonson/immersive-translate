"use strict";
twpConfig.onReady(async () => {
  const $ = id => document.getElementById(id);
  const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
  if (!tab) return;
  let original = "und", state = "original";
  const status = $("pageStatus"), language = $("selectTargetLanguage"), service = $("selectService");
  const names = {...twpLang.getLanguageList(),"zh-CN":"简体中文","zh-TW":"繁體中文"};
  Object.entries(names).sort(([a,x],[b,y]) => a === "zh-CN" ? -1 : b === "zh-CN" ? 1 : x.localeCompare(y)).forEach(([code,name]) => language.add(new Option(name,code)));
  language.value = twpConfig.get("targetLanguage"); service.value = twpConfig.get("pageTranslatorService");
  const open = hash => chrome.tabs.create({url:chrome.runtime.getURL(`/options/options.html${hash || ""}`)});
  $("openSettings").onclick = () => open();
  $("configureService").onclick = event => { event.preventDefault(); open("#translations"); };
  async function message(action,extra = {}) { return chrome.tabs.sendMessage(tab.id,{action,...extra},{frameId:0}); }
  function render() {
    $("btnTranslate").textContent = state === "error" ? "重试翻译" : state === "translating" ? "正在翻译…" : state === "translated" ? "重新翻译" : "翻译此页";
    $("btnTranslate").disabled = state === "translating";
    $("btnRestore").hidden = !["translated","translating","error"].includes(state);
    status.textContent = state === "translating" ? "正在使用所选服务翻译…" : state === "error" ? "翻译失败，请检查服务配置后重试。" : state === "translated" ? "已显示译文，可随时恢复原文" : "保留原文，在段落下方显示译文";
    $("configureService").hidden = !["deepseek","local","custom"].includes(service.value);
  }
  language.onchange = () => twpConfig.setTargetLanguage(language.value,true);
  service.onchange = () => { twpConfig.set("pageTranslatorService",service.value); render(); };
  $("dualLanguage").checked = twpConfig.get("isShowDualLanguage") !== "no";
  $("dualLanguage").onchange = event => twpConfig.set("isShowDualLanguage",event.target.checked ? "yes" : "no");
  $("btnTranslate").onclick = async () => {
    try { await message("translatePage",{targetLanguage:language.value}); state = "translating"; render(); }
    catch (_) { status.textContent = "此页面无法翻译，请打开普通网页或刷新页面。"; }
  };
  $("btnRestore").onclick = async () => {
    try { await message("restorePage"); state = "original"; render(); }
    catch (_) { status.textContent = "请刷新网页后重试。"; }
  };
  let hostname = ""; try { hostname = new URL(tab.url).hostname; } catch (_) { /* Browser pages have no site rules. */ }
  $("currentSite").textContent = hostname || "当前页面";
  function siteRules() {
    $("alwaysSite").checked = twpConfig.get("alwaysTranslateSites").includes(hostname);
    $("neverSite").checked = twpConfig.get("neverTranslateSites").includes(hostname);
    $("alwaysSite").disabled = $("neverSite").disabled = !/^https?:/.test(tab.url || "");
  }
  $("alwaysSite").onchange = event => { event.target.checked ? twpConfig.addSiteToAlwaysTranslate(hostname) : twpConfig.removeSiteFromAlwaysTranslate(hostname); siteRules(); };
  $("neverSite").onchange = event => { event.target.checked ? twpConfig.addSiteToNeverTranslate(hostname) : twpConfig.removeSiteFromNeverTranslate(hostname); siteRules(); };
  $("alwaysLanguage").onchange = event => event.target.checked ? twpConfig.addLangToAlwaysTranslate(original,hostname) : twpConfig.removeLangFromAlwaysTranslate(original);
  siteRules(); render();
  try {
    original = await message("getOriginalTabLanguage") || "und";
    $("sourceLanguage").textContent = names[original] || "自动检测";
    $("autoLanguageRow").hidden = original === "und";
    $("autoLanguageLabel").textContent = `自动翻译${names[original] || "此语言"}`;
    $("alwaysLanguage").checked = twpConfig.get("alwaysTranslateLangs").includes(original);
    state = await message("getCurrentPageLanguageState") || "original"; render();
  } catch (_) { status.textContent = "请打开普通网页；更新扩展后需要刷新页面。"; }
  const timer = setInterval(async () => { try { const next = await message("getCurrentPageLanguageState"); if (next && next !== state) { state = next; render(); } } catch (_) { /* Closed or restricted tab. */ } },700);
  window.addEventListener("unload",() => clearInterval(timer),{once:true});
});
