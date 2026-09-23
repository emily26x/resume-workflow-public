import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const executable = process.env.OPENCODE_BIN || "opencode";
const root = resolve(import.meta.dirname, "../..");
if (!existsSync(resolve(root, "AGENTS.md"))) throw new Error("缺少项目根目录 AGENTS.md");

const result = spawnSync(executable, ["debug", "config"], { cwd: root, encoding: "utf8", maxBuffer: 5_000_000 });
if (result.error?.code === "ENOENT") {
  process.stdout.write("未安装 OpenCode，跳过实际发现测试。\n");
  process.exit(0);
}
if (result.status !== 0) throw new Error(result.stderr || `OpenCode 退出码 ${result.status}`);

for (const name of ["resume-workflow", "resume-tailor", "job-greeting", "interview-introduction"]) {
  if (!result.stdout.includes(name)) throw new Error(`OpenCode 未发现 ${name}`);
}
process.stdout.write("OpenCode 已发现 AGENTS.md 项目及四个 Skill。\n");
