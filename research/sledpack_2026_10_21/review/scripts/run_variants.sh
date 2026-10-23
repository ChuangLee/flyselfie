#!/bin/bash
# Runs the review variants on the patched copy. Usage: SIMROOT=/copy/sim OUT=/path/variants.jsonl bash run_variants.sh
H=$(dirname "$0")
run() { REV_JSON="$1" node "$H/rev_ens.mjs" "$2" "$3" >> "$OUT"; }
run '{"camW":0.5,"camG":3}' '{}' cam48_activetether_basis
run '{"camW":0.8,"camG":3}' '{}' cam48_towglider_basis
run '{"rawDrift":1}' '{}' rawDrift_as_activetether
run '{"fitCheck":1}' '{}' fitCheck_real_axis
run '{"bundle":1}' '{}' folded_bundle_outline
run '{"tailMax":6}' '{}' tail_envelope_6
run '{}' '{"massScale":0.92}' mass_minus8pct
run '{"exitF":-0.30,"exitU":-0.25}' '{}' exit_lower_back
run '{}' '{"Lfilm":9}' line9m
run '{"tailMax":6}' '{"massScale":0.92}' tail6_mass92
run '{"camW":0.5,"camG":3,"fitCheck":1,"bundle":1}' '{}' corrected_baseline
