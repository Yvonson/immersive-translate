"use strict";
twpConfig.onReady(() => {
  const host = document.createElement("section"); host.className = "obt-reading-settings";
  host.innerHTML = `<h2>阅读与字幕</h2><p>原文保留，译文显示在对应段落下方。视频使用相同的翻译引擎与目标语言。</p>
    <label>鼠标悬停段落翻译 <select id="obt-paragraph"><option value="yes">开启</option><option value="no">关闭</option></select></label>
    <label>单按切换本段 <select id="obt-trigger"><option value="Control">Ctrl</option><option value="Shift">Shift</option><option value="Alt">Alt</option></select></label>
    <p class="obt-help">单按后译文保留，再按关闭。输入框和 Ctrl+C 等组合操作不会触发。视频内的“双语字幕”菜单可选择字幕和调整显示。</p>`;
  document.querySelector("#main").prepend(host);
  for (const [id,key] of [["obt-paragraph","paragraphTranslation"],["obt-trigger","paragraphTrigger"]]) {
    const select = document.getElementById(id); select.value = twpConfig.get(key); select.addEventListener("change",() => twpConfig.set(key,select.value));
  }
  const keys = document.querySelector("#KeyboardShortcuts"); keys.replaceChildren();
  const heading = document.createElement("h3"); heading.textContent = "网页内快捷键"; keys.appendChild(heading);
  const note = document.createElement("p"); note.className = "obt-help"; note.textContent = "在网页获得焦点时生效。浏览器级绑定在下方 Chrome 管理页修改；相同组合键只执行一次，修改网页键不会移除浏览器原有绑定。"; keys.appendChild(note);
  const defaults = {"hotkey-toggle-translation":"Alt+Shift+T","hotkey-toggle-dual":"Alt+Shift+D"};
  const names = {"hotkey-toggle-translation":"翻译 / 恢复原文","hotkey-toggle-dual":"双语 / 仅译文"};
  for (const command of Object.keys(defaults)) {
    const row = document.createElement("div"); row.className = "obt-key-row";
    const label = document.createElement("label"); label.textContent = names[command];
    const input = document.createElement("input"); input.readOnly = true; input.setAttribute("aria-label",names[command]); input.placeholder = "点击后按组合键"; input.value = (twpConfig.get("pageShortcuts") || defaults)[command] || ""; label.appendChild(input);
    const feedback = document.createElement("span"); feedback.setAttribute("role","status");
    function set(value) {
      const config = {...twpConfig.get("pageShortcuts")};
      if (value && Object.keys(config).some(key => key !== command && config[key] === value)) { feedback.textContent = "此组合键已用于另一个动作。"; return; }
      config[command] = value; twpConfig.set("pageShortcuts",config); input.value = value; feedback.textContent = "已保存";
    }
    input.addEventListener("keydown",event => {
      if (event.key === "Tab") return;
      event.preventDefault();
      if (event.key === "Escape") { input.blur(); return; }
      if (event.key === "Backspace" || event.key === "Delete") { set(""); return; }
      const value = readingShortcuts.chord(event);
      if (!value || (!event.ctrlKey && !event.altKey && !event.metaKey) || (event.ctrlKey && event.altKey)) { feedback.textContent = "使用 Ctrl 或 Alt 加字母 / 数字，可带 Shift；避免 Ctrl+Alt 与输入法冲突。"; return; }
      if (/^(Ctrl|Command)\+(C|V|X|A|T|W|L|R|N|P|F|S)$/.test(value)) { feedback.textContent = "此组合键是常用浏览器 / 编辑快捷键，请换一个。"; return; }
      set(value); input.blur();
    });
    row.appendChild(label);
    for (const [title,value] of [["清除",""],["恢复默认",defaults[command]]]) { const button = document.createElement("button"); button.textContent = title; button.addEventListener("click",() => set(value)); row.appendChild(button); }
    row.appendChild(feedback); keys.appendChild(row);
  }
  const nativeTitle = document.createElement("h3"); nativeTitle.textContent = "Chrome 实际绑定"; keys.appendChild(nativeTitle);
  const native = document.createElement("p"); native.id = "obt-native-keys"; native.setAttribute("role","status"); keys.appendChild(native);
  function refresh() {
    chrome.commands.getAll(commands => { native.textContent = commands.filter(item => names[item.name]).map(item => `${names[item.name]}：${item.shortcut || "未绑定（可能冲突或已清除）"}`).join("；"); });
  }
  document.getElementById("openNativeShortcutManager").onclick = () => chrome.tabs.create({url:"chrome://extensions/shortcuts"});
  window.addEventListener("focus",refresh); refresh();
});
