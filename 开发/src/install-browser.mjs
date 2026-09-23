import { spawnSync } from "node:child_process";
import { findBrowserExecutable } from "./delivery.mjs";

const existing = findBrowserExecutable();
if (existing) {
  process.stdout.write(`已找到可用浏览器：${existing}\n`);
  process.exit(0);
}

const command = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(command, ["playwright", "install", "chromium"], { stdio: "inherit" });
if (result.status !== 0) {
  throw new Error("Chromium 安装失败。也可以安装系统 Chrome 或 Edge，或通过 RESUME_BROWSER_PATH 指定浏览器路径");
}
process.stdout.write("Chromium 安装完成\n");
