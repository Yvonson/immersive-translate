"use strict";
(() => {
  const players = new Map(), captured = new Map(), sentenceButtons = new WeakMap();
  let tracksYT = [], tracksCourse = [], enabledTab = null, ready = false, discoverTimer;
  const youtube = /(^|\.)youtube\.com$/.test(location.hostname);
  const course = location.hostname === "learn.deeplearning.ai";
  const identity = () => youtube ? new URL(location.href).searchParams.get("v") || location.pathname : location.pathname;
  function send(request) {
    return new Promise((resolve,reject) => chrome.runtime.sendMessage(request,response => {
      const error = chrome.runtime.lastError;
      if (error || !response || response.error) reject(new Error(response?.error || "无法连接扩展，请刷新页面。")); else resolve(response);
    }));
  }
  function allowedURL(value) { try { const url = new URL(value); return url.protocol === "https:" && url.hostname === "video.deeplearning.ai" && url.pathname.endsWith(".vtt"); } catch (_) { return false; } }
  function courseTracks() {
    if (tracksCourse.length) return tracksCourse;
    try {
      const data = JSON.parse(document.getElementById("__NEXT_DATA__")?.textContent || "null"), props = data?.props?.pageProps;
      if (props?.lessonId && !location.pathname.split("/").includes(props.lessonId)) return [];
      const queries = props?.trpcState?.json?.queries || [];
      const video = queries.map(query => query.state?.data?.video).find(value => value && (!props.videoId || value.videoId === props.videoId));
      return (video?.tracks || []).filter(track => track.kind === "subtitles" && allowedURL(track.src)).map((track,index) => ({id:String(index),language:track.srcLang,label:track.label || track.srcLang,url:track.src}));
    } catch (_) { return []; }
  }
  function mark(node) { node.setAttribute("data-obt-ui",""); node.setAttribute("translate","no"); node.classList.add("notranslate"); return node; }
  function element(tag,text) { const node = document.createElement(tag); if (text) node.textContent = text; return node; }
  const css = `:host{all:initial;color-scheme:dark;font:14px/1.5 "Segoe UI",sans-serif}*{box-sizing:border-box}button,select,input{font:inherit}button{cursor:pointer}button:focus-visible,select:focus-visible,input:focus-visible{outline:2px solid #75d8b0;outline-offset:3px}.toggle{background:#172d2a;color:#effff6;border:1px solid #75d8b0;border-radius:5px;padding:5px 10px;white-space:nowrap;font-weight:600}.toggle[aria-pressed=true]{background:#27755c}.menu{position:absolute;right:0;bottom:42px;width:282px;max-height:65vh;overflow:auto;background:#14201f;color:#edf5f2;border:1px solid #52655d;border-radius:8px;box-shadow:0 10px 35px #0008;padding:16px;text-align:left;z-index:10}.menu[hidden]{display:none}.menu h2{font-size:16px;margin:0 0 12px}.menu label{display:block;margin:10px 0}.menu select{display:block;width:100%;background:#253632;color:#fff;border:1px solid #52655d;padding:5px;border-radius:3px}.menu input[type=range]{width:100%}.menu input[type=color]{float:right}.menu .status{border-top:1px solid #52655d;padding-top:10px;font-size:12px;color:#c6d7d0;white-space:normal;overflow-wrap:anywhere}.menu .switch{display:flex;justify-content:space-between}.lines{max-width:94%;margin:auto;display:inline-block;white-space:pre-line;text-align:center;padding:4px 10px;border-radius:3px;overflow-wrap:anywhere;font-family:"Segoe UI",sans-serif;line-height:1.45;text-shadow:0 1px 3px #000}.source,.translation{display:block}.source{font-size:.85em}.translation{font-weight:500}`;
  class Player {
    constructor(video) {
      this.video = video; this.id = identity(); this.version = 0; this.enabled = false; this.cues = []; this.translations = new Map(); this.pending = new Set(); this.retryAt = 0; this.failures = 0;
      this.container = video.closest(youtube ? ".html5-video-player" : ".lesson-video-player,media-player,[data-media-player],.video-js") || video.parentElement;
      if (!this.container || /^(BODY|HTML)$/.test(this.container.tagName)) this.container = video.parentElement;
      this.abort = new AbortController(); this.hiddenNodes = new Map(); this.hiddenTracks = new Map();
      this.position = this.container.style.position;
      if (getComputedStyle(this.container).position === "static") { this.container.style.position = "relative"; this.changedPosition = true; }
      this.settings = {...{mode:"dual",order:"source-first",size:22,color:"#ffffff",opacity:.75,offset:12},...twpConfig.get("subtitleStyle")};
      this.createUI(); this.reset();
      for (const event of ["timeupdate","seeking","seeked","play","pause","ratechange","loadedmetadata","emptied"]) video.addEventListener(event,() => {
        if (event === "seeking" || event === "emptied") { const cues = this.cues, key = this.trackKey; this.reset(); if (event === "seeking") { this.cues = cues; this.trackKey = key; } }
        this.update();
      },{signal:this.abort.signal});
      video.textTracks.addEventListener?.("addtrack",() => this.update(),{signal:this.abort.signal});
      document.addEventListener("fullscreenchange",() => { this.attach(); this.update(); },{signal:this.abort.signal});
      document.addEventListener("visibilitychange",() => { this.update(); },{signal:this.abort.signal});
      this.resize = new ResizeObserver(() => this.layout()); this.resize.observe(this.container);
      this.timer = setInterval(() => this.update(),250);
    }
    reset() {
      if (this.session) send({action:"cancelTranslationSession",session:this.session}).catch(() => {});
      this.version++; this.session = `subtitle-${Date.now()}-${Math.random().toString(36).slice(2)}`; this.pending.clear(); this.translations.clear(); this.cues = []; this.trackKey = ""; this.failures = 0; this.retryAt = 0; this.lastText = ""; this.loading = false;
      this.restoreNative(); this.overlay.style.display = "none";
    }
    createUI() {
      this.host = mark(element("span")); this.host.style.cssText = "display:inline-block;position:relative;z-index:2147483646;";
      this.shadow = this.host.attachShadow({mode:"closed"}); this.shadow.appendChild(element("style",css));
      this.button = element("button","双语字幕"); this.button.className = "toggle"; this.button.type = "button"; this.button.setAttribute("aria-pressed","false"); this.button.setAttribute("aria-expanded","false"); this.button.setAttribute("aria-label","双语字幕设置");
      this.menu = element("section"); this.menu.className = "menu"; this.menu.hidden = true; this.menu.setAttribute("aria-label","双语字幕设置"); this.menu.appendChild(element("h2","双语字幕"));
      const switchLabel = element("label","翻译当前视频"); switchLabel.className = "switch"; this.switch = element("input"); this.switch.type = "checkbox"; switchLabel.appendChild(this.switch); this.menu.appendChild(switchLabel);
      this.switch.addEventListener("change",() => this.setEnabled(this.switch.checked));
      const autoLabel = element("label","本站自动开启"); autoLabel.className = "switch"; const auto = element("input"); auto.type = "checkbox"; auto.checked = (twpConfig.get("subtitleAutoSites") || []).includes(location.hostname); autoLabel.appendChild(auto); this.menu.appendChild(autoLabel);
      auto.addEventListener("change",() => { const sites = new Set(twpConfig.get("subtitleAutoSites") || []); auto.checked ? sites.add(location.hostname) : sites.delete(location.hostname); twpConfig.set("subtitleAutoSites",[...sites]); });
      this.trackSelect = this.select("源字幕",[["native","跟随播放器"]],value => { this.selectedTrack = value; this.reset(); if (youtube && value !== "native") window.postMessage({type:"obt-caption-select",id:value},location.origin); this.update(); });
      this.select("显示",[["dual","原文 + 译文"],["translation","仅译文"]],value => { this.settings.mode = value; this.save(); },this.settings.mode);
      this.select("顺序",[["source-first","原文在上"],["translation-first","译文在上"]],value => { this.settings.order = value; this.save(); },this.settings.order);
      this.range("字号",14,40,1,this.settings.size,value => { this.settings.size = value; this.save(); });
      this.range("背景透明度",0,1,.05,this.settings.opacity,value => { this.settings.opacity = value; this.save(); });
      this.range("距底部 (%)",3,60,1,this.settings.offset,value => { this.settings.offset = value; this.save(); });
      const colorLabel = element("label","译文颜色"); const color = element("input"); color.type = "color"; color.value = this.settings.color; colorLabel.appendChild(color); this.menu.appendChild(colorLabel); color.addEventListener("input",() => { this.settings.color = color.value; this.save(); });
      this.status = element("p","开启后读取已有字幕，翻译服务跟随网页设置。"); this.status.className = "status"; this.status.setAttribute("role","status"); this.menu.appendChild(this.status);
      const retry = element("button","重新读取 / 重试"); retry.className = "toggle"; retry.addEventListener("click",() => { this.reset(); this.update(); }); this.menu.appendChild(retry);
      this.button.addEventListener("click",() => { this.menu.hidden = !this.menu.hidden; this.button.setAttribute("aria-expanded",String(!this.menu.hidden)); if (!this.menu.hidden) { this.placeMenu(); this.switch.focus(); } });
      document.addEventListener("pointerdown",event => { if (!event.composedPath().includes(this.host)) { this.menu.hidden = true; this.button.setAttribute("aria-expanded","false"); } },{signal:this.abort.signal});
      this.shadow.addEventListener("keydown",event => { event.stopPropagation(); if (event.key === "Escape") { this.menu.hidden = true; this.button.setAttribute("aria-expanded","false"); this.button.focus(); } });
      this.shadow.append(this.button,this.menu);
      this.overlay = mark(element("div")); this.overlay.style.cssText = "position:absolute;left:0;right:0;pointer-events:none;text-align:center;z-index:2147483645;display:none;";
      const shadow = this.overlay.attachShadow({mode:"closed"}); shadow.appendChild(element("style",css)); this.lines = element("div"); this.lines.className = "lines"; this.source = element("span"); this.source.className = "source"; this.translation = element("span"); this.translation.className = "translation"; this.lines.append(this.source,this.translation); shadow.appendChild(this.lines);
      this.attach(); this.layout();
    }
    select(title,options,onChange,value) {
      const label = element("label",title), select = element("select"); options.forEach(([id,text]) => { const option = element("option",text); option.value = id; select.appendChild(option); }); label.appendChild(select); this.menu.appendChild(label); select.value = value || options[0][0]; select.addEventListener("change",() => onChange(select.value)); return select;
    }
    range(title,min,max,step,value,onChange) {
      const label = element("label",title), input = element("input"); input.type = "range"; input.min = min; input.max = max; input.step = step; input.value = value; input.setAttribute("aria-label",title); label.appendChild(input); this.menu.appendChild(label); input.addEventListener("input",() => onChange(Number(input.value)));
    }
    save() { twpConfig.set("subtitleStyle",this.settings); this.layout(); this.update(); }
    placeMenu() {
      if (this.menu.hidden) return;
      const rect = this.button.getBoundingClientRect();
      this.menu.style.position = "fixed"; this.menu.style.right = "auto"; this.menu.style.bottom = "auto";
      this.menu.style.width = `${Math.min(282,innerWidth - 24)}px`; this.menu.style.maxHeight = `${Math.min(480,innerHeight - 24)}px`;
      this.menu.style.left = `${Math.max(12,Math.min(rect.right - this.menu.offsetWidth,innerWidth - this.menu.offsetWidth - 12))}px`;
      this.menu.style.top = `${Math.max(12,Math.min(rect.bottom + 8,innerHeight - this.menu.offsetHeight - 12))}px`;
    }
    layout() {
      const rect = this.video.getBoundingClientRect(), parent = this.container.getBoundingClientRect();
      this.overlay.style.left = `${rect.left - parent.left}px`; this.overlay.style.right = "auto"; this.overlay.style.width = `${rect.width}px`;
      this.overlay.style.top = `${rect.bottom - parent.top - rect.height * this.settings.offset / 100}px`; this.overlay.style.bottom = "auto"; this.overlay.style.transform = "translateY(-100%)";
      if (!this.inControls) { this.host.style.left = `${Math.max(0,rect.right - parent.left - 120)}px`; this.host.style.right = "auto"; this.host.style.top = `${rect.top - parent.top + 12}px`; }
      this.lines.style.fontSize = `${this.settings.size}px`; this.lines.style.backgroundColor = `rgba(0,0,0,${this.settings.opacity})`; this.translation.style.color = this.settings.color; this.source.style.color = "#ffffff";
      this.placeMenu();
    }
    attach() {
      const controls = youtube ? this.container.querySelector(".ytp-right-controls") : this.container.querySelector(".vds-controls-group:last-child");
      const parent = document.fullscreenElement;
      if (parent === this.video) { this.restoreNative(); this.status.textContent = "此原生全屏模式无法叠加字幕，请使用播放器全屏按钮。"; return; }
      this.container.appendChild(this.overlay);
      this.inControls = !!controls;
      if (controls) { controls.prepend(this.host); this.host.style.cssText = "display:inline-block;position:relative;z-index:2147483646"; this.menu.style.bottom = "42px"; this.menu.style.top = "auto"; }
      else { this.container.appendChild(this.host); this.host.style.cssText = "position:absolute;z-index:2147483646;"; this.menu.style.bottom = "auto"; this.menu.style.top = "38px"; }
      this.layout();
    }
    setEnabled(value) {
      this.enabled = value; this.switch.checked = value; this.button.setAttribute("aria-pressed",String(value)); this.reset();
      if (value && youtube) { const cc = this.container.querySelector(".ytp-subtitles-button[aria-pressed=false]"); cc?.click(); window.postMessage({type:"obt-caption-request"},location.origin); }
      if (value && course) window.postMessage({type:"obt-course-request"},location.origin);
      this.update(); report();
    }
    restoreNative() {
      for (const [node,value] of this.hiddenNodes) if (node.style.visibility === "hidden") { node.style.setProperty("visibility",value.value,value.priority); if (!value.value) node.style.removeProperty("visibility"); }
      this.hiddenNodes.clear();
      for (const [track,mode] of this.hiddenTracks) if (track.mode === "hidden") track.mode = mode;
      this.hiddenTracks.clear();
    }
    hideNative() {
      if (this.nativeTrack && !this.hiddenTracks.has(this.nativeTrack) && this.nativeTrack.mode === "showing") { this.hiddenTracks.set(this.nativeTrack,"showing"); this.nativeTrack.mode = "hidden"; }
      for (const node of this.container.querySelectorAll(".ytp-caption-window-container,.vds-captions")) if (!this.hiddenNodes.has(node)) { this.hiddenNodes.set(node,{value:node.style.getPropertyValue("visibility"),priority:node.style.getPropertyPriority("visibility")}); node.style.setProperty("visibility","hidden","important"); }
    }
    syncTracks(tracks) {
      const signature = JSON.stringify(tracks.map(track => [track.id,track.label])); if (signature === this.trackSignature) return;
      this.trackSignature = signature; this.trackSelect.replaceChildren();
      for (const track of [{id:"native",label:"跟随播放器"},...tracks]) { const option = element("option",track.label); option.value = track.id; this.trackSelect.appendChild(option); }
      this.trackSelect.value = this.selectedTrack || "native";
    }
    native() {
      const tracks = Array.from(this.video.textTracks || []).filter(track => ["subtitles","captions"].includes(track.kind));
      const selected = this.selectedTrack && this.selectedTrack !== "native" ? tracks[Number(this.selectedTrack)] : tracks.find(track => track.mode === "showing") || (this.hiddenTracks.has(this.nativeTrack) ? this.nativeTrack : null);
      if (selected && this.selectedTrack !== "native" && selected.mode === "disabled") { this.hiddenTracks.set(selected,"disabled"); selected.mode = "hidden"; }
      this.nativeTrack = selected;
      const key = selected ? `native:${selected.language}:${selected.label}:${selected.cues?.length}` : "";
      if (key === this.trackKey) return null;
      if (selected?.cues?.length) return {cues:captionFormats.normalize(Array.from(selected.cues).map(cue => ({start:cue.startTime,end:cue.endTime,text:cue.getCueAsHTML ? cue.getCueAsHTML().textContent : captionFormats.plain(cue.text)}))),key};
      return null;
    }
    async loadCourse() {
      const tracks = courseTracks(); this.syncTracks(tracks);
      const language = this.container.querySelector("media-player")?.getAttribute("lang");
      const track = tracks.find(track => track.id === this.selectedTrack) || tracks.find(track => track.mode === "showing") || tracks.find(track => track.language === language) || tracks[0];
      if (track?.cues?.length) {
        const key = `${track.id}:${track.cues.length}`;
        if (this.trackKey !== key) { this.trackKey = key; this.cues = captionFormats.normalize(track.cues.map(cue => ({...cue,text:captionFormats.plain(cue.text)}))); }
        return;
      }
      if (!track || this.trackKey === track.url || this.loading) return;
      this.trackKey = track.url; this.loading = true; const stamp = this.version;
      try { const response = await send({action:"loadSubtitleTrack",url:track.url}); if (stamp !== this.version) return; this.cues = captionFormats.parse(response.text); this.status.textContent = this.cues.length ? `时间轴模式 · ${track.label} · ${this.cues.length} 条字幕` : "字幕文件为空。"; }
      catch (error) { if (stamp === this.version) { this.status.textContent = error.message; this.retryAt = Date.now() + 10000; this.trackKey = ""; } }
      finally { this.loading = false; }
    }
    current() {
      const time = this.video.currentTime;
      if (this.cues.length) { const active = this.cues.filter(cue => cue.start <= time && cue.end > time); return {text:active.map(cue => cue.text).join("\n"),active}; }
      const track = [...this.video.textTracks].find(track => ["subtitles","captions"].includes(track.kind) && track.mode === "showing") || this.nativeTrack;
      let text = track ? [...(track.activeCues || [])].map(cue => cue.getCueAsHTML ? cue.getCueAsHTML().textContent : captionFormats.plain(cue.text)).join("\n").trim() : "";
      if (!text && youtube) text = [...this.container.querySelectorAll(".ytp-caption-segment")].map(node => node.textContent).join(" ").trim();
      if (!text && course) text = this.container.querySelector(".vds-captions")?.textContent.trim() || "";
      return {text,active:[]};
    }
    request(cues,priority) {
      if (!cues.length || Date.now() < this.retryAt) return;
      const unique = [...new Map(cues.filter(cue => cue.text && !this.translations.has(cue.text) && !this.pending.has(cue.text)).map(cue => [cue.text,cue])).values()].slice(0,12);
      if (!unique.length) return;
      let size = 0; const batch = unique.filter(cue => { size += cue.text.length; return size <= 6000 && cue.text.length <= 5000; }); if (!batch.length) return;
      batch.forEach(cue => this.pending.add(cue.text)); const stamp = this.version;
      send({action:"translateSubtitleBatch",session:this.session,priority,items:batch.map((cue,index) => ({id:String(index),text:cue.text}))}).then(response => {
        if (stamp !== this.version) return;
        response.items.forEach(item => this.translations.set(batch[Number(item.id)].text,item.text)); this.failures = 0; this.update();
      }).catch(error => {
        if (stamp !== this.version) return;
        this.failures++; this.retryAt = /401|403|配置|密钥|模型名称/.test(error.message) || this.failures >= 3 ? Infinity : Date.now() + Math.min(60000,2000 * 2 ** this.failures);
        this.status.textContent = `翻译失败：${error.message}（保留原字幕，可手动重试）`; this.restoreNative();
      }).finally(() => { if (stamp === this.version) batch.forEach(cue => this.pending.delete(cue.text)); });
    }
    update() {
      if (identity() !== this.id) { this.id = identity(); this.selectedTrack = "native"; tracksCourse = []; this.reset(); if (youtube) window.postMessage({type:"obt-caption-request"},location.origin); if (course) window.postMessage({type:"obt-course-request"},location.origin); }
      if (!this.host.isConnected || !this.overlay.isConnected) this.attach();
      this.layout();
      if (!this.enabled || document.hidden || this.video.ended || document.fullscreenElement === this.video) { this.overlay.style.display = "none"; this.restoreNative(); return; }
      if (course && Date.now() >= this.retryAt) this.loadCourse();
      if (youtube) {
        this.syncTracks(tracksYT); const selected = tracksYT.find(track => track.id === this.selectedTrack);
        const data = captured.get(`${this.id}:${selected?.language || ""}`) || (!selected && [...captured.values()].reverse().find(item => item.videoId === this.id));
        if (data && this.trackKey !== data.text) { this.trackKey = data.text; this.cues = captionFormats.parse(data.text); }
      } else if (!course) {
        const tracks = [...this.video.textTracks].filter(track => ["subtitles","captions"].includes(track.kind)); this.syncTracks(tracks.map((track,index) => ({id:String(index),label:track.label || track.language || `字幕 ${index + 1}`})));
        const native = this.native(); if (native && native.key !== this.trackKey) {
          if (this.trackKey) this.reset();
          this.trackKey = native.key; this.cues = native.cues;
        }
      }
      const {text,active} = this.current();
      if (!text) { this.overlay.style.display = "none"; this.restoreNative(); if (!this.cues.length && Date.now() >= this.retryAt) this.status.textContent = "未读取到字幕，请开启播放器 CC 或选择已有字幕轨。"; return; }
      if (text !== this.lastText) { this.lastText = text; this.stableAt = Date.now() + (this.cues.length ? 0 : 300); }
      const translated = active.length ? active.map(cue => this.translations.get(cue.text)).filter(Boolean).join("\n") : this.translations.get(text);
      if (this.failures && !translated && Date.now() < this.retryAt) { this.overlay.style.display = "none"; this.restoreNative(); return; }
      this.source.textContent = text; this.translation.textContent = translated || "";
      this.source.style.display = this.settings.mode === "translation" && translated ? "none" : "block";
      this.lines.replaceChildren(...(this.settings.order === "translation-first" ? [this.translation,this.source] : [this.source,this.translation]));
      this.overlay.style.display = "block"; this.hideNative();
      if (Date.now() >= this.retryAt) this.status.textContent = `${this.cues.length ? "时间轴模式（可预取）" : "即时字幕模式（无预取）"} · ${translated ? "已翻译" : "正在翻译"} · 跟随网页引擎`;
      if (Date.now() >= this.stableAt) this.request(active.length ? active : [{text}],"interactive");
      if (this.cues.length && !this.video.paused && Date.now() >= this.retryAt && !this.prefetching) {
        this.prefetching = true; this.request(this.cues.filter(cue => cue.start > this.video.currentTime && cue.start <= this.video.currentTime + 30 * Math.max(1,this.video.playbackRate)),"prefetch");
        setTimeout(() => { this.prefetching = false; },1000);
      }
    }
    destroy() { this.reset(); clearInterval(this.timer); this.abort.abort(); this.resize.disconnect(); this.host.remove(); this.overlay.remove(); if (this.changedPosition && this.container.style.position === "relative") this.container.style.position = this.position; }
  }
  window.addEventListener("message",event => {
    if (course && event.source === window && event.origin === location.origin && event.data?.type === "obt-course-data" && event.data.path === location.pathname && Array.isArray(event.data.tracks) && event.data.tracks.length <= 100) {
      tracksCourse = event.data.tracks.filter(track => typeof track.id === "string" && typeof track.label === "string" && (!track.url || allowedURL(track.url))).map(track => ({...track,cues:Array.isArray(track.cues) ? track.cues.filter(cue => typeof cue.text === "string" && cue.text.length <= 5000).slice(0,15000) : []}));
      for (const player of players.values()) player.update(); return;
    }
    if (!youtube || event.source !== window || event.origin !== location.origin) return;
    const data = event.data;
    if (data?.videoId !== identity()) return;
    if (data.type === "obt-caption-tracks" && Array.isArray(data.tracks) && data.tracks.length < 100) tracksYT = data.tracks.filter(track => typeof track.id === "string" && typeof track.language === "string" && typeof track.label === "string");
    if (data.type === "obt-caption-data" && typeof data.text === "string" && data.text.length <= 2000000 && typeof data.language === "string") { captured.delete(`${data.videoId}:${data.language}`); captured.set(`${data.videoId}:${data.language}`,data); if (captured.size > 6) captured.delete(captured.keys().next().value); }
    for (const player of players.values()) player.update();
  });
  function discover() {
    if (!ready) return;
    for (const [video,player] of players) if (!video.isConnected) { player.destroy(); players.delete(video); }
    for (const video of document.querySelectorAll("video")) if (!players.has(video) && video.parentElement) {
      const player = new Player(video); players.set(video,player);
      player.setEnabled(enabledTab ?? (twpConfig.get("subtitleTranslation") === "yes" || (twpConfig.get("subtitleAutoSites") || []).includes(location.hostname)));
    }
    report();
  }
  function report() {
    chrome.runtime.sendMessage({action:"reportSubtitleState",enabled:[...players.values()].some(player => player.enabled),players:players.size},() => { void chrome.runtime.lastError; });
  }
  function transcript() {
    if (!course || !ready) return;
    const panels = [...document.querySelectorAll('[data-testid*=transcript],[class*=transcript],[aria-label*=Transcript],[aria-label*=transcript]')].filter(node => !node.closest("[data-obt-ui]") && node.tagName !== "BUTTON");
    const timedRows = [...document.querySelectorAll('button')].filter(node => !node.closest("[data-obt-ui]") && /^\s*(?:\d{1,2}:)?\d{1,2}:\d{2}\s+\S/.test(node.textContent) && node.textContent.length < 1500);
    const rows = new Set([...timedRows,...panels.flatMap(panel => [...panel.querySelectorAll("p,[data-start],li")])]);
    for (const row of rows) {
      if (sentenceButtons.get(row)?.isConnected || !row.getBoundingClientRect().height) continue;
      const button = mark(element("button","翻译本句")); button.type = "button"; button.setAttribute("data-obt-sentence",""); button.style.cssText = "font:12px/1.5 sans-serif;border:1px solid #8da497;color:#205b43;background:#edf5f0;border-radius:3px;padding:2px 7px;margin:3px;cursor:pointer";
      button.addEventListener("click",event => { event.preventDefault(); event.stopPropagation(); pageTranslator.translateTranscript(row); }); row.after(button); sentenceButtons.set(row,button);
    }
    for (const button of document.querySelectorAll('button[aria-label="Show transcript panel"]')) {
      if (button.parentElement.querySelector("[data-obt-transcript]")) continue;
      const translate = mark(element("button","翻译可见文字稿")); translate.setAttribute("data-obt-transcript",""); translate.type = "button"; translate.className += " btn btn-sm btn-outline";
      translate.addEventListener("click",() => {
        let count = 0;
        for (const button of document.querySelectorAll("[data-obt-sentence]")) if (button.getBoundingClientRect().height && button.getBoundingClientRect().top < innerHeight && button.getBoundingClientRect().bottom > 0) { button.click(); count++; }
        if (!count) translate.textContent = "请先展开文字稿，再点击翻译";
      }); button.after(translate);
    }
  }
  chrome.runtime.onMessage.addListener((request,sender,reply) => {
    if (request.action === "refreshSubtitleState") { report(); reply({ok:true}); }
    if (request.action === "setTabSubtitleState") { enabledTab = !!request.enabled; for (const player of players.values()) player.setEnabled(enabledTab); reply({enabled:enabledTab}); }
    if (request.action === "getTabSubtitleState" && window === window.top) reply({enabled:[...players.values()].some(player => player.enabled),players:players.size,modes:[...players.values()].map(player => ({cues:player.cues.length,pending:player.pending.size,translated:player.translations.size,status:player.status.textContent}))});
  });
  twpConfig.onChanged(name => {
    if (["pageTranslatorService","targetLanguage","subtitleTranslation"].includes(name)) for (const player of players.values()) { player.reset(); if (name === "subtitleTranslation") player.setEnabled(twpConfig.get(name) === "yes"); else player.update(); }
    if (name === "subtitleStyle") for (const player of players.values()) { player.settings = {...player.settings,...twpConfig.get("subtitleStyle")}; player.layout(); }
  });
  // aiProviderSettings is deliberately excluded from twpConfig (contains secrets).
  chrome.storage.onChanged.addListener(changes => { if (changes.aiProviderSettings) for (const player of players.values()) { player.reset(); player.update(); } });
  twpConfig.onReady(() => {
    ready = true; discover(); transcript();
    new MutationObserver(mutations => { if (mutations.every(m => m.target.closest?.("[data-obt-ui]")) || discoverTimer) return; discoverTimer = setTimeout(() => { discoverTimer = null; discover(); transcript(); },200); }).observe(document.body,{childList:true,subtree:true});
    if (youtube) window.postMessage({type:"obt-caption-request"},location.origin);
    if (course) setInterval(() => { if ([...players.values()].some(player => player.enabled)) window.postMessage({type:"obt-course-request"},location.origin); },2000);
    setInterval(report,10000);
  });
})();
