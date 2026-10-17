"use strict";
twpConfig.onReady(() => {
  const host = document.getElementById("readingControls");
  host.innerHTML = '<label class="switch-row"><span id="hoverLabel"></span><input id="paragraphToggle" type="checkbox"></label><label class="switch-row"><span>当前页面双语字幕</span><input id="subtitleToggle" type="checkbox"></label><p class="help" id="subtitleStatus" role="status">也可通过播放器中的双语字幕图标设置。</p>';
  const hover = document.getElementById("paragraphToggle"), toggle = document.getElementById("subtitleToggle"), status = document.getElementById("subtitleStatus");
  function refresh() { document.getElementById("hoverLabel").textContent = `${({Control:"Ctrl",Shift:"Shift",Alt:"Alt"})[twpConfig.get("paragraphTrigger")] || "Ctrl"} 悬停段落翻译`; hover.checked = twpConfig.get("paragraphTranslation") !== "no"; }
  refresh(); twpConfig.onChanged(name => { if (["paragraphTrigger","paragraphTranslation"].includes(name)) refresh(); });
  hover.onchange = () => twpConfig.set("paragraphTranslation",hover.checked ? "yes" : "no");
  chrome.tabs.query({active:true,currentWindow:true},tabs => {
    const id = tabs[0]?.id; if (!id) return;
    chrome.runtime.sendMessage({action:"getTabReadingState",tabId:id},response => {
      if (chrome.runtime.lastError) { status.textContent = "请刷新普通网页后使用。"; return; }
      toggle.checked = !!response?.enabled;
      if (!response?.players) status.textContent = "开启后，将翻译此页面播放器中的已有字幕。";
    });
    toggle.onchange = () => chrome.tabs.sendMessage(id,{action:"setTabSubtitleState",enabled:toggle.checked},() => { if (chrome.runtime.lastError) { toggle.checked = false; status.textContent = "请刷新网页后再开启。"; } });
  });
});
