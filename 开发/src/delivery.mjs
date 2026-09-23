import { measureDocument } from "../editor/page-metrics.js";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import sharp from "sharp";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { parseResume, renderResume, TEMPLATE_IDS } from "./resume.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const DEFAULT_TEMPLATE = "classic";
export const DEFAULT_PREFERENCES = { defaultTemplate: DEFAULT_TEMPLATE, includePhoto: false, showCity: false, linkStyle: "label" };
export const TYPOGRAPHY = {
  classic: { bodySize: 9.35, leading: 1.42, sectionGap: 3.1, entryGap: 2.2 },
  dual: { bodySize: 8.8, leading: 1.38, sectionGap: 3.0, entryGap: 1.9 },
  blue: { bodySize: 9.1, leading: 1.4, sectionGap: 2.8, entryGap: 2.0 },
};
const LIMITS = { bodySize: [8.8, 12], leading: [1.15, 1.9], sectionGap: [0.8, 7], entryGap: [0.6, 5] };

export function findBrowserExecutable() {
  const bundled = chromium.executablePath();
  const candidates = [
    process.env.RESUME_BROWSER_PATH,
    process.env.CHROME_PATH,
    existsSync(bundled) ? bundled : "",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    process.env.PROGRAMFILES && join(process.env.PROGRAMFILES, "Google", "Chrome", "Application", "chrome.exe"),
    process.env["PROGRAMFILES(X86)"] && join(process.env["PROGRAMFILES(X86)"], "Microsoft", "Edge", "Application", "msedge.exe"),
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"),
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate)) || "";
}

export function hash(value) { return createHash("sha256").update(value).digest("hex"); }

export function preferencesPath() { return join(process.env.RESUME_WORKFLOW_CONFIG_DIR || join(ROOT, ".resume-workflow"), "preferences.json"); }

export function readPreferences() {
  const path = preferencesPath();
  if (!existsSync(path)) return { configured: false, ...DEFAULT_PREFERENCES };
  try {
    const value = JSON.parse(readFileSync(path, "utf8"));
    return {
      configured: true,
      defaultTemplate: TEMPLATE_IDS.includes(value.defaultTemplate) ? value.defaultTemplate : DEFAULT_TEMPLATE,
      includePhoto: value.includePhoto === true,
      showCity: value.showCity === true,
      linkStyle: value.linkStyle === "url" ? "url" : "label",
    };
  } catch {
    return { configured: false, ...DEFAULT_PREFERENCES };
  }
}

export function savePreferences(incoming = {}) {
  const preferences = {
    defaultTemplate: incoming.defaultTemplate,
    includePhoto: incoming.includePhoto === true,
    showCity: incoming.showCity === true,
    linkStyle: incoming.linkStyle === "url" ? "url" : "label",
  };
  if (!TEMPLATE_IDS.includes(preferences.defaultTemplate)) throw new Error("未知模板");
  const path = preferencesPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(preferences, null, 2)}\n`, "utf8");
  return { configured: true, ...preferences };
}

export function loadSource(inputPath) {
  const sourcePath = resolve(inputPath);
  const markdown = readFileSync(sourcePath, "utf8");
  const model = parseResume(markdown, sourcePath);
  if (model.errors.length) throw new Error(model.errors.join("\n"));
  const status = Array.isArray(model.meta.tags) ? model.meta.tags.find((tag) => String(tag).startsWith("status/")) : model.meta.status;
  if (!["final", "status/final"].includes(String(status))) throw new Error("只有用户确认并标记为 final 的 resume.md 才能进入编辑器");
  return { sourcePath, sourceHash: hash(markdown), markdown, model };
}

export function normalizeTypography(template, incoming = {}) {
  const fallback = TYPOGRAPHY[template] || TYPOGRAPHY.classic;
  return Object.fromEntries(Object.entries(fallback).map(([key, initial]) => {
    const value = Number(incoming[key]);
    const [min, max] = LIMITS[key];
    return [key, Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : initial];
  }));
}

export function applyStateToHtml(html, state, template) {
  const typography = normalizeTypography(template, state.typographyByTemplate?.[template] || state.typography);
  const edits = state.edits && typeof state.edits === "object" ? state.edits : {};
  const withEdits = html.replace(/(<([a-z0-9]+)\b[^>]*data-content-id="([^"]+)"[^>]*>)([\s\S]*?)(<\/\2>)/gi, (match, open, tag, id, original, close) => {
    const incoming = edits[id];
    if (typeof incoming !== "string") return match;
    if (incoming.length > 20_000 || /<\/?(?!strong\b|a\b)[a-z][^>]*>/i.test(incoming) || /\son\w+\s*=|javascript:/i.test(incoming)) throw new Error("文字修改包含不安全内容");
    const links = (value) => Array.from(value.matchAll(/<a\b[^>]*href="([^"]+)"/gi), (item) => item[1]);
    if (JSON.stringify(links(original)) !== JSON.stringify(links(incoming))) throw new Error("不能修改链接地址");
    return `${open}${incoming}${close}`;
  });
  const withPhotoState = state.showPhoto === false ? withEdits.replace(/<body class="([^"]*)"/, '<body class="$1 photo-hidden"') : withEdits;
  const css = `:root{--body-size:${typography.bodySize}pt;--body-leading:${typography.leading};--section-gap:${typography.sectionGap}mm;--entry-gap:${typography.entryGap}mm}`;
  return withPhotoState.replace("</head>", `<style id="typography">${css}</style></head>`);
}

export async function measure(page) {
  return page.evaluate(measureDocument);
}

export function validateMetrics(metrics) {
  if (metrics.horizontalOverflow || metrics.verticalOverflow || metrics.clipped) throw new Error("页面存在裁切或内容溢出，请调整排版或切换模板后再导出");
  const inTarget = metrics.fillRatio >= 0.95 && metrics.fillRatio <= 0.96;
  return { fillRatio: metrics.fillRatio, warning: inTarget ? "" : `页面占用率 ${(metrics.fillRatio * 100).toFixed(1)}%，建议区间为 95%～96%` };
}

async function pdfText(pdfPath) {
  const data = new Uint8Array(readFileSync(pdfPath));
  const document = await getDocument({ data, useSystemFonts: true }).promise;
  const pages = [];
  for (let index = 1; index <= document.numPages; index += 1) {
    const page = await document.getPage(index);
    const text = await page.getTextContent();
    pages.push(text.items.map((item) => item.str).join(" "));
  }
  return { pages: document.numPages, text: pages.join("\n") };
}

function compact(value) { return String(value).normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, "").toLowerCase(); }

// Some macOS Chinese fonts encode 口 in 口径 as the Kangxi radical ⼜.
// Correct only this observed context; never equate ordinary 又 with 口.
export function missingPdfText(expected, extracted) {
  const corrected = String(extracted).replace(/\u2f1c(?=\s*径)/gu, "口");
  const actual = compact(corrected);
  return expected.filter((item) => compact(item).length >= 2 && !actual.includes(compact(item)));
}

function expectedHtmlText(html) {
  const decode = (value) => value.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
  return Array.from(html.matchAll(/<([a-z0-9]+)\b[^>]*data-editable\b[^>]*>([\s\S]*?)<\/\1>/gi), (match) => decode(match[2])).filter(Boolean);
}

export async function exportFiles(session, state) {
  if (hash(readFileSync(session.sourcePath, "utf8")) !== session.sourceHash) throw new Error("resume.md 已变化，请重新启动编辑器");
  const template = TEMPLATE_IDS.includes(state.template) ? state.template : DEFAULT_TEMPLATE;
  const sourceHtml = renderResume(session.model, template);
  const html = applyStateToHtml(sourceHtml, state, template);
  const outputDir = dirname(session.sourcePath);
  const pdfPath = join(outputDir, "resume.pdf");
  const pngPath = join(outputDir, "resume.png");
  let browser;
  try {
    const executablePath = findBrowserExecutable();
    if (!executablePath) throw new Error("未找到 Chromium、Chrome 或 Edge。请运行 npm run install-browser，或设置 RESUME_BROWSER_PATH");
    browser = await chromium.launch({ headless: true, executablePath });
    const page = await browser.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluate(() => document.fonts?.ready);
    const metrics = await measure(page);
    const result = validateMetrics(metrics);
    await page.pdf({ path: pdfPath, format: "A4", printBackground: true, preferCSSPageSize: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
    const rawPng = await page.locator(".resume-sheet").screenshot({ type: "png" });
    await sharp(rawPng).resize(2480, 3508, { fit: "fill" }).png().toFile(pngPath);
    const extracted = await pdfText(pdfPath);
    if (extracted.pages !== 1) throw new Error(`PDF 必须为 1 页，当前为 ${extracted.pages} 页`);
    const missing = missingPdfText(expectedHtmlText(html), extracted.text);
    if (missing.length) throw new Error(`PDF 内容不完整，缺少：${missing.slice(0, 3).join("；")}`);
    return { pdfPath, pngPath, pages: 1, fillRatio: result.fillRatio, warning: result.warning };
  } finally {
    await browser?.close();
  }
}
