#!/bin/bash
# run-sheet.sh <port> <outdir> [w]: every way of closing the sheet, three times each; one line per run.
P=$1; O=$2; W=${3:-1440}
mkdir -p $O
for f in "link-x" "link-escape" "link-backdrop" "link-back" "link-drag" "tab-x" "direct-x" "direct-back" "link-x tabswitch=1" "link-x hide=1" "link-x idle=20000"; do
  set -- $f
  node "$(dirname "$0")/probe23.mjs" $P $O flow=$1 w=$W n=${N:-3} $2 > "$O/$(echo $f | tr ' =' '__')-$W.json" 2>&1
  node -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));for(const x of r.results)console.log(process.argv[2].padEnd(28),"closes",x.closes,"shows",x.shows,"reloads",x.reloads,"hist",x.hist,"pops",x.pops,"end",x.end,"mounts",x.mounts);if(r.errors.length)console.log("   errors:",r.errors.filter(e=>!/JSON/.test(e)).slice(0,3).join(" | "))' "$O/$(echo $f | tr ' =' '__')-$W.json" "$f" || tail -5 "$O/$(echo $f | tr ' =' '__')-$W.json"
done
