# FlySelfie design history: English overview

This is a summary of the Chinese design record ([docs/17](../17-project-review-and-product-directions-zh.md)–[20](../20-concept-selection-zh.md)). Every number below is analysis or **uncalibrated numerical simulation**. Nothing has been built or flown, and the physical-test milestone (M-070) has not been run.

## 1 Goal and scope
The goal is a product that lets one person get good **third-person follow footage of themselves** with no helper. They carry it, deploy it, recover it and retrieve the footage on their own; it should disturb the sport as little as possible and be convenient, safe and simple. Companion filming and pre-placed environment cameras are out of scope. Skiing is the demanding reference use case ([docs/19](../19-solo-follow-filming-scope.md)).

## 2 Shared judging (the "concept lab")
All concepts run on one browser simulator (`sim/concepts.html`). It uses a shared skier model calibrated to the literature (carving and short turns, push-off, hockey stop, fall), a von Kármán gust wind field and a common footage metric. Judged runs use a **48-case full run** (calm, plus 3/6/9 m/s headwind, tailwind and left/right crosswind, plus 3.5–5.5 m/s tailwind, each with 3 seeds) and **13 shared criteria**:

| Criterion | Target |
|---|---|
| Usable full-body footage | ≥80 % |
| Subject size | ≥300 px |
| Jitter | ≤3 °/s |
| Commandable viewing span | ≥45° |
| Worn mass | ≤1.5 kg |
| Body force | ≤40 N |
| Hands while moving | ≤5 % |
| Standstill per run | ≤30 s |
| Actions per run | ≤2 |
| Strike energy | ≤14.9 J (FAA Part 107 cat. 2) |
| Packed volume | ≤3 L |
| Line/flyer clearance to the head | ≥1.0 m |
| Endurance at −10 °C | ≥45 min |

Several of these are ASSUMED design targets. Wind gates must use an onboard wind *estimate*, and judged runs may not use idealised actuators or estimators.

## 3 Round 1: 36 concepts → 3 finalists (2026-10-18)
Three creative teams covered aerial, body-borne and radical/computational ideas. First-principles findings:

- **Body-worn cameras can't give a true third-person view.** Even 8 cameras cover at most 47 % of the visible body.
- **Snow-surface carriers are dangerous.** They overrun the rider and carry around 1 kJ of energy.
- **Throw-and-catch doesn't work.**
- **A long helmet pole loads the neck.**
- **The passive kite of the time was ruled out.** It films mostly from overhead, falls below about 6 m/s and pulls 12–38 N.

The finalists were a backpack 360° boom (S1), a drone that replays the rider's track (S2) and a backpack-powered tethered rotor (S3). After calibration and v3 redesigns, S3 met all criteria in its design cases, S2 was limited to calm air at ≤13 m/s, and S1 was limited to gentle cruising.

## 4 Rounds 2–4: original concepts (2026-10-19/20)
Cross-industry scouting led to four original concepts:

- **K2:** a reefable drogue kite.
- **Leapfrog:** a gravity glider that rides the slope's energy and lands ahead of the rider.
- **Towed glider.**
- **Descent glider.**

Each round tightened the shared rules and was followed by independent audits (`research/concepts_2026_10_19/audit*`). In round 4:

- **Leapfrog:** the only concept "conditionally usable" in simulation (82 % footage, thin margins).
- **K2:** failed on geometry. The line from the body to the kite either crosses the camera's view or hangs low behind the rider (a "clothesline"), and the thin boom needed to avoid this can't be built.
- **Towed glider:** failed in tailwinds.

## 5 AT-1: active-reel tethered glider (SIM-032, 2026-10-20)
The user asked for a reel that pays out automatically, "pumps" the line like a kite flyer when lift drops, and docks the flyer back onto the back. Scientists, engineers, product managers and a simulated user panel designed and reviewed AT-1:

- a lumbar reel;
- a 0.55 m hinged quiver tube as the line exit and dock;
- a 116 g folding delta wing;
- a stop sequence of brake, land, tow and dock.

**It failed 5 of 13 criteria:** usable footage 16.7 %, strike energy 57 J and head clearance 0.014 m. Three of these are capped by physics:

- Carving swings the line exit about ±8 m, which whips the flyer to 25–31 m/s.
- At stops the flyer passes near the head.
- Tailwinds leave too little airflow.

Conclusion: "fly it like a kite" is wrong as a fast control law, but right as slow length management and retrieval.

## 6 SledPack (SIM-033/034, 2026-10-21)
The user asked: *why does the kite need a pole on your back?*

**Why the pole existed.** A line can never pass farther from the head than its exit point is. Every pole-free exit on the body is within about 1 m of the helmet, so a ≥1 m line-clearance rule forces a pole ([why_pole.py](../../research/sledpack_2026_10_21/why_pole.py)).

**v1 (sledpack@0.1.0, I9):**
- a 71 g single-skin sled kite with a camera pod, carried in a spine sleeve with its mouth at the sacrum;
- a two-drum pack reel (main line + depower line);
- launch when there is enough apparent wind and the tailwind is ≤6 m/s;
- at stops, a fast pull-down while the rider is still sliding.

Result: 8 of 13 criteria. The line came as close as 0.40 m to the head, footage was 43 % and jitter 6.4 °/s. An independent review corrected optimistic camera power and stow-length assumptions.

**User decisions.** User experience comes first:

- no pole;
- the kite may stay unfolded on the back, and chairlift use is not a constraint;
- the line may *briefly* come within 1 m of the head;
- the kite should fly higher and farther when the rider is fast and the wind is strong;
- tailwind limits and a fixed viewing angle are acceptable.

**v2 (sledpack@0.2.0, I10):**
- the open kite rides flat on the back, held by magnetic seats;
- the line exits from a short tab on the rear of the hip belt, about 1.2 m from the helmet;
- the kite launches by dropping into the rider's wake;
- line length runs from 5 to 12 m depending on apparent wind (v2.1: capped at 9 m, tailwind limit 5 m/s, 0.8 s peel-off from the back modelled, swing guard);
- the lens tilts 8° toward the rider;
- at stops the kite usually parks on the snow and relaunches from there.

Results:

| Judgement | Result | Details |
|---|---|---|
| Shared criteria | 8 of 13 | — |
| User-revised: contact | pass | No contact; closest approach 0.49 m |
| User-revised: "brief" | fail in tailwind and strong crosswind | The kite swings behind the head each turn, for up to 21 % of riding; v2.1 swing guard keeps each pass ≤1.9 s, but the ≤5 % share still fails (26/48 cases meet both) |
| Usable footage | 45 % (v2.1: 48 %) | — |
| Strike energy | 14.4 J (v2.1: 13.6 J) | Thin margin |
| Endurance | 50 min (v2.1: 49 min) | At −10 °C |
| Launch to filming | 1.9 s | — |

Steering (moving the kite left, right, up and down) was estimated at about +25–30 g and about 15–20 USD, and was not adopted.

## 7 Concept film
The bilingual promo films (`output/video/`, released as GitHub Release assets) were rendered with the project's own three.js renderer. Every frame is labelled *concept visualisation · simulated render · not physically tested*. Only criteria that pass in simulation are presented as results; the rest are listed as "still open". A short segment suggests other possible uses (running, cycling, motorcycling, driving on closed tracks). These are **not simulated or evaluated**, and local road and airspace rules apply.

## 8 What's next
The open problems are listed in the [README](../../README.md#-help-build-it):

- tailwind swing;
- re-docking onto the back;
- jitter;
- the rider wake model;
- sled-kite aerodynamic data;
- other sports;
- above all, physical prototype tests.

The physical tests are listed in [research/sledpack_2026_10_21/dev/REPORT.md](../../research/sledpack_2026_10_21/dev/REPORT.md).
