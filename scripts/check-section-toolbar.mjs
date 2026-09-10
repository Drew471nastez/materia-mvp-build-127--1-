/**
 * ===========================================================================
 *  THE SECTION TOOLBAR ARRIVES AND LEAVES, RATHER THAN BLINKING
 * ===========================================================================
 * The toolbar used to return `null` the moment it had nowhere to point, so
 * it appeared in one frame and vanished in one. It stays mounted for the
 * length of a fade now, and this measures that the fade is real.
 *
 * WHAT IS MEASURED, AND WHY IT IS NOT A SCREENSHOT. Headless Chromium runs
 * on a virtual clock, and a CSS transition does not advance on it: sampling
 * the computed opacity part way through reports the starting value forever,
 * whether the transition works or not. So the measurement is
 * `Element.getAnimations()`, which lists the CSSTransition objects the
 * browser actually created when the class changed. A cut creates none.
 *
 * This is the check that caught the bug it now guards. Tailwind v4 compiles
 * `-translate-y-1` and `scale-[0.97]` to the standalone `translate:` and
 * `scale:` properties, NOT to `transform` — so the original
 * `transition-[opacity,transform]` started ONE transition, on opacity, and
 * the toolbar jumped into place behind its own fade. Naming the real
 * properties starts three.
 *
 * The control is the same element with `transition: none`, which must start
 * none at all. Without it a fixture that failed to change any class would
 * pass this file by reporting nothing anywhere.
 *
 * Run after `pnpm build`:  node scripts/check-section-toolbar.mjs
 */
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, rmSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => {
  console.error(m)
  process.exit(1)
}
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}. Set CHROMIUM=/path/to/chromium.`)
const cssDir = join(root, ".next/static/chunks")
if (!existsSync(cssDir)) fail("No production build found. Run `pnpm build` first.")
const css = readdirSync(cssDir)
  .filter((f) => f.endsWith(".css"))
  .map((f) => readFileSync(join(cssDir, f), "utf8"))
  .join("\n")

/** Exactly what the component renders, split into its base and two states. */
const BASE =
  "wb-section-toolbar absolute z-[60] flex items-center gap-0.5 rounded-xl border border-neutral-200/80 bg-white/95 p-1 shadow-[0_8px_28px_-10px_rgba(15,23,42,0.35)] backdrop-blur " +
  "transition-[opacity,translate,scale] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none"
const SHOWN = "pointer-events-auto translate-y-0 scale-100 opacity-100"
const HIDDEN = "pointer-events-none -translate-y-1 scale-[0.97] opacity-0"

const out = mkdtempSync(join(tmpdir(), "storelib-toolbar-"))
try {
  /**
   * The stylesheet is INLINED, not linked. Linked, it is a load the fixture
   * races: the measurement runs on the first animation frame, and if the
   * sheet has not been applied by then the computed styles are the browser's
   * defaults and the run reports nothing at all. Inlined there is nothing to
   * wait for. Concatenated rather than interpolated, so a `${` anywhere in
   * the built CSS cannot be read as a placeholder.
   */
  writeFileSync(
    join(out, "t.html"),
    `<!doctype html><html><head><meta charset="utf-8"><style>` +
      css +
      `</style>
<style>#control{transition:none!important}</style></head><body>
<div id="fade" class="${BASE} ${HIDDEN}">x</div>
<div id="control" class="${BASE} ${HIDDEN}">x</div>
<script>
  const el = (id) => document.getElementById(id)
  const started = (id) =>
    el(id)
      .getAnimations()
      .map((a) => a.transitionProperty ?? "")
      .filter(Boolean)
      .sort()
  const results = {}
  requestAnimationFrame(() => {
    const cs = getComputedStyle(el("fade"))
    results.resting = {
      opacity: Number(cs.opacity),
      translate: cs.translate,
      scale: cs.scale,
      prop: cs.transitionProperty,
      dur: cs.transitionDuration,
    }
    // ── arriving ──
    el("fade").className = "${BASE} ${SHOWN}"
    el("control").className = "${BASE} ${SHOWN}"
    results.entering = started("fade")
    results.enteringControl = started("control")
    /**
     * The arrival is finished by hand before asking it to leave. On the
     * virtual clock a transition never advances, so without this the element
     * is still sitting at its starting values and setting the leaving class
     * asks it to go where it already is — which correctly starts nothing,
     * and would read as a toolbar that cannot fade out.
     */
    el("fade")
      .getAnimations()
      .forEach((a) => a.finish())
    // ── leaving ──
    el("fade").className = "${BASE} ${HIDDEN}"
    results.leaving = started("fade")
    document.title = JSON.stringify(results)
  })
</script></body></html>`,
  )
  const dom = execFileSync(
    CHROMIUM,
    ["--headless=new", "--no-sandbox", "--disable-gpu", "--virtual-time-budget=2000", "--dump-dom", `file://${join(out, "t.html")}`],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  )
  const raw = /<title>([\s\S]*?)<\/title>/.exec(dom)?.[1]
  if (!raw) fail("The fixture never finished. Chromium produced no result.")
  const r = JSON.parse(raw.replace(/&quot;/g, '"').replace(/&amp;/g, "&"))

  let broken = 0
  const expect = (ok, what, got = "") => {
    console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${ok ? "" : `   ${got}`}`)
    if (!ok) broken++
  }
  const WANT = ["opacity", "scale", "translate"]
  const same = (a) => a.length === WANT.length && a.every((v, i) => v === WANT[i])

  console.log("\nthe section toolbar arrives and leaves, rather than blinking\n")
  expect(
    r.resting.opacity === 0 && r.resting.translate !== "none" && r.resting.scale !== "none",
    "it rests invisible, offset and a hair small, so there is somewhere to arrive from",
    `opacity ${r.resting.opacity}, translate "${r.resting.translate}", scale "${r.resting.scale}"`,
  )
  expect(
    r.resting.dur === "0.2s",
    "over 200ms",
    `duration "${r.resting.dur}"`,
  )
  expect(
    same(r.entering),
    "arriving starts a transition on all three of opacity, translate and scale",
    `started [${r.entering.join(", ")}] — anything short of three is a property that snaps`,
  )
  expect(
    same(r.leaving),
    "and leaving starts the same three, so it fades out rather than being taken away",
    `started [${r.leaving.join(", ")}]`,
  )
  expect(
    r.enteringControl.length === 0,
    "while the same element with `transition: none` starts none, so this counts transitions and not class changes",
    `control started [${r.enteringControl.join(", ")}] — if this is not empty the checks above prove nothing`,
  )

  console.log(
    `\n  transitions started:  arriving [${r.entering.join(", ")}]` +
      `   leaving [${r.leaving.join(", ")}]` +
      `   control [${r.enteringControl.join(", ")}]\n`,
  )
  process.exit(broken === 0 ? 0 : 1)
} finally {
  rmSync(out, { recursive: true, force: true })
}
