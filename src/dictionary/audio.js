"use strict";
(() => {
  const player = document.getElementById("pronunciation");
  let url;
  function stop() { player.pause(); player.removeAttribute("src"); player.load(); if (url) URL.revokeObjectURL(url); url=null; }
  chrome.runtime.onMessage.addListener((message,sender,reply) => {
    if (message?.target !== "dictionaryAudio" || sender.id !== chrome.runtime.id || (sender.url && !sender.url.startsWith(chrome.runtime.getURL("")))) return;
    if (message.op === "stop") { stop(); reply({ok:true}); return; }
    if (message.op !== "play") return;
    (async () => {
      stop();
      const audio = message.audio;
      if (!audio || !["audio/ogg","audio/wav","audio/mpeg","audio/flac"].includes(audio.mime) || audio.bytes > 8*1024*1024) throw new Error("Invalid audio");
      const blocks = audio.chunks.map(chunk=>Uint8Array.from(atob(chunk), c=>c.charCodeAt(0)));
      if (blocks.reduce((sum,part)=>sum+part.length,0) !== audio.bytes) throw new Error("Incomplete audio");
      url=URL.createObjectURL(new Blob(blocks,{type:audio.mime})); player.src=url;
      player.preservesPitch=true; player.playbackRate=message.speed === .75 ? .75 : 1;
      await player.play(); reply({ok:true});
    })().catch(()=>reply({ok:false}));
    return true;
  });
  player.addEventListener("ended", stop);
})();
