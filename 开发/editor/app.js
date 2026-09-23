import { measureDocument } from "./page-metrics.js";
(() => {
  "use strict";
  const fields = ["bodySize", "leading", "sectionGap", "entryGap"];
  const refs = Object.fromEntries(["saveState","previewFrame","pageStatus","templateList","switchMetric","resultCard","qaSummary","toast","setupDialog","setupTemplates","includePhotoInput","showCityInput","linkStyleInput","showPhotoToggle","photoHint"].map((id) => [id, document.getElementById(id)]));
  let configuration;
  let storageKey = "";
  let state = { template: "classic", edits: {}, typographyByTemplate: {}, manuallyAdjusted: {} };
  let lastRange = null;
  let toastTimer;
  const sessionToken = new URLSearchParams(window.location.search).get("token") || "";

  function securedPath(path) {
    const url = new URL(path, window.location.origin);
    url.searchParams.set("token", sessionToken);
    return `${url.pathname}${url.search}`;
  }

  async function api(path, options = {}) {
    const response = await fetch(path, { ...options, headers: { "content-type": "application/json", "x-resume-session": sessionToken, ...(options.headers || {}) } });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error || "操作失败");
    return value;
  }
  function toast(message, error = false) {
    clearTimeout(toastTimer); refs.toast.textContent = message; refs.toast.className = `toast show${error ? " error" : ""}`;
    toastTimer = setTimeout(() => { refs.toast.className = "toast"; }, 3000);
  }
  function save() { if (storageKey) sessionStorage.setItem(storageKey, JSON.stringify(state)); refs.saveState.textContent = "当前浏览器会话已保存"; }
  function currentTypography() { return state.typographyByTemplate[state.template]; }
  function syncControls() {
    const current = currentTypography();
    for (const field of fields) {
      const input = document.getElementById(`${field}Input`); input.value = current[field];
      document.getElementById(`${field}Output`).value = `${current[field]}${field === "bodySize" ? " pt" : ["sectionGap","entryGap"].includes(field) ? " mm" : ""}`;
    }
    document.querySelectorAll(".template-choice").forEach((button) => button.classList.toggle("active", button.dataset.template === state.template));
    refs.showPhotoToggle.checked = Boolean(configuration?.hasPhoto && state.showPhoto);
    refs.showPhotoToggle.disabled = !configuration?.hasPhoto;
    refs.photoHint.textContent = configuration?.hasPhoto ? "仅影响当前浏览器会话和本次导出。" : "源文件未配置证件照。";
  }
  function applyTypography() {
    const root = refs.previewFrame.contentDocument?.documentElement;
    if (!root) return;
    const value = currentTypography();
    root.style.setProperty("--body-size", `${value.bodySize}pt`); root.style.setProperty("--body-leading", value.leading);
    root.style.setProperty("--section-gap", `${value.sectionGap}mm`); root.style.setProperty("--entry-gap", `${value.entryGap}mm`);
    refs.previewFrame.contentDocument.body.classList.toggle("photo-hidden", !state.showPhoto);
  }
  function metrics() {
    const value = measureDocument(refs.previewFrame.contentDocument);
    return { fill: value.fillRatio, overflow: value.horizontalOverflow || value.verticalOverflow || value.clipped };
  }
  function updateStatus() {
    if (!refs.previewFrame.contentDocument?.querySelector(".resume-sheet")) return;
    const value = metrics(); const inTarget=value.fill>=.95&&value.fill<=.96; refs.pageStatus.className = `status ${value.overflow ? "failed" : inTarget ? "ok" : "warning"}`;
    refs.pageStatus.querySelector("span").textContent = value.overflow ? `页面存在溢出（占用 ${(value.fill*100).toFixed(1)}%）` : `页面占用率 ${(value.fill*100).toFixed(1)}%${inTarget?"，处于建议区间":"，建议 95%～96%"}`;
  }
  function sanitize(node, originalLinks) {
    const clone=node.cloneNode(true); const nodes=Array.from(clone.querySelectorAll("*")); let link=0;
    for(const element of nodes){const tag=element.tagName.toLowerCase();if(tag==="strong"||tag==="b"||(tag==="span"&&["bold","bolder","700","800","900"].includes(element.style.fontWeight))){if(tag!=="strong"){const strong=node.ownerDocument.createElement("strong");strong.append(...element.childNodes);element.replaceWith(strong);}else{for(const attr of Array.from(element.attributes))element.removeAttribute(attr.name);}}else if(tag==="a"){const href=originalLinks[link++];for(const attr of Array.from(element.attributes))element.removeAttribute(attr.name);if(href)element.setAttribute("href",href);}else element.replaceWith(...element.childNodes);}
    return clone.innerHTML;
  }
  function attachEditing() {
    const doc=refs.previewFrame.contentDocument;
    doc.querySelectorAll("[data-editable]").forEach((node)=>{const id=node.dataset.contentId;const originalLinks=Array.from(node.querySelectorAll("a")).map((a)=>a.href);if(Object.hasOwn(state.edits,id)){node.innerHTML=state.edits[id];state.edits[id]=sanitize(node,originalLinks);node.innerHTML=state.edits[id];}node.contentEditable="true";node.spellcheck=false;
      node.addEventListener("keydown",(event)=>{if(event.key==="Enter")event.preventDefault();});node.addEventListener("beforeinput",(event)=>{if(["insertParagraph","insertLineBreak"].includes(event.inputType))event.preventDefault();});node.addEventListener("paste",(event)=>{event.preventDefault();doc.execCommand("insertText",false,event.clipboardData.getData("text/plain").replace(/[\r\n]+/g," "));});
      node.addEventListener("input",()=>{state.edits[id]=sanitize(node,originalLinks);save();updateStatus();});node.addEventListener("mouseup",()=>{const s=refs.previewFrame.contentWindow.getSelection();if(s?.rangeCount)lastRange=s.getRangeAt(0).cloneRange();});
    });
    applyTypography(); updateStatus();
  }
  async function autoFit() {
    if(state.manuallyAdjusted[state.template])return;
    const value=currentTypography(); applyTypography();
    for(let step=0;step<18&&metrics().overflow;step+=1){value.bodySize=Math.max(8.8,Number((value.bodySize-.08).toFixed(2)));value.leading=Math.max(1.15,Number((value.leading-.012).toFixed(3)));value.sectionGap=Math.max(.8,Number((value.sectionGap-.1).toFixed(2)));value.entryGap=Math.max(.6,Number((value.entryGap-.08).toFixed(2)));applyTypography();}
    syncControls();save();updateStatus();
  }
  async function loadPreview(template, announce=true) {
    const started=performance.now(); state.template=template; syncControls(); refs.previewFrame.onload=async()=>{attachEditing();await autoFit();const elapsed=Math.round(performance.now()-started);refs.switchMetric.textContent=`本次切换与检查 ${elapsed} ms${elapsed>1000?"，已超过 1 秒目标":""}`;if(announce)toast(`已切换为 ${configuration.templates.find((item)=>item.id===template).name}`);};refs.previewFrame.src=securedPath(`/api/preview?template=${template}&t=${Date.now()}`);save();
  }
  function templateButtons(container, setup=false) {
    configuration.templates.forEach((template)=>{const button=document.createElement("button");button.type="button";button.dataset.template=template.id;button.className=setup?"setup-card":"template-choice";if(setup){button.style.setProperty("--preview",template.id==="classic"?"linear-gradient(#fff 0 22%,#111 22% 28%,#fff 28% 48%,#111 48% 54%,#fff 54%)":template.id==="dual"?"linear-gradient(90deg,#eee 0 36%,#fff 36%)":"radial-gradient(circle at 82% 30px,#fff 0 18px,#91a3bb 18px 22px,transparent 22px),linear-gradient(#dce2e9 0 48px,#fff 48px 68px,#91a3b8 68px 77px,#fff 77px)");button.innerHTML=`<span class="mock"></span><strong>${template.name}</strong><small>点击保存偏好并继续</small>`;button.addEventListener("click",()=>chooseDefault(template.id,true));}else{button.innerHTML=`<span>${template.name}</span>`;button.addEventListener("click",()=>loadPreview(template.id));}container.append(button);});
  }
  async function chooseDefault(template, fromSetup=false) { const payload=fromSetup?{defaultTemplate:template,includePhoto:refs.includePhotoInput.checked,showCity:refs.showCityInput.checked,linkStyle:refs.linkStyleInput.value}:{...configuration.preferences,defaultTemplate:template};configuration.preferences=await api("/api/preferences",{method:"POST",body:JSON.stringify(payload)});if(refs.setupDialog.open)refs.setupDialog.close();await loadPreview(template,false);toast("简历偏好已保存"); }
  function bold() {
    const doc = refs.previewFrame.contentDocument;
    const selection = doc.defaultView.getSelection();
    if ((!selection.rangeCount || selection.isCollapsed) && lastRange) {
      selection.removeAllRanges(); selection.addRange(lastRange);
    }
    if (!selection.rangeCount || selection.isCollapsed) return toast("请先在简历中选择文字", true);
    const range = selection.getRangeAt(0);
    const editable = (range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement).closest("[data-editable]");
    if (!editable || !editable.contains(range.endContainer)) return toast("请在同一段文字内选择", true);
    doc.execCommand("styleWithCSS", false, false);
    doc.execCommand("bold", false);
    // Bookmark both ends before replacing browser-specific bold wrappers.
    const current = selection.getRangeAt(0).cloneRange();
    const start = doc.createComment("selection-start");
    const end = doc.createComment("selection-end");
    const endRange = current.cloneRange(); endRange.collapse(false); endRange.insertNode(end);
    const startRange = current.cloneRange(); startRange.collapse(true); startRange.insertNode(start);
    for (const element of Array.from(editable.querySelectorAll("b,strong,span"))) {
      const isBold = element.tagName !== "SPAN" || ["bold", "bolder", "700", "800", "900"].includes(element.style.fontWeight);
      if (!isBold) continue;
      if (element.tagName !== "STRONG") {
        const strong = doc.createElement("strong");
        strong.append(...element.childNodes); element.replaceWith(strong);
      } else {
        for (const attr of Array.from(element.attributes)) element.removeAttribute(attr.name);
      }
    }
    const restored = doc.createRange(); restored.setStartAfter(start); restored.setEndBefore(end);
    selection.removeAllRanges(); selection.addRange(restored);
    start.remove(); end.remove();
    lastRange = selection.getRangeAt(0).cloneRange();
    editable.dispatchEvent(new Event("input"));
  }

  function busy(value,label="处理中") { document.querySelectorAll("button").forEach((button)=>button.disabled=value);refs.saveState.textContent=value?label:"当前浏览器会话已保存"; }
  async function exportCurrent(){try{if(metrics().overflow)throw new Error("当前模板存在溢出，请调整后再导出");busy(true,"正在生成 PDF 和图片");const result=await api("/api/export",{method:"POST",body:JSON.stringify(state)});refs.qaSummary.textContent=`A4 单页，占用率 ${(result.fillRatio*100).toFixed(1)}%。${result.warning||"内容检查通过。"}`;document.getElementById("pdfLink").href=result.files.pdf;document.getElementById("pngLink").href=result.files.png;refs.resultCard.hidden=false;toast("PDF 和 PNG 已生成");}catch(error){toast(error.message,true);}finally{busy(false);}}

  fields.forEach((field)=>document.getElementById(`${field}Input`).addEventListener("input",(event)=>{currentTypography()[field]=Number(event.target.value);state.manuallyAdjusted[state.template]=true;syncControls();applyTypography();updateStatus();save();}));
  document.getElementById("boldButton").addEventListener("mousedown",(event)=>event.preventDefault());document.getElementById("boldButton").addEventListener("click",bold);document.getElementById("exportButton").addEventListener("click",exportCurrent);
  document.getElementById("resetTypographyButton").addEventListener("click",()=>{const base=configuration.templates.find((item)=>item.id===state.template).typography;state.typographyByTemplate[state.template]={...base};state.manuallyAdjusted[state.template]=false;syncControls();applyTypography();autoFit();});
  document.getElementById("setDefaultButton").addEventListener("click",()=>chooseDefault(state.template));document.getElementById("skipSetup").addEventListener("click",(event)=>{event.preventDefault();refs.includePhotoInput.checked=false;refs.showCityInput.checked=false;refs.linkStyleInput.value="label";chooseDefault("classic",true);});
  refs.showPhotoToggle.addEventListener("change",(event)=>{state.showPhoto=Boolean(configuration.hasPhoto&&event.target.checked);syncControls();applyTypography();updateStatus();save();});

  api("/api/state").then((result)=>{configuration=result;refs.includePhotoInput.checked=result.preferences.includePhoto;refs.showCityInput.checked=result.preferences.showCity;refs.linkStyleInput.value=result.preferences.linkStyle;storageKey=`resume-editor:${result.sourceHash}`;const saved=sessionStorage.getItem(storageKey);state=saved?JSON.parse(saved):{template:result.preferences.defaultTemplate,edits:{},typographyByTemplate:{},manuallyAdjusted:{}};if(typeof state.showPhoto!=="boolean")state.showPhoto=Boolean(result.hasPhoto&&result.preferences.includePhoto);if(!result.hasPhoto)state.showPhoto=false;for(const template of result.templates)state.typographyByTemplate[template.id]??={...template.typography};templateButtons(refs.templateList);templateButtons(refs.setupTemplates,true);syncControls();loadPreview(state.template,false);if(!result.preferences.configured)refs.setupDialog.showModal();}).catch((error)=>toast(error.message,true));
})();
