import { copyFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { exportFiles, loadSource } from "../src/delivery.mjs";
import { TEMPLATE_IDS } from "../src/resume.mjs";

const root = resolve(import.meta.dirname, "../..");
const input = resolve(root, "示例资料/排版案例/resume-medium.md");
const output = resolve(root, "使用说明/images");
mkdirSync(output, { recursive: true });
const session = loadSource(input);
for (const template of TEMPLATE_IDS) {
  const result = await exportFiles(session, { template, edits: {}, typographyByTemplate: {} });
  copyFileSync(result.pngPath, resolve(output, `template-${template}.png`));
  process.stdout.write(`已生成 ${template} 模板预览\n`);
}
