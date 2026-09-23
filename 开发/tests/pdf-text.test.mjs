import test from "node:test";
import assert from "node:assert/strict";
import { missingPdfText } from "../src/delivery.mjs";

const cases = [
  ["ordinary Chinese text", "记录数据口径、异常原因和行动建议。", "记录数据口径、异常原因和行动建议。", false],
  ["observed font radical mapping", "负责数据清洗及口径文档", "负责数据清洗及⼜径文档", false],
  ["separate bold text runs and line wraps", "连续16周更新漏斗看板，并记录数据口径", "连续 16 周 更新漏⽃看板，\n并记录数据⼜ \n径", false],
  ["mixed Latin and full-width numbers", "使用 Excel 和 SQL，定义10项指标及口径", "使用 Excel 和 SQL，定义１０项指标及⼜径", false],
  ["ordinary 又 and radical 又 remain distinct", "又一次更新口径", "⼜一次更新⼜径", false],
  ["genuinely missing or altered text", "记录数据口径及异常原因", "记录数据⼜径", true],
];
for (const [name, expected, actual, missing] of cases) {
  test(name, () => assert.equal(missingPdfText([expected], actual).length > 0, missing));
}
test("does not silently accept ordinary 又径 or missing 口", () => {
  assert.deepEqual(missingPdfText(["数据口径"], "数据又径"), ["数据口径"]);
  assert.deepEqual(missingPdfText(["数据口径"], "数据径"), ["数据口径"]);
});
