"use strict";

twpConfig.onReady(async () => {
  const defaults = {
    deepseek: { baseUrl: "https://api.deepseek.com", model: "deepseek-flash", apiKey: "" },
    local: { baseUrl: "http://127.0.0.1:11434/v1", model: "qwen3:8b", apiKey: "" },
    custom: { baseUrl: "", model: "", apiKey: "" },
  };
  const result = await new Promise(resolve => chrome.storage.local.get("aiProviderSettings", resolve));
  const settings = result.aiProviderSettings || {};
  const profile = document.querySelector("#aiProfile");
  const activeService = twpConfig.get("pageTranslatorService");
  if (["deepseek", "local", "custom"].includes(activeService)) profile.value = activeService;
  const status = document.querySelector("#aiStatus");
  const fields = ["baseUrl", "model", "apiKey"];
  function load() {
    const values = { ...defaults[profile.value], ...settings[profile.value] };
    fields.forEach(key => { document.getElementById(`ai-${key}`).value = values[key]; });
    status.textContent = "";
  }
  profile.addEventListener("change", load);
  load();
  async function save() {
    const values = Object.fromEntries(fields.map(key => [key, document.getElementById(`ai-${key}`).value.trim()]));
    let url;
    try { url = new URL(values.baseUrl); } catch { throw new Error("请输入有效的 API 地址。"); }
    if (!values.model || url.username || url.password || url.search || url.hash ||
      (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) {
      throw new Error("请填写模型名称；远程地址使用 HTTPS，本地地址使用 localhost 或 127.0.0.1。");
    }
    settings[profile.value] = values;
    await new Promise((resolve, reject) => chrome.storage.local.set({ aiProviderSettings: settings }, () => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message)); else resolve();
    }));
    status.textContent = "已保存。请在上方选择对应的网页翻译引擎，并刷新待翻译页面。";
  }
  document.querySelector("#aiSave").addEventListener("click", () => save().catch(error => { status.textContent = error.message; }));
  document.querySelector("#aiTest").addEventListener("click", async event => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      await save();
      status.textContent = "正在测试，会发送一句示例文本到所选模型…";
      const result = await new Promise((resolve, reject) => chrome.runtime.sendMessage({ action: "testAIProvider", service: profile.value }, response => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message)); else resolve(response);
      }));
      if (!result || result.error) throw new Error(result ? result.error : "翻译服务无响应。");
      status.textContent = `连接成功：${result.text}`;
    } catch (error) { status.textContent = error.message; }
    finally { button.disabled = false; }
  });
  const subtitles = document.querySelector("#subtitleTranslation");
  subtitles.value = twpConfig.get("subtitleTranslation");
  subtitles.addEventListener("change", () => twpConfig.set("subtitleTranslation", subtitles.value));
});
