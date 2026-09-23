#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseResume } from "./resume.mjs";
import { startServer } from "./server.mjs";

const [command, ...tokens] = process.argv.slice(2);
function option(name, fallback = "") {
  const index = tokens.indexOf(`--${name}`);
  return index >= 0 ? tokens[index + 1] : fallback;
}
const input = option("input");
if (!input) throw new Error("缺少 --input <resume.md>");
if (command === "check") {
  const path = resolve(input);
  const parsed = parseResume(readFileSync(path, "utf8"), path);
  if (parsed.errors.length) throw new Error(parsed.errors.join("\n"));
  process.stdout.write(`检查通过：${path}\n章节数：${parsed.sections.length}\n`);
} else if (command === "editor") {
  await startServer({ inputPath: input, port: Number(option("port", "4277")) });
} else {
  throw new Error("用法：npm run check|editor -- --input <resume.md> [--port 4277]");
}
