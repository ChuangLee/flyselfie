# SIM-032 phase 2 — integrated design + simulation build (2026-10-20)

Read first: BRIEF.md (rules), science_aero/report.json, science_control/report.json, engineering/report.json, product/report.json (+ summary_zh.md).

## Where the four phase-1 reports agree (adopt as baseline)
1. **Reel in a worn back/hip unit, never on the flyer** (aero H5, engineering B rejected: flyer reel → ≥156–200 g → over the KE cap).
2. **The reel does not chase tension.** Fast tension/elevation control is done by the flyer (lift/CL, airbrake/depower, roll steering); the reel holds length, cancels body motion at the exit, takes up slack, retrieves (aero H3/H9, control H3). Series shock spring in the fairlead (control H5, aero H11 26–52 mm stroke).
3. **Low apparent wind is a gate, not a flight regime.** At stops: brake/deep-stall → land behind or dock while still moving → retrieve & dock; relaunch on the next straight glide (aero H2/H11, control H6/H7). Never fast reel-in at a hockey stop (38–145 J, 0.1 m from helmet).
4. **Head clearance is set by the exit position**, not by the line angle: exit/launch station ≥≈0.95–1.0 m from the helmet (lumbar quiver 0.55 m behind the pivot / rear boom / hip holster), elevation held ≤55° (engineering, aero H1).
5. **Elevation 40–60° by braking**, which also gives bodyPx ≥300 at 5–10 m and kills the clothesline (line high behind the rider) (aero H1/H9, engineering finding 2).
6. **Autonomy needs**: GNSS + baro + IMU start/stop detection with lift lockout (30 m post-lift), session arm, aerialway geofence (control H1); flyer air data (pitot) + attitude; no wind from tension alone (control H2).
7. **Safety hardware**: weak link (body force ≤40 N), spring-guillotine cutter, breakaway quiver ≤60 N, mechanical 50 m end stop, no propulsion on the flyer (product/regulation).

## Open conflicts the build must settle with numbers
- **KE**: control H11 found median peak 32 J (tether swings ≈ double speed) vs aero H4 worst 13 J at 130 g. Model the swing dynamics properly (pendulum about the exit, roll steering, braking) and report the KE distribution; find the mass/envelope where ≤14.9 J holds (fast riders may have to be refused, as leapfrog does).
- **Head clearance in closed loop**: control H10 found 0.01–0.08 m with its exit; engineering lumbar quiver claims ≥1.0 m up to 55°. Test with `helmetAt`.
- **Launch from the back**: control H6 found whip into the snow below 5 m of line while carving; engineering spring launch from the quiver. Test straight-glide-only launch with ≤2 m/s pay-out to 6 m.
- **Dock arrival speed**: glider 5.1 m/s vs kite 1.6 m/s (control H7) vs engineering 60–96 % capture. Model capture success vs arrival speed/angle (ASSUMED capture model, disclosed).
- **Flyer type**: folding delta (engineering, 111 g) vs low-wing-loading kite (control) vs rigid glider (aero G130). Evaluate at least delta and kite variants.
- **Camera**: on the flyer (braked to 45–60°) vs clamped on the line 5–6 m from the exit (aero H8). Evaluate both.
