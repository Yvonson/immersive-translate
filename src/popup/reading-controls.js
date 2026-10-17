"use strict";
twpConfig.onReady(() => {
  const section = document.createElement("section"); section.style.cssText = "padding:12px 0;border-top:1px solid #9ab4a5;margin-top:12px;font-size:13px";
  const hoverLabel = document.createElement("label"); hoverLabel.style.cssText = "display:flex;justify-content:space-between;margin-bottom:10px"; hoverLabel.textContent = "Ctrl 翻译 / 还原悬停段落";
  const hover = document.createElement("input"); hover.type = "checkbox"; hover.checked = twpConfig.get("paragraphTranslation") !== "no"; hover.addEventListener("change",() => twpConfig.set("paragraphTranslation",hover.checked ? "yes" : "no")); hoverLabel.appendChild(hover); section.appendChild(hoverLabel);
  const label = document.createElement("label"); label.style.cssText = "display:flex;justify-content:space-between"; label.textContent = "当前页面双语字幕";
  const toggle = document.createElement("input"); toggle.type = "checkbox"; label.appendChild(toggle); section.appendChild(label);
  const status = document.createElement("p"); status.style.cssText = "font-size:12px;opacity:.8;margin:5px 0 0"; status.textContent = "也可在播放器的“双语字幕”菜单中开启。"; section.appendChild(status); document.querySelector("main").appendChild(section);
  chrome.tabs.query({active:true,currentWindow:true},tabs => {
    const id = tabs[0]?.id; if (!id) return;
    chrome.runtime.sendMessage({action:"getTabReadingState",tabId:id},response => { if (chrome.runtime.lastError) { status.textContent = "请刷新普通网页后使用。"; return; } toggle.checked = !!response?.enabled; });
    toggle.addEventListener("change",() => chrome.tabs.sendMessage(id,{action:"setTabSubtitleState",enabled:toggle.checked},() => { if (chrome.runtime.lastError) status.textContent = "请刷新网页后再开启。"; }));
  });
});
