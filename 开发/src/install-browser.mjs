import { spawnSync } from "node:child_process";
import { basename } from "node:path";
import { findBrowserExecutable } from "./delivery.mjs";

const existing = findBrowserExecutable();
if (existing) {
  process.stdout.write(`已找到可用浏览器，将直接复用：${existing}\n本次未下载 Playwright 浏览器。\n`);
  if (process.platform === "darwin" && basename(existing) === "Google Chrome") {
    process.stdout.write("在 WorkBuddy 中导出或运行浏览器测试时，系统 Chrome 的临时副本清理可能触发删除授权；请核对路径并逐次允许。\n");
  }
  process.exit(0);
}

const command = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(command, ["playwright", "install", "chromium"], { stdio: "inherit" });
if (result.status !== 0) {
  throw new Error("Chromium 安装失败。也可以安装系统 Chrome 或 Edge，或通过 RESUME_BROWSER_PATH 指定浏览器路径");
}
process.stdout.write("Chromium 安装完成\n");
