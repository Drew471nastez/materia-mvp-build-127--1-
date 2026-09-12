/**
 * ===========================================================================
 *  THE SCREEN THAT WILL NOT MOVE, AND THE THING THAT GIVES IT BACK
 * ===========================================================================
 * "Click Inspect, or click a section, and the whole builder blocks: controls
 * stop working and the scroll dies completely." Reported repeatedly, from the
 * code editor, from project settings, and now from the canvas.
 *
 * WHAT THIS DOES NOT CLAIM. It does not reproduce whatever strands the lock.
 * An earlier version of this probe tried to — a menu and a dialog unmounting
 * together, which is the shape Radix's cleanup looks wrong for — and it
 * MEASURED RADIX CLEANING UP CORRECTLY. So that was not the cause, and saying
 * it was would have been a guess dressed up as a diagnosis.
 *
 * What it measures is the thing actually being shipped: once a screen is
 * blocked, by anything, it does not stay blocked. Three scenes, in a real
 * browser, with real Radix:
 *
 *   1. A LIVE dialog. Its lock must survive everything. This is the control:
 *      a guard that clears a lock a modal is using is worse than the bug,
 *      because a press would fall through the dialog onto the page behind it.
 *   2. A lock with nothing open. Taken back, with nothing pressed.
 *   3. A transparent full-screen scrim left over the page. A press must reach
 *      the page under it.
 *
 *   node scripts/check-stuck-layer.mjs
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)

const out = mkdtempSync(join(tmpdir(), "storelib-stuck-"))
const bundle = join(out, "probe.js")
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-stuck-probe.tsx"),
  "--bundle", "--format=iife", "--jsx=automatic", "--log-level=error", `--outfile=${bundle}`,
  "--define:process.env.NODE_ENV=\"production\"", `--alias:@=${root}`],
  { stdio: ["ignore", "ignore", "inherit"] })

const SETTLE = 400

const page = (guard) => `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%}</style></head>
<body><div id="app"></div>
<script>${readFileSync(bundle, "utf8")}</script>
<script>
(function () {
  var r = {}
  window.mountProbe({ guard: ${guard} })
  setTimeout(function () {
    // ── 1. a live dialog holds its lock ────────────────────────────────
    window.setDialog(true)
    setTimeout(function () {
      r.liveDialog = window.lockState()
      document.dispatchEvent(new PointerEvent("pointerdown", { clientX: 10, clientY: 10, bubbles: true }))
      setTimeout(function () {
        r.liveDialogAfterPress = window.lockState()
        window.setDialog(false)

        // ── 2. a lock nobody owns ────────────────────────────────────────
        setTimeout(function () {
          document.body.style.pointerEvents = "none"
          document.body.style.overflow = "hidden"
          document.body.setAttribute("data-scroll-locked", "")
          r.stranded = window.lockState()
          setTimeout(function () {
            r.strandedAfterSettle = window.lockState()

            // ── 3. an invisible scrim over the page ────────────────────────
            window.setScrim(true)
            setTimeout(function () {
              r.behindScrim = window.pressTarget(200, 200)
              setTimeout(function () {
                r.behindScrimAfter = window.pressTarget(200, 200)
                document.title = "RESULT:" + JSON.stringify(r)
              }, 60)
            }, 120)
          }, ${SETTLE + 250})
        }, 200)
      }, 80)
    }, 200)
  }, 150)
})()
</script></body></html>`

function run(guard) {
  const file = join(out, guard ? "with.html" : "without.html")
  writeFileSync(file, page(guard))
  const dump = execFileSync(CHROMIUM, [
    "--headless", "--disable-gpu", "--no-sandbox", "--virtual-time-budget=9000",
    "--dump-dom", `file://${file}`,
  ], { encoding: "utf8", maxBuffer: 40 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] })
  const m = /RESULT:(\{.*?\})<\/title>/s.exec(dump)
  if (!m) fail("The probe never reported. Chromium rendered nothing usable.")
  return JSON.parse(m[1])
}

const lock = (s) => `pointer-events: ${(s.pointerEvents || "—").padEnd(6)}  overflow: ${(s.overflow || "—").padEnd(8)}  scroll-locked: ${s.scrollLocked}`

const without = run(false)
const with_ = run(true)

console.log(`
  WITHOUT the guard

    a live dialog's lock                 ${lock(without.liveDialog)}
    a lock nobody owns                   ${lock(without.stranded)}
    ...${(SETTLE + 250)}ms later                      ${lock(without.strandedAfterSettle)}
    a press under a transparent scrim    reaches ${without.behindScrimAfter}

  WITH the guard

    a live dialog's lock                 ${lock(with_.liveDialog)}
    ...and after a press outside it      ${lock(with_.liveDialogAfterPress)}
    a lock nobody owns                   ${lock(with_.stranded)}
    ...${(SETTLE + 250)}ms later                      ${lock(with_.strandedAfterSettle)}
    a press under a transparent scrim    reaches ${with_.behindScrimAfter}
`)

const problems = []

/**
 * THE CONTROLS. Without the guard the page must stay broken, or the scenes
 * are not reproducing anything and nothing below means what it says.
 */
if (without.strandedAfterSettle.pointerEvents !== "none" || !without.strandedAfterSettle.scrollLocked) {
  problems.push("An unguarded page recovered on its own. The scene is not reproducing a stranded lock,\n    so the guard's claim is unproven until it is rewritten.")
}
if (without.behindScrimAfter === "control") {
  problems.push("An unguarded press reached the page through a full-screen scrim on its own.\n    The scene is not reproducing a blocked screen, so nothing below means what it says.")
}
if (with_.liveDialog.pointerEvents !== "none") {
  problems.push("A dialog that is OPEN did not lock the body. Radix is not behaving as this depends on.")
}

/** And the three things being measured. */
if (with_.liveDialogAfterPress.pointerEvents !== "none") {
  problems.push("The guard cleared a lock a LIVE DIALOG was holding. A press would fall through it onto\n    the page behind. This is worse than the bug it is fixing.")
}
const s = with_.strandedAfterSettle
if (s.pointerEvents !== "" || s.overflow !== "" || s.scrollLocked) {
  problems.push("The guard did not take back a lock nobody owns. The page is still dead.")
}
if (with_.behindScrimAfter !== "control") {
  problems.push(`A press under the scrim still does not reach the page (reached ${with_.behindScrimAfter}).`)
}

if (problems.length) fail(problems.map((p) => `  ✗ ${p}`).join("\n\n"))

console.log(`  A lock nobody owns is taken back within ${SETTLE}ms, unpressed, and a press under an
  invisible scrim reaches the page. A live dialog keeps everything it is holding,
  through the settle window and through a press outside it.
`)
