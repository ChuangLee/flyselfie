# 参与贡献 FlySelfie

[English](CONTRIBUTING.md) · **简体中文**

感谢参与！本项目靠严谨、诚实的工程推进。欢迎各种贡献：代码、物理分析、数据、有理有据的“这行不通”、翻译。

## 基本规则（请先读）

1. **仿真不等于验证。** 不要把仿真或动画结果说成已测试、已证明或已测量。实物试验只有真正做过并附上数据，才算“通过”。
2. **渲染要标注。** 生成的图片或影片必须标为仿真渲染或概念，绝不能当作实拍展示。
3. **注明来源或标 ASSUMED。** 非平凡的数字要给出来源（网址、数据手册、论文），否则标注 `ASSUMED`（假设）。
4. **不要为判据调参。** 共享判据在 `sim/js/concepts/common/`，所有方案用同一套规则评判。要改规则，请在 issue 中提出并说明理由，不要夹带在方案 PR 里。
5. **安全第一。** 不要发布在人群、道路、缆车或电线附近放飞的操作指南。实物试验由你自行负责，并须遵守当地法律。

## 开始

```bash
cd sim
npm start          # http://localhost:8080 —— index.html（风筝仿真器）、concepts.html（方案实验室）
npm test           # node --test tests/*.test.mjs（需数分钟，必须保持全部通过）
npm run gen-reference   # 修改主求解器或场景后运行
```

无需构建，也没有运行时依赖：纯 ES 模块加内置的 three.js。

## 新增或改进方案

方案实验室的约定见 [sim/js/concepts/README.md](sim/js/concepts/README.md)。简言之，方案目录 `sim/js/concepts/<id>/` 需要导出：

- `simulate(params)`：返回 `Result`，指标用 `common/criteria.js` 的 `addStd` 评判；
- `demo.build` / `frame(t)`：完整使用循环动画，含 `productCam` 小窗（产品自身相机看到的画面）；
- `gear.js`：三维几何；
- 测试文件 `sim/tests/concept_<id>.test.mjs`。

评判运行必须：
- 使用共享的 48 例风况（`FULLRUN_CASES_R4`）；
- 门限用 `windEstimate`（不得读取真值风）；
- 离头距离用 `helmetAt()`；
- 不得使用理想化的执行器或估计器。

研究脚本和结果放在 `research/<主题>_<日期>/`，并附简短的 README 或 REPORT。

## 提出想法或修改规则

用 **想法 / 方案提案** 模板开 issue，写清楚：
- 假设是什么；
- 如何证伪；
- 预期的数字，附来源或标 ASSUMED；
- 影响哪些共享判据。

欢迎大胆的想法，前提是附上能否定它的试验。

## Pull Request

- 保持 PR 聚焦，说明改了什么、如何检查的（测试、运行结果、曲线）。
- `npm test` 必须全部通过。
- 文档中文或英文都欢迎；只写了一种语言请注明，会有人帮忙翻译。
- 评审时对事不对人，用数据说话。

## 维护者 / 智能体工作流

维护者使用计划文件 `project/plan.json`（只能通过 `python3 project/plan.py` 修改），流程规则写在 [AGENTS.md](AGENTS.md) 和 [CLAUDE.md](CLAUDE.md) 中，包括 AI 智能体协作：只有集成者能更新计划和部署。贡献者不需要改计划，维护者会把 issue 和 PR 关联到计划任务。
