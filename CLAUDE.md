# CLAUDE.md

本仓库是一套事实优先的简历工作流，支持 Codex、Claude Code、OpenCode 和 WorkBuddy。开始任务前先读 `使用说明/workflow.md`。本人资料存在时再读 Git 忽略的 `简历事实库/_index.md`；文件不存在时读取公开模板 `简历事实库/_index.example.md`，并在首次建库时创建本地 `_index.md`。随后读取任务实际需要的事实正文。

## Skill 触发

| 用户意图 | Skill |
|---|---|
| 导入旧简历、建事实库、确认事实、设置偏好、打开编辑器、切换模板、导出 PDF/PNG | `resume-workflow` |
| 根据 JD 修改或生成 `resume.md`、分析岗位匹配 | `resume-tailor` |
| 求职打招呼、联系 HR、招聘平台开场白 | `job-greeting` |
| 面试自我介绍、面试开场 | `interview-introduction` |

用户的完整请求跨越多个阶段时，按阶段依次使用对应 Skill。OpenCode 从 `.agents/skills/` 读取这四个 Skill；Claude Code 使用 `.claude/skills/`；WorkBuddy 从 `.codebuddy/skills/` 读取对应入口，并按入口读取 `.agents/skills/` 的完整指令。

## 公共规则

- 原始材料放在 `原始材料/`；原件不可修改或删除。
- 从旧简历提取的内容先标记为 `candidate`，本人确认后才改为 `confirmed`。
- 新输出只可使用 `confirmed` 事实，不虚构指标、结果、职位、任职性质或技能。
- 求职内容按 `使用说明/求职内容工作流协议.md` 直接匹配全部 confirmed 事实，不设置方向筛选层。
- JD 只影响选材和表达，不反向改写事实库。
- 生成岗位简历前确认公司和岗位，正式档案按 `使用说明/workflow.md` 保存到 `岗位档案/YYYY/YYYY-MM-DD-公司名称-岗位名称/`，日期取首次生成当天的本地日期。
- 定制简历先保存为 `draft`；用户确认后才改为 `final` 并打开编辑器。
- 全职（`employment_type: full-time`）在投递简历的经历标题中只显示真实职位，不添加“（全职）”；实习、兼职、合同制、志愿者等其他任职性质仍明确标注。事实库继续保留完整的任职性质字段。
- HTML 编辑不回写 Markdown 或事实库；模板只影响视觉呈现。
- `原始材料/`、`简历事实库/`、`岗位档案/`、`.resume-workflow/`、`.workbuddy/` 及其中所有本地索引和导出文件属于使用者私有数据，必须保持 Git 忽略。不得使用 `git add -f` 强制加入，也不得把真实资料移动到 `示例资料/` 等公开目录。
- 创建或更新事实和岗位简历后，按 `使用说明/索引规范.md` 同步维护受影响的各层 `_index.md`、元数据和真实文件入口。
- 修改 confirmed 事实前先征得用户确认；未经单独确认不得删除现有文件。
- 规则与 Skill 采用双份镜像维护：修改 `AGENTS.md` 时必须同步 `CLAUDE.md`；修改 `.agents/skills/` 时必须同步 `.claude/skills/`。每次修改后使用 diff 检查，两套内容除入口文件标题外必须一致。

正式输出只读取 `简历事实库/`；`示例资料/` 的虚构事实仅用于明确要求的演示，不得用于用户真实简历。事实库为空时先引导导入和确认本人资料。

## 测试阶段的固定示例照片

用户明确表示“测试阶段”或要求使用示例虚拟经历时，使用 `示例资料/完整工作流/facts/` 的虚构人物林知夏，并始终绑定 `示例资料/排版案例/assets/sample-photo.png` 作为证件照。生成示例 `resume.md` 时必须写入相对于该文件的 `photo` 路径；生成 HTML、启动编辑器和导出 PDF/PNG 时默认显示这张照片。此测试约定优先于通用的无照片默认偏好，不能把图片或虚构经历写入本人事实库。图片沿用现有授权说明。
