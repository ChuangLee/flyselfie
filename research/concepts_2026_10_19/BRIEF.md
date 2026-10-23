# Round 2 brief (2026-10-19): original concepts + the kite, made usable

## The user's words (translated)
1. "Why did you drop the kite concept? Did your calculations suggest it was unlikely to work? This is one concept I definitely
   want you to dig into and keep refining until it's actually usable."
2. "This round of work falls way short on both originality and practicality. All four ideas are basically the same old stuff
   that's already all over the market. We need completely original ideas. Think way outside the box and come up with designs that
   are surprising but still make sense. Drones currently have very short battery life in this kind of environment, and you pretty
   much need someone else to help with filming, so they won't work for solo use unless you make major improvements. In any case,
   don't just recycle solutions that are already everywhere."
3. "Everything also needs to be as easy as possible to set up, take down, and pack away."
4. "Look at the breakthroughs across different industries over the past few years. Could we apply any of those cutting-edge
   technologies to this project, even if they seem completely unrelated at first glance?"
   "Work on the concepts in parallel and fully develop four solutions, including the kite concept."

## Fixed goal and hard rules (unchanged)
A skier films themself in third person (follow-cam) with NO other person and NO pre-placed/environment cameras. Good footage,
minimal interference with skiing, convenient, safe, simple. Generated/hallucinated imagery may never be presented as real footage
(reconstruction is allowed only inside the region really observed by the device, and must be labelled). No purchasing, outreach,
physical experiments. Simulation and calculation are not physical verification; label assumptions ASSUMED.

## What round 1 produced (and why the user rejected it)
`docs/20-concept-selection-zh.md`, `research/concepts_2026_10_18/{aerial,body,radical}/concepts.json` (36 concepts, A01–A12,
BODY-01–12, R00–R11 — READ these so you do not repeat them). Finalists were helmet cam, 360 backpack boom ("invisible selfie
stick"), follow drone, tethered drone: all on the market. Harmonised criteria: `sim/js/concepts/common/criteria.js` (12 metrics
incl. new packVol ≤3 L). The kite (A04–A07, A12) was screened out by magnitude calcs (`aerial/calc_kite.py`): tether elevation
~74° (top-down view), falls below ~6.2 m/s airspeed (every stop, slow traverse), 12–38 N pull ∝ V², ±56 % per 3 m/s gust,
"lands at every stop". It was never dynamically simulated with an active design.

## What counts as original
Not available as a product, not a trivial variant of one (check with web search; cite what you found). Surprising but physically
sound. Prefer concepts that derive from an energy/physics insight (e.g. the slope gives gravitational energy to anything that
descends with the skier; the skier's motion creates apparent wind; snow is a low-friction, soft landing surface; the lift carries you
uphill for free) or that transfer a recent breakthrough from another industry (aerospace deployables, airborne wind energy,
soft robotics, materials/batteries, sensing, bio-inspired flight, sailing/foiling, broadcast camera systems, guided parafoils,
medical, automotive, toys/entertainment, AI/computational imaging within the honesty rule...).

## Setup/stow is now a first-class criterion
Every concept states the full user sequence with timings: unpack at top, deploy, ride, stop, lift ride, stow, end of day.
Target ≤30 s standstill per run, ≤2 actions, ≤3 L packed, one gloved hand.
