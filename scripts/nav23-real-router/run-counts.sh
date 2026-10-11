#!/bin/bash
# run-counts.sh <port> <outdir>: the sheet's ways out and the editor's ways back, counted (closes, reloads, history).
P=$1; O=$2; mkdir -p $O
H=$(dirname "$0")
for f in "link-x" "link-escape" "link-backdrop" "link-back" "link-drag" "tab-x" "link-xback from=/app/products" "link-xx" "link-discard" "direct-x" "direct-discard" "link-x settings=2500 early=300 after=5000"; do
  set -- $f
  node $H/probe23.mjs $P $O flow=$1 n=${N:-3} $2 $3 $4 2>&1 | node $H/summ.js
done
for how in bar back link; do
  node $H/probe-editor.mjs $P $O how=$how n=${N:-3} cpu=2 > $O/editor-$how.json 2>&1
  node -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1]));for(const x of r.results)console.log(("editor-"+r.how).padEnd(20),"reloads",x.reloads,"landedMs",x.landedMs,"hist",x.hist,"end",x.end,x.extra?"then "+x.extra:"");if(r.errors.length)console.log("   ",r.errors.slice(0,2).join(" | "))' $O/editor-$how.json || tail -5 $O/editor-$how.json
done
