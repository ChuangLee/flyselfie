# Contributing to FlySelfie

**English** · [简体中文](CONTRIBUTING.zh-CN.md)

Thanks for helping! This project lives on careful, honest engineering, and every contribution is welcome: code, physics, data, a reasoned "this can't work", translations.

## Ground rules (please read)

1. **Simulation is not verification.** Never describe a simulated or animated result as tested, proven or measured. Physical tests are only "passed" when they were actually run, with data attached.
2. **Label renders.** Any generated image or film must be marked as a simulated render or concept. It must never be presented as real footage.
3. **Cite or mark ASSUMED.** Every non-trivial number needs a source (URL, datasheet, paper) or the label `ASSUMED`.
4. **Don't tune to the judge.** Shared criteria live in `sim/js/concepts/common/`, and every concept is judged by the same rules. To change a rule, propose it in an issue with a rationale. Don't change it inside a concept PR.
5. **Safety first.** Don't post instructions for flying near people, roads, ski lifts or power lines. Physical experiments are your own responsibility and must follow local law.

## Getting started

```bash
cd sim
npm start          # http://localhost:8080 — index.html (kite simulator), concepts.html (concept lab)
npm test           # node --test tests/*.test.mjs  (several minutes; must stay green)
npm run gen-reference   # after changing the main solver or scenarios
```

There's no build step and no runtime dependencies: plain ES modules plus a vendored three.js.

## Adding or improving a concept

The concept-lab contract is described in [sim/js/concepts/README.md](sim/js/concepts/README.md). In short, a concept folder `sim/js/concepts/<id>/` exports:

- `simulate(params)`, which returns a `Result` with metrics judged by `common/criteria.js` (`addStd`);
- `demo.build` / `frame(t)` for the animated use cycle, including a `productCam` inset (what the product's own camera sees);
- `gear.js` for the 3D geometry;
- a test file `sim/tests/concept_<id>.test.mjs`.

Judged runs use the shared 48-case set (`FULLRUN_CASES_R4`), `windEstimate` (never true wind) and `helmetAt()` for head clearance. They must not use idealised actuators or estimators. Put study scripts and results under `research/<topic>_<date>/`, with a short README or REPORT.

## Proposing an idea or a rule change

Open an issue using the **Idea / concept proposal** template. State:

- the hypothesis;
- how it could be falsified;
- the numbers you expect, with sources or ASSUMED labels;
- which shared criteria it affects.

Bold ideas are welcome, as long as they come with the test that could kill them.

## Pull requests

- Keep PRs focused, and describe what changed and how you checked it (tests, runs, plots).
- `npm test` must pass.
- For docs, Chinese and English versions are both welcome. If you only write one language, say so, and someone can translate.
- Be kind in reviews. Argue with data, not people.

## Maintainer / agent workflow

The maintainers use a plan file (`project/plan.json`, edited only with `python3 project/plan.py`) and process rules written in Chinese in [AGENTS.md](AGENTS.md) and [CLAUDE.md](CLAUDE.md). This includes AI-agent collaboration, where only the integrator updates the plan and deploys. Contributors don't need to touch the plan; maintainers will link issues and PRs to plan tasks.
