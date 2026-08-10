/**
 * ===========================================================================
 *  ONE TAP, ONE ARRIVAL
 * ===========================================================================
 *
 * This suite exists because the same bug has now been shipped twice, in two
 * unrelated parts of the app, by two different routes — and both times it was
 * reported as "it opens twice" and both times the thing being blamed was the
 * press or the animation, neither of which was ever wrong.
 *
 * ---------------------------------------------------------------------------
 * THE DEFECT, ONCE, IN GENERAL TERMS
 * ---------------------------------------------------------------------------
 * A route with a `loading.tsx` paints TWO elements into its slot, one after the
 * other: the Suspense shell, and then the real page. They are separate elements
 * in separate route trees, not one element whose contents change.
 *
 * So an entrance animation that both of them carry runs TWICE. The screen slides
 * in, is replaced, and slides in again. Nothing throws, nothing logs, and the
 * press that started it fired exactly once — which is why hardening the button
 * against double-firing could never fix it, and why several rounds were spent
 * doing precisely that.
 *
 * It shipped as:
 *   · the sell sheet, whose intercepted shell carried `sell-sheet-enter` while
 *     NewListingForm applies the same class on mount. Its header even claimed
 *     "one arrival instead of two", which is true only if the form does not
 *     re-animate, and the form does.
 *   · the inbox, when a back-navigation rule was written as `main > *` and
 *     matched the messages loading shell — a shell that carries no
 *     `data-primary` PRECISELY so the narrower rule could not match it, and
 *     says so in its own header.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS ASSERTED, AND WHY IT IS THESE TWO THINGS
 * ---------------------------------------------------------------------------
 *   1. No `loading.tsx` anywhere carries a one-shot animation class.
 *      A shell exists to be replaced. Anything it animates, it animates again
 *      when the page arrives.
 *
 *   2. No entrance rule is written against a wildcard child of a route slot.
 *      `main > *` cannot distinguish a shell from the page it stands in for —
 *      no selector can — so it always matches both.
 *
 * Looping animations are exempt and deliberately so: a skeleton shimmer is
 * meant to run in a shell, it has no beginning to replay, and a shell without
 * one is a grey box that looks broken. The discriminator is `infinite`.
 *
 * Where an entrance genuinely has to span the handover, it goes on the segment
 * `layout.tsx` — the one element Next mounts once and keeps while loading.tsx
 * is swapped for page.tsx. That is what app/(marketing)/messages/[id]/layout.tsx
 * is for, and its header explains it.
 *
 * Run with:  npm run test:push
 */

import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

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
    console.log(`  FAIL  ${name}${detail ? `\n${detail}` : ""}`)
  }
}

const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(join(root, dir))) {
    if (entry === "node_modules" || entry === ".next") continue
    const rel = `${dir}/${entry}`
    if (statSync(join(root, rel)).isDirectory()) walk(rel, out)
    else out.push(rel)
  }
  return out
}

const css = read("app/globals.css")

/**
 * Every class in the stylesheet whose animation RUNS ONCE.
 *
 * `infinite` is the exemption and the only one: a shimmer has no beginning to
 * replay, so a shell carrying one is correct. Everything else has a first
 * keyframe, and a first keyframe is the thing that plays a second time.
 */
const oneShot = new Set<string>()
for (const m of css.matchAll(/\.([a-zA-Z0-9_-]+)(?:\[[^\]]*\])?\s*\{([^}]*)\}/g)) {
  const [, name, body] = m
  if (!/\banimation:/.test(body)) continue
  if (/\binfinite\b/.test(body)) continue
  // `animation: none` is a reduced-motion override, not an entrance.
  if (/animation:\s*none/.test(body)) continue
  oneShot.add(name)
}

console.log("\nOne tap, one arrival\n")

check(
  "the stylesheet actually has one-shot animations to check against",
  // A guard on the guard: if the extraction above ever stops matching — a
  // formatting change, a move to another file — every check below would pass
  // by finding nothing, which is the quietest possible way for a suite to stop
  // working.
  oneShot.size >= 3,
  `        Found ${oneShot.size}. The extraction in this file has probably\n` +
    "        stopped matching the stylesheet.",
)

const shells = walk("app").filter((f) => /\/loading\.tsx$/.test(f))

check(
  "there are loading shells to check",
  shells.length > 0,
  "        No loading.tsx found anywhere — the walk is probably wrong.",
)

/**
 * What actually replaces a given shell: the page beside it, and the components
 * that page renders.
 *
 * Resolved by following local imports two levels deep rather than by scanning
 * the whole repository, because "this class also appears somewhere else in the
 * app" is not the defect — an unrelated page having the same class replaces
 * nothing. The pairing is what matters, and one level is not enough: the sell
 * shell's page is four lines that render NewListingForm, and the entrance is in
 * the form.
 */
function replacementsFor(shell: string): string[] {
  const dir = shell.replace(/\/loading\.tsx$/, "")
  const seen = new Set<string>()
  const out: string[] = []
  const visit = (file: string, depth: number) => {
    if (depth > 2 || seen.has(file)) return
    seen.add(file)
    let src: string
    try {
      src = read(file)
    } catch {
      return
    }
    out.push(file)
    for (const m of src.matchAll(/from\s+["']@\/([^"']+)["']/g)) {
      for (const ext of [".tsx", ".ts", "/index.tsx"]) {
        const cand = `${m[1]}${ext}`
        try {
          statSync(join(root, cand))
        } catch {
          continue
        }
        visit(cand, depth + 1)
        break
      }
    }
  }
  visit(`${dir}/page.tsx`, 0)
  return out
}

check(
  "no entrance class is carried by BOTH a loading shell and what replaces it",
  (() => {
    // The precise shape of the defect, and it is narrower than "shells must not
    // animate". A shell animating something ONLY it has is fine — the page that
    // replaces it does not carry the class, so nothing replays. `.skeleton-
    // deferred` is exactly that: a dozen shells hold back their own skeleton so
    // a fast route shows no flash, and none of the pages behind them has it.
    //
    // What cannot happen is one entrance on both sides of ONE handover. They are
    // separate elements in separate route trees, so the second starts from its
    // first keyframe and the arrival plays twice. `sell-sheet-enter` was on the
    // intercepted shell AND applied by NewListingForm on mount, which is the
    // whole of "the sell page opens twice".
    const used = (src: string, cls: string) =>
      new RegExp(`(^|[\\s"'\`])${cls}([\\s"'\`]|$)`).test(src)

    const guilty: string[] = []
    for (const shell of shells) {
      const shellSrc = read(shell)
      const behind = replacementsFor(shell)
      for (const cls of oneShot) {
        if (!used(shellSrc, cls)) continue
        const also = behind.filter((f) => f !== shell && used(read(f), cls))
        if (also.length) {
          guilty.push(`.${cls}\n          shell: ${shell}\n          also:  ${also.join(", ")}`)
        }
      }
    }
    if (guilty.length) console.log(`        ${guilty.join("\n        ")}`)
    return guilty.length === 0
  })(),
  "        An entrance that has to span the shell→page handover belongs on the\n" +
    "        segment layout.tsx, which Next mounts once and keeps. See\n" +
    "        app/(marketing)/messages/[id]/layout.tsx.",
)

check(
  "and no shell smuggles one in as a Tailwind arbitrary animation",
  (() => {
    // `animate-[fade-in_220ms_...]` is the same thing spelled differently, and
    // it would sail past the class check above.
    const guilty = shells.filter((f) => /animate-\[(?![^\]]*infinite)/.test(read(f)))
    if (guilty.length) console.log(`        ${guilty.join("\n        ")}`)
    return guilty.length === 0
  })(),
)

check(
  "no entrance is declared on a wildcard child of a route slot",
  (() => {
    // `main > *` cannot tell a Suspense shell from the page it stands in for —
    // no selector can, because they are the same shape by design. So it always
    // matches both, and the entrance plays twice.
    const guilty: string[] = []
    for (const m of css.matchAll(/([^{}]*)\{([^}]*)\}/g)) {
      const [, selector, body] = m
      if (!/\banimation:/.test(body) || /\binfinite\b/.test(body)) continue
      if (/animation:\s*none/.test(body)) continue
      if (/>\s*\*(\s*:not\([^)]*\))?\s*$/.test(selector.trim())) {
        guilty.push(selector.trim().replace(/\s+/g, " ").slice(0, 90))
      }
    }
    if (guilty.length) console.log(`        ${guilty.join("\n        ")}`)
    return guilty.length === 0
  })(),
  "        Name the page roots that want the entrance. A wildcard animates the\n" +
    "        loading shell AND the page that replaces it.",
)

check(
  "the one entrance that DOES span a handover is on a layout, not a page",
  (() => {
    // The positive case, so this suite says what to do rather than only what
    // not to. A segment layout is mounted once when the route is entered and
    // kept while loading.tsx is swapped for page.tsx, so an animation on it
    // plays exactly once across both.
    const layout = read("app/(marketing)/messages/[id]/layout.tsx")
    return /thread-arrive/.test(layout) && oneShot.has("thread-arrive")
  })(),
)

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failed:")
  for (const f of failures) console.log(`  · ${f}`)
  process.exit(1)
}
