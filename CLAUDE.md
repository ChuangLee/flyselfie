# CLAUDE.md

Follow [AGENTS.md](AGENTS.md); it is authoritative (written in Chinese). Key points:

- Before any substantive work, read the plan (`python3 project/plan.py read`) and register the action with `python3 project/plan.py start TASK-ID --actor ROLE --note "..."`. Record results with `update` and readable `--evidence`. `project/plan.json` is the only source; `PROJECT_PLAN.md` and `project/plan.csv` are generated views.
- Never mark a physical test as passed when it hasn't been run (`not_run`). Animations and simulations aren't physical verification. Mature-product animation requires the `G-MATURE` gate, which is currently closed.
- Requirements: `docs/16-project-requirements-en.md` (zh version authoritative, currently missing).
- Simulator: `sim/` (no build; three.js vendored in `sim/vendor/three`, renderer in `sim/js/render/`). `cd sim && npm test` runs the solver/i18n tests, `npm run gen-reference` must be rerun after any solver or scenario change, and `npm start` serves on :8080. Values marked `ASSUMED` in `sim/js/model/config.js` are placeholders until the L1 release is imported.
