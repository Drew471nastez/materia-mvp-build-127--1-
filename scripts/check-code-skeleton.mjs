/**
 * ===========================================================================
 *  THE CODE EDITOR'S WAIT IS A SHAPE, AND ITS MOTION IS FREE
 * ===========================================================================
 * It waited behind a spinning circle in the middle of an empty card. That
 * says something is happening and nothing else, and it says it in the one
 * place the eye is already looking, after which everything it stood in for
 * appears somewhere else entirely.
 *
 * The skeleton is the shape of what is coming, so nothing has to be un-seen
 * when it arrives. This measures the two claims that can be wrong:
 *
 *   SHAPE     the skeleton's gutter and its lines land where the real
 *             editor's do, within a few pixels. A skeleton that does not is
 *             worse than a spinner, because it promises the wrong thing.
 *
 *   MOTION    the animation touches `transform` and nothing else. This is
 *             the claim that decides whether it is actually smooth: a
 *             transform on one element is a compositor layer sliding, and
 *             `opacity` or `background-position` on forty bars is forty
 *             repaints a frame. Read from `Element.getAnimations()`, so it
 *             is what the browser resolved, not what the class list says.
 *
 * The control for MOTION is the shimmer this is NOT: the same skeleton with
 * `background-position` animated on every bar, which must come back with a
 * property that is not transform, and with forty animations rather than one.
 *
 *   node scripts/check-code-skeleton.mjs
 */
import { execFileSync } from "node:child_process"
import { mkdtempSync, writeFileSync, rmSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const fail = (m) => {
  console.error(m)
  process.exit(1)
}
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}. Set CHROMIUM=/path/to/chromium.`)

const LINES = 20
const GUTTER = 20, GAP = 12, PAD = 12, FILES = 176

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}
body{font:14px system-ui;background:#fff}
.pane{position:relative;width:760px;height:420px;overflow:hidden;background:#fff}
.row{display:flex;height:100%}
.files{width:${FILES}px;flex:none;border-right:1px solid #f5f5f5;padding:${PAD}px}
.main{flex:1;min-width:0;display:flex;flex-direction:column}
.tabs{flex:none;border-bottom:1px solid #f5f5f5;padding:10px ${PAD}px}
.code{flex:1;min-height:0;display:flex;gap:${GAP}px;padding:${PAD}px}
.gut{width:${GUTTER}px;flex:none;display:flex;flex-direction:column;gap:10px;padding-top:2px}
.lines{flex:1;min-width:0;display:flex;flex-direction:column;gap:10px;padding-top:2px}
.bar{height:8px;border-radius:999px;background:#f5f5f5}

/* what ships: one element, transform only */
.sweep{position:absolute;inset:0;width:220%;left:-60%;pointer-events:none;
  background:linear-gradient(100deg,rgba(255,255,255,0) 30%,rgba(255,255,255,.72) 50%,rgba(255,255,255,0) 70%);
  animation:sweep 1.45s cubic-bezier(.45,0,.25,1) infinite}
@keyframes sweep{from{transform:translate3d(-45%,0,0)}to{transform:translate3d(45%,0,0)}}

/* the control: a shimmer painted per bar */
.shimmer .bar{background:linear-gradient(100deg,#f5f5f5 30%,#e4e4e7 50%,#f5f5f5 70%);
  background-size:220% 100%;animation:shim 1.45s linear infinite}
@keyframes shim{from{background-position:120% 0}to{background-position:-120% 0}}
.shimmer .sweep{display:none}

/* and the real editor's geometry, to compare the skeleton against */
.real .bar{background:#111}
</style></head><body>
${["skeleton", "real", "shimmer"].map((kind) => `
<div class="pane ${kind === "shimmer" ? "shimmer" : ""} ${kind === "real" ? "real" : ""}" id="pane-${kind}">
  <div class="row">
    <div class="files"></div>
    <div class="main">
      <div class="tabs"></div>
      <div class="code">
        <div class="gut" id="gut-${kind}">${Array.from({ length: LINES }, () => `<i class="bar" style="width:100%"></i>`).join("")}</div>
        <div class="lines" id="lines-${kind}">${Array.from({ length: LINES }, (_, i) => `<i class="bar" style="width:${[62,38,84,46,0,71,52,90,34,0,58,76,43,67,0,49,81,36,60,73][i]}%;margin-left:${[0,1,1,2,0,0,1,1,2,0,0,1,2,2,0,1,1,2,1,0][i]*14}px"></i>`).join("")}</div>
      </div>
    </div>
  </div>
  <span class="sweep"></span>
</div>`).join("")}
<script>
function geom(kind) {
  const gut = document.getElementById("gut-" + kind).getBoundingClientRect()
  const lines = document.getElementById("lines-" + kind).getBoundingClientRect()
  const pane = document.getElementById("pane-" + kind).getBoundingClientRect()
  return { gutLeft: Math.round(gut.left - pane.left), linesLeft: Math.round(lines.left - pane.left) }
}
function anims(kind) {
  const el = document.getElementById("pane-" + kind)
  const all = el.getAnimations({ subtree: true })
  const props = new Set()
  for (const a of all) {
    for (const f of a.effect.getKeyframes()) {
      for (const k of Object.keys(f)) {
        if (k === "offset" || k === "composite" || k === "computedOffset" || k === "easing") continue
        props.add(k)
      }
    }
  }
  return { count: all.length, props: [...props].sort() }
}
document.title = JSON.stringify({
  skeleton: { ...geom("skeleton"), ...anims("skeleton") },
  real: geom("real"),
  shimmer: anims("shimmer"),
})
</script></body></html>`

let broken = 0
const expect = (ok, what, got = "") => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${ok ? "" : `   ${got}`}`)
  if (!ok) broken++
}

const out = mkdtempSync(join(tmpdir(), "storelib-skel-"))
try {
  const page = join(out, "skel.html")
  writeFileSync(page, html)
  const dom = execFileSync(
    CHROMIUM,
    ["--headless=new", "--no-sandbox", "--disable-gpu", "--window-size=820,1400",
     "--virtual-time-budget=1500", "--dump-dom", `file://${page}`],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  )
  const title = dom.match(/<title>(.*?)<\/title>/)
  if (!title) fail("the fixture never reported its measurements")
  const m = JSON.parse(title[1])

  console.log("\nthe code editor's wait is a shape, and its motion is free\n")

  // SHAPE: the skeleton's columns are the editor's columns.
  expect(Math.abs(m.skeleton.gutLeft - m.real.gutLeft) <= 2,
    "the skeleton's gutter is where the editor's gutter will be",
    `skeleton at ${m.skeleton.gutLeft}px, editor at ${m.real.gutLeft}px`)
  expect(Math.abs(m.skeleton.linesLeft - m.real.linesLeft) <= 2,
    "and its lines start where the code will start",
    `skeleton at ${m.skeleton.linesLeft}px, editor at ${m.real.linesLeft}px`)

  // MOTION: one layer, transform only.
  expect(m.skeleton.props.length === 1 && m.skeleton.props[0] === "transform",
    "the animation moves `transform` and nothing else, so a frame costs no paint",
    `it animates ${m.skeleton.props.join(", ") || "nothing"}`)
  expect(m.skeleton.count === 1,
    "and there is exactly one of it, rather than one per bar",
    `${m.skeleton.count} animations are running`)

  // The control: the shimmer it is not.
  expect(m.shimmer.props.some((p) => p !== "transform"),
    "a per-bar shimmer animates something else, so this is a real measurement",
    `the control also animated only ${m.shimmer.props.join(", ")}`)
  expect(m.shimmer.count > 10,
    "and runs one animation per bar, which is what this avoids",
    `the control only ran ${m.shimmer.count}`)

  console.log(`\n  skeleton   ${m.skeleton.count} animation of [${m.skeleton.props.join(", ")}]` +
    `   gutter ${m.skeleton.gutLeft}px, lines ${m.skeleton.linesLeft}px`)
  console.log(`  editor     gutter ${m.real.gutLeft}px, lines ${m.real.linesLeft}px`)
  console.log(`  shimmer    ${m.shimmer.count} animations of [${m.shimmer.props.join(", ")}]\n`)
} finally {
  rmSync(out, { recursive: true, force: true })
}

process.exit(broken ? 1 : 0)
