/**
 * ===========================================================================
 *  THE WAIT GETS AN INDICATOR, AND THE INDICATOR CANNOT BECOME THE PROBLEM
 * ===========================================================================
 * Three things have now been tried over this navigation and two of them made
 * it worse: a grey skeleton that threw the grid away at the moment of the
 * press, and a colour cross-fade that read as a white flash. Both replaced
 * the page somebody was reading with something that was not the page.
 *
 * The bar does not. It is three pixels at the top, the grid stays readable
 * and scrollable underneath it, and it reports a wait that is genuinely
 * there. What is checked here is the handful of ways it could turn into the
 * same class of fault as the two before it.
 */
import { readFileSync } from "node:fs"

import { stripComments } from "./_source"

let passed = 0
let failed = 0
const failures: string[] = []

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`)
  }
}

const read = (p: string) => readFileSync(p, "utf8")
const BAR = "components/navigation/navigation-progress.tsx"
const bar = read(BAR)
const barCode = stripComments(bar)
const css = read("app/globals.css")
const layout = stripComments(read("app/(marketing)/layout.tsx"))

console.log("\nIt reports the wait without covering the page\n")

check("it is mounted by the layout, so it outlives the navigation", /<NavigationProgress \/>/.test(layout), BAR)

/*
  A fixed full-screen element over the page is the veil that was removed for
  looking cheap. This one is a line: it must have a small height and must not
  stretch down the screen.
*/
const rule = css.match(/\n  \.nav-progress \{([\s\S]*?)\n  \}/)?.[1] ?? ""
check("the bar's rule was found", rule.length > 0)
check(
  "it is a line at the top, not a sheet over the page",
  /height:\s*\dpx/.test(rule) && !/\binset:\s*0/.test(rule) && !/bottom:\s*0/.test(rule),
  rule.replace(/\s+/g, " ").slice(0, 120),
)
check("and it can never take a tap", /pointer-events:\s*none/.test(rule))
check(
  "its resting state is invisible, in the base rule",
  /opacity:\s*0/.test(rule),
  "not at the end of an animation with fill-mode — that is how a stuck one stays on screen",
)
check(
  "no animation with a fill mode holds its state",
  !/\.nav-progress[^{]*\{[^}]*animation:/.test(css),
  "the states are transitions on an attribute, which cannot strand a value",
)

console.log("\nIt waits, so a back press never flashes it\n")

/*
  Back is a client restore and lands in about 40ms, measured. A bar shown on
  the press frame would appear and vanish within two frames of every single
  back, which is exactly the flicker being complained about.
*/
const delay = Number(bar.match(/const DELAY_MS = (\d+)/)?.[1])
check(
  "it holds back before showing",
  Number.isFinite(delay) && delay >= 100 && delay <= 300,
  `DELAY_MS is ${delay}. Under 100 and a 40ms back press flashes it; over 300 and a real fetch goes unanswered.`,
)

console.log("\nIt never lies, and it never sticks\n")

/*
  Nothing can report real progress for a server render. What it must not do is
  sit at 100% while still waiting, which reads as a finished page that has not
  arrived.
*/
const creep = [...bar.matchAll(/pct:\s*(\d+)/g)].map((m) => Number(m[1]))
check("the creep has steps", creep.length >= 4, `${creep.length}`)
check(
  "and none of them reaches the end",
  creep.every((p) => p < 100),
  `highest step is ${Math.max(...creep)} — only an arrival may complete it`,
)
check(
  "the arrival is what completes it",
  /pathname !== from\.current\) finish\(\)/.test(barCode),
  "it has to be the route landing, not a timer",
)
check(
  "and it gives up rather than sitting there for ever",
  /GIVE_UP_MS/.test(barCode) && /setTimeout\(finish, GIVE_UP_MS\)/.test(barCode),
  "a navigation that never lands would otherwise leave a stripe at 95% permanently",
)

console.log("\nAnd it knows about every way a page can change\n")

check("a press on any internal link starts it", /addEventListener\("click", onClick, \{ capture: true \}\)/.test(barCode))
check("back and forward start it too, because they have no click", /addEventListener\("popstate", onPopState\)/.test(barCode))
check(
  "a link to the same page does not",
  /url\.pathname === window\.location\.pathname && url\.search === window\.location\.search/.test(barCode),
  "a hash link fetches nothing and must not raise a loading bar",
)
check(
  "nor does one leaving the site",
  /url\.origin !== window\.location\.origin/.test(barCode),
)
check(
  "nor a new tab or a download",
  /target === "_blank"/.test(barCode) && /hasAttribute\("download"\)/.test(barCode),
)

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log("\nFailures:")
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
