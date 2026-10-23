# Research rounds / 研究轮次索引

Each folder is one study round: briefs, re-runnable scripts, results (JSON) and independent reviews. All numbers are
analysis or **uncalibrated simulation**; no physical test has been run.
每个目录是一轮研究：任务书、可复算脚本、结果（JSON）与独立复核。所有数字都是分析或**未经标定的仿真**，未做任何实物试验。

| Folder / 目录 | Date | Topic (EN) | 主题（中文） | One-line result / 一句话结论 |
|---|---|---|---|---|
| [review_2026_10_14](review_2026_10_14/) | 10-14 | Review of the first kite simulator | 首版风筝仿真器审查 | Browser probe and reproduction of default scenarios / 浏览器探针与默认工况复算 |
| [open_form_2026_10_14](open_form_2026_10_14/) | 10-14 | Open-form product research: any form factor, solo filming | 不限形态的跟拍产品调研 | 28 ideas → 4 routes; evidence & claims tables (docs/18) / 28 个构想收敛为 4 条路线 |
| [concepts_2026_10_18](concepts_2026_10_18/) | 10-18 | 36 concepts (aerial / body / radical) → S1 360 boom, S2 track-replay drone, S3 tethered rotor; shared concept lab | 36 个概念 → 3 个入选；建立方案实验室 | S3 tethered rotor best after calibration; kites ruled out in round 1 (docs/20 §1–6) / 标定后系留旋翼最佳 |
| [concepts_2026_10_19](concepts_2026_10_19/) | 10-19…20 | Original concepts: drogue kite K2, leapfrog gravity glider, towed glider, descent glider; audits 1–4 | 原创方案：K2 风筝、蛙跳滑翔、拖曳滑翔、抛飞滑翔；四轮复核 | Leapfrog the only marginally usable one; kite K2 fails on line geometry (docs/20 §7–8) / 只有蛙跳勉强可用 |
| [active_tether_2026_10_20](active_tether_2026_10_20/) | 10-20 | AT-1 active-reel tethered glider (auto pay-out, pumping, docking): science, engineering, product, review, simulated user panel | 主动收放线系留滑翔 AT-1 | 5/13 fail (avail 16.7 %, 57 J, head 0.014 m); "fly it like a kite" only as slow length management (docs/20 §9) |
| [sledpack_2026_10_21](sledpack_2026_10_21/) | 10-21 | SledPack: pole-free backpack soft kite; v1 spine sleeve, v2 open-on-back (user decisions); promo film | SledPack 无杆背包软翼风筝；v1 套管、v2 展开背负；宣传片 | 8/13 shared criteria; no head contact; open: footage 48 % (v2.1), tailwind swing, re-dock, jitter (docs/20 §10, dev/REPORT.md) |

Key files / 关键文件:
- SledPack report: [sledpack_2026_10_21/dev/REPORT.md](sledpack_2026_10_21/dev/REPORT.md) (v2/I10), [REPORT_I9.md](sledpack_2026_10_21/dev/REPORT_I9.md) (v1)
- Why a pole was needed (geometry): [sledpack_2026_10_21/why_pole.py](sledpack_2026_10_21/why_pole.py)
- User decisions: [sledpack_2026_10_21/USER_DECISIONS_2026-10-21.md](sledpack_2026_10_21/USER_DECISIONS_2026-10-21.md)
- Independent reviews: `*/review/`, `concepts_2026_10_19/audit*/`, `concepts_2026_10_18/audit/`
- Cross-concept matrices: `concepts_2026_10_18/summary/`, `concepts_2026_10_19/summary/`

Not published: third-party product manuals downloaded during research (`open_form_2026_10_14/raw-flight/`, copyrighted).
未发布：调研时下载的第三方产品手册（版权所有）。
