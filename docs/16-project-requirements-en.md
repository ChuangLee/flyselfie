# FlySkiSelfie Project Requirements

Version: 1.0. Requirements compilation date: 2026-10-13. Chinese counterpart: [项目完整需求](16-project-requirements-zh.md).

**Scope amendment, 2026-10-14:** The user explicitly removed the kite-form constraint and defined the ultimate objective as excellent filming viewpoints and a convenient follow-filming product. For the current research phase, carrier form is open, and elevated downward filming is one shot option rather than the sole framing objective for every candidate. Skiing remains the primary demanding use case; adjacent sports may inform research. Mechanical and electronic kite routes remain candidate assets. This amendment supersedes the kite-only research focus below, without asserting that later manufacturing, procurement, deployment or physical testing has been performed or authorized by this research request. The matching Chinese amendment is recorded at the top of [AGENTS.md](../AGENTS.md); research task: RES-030.

**Subsequent solo-only amendment, 2026-10-14:** Only self-service products are considered. A single user must carry, deploy, film, recover and retrieve footage without companions or environmental camera stations, including cameras preplaced by the user. User-carried autonomous flying or ground-following cameras remain eligible. Manual solo setup, launch and recovery while stopped are allowed; full automation is not required. Multi-camera software may use only the user’s own carried/following cameras. This constraint supersedes the broader research routes; matching Chinese scope: [solo product scope](19-solo-follow-filming-scope.md), task RES-031.

FlySkiSelfie shall develop a filming device that a skier can operate independently on open, sparsely populated ski slopes, capturing the skier's full body and surroundings from an elevated downward viewpoint. The current direction is a backpack-carried kite carrying a lightweight panoramic or semi-panoramic camera, with manual assistance permitted during deployment and recovery around starts and stops. The product objectives include a purely mechanical control version and a programmable electronic control version.

These requirements cover the products, engineering design, manufacturing documentation, verification, project management, and the newly requested capability: **“Build a frontend simulation environment for product design, including demonstration animations.”** The long-term product objectives remain in place; the existing L1 hand-cranked prototype is a design baseline for controlled verification. Subsequent routes require their own design and verification evidence.

## 1 Requirement Status and Interpretation

This document serves the product, chief engineering, mechanical, aerodynamic, control, frontend, manufacturing, and verification roles. The Chinese and English versions use identical requirement and acceptance identifiers with equivalent technical meaning. Translation ambiguities shall be resolved against the Chinese text and the corresponding original user record, then corrected in both versions.

| Category | Meaning | Handling rule |
|---|---|---|
| User requirement | An explicitly stated objective, scenario, product scope, or new simulation request | Changes require a recorded new user instruction |
| Derived project requirement | A proposed functional, interface, quality, or acceptance requirement needed to meet the objectives | An engineering proposal in this version, subject to review; do not attribute it verbatim to the user |
| Baseline fact | The actual status of existing files, design releases, models, and demonstrations | Valid only for the associated configuration and purpose |
| Open item | An unconfirmed metric, parameter, resource, or implementation choice | Retain its open status and closure path; do not assume compliance |

“Shall” denotes a requirement in this version; “should” denotes a recommendation. “Shall” does not imply implementation. Section 2 states current facts, Sections 4–11 state requirements, and Section 12 lists quantitative metrics awaiting agreement. Except for the explicit user objectives in Section 3 and the original new request in FE-01, the detailed technical and acceptance clauses are derived project requirements.

The current deliverable is the complete requirements documentation and its registration in the plan. Implementation of the frontend environment is registered as `SIM-010`; this document does not mark it as implemented or replace manufacturing drawings.

## 2 Current Design Status and Applicable Baseline

Project status is consolidated from repository records through 2026-09-17 and the current new user request.

| Item | Current status | Use in subsequent work |
|---|---|---|
| L1 purely mechanical hand-cranked route | L1-D1-R1, reissued with parking and pouch operation amendment R2; passed a limited D1 design review | Traceable baseline for a controlled verification prototype and the first simulation release |
| L1 numerical model | 62 dynamic cases and numerical checks; inputs have not been calibrated with physical measurements | Reuse models, data, and counterexamples while preserving applicability limits |
| L1 frontend demonstration | Seven-stage operation illustration, engineering geometry view, and five independent model replays exist | Reusable component of the new environment; not evidence that a complete parameterized simulation environment has been delivered |
| Passive spring payout/retrieval and mechanical direction sensing | P-010 and P-020 principle analyses are recorded; not manufactured or physically tested | Competing candidates that do not inherit L1's D1 qualification |
| Backpack-side electronic control | E-100 through E-130 studies cover benefits, hardware, control, and budgets | Further comparison is allowed; the electronic product's new manufacturing design and D1 are incomplete |
| Physical and user verification | M-070 has not been performed; aerodynamics, cold conditions, imaging, human factors, and complete cycles await testing | Subsequent maturity gates; do not record a pass |
| Early D0 and heavy automatic routes | D0 is withdrawn as a basis for complete-product trial manufacture; the old heavy automatic route is on hold | Historical traceability and counterexample learning only |

L1's estimated total carried mass is approximately 3.0–3.4 kg, with a 340 g design ceiling for airborne mass. These are engineering estimates and design inputs for that prototype and require weighing. The 2 kg figure is a team exploration target, and 2.5 kg is that route's review trigger; neither is a user-confirmed hard specification. The D1 release does not imply that the user accepted a 3 kg product or its operating burden.

## 3 User Objectives and Use Scenarios

### 3.1 Confirmed Objectives

- Develop an autonomous ski filming device, question assumptions from first principles, pursue disruptive designs, form bold hypotheses, and verify them carefully.
- Currently focus on a kite carrying a lightweight panoramic or semi-panoramic camera for elevated views of the full body and environment.
- Use primarily on open, sparsely populated ski slopes; permit payout/retrieval and manual assistance around starts and stops; carry the device on the back between uses.
- Compare launching while skiing, retrieval around stopping, manual assistance, and automatic operation; do not assume one wingspan, tether length, or automatic mechanism is the only solution.
- Develop two products: purely mechanical tether control and a version permitting programmable electronic control. Detailed design shall ultimately reach the level of a factory trial-production manual.
- Establish a project management role, read and update the project plan before all work, and bring the mechanical design to an explicit maturity gate before producing its product introduction animation.
- Add a frontend product design simulation environment including demonstration animations, and provide complete Chinese and English requirements.

“Autonomous filming” first means that the skier can complete the filming task without another camera operator. Automatic launch, retrieval, handover, locking, folding, and pouch stowage are distinct capabilities and shall be declared separately. Electronic camera recording does not violate the mechanical version's tether-control boundary.

### 3.2 Complete Task Cycle

| Stage | User task | Result the system shall define |
|---|---|---|
| Carry | Wear the equipment and reach the use location | Components, camera, and tether are restrained; transport state is defined |
| Prepare | Stop securely, inspect, unfold, arrange the tether, and set the camera | Executable launch prerequisites and manual actions |
| Launch | Release from support and pay out manually or through a verified mechanism | Defined support transfer, airflow conditions, and payout state |
| Film | Ski, turn, and record the full body and surroundings | Continuous source footage that can be evaluated within the declared operating envelope |
| Planned retrieval | Request retrieval in advance and control approach | Adequate force, energy, space, and time margins |
| Handover and short stop | Physically take over the payload, hold or lock it, and prepare another run | Distinguish proximity, actual load support, and locking |
| Final stowage | Stop, arrange, fold, and place components in the pouch | Complete stowage path, tether slack, and action sequence |
| Fault response | Take over after abrupt stopping, wind loss, tether jamming, a fall, or power loss | Record actual consequences and recovery paths; retain failed segments |

Normal retrieval requested in advance and an unexpected abrupt stop shall be assessed separately. No current commitment guarantees automatic return to the backpack in every wind condition, stop, or fall.

## 4 Product Functional Requirements

| ID | Requirement | Acceptance evidence |
|---|---|---|
| PR-01 | Within the declared operating envelope, one skier shall be able to prepare, film, retrieve, and stow the equipment; assistance shall be recorded separately | Complete-cycle records identifying participants, required hands, and interventions for every action |
| PR-02 | The system shall produce usable elevated views of the full body, skis, and surroundings using lightweight panoramic or semi-panoramic imaging | Composition analysis and continuous source footage for one configuration; freeze quality and usability criteria under Section 12 |
| PR-03 | The system shall support backpack carriage and transport restraint and assess deployed dimensions, folded volume, total mass, and protrusion effects | Mass account of all carried items, dimensioned drawings, and wear/transport verification |
| PR-04 | Payout, holding, retrieval, handover, locking, and stowage shall be defined separately, declaring manual and automatic actions at each stage | State and action tables mapped to actual mechanisms or user actions |
| PR-05 | Normal starts, straight skiing, turns, planned deceleration, reuse after short stops, and final stowage shall be assessed, retaining consequences of abnormal stops | Scenario matrix and complete-use records for the same version |
| PR-06 | Mechanical and electronic versions shall be compared for user benefits and costs over a complete task and multiple filming segments | Same-task comparison of preparation, hand occupation, arrangement, fault recovery, charging or winding, and imaging results |

## 5 Control Requirements for the Two Products

### 5.1 Purely Mechanical Version

| ID | Requirement | Acceptance evidence |
|---|---|---|
| MC-01 | Tether payout/retrieval, holding, and protective control shall use manual or mechanical means without dependence on electronic programs or motors; electronic recording and development instrumentation are permitted | Consistent product control architecture, BOM, and energy chain |
| MC-02 | Every claimed energy storage, clutch, force limit, speed limit, brake, stop, and trigger function shall have a manufacturable physical path and defined state consequences | Complete drawings, loads, dimensions, tolerances, assembly, and state definitions |
| MC-03 | Hand-cranked, spring, or other stored-energy routes shall define launch resistance, retrieval capability, energy margin, and operator burden without assuming an ideal operator input | Force–speed–energy analysis, human input ranges, and bench measurements |
| MC-04 | Combined tension and direction sensing shall define sensing location, deadband, friction, and posture effects; upward or downward pull alone shall not establish airborne or grounded state | Up/down pull, inclination, slack tether, snagging, and repeated threshold-crossing cases |

L1 currently requires manual launch, manual payout, hand-cranked retrieval, and arrangement after stopping. Passive automatic mechanical alternatives may challenge this implementation but shall not be represented as existing L1 capabilities.

### 5.2 Programmable Electronic Version

| ID | Requirement | Acceptance evidence |
|---|---|---|
| EC-01 | Compare electronic monitoring, springs with electronic braking or clutching, and active motorized payout/retrieval; a lightweight airborne end with electronics on the backpack side is the current research baseline | Consistent comparisons of capability, mass, cost, energy, and maintenance; additional airborne electronics require a separate trade study |
| EC-02 | Define a state machine for user requests, payout, holding, retrieval, near-end deceleration, stopping, and manual takeover; enable automatic functions progressively within observable capabilities | State transitions, authority, interlocks, timeouts, resets, and fault cases |
| EC-03 | Define actual measurement ranges, errors, and delays for tension, tether direction/length, reel speed, current, and other signals; missing information shall produce an unknown state | Calibration records and fault injection for bias, stuck values, counting errors, and signal loss |
| EC-04 | Select motors, drivers, power supplies, and braking paths using actual loads, reel radius, speeds, and temperatures; check peak, continuous, backdriven, and static holding capability separately | Operating points, thermal and energy accounts; stall or transient peaks shall not substitute for continuous capability |
| EC-05 | Stop requests shall take priority; reset or restored power shall not execute stale movement commands. Independent mechanical backup, end limits, and energy destinations shall have physical definitions | Software and physical fault verification covering power loss, undervoltage, jamming, overload, end-limit failure, and inability to absorb regenerative energy |
| EC-06 | Electronic manufacturing deliverables shall include hardware, wiring, connectors, buildable firmware, versions, parameters, logs, and programming/inspection instructions | Actual builds and board/drive verification; offline reference code shall not substitute for deliverable firmware |

## 6 Physical Design and Manufacturing Requirements

| ID | Requirement | Acceptance evidence |
|---|---|---|
| EN-01 | Unify coordinates, the definition of external tether length, mass, center of gravity, inertia, loads, and all versioned interfaces | Cross-checkable configuration tables, models, CAD, BOM, and manuals |
| EN-02 | Calculate relative airflow jointly from skier velocity, ambient wind, and retrieval movement; distinguish flight, active retrieval, and paths after lift loss | Aerodynamic and dynamic analyses with explicit equations, inputs, and invalidity domains |
| EN-03 | Review slack, spooling, friction, bending, terminations, wear, and entanglement along the actual tether path over the entire payout/retrieval travel | Three-dimensional tether routing, dimension chains, materials, and load/wear verification |
| EN-04 | Review continuous motion and contact consequences involving the camera, wing, frame, helmet, body, and poles; perform corresponding folding only after physical support is established | Continuous swept volumes, clearance, and load-transfer order; distinguish forbidden contact volumes from permitted interfaces |
| EN-05 | Deliver assemblies, critical internal mechanisms, part drawings, exchangeable 3D files, material/component selections, BOMs, tolerances, fabric patterns, and critical processes | Complete files for one configuration that permit manufacture and assembly; factories shall not have to supply missing critical design |
| EN-06 | Deliver incoming inspection, assembly adjustment, gauges, final inspection, maintenance, operation, fault recovery, and controlled verification instructions | Executable factory instructions and records with explicit purpose and qualifications not yet obtained |

## 7 User Experience and Fault Consequences

| ID | Requirement | Acceptance evidence |
|---|---|---|
| UX-01 | Check action reachability with thick gloves, two poles, handedness, body sizes, and leaning postures; do not rely on blind insertion behind the back or more hands than are available | Action analysis, static human factors checks, and subsequent real-user tasks |
| UX-02 | Record time and burden for initial preparation, hand occupation per segment, retrieval, short-stop reuse, final pouch stowage, and fault recovery separately | Continuous task records; illustrative animation duration is not an operation-time measurement |
| UX-03 | Distinguish near-end retrieval, physical handover, locking, and pouch stowage; mechanical states and electronic indications shall match actual states | Independent state evidence and false-arrival/false-lock cases |
| SF-01 | Define consequences and takeover methods for abrupt stops, wind loss, gusts, lateral swing, slack, snagging, jamming, falls, loss of energy, and incomplete handover | Fault consequence tables tracking wing, camera, tether, operator, and residual energy |
| SF-02 | Force limiting, stopping, holding, or release shall have applicability conditions and verifiable physical behavior; do not assume unlimited force or repeated reversals untangle a tether | Actual-load and single-fault verification; stopping the reel does not automatically stop the airborne payload |
| SF-03 | Begin with isolated benches and protected non-human fixtures, then determine eligibility for human and scenario tests from acquired evidence | Test configurations, resource acceptance, stop criteria, source records, and independent review |

## 8 Modeling and Verification Requirements

| ID | Requirement | Acceptance evidence |
|---|---|---|
| VV-01 | Separate code implementation checks, comparison of models with physical behavior, conformity to design requirements, and confirmation of user purpose | Every conclusion identifies evidence type, configuration, range, and untested items |
| VV-02 | Check units, coordinates, statics/known motion, energy, event order, time steps, and necessary tether-segment/mesh convergence | Reproducible benchmarks, numerical reports, and counterexamples; an error-free run alone is insufficient |
| VV-03 | Calibrate critical models using measured aerodynamics, mass, inertia, friction, and actuator response, then validate against conditions excluded from calibration | Source data, measurement uncertainty, independent validation sets, and errors for individual variables |
| VV-04 | Retain normal and failed cases; stall, slack, contact, or excursions beyond model scope shall trigger an applicable model or explicit invalidity | Visible valid time intervals, events, and model boundaries; do not declare success by following invalid trajectories |
| VV-05 | Verify complete cycles, imaging, cold conditions, wet snow/icing, wear, life, transport, and manufacturing consistency against declared conditions and purpose | Predetermined criteria and sample rationale; retain every attempt and failure; record unperformed tests as NOT_RUN |

D1 means complete documentation and numerical evidence within stated assumptions can support manufacture of a controlled verification prototype. D2 additionally requires measurements of critical physical behavior and user experience. D3 additionally requires reliability, manufacturing-process, and delivery-scope evidence. More uncalibrated simulation runs do not raise the maturity level.

## 9 Frontend Simulation and Demonstration Requirements

### 9.1 Purpose and Boundaries

The frontend environment shall support inspecting product structures, changing design inputs, comparing candidates, checking motion and imaging, reproducing failures, and explaining designs to reviewers. It shall reuse existing CAD, models, and data. Computation may run in the browser or in offline engineering tools whose results are replayed. Improving presentation does not raise the evidence level of existing results.

| ID | Requirement | Acceptance evidence |
|---|---|---|
| FE-01 | **Build a frontend simulation environment for product design, including demonstration animations** | Runnable frontend source, startup instructions, sample configurations, simulation/replay data, and demonstration entry point |
| FE-02 | Distinguish engineering geometry views, numerical computation/replay, and illustrative product motion; continuously show configuration, model, evidence level, and pending physical tests | Correct labels and sources when switching modes; narrative paths shall not become numerical results |
| FE-03 | Parameterize the displayed skier, slope, wind field, backpack equipment, wing, camera, and tether path; provide orbit, zoom, and dimensional references | Agreement with configuration coordinates and key geometry; simplified bodies/soft wings identified as illustrations |
| FE-04 | Allow changes to scenarios and permitted design parameters, including skiing trajectory, slope, wind direction/speed, mass, tether length, wing parameters, and payout/retrieval inputs; unsupported parameters shall not appear effective | Explicit units, ranges, sources, and defaults; reject invalid input; changes trigger recalculation or a no-matching-replay indication |
| FE-05 | Provide versioned calculation or result-loading interfaces; play, pause, reset, seeking, and playback speed shall use the same simulation timeline | Reproducible results for the same inputs, model version, and random seed; playback speed does not change physics |
| FE-06 | Synchronize supported variables among position/orientation, relative airflow, tension, tether length/speed, force/torque, power/energy, clearance, and key events | Plots correspond to 3D state; unavailable values are marked as unavailable rather than inferred from animation |
| FE-07 | Include start/launch, stable filming, turns, planned deceleration and retrieval, handover, short stops, and stowage, plus wind loss, abrupt stops, slack, jamming, and power loss | Each scenario identifies numerical modeling, engineering illustration, or pending verification; failures and unmodeled stages are directly selectable |
| FE-08 | Show available collision, body/snow/equipment clearance, tether entanglement, and imaging obstruction analyses with geometry/model limits | Traceable first-event time and location; unimplemented checks marked as such; nominal non-interference does not establish physical conformity |
| FE-09 | Provide camera and third-person views to inspect full-body/ski/environment composition and lens/tether/wing obstructions | Explicit lens nodes, field of view, and cropping sources; synthetic images shall not claim real exposure, resolution, or stitching quality |
| FE-10 | Compare mechanical and electronic candidates within the same task boundary, preserving unknown values and capabilities | Same coordinates, scenarios, mass accounting, and metric definitions; the old L1 model shall not become a validated electronic-candidate model |
| FE-11 | Provide a complete-cycle demonstration, stage selection, and necessary action explanations that correctly represent manual preparation, requests, handover, and stowage | Motion agrees with the configuration's instructions; a mature-product introduction requires that configuration's D1/maturity gate and a prominent “Engineering design demonstration — physical testing pending” label |
| FE-12 | Save or export configuration, model version, inputs, events, valid time intervals, and results for reproduction; screenshots/demonstration sharing should include evidence labels | Readable JSON configurations and CSV/JSON results, versioned or checksummed sources, and no filtering out failures during export |
| FE-13 | Support desktop reviews and narrow-screen reading, clear Chinese UI with corresponding English text, keyboard-operable controls, and reduced-motion options | Browser, viewport, interaction, and language check records; start paused; states shall not rely on color alone |
| FE-14 | Separate rendering from solving; expose loading, running, invalid, and no-data states; retain frontend, model, data, asset, and usage documentation | Long calculations do not block stop/cancel; no unhandled runtime errors; background workers or offline results are recommended for complex calculations |

### 9.2 First Release and Subsequent Extensions

The first release shall use the signed L1 configuration, operation amendment R2, and existing model as its basis. Deliver geometry views, source-model replays, bounded recalculation for permitted inputs or explicit replay selection, metrics, failure events, imaging geometry, complete operation illustrations, and data export. A replay-only interface shall not claim arbitrary parameter solving. At least one bounded computation path matching the existing model shall produce new results after input changes; engineering computation may execute offline.

Passive mechanical and electronic candidates may initially enter comparisons through clearly labeled structure/state illustrations and consistently scoped budgets. Dynamic numerical results shall be connected after the corresponding models are established and checked. Stall, soft-wing behavior, full six-degree-of-freedom dynamics, slack-tether contact, and measurement-based calibration may be added progressively as needed; until then, the UI shall state its limits.

Research simulation, geometry checks, and failure analysis may precede the maturity gate. Animations introducing a mature product remain governed by the corresponding configuration's maturity gate; L1's existing gate does not automatically qualify new mechanisms. Independent launch and retrieval cases shall not be spliced into a supposedly proven complete successful cycle.

## 10 Project Organization and Change Requirements

| ID | Requirement | Acceptance evidence |
|---|---|---|
| PM-01 | Read the root project plan before substantive work, register new work before execution, record the current action, and update facts, evidence, and next steps at completion | Use `project/plan.py`; `project/plan.json` is the single source of truth |
| PM-02 | Assign project management, chief engineering, product, human factors, aerodynamics, mechanisms, control, frontend, manufacturing, and independent verification responsibilities; roles may be combined, but critical reviews require a non-author | Explicit task ownership, dependencies, and reviews; computer-assisted roles shall not be represented as physical third-party certification |
| PM-03 | Link requirements, design, CAD/BOM, models, firmware, frontend, verification, and released configurations; assess affected evidence after changes and reopen gates when necessary | Change records, versions/hashes, impact analysis, and renewed review |
| PM-04 | Distinguish completed, open, held, failed, and invalid-model states accurately; do not lower acceptance criteria to remove failures | Readable evidence is required for completion; unperformed physical tests remain NOT_RUN |

The new frontend scope does not automatically reinstate the old heavy automatic route or release an electronic complete-product manufacturing design. There is no current authorization to purchase, place orders, or send files to external contacts.

## 11 Deliverables and Acceptance

| Acceptance ID | Deliverable | Completion criterion | Current position |
|---|---|---|---|
| AC-01 | Complete Chinese and English requirements | Matching IDs, scope, parameter status, maturity boundaries, acceptance criteria, and open items; traceable sources | Current deliverable |
| AC-02 | Engineering design and manufacturing package for each product | EN-01 through EN-06 complete, independent D1 review, and no undefined critical internal mechanisms | L1 has limited D1; new mechanical/electronic candidates require separate review |
| AC-03 | Models, source inputs, and verification reports | Executable VV-01 through VV-04 with applicability domains and counterexamples | Partial L1 evidence exists; extensions follow actual capability |
| AC-04 | Frontend simulation environment and demonstrations | FE-01 through FE-14 implemented within the declared first-release scope, with startup, reproduction, browser, and content-check evidence | New SIM-010, awaiting implementation |
| AC-05 | Physical, imaging, and complete-use verification | Predetermined criteria, actual data, and the corresponding D2 review | M-070 pending |
| AC-06 | Small-batch manufacturing and delivery documentation | Reliability, manufacturing consistency, final inspection, and declared purpose established at D3 | Later phase |

AC-04 shall at least check three normal relative-airflow retrieval replays and wind-loss/deceleration counterexamples; actual effects of parameter changes or no-matching-data indications; play/pause, seeking, stage selection, reproduction, and export; display after the first invalid event; lens obstruction; mechanical/electronic capability labels; Chinese/English switching; keyboard operation; and reduced-motion options. Structure/budget candidates may support electronic comparisons before dynamic models exist. Suggested initial viewports are 360, 768, and 1440 px, with checks in desktop Chromium and at least one other available browser. These are proposed frontend acceptance checks in this version, not claims of executed tests.

Browser frame rate, maximum input size, and solve duration shall be frozen after selecting reference devices and cases. Record frontend interaction acceptance, numerical correctness, engineering content review, and physical verification separately.

## 12 Quantitative Metrics and Open Items

| Item | Known basis or current value | Action required to freeze it |
|---|---|---|
| Total product mass and carrying burden | L1 estimate approximately 3.0–3.4 kg; 2 kg team target unmet | Weigh within the same accounting boundary and set product metrics after user-task assessment |
| Airborne mass and wing size | L1 airborne design ceiling 340 g; 0.7 m is not a confirmed minimum wingspan | Joint assessment of camera/wing/suspension/tether mass and measured aerodynamics |
| Imaging height, distance, and tether length | Elevated view required; L1 maximum working external tether 2.5 m and launch pre-payout 0.8 m; early 4–6 m was exploratory | Jointly freeze full-body/environment composition, flight envelope, and retrieval clearance |
| Preparation, retrieval, and stowage durations | No user-confirmed seconds; animation durations are narrative time | Time actual glove/two-pole tasks and confirm acceptable burden |
| Image resolution, subject size, and usable fraction | Not frozen; values such as “24 usable seconds out of 30” were historical team comparisons | Continuous footage from the same camera with predetermined criteria and all attempts in the denominator |
| Ski speed, wind speed, slope, and turning envelope | Existing model points are not operating specifications | Measured conditions and failure envelope, with normal/abnormal limits |
| Tether force, force limits, braking, and clearance | Design/bench examples are not acceptable human-load limits | Measure real tether-path loads and establish criteria using consequences and uncertainty |
| Cold, wet snow, icing, and life | No complete-product environmental qualification | Set temperatures, cycles, and samples from declared purpose and failure mechanisms |
| Electronic endurance and battery | E-100 provides scenario energy accounts; no frozen battery pack | Measure loaded operation, static holding, cold effects, retries, and protection consumption |
| Cost, selling price, and production scale | No user-confirmed budget | Compare equivalent-function BOM, processing, assembly, maintenance, and development costs |
| Automation level | Manual assistance is permitted; a fully automatic cycle is unproven | Select functions after staged assessment of benefits, misclassification, and recovery burden |
| Frontend performance and computation | Platform, reference devices, and scale are not frozen | Measure frame rate, interaction delay, solving, and export times with reference cases |

Open metrics shall be closed before the relevant design freeze or the intended purpose shall be explicitly limited. Requirements, simulation interfaces, baseline replays, and verification inputs that do not depend on final values can proceed now.

## 13 Priorities and Implementation Order

The first priorities are requirements/configuration consistency, the L1 baseline simulation environment, visible failure boundaries, and inputs for subsequent physical verification. Then compare passive mechanical and backpack-side electronic benefits, use real load and action data to select routes, and complete manufacturing designs for selected routes. Fully automatic launch, docking, folding, and pouch stowage are extensions requiring separate justification.

The recommended sequence is requirements baseline REQ-010 → first simulation environment SIM-010 → measured parameters and controlled tests M-070 as resources permit → candidate models/detailed design and independent D1 → complete-use verification D2 → manufacturing consistency and delivery D3. Simulation and measurements may iterate together. The project plan governs dependencies without unconfirmed schedule or procurement commitments.

## 14 Sources and Requirement Traceability

Historical user requirements are supported by conversation extracts, scope documents, and plan records retained in the repository. This version does not claim a new full review of every historical chat. Precedence is the current explicit instruction, latest authorization and releases, evidence for the same configuration, then historical material. Earlier document status shall not override later releases or newly opened research scope.

| Source | Content and mapping |
|---|---|
| S01 [Collaboration instructions](../AGENTS.md) and [project plan](../PROJECT_PLAN.md) | Project entry, phase authorization, and management; PM-01 through PM-04 |
| S02 [First principles](00-first-principles.md) and [methodology](05-meta-methodology.md) | Innovation and evidence principles; Section 3, VV, PM; interpret old phase limits under the latest authorization |
| S03 [Backpack kite launch/retrieval supplement](11-backpack-kite-launch-recovery.md) | Carriage, size challenge, active retrieval, and action decomposition; PR, EN, SF |
| S04 [Multi-role product review](13-company-design-review.md) | User objectives versus team assumptions, two products, and complete-use cycle; PR, MC, EC, UX |
| S05 [Verification and simulation plan](14-verification-and-simulation-plan.md) | Models, physical behavior, intended purpose, manufacturing, and failure evidence; EN, SF, VV, FE |
| S06 [Mechanical product scope](15-mechanical-product1-scope.md) and [L1 release](../research/mechanical_l1/release/D1_RELEASE.md) | D1/D2/D3, operation R2, limited purpose, and animation gate; Section 2, MC, UX, FE-11 |
| S07 [Verification status](../research/mechanical_l1/release/VALIDATION_STATUS.md) and [dynamics](../research/mechanical_l1/dynamics/README.md) | Executed numerical checks, counterexamples, and physical NOT_RUN; VV, FE-05 through FE-08 |
| S08 [Existing animation](../output/l1-animation/README.md) | Three display types, manual actions, replay limits, and reusable frontend; FE-02, FE-05, FE-11 |
| S09 [Passive spring study](../research/passive_reel/feasibility-r1.md) and [direction sensing](../research/passive_reel/direction-sensing-r1.md) | Force/energy windows and direction-observation ambiguities; MC-03, MC-04 |
| S10 [Backpack-side electronic study](../research/electronic_tether/README.md) and its specialist files | Latest electronic research scope, control, drive, energy, and budgets; EC, Section 12 |
| S11 Current user instruction, 2026-10-13 | Frontend simulation with demonstration animations and complete bilingual requirements; FE-01, AC-01, AC-04 |

The detailed interaction, export, language, and acceptance provisions in FE-03 through FE-14 are derived requirements in this version based on those engineering objectives. Subsequent changes shall update both language versions, the associated tasks, and affected evidence.
