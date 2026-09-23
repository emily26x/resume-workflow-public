import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "playwright";
import { findBrowserExecutable } from "../src/delivery.mjs";
import { startServer } from "../src/server.mjs";

test("checks short and long content after every template switch", { skip: !findBrowserExecutable(), timeout: 90_000 }, async () => {
  process.env.RESUME_WORKFLOW_CONFIG_DIR = mkdtempSync(join(tmpdir(), "resume-fit-test-"));
  const browser = await chromium.launch({ headless: true, executablePath: findBrowserExecutable() });
  try {
    for (const fixture of ["resume-short.md", "resume-long.md"]) {
      const { server, editorUrl } = await startServer({ inputPath: resolve(import.meta.dirname, `../../示例资料/排版案例/${fixture}`), port: 0 });
      try {
        const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
        await page.goto(editorUrl);
        if (await page.locator("#setupDialog").evaluate((dialog) => dialog.open)) await page.locator("#skipSetup").click();
        const statuses = [];
        for (const template of ["classic", "dual", "blue"]) {
          await page.locator(`.template-list [data-template="${template}"]`).click();
          await page.frameLocator("#previewFrame").locator(`body.template-${template}`).waitFor();
          const status = await page.locator("#pageStatus span").textContent();
          assert.match(status, /占用率|溢出/);
          statuses.push(`${template}: ${status}`);
        }
        process.stdout.write(`${fixture}｜${statuses.join("；")}\n`);
        if (fixture === "resume-short.md") assert.ok(statuses.every((status) => !status.includes("溢出")));
        await page.close();
      } finally {
        await new Promise((done) => server.close(done));
      }
    }
  } finally {
    await browser.close();
  }
});
