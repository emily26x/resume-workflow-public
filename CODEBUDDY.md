# WorkBuddy 项目入口

在本仓库根目录执行任务。开始前先完整读取 `AGENTS.md` 和 `使用说明/workflow.md`，遵守其中的事实确认、虚构示例隔离、索引维护和隐私边界。

根据用户意图使用 `.codebuddy/skills/` 中的四个 Skill。每个入口会指向 `.agents/skills/` 中对应的完整流程；执行前应读完，不要只凭入口摘要生成内容。

真实资料只放在 Git 忽略的 `原始材料/`、`简历事实库/`、`岗位档案/`、`.resume-workflow/` 和 `.workbuddy/`。`示例资料/` 只用于用户明确要求的演示。发布前运行 `npm run privacy-check` 和 `npm test`。

用户要求编辑或排版已确认的简历时，运行 `npm run editor -- --input <resume.md>`，最终回复先提供带左侧调节面板的 HTTP 编辑器地址。静态 `resume.html` 链接可以补充提供，不能代替编辑器。
