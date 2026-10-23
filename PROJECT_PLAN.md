# FlySkiSelfie 项目计划 / Project Plan

> 生成视图，请勿手工编辑。数据源：`project/plan.json`；更新：`python3 project/plan.py`。
> Generated view. Do not edit by hand. Source of truth: `project/plan.json`.

Updated: 2026-10-21T23:31:25-07:00

| ID | Title | Owner | Status | Depends | Next |
|---|---|---|---|---|---|
| REPO-001 | Bootstrap repository from attached AGENTS.md and requirements | project-manager | `done` |  | Historical artifacts still missing (zh requirements, docs/00-15, research/, output/) — tracked under REQ-010 and L1-D1 next steps. |
| REQ-010 | Complete bilingual requirements (docs/16 zh + en) | product | `in_progress` |  | 导入历史中文完整需求原件，并在其上同步最新范围；不得把本次修订当成已补全历史双语需求。 |
| L1-D1 | L1 hand-cranked mechanical route, D1-R1 + operation amendment R2 | chief-engineer | `held` |  | 通过BASE-020导入签发配置、评审记录、模型及制造原件后恢复可核验状态。 |
| SIM-010 | Frontend design simulation environment with demonstration animations (FE-01..FE-14) | frontend | `in_progress` | REQ-010 | 按SIM-020修复R01–R08；BASE-020补入历史原件；完成浏览器与设备实测。 |
| M-070 | Measured parameters and controlled physical tests | verification | `not_run` | L1-D1 | Pending resources; no physical test executed. |
| G-MATURE | Mechanical product maturity gate (precondition for product introduction animation) | project-manager | `gate_closed` | M-070 | Not passed. Mature-product introduction animation is not authorized. |
| SIM-011 | Photorealistic real-time rendering and cinematic demonstration for SIM-010 | frontend | `in_progress` | SIM-010 | 定位软件WebGL超时；增加工程近景、可读证据标签；在参考GPU测量性能并完整复查导演镜头。 |
| REV-020 | Review simulation and theoretical product design; explore first-principles alternatives | project-manager | `done` | SIM-010 | BASE-020补证据；SIM-020修复可信度；DES-020冻结成像任务并比较C1/C4/C5。 |
| BASE-020 | 导入历史 L1 基线并复核证据链 | project-manager | `todo` |  |  |
| SIM-020 | 修复仿真有效性、回放来源和关键断言 | frontend | `todo` | REV-020 |  |
| DES-020 | 冻结成像任务并比较轻量风筝、机械臂和翼面辅助机械臂 | chief-engineer | `held` | REV-020 | 由DES-030按新目标统一比较，相关机械与混合支撑候选作为分支进入。 |
| RES-030 | 不限定载体形态的优质视角与便利跟拍产品调研 | product | `done` |  | DES-030仅比较单人自助式产品，不考虑同伴或环境机位。 |
| DES-030 | 按不限形态目标比较镜头任务与四条产品路线 | product | `in_progress` | RES-030 | 按docs/19比较自助全流程；保留气动、混合翼臂和雪面随行分支，导演只使用本人设备素材。 |
| RES-031 | 按自助式硬约束筛选产品方向 | product | `done` | RES-030 | DES-030按自助式边界比较视点价值与全流程操作负担。 |
| RES-040 | 第一性原理多概念创意与量级筛选（多代理） | product | `done` | DES-030 |  |
| SIM-030 | 入选1–3方案的物理仿真测试与动画演示 | frontend | `in_progress` | RES-040, SIM-011 | 待用户授权：S1台架与雪上试验（躯干运动谱、频率阻尼、拼缝可见、折断力）；S3系绳发热与切绳器台架；雪场法规书面确认。 |
| RES-041 | 原创方案第二轮：跨行业前沿技术扫描与非市售概念 | product | `done` | RES-040 |  |
| SIM-031 | 四方案并行深度开发（含风筝）：物理仿真+动画演示 | frontend | `in_progress` | RES-041, SIM-030 |  |
| SIM-032 | 主动收放线系留风筝/滑翔跟拍（自动放线-泵升-回收停靠）：科学假设、仿真与多角色评审 | frontend | `done` | SIM-031 |  |
| SIM-033 | 无杆背包软翼风筝（自动起飞/回收停靠）：可行性、设计迭代与中英文概念宣传视频 | frontend | `done` | SIM-032 |  |
| SIM-034 | SledPack v2：按用户决定（无杆、不收纳可展开背负、线可短暂近头、速度/风大时飞高飞远、顺风降级、可选自动牵线微调视角）迭代与宣传片更新 | frontend | `in_progress` | SIM-033 |  |
| REL-001 | 整理项目并发布到 GitHub 公开仓库（中英文文档、贡献指南、宣传片 Release） | project-manager | `in_progress` | SIM-034 |  |

## Evidence and recent log

### REPO-001 — Bootstrap repository from attached AGENTS.md and requirements

Evidence: `AGENTS.md`, `docs/16-project-requirements-en.md`, `project/plan.py`, `README.md`, `CLAUDE.md`

- 2026-10-14T00:04:49-07:00 [project-manager] start: git init; copy AGENTS.md and docs/16 en requirements; create plan tool and seed plan
- 2026-10-14T00:31:38-07:00 [project-manager] update->done: Repository initialised (git init), attached files placed, plan tool + seeded plan, README/CLAUDE.md.

### REQ-010 — Complete bilingual requirements (docs/16 zh + en)

Evidence: `docs/16-project-requirements-en.md`, `AGENTS.md`, `docs/18-open-form-product-research-zh.md`

- 2026-10-14T23:02:22-07:00 [product] start: 按最新用户指令补入不限定风筝形态、以极佳视角和便利跟拍为目标的范围修订；中文完整需求原件仍缺失，不伪造历史内容。
- 2026-10-14T23:30:32-07:00 [product] update: 已同步中文协作约定与英文需求的2026-10-14范围修订：载体不限，极佳视角与便利跟拍为目标。历史中文完整需求仍缺失，任务保持in_progress。

### L1-D1 — L1 hand-cranked mechanical route, D1-R1 + operation amendment R2

Evidence: `docs/16-project-requirements-en.md`, `docs/17-project-review-and-product-directions-zh.md`

- 2026-10-14T22:51:40-07:00 [project-manager] update->held: 审计纠正：原done仅来自需求转述，签发原件在仓库不可读取。held表示当前仓库待核验，不撤销历史有限D1记录、不否定原设计。

### SIM-010 — Frontend design simulation environment with demonstration animations (FE-01..FE-14)

Evidence: `sim/README.md`, `sim/index.html`, `sim/js/model/solver.js`, `sim/tests/solver.test.mjs`, `sim/tests/browser_check.py`, `sim/data/reference/index.json`, `sim/tools/deploy.sh`, `docs/17-project-review-and-product-directions-zh.md`, `research/review_2026_10_14/results.json`

- 2026-10-14T00:04:49-07:00 [frontend] start: Implement first release: static no-build web app under sim/, browser solver for bounded tethered point-mass model, geometry/numerical/illustration modes
- 2026-10-14T00:31:38-07:00 [frontend] update->in_progress: Implemented FE-01..FE-14 first-release scope in sim/: 4 modes, 13 scenarios (9 numerical/3 illustration/1 pending), worker solver pm-tether@0.1.0, replays w/ hash+checksum, export/import, zh/en, keyboard, reduced motion. npm test 16/16 pass; Chrome headless interaction check pass, 0 console errors; 360/768/1440 no overflow. Not marked done: built on ASSUMED placeholders because L1 artifacts are absent.
- 2026-10-14T00:36:49-07:00 [frontend] start: Deploy static first release to https://blind.pub/flyski/ (nginx alias /var/www/flyski/) per user request
- 2026-10-14T00:38:03-07:00 [frontend] update: Deployed to https://blind.pub/flyski/ (static, /var/www/flyski, nginx snippet flyski.conf). Live Chrome headless check pass, 0 console errors; non-published paths 404. Deployed content is the uncommitted working tree on placeholder (ASSUMED) config.
- 2026-10-14T22:51:40-07:00 [project-manager] update: REV-020已完成代码与模型审查，复现近身人体漏检、导入与输入指纹问题；原有16项测试仍通过。不能据此关闭工程或实物验收。

### M-070 — Measured parameters and controlled physical tests


### G-MATURE — Mechanical product maturity gate (precondition for product introduction animation)


### SIM-011 — Photorealistic real-time rendering and cinematic demonstration for SIM-010

Evidence: `sim/js/render/gl.js`, `sim/js/render/world.js`, `sim/js/render/skier.js`, `sim/js/render/gear.js`, `sim/js/render/post.js`, `sim/js/render/director.js`, `sim/assets/README.md`, `sim/README.md`, `docs/17-project-review-and-product-directions-zh.md`, `research/review_2026_10_14/browser-check.txt`, `sim/js/ui/demo.js`

- 2026-10-14T00:43:53-07:00 [frontend] start: WebGL renderer (three.js vendored), PBR skier/kite/camera, HDRI + CC0 snow, post-processing, cinematic shot director, rendered fisheye onboard view, video capture with burned-in label
- 2026-10-14T01:43:05-07:00 [frontend] update: three.js r170 vendored; physical sky + PBR snow + valley/forest/ridges; IK skier rig; ripstop kite, 360 camera, tether; spray/tracks on shared timeline; post chain (MSAA, bloom, DOF, AO ultra, ACES, grade, grain, letterbox); 12-shot director; rendered fisheye; in-frame evidence labels; WebM recording; quality presets; 2D fallback. npm test 16/16; browser_check (SwiftShader WebGL) pass, 0 console errors; deployed to https://blind.pub/flyski/ and live frames verified.
- 2026-10-14T22:52:41-07:00 [project-manager] update: REV-020检查初始1440px截图；本轮Chrome+SwiftShader全流程在播放后暂停点击超时120s，未完成。2D定向检查通过不代表WebGL通过。
- 2026-10-18T18:23:54-07:00 [frontend] start: 用户反馈：风筝起飞方向错误、从胸前起飞不合理，应自动/半自动起飞；修复细节并整体提升视觉。仅演示层改动，证据等级不变。
- 2026-10-18T18:55:11-07:00 [frontend] update: 按用户反馈重做演示起降：风筝不再胸前手放。新增背包弹簧发射杆概念：拉肩带环升杆、托架上展开迎风、起步后升力超过脱扣力自动离架并在身后上方爬升、制动放线、手摇收回至杆端导向口自动落架锁定、折杆收纳；所有依赖该概念的阶段标⧗待验证，数值'起步与起飞'仍为手放模型。导演镜头重排（起飞侧后低机位、回收广角、对接近景）；画面：日光改侧后掠射、降雾、程序云层+偏振天空、远景林色加深、调色对比提升。npm test 16/16；browser_check全流程(SwiftShader)通过0错误；已部署 https://blind.pub/flyski/ 并核对线上文件。仅演示层，证据等级不变，G-MATURE仍关闭。

### REV-020 — Review simulation and theoretical product design; explore first-principles alternatives

Evidence: `docs/17-project-review-and-product-directions-zh.md`, `research/review_2026_10_14/reproduce.mjs`, `research/review_2026_10_14/results.json`, `research/review_2026_10_14/browser-probe.py`, `research/review_2026_10_14/browser-probe.json`, `research/review_2026_10_14/browser-check.txt`

- 2026-10-14T22:42:59-07:00 [project-manager] add: 用户2026-10-14授权：review项目，从仿真环境到理论设计优化，并大胆探索多个产品方向。
- 2026-10-14T22:42:59-07:00 [project-manager] start: 审计本地证据、代码和需求，复算模型边界，提出分层优化与多路线可证伪设计；不执行采购、部署或实物试验。
- 2026-10-14T22:52:41-07:00 [project-manager] update->done: 完成项目审查：8项主要发现、9个默认数值工况复算、β敏感性、近身漏检和导入来源反例、第一性原理量级计算与10条产品方向。npm test 16/16；WebGL全流程超时未完成；2D定向检查通过并复现来源错标。完成的是审查，未修复产品代码、未做实物、未提升成熟度。

### BASE-020 — 导入历史 L1 基线并复核证据链

- 2026-10-14T22:51:40-07:00 [project-manager] add: REV-020发现历史原件缺失；保留历史有限D1转述，当前仓库不得据此签发设计。

### SIM-020 — 修复仿真有效性、回放来源和关键断言

- 2026-10-14T22:51:40-07:00 [frontend] add: 按docs/17的R01–R08实施；优先近身漏检、导入验证、输入指纹。此次仅登记待实施。

### DES-020 — 冻结成像任务并比较轻量风筝、机械臂和翼面辅助机械臂

- 2026-10-14T22:51:40-07:00 [chief-engineer] add: 基于docs/17的C1/C4/C5开展同任务比较；电子与被动弹簧保留竞争路线。此次仅登记待实施，不继承L1资格。
- 2026-10-14T23:30:31-07:00 [project-manager] update->held: 最新用户取消风筝形态限制；原C1/C4/C5三路线保留为分支，不再充当全部产品范围。

### RES-030 — 不限定载体形态的优质视角与便利跟拍产品调研

Evidence: `research/open_form_2026_10_14/physical-evidence.json`, `research/open_form_2026_10_14/flight-evidence.json`, `research/open_form_2026_10_14/academic-evidence.json`, `AGENTS.md`, `docs/18-open-form-product-research-zh.md`, `research/open_form_2026_10_14/run_manifest.json`, `research/open_form_2026_10_14/sources.jsonl`, `research/open_form_2026_10_14/evidence.jsonl`, `research/open_form_2026_10_14/claims.jsonl`, `research/open_form_2026_10_14/concepts.json`, `research/open_form_2026_10_14/geometry-results.json`, `research/open_form_2026_10_14/quality-review.json`, `output/research/open-form-product-research.html`, `output/research/open-form-product-research.pdf`, `docs/19-solo-follow-filming-scope.md`

- 2026-10-14T23:04:39-07:00 [academic-research] update: 学术分工完成：6条原始研究证据与5条原创可证伪构想；核实SNAG户外遥控、Foldable Drone不耐碰撞和预设形态限制，明确单目重建的观测边界。未复现实验、未进行实物验证。
- 2026-10-14T23:09:08-07:00 [academic-review] start: 只读复核新报告Finding 1/2的证据范围、公式与版本边界，最多反馈5项，不修改主报告。
- 2026-10-14T23:09:41-07:00 [academic-review] update: 只读复核Finding 1/2完成：几何角度、极值、像素列预算和能量示例均独立算对；论文成熟度和旧新版边界清楚。建议收窄前侧镜头必需移动载体及离线选片失败可否定新增机位两处推论，手套冲突措辞降为潜在冲突。未改主报告。
- 2026-10-14T23:31:03-07:00 [project-manager] update->done: 完成不限形态广泛研究：23个原始来源、55条来源陈述、28个可证伪构想、四条优先路线。几何复算与分工证据复核完成，报告结构及中文兼容HTML检查通过，11页PDF已视觉检查。普通HTTP可达21/23，Veo两页403但已通过web读取正文；无实物测试或产品代码改动。用户最新范围已同步AGENTS、README和英文需求。
- 2026-10-14T23:45:13-07:00 [project-manager] update: RES-031完成最新范围筛选；首轮场地与同伴来源保留为历史研究，不再作为当前产品建议。

### DES-030 — 按不限形态目标比较镜头任务与四条产品路线

Evidence: `docs/19-solo-follow-filming-scope.md`, `docs/20-concept-selection-zh.md`

- 2026-10-14T23:30:31-07:00 [product] add: 后续研究：摄影尾臂、机会镜头飞行盒、多机位导演、摄影雪道。先比较视点价值与完整操作负担，再决定具体载体；不自动执行制造采购或实地实验。
- 2026-10-14T23:45:13-07:00 [project-manager] update->todo: 最新用户边界覆盖原四路线范围：排除同伴与环境机位；A摄影臂和B自携飞行优先比较，C限自有随行机位，D摄影雪道退出。原任务标题保留历史记录。
- 2026-10-18T19:09:12-07:00 [project-manager] start: 按RES-040结果比较并选择1–3方案
- 2026-10-18T21:22:39-07:00 [project-manager] update: 按统一判据与两轮仿真：S1背负360尾杆首推实物验证；S3系留旋翼v2有条件推进；S2轨迹复现跟拍机限静风/≤13 m/s/合法场地。见docs/20 §5。
- 2026-10-18T23:42:44-07:00 [project-manager] update: 最终排序：S3背包供电系留旋翼v3.1为首选（标定模型下全部设计工况通过），S2轨迹复现跟拍机限≤13 m/s开阔合法场地，S1尾杆限大弯巡航。见docs/20 §6。

### RES-031 — 按自助式硬约束筛选产品方向

Evidence: `docs/19-solo-follow-filming-scope.md`, `AGENTS.md`, `README.md`, `docs/16-project-requirements-en.md`, `docs/18-open-form-product-research-zh.md`, `research/open_form_2026_10_14/solo-screening.json`, `output/research/open-form-product-research.html`, `output/research/open-form-product-research.pdf`

- 2026-10-14T23:42:52-07:00 [product] add: 用户明确只考虑自助式，不考虑同伴和环境机位；同步范围并筛选既有构想。
- 2026-10-14T23:42:52-07:00 [product] start: 定义单人全流程边界，排除同伴与环境机位，保留自携载体和自有相机的软件组合；更新入口及研究报告。
- 2026-10-14T23:45:32-07:00 [product] update->done: 完成单人全流程硬约束、28构想筛选和入口同步：18保留、3限定保留、1补充、6排除；旧研究的场地与同伴内容标为历史。HTML/PDF已刷新，HTML引用与链接检查通过，PDF首页修订提示可读。无新增性能验证。

### RES-040 — 第一性原理多概念创意与量级筛选（多代理）

Evidence: `docs/20-concept-selection-zh.md`, `research/concepts_2026_10_18/BRIEF.md`, `research/concepts_2026_10_18/aerial/concepts.json`, `research/concepts_2026_10_18/body/concepts.json`, `research/concepts_2026_10_18/radical/concepts.json`, `research/concepts_2026_10_18/aerial/summary_zh.md`, `research/concepts_2026_10_18/body/summary_zh.md`

- 2026-10-18T19:09:12-07:00 [product] add: 用户2026-10-18：不限风筝，自助跟拍、画面好、少干扰滑雪、方便安全简单；多代理分工产生创意与开发设计。
- 2026-10-18T19:09:12-07:00 [project-manager] start: 启动3个创意代理（空中/系留、身体/机械/雪面、计算成像/混合颠覆），统一评价口径与JSON输出
- 2026-10-18T19:26:15-07:00 [project-manager] update->done: 3个创意代理完成36个概念（A01–A12、BODY-01–12、R00–R11），均附可复算脚本；集成者统一口径并按画面加权与物理否决入选S1背包360尾杆、S2轨迹复现跟拍机、S3背包供电系留旋翼。全部为量级计算/公开资料，无实物试验。两个代理的summary_zh.md写入被环境阻止：空中摘要由集成者据交回文本保存，颠覆视角结论记入docs/20。

### SIM-030 — 入选1–3方案的物理仿真测试与动画演示

Evidence: `research/concepts_2026_10_18/audit/criteria.json`, `research/concepts_2026_10_18/audit/findings.json`, `research/concepts_2026_10_18/audit/verdicts.json`, `sim/js/concepts/common/criteria.js`, `sim/concepts.html`, `docs/20-concept-selection-zh.md`, `research/concepts_2026_10_18/summary/matrix.json`, `research/concepts_2026_10_18/summary/build_matrix.mjs`, `research/concepts_2026_10_18/dev/boom360/results.json`, `research/concepts_2026_10_18/dev/trackdrone/results.json`, `research/concepts_2026_10_18/dev/tetherdrone/results.json`, `sim/js/concepts/boom360/index.js`, `sim/js/concepts/trackdrone/index.js`, `sim/js/concepts/tetherdrone/index.js`, `sim/tests/concepts.test.mjs`, `research/concepts_2026_10_18/calibration/proposal.json`, `research/concepts_2026_10_18/calibration/trunk_model.mjs`, `research/concepts_2026_10_18/calibration/compare_skier.mjs`, `research/concepts_2026_10_18/calibration/compare_wind.mjs`, `research/concepts_2026_10_18/calibration/compare_trunk.mjs`, `sim/js/concepts/common/trunk.js`

- 2026-10-18T20:46:22-07:00 [project-manager] update: 第一轮开发完成：S1尾杆机械过关但画面抖动/拼缝可见失败；S2跟拍机12 m/s可用但风、动能、续航、法规失败；S3系留绳入画失败。独立审计（28项发现、统一判据criteria.json）：积分器可靠；修正共享losJitter（低估约25%）、骑手姿态平滑、新增common/criteria.js统一11项指标。第二轮：三方案按审计与物理给出的改型假设并行迭代（S1主动根部稳定+三带桁架+磁吸轴向断开；S2低阻机体+换电/拖绳+轻量化+停靠漏斗；S3去电池轻量化+≤60 V+绳出画面几何+升高停靠）。
- 2026-10-18T21:22:39-07:00 [frontend] update: 第二轮完成：S1 v2 标准工况10/11项通过（仅后视），动态滑法抖动仍失败、安全类全通过；S2 v2 标准工况11/11通过，但高速/侧风/信标丢失/悬枝/法规失败；S3 v2（去电池120 g、56 V、髋部引绳杆、60 ms切绳）标准工况11/11通过，条件为≤15 m/s、对侧取景、阵风<9 m/s起降。跨方案矩阵matrix.json；npm test 63/63；三方案演示与测试模式无头渲染0控制台错误。均为未校准仿真，非实物。
- 2026-10-18T21:31:00-07:00 [verification] start: 模型标定：用公开实测文献校核 common/skier.js、env.js、criteria.js（仅写 research/concepts_2026_10_18/calibration/）
- 2026-10-18T21:43:24-07:00 [verification] update: 文献标定提案（未实测，未改sim/）：转弯时长默认4.5 s偏长（实测长弯2.97 s、短弯1.04 s），横向加速度/负荷约为实测一半（实测峰值1.6–2.05 BW）；风阵风系数偏低约25%且无Taylor平移；给出trunkAt躯干/竖向激励模型；jitter 3°/s与40 N判据无文献支撑（ASSUMED）。
- 2026-10-18T23:42:44-07:00 [frontend] update: 第三轮：共享模型按文献标定（滑雪者、躯干、风）；集成者用理想追拍相机证明3 °/s对与身体解耦的机位可达、贴身视点在短弯达26 °/s，并新增独立复核footageStability。S3 v3.1在标定模型下所有设计工况11/11通过（独立复核主体≤3.1、背景≤2.8 °/s）；S2 v3修复信标丢失、短弯、横穿者、悬枝，仍有高速（14.9 J物理矛盾）、树线、短弯抖动、法规问题；S1 v3在动态滑法中被物理否决。最终排序S3>S2(条件)>S1(巡航补充)。npm test 69/69；演示渲染缺陷（近机位透视误读）已修复。

### RES-041 — 原创方案第二轮：跨行业前沿技术扫描与非市售概念

Evidence: `research/concepts_2026_10_19/BRIEF.md`, `research/concepts_2026_10_19/scout/concepts.json`, `research/concepts_2026_10_19/scout/ranking.json`, `research/concepts_2026_10_19/scout/sources.json`, `research/concepts_2026_10_19/inventor/concepts.json`, `research/concepts_2026_10_19/inventor/ranking.json`

- 2026-10-19T18:53:10-07:00 [product] add: 用户2026-10-19：上一轮四方案均为市面已有；要求完全原创、出人意料但合理；跨行业近年突破迁移；收放携带极简；无人机需重大改进才可用。
- 2026-10-19T18:53:10-07:00 [project-manager] start: 启动风筝开发代理与两个创意代理（跨行业扫描、第一性原理原创）
- 2026-10-19T19:16:08-07:00 [project-manager] update->done: 跨行业扫描约45项突破、16概念（S2-01–16）；第一性原理14概念（I-01–14）。两路独立收敛到“坡面重力滑翔跟拍”：下坡势能供飞行，电池只供相机/航电。入选开发：K2主动风筝（用户指定）、拖曳滑翔相机（I-05）、重力下滑尾坐式滑翔机（S2-01/02+I-03）、蛙跳迎面机位（I-10）。全部为量级计算，未实测。

### SIM-031 — 四方案并行深度开发（含风筝）：物理仿真+动画演示

Evidence: `sim/js/concepts/kite2/index.js`, `sim/js/concepts/towglider/index.js`, `sim/js/concepts/leapfrog/index.js`, `sim/js/concepts/descentglider/index.js`, `research/concepts_2026_10_19/audit/findings.json`, `research/concepts_2026_10_19/audit/verdicts.json`, `research/concepts_2026_10_19/audit/comparability.json`, `sim/js/concepts/common/components.js`, `sim/js/concepts/common/fullrun.js`, `research/concepts_2026_10_19/ITERATE_BRIEF.md`, `research/concepts_2026_10_19/dev/kite2/audit_response.json`, `research/concepts_2026_10_19/audit2/findings.json`, `research/concepts_2026_10_19/audit2/cross/consistency.json`, `research/concepts_2026_10_19/summary/matrix.json`, `research/concepts_2026_10_19/ROUND3_BRIEF.md`, `research/concepts_2026_10_19/dev/descentglider/results.json`, `docs/20-concept-selection-zh.md`, `research/concepts_2026_10_19/ROUND4_BRIEF.md`

- 2026-10-20T00:11:42-07:00 [kite2-dev] update: kite2 iteration 2 done: K2-R reefing slotted-round drogue on honest coupled polar; 39-case full-run ensemble passes judged metrics (avail mean 88.0 %, setup p90 23.9 s, ops p90 2, F max 30.4 N, KE max 14.73 J, endurance 85 min); limits: glide>=0.9 assumption, KE margin, line height at turn apex, tail 9 m/s, resort bans. Simulation only, no physical test; tests 18/18.
- 2026-10-20T01:04:36-07:00 [project-manager] update: 第二轮迭代后独立复核：39风况集合全部可复现。K2回缩开缝圆伞按模型12项通过，但依赖伞L/D≥1.0、收缩后滑翔保持≥70%、大偏角入坞三项无先例假设及0.9–1.5 m低绳；拖曳滑翔可用率≈72%封顶、抖动/收纳体积失败；蛙跳在包络内82–89%但闸门用了真实风；随降滑翔5项失败、冻结为否定结论。集成者统一判据（骑行掩码、共享抖动p90、仿真收放、估计风闸门、新增headClear≥1.0 m、加热器全天计耗），K2/拖曳/蛙跳进入第三轮。均为仿真，未实测。
- 2026-10-20T05:25:48-07:00 [integrator] update: 第三轮完成并独立复核（39风况全复现）：K2风筝13项全过（有条件：理想化执行器、3%伪影容差、晾衣绳隐患未解），蛙跳可用率75.2%、拖曳滑翔机72.1%不合格，下降式冻结。复核发现网格缺3.5–5.5 m/s顺风段、伪影/头盔点定义不统一；结论：尚无方案达单人可用。均为仿真，未实测。
- 2026-10-20T05:32:48-07:00 [integrator] update: 第四轮启动：共享规则收紧（48风况含3.5–5.5 m/s顺风段、统一头盔点helmetAt、统一伪影≥2 px、bodyPx不计雪板、禁止理想化执行器），K2/蛙跳/拖曳并行迭代。
- 2026-10-20T10:27:35-07:00 [integrator] update: 第四轮完成+独立复核（48风况）：蛙跳v4 13项全过（82.3%，余量薄，5项有条件）；K2风筝v4 72.3%不合格且3 mm臂不可制造；拖曳v0.5 49.4%不合格（网格内安全）。仅蛙跳在限定包线内可称仿真可用。均为仿真，未实测。

### SIM-032 — 主动收放线系留风筝/滑翔跟拍（自动放线-泵升-回收停靠）：科学假设、仿真与多角色评审

Evidence: `research/active_tether_2026_10_20/product/summary_zh.md`, `research/active_tether_2026_10_20/engineering/calc_hardware.py`, `research/active_tether_2026_10_20/science_aero/report.json`, `research/active_tether_2026_10_20/science_control/report.json`, `sim/js/concepts/activetether/index.js`, `research/active_tether_2026_10_20/dev/results.json`

- 2026-10-20T19:07:39-07:00 [hardware] update: 硬件：推荐A+“蝎尾箭筒”——腰部卷轴（MN3110+2:1，35 N打滑离合）、0.55 m铰接碳管兼停靠/发射/出线、111 g伞形三角翼；身上0.91 kg、2.28 L。关键：出线口位置决定离头距离，仰角需控制在40–55°；捕获首次成功率仅为假设估算60–96%。手算+目录值，未实测。
- 2026-10-20T19:21:57-07:00 [scientist] update: 气动科学家：11个假设。高升阻比滑翔机自然仰角73–82°（解决晾衣绳但相机俯视、像素不足）；收线追张力使系统更差，应由翼面/减速板管张力、背包卷轴只管线长；停顿时收线保持飞行耗线100 m/20 s或画面不可用，应刹车-着陆-回收；离头距离由出线口决定；线上挂相机5–6 m方案几何可行。均为数值模型，未实测。
- 2026-10-20T20:05:45-07:00 [scientist] update: 控制科学家：11个假设多数被仿真证伪——张力+线角估风不可观测（误差p50 4.4 m/s）；单张力环不能替代飞控；从背上自动起飞在<5 m线长时被摆甩入雪；跟随飞行体动能下限½mv²，摆动使峰值约翻倍；闭环中线距头盔0.01–0.08 m。支持：起滑检测p90 0.98 s、0误起飞（需GNSS/气压/缆车锁定）。均为数值仿真，未实测。
- 2026-10-20T22:02:21-07:00 [integrator] update: AT-1集成设计与仿真完成（48风况）：可用率16.7%、主体279 px、抖动10.5 °/s、动能57 J、离头0.25 m（停顿阶段）5项不合格；其余8项通过；启动检测缆车0误起飞但公交下坡误触发。启动独立科学/工程复核与用户测试小组（模拟角色走查，非真人测试）。均为仿真，未实测。
- 2026-10-20T22:58:43-07:00 [integrator] update->done: 定案：AT-1（腰部卷轴+箭筒+116 g三角翼）48例5项不合格（可用16.7%、279 px、10.5 °/s、57 J、离头0.014 m——修正捕获窗判定后）；复核确认动能/离头/可用率三项为物理封顶；‘像放风筝一样收放’作为快速控制律被证伪，作为慢速线长管理成立。用户走查5画像均不买v1。可迁移成果转蛙跳。均为仿真与模拟走查，未实测。

### SIM-033 — 无杆背包软翼风筝（自动起飞/回收停靠）：可行性、设计迭代与中英文概念宣传视频

Evidence: `research/sledpack_2026_10_21/why_pole.py`, `research/sledpack_2026_10_21/video/copy.json`

- 2026-10-21T04:50:07-07:00 [frontend] add: 用户2026-10-21：去掉背后发射杆，风筝像背包一样停靠在背上，检测到足够速度与风后自动放线起飞；先可行性与设计改进，再基于现有演示制作中英文高端宣传视频。宣传片为概念可视化，G-MATURE仍关闭，须标注仿真/未实测，不得冒充实拍。
- 2026-10-21T04:50:07-07:00 [frontend] start: 诊断发射杆存在原因（头部净距/晾衣绳/画面），提出无杆方案假设并建模
- 2026-10-21T12:20:56-07:00 [frontend] update: sledpack@0.1.0 I8 仿真：48工况共享判据 8/13 通过（可用画面47.4%、抖动4.0°/s、方位40°、动能15.4J、头部净距0.075m 未过）；无杆时绳到头盔距离受出口位置几何上限约束。宣传片首版已渲染（中英文各82s，逐帧标注概念/仿真），正在按最终设计精修；独立评审进行中。
- 2026-10-21T18:38:35-07:00 [frontend] update->done: I9 定稿：48工况共享判据 8/13 通过（可用画面43.1%、抖动6.4°/s、可指令视角0°、头部净距0.40m 未过；动能14.43J、续航54.2min 通过但余量薄），仍不是可用设计。独立复核修正相机功耗漏算等。中英文概念宣传片（各86s，逐帧标注概念/仿真/未实测，只展示仿真达标项，列出待攻克项）已部署 https://blind.pub/flyski/media/。G-MATURE 仍关闭，M-070 NOT_RUN。待用户决定：头部净距规则/后伸支架、顺风>6m/s不飞、视角不可选。

### SIM-034 — SledPack v2：按用户决定（无杆、不收纳可展开背负、线可短暂近头、速度/风大时飞高飞远、顺风降级、可选自动牵线微调视角）迭代与宣传片更新

Evidence: `research/sledpack_2026_10_21/dev/results.json`, `docs/20-concept-selection-zh.md`

- 2026-10-21T20:56:43-07:00 [frontend] add: 用户2026-10-21决定：风筝不用时可不折叠直接背在背上（能折叠进背包更好），不考虑缆车；不加杆，体验优先，线偶尔短暂进入头部1 m内可接受；高速/大风时飞得更高更远；接受顺风限制（升力不足就飞低飞近）；固定视角可接受，若成本低则自动牵线左右上下微调；宣传片要展示这些改进。共享13项判据照常报告，另按用户修订的头部净距与收纳规则单独判定。
- 2026-10-21T20:56:43-07:00 [frontend] start: 记录用户决定，委派设计迭代 I10（背负展开停靠、线长随视风调度、顺风降级飞行、差动转向评估）
- 2026-10-21T22:19:04-07:00 [frontend] update: I10（sledpack@0.2.0）：展开背负、腰带后环出线、线长随视风5–12 m、镜头上仰8°。共享判据8/13；用户修订判据：无接触（最小0.49 m）通过，'短暂'未过（单次最长3.1 s、最多21%骑行时间在1 m内，顺风/强侧风）；停下多为停在雪上再起飞，回背停靠约1/10。v2宣传片渲染与I10独立复核进行中。
- 2026-10-21T23:31:25-07:00 [frontend] update: I11（sledpack@0.2.1）：线长上限9 m、顺风限5 m/s、背上剥离0.8 s建模、防摆收线。共享8/13；用户修订：不接触与单次≤2 s通过（依赖尾流/脱离模型），累计≤5%未过（26/48）。I10独立复核已完成并处理。docs/20 §11 已写。v2宣传片（含“不止滑雪”片段）渲染中。

### REL-001 — 整理项目并发布到 GitHub 公开仓库（中英文文档、贡献指南、宣传片 Release）

- 2026-10-21T22:26:09-07:00 [project-manager] add: 用户2026-10-21要求：整理项目，上传到用户 GitHub 新公开仓库，中英文文档，README 带宣传性质并鼓励贡献；宣传片增加驾车/摩托/跑步等其他用途片段（未评估，需标注）。
- 2026-10-21T22:26:10-07:00 [project-manager] start: 清理（排除第三方手册/临时文件/大视频）、双语 README/CONTRIBUTING/索引、MIT 许可；视频作为 Release 附件
