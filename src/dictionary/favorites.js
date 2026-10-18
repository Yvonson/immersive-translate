"use strict";
(() => {
  const $=id=>document.getElementById(id), {node,button,send,render}=dictionaryView;
  const api=(op,data={})=>send("dictionaryFavorites",{op,...data});
  const states={new:"未学习",learning:"学习中",mastered:"已掌握"};
  const date=(value,short=false)=>value?new Date(value).toLocaleString("zh-CN",short?{month:"2-digit",day:"2-digit"}:{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}):"尚未复习";
  let page=0,total=0,selected,dirty=false,busy=false,generation=0,detailGeneration=0,searchTimer,revisionTimer,review,transferring=false;
  function notice(message,error=false){$("notice").textContent=message;$("notice").classList.toggle("error",error);}
  function filters(){
    const value={search:$("search-words").value.trim(),state:$("filter-state").value,dateField:$("date-field").value,direction:$("sort-direction").value,domain:$("filter-domain").value,tags:[...$("tag-options").querySelectorAll(":checked")].map(input=>input.value)};
    const range=$("date-range").value;
    if(range!=="all"){
      let from,until;
      if(range==="custom"){
        if($("date-from").value)from=new Date($("date-from").value+"T00:00:00");
        if($("date-to").value){until=new Date($("date-to").value+"T00:00:00");until.setDate(until.getDate()+1);}
      }else{from=new Date();from.setHours(0,0,0,0);if(range!=="today")from.setDate(from.getDate()-(Number(range)-1));until=new Date();until.setHours(0,0,0,0);until.setDate(until.getDate()+1);}
      if(from)value.from=from.toISOString();if(until)value.until=until.toISOString();
      if(from && until && from>=until)throw new Error("开始日期不能晚于结束日期。");
    }
    return value;
  }
  async function meta(){
    const data=await api("meta");$("total-count").textContent=data.count.toLocaleString("zh-CN");
    const domain=$("filter-domain").value, tags=new Set([...$("tag-options").querySelectorAll(":checked")].map(input=>input.value));
    $("filter-domain").replaceChildren(new Option("全部来源",""),...data.domains.map(value=>new Option(value,value)));$("filter-domain").value=data.domains.includes(domain)?domain:"";
    $("tag-options").replaceChildren();for(const tag of data.tags){const label=node("label"),input=document.createElement("input");input.type="checkbox";input.value=tag;input.checked=tags.has(tag);input.addEventListener("change",changed);label.append(input,document.createTextNode(tag));$("tag-options").append(label);}
    if(!data.tags.length)$("tag-options").append(node("span","给收藏添加标签后，可在这里筛选。","help"));
    $("tag-count").textContent=tags.size?"· "+tags.size:"";
  }
  async function listing(reset=false){
    if(reset)page=0;
    const current=++generation;
    try{
      const data=await api("list",{filters:filters(),page});if(current!==generation)return;
      if(reset)notice("已应用筛选。收藏与学习记录保存在本机。");
      total=data.total;
      if(page>0 && page*50>=total){page=Math.max(0,Math.ceil(total/50)-1);return listing();}
      $("match-count").textContent=total.toLocaleString("zh-CN")+" 个匹配";$("word-list").replaceChildren();
      for(const item of data.items){
        const row=button("",()=>open(item.id),"word-row");row.dataset.wordId=item.id;row.setAttribute("aria-current",String(selected===item.id));
        const main=node("span"),right=node("span",undefined,"row-meta");main.append(node("span",item.word,"row-word"),node("span",item.meaning || "尚无释义，添加自己的解释","row-meaning"));
        const tags=node("span",undefined,"row-tags");for(const tag of item.tags.slice(0,4))tags.append(node("span",tag,"tag-pill"));main.append(tags);
        right.append(node("span",states[item.state],"state-pill "+item.state),node("div",date(item[$("date-field").value==="last"?"lastCollectedAt":"firstCollectedAt"],true)));row.append(main,right);$("word-list").append(row);
      }
      $("list-empty").hidden=!!data.items.length;$("page-info").textContent=`${page+1} / ${Math.max(1,Math.ceil(total/50))}`;$("prev-page").disabled=page===0;$("next-page").disabled=(page+1)*50>=total;
    }catch(error){if(current===generation)notice(error.message,true);}
  }
  function discard(){return !dirty || confirm("有尚未保存的笔记，放弃这些修改？");}
  async function open(id,force=false){
    if(!force && !discard())return;
    if(busy)return;
    const current=++detailGeneration;
    send("dictionaryCancel").catch(()=>{});
    try{const entry=await api("get",{wordId:id});if(current!==detailGeneration)return;selected=id;dirty=false;detail(entry);$("workspace").classList.add("show-detail");document.querySelectorAll(".word-row").forEach(row=>row.setAttribute("aria-current",String(row.dataset.wordId===id)));}
    catch(error){if(current===detailGeneration)notice(error.message,true);}
  }
  function contextCard(context){
    const card=node("div",undefined,"context-card");if(context.sentence)card.append(node("p",context.sentence));
    if(context.url){try{const url=new URL(context.url);if(!["http:","https:"].includes(url.protocol))throw new Error();const link=node("a",(context.title || url.hostname)+" ↗");link.href=url.href;link.target="_blank";link.rel="noopener noreferrer";card.append(link);}catch(_){}}
    else if(context.title)card.append(node("small",context.title));
    if(context.collectedAt)card.append(node("small","收藏于 "+date(context.collectedAt)));return card;
  }
  function detail(entry){
    const root=$("detail");root.replaceChildren();
    const top=node("div",undefined,"detail-top"),back=button("← 返回列表",()=>{if(!discard())return;dirty=false;$("workspace").classList.remove("show-detail");},"text-button detail-back");top.append(back,node("span","收藏时的词典快照"),button("查看当前词典解释 ↗",()=>send("dictionaryOpenDetails",{text:entry.word}),"text-button current-dictionary"));root.append(top);
    const snapshot=node("div",undefined,"saved-snapshot");render(snapshot,entry.snapshot,{details:true,favorite:false,lookup:text=>send("dictionaryOpenDetails",{text})});root.append(snapshot);
    if(entry.snapshot.truncated)root.append(node("p","这份快照保留了部分词条和解释；完整内容可查看当前词典。","help"));
    if(!entry.snapshot.entries.length)root.append(node("p","收藏时没有可用词库，仍可添加自己的释义；也可查看当前词典。","help"));
    root.append(node("p",`首次收藏 ${date(entry.firstCollectedAt)}　\n最近收藏 ${date(entry.lastCollectedAt)}　\n复习 ${entry.reviewCount} 次 · 最近复习 ${date(entry.lastReviewedAt)}`,"detail-dates pre-lines"));
    const editor=node("section",undefined,"detail-block");editor.append(node("h2","我的学习记录"));const fields=node("div",undefined,"learning-fields");
    function field(labelText,control,wide=false){const label=node("label",labelText,wide?"wide":"");label.append(control);fields.append(label);control.addEventListener("input",()=>{dirty=true;save.textContent="保存学习记录";save.disabled=false;});return control;}
    const state=document.createElement("select");state.id="learning-state";for(const [value,label] of Object.entries(states))state.add(new Option(label,value));state.value=entry.state;field("学习状态",state);
    const tags=node("input");tags.id="learning-tags";tags.value=entry.tags.join(", ");tags.maxLength=1228;tags.placeholder="例如：课程, 工作（逗号分隔）";field("标签",tags);
    const meaning=node("textarea");meaning.id="personal-meaning";meaning.value=entry.personalMeaning;meaning.maxLength=2000;field("用自己的话解释",meaning,true);
    const notes=node("textarea");notes.id="learning-notes";notes.value=entry.notes;notes.maxLength=10000;field("笔记 / 记忆方法",notes,true);editor.append(fields);
    const foot=node("div",undefined,"editor-footer"),feedback=node("span","编辑不会改变收藏时间。","muted");feedback.setAttribute("role","status");
    const save=button("保存学习记录",async()=>{
      save.disabled=true;busy=true;
      try{const updated=await api("update",{wordId:entry.id,changes:{state:state.value,tags:tags.value.split(/[,，]/).map(tag=>tag.trim()).filter(Boolean),personalMeaning:meaning.value,notes:notes.value}});dirty=false;feedback.textContent="已保存到本机";entry=updated;await meta();await listing();}
      catch(error){feedback.textContent=error.message;}
      finally{busy=false;save.disabled=false;}
    },"primary");foot.append(feedback,save);editor.append(foot);root.append(editor);
    const contexts=node("section",undefined,"detail-block");contexts.append(node("h2",`遇见这个词的地方 · ${entry.contexts.length}`));if(entry.contexts.length)for(const context of entry.contexts)contexts.append(contextCard(context));else contexts.append(node("p","这次收藏没有网页语境。下次从网页右键收藏，可追加原文。","help"));root.append(contexts);
    const remove=button("取消收藏",async()=>{
      if(!confirm(`取消收藏“${entry.word}”？释义快照、笔记和学习记录都会删除。建议先导出备份。`))return;
      remove.disabled=true;
      try{await api("remove",{wordId:entry.id});selected=null;dirty=false;root.replaceChildren(node("p","已取消收藏。","muted"));$("workspace").classList.remove("show-detail");await refresh();}
      catch(error){notice(error.message,true);remove.disabled=false;}
    },"danger-button");const footer=node("div",undefined,"detail-block");footer.append(remove);root.append(footer);
  }
  async function refresh(){try{await meta();await listing();}catch(error){notice(error.message,true);}}
  function changed(){if(review || transferring)return;$("custom-dates").hidden=$("date-range").value!=="custom";$("tag-count").textContent=$("tag-options").querySelectorAll(":checked").length?"· "+$("tag-options").querySelectorAll(":checked").length:"";listing(true);}
  for(const id of ["filter-state","date-field","sort-direction","date-range","date-from","date-to","filter-domain"])$(id).addEventListener("change",changed);
  $("search-words").addEventListener("input",()=>{clearTimeout(searchTimer);searchTimer=setTimeout(changed,220);});
  $("reset-filters").addEventListener("click",()=>{for(const id of ["search-words","filter-state","filter-domain","date-from","date-to"])$(id).value="";$("date-range").value="all";$("date-field").value="first";$("sort-direction").value="desc";$("tag-options").querySelectorAll("input").forEach(input=>input.checked=false);changed();});
  $("prev-page").addEventListener("click",()=>{page--;listing();});$("next-page").addEventListener("click",()=>{page++;listing();});

  function flip(){if(!review || review.flipped || review.busy || !review.entry)return;review.flipped=true;const entry=review.entry,root=$("review-card");root.replaceChildren();render(root,entry.snapshot,{details:false,favorite:false});if(entry.personalMeaning)root.append(node("h3","我的解释"),node("p",entry.personalMeaning));if(entry.notes)root.append(node("h3","学习笔记"),node("p",entry.notes,"pre-lines"));$("flip-card").hidden=true;$("ratings").hidden=false;$("ratings").querySelector("button").focus();}
  async function next(){
    send("dictionaryCancel").catch(()=>{});
    if(!review)return;review.busy=true;review.flipped=false;review.entry=null;$("ratings").hidden=true;$("flip-card").hidden=false;$("review-notice").textContent="";$("review-controls").hidden=true;$("review-card").replaceChildren(node("p","正在准备词卡……","muted"));
    while(review.index<review.ids.length){
      try{const entry=await api("get",{wordId:review.ids[review.index]});if(!review)return;review.entry=entry;break;}
      catch(error){if(!review)return;if(error.code==="FAVORITE_MISSING"){review.deleted++;review.index++;continue;}$("review-notice").textContent=error.message;$("review-card").append(button("重试加载",next));review.busy=false;return;}
    }
    if(review.index>=review.ids.length){summary();return;}
    const entry=review.entry,root=$("review-card");root.replaceChildren(node("p","先想想它的意思，再翻开解释。","review-instruction"),node("h1",entry.word,"review-word"));
    for(const context of entry.contexts.slice(0,1))root.append(contextCard(context));
    $("review-progress").textContent=`${review.index+1} / ${review.ids.length}`;$("review-controls").hidden=false;review.busy=false;$("flip-card").focus();
  }
  function summary(){
    const finished=review.unknown+review.familiar+review.mastered;$("review-progress").textContent="本次复习完成";$("review-controls").hidden=true;
    const root=$("review-card");root.replaceChildren(node("p",String(finished),"summary-number"),node("h2","个词，多熟悉了一点。"),node("p","每次评价已立即保存在本机。","muted"));
    const row=node("div",undefined,"review-summary");for(const [label,key] of [["不认识","unknown"],["有印象","familiar"],["已掌握","mastered"],["跳过","skipped"]])row.append(node("span",`${label} ${review[key]}`));root.append(row);if(review.deleted)root.append(node("p",`自动跳过 ${review.deleted} 个已删除的词。`,"help"));review.busy=false;review.entry=null;
  }
  async function rate(outcome){
    if(!review?.flipped || review.busy || !review.entry)return;
    review.busy=true;$("ratings").querySelectorAll("button").forEach(b=>b.disabled=true);
    try{await api("review",{wordId:review.entry.id,outcome});if(!review)return;review[outcome]++;review.index++;await next();}
    catch(error){if(review){if(error.code==="FAVORITE_MISSING"){review.deleted++;review.index++;await next();}else{$("review-notice").textContent=error.message;review.busy=false;}}}
    finally{$("ratings").querySelectorAll("button").forEach(b=>b.disabled=false);}
  }
  async function exitReview(){if(review?.busy)return;review=null;send("dictionaryCancel").catch(()=>{});$("review-dialog").close();await refresh();if(selected && !dirty)open(selected,true);}
  $("start-review").addEventListener("click",async()=>{
    if(!discard())return;dirty=false;
    try{const value=filters();value.excludeMastered=!$("include-mastered").checked;const data=await api("ids",{filters:value});if(!data.ids.length){notice("当前筛选没有可复习的词。可调整筛选或勾选包含已掌握。",true);return;}
      review={ids:data.ids,index:0,unknown:0,familiar:0,mastered:0,skipped:0,deleted:0};$("review-dialog").showModal();await next();
    }catch(error){notice(error.message,true);}
  });
  $("flip-card").addEventListener("click",flip);$("skip-card").addEventListener("click",()=>{if(!review || review.busy)return;review.skipped++;review.index++;next();});
  $("ratings").querySelectorAll("button").forEach(control=>control.addEventListener("click",()=>rate(control.dataset.outcome)));
  $("exit-review").addEventListener("click",exitReview);$("review-dialog").addEventListener("cancel",event=>{event.preventDefault();exitReview();});
  $("review-dialog").addEventListener("keydown",event=>{if(event.target.closest("input,textarea,select") || event.ctrlKey || event.altKey || event.metaKey)return;if(event.code==="Space"){event.preventDefault();if(!event.repeat)flip();}if(["1","2","3"].includes(event.key)){event.preventDefault();if(!event.repeat)rate({1:"unknown",2:"familiar",3:"mastered"}[event.key]);}});

  function transferBusy(value){transferring=value;$("export").disabled=value;$("import").disabled=value;$("start-review").disabled=value;}
  $("export").addEventListener("click",async()=>{
    transferBusy(true);notice("正在生成一致的本地备份……");
    try{const start=await api("exportStart"),parts=[];for(let index=0;index<start.chunks;index++){parts.push((await api("exportChunk",{token:start.token,index})).text);notice(`正在导出 ${index+1} / ${start.chunks}……`);}
      const blob=new Blob(parts,{type:"application/json;charset=utf-8"}),url=URL.createObjectURL(blob),link=node("a");link.href=url;link.download="open-bilingual-favorites-"+new Date().toISOString().slice(0,10)+".json";document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);notice("备份已生成。文件含你保存的原文语境与笔记，请妥善保管。");
    }catch(error){notice(error.message,true);}finally{transferBusy(false);}
  });
  $("import").addEventListener("click",()=>$("backup-file").click());
  $("backup-file").addEventListener("change",async()=>{
    const file=$("backup-file").files[0];$("backup-file").value="";if(!file)return;
    transferBusy(true);
    try{if(file.size>128*1024*1024)throw new Error("备份不能超过 128 MiB。");const raw=await file.text();let data;try{data=JSON.parse(raw);}catch(_){throw new Error("文件不是有效的 JSON。");}
      if(data?.format!=="open-bilingual-favorites" || data.schemaVersion!==1 || !Array.isArray(data.words))throw new Error("请选择生词本 JSON v1 备份。");
      if(!confirm(`导入 ${data.words.length} 条收藏？相同词会合并标签与语境，保留本机已有笔记、释义和复习进度。校验失败时原数据不变。`))return;
      const {token}=await api("importStart");
      // Small Unicode-safe slices stay below the 16 KiB native request limit.
      let index=0;for(let at=0;at<raw.length;){let end=Math.min(raw.length,at+2000);if(end<raw.length && /[\uD800-\uDBFF]/.test(raw[end-1]))end--;await api("importChunk",{token,index:index++,text:raw.slice(at,end)});at=end;if(index%20===0)notice(`正在传输备份 ${Math.round(at/raw.length*100)}%……`);}
      notice("正在校验并合并，暂勿关闭页面……");const result=await api("importCommit",{token});notice(`导入完成：新增 ${result.created} 个词，合并 ${result.merged} 个词。`);await refresh();
    }catch(error){notice(error.message,true);}finally{transferBusy(false);}
  });
  chrome.storage.onChanged.addListener(changes=>{if(!changes.dictionaryFavoritesRevision)return;clearTimeout(revisionTimer);revisionTimer=setTimeout(()=>{if(!review && !transferring)refresh();},120);});
  addEventListener("beforeunload",event=>{if(dirty || review?.busy || transferring){event.preventDefault();event.returnValue="";}});
  addEventListener("pagehide",()=>send("dictionaryCancel").catch(()=>{}));
  async function start(){try{await meta();await listing();notice("只在你点击收藏时保存；已有收藏不依赖词库继续可用。");if(/^[a-f0-9]{32}$/.test(location.hash.slice(1)))await open(location.hash.slice(1));}catch(error){notice(error.message,true);}}
  start();
})();
