"use strict";
const captionFormats = (() => {
  function plain(text) {
    return String(text || "").replace(/<[^>]*>/g, "").replace(/&(?:amp|lt|gt|quot|apos|nbsp);/g, value => ({ "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'", "&nbsp;": " " })[value]).replace(/&#(x[0-9a-f]+|\d+);/gi, (_, value) => {
      const code = value[0].toLowerCase() === "x" ? parseInt(value.slice(1), 16) : Number(value);
      return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : "";
    }).trim();
  }
  function seconds(text) { return text.replace(",", ".").split(":").reduce((value, part) => value * 60 + Number(part), 0); }
  function normalize(cues) {
    const seen = new Set();
    return cues.filter(cue => Number.isFinite(cue.start) && cue.start >= 0 && Number.isFinite(cue.end) && cue.end > cue.start && cue.text.trim()).sort((a, b) => a.start - b.start)
      .filter(cue => { const key = `${cue.start}:${cue.end}:${cue.text}`; if (seen.has(key)) return false; seen.add(key); return true; })
      .map((cue, index) => ({ ...cue, id: String(index) }));
  }
  function parse(text) {
    if (typeof text !== "string" || text.length > 2000000) return [];
    let cues = [];
    if (text.trim().startsWith("{")) {
      try {
        const events = JSON.parse(text).events || [];
        cues = events.filter(event => event.segs).map(event => ({ start: event.tStartMs / 1000, end: (event.tStartMs + (event.dDurationMs || 2000)) / 1000, text: event.segs.map(seg => seg.utf8 || "").join("").trim() }));
        // Rolling ASR events replace the preceding displayed window.
        cues.forEach((cue,index) => { const next = cues[index + 1]; if (next && next.start > cue.start) cue.end = Math.min(cue.end,next.start); });
      } catch (_) { return []; }
    } else if (/<(?:transcript|timedtext)\b/.test(text)) {
      const regex = /<(text|p)\b([^>]*)>([\s\S]*?)<\/\1>/g; let match;
      while ((match = regex.exec(text))) {
        const attr = name => { const found = new RegExp(`\\b${name}=["']([^"']+)["']`).exec(match[2]); return found ? Number(found[1]) : NaN; };
        const start = match[1] === "p" ? attr("t") / 1000 : attr("start");
        const duration = match[1] === "p" ? attr("d") / 1000 : attr("dur");
        cues.push({ start, end: start + duration, text: plain(match[3]) });
      }
    } else {
      for (const block of text.replace(/\r/g, "").split(/\n\s*\n/)) {
        const lines = block.split("\n"), index = lines.findIndex(line => line.includes("-->"));
        if (index < 0 || /^(NOTE|STYLE|REGION)\b/.test(lines[0])) continue;
        const match = /(\d{1,2}:\d{2}(?::\d{2})?[.,]\d{3})\s*-->\s*(\d{1,2}:\d{2}(?::\d{2})?[.,]\d{3})/.exec(lines[index]);
        if (match) cues.push({ start: seconds(match[1]), end: seconds(match[2]), text: plain(lines.slice(index + 1).join("\n")) });
      }
    }
    return normalize(cues);
  }
  return { parse, plain, normalize };
})();
if (typeof module !== "undefined") module.exports = captionFormats;
