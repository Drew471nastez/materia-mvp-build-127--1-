/**
 * ===========================================================================
 *  NO HOOK BELOW AN EARLY RETURN
 * ===========================================================================
 * A component that returns early on one render and calls a hook further down
 * on the next renders a different number of hooks the second time, and React
 * throws #310. Everything about this bug is invisible until it runs: the file
 * compiles, the types check, the build passes, and the page dies in the
 * browser with "Something went wrong on this page".
 *
 * It reached production. SubscribeBar bails out while `isHydrated` is false,
 * and three hooks were added underneath that line, so every creator page
 * carrying a visible bar threw #310 for every visitor the moment it
 * hydrated. The file even carried the comment "Early return AFTER all
 * hooks" directly above the return, and that comment did not stop it,
 * which is the argument for a check rather than a convention.
 *
 * scripts/check-bar-hydrate.mjs mounts that bar in a real browser and is the
 * proof the fix works. This is the cheap net that covers every other
 * component, so the next one is caught before it ships.
 */
import { existsSync, readFileSync } from "node:fs"
import { execSync } from "node:child_process"

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

/**
 * KNOWN, UNFIXED, AND NOT PRETENDED OTHERWISE.
 *
 * Five violations in the link-in-bio editor predate this check. They are
 * latent rather than live: their condition is `!onepage`, which only flips
 * if the tab is rendered before its data arrives, and today the parent does
 * not do that. They are listed by file so this check can guard everything
 * else, NOT because they are acceptable. Deleting a line from this list
 * without fixing the file is how the net gets cut.
 */
const KNOWN_UNFIXED = new Set<string>([
  /* public-onepage.tsx came off in round AN: the hooks of its own PDF, Spotify and Apple Music pop-ups, which sat under an early return, went with the pop-ups (they open in the block sheet). */
  /* design-tab.tsx came off in round 11: the crop sections' hooks that sat under `if (!onepage) return null` went with the old croppers (components/onepage/media-cropper.tsx). */
  /* links-tab.tsx came off in round 10 (AUDIT B2): its hooks all run before `if (!onepage) return null` now. */
  /* settings-tab.tsx came off: its hooks are all above its one return now. */
])

const HOOK =
  /^\s{2}(?:const|let)?\s*.*\buse(?:State|Effect|Ref|Memo|Callback|LayoutEffect|Reducer|Context|Transition|Id|SyncExternalStore|ImperativeHandle)\s*\(/
const EARLY_RETURN = /^\s{2}if\s*\(.*\)\s*return\b/
/*
  WHERE A SCOPE THAT CAN HOLD HOOKS BEGINS.

  Components, and CUSTOM HOOKS — `useHover` can put a hook below an early
  return exactly as a component can, and every caller inherits the bug.

  A lowercase helper is a different matter: it is not a component, so its
  `if (...) return` is an ordinary guard clause and means nothing here.
*/
const COMPONENT_START =
  /^(export )?(default )?(async )?function (use[A-Z]|[A-Z])|^(export )?const (use[A-Z]|[A-Z])\w* = /
/*
  AND WHERE ONE ENDS. Any other top-level binding closes the scope above it.

  Without this the scanner had no lower boundary at all: a helper's guard
  clause set `returnedAt` and the NEXT function's first hook was reported
  against it. It went unnoticed while a component happened to sit between
  the two — `isRouteActive` returns early, and a component was declared
  between it and `useHover`, which reset the state by accident. Deleting
  that component made a real-looking violation appear in a file nobody had
  touched, which is the kind of failure that gets a guard deleted rather
  than read.
*/
const OTHER_TOP_LEVEL = /^(export )?(default )?(async )?function \w|^(export )?const \w+ = /

function violations(): string[] {
  const files = execSync("git ls-files 'components/**/*.tsx' 'app/**/*.tsx'", { encoding: "utf8" })
    .split("\n")
    .filter(Boolean)
  const found: string[] = []
  for (const file of files) {
    /*
      `git ls-files` reads the INDEX, which can name a file that is no longer
      on disk — a deletion that has not been staged, or a half-applied stash.
      Reading it blind threw ENOENT and took the whole suite down with a stack
      trace instead of a result, which is a bad way to find out that a file
      was removed.
    */
    if (!existsSync(file)) continue
    const src = readFileSync(file, "utf8")
    if (!src.includes("use client")) continue
    const lines = src.split("\n")
    let returnedAt = 0
    let inComponent = false
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (COMPONENT_START.test(line)) {
        inComponent = true
        returnedAt = 0
        continue
      }
      if (OTHER_TOP_LEVEL.test(line)) {
        /* A plain helper. Its guards belong to it and stop at its closing
           brace, so nothing below it is "after an early return". */
        inComponent = false
        returnedAt = 0
        continue
      }
      if (!inComponent) continue
      if (EARLY_RETURN.test(line)) {
        if (!returnedAt) returnedAt = i + 1
        continue
      }
      if (returnedAt && HOOK.test(line)) {
        found.push(`${file}:${i + 1} (returns at ${returnedAt}): ${line.trim().slice(0, 72)}`)
        returnedAt = 0
      }
    }
  }
  return found
}

console.log("\nNo hook below an early return")

const found = violations()
const fresh = found.filter((v) => !KNOWN_UNFIXED.has(v.split(":")[0]))

check(
  "no component calls a hook after returning early",
  fresh.length === 0,
  fresh.join("\n        "),
)

/**
 * The two that took the creator page down, pinned by name: the scan above
 * would also catch them, but naming them says which bug this was.
 */
for (const file of [
  "components/store-builder/subscribe-bar.tsx",
  "components/store-builder/sticky-add-to-cart.tsx",
]) {
  check(`${file.split("/").pop()} keeps its hooks above the return`, !found.some((v) => v.startsWith(file)))
}

/** The list is a record of debt, so an empty one should not pass silently. */
check(
  "the known-unfixed list still describes real files",
  [...KNOWN_UNFIXED].every((f) => found.some((v) => v.startsWith(f))),
  `stale entries: ${[...KNOWN_UNFIXED].filter((f) => !found.some((v) => v.startsWith(f))).join(", ")}`,
)

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failing:", failures.join(", "))
  process.exit(1)
}
