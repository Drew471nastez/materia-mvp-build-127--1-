/**
 * ===========================================================================
 *  ROUND 17: THE POST ON A PHONE, DONE PROPERLY (worker P17)
 * ===========================================================================
 * Held from their inputs and, where the rule is about how a file is written,
 * from its source:
 *
 *   REACHED     a post the ROUTER reaches (a comment notification's
 *               /post/<id>#c-<comment>, a short address no card holds) is
 *               drawn: only the opened post's own history entry holds the
 *               place under it (round 16 held it for the router's post page
 *               too, under a hidden Activity: the address changed and
 *               nothing showed)
 *
 *   node scripts/run-push-tests.mjs   (in SUITES)
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { atPlaceFor, onLayerEntry } from "@/lib/communities/client/places"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail)}`}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

console.log("\nREACHED: a post the router reaches is drawn")
{
  check("the opened post's own entry is known by its mark", onLayerEntry({ storelibLayer: "layer-1-abc" }) && onLayerEntry({ __NA: true, storelibLayer: "layer-2" }))
  check("the router's entries, the navigator's and none are not the opened post's", !onLayerEntry({ __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: [] }) && !onLayerEntry({ __communityDepth: 1 }) && !onLayerEntry(null) && !onLayerEntry(undefined) && !onLayerEntry("x"))
  check("a post opened over a place keeps the place", atPlaceFor("/community/clay/post/a1b2c3d4", "", true, true))
  check("the router on a post's address, from a place, does not keep the place", !atPlaceFor("/community/clay/post/a1b2c3d4", "", true, false) && !atPlaceFor("/community/clay/post/first-bowls-a1b2c3d4", "", true, false))
  check("a place is a place whatever the entry", atPlaceFor("/community/clay/notifications", "", false, false) && atPlaceFor("/community/clay", "?profile=mara", true, false))
  const host = read("components/community/member/place-host.tsx")
  check("the host asks the entry before holding the place", /const overLayer = typeof window !== "undefined" && onLayerEntry\(window\.history\.state\)/.test(host) && /atPlaceFor\(pathname \|\| "", search\?\.toString\(\) \?\? "", heldAtPlace\.current \?\? false, overLayer\)/.test(host))
  check("the router's post page is the routed slot's, shown over any place, and no kept screen shows with it", /const routerPost = isPostAddress\(pathname\) && !overLayer/.test(host) && /const routedVisible = routerPost \|\|/.test(host) && /const visible = key === shown\.key && \(routedKey !== null \|\| atPlace\) && !routerPost/.test(host))
  const frame = read("components/community/member/shell-frame.tsx")
  check("a comment's link (#c-<id>, every comment notification) opens its post over the place like any post link", /url\.hash && !\/\^#\(c-\[\\w-\]\+\|comments\)\$\/\.test\(url\.hash\)/.test(frame))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
