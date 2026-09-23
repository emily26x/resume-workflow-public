import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { scanBuffer, scanContent } from "../scripts/privacy-check.mjs";

const root = resolve(import.meta.dirname, "../..");
const skills = ["resume-workflow", "resume-tailor", "job-greeting", "interview-introduction"];

function read(path) { return readFileSync(resolve(root, path), "utf8"); }
function readJson(path) { return JSON.parse(read(path)); }

test("ships four lowercase skills with mirrored Codex and Claude rules", () => {
  for (const skill of skills) {
    const agents = read(`.agents/skills/${skill}/SKILL.md`);
    const claude = read(`.claude/skills/${skill}/SKILL.md`);
    assert.equal(agents, claude, `${skill} has platform drift`);
    assert.match(agents, new RegExp(`^---\\nname: ${skill}\\n`));
    assert.match(agents, /description: .*时使用/);
    assert.match(agents, /compatibility: Codex, Claude Code, OpenCode/);
  }
});

test("routes every public job-seeking intent to one skill", () => {
  for (const entry of ["AGENTS.md", "CLAUDE.md"]) {
    const rules = read(entry);
    for (const skill of skills) assert.match(rules, new RegExp(`\\b${skill}\\b`));
  }
  assert.match(read(".agents/skills/job-greeting/SKILL.md"), /不超过 250/);
  assert.match(read(".agents/skills/interview-introduction/SKILL.md"), /约 2\.5 分钟/);
  assert.match(read(".agents/skills/resume-tailor/SKILL.md"), /固定保留 3 条/);
});

test("routes job-seeking skills through the full-fact workflow protocol", () => {
  for (const skill of ["resume-tailor", "job-greeting", "interview-introduction"]) {
    const content = read(`.agents/skills/${skill}/SKILL.md`);
    assert.match(content, /求职内容工作流协议\.md/);
    assert.match(content, /全部 confirmed 事实/);
  }

  const tailor = read(".agents/skills/resume-tailor/SKILL.md");
  assert.match(tailor, /每个章节内部.*时间倒序/s);
  assert.match(tailor, /不足 3 条 confirmed 事实.*停止生成/s);
  assert.match(tailor, /source_items/);
});

test("job greeting keeps the fixed structure and evidence-first selection rules", () => {
  const greeting = read(".agents/skills/job-greeting/SKILL.md");
  assert.match(greeting, /3～5 个核心要求/);
  assert.match(greeting, /全部 confirmed 事实/);
  assert.match(greeting, /尽量来自不同经历/);
  assert.match(greeting, /每个匹配点只讲一个子项目/);
  assert.match(greeting, /JD 能力标签＋动作＋结果或产出＋已有指标/);
  assert.match(greeting, /单位名称.*作为背书.*不能代替能力标签/s);
  assert.match(greeting, /您好！\[与岗位直接相关的背景或开场\]，希望有机会进一步沟通。/);
  assert.match(greeting, /1\. \*\*\[JD 能力标签\]\*\*/);
  assert.match(greeting, /只有两个真实匹配点时删去第 3 项/);
  assert.match(greeting, /不超过 250 个中文字符/);
});

test("job greeting rejects unconfirmed and misrepresented evidence", () => {
  const greeting = read(".agents/skills/job-greeting/SKILL.md");
  assert.match(greeting, /禁止使用 candidate、待确认或冲突事实/);
  assert.match(greeting, /禁止虚构经历、指标、工具、年限、单位、职位和任职性质/);
  assert.match(greeting, /个人、课程、开源等项目.*不能写成正式任职经历/s);
  assert.match(greeting, /指代不明确时.*标记待确认.*不猜测/s);
  assert.match(greeting, /硬性门槛缺口放在招呼语正文之外/);
  assert.match(greeting, /不得创建或更新/);
});

test("fictional job greeting evaluation follows the public output contract", () => {
  const evaluation = readJson("开发/evals/evals.json").skills.find(({ name }) => name === "job-greeting");
  const output = evaluation.reference_output;
  const points = output.match(/^\d+\. \*\*[^*]+\*\*：.+$/gm) ?? [];
  assert.match(output, /^您好！/);
  assert.match(output.split("\n\n", 1)[0], /希望有机会进一步沟通。$/);
  assert.ok(points.length >= 1 && points.length <= 3);
  assert.ok(Array.from(output).length <= 250, `reference greeting is ${Array.from(output).length} characters`);
  assert.doesNotMatch(output, /candidate|个人项目.*(?:任职|就职)/);
  assert.match(evaluation.outside_notice, /^硬性门槛提醒：/);
  assert.equal(output.includes(evaluation.outside_notice), false);
});

test("keeps conversation-only outputs and candidate facts outside deliverables", () => {
  assert.match(read(".agents/skills/job-greeting/SKILL.md"), /结果只在对话中返回/);
  assert.match(read(".agents/skills/interview-introduction/SKILL.md"), /结果只在对话中返回/);
  assert.match(read(".agents/skills/resume-tailor/SKILL.md"), /候选事实.*不得作为事实来源/);
  assert.match(read("使用说明/workflow.md"), /candidate、冲突项和待确认信息不能进入/);
});

test("contains no private repository paths or private company rules", () => {
  const publicText = ["AGENTS.md", "CLAUDE.md", "README.md", "使用说明/workflow.md", "使用说明/求职内容工作流协议.md", "使用说明/markdown-contract.md", ...skills.flatMap((skill) => [`.agents/skills/${skill}/SKILL.md`, `.claude/skills/${skill}/SKILL.md`])].map(read).join("\n");
  const forbidden = ["Ai" + "Note", "wang" + "dadou", "/" + "Users/", "wiki/6_" + "求职", "tools/" + "resume/", "log" + ".md", "字节" + "跳动", "饿了" + "么", "S" + "BI"];
  for (const value of forbidden) assert.equal(publicText.includes(value), false, `private marker found: ${value}`);
});

test("keeps every user's local resume data outside Git by default", () => {
  const privatePaths = [
    "原始材料/我的旧简历.pdf",
    "简历事实库/_index.md",
    "简历事实库/个人资料.md",
    "简历事实库/工作经历/真实公司.md",
    "岗位档案/_index.md",
    "岗位档案/2026/_index.md",
    "岗位档案/2026/2026-09-23-真实公司-真实岗位/resume.md",
    "岗位档案/2026/2026-09-23-真实公司-真实岗位/resume.html",
    "岗位档案/2026/2026-09-23-真实公司-真实岗位/resume.pdf",
    "岗位档案/2026/2026-09-23-真实公司-真实岗位/resume.png",
    ".resume-workflow/preferences.json",
  ];
  for (const path of privatePaths) {
    const result = spawnSync("git", ["check-ignore", "-q", path], { cwd: root });
    assert.equal(result.status, 0, `${path} must stay ignored`);
  }

  const publicPaths = [
    "原始材料/README.md",
    "简历事实库/README.md",
    "简历事实库/_index.example.md",
    "岗位档案/README.md",
    "岗位档案/_index.example.md",
    "示例资料/排版案例/resume-medium.md",
  ];
  for (const path of publicPaths) {
    const result = spawnSync("git", ["check-ignore", "-q", path], { cwd: root });
    assert.notEqual(result.status, 0, `${path} must remain publishable`);
  }
});

test("checks both tracked files and the staged snapshot before publishing", () => {
  const script = read("开发/scripts/privacy-check.mjs");
  assert.match(script, /\["ls-files"/);
  assert.match(script, /--cached/);
  assert.match(script, /\["show"/);
  assert.match(script, /isForbiddenPath/);
  assert.match(script, /非示例邮箱/);

  const result = spawnSync("node", ["开发/scripts/privacy-check.mjs"], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("blocks common privacy-check bypasses", () => {
  const phone = "+86" + "138" + "0000" + "0000";
  const noreply = "330016500+someone" + "@users.noreply.github.com";
  const identity = "110101 1990" + " 0101 123X";
  assert.match(scanContent("公开.md", phone, "测试").join("\n"), /手机号/);
  assert.match(scanContent("公开.md", noreply, "测试").join("\n"), /非示例邮箱/);
  assert.match(scanContent("公开.md", identity, "测试").join("\n"), /身份证号/);
  assert.match(scanBuffer("公开简历.pdf", Buffer.from("%PDF-1.7\0private"), "测试").join("\n"), /未知二进制文件/);
  assert.match(scanBuffer("示例资料/排版案例/assets/sample-photo.png", Buffer.from("changed\0"), "测试").join("\n"), /素材已变化/);
});

test("retires the direction layer from the public workflow", () => {
  const publicText = ["AGENTS.md", "CLAUDE.md", "README.md", "使用说明/workflow.md", "使用说明/求职内容工作流协议.md", "使用说明/markdown-contract.md", ...skills.flatMap((skill) => [`.agents/skills/${skill}/SKILL.md`, `.claude/skills/${skill}/SKILL.md`])].map(read).join("\n");
  const retiredMarkers = ["求职" + "方向", "方向" + "配方", "direction" + "_id", "preferred" + "_statements", "directions" + "/"];
  for (const value of retiredMarkers) {
    assert.equal(publicText.includes(value), false, `retired direction marker found: ${value}`);
  }
  assert.equal(existsSync(resolve(root, "求职" + "方向")), false);
  assert.equal(existsSync(resolve(root, "示例资料/完整工作流/" + "directions")), false);
});

test("canonical workflow example keeps three bullets per selected work entry", () => {
  const example = read("示例资料/完整工作流/applications/2026-09-19-虚假公司甲-产品运营/resume.md");
  const workSection = example.match(/## 工作经历\n([\s\S]*?)(?=\n## |$)/)?.[1] ?? "";
  const entries = workSection.split(/(?=^### )/m).filter((entry) => entry.startsWith("### "));
  assert.ok(entries.length > 0);
  for (const entry of entries) assert.equal(entry.match(/^- /gm)?.length ?? 0, 3);
  assert.match(example, /source_items:/);
});

test("documents OpenCode discovery without a third skill copy", () => {
  const readme = read("使用说明/安装与使用.md");
  assert.match(readme, /OpenCode.*\.agents\/skills/s);
  assert.match(readme, /不提供额外的 `\.opencode\/skills` 或 `opencode\.json`/);
});
