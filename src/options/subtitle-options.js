"use strict";
twpConfig.onReady(() => {
  const host = document.getElementById("subtitleAppearance");
  const defaults = {mode:"dual",order:"source-first",size:22,color:"#ffffff",opacity:.75,offset:12};
  const controls = new Map();
  const fields = [
    ["mode","显示模式",[["dual","原文 + 译文"],["translation","仅译文"]]],
    ["order","上下顺序",[["source-first","原文在上"],["translation-first","译文在上"]]],
    ["size","字号",[14,40,1]], ["opacity","背景不透明度",[0,1,.05]],
    ["offset","距底部 (%)",[3,60,1]], ["color","译文颜色","color"]
  ];
  for (const [key,title,values] of fields) {
    const row = document.createElement("div"); row.className = "setting-row";
    const label = document.createElement("label"); label.textContent = title; label.htmlFor = `subtitle-${key}`;
    const select = Array.isArray(values) && Array.isArray(values[0]);
    const input = document.createElement(select ? "select" : "input"); input.id = label.htmlFor;
    if (select) values.forEach(([value,text]) => input.add(new Option(text,value)));
    else if (values === "color") input.type = "color";
    else { input.type = "range"; [input.min,input.max,input.step] = values; }
    input.addEventListener(select ? "change" : "input",() => {
      const style = {...defaults,...twpConfig.get("subtitleStyle"),[key]:input.type === "range" ? Number(input.value) : input.value};
      twpConfig.set("subtitleStyle",style);
    });
    controls.set(key,input); row.append(label,input); host.appendChild(row);
  }
  const preview = document.createElement("div"); preview.className = "subtitle-preview"; preview.setAttribute("aria-label","字幕样式预览");
  const source = document.createElement("span"), translated = document.createElement("span"), lines = document.createElement("div");
  source.textContent = "A new way to read the world."; translated.textContent = "换一种方式，读懂世界。";
  lines.style.cssText = "display:inline-block;padding:4px 10px;border-radius:4px;max-width:100%";
  preview.appendChild(lines); host.appendChild(preview);
  function refresh() {
    const style = {...defaults,...twpConfig.get("subtitleStyle")};
    for (const [key,input] of controls) input.value = style[key];
    lines.style.fontSize = `${style.size}px`; lines.style.backgroundColor = `rgba(0,0,0,${style.opacity})`;
    source.style.cssText = "font-size:.85em;color:white"; source.hidden = style.mode === "translation";
    translated.style.color = style.color;
    lines.replaceChildren(...(style.order === "source-first" ? [source,translated] : [translated,source]));
  }
  twpConfig.onChanged(name => { if (name === "subtitleStyle") refresh(); }); refresh();
});
