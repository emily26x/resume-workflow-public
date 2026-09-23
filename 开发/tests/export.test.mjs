import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import sharp from "sharp";
import { exportFiles, findBrowserExecutable, loadSource } from "../src/delivery.mjs";
import { TEMPLATE_IDS } from "../src/resume.mjs";

test("exports one-page PDF and 2480 x 3508 PNG for every template", { skip: !findBrowserExecutable(), timeout: 120_000 }, async () => {
  const session = loadSource(resolve(import.meta.dirname, "../../示例资料/排版案例/resume-medium.md"));
  for (const template of TEMPLATE_IDS) {
    const result = await exportFiles(session, { template, edits: {}, typographyByTemplate: {} });
    assert.equal(result.pages, 1);
    const image = await sharp(result.pngPath).metadata();
    assert.equal(image.width, 2480);
    assert.equal(image.height, 3508);
  }
});
