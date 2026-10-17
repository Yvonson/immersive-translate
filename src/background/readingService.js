"use strict";

// All reading requests share this queue; prefetch can occupy only one slot.
const readingService = (() => {
  const queue = [], running = new Set(), sessions = new Map(), cache = new Map(), subtitleFrames = new Map();
  let revision = 0, sequence = 0;
  const cancelled = () => Object.assign(new Error("请求已取消。"), { code: "CANCELLED" });
  function pump() {
    queue.sort((a, b) => a.priority - b.priority || a.sequence - b.sequence);
    while (running.size < 2) {
      const index = queue.findIndex(job => !job.signal.aborted && (!job.prefetch || ![...running].some(x => x.prefetch)));
      if (index < 0) break;
      const job = queue.splice(index, 1)[0];
      running.add(job);
      Promise.resolve().then(job.task).then(value => job.signal.aborted ? job.reject(cancelled()) : job.resolve(value), job.reject)
        .finally(() => { running.delete(job); pump(); });
    }
  }
  function schedule(task, { signal, priority = 1, prefetch = false }) {
    return new Promise((resolve, reject) => {
      if (signal.aborted) return reject(cancelled());
      if (queue.length >= 250) return reject(new Error("翻译队列已满，请稍后重试。"));
      const job = { task, signal, priority, prefetch, resolve, reject, sequence: sequence++ };
      const abort = () => {
        const index = queue.indexOf(job);
        if (index >= 0) { queue.splice(index, 1); reject(cancelled()); }
      };
      signal.addEventListener("abort", abort, { once: true });
      const finish = fn => value => { signal.removeEventListener("abort", abort); fn(value); };
      job.resolve = finish(resolve); job.reject = finish(reject);
      queue.push(job); pump();
    });
  }
  function session(sender, id) {
    if (!sender.tab || typeof id !== "string" || id.length > 160) throw new Error("无效的翻译会话。");
    const key = `${sender.tab.id}:${sender.frameId || 0}:${id}`;
    if (!sessions.has(key)) sessions.set(key, new AbortController());
    return sessions.get(key);
  }
  function reset() {
    revision++; cache.clear();
    for (const controller of sessions.values()) controller.abort();
    sessions.clear();
  }
  chrome.storage.onChanged.addListener(changes => {
    if (["aiProviderSettings", "pageTranslatorService", "targetLanguage"].some(name => changes[name])) reset();
  });
  if (chrome.tabs && chrome.tabs.onRemoved) chrome.tabs.onRemoved.addListener(tabId => {
    for (const [key, controller] of sessions) if (key.startsWith(`${tabId}:`)) { controller.abort(); sessions.delete(key); }
    subtitleFrames.delete(tabId);
  });
  async function translate(items, request, sender) {
    await twpConfig.onReady();
    if (!Array.isArray(items) || !items.length || items.length > 12 || items.some(x => !x || typeof x.id !== "string" || typeof x.text !== "string" || x.text.length > 20000) || items.reduce((n, x) => n + x.text.length, 0) > 24000) throw new Error("翻译文本过大或格式无效。");
    const controller = session(sender, request.session);
    const stamp = revision, service = twpConfig.get("pageTranslatorService"), language = twpConfig.get("targetLanguage");
    const privateMode = !!sender.tab.incognito;
    const keys = items.map(item => JSON.stringify([stamp, service, language, item.text]));
    const result = new Array(items.length), missing = [];
    items.forEach((item, i) => {
      if (!privateMode && cache.has(keys[i])) result[i] = cache.get(keys[i]); else missing.push(i);
    });
    if (missing.length) {
      const values = await schedule(() => translationService.translateExact(service, language, missing.map(i => items[i].text), privateMode), {
        signal: controller.signal, priority: request.priority === "prefetch" ? 2 : request.priority === "page" ? 1 : 0, prefetch: request.priority === "prefetch",
      });
      if (stamp !== revision || controller.signal.aborted) throw cancelled();
      missing.forEach((index, i) => {
        result[index] = values[i];
        if (!privateMode) { cache.set(keys[index], values[i]); if (cache.size > 1200) cache.delete(cache.keys().next().value); }
      });
    }
    if (controller.signal.aborted) throw cancelled();
    return items.map((item, i) => ({ id: item.id, text: result[i] }));
  }
  // Only URLs for the explicitly supported course's VTT tracks are accepted.
  async function loadTrack(request, sender) {
    if (!sender.tab || new URL(sender.url).hostname !== "learn.deeplearning.ai") throw new Error("此页面不允许读取课程字幕。");
    const url = new URL(request.url);
    if (url.protocol !== "https:" || url.hostname !== "video.deeplearning.ai" || !url.pathname.endsWith(".vtt") || url.username || url.password) throw new Error("字幕地址不在允许范围。");
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(url.href, { credentials: "omit", redirect: "error", signal: controller.signal });
      if (!response.ok) throw new Error(`字幕读取失败（HTTP ${response.status}）。`);
      const reader = response.body.getReader(); let size = 0, text = ""; const decoder = new TextDecoder();
      while (true) {
        const part = await reader.read(); if (part.done) break;
        size += part.value.length;
        if (size > 2000000) { await reader.cancel(); throw new Error("字幕文件超过 2 MB。"); }
        text += decoder.decode(part.value, { stream: true });
      }
      text += decoder.decode();
      if (!/^\uFEFF?WEBVTT/.test(text)) throw new Error("字幕不是有效的 WebVTT。");
      return { text };
    } finally { clearTimeout(timer); }
  }
  chrome.runtime.onMessage.addListener((request, sender, reply) => {
    if (request.action === "reportSubtitleState" && sender.tab) {
      if (!subtitleFrames.has(sender.tab.id)) subtitleFrames.set(sender.tab.id, new Map());
      subtitleFrames.get(sender.tab.id).set(sender.frameId || 0, { enabled: !!request.enabled, players: Math.max(0, Math.min(100, Number(request.players) || 0)), time: Date.now() });
      reply({ ok: true });
    }
    if (request.action === "getTabReadingState" && !sender.tab && (sender.url || "").startsWith(chrome.runtime.getURL(""))) {
      chrome.tabs.sendMessage(request.tabId, { action: "refreshSubtitleState" }, () => {
        void chrome.runtime.lastError;
        setTimeout(() => {
          const frames = [...(subtitleFrames.get(request.tabId)?.values() || [])].filter(frame => Date.now() - frame.time < 30000);
          reply({ enabled: frames.some(frame => frame.enabled), players: frames.reduce((total, frame) => total + frame.players, 0) });
        }, 30);
      });
      return true;
    }
    if (request.action === "readingCommand" && sender.tab && ["hotkey-toggle-translation", "hotkey-toggle-dual"].includes(request.command)) {
      chrome.tabs.sendMessage(sender.tab.id, { action: request.command === "hotkey-toggle-translation" ? "toggle-translation" : "readingCommand", command: request.command }, request.command === "hotkey-toggle-dual" ? { frameId: 0 } : {}, () => { void chrome.runtime.lastError; });
      reply({ ok: true });
    }
    if (["translateStructuredParagraphs", "translateSubtitleBatch"].includes(request.action)) {
      translate(request.items, request, sender).then(items => reply({ items }), error => reply({ error: error.message, code: error.code || "TRANSLATION_ERROR" }));
      return true;
    }
    if (request.action === "cancelTranslationSession") {
      try {
        const key = `${sender.tab.id}:${sender.frameId || 0}:${request.session}`;
        if (sessions.has(key)) { sessions.get(key).abort(); sessions.delete(key); }
      } catch (_) { /* A closing frame no longer owns a session. */ }
      reply({ ok: true });
    }
    if (request.action === "loadSubtitleTrack") {
      loadTrack(request, sender).then(reply, error => reply({ error: error.message })); return true;
    }
    if (request.action === "getNativeShortcuts") {
      chrome.commands.getAll(commands => reply(commands)); return true;
    }
  });
  return { schedule, reset };
})();
