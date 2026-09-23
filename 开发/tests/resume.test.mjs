import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { applyStateToHtml, normalizeTypography, readPreferences, savePreferences, validateMetrics } from "../src/delivery.mjs";
import { parseResume, renderResume, TEMPLATE_IDS } from "../src/resume.mjs";

const root = resolve(import.meta.dirname, "../..");
const sourcePath = resolve(root, "示例资料/排版案例/resume-medium.md");
const source = readFileSync(sourcePath, "utf8");
const photoPath = resolve(root, "示例资料/排版案例/assets/sample-photo.png");

function embeddedPhoto(html) {
  const encoded = html.match(/<img class="portrait" src="data:image\/png;base64,([^"]+)"/)?.[1];
  assert.ok(encoded, "HTML must contain the PNG portrait");
  return Buffer.from(encoded, "base64");
}

function filesNamed(directory, name) {
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name === name)
    .map((entry) => resolve(entry.parentPath, entry.name));
}

test("accepts flexible sections and variable bullet counts", () => {
  const parsed = parseResume(source, sourcePath);
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(parsed.sections.map((section) => section.title), ["教育背景", "工作经历", "项目经历", "荣誉奖项", "个人技能"]);
  assert.equal(parsed.sections.at(-1).sidebar, true);
});

test("renders all templates with stable content ids", () => {
  const parsed = parseResume(source, sourcePath);
  const ids = TEMPLATE_IDS.map((template) => Array.from(renderResume(parsed, template).matchAll(/data-content-id="([^"]+)"/g), (match) => match[1]).sort());
  assert.deepEqual(ids[1], ids[0]);
  assert.deepEqual(ids[2], ids[0]);
  assert.ok(ids[0].includes("name"));
});

test("uses the current licensed portrait in editor previews and example HTML", () => {
  const expected = readFileSync(photoPath);
  const parsed = parseResume(source, sourcePath);
  for (const template of TEMPLATE_IDS) assert.deepEqual(embeddedPhoto(renderResume(parsed, template)), expected);

  const applications = resolve(root, "示例资料/完整工作流/applications");
  const htmlFiles = filesNamed(applications, "resume.html");
  assert.ok(htmlFiles.length > 0);
  for (const path of htmlFiles) assert.deepEqual(embeddedPhoto(readFileSync(path, "utf8")), expected, `${path} has a stale portrait`);
});

test("uses a uniform light blue header and dark blue portrait ring", () => {
  const parsed = parseResume(source, sourcePath);
  const blue = renderResume(parsed, "blue");
  assert.match(blue, /\.template-blue \.resume-header \{[^}]*background: #dce2e9;/);
  assert.doesNotMatch(blue, /\.template-blue \.resume-header::after/);
  assert.match(blue, /\.template-blue \.portrait \{[^}]*border: 1mm solid #91a3bb;/);

  const withoutPhoto = parseResume(source.replace(/^photo:.*\n/m, ""), sourcePath);
  assert.doesNotMatch(renderResume(withoutPhoto, "blue"), /<img class="portrait"/);
});

test("applies the same content edit to every template", () => {
  const parsed = parseResume(source, sourcePath);
  for (const template of TEMPLATE_IDS) {
    const html = applyStateToHtml(renderResume(parsed, template), { edits: { name: "林知夏（示例）" }, typographyByTemplate: {} }, template);
    assert.match(html, /林知夏（示例）/);
  }
});

test("applies current-session photo visibility to preview exports", () => {
  const parsed = parseResume(source, sourcePath);
  const rendered = renderResume(parsed, "dual");
  assert.match(applyStateToHtml(rendered, { showPhoto: false }, "dual"), /<body class="template-dual photo-hidden">/);
  assert.match(applyStateToHtml(rendered, { showPhoto: true }, "dual"), /<body class="template-dual">/);
  assert.match(applyStateToHtml(rendered, {}, "dual"), /<body class="template-dual">/);
});

test("uses the body-size variable for entry titles and dates", () => {
  const parsed = parseResume(source, sourcePath);
  const html = renderResume(parsed, "classic");
  assert.match(html, /\.entry-heading h3 \{[^}]*font-size: var\(--body-size\);/);
  assert.match(html, /\.entry-date \{[^}]*font-size: var\(--body-size\);/);
});

test("keeps independent typography within readable bounds", () => {
  assert.deepEqual(normalizeTypography("classic", { bodySize: 7, leading: 0 }), { bodySize: 8.8, leading: 1.15, sectionGap: 3.1, entryGap: 2.2 });
  assert.notDeepEqual(normalizeTypography("dual"), normalizeTypography("classic"));
});

test("uses privacy-first defaults and persists explicit preferences", () => {
  process.env.RESUME_WORKFLOW_CONFIG_DIR = mkdtempSync(join(tmpdir(), "resume-preferences-test-"));
  const preferences = readPreferences();
  assert.deepEqual(preferences, { configured: false, defaultTemplate: "classic", includePhoto: false, showCity: false, linkStyle: "label" });
  assert.deepEqual(savePreferences({ defaultTemplate: "blue", includePhoto: true, showCity: true, linkStyle: "url" }), { configured: true, defaultTemplate: "blue", includePhoto: true, showCity: true, linkStyle: "url" });
  assert.deepEqual(readPreferences(), { configured: true, defaultTemplate: "blue", includePhoto: true, showCity: true, linkStyle: "url" });
});

test("treats 95% to 96% fill as advisory target and overflow as hard error", () => {
  assert.equal(validateMetrics({ fillRatio: 0.955, horizontalOverflow: false, verticalOverflow: false, clipped: false }).warning, "");
  assert.match(validateMetrics({ fillRatio: 0.8, horizontalOverflow: false, verticalOverflow: false, clipped: false }).warning, /95%～96%/);
  assert.throws(() => validateMetrics({ fillRatio: 0.955, horizontalOverflow: false, verticalOverflow: true, clipped: false }), /溢出/);
});

test("rejects candidate content", () => {
  const parsed = parseResume(source.replace("具备用户运营", "candidate 具备用户运营"), sourcePath);
  assert.match(parsed.errors.join("\n"), /未确认/);
});
