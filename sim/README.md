# SIM-010 Frontend Design Simulation Environment / 前端设计仿真环境

First-release implementation of FE-01…FE-14 in
[docs/16-project-requirements-en.md](../docs/16-project-requirements-en.md) §9.
Plan task: `SIM-010` (`python3 project/plan.py read SIM-010`).

> **Evidence boundary.** The signed L1 configuration (`research/mechanical_l1/release/`),
> the L1 dynamics model and its five replays, and the earlier `output/l1-animation`
> were **not present** when this environment was built. Values marked `REQ` come
> from the requirements text (tether max 2.5 m, pre-payout 0.8 m, airborne ceiling
> 0.34 kg). Everything marked `ASSUMED` is a placeholder. Results are uncalibrated
> numerical evidence for a placeholder configuration and **are not L1 results**.
> Nothing here is a physical test; M-070 remains NOT_RUN.

## Start

No build step and no runtime dependencies (Node ≥ 18 only for the server/tests).

```bash
cd sim
npm start                # → http://localhost:8080/   (node tools/serve.mjs 8080)
npm test                 # solver code-verification + i18n checks (node:test)
npm run gen-reference    # regenerate data/reference/*.json after model changes
```

Deployed at **https://blind.pub/flyski/**: `sim/tools/deploy.sh` runs the tests, then copies only `index.html`, `css/`, `js/`, `data/` to `/var/www/flyski/`. nginx: `/etc/nginx/snippets/flyski.conf`, included from `/etc/nginx/conf.d/3xui.conf` (pre-change backup `/etc/nginx/3xui.conf.before-flyski.bak`).

ES modules and module workers need HTTP, so opening `index.html` via `file://` is not supported. Any static server works.

## Modes

| Mode | Content | Evidence label |
|---|---|---|
| 工程几何 Engineering geometry | Static configuration with dimension callouts tagged `REQ`/`ASSUMED`, body volume, docking zone | geometry, not full CAD |
| 数值仿真/回放 Numerical sim / replay | 13 scenarios (9 numerical, 3 illustration, 1 pending), parameters, 3D + onboard camera views, synchronized plots, events, export | numerical-uncalibrated / replay / illustration / pending |
| 演示动画 Demonstration | 60 s complete-cycle illustration (carry → prepare → launch → payout → film → retrieve → dock & latch → short stop → stow), stage selection, action notes. Launch, payout, docking and stowage show the semi-automatic **backpack launch-boom concept** (not L1, marked ⧗ pending) | illustration; banner “工程设计演示——待实物测试 / Engineering design demonstration — physical testing pending” |
| 候选比较 Compare | L1 vs P-010/P-020 vs E-100…E-130 on one task boundary; unknowns kept unknown | structure/capability |

## Photoreal rendering (SIM-011)

The 3D view runs on three.js r170 (vendored in `vendor/three/`, MIT) using the viewer's own GPU. If WebGL 2 is unavailable it falls back to the Canvas 2D renderer automatically.

- **Environment:** physical sky (Preetham `Sky`) with a procedural cumulus/cirrus dome and a polariser-style zenith deepening provides the background; the sky also provides the image-based lighting, with a matched sun casting soft shadows. The snow is PBR (Poly Haven "Snow 02", CC0) with world-space texturing, anti-tiling and crystal glints. The piste runs down an open mountain face into a valley, with instanced snow-laden conifers (near and far LOD) and distant ridgelines with rock bands and atmospheric haze.
- **Skier:** procedural rig posed by world-space two-bone IK. Lean comes from lateral acceleration, crouch from speed, and pole plants are timed to edge changes. Outerwear uses sheen fabric with a bump map; there's a clear-coat helmet, iridescent goggles, sidecut skis, and a backpack with the L1-style reel and a crank that turns while retrieving.
- **Gear:** ripstop delta kite (billowed canopy, carbon spars, keel, bridle), twin-lens 360° camera on a suspension, and a Dyneema tether. The bridle tow point is placed exactly on the solver's point mass.
- **Effects and post:** snow spray and carved tracks run on the shared timeline, so pausing freezes them and playback speed doesn't change them. Post-processing applies MSAA, bloom, depth of field in close shots, AO on Ultra, ACES tone mapping, a display-space grade, film grain, vignette and an optional 2.39:1 letterbox.
- **Launch-boom concept (demo only):** the folded wing rides in a cradle on a spring launch boom hinged on the pack lid. One pull on a shoulder-strap release raises the boom behind and above the head, and the wing unfolds and weathervanes in the cradle. On push-off the wing leaves the cradle automatically when lift exceeds the release force, then climbs *behind* the skier, never from in front of the chest. Payout is brake-metered. The L1 hand crank winds the wing back into the tip funnel, where it seats and latches (green light), and the boom folds flat for stowage. This is a design concept, not the L1 manual-launch operation, and the numerical “Start & launch” scenario still models a hand release; every stage that depends on it is marked pending.
- **Demonstration director:** 12 shots (establishing vista, strap-pull medium, rear close on the unfolding cradle, low side-rear launch, payout track, heli arc, onboard fisheye insert, ground pass, wide retrieval, docking close-up, short-stop orbit, crane out with end card), with lower-thirds per stage. Turning off "Director camera", or turning on reduced motion, switches to a free orbit.
- **Onboard camera:** a cube capture at the lens node is remapped to an equidistant fisheye (nadir axis, heading up). It runs at about 4 Hz during playback and once when paused.
- **Labels in frame:** the evidence tag, the "工程设计演示——待实物测试" banner (in demo mode) and invalid-state warnings are drawn into the WebGL frame itself. They are therefore present in screenshots and in **Record video** (WebM, real-time capture of the canvas).
- **Quality presets:** Smooth / High / Ultra (`?quality=` URL parameter or the toolbar; remembered per browser).

**Presentation boundary:** better visuals don't raise the evidence level (§9.1). Simulation motion is still the uncalibrated point-mass solution, and the demonstration is still a scripted illustration with narrative timing. The skier, kite planform and camera are illustrative geometry rather than L1 CAD, and the slack-tether sag is drawn only to show slack; its shape isn't modeled. G-MATURE remains closed, so none of this is a mature-product promotional film.

**Known visual limits:** the character is a procedural mannequin (no sculpted body, cloth simulation or facial detail), trees are stylized cones, and clouds are a 2D procedural layer (no volumetrics). Matching scanned assets and offline path tracing would need artist-made assets and a GPU render pipeline (e.g. Blender Cycles or Unreal), which this server doesn't have.

## Structure

```
sim/
  index.html, css/app.css
  js/app.js                 controller: modes, timeline, worker, replays, export, keyboard
  js/worker.js              solver worker (cancel = terminate)
  js/i18n.js                zh/en text (zh default)
  js/model/config.js        CONFIG, MODEL (+limits), MODEL_CONSTANTS, PARAMS (unit/range/source), validation
  js/model/scenarios.js     scenario catalogue with evidence type, schedules, stages
  js/model/solver.js        bounded solver, events, result schema flyski-sim-result/1, JSON/CSV export
  js/model/candidates.js    comparison table data
  js/model/util.js          canonical JSON, FNV-1a, seeded RNG, vectors
  js/ui/view3d.js           Canvas-2D perspective renderer + orbit control
  js/ui/camview.js          nadir fisheye camera view
  js/ui/plots.js            time-series plots on the shared timeline
  js/ui/demo.js             scripted complete-cycle illustration
  js/render/gl.js           WebGL view: frame state → scene, cameras, HUD, recording
  js/render/world.js        sky, sun, snow, terrain, trees, ridges
  js/render/skier.js        procedural skier rig + IK posing
  js/render/gear.js         kite, camera payload, tether, engineering overlays
  js/render/fx.js           snow spray, ski tracks
  js/render/post.js         post-processing, in-frame HUD, fisheye
  js/render/director.js     demonstration shot list
  vendor/three/             three.js r170 (MIT);  assets/  CC0 textures (see assets/README.md)
  data/reference/           reference replays (default inputs) with input hash + checksum
  tools/serve.mjs           static server;  tools/gen-reference.mjs
  tests/*.test.mjs          node tests;  tests/browser_check.py  Playwright interaction check
```

## Model `pm-tether@0.1.0`

A point-mass kite (airborne mass including the camera) sits on a straight spring-damper tether anchored at the backpack. The skier follows a kinematic path on a planar slope, with seeded Ornstein-Uhlenbeck gusts. Relative airflow combines wind, skier motion and reel motion (EN-02). Lift and drag use constant CL/CD. Lift direction blends tether-aligned and roll-stabilised vertical lift through the assumed parameter β. Payout is commanded. Retrieval speed is limited by finite operator power, solving T(s)·s = P_op with the damping term included (MC-03).

Domain exits raise `invalid` events (VV-04): low airspeed (lift loss is not modeled), sustained slack, ground contact (the kite freezes and forces become *unavailable*), and the kite centre entering the body volume. Other conditions only warn: envelope intrusion, low clearance, tether crossing the head in frame, subject outside FOV. Near-end retrieval ends the numerical scope (`model_scope_end`), because handover, locking and stowage are illustrations only. After the first invalid event the run is still displayed for inspection, shaded and labelled as outside validity.

Known modeling choice: with β = 0 (pure tether-aligned lift) the point mass is laterally unstable even under 0.1 m/s gusts. The default β = 0.7 stands in for the attitude dynamics this model doesn't have, and is an ASSUMED parameter.

### Default-input outcomes (placeholder configuration, uncalibrated)

| Scenario | Outcome |
|---|---|
| launch | valid to 14 s; low-clearance warning after release |
| film_turns | valid to 30 s |
| retrieval_headwind | invalid at 7.76 s: kite centre enters body volume (head region) during the final retrieval |
| retrieval_calm | invalid at 7.19 s: airspeed below model domain |
| retrieval_crosswind | reaches near-end at 8.30 s; scope ends (handover not modeled) |
| wind_loss | invalid at 11.52 s (low airspeed), then ground contact |
| abrupt_stop | invalid at 6.85 s: ground contact |
| slack_overpayout | invalid at 3.30 s: sustained slack |
| reel_jam | invalid at 8.29 s: slack, then low airspeed and ground contact |

These are properties of the placeholder model and inputs, offered as prompts for engineering review. They are not predictions about L1.

## Requirement coverage (first release, §9.2)

| ID | Implementation | Status / limits |
|---|---|---|
| FE-01 | this app, start instructions, sample configurations (scenarios), reference replays, demonstration | done |
| FE-02 | evidence banner (config, model, evidence level, pending tests), always visible; per-mode labels | done |
| FE-03 | parameterized skier/slope/wind/wing/camera/tether; orbit, zoom, 1 m grid, dimension callouts | skier is a stick figure and the wing a flat diamond (labelled illustration geometry); L1 CAD not available |
| FE-04 | units, ranges, sources, defaults; invalid input rejected; unsupported parameters shown disabled; auto-recompute or “no matching replay” | done |
| FE-05 | versioned result schema; one timeline for play/pause/reset/seek/speed; seed makes runs reproducible; playback speed doesn't change physics | done |
| FE-06 | 6 synchronized plots; NaN shown as “unavailable” | done for available signals |
| FE-07 | launch, filming/turns, 3 retrievals, wind loss, abrupt stop, slack, jam (numerical); handover, short stop, stowage (illustration); power loss (pending) | done |
| FE-08 | ground, body clearance, envelope intrusion, tether over head in frame; first-event time and location | **tether entanglement not implemented** (stated in model limits) |
| FE-09 | nadir fisheye from explicit lens node, FOV parameter, subject angle, tether–head separation | synthetic geometry label |
| FE-10 | comparison table on one task boundary | electronic and passive candidates are structure/capability only; no dynamic models |
| FE-11 | complete-cycle illustration with stages and action notes; pending stages marked ⧗ | G-MATURE closed, so this isn't a product introduction; L1 R2 operation text unavailable, so gestures are generic |
| FE-12 | export of config JSON, result JSON (checksummed, failures kept), CSV; result import; snapshot PNG with evidence label | done |
| FE-13 | zh default + en; keyboard (Space, ←/→, Shift, Home, [ ], canvas arrows/±); reduced motion (0.5 s discrete steps, no continuous camera follow); starts paused; states shown with text + icons, not color alone; responsive at 360/768/1440 | second browser NOT_RUN (see below) |
| FE-14 | solver in a module worker with cancel; loading/running/invalid/no-data states; global error handler | done |

## Verification record

Run 2026-10-14 in this repository. These are frontend and code checks only, not numerical validation against physics (VV-03) and not physical tests.

| Check | Result |
|---|---|
| `npm test`: 16 tests covering determinism, input rejection, analytic steady force balance (tension within 0.5 %, elevation within 0.01 rad), ½ρSV² scaling, energy bookkeeping, dt-halving convergence (< 1 %), event order and validUntil, slack and β = 0 counterexamples, near-end scope, operator power bound, export round-trip and tamper detection, reference freshness, i18n completeness | 16/16 pass |
| `tests/browser_check.py` in Google Chrome (headless) at 1440 px | pass, 0 console errors: replay matching, play/pause, keyboard seek, stage chips, parameter change → recompute, invalid input rejected, CSV/JSON export, re-import, pending and illustration scenarios, demo, geometry, compare, zh→en, reduced-motion stepping |
| Viewports 768 / 360 px | no horizontal page overflow |
| Same browser check against the live deployment https://blind.pub/flyski/ | pass, 0 console errors |
| SIM-011 WebGL: `tests/browser_check.py` in headless Chrome with SwiftShader (software WebGL) | pass, 0 console errors. WebGL view active; quality switching, director toggle, all previous checks |
| SIM-011 visual review | frames reviewed by the author only (sim view, 12 demo shots, geometry, fisheye). **No non-author visual review, and no frame-rate measurement on real GPUs (NOT_RUN)** |
| Second browser (Firefox/WebKit) | **NOT_RUN** (none installed) |
| Frame rate, solve time on reference devices | **NOT_RUN** (reference devices not selected, per §11/§12). Indicative only: each scenario solves in roughly 0.1–0.5 s in Node on the build machine |
| Engineering content review by a non-author (PM-02) | **NOT_RUN** |

## Next steps

1. Import the L1 release configuration, model and five replays. Replace ASSUMED values and connect L1 replays through the `flyski-sim-result/1` import path.
2. Get a non-author engineering review of the scenarios, events and thresholds.
3. Run the check in a second browser and freeze performance metrics on chosen reference devices.
4. Add dynamic models for the passive spring and electronic candidates once they exist and have been checked, including power loss (EC-05).

## Concept lab

`concepts.html` (served at https://blind.pub/flyski/concepts.html) hosts the follow-cam concept simulations and demos: kite2, towglider, descentglider, leapfrog, plus the round-1 concepts. Shared full-run rules live in `js/concepts/common/` (`criteria.js`, `fullrun.js`, `components.js`, `env.js`). Results are numerical, uncalibrated simulations, not physical verification; see `docs/20-concept-selection-zh.md` §7.
