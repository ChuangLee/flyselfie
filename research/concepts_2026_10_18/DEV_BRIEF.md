# SIM-030 development brief: detailed simulation tests + animated demonstration per selected concept

User goal (2026-10-18): from first principles, find solo follow-cam solutions (no other person, no pre-placed cameras) with
good footage, minimal interference with skiing, convenient, safe and simple. Selected concepts get **detailed,
realistic simulation tests** and an **animated demonstration**. Make bold hypotheses, then validate them honestly, kill
criteria included.

## Where things are
- Concept lab page: `sim/concepts.html`, controller `sim/js/concepts/lab.js` (read it). Interface contract:
  `sim/js/concepts/README.md` (**read first**). Example module: `sim/js/concepts/baseline/`.
- Shared physics: `sim/js/concepts/common/skier.js` (skier dynamics, `skierAt`, `bodyPoints`), `common/env.js` (gusty
  wind, `footage()` metrics, `losJitter`, `stats`), `common/result.js`.
- Renderer: `sim/js/render/gl.js` (`frame()`: how `fs.gear.update(device, ctx)` and the product-camera inset `fs.pip` are
  used), `render/skier.js` (rig fields: `packC, packBack, packUp, packX, headPos, pelvisPos, shoulders, hands, basis,
  feet`), `render/world.js` (`toV`, `terrainHeight`), `render/gear.js` (kite example of PBR gear meshes).
- Ideation evidence: `research/concepts_2026_10_18/{aerial,body,radical}/concepts.json` and their `calc_*.py`. Reuse their
  numbers and cite them, but re-derive anything that you model dynamically.

## What you must deliver (only write inside your own paths)
1. `sim/js/concepts/<id>/`: replace the stub. `index.js` is the default export per the README; it must run in Node, with no DOM and no three.js.
   Put the physics in a separate `model.js` (or several files) and the browser gear and shots in `gear.js` (exports `createGear` and `shots`).
2. **Physics model**: time-stepped and deterministic, with real dynamics appropriate to the concept (see your task). Use
   `simulateSkier` for the rider and `makeWind` for wind. The sample dt for results is 0.02 s; the internal step can be smaller. Each scenario must
   compute in under ~1.5 s in a browser (main thread). Set `validUntil` when the model leaves its domain, and emit events for
   notable or invalid states.
3. **Scenarios (at least 6)**: one with id `nominal` (carving ~12 m/s, light wind), plus adversarial ones relevant to your concept:
   short turns, high speed (~18 m/s), gusty crosswind, rider fall, stop/start, obstacle/snag, failure of a key component, etc.
   Every scenario sets `expect` {zh, en}: what it tests and what would count as failure.
4. **Metrics**: report these standard ids where meaningful (the compare table uses them):
   `avail` (% of time the full body is in frame with subject ≥ 300 px in a 1920×1080-equivalent output), `pxMed` (median subject px),
   `jitterRms` (deg/s line-of-sight jitter after the stabilisation the product would really have), `azRange` (deg span of viewing
   azimuths achieved), `addedMass` (kg on the body), `bodyForcePeak` (N on the body from the device), `handsBusy` (% of
   time a hand is needed), `setupTime` (s, deploy + stow), `ops` (user actions per run), `keMax` (J, max device kinetic
   energy relative to snow/bystanders), `endurance` (min, cold). Add concept-specific ones too, each with a `pass`
   criterion derived from the user goal (state the threshold in `criterion`).
5. **Plots** (3–6) of the key time series, with `zh`/`en` labels.
6. **Demo**: `demo.duration` 40–60 s, contiguous stages with zh/en notes (`pending: true` where behaviour is not modelled
   or verified), and `build()` returning a Result whose `frame(t)` choreographs the full use cycle: carry, deploy/launch,
   film (including a turn sequence), then a scenario highlight (e.g. gust or fall handling), retrieve/land/stow. Prefer driving the demo from
   your physics where possible (scripted transitions are fine and must be marked as illustration).
7. **Gear** (`gear.js`): good-looking, plausible PBR meshes (carbon, anodised aluminium, rubber, lenses, rotor discs with
   motion blur discs when spinning, etc.), animated from `device` state; `hideInPip` lists meshes that should not block the product
   camera. Use the skier rig points in `ctx.skier` so attachments sit on the body. `shots()`: a director shot list for
   `mode === 'demo'` (and optionally for test mode) that frames the device and the rider well.
   The `productCam` in each frame is what the product really records (for 360 cameras: a reframed perspective crop aimed at the
   rider, with its real angular resolution reflected in metrics).
8. **Tests**: `sim/tests/concept_<id>.test.mjs` (node:test): checks of physics sanity (energy/limits, convergence with dt,
   expected qualitative behaviour per scenario). `cd sim && npm test` must stay green, including `tests/concepts.test.mjs`.
9. **Results record**: `research/concepts_2026_10_18/dev/<id>/results.json` (run all scenarios via a small Node script
   `research/concepts_2026_10_18/dev/<id>/run_all.mjs`; write metrics, events and key extremes per scenario). Don't write .md files.
10. **Visual check**: a static server is already running at http://localhost:8765/ (serving `sim/`). The screenshot helper
    `python3 /tmp/claude-0/-root-ai-workspace-flySelfie/c2f81e22-e51a-458b-a273-915c6aba65e2/scratchpad/lab_shoot.py OUTDIR <id> <test|demo> t1,t2,... [low|high|ultra] [scenarioId]`
    uses headless Chrome with software WebGL (slow, about 10–20 s per frame), and writes PNGs to OUTDIR (use your own
    folder under the scratchpad). It prints console errors, which must be zero. Look at your frames and iterate until the gear looks
    right, sits correctly on the body, and the shots frame it well.

## Boundaries
- Do NOT edit shared files: `sim/js/concepts/common/*`, `lab.js`, `index.js`, `render/*`, `app.js`, other concepts, `project/`,
  `docs/`, `AGENTS.md`. If a shared hook is missing, work around it locally and mention it in your final report.
- Don't deploy, purchase or contact anyone. Evidence: numerical-uncalibrated simulation plus illustration; mark assumptions
  `ASSUMED`; never call anything validated or physically tested.
- Final reply (≤400 words, English): model summary, per-scenario key results with pass/fail, verdict against the kill criteria,
  honest limitations, and the files changed.
