import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "../..");

const publicPrivatePathExceptions = new Set([
  "原始材料/README.md",
  "简历事实库/README.md",
  "简历事实库/_index.example.md",
  "岗位档案/README.md",
  "岗位档案/_index.example.md",
]);

const privateRoots = ["原始材料/", "简历事实库/", "岗位档案/", ".resume-workflow/"];

const allowedEmails = new Set([
  "lin.zhixia@example.com",
  "lin.zhixia.long@example.com",
]);

const allowedBinaryAssets = new Map([
  ["示例资料/排版案例/assets/sample-photo.png", "9f6370106d3b168a7bc0078119b8e02160c4dea8063e20b92632ade15e392a36"],
  ["使用说明/images/template-classic.png", "e637061da70e68cc5dea966ab67bcf982ca99e39222b7af433d91db7bef13a82"],
  ["使用说明/images/template-dual.png", "27ec3776ceee550c8852ba635fd66bfa0bfbdff9252a705588634509adf82395"],
  ["使用说明/images/template-blue.png", "1f00b6e8c07f1ac6d522349348f0851972ebfe1107f7de6f9adaf444f69c31a0"],
]);

const binaryExtension = /\.(?:avif|docx?|gif|heic|jpe?g|pdf|png|pptx?|webp|xlsx?|zip)$/i;

const contentRules = [
  { label: "本机绝对路径", pattern: /(?:\/Users\/[^/\s]+\/|[A-Za-z]:\\Users\\[^\\\s]+\\)/g },
  { label: "中国大陆身份证号", pattern: /(?<!\d)\d(?:[ -]?\d){16}[ -]?[\dXx](?!\d)/g },
  { label: "未遮盖的中国大陆手机号", pattern: /(?<!\d)(?:\+?86[ -]?)?1[3-9]\d(?:[ -]?\d){8}(?!\d)/g },
  { label: "私钥", pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g },
  { label: "常见访问密钥", pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16})\b/g },
];

function runGit(args, options = {}) {
  const result = spawnSync("git", args, {
    cwd: root,
    maxBuffer: 64 * 1024 * 1024,
    ...(options.binary ? {} : { encoding: "utf8" }),
  });
  if (result.status !== 0) {
    const detail = String(result.error?.message || result.stderr || result.stdout || "Git 命令失败").trim();
    throw new Error(detail);
  }
  return result.stdout;
}

function splitNull(value) {
  return value.split("\0").filter(Boolean);
}

function trackedFiles() {
  return splitNull(runGit(["ls-files", "-z"]));
}

function stagedFiles() {
  return splitNull(runGit(["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"]));
}

export function isForbiddenPath(path) {
  if (path === "求职方向" || path.startsWith("求职方向/")) return true;
  return privateRoots.some((prefix) => path.startsWith(prefix)) && !publicPrivatePathExceptions.has(path);
}

export function scanContent(path, text, source) {
  const findings = [];
  const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
  for (const match of text.matchAll(emailPattern)) {
    const email = match[0].toLowerCase();
    if (!allowedEmails.has(email)) {
      findings.push(`${source}: ${path}：发现非示例邮箱 ${match[0]}`);
    }
  }
  for (const { label, pattern } of contentRules) {
    pattern.lastIndex = 0;
    const match = pattern.exec(text);
    if (match) findings.push(`${source}: ${path}：发现${label} ${match[0]}`);
  }
  return findings;
}

export function scanBuffer(path, buffer, source) {
  const isBinary = binaryExtension.test(path) || buffer.includes(0);
  if (!isBinary) return scanContent(path, buffer.toString("utf8"), source);
  const expectedHash = allowedBinaryAssets.get(path);
  if (!expectedHash) return [`${source}: ${path}：未知二进制文件不得提交，需人工复核并加入白名单`];
  const actualHash = createHash("sha256").update(buffer).digest("hex");
  if (actualHash !== expectedHash) return [`${source}: ${path}：公开二进制素材已变化，需重新检查内容与元数据`];
  return [];
}

function scanSnapshot(label, files, read) {
  const findings = [];
  for (const path of files) {
    if (isForbiddenPath(path)) findings.push(`${label}: ${path}：私有或已停用路径不得提交`);
    let buffer;
    try {
      buffer = read(path);
    } catch (error) {
      findings.push(`${label}: ${path}：无法读取（${error.message}）`);
      continue;
    }
    findings.push(...scanBuffer(path, buffer, label));
  }
  return findings;
}

function main() {
  const tracked = trackedFiles();
  const staged = stagedFiles();
  const findings = [
    ...scanSnapshot("已跟踪文件", tracked, (path) => readFileSync(resolve(root, path))),
    ...scanSnapshot("暂存区", staged, (path) => runGit(["show", `:${path}`], { binary: true })),
  ];

  if (findings.length > 0) {
    console.error("隐私检查未通过：");
    for (const finding of findings) console.error(`- ${finding}`);
    process.exitCode = 1;
  } else {
    console.log(`隐私检查通过：已跟踪文件 ${tracked.length} 个，暂存区文件 ${staged.length} 个。`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
