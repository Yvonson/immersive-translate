"use strict";
// Vidstack owns custom textTracks, distinct from HTMLVideoElement.textTracks.
(() => {
  window.addEventListener("message",event => {
    if (event.source !== window || event.origin !== location.origin || event.data?.type !== "obt-course-request") return;
    const player = document.querySelector("media-player,[data-media-player]"); if (!player) return;
    try {
      const list = Array.from(player.textTracks || []);
      const tracks = list.filter(track => ["subtitles","captions"].includes(track.kind)).map((track,index) => ({id:`vds-${index}`,language:track.language || "",label:track.label || track.language || "字幕",url:typeof track.src === "string" ? track.src : "",mode:track.mode,cues:Array.from(track.cues || []).slice(0,15000).map(cue => ({start:cue.startTime,end:cue.endTime,text:String(cue.text || "").slice(0,5000)}))}));
      window.postMessage({type:"obt-course-data",path:location.pathname,tracks},location.origin);
    } catch (_) { /* DOM captions and page VTT data remain available. */ }
  });
})();
