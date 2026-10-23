# RES-040 多概念创意简报 / Multi-concept ideation brief (2026-10-18)

## 用户目标（原话要点）
风筝只是一个可能。从第一性原理出发，任何方案只要满足以下条件都值得考虑：
1. 滑雪者**本人独立**获得跟拍画面（无同伴、无预放/场地机位；见 `docs/19-solo-follow-filming-scope.md`）；
2. **画面好**（外部视角、全身+环境、稳定、连续）；
3. **尽量不干扰滑雪动作**；
4. **方便、安全、简单**。
大胆假设、小心求证。最终选 1–3 个最可行方案做详细仿真与动画演示。

## 已有资产（先读，避免重复）
- `docs/18-open-form-product-research-zh.md`：28 个构想 O01–O28 与证据；`docs/19-...`：自助式筛选。
- `docs/09-kite-feasibility.md` 等历史文档可能缺失；风筝背负发射杆概念见 `sim/README.md`。
- 仿真引擎：`sim/`（three.js 渲染、浏览器求解器）。

## 统一评价口径（每个概念都要给数字，标注来源：计算/文献/假设）
- **画面 footage**：机位距离 d (m)、俯仰角、可达方位（后/侧/前）、主体在画面中的高度占比（以 1.75 m 人体、给定 FOV 计算）、角抖动估计 (°/s 或 °RMS)、整段连续可用比例、遮挡。
- **干扰 interference**：身上附加质量 (kg) 及位置、附加转动惯量（偏航/横滚 kg·m²）、作用于人体的外力（气动/系绳/反作用，N）、是否占用手、是否勾挂/绊倒风险。
- **方便 convenience**：展开+收回时间 (s)、操作步数、手套可操作性、收纳体积 (L)、续航与低温。
- **安全 safety**：对本人/他人的动能 (J)、旋翼/锐边暴露、缠绕、摔倒时后果、法规（雪场无人机禁令、视距要求等）。
- **简单 simplicity**：主动控制需求、零件/机构数、主要失效模式。
每项 1–5 分并给理由；另给“致命否决条件”(kill criteria) 与“可证伪测试”。

## 输出格式
在你的子目录 `research/concepts_2026_10_18/<lens>/` 下：
- `calc_*.py`：可复算的量级计算（只用 Python 标准库或 numpy），运行后打印/写出数字；
- `concepts.json`：数组，每项字段：
  `id, name_zh, name_en, lens, one_liner, principle, architecture{carrier,support,energy,sensing,imaging,use_flow}, viewpoints[{azimuth, elevation_deg, distance_m, notes}], key_numbers{名称: {value, unit, source: calc|lit|assumed, ref}}, scores{footage, interference, convenience, safety, simplicity: {score, why}}, bold_hypothesis, falsification_test, kill_criteria[], sim_plan{what_to_model, states, scenarios[], metrics[]}, prior_art[{name, url, relevance}]`
- `summary_zh.md`：中文摘要，按综合潜力排序，指出你认为前 3 名及理由。

## 边界
- 只写入你自己的子目录；不要修改 `sim/`、`project/`、`docs/`、`AGENTS.md`。
- 不下单、不外联、不部署；可以联网检索公开资料作现有技术与法规依据，记录 URL。
- 区分来源观点、计算结果和未验证判断；不要把数量级可行写成已验证。
