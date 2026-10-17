"use strict";
// Runs only on YouTube, in MAIN world. No extension APIs, keys or translation.
(() => {
  const responses = new Map();
  const videoId = () => new URL(location.href).searchParams.get("v") || location.pathname.split("/").at(-1);
  function captionURL(value) {
    try { const url = new URL(value,location.href); return url.protocol === "https:" && /(^|\.)youtube\.com$/.test(url.hostname) && url.pathname === "/api/timedtext" ? url : null; } catch (_) { return null; }
  }
  function publish(text,url) {
    if (!text || text.length > 2000000) return;
    const parsed = captionURL(url); if (!parsed) return;
    const id = parsed.searchParams.get("v") || videoId();
    if (id !== videoId()) return;
    const payload = {type:"obt-caption-data",videoId:id,language:parsed.searchParams.get("lang") || "",text};
    responses.set(`${id}:${payload.language}`,payload); if (responses.size > 6) responses.delete(responses.keys().next().value);
    window.postMessage(payload,location.origin);
  }
  const originalFetch = window.fetch;
  window.fetch = function (...args) {
    const promise = Reflect.apply(originalFetch,this,args);
    const url = typeof args[0] === "string" || args[0] instanceof URL ? String(args[0]) : args[0]?.url;
    if (captionURL(url)) promise.then(response => {
      if (response.ok && Number(response.headers.get("content-length") || 0) <= 2000000) response.clone().text().then(text => publish(text,url)).catch(() => {});
    }).catch(() => {});
    return promise;
  };
  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method,url,...rest) {
    if (captionURL(url)) this.addEventListener("load",() => {
      try { if (this.status === 200) publish(this.responseType === "json" ? JSON.stringify(this.response) : this.responseText,String(url)); } catch (_) { /* Binary responses are not captions. */ }
    },{once:true});
    return Reflect.apply(originalOpen,this,[method,url,...rest]);
  };
  function tracks() {
    try {
      const player = document.querySelector("#movie_player"), data = player?.getPlayerResponse?.();
      return data?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
    } catch (_) { return []; }
  }
  window.addEventListener("message",event => {
    if (event.source !== window || event.origin !== location.origin || !event.data) return;
    if (event.data.type === "obt-caption-request") {
      const list = tracks();
      window.postMessage({type:"obt-caption-tracks",videoId:videoId(),tracks:list.map((track,index) => ({id:String(index),language:track.languageCode,label:track.name?.simpleText || track.name?.runs?.map(x => x.text).join("") || track.languageCode,kind:track.kind || "manual"}))},location.origin);
      for (const payload of responses.values()) if (payload.videoId === videoId()) window.postMessage(payload,location.origin);
    }
    if (event.data.type === "obt-caption-select") {
      const list = tracks(), track = list[Number(event.data.id)];
      if (track) try { document.querySelector("#movie_player")?.setOption?.("captions","track",{languageCode:track.languageCode,kind:track.kind || "",name:""}); } catch (_) { /* The native subtitle menu remains available. */ }
    }
  });
})();
