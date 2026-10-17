"use strict";

// TextTrack cues and YouTube captions only; no audio capture or speech recognition.
(() => {
  const videos = new Map();
  let enabled = false;
  let lastText = "";
  let lastVideo;
  let version = 0;
  let busy = false;
  let nextAttempt = 0;
  let overlay;
  let sourceLine;
  let translationLine;
  let overlayParent;

  function hide() {
    if (overlay) overlay.hidden = true;
  }

  function display(original, translated, video) {
    const parent = document.fullscreenElement || document.body;
    if (!overlay || overlayParent !== parent) {
      if (overlay) overlay.remove();
      overlay = document.createElement("div");
      overlay.className = "notranslate";
      overlay.setAttribute("translate", "no");
      overlay.setAttribute("data-immersive-subtitle", "true");
      overlay.style.cssText = "all:initial;position:fixed;z-index:2147483647;pointer-events:none;text-align:center;box-sizing:border-box;";
      const shadow = overlay.attachShadow({ mode: "closed" });
      const panel = document.createElement("div");
      panel.style.cssText = "display:inline-block;max-width:100%;padding:6px 14px;background:rgba(15,20,24,.85);color:white;border-radius:6px;font:20px/1.5 sans-serif;white-space:pre-line;overflow-wrap:anywhere;";
      sourceLine = document.createElement("div");
      sourceLine.style.cssText = "font-size:15px;color:#ddd";
      translationLine = document.createElement("div");
      panel.append(sourceLine, translationLine);
      shadow.append(panel);
      parent.append(overlay);
      overlayParent = parent;
    }
    const rect = video.getBoundingClientRect();
    overlay.style.left = `${Math.max(0, rect.left)}px`;
    overlay.style.top = `${Math.max(0, rect.bottom - Math.min(150, rect.height * .35))}px`;
    overlay.style.width = `${Math.min(rect.width, innerWidth)}px`;
    sourceLine.textContent = original;
    translationLine.textContent = translated;
    overlay.hidden = false;
  }

  function read() {
    let text = "";
    let selected;
    for (const video of videos.keys()) {
      if (!video.isConnected || video.ended || video.readyState < 2) continue;
      const rect = video.getBoundingClientRect();
      if (rect.width < 100 || rect.height < 80 || rect.bottom < 0 || rect.top > innerHeight) continue;
      const tracks = Array.from(video.textTracks).filter(track => track.mode === "showing" && ["subtitles", "captions"].includes(track.kind));
      text = tracks.flatMap(track => Array.from(track.activeCues || []).map(cue => cue.getCueAsHTML ? cue.getCueAsHTML().textContent : (cue.text || ""))).join("\n").trim();
      if (!text && /(^|\.)youtube\.com$/.test(location.hostname)) {
        const player = video.closest(".html5-video-player");
        if (player) text = Array.from(player.querySelectorAll(".ytp-caption-segment")).map(node => node.textContent).join(" ").trim();
      }
      if (text) { selected = video; break; }
    }
    return { text, video: selected };
  }

  function tick() {
    if (!enabled || document.hidden) {
      if (lastText) { lastText = ""; version++; }
      hide(); return;
    }
    for (const video of document.querySelectorAll("video")) videos.set(video, true);
    for (const video of videos.keys()) if (!video.isConnected) videos.delete(video);
    const current = read();
    if (current.text !== lastText || current.video !== lastVideo) {
      lastText = current.text;
      lastVideo = current.video;
      version++;
      nextAttempt = Date.now() + 250;
      hide();
    }
    if (!lastText || busy || Date.now() < nextAttempt) return;
    const stamp = version;
    const original = lastText;
    busy = true;
    nextAttempt = Infinity;
    chrome.runtime.sendMessage({ action: "translateSubtitle", source: original }, response => {
      busy = false;
      const error = chrome.runtime.lastError;
      // Never display a late translation over a new cue, language or video.
      const latest = read();
      if (!enabled || document.hidden || stamp !== version || latest.text !== original || latest.video !== current.video) return;
      if (error || !response || response.error || !response.text) {
        display(original, response && response.error ? response.error : "字幕翻译连接失败，请检查引擎设置。", current.video);
        nextAttempt = Date.now() + 10000;
      } else display(original, response.text, current.video);
    });
  }

  twpConfig.onReady(() => {
    enabled = twpConfig.get("subtitleTranslation") === "yes";
    setInterval(tick, 300);
  });
  twpConfig.onChanged(name => {
    if (["subtitleTranslation", "targetLanguage", "pageTranslatorService"].includes(name)) {
      enabled = twpConfig.get("subtitleTranslation") === "yes";
      version++; lastText = ""; hide();
    }
  });
})();
