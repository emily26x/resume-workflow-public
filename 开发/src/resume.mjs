import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";

export const TEMPLATE_IDS = ["classic", "dual", "blue"];
export const TEMPLATE_NAMES = {
  classic: "经典黑白",
  dual: "灰白双栏",
  blue: "蓝灰单栏",
};

const VALID_STATUSES = new Set(["draft", "final", "archived", "incomplete", "status/draft", "status/final", "status/archived", "status/incomplete"]);
const DEFAULT_SIDEBAR = ["个人技能", "技能证书", "证书", "荣誉奖项", "自我评价", "兴趣爱好", "skills", "certifications", "honors", "awards"];

function scalar(value) {
  const text = value.trim();
  if (text === "true") return true;
  if (text === "false") return false;
  if (/^-?\d+(?:\.\d+)?$/.test(text)) return Number(text);
  if (text.startsWith("[") && text.endsWith("]")) {
    return text.slice(1, -1).split(",").map((item) => item.trim().replace(/^['"]|['"]$/g, "")).filter(Boolean);
  }
  return text.replace(/^['"]|['"]$/g, "");
}

export function parseFrontmatter(source) {
  const normalized = String(source).replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) throw new Error("resume.md 必须以 YAML frontmatter 开头");
  const end = normalized.indexOf("\n---\n", 4);
  if (end < 0) throw new Error("frontmatter 缺少结束分隔线");
  const meta = {};
  let activeList = null;
  for (const line of normalized.slice(4, end).split("\n")) {
    const item = line.match(/^\s+-\s+(.+)$/);
    if (item && activeList) {
      meta[activeList].push(scalar(item[1]));
      continue;
    }
    const field = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!field) continue;
    if (!field[2]) {
      meta[field[1]] = [];
      activeList = field[1];
    } else {
      meta[field[1]] = scalar(field[2]);
      activeList = null;
    }
  }
  return { meta, body: normalized.slice(end + 5).trim() };
}

function plain(value) {
  return String(value).replace(/\*\*([^*]+)\*\*/g, "$1").replace(/`([^`]+)`/g, "$1").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").trim();
}

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function inline(value) {
  let html = escapeHtml(String(value).trim());
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+|mailto:[^)]+|tel:[^)]+)\)/g, '<a href="$2">$1</a>');
  return html;
}

function splitEntryTitle(value) {
  const index = Math.max(value.lastIndexOf("｜"), value.lastIndexOf("|"));
  return index < 0 ? [value.trim(), ""] : [value.slice(0, index).trim(), value.slice(index + 1).trim()];
}

function contentId(parts) {
  return parts.join("-").replace(/[^a-zA-Z0-9_-]/g, "_");
}

export function parseResume(source, inputPath = "resume.md") {
  const { meta, body } = parseFrontmatter(source);
  const status = Array.isArray(meta.tags) ? meta.tags.find((tag) => String(tag).startsWith("status/")) : meta.status;
  const errors = [];
  if (!status || !VALID_STATUSES.has(String(status))) errors.push("frontmatter 必须包含有效的 status 或 status/* 标签");
  if (/\b(?:candidate|待核实|待确认)\b/i.test(body)) errors.push("简历正文包含未确认内容");
  if (/\b(?:statement_id|fact_id|application_id)\b/i.test(body)) errors.push("简历正文包含内部 ID");

  const lines = body.split("\n");
  const titleAt = lines.findIndex((line) => /^#\s+/.test(line.trim()));
  const firstSection = lines.findIndex((line) => /^##\s+/.test(line.trim()));
  if (titleAt < 0) errors.push("正文缺少姓名一级标题");
  if (firstSection < 0) errors.push("正文至少需要一个二级章节");
  if (errors.length) return { meta, body, errors };

  const name = lines[titleAt].trim().replace(/^#\s+/, "");
  const head = lines.slice(titleAt + 1, firstSection).map((line) => line.trim()).filter(Boolean);
  const contacts = head.filter((line) => line.startsWith(">")).map((line) => line.replace(/^>\s?/, ""));
  if (!contacts.length) errors.push("姓名下方至少需要一行以 > 开头的个人信息");
  const summary = head.filter((line) => !line.startsWith(">")).join(" ");
  const sections = [];
  let current = null;
  let entry = null;
  for (const raw of lines.slice(firstSection)) {
    const line = raw.trim();
    if (!line || line.startsWith("<!--")) continue;
    const sectionMatch = line.match(/^##\s+(.+)$/);
    if (sectionMatch) {
      current = { title: sectionMatch[1].trim(), blocks: [] };
      sections.push(current);
      entry = null;
      continue;
    }
    if (!current) continue;
    const entryMatch = line.match(/^###\s+(.+)$/);
    if (entryMatch) {
      const [title, date] = splitEntryTitle(entryMatch[1]);
      entry = { type: "entry", title, date, blocks: [] };
      current.blocks.push(entry);
      continue;
    }
    const listMatch = line.match(/^[-*]\s+(.+)$/);
    const block = listMatch ? { type: "item", text: listMatch[1] } : { type: "paragraph", text: line };
    (entry ? entry.blocks : current.blocks).push(block);
  }
  if (!sections.length) errors.push("没有可渲染章节");
  const sidebarNames = (Array.isArray(meta.sidebar_sections) ? meta.sidebar_sections : DEFAULT_SIDEBAR).map((name) => String(name).toLowerCase());
  for (const section of sections) section.sidebar = sidebarNames.includes(section.title.toLowerCase());
  return { meta, body, errors, inputPath, name, contact: contacts.join(" · "), summary, sections };
}

function editable(tag, id, html, className = "") {
  return `<${tag}${className ? ` class="${className}"` : ""} data-editable data-content-id="${id}">${html}</${tag}>`;
}

function renderBlocks(blocks, sectionIndex, entryIndex = null) {
  const output = [];
  let listOpen = false;
  const closeList = () => { if (listOpen) output.push("</ul>"); listOpen = false; };
  blocks.forEach((block, blockIndex) => {
    const base = entryIndex === null ? ["section", sectionIndex, "block", blockIndex] : ["section", sectionIndex, "entry", entryIndex, "block", blockIndex];
    if (block.type === "item") {
      if (!listOpen) { output.push("<ul>"); listOpen = true; }
      output.push(editable("li", contentId(base), inline(block.text)));
    } else {
      closeList();
      output.push(editable("p", contentId(base), inline(block.text)));
    }
  });
  closeList();
  return output.join("\n");
}

function renderSection(section, sectionIndex) {
  const body = [];
  let entryIndex = 0;
  let looseBlocks = [];
  const flushLoose = () => { if (looseBlocks.length) body.push(renderBlocks(looseBlocks.splice(0), sectionIndex)); };
  for (const block of section.blocks) {
    if (block.type !== "entry") { looseBlocks.push(block); continue; }
    flushLoose();
    const titleId = contentId(["section", sectionIndex, "entry", entryIndex, "title"]);
    const dateId = contentId(["section", sectionIndex, "entry", entryIndex, "date"]);
    body.push(`<article class="entry"><div class="entry-heading">${editable("h3", titleId, inline(block.title))}${block.date ? editable("span", dateId, inline(block.date), "entry-date") : ""}</div>${renderBlocks(block.blocks, sectionIndex, entryIndex)}</article>`);
    entryIndex += 1;
  }
  flushLoose();
  return `<section class="resume-section" data-section-title="${escapeHtml(section.title)}"><h2>${editable("span", contentId(["section", sectionIndex, "title"]), inline(section.title), "section-label")}</h2>${body.join("\n")}</section>`;
}

function photoData(meta, inputPath) {
  if (!meta.photo) return "";
  const path = resolve(dirname(inputPath), String(meta.photo));
  if (!existsSync(path)) throw new Error(`照片文件不存在：${path}`);
  const mime = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" }[extname(path).toLowerCase()];
  if (!mime) throw new Error("照片仅支持 JPG、PNG 或 WebP");
  return `data:${mime};base64,${readFileSync(path).toString("base64")}`;
}

export function renderResume(model, templateId = "classic") {
  if (model.errors?.length) throw new Error(model.errors.join("\n"));
  if (!TEMPLATE_IDS.includes(templateId)) throw new Error(`未知模板：${templateId}`);
  const photo = photoData(model.meta, model.inputPath);
  const portrait = photo ? `<img class="portrait" src="${photo}" alt="示例证件照">` : "";
  const header = `<header class="resume-header"><div class="identity">${editable("h1", "name", inline(model.name))}${model.meta.target_role ? editable("div", "target-role", inline(model.meta.target_role), "target-role") : ""}${editable("div", "contact", inline(model.contact), "contact")}${model.summary ? editable("p", "summary", inline(model.summary), "summary") : ""}</div>${portrait}</header>`;
  const rendered = model.sections.map((section, index) => ({ section, index, html: renderSection(section, index) }));
  let content;
  if (templateId === "dual") {
    const main = rendered.filter((item) => !item.section.sidebar).map((item) => item.html).join("\n");
    const side = rendered.filter((item) => item.section.sidebar).map((item) => item.html).join("\n");
    content = `<div id="resume-content" class="dual-grid"><main class="main-column">${main}</main><aside class="side-column">${side || '<p class="empty-side">技能、证书或荣誉会显示在这里</p>'}</aside></div>`;
  } else {
    content = `<main id="resume-content" class="single-column">${rendered.map((item) => item.html).join("\n")}</main>`;
  }
  const css = readFileSync(new URL("../templates/resume.css", import.meta.url), "utf8");
  return `<!doctype html><html lang="${escapeHtml(model.meta.language || "zh-CN")}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(plain(model.name))} - ${TEMPLATE_NAMES[templateId]}</title><style>${css}</style></head><body class="template-${templateId}${photo ? "" : " photo-hidden"}"><div class="resume-sheet">${header}${content}</div></body></html>`;
}

export function visibleText(model) {
  const values = [model.name, model.meta.target_role, model.contact, model.summary];
  for (const section of model.sections || []) {
    values.push(section.title);
    for (const block of section.blocks) {
      if (block.type === "entry") {
        values.push(block.title, block.date, ...block.blocks.map((item) => item.text));
      } else values.push(block.text);
    }
  }
  return values.filter(Boolean).map(plain);
}
