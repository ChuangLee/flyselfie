#!/bin/bash
# SIM-034 review variants on a COPY of sim/. Usage: SIMROOT=/copy/sim OUT=/path/I10_variants.jsonl bash run_I10.sh
H=$(dirname "$0"); r() { node "$H/rev2_ens.mjs" "$1" "$2" >> "$OUT"; }
r '{}' base_I10
r '{"tailScale":1.5}' tail_drag_x1.5
r '{"twMax":4.5}' tailwind_limit_4.5
r '{"LmaxS":9}' line_cap_9m
r '{"wake":0}' no_wake
r '{"twMax":5}' tailwind_limit_5
r '{"tailScale":1.5,"twMax":4.5,"LmaxS":9}' combined_cheap
