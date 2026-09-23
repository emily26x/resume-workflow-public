import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { findBrowserExecutable, measure, validateMetrics } from "../src/delivery.mjs";

test("uses the full page boundary regardless of bottom padding", { skip: !findBrowserExecutable() }, async () => {
  const browser = await chromium.launch({ headless: true, executablePath: findBrowserExecutable() });
  try {
    const page = await browser.newPage();
    await page.setContent('<style>*{box-sizing:border-box}body{margin:0}.resume-sheet{position:relative;width:794px;height:1000px;padding-bottom:40px;overflow:hidden}.entry{position:absolute;top:0;width:100px}</style><div class="resume-sheet"><article class="entry"></article></div>');
    for (const height of [969, 1000, 1001]) {
      await page.locator(".entry").evaluate((node, value) => node.style.height = `${value}px`, height);
      const metrics = await measure(page);
      assert.equal(metrics.fillRatio, height / 1000);
      assert.equal(metrics.verticalOverflow, height > 1000);
      if (height <= 1000) assert.doesNotThrow(() => validateMetrics(metrics));
      else assert.throws(() => validateMetrics(metrics), /溢出/);
    }
    await page.locator(".entry").evaluate((node) => { node.style.height = "969px"; node.style.width = "800px"; });
    const horizontal = await measure(page);
    assert.throws(() => validateMetrics(horizontal), /溢出/);
  } finally { await browser.close(); }
});
