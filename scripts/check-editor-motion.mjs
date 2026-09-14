/**
 * ===========================================================================
 *  DOES IT ACTUALLY MOVE, AND DOES NOTHING ELSE MOVE WITH IT
 * ===========================================================================
 * Three claims from this round, none of which a diff can settle.
 *
 *   1. THE DRAWER CLOSES ON AN ANIMATION. "It disappears instead of closing"
 *      has been reported twice and fixed twice, and both times the fix looked
 *      identical in source to the bug: a node that is deleted on the frame
 *      the state changes, versus one Radix keeps mounted with
 *      `data-state="closed"` while a slide plays. Only the DOM knows which.
 *
 *   2. SELECTING A SCHEME MOVES NOTHING BUT COLOUR. The bug was a BUMP — a
 *      selected button a pixel taller and 14px wider pushes its neighbours in
 *      a flex-wrap row, and can push one onto the next line. Every button's
 *      rectangle is measured before and after a click.
 *
 *   3. THE SAFE-AREA SHIELD STANDS DOWN. `html.capacitor::before` paints a
 *      fixed black strip at z-9999; `html.capacitor:has(.cp-editor)::before`
 *      switches it off. That is a cascade, and a cascade is only answered by
 *      running it — which is how the black band survived a round of "fixed":
 *      the padding underneath was right and something was painting over it.
 *
 *   pnpm build && node scripts/check-editor-motion.mjs
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)

const cssDir = join(root, ".next/static/chunks")
if (!existsSync(cssDir)) fail("No production build found. Run `pnpm build` first.")
const css = readdirSync(cssDir)
  .filter((f) => f.endsWith(".css"))
  .map((f) => readFileSync(join(cssDir, f), "utf8"))
  .join("\n")
if (!css.includes("cp-editor")) fail("The built CSS predates the safe-area rule. Run `pnpm build` again.")

const out = mkdtempSync(join(tmpdir(), "storelib-motion-"))
const stubs = join(root, ".motion-probe")
mkdirSync(stubs, { recursive: true })
writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => "/creator-page"
export const useRouter = () => ({ push() {}, prefetch() {}, replace() {}, refresh() {} })
export const useSearchParams = () => new URLSearchParams()
`)
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default function Link({ href, children, ...rest }) { return React.createElement("a", { href, ...rest }, children) }
`)

/**
 * A REAL SAFE AREA. Chromium reports `env(safe-area-inset-top)` as 0 with no
 * device to ask, so the shield would measure 0px tall whether the rule fired
 * or not — a check that passes for the wrong reason. The variable is set on
 * the root, which is what `env()` falls back to nowhere, so the probe sets a
 * fixed height on the pseudo-element through the same custom property the
 * page would see on a phone.
 */
const SAFE_AREA_SHIM = `
  html.capacitor::before { height: 44px; }
`

const PROBE = `<script>
function rect(el) { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } }
function shieldHeight() {
  const cs = getComputedStyle(document.documentElement, "::before")
  return { display: cs.display, height: cs.height, background: cs.backgroundColor }
}
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms) }) }

/*
  Chromium runs this page under --virtual-time-budget, which fast-forwards
  timers but never ticks the document timeline: an animation sits at
  currentTime 0 for as long as you sleep, so the drawer stays frozen on the
  first frame of its slide and nothing that waits for a real animation would
  ever resolve. Finishing each animation by hand jumps it to its end AND
  fires a genuine animationend, which is the event Radix's Presence waits
  for before unmounting, so the real path still runs. It only ever runs on
  animations that exist, so a panel with no exit animation stays put and is
  still caught.
*/
function settle(el) {
  for (const a of el.getAnimations({ subtree: true })) {
    try { a.finish() } catch {}
  }
}

/*
  ...and the same frozen timeline means no animationend is ever DISPATCHED
  either: the animation reaches playState "finished" but the event that
  would have been queued needs a frame to fire on. Radix unmounts on exactly
  that event, so the probe fires it, carrying the name of the animation that
  really ran on this element. Nothing here invents an animation: the name
  comes from getAnimations(), so an element with no exit animation sends no
  event and stays mounted, which is the failure this check exists to catch.
*/
function endAnimations(el) {
  const names = el.getAnimations({ subtree: true }).map((a) => a.animationName).filter(Boolean)
  settle(el)
  for (const animationName of new Set(names)) {
    el.dispatchEvent(new AnimationEvent("animationend", { animationName, bubbles: true }))
  }
  return names
}

async function run() {
  const result = { steps: [] }

  // ── 1. The shield, with and without the editor's marker ────────────────
  const marker = document.querySelector(".cp-editor")
  const parked = document.createElement("div")
  marker.parentNode.removeChild(marker)
  await sleep(30)
  result.shieldWithout = shieldHeight()
  document.getElementById("page").appendChild(marker)
  await sleep(30)
  result.shieldWith = shieldHeight()
  result.htmlBgWith = getComputedStyle(document.documentElement).backgroundColor

  // ── 2. The picker: every button's box, before and after a click ────────
  const buttons = () => Array.from(document.querySelectorAll("#picker button")).map(rect)
  result.pickerBefore = buttons()
  const target = document.querySelectorAll("#picker button")[3]
  target.click()
  await sleep(400)           // longer than the 200ms transition
  result.pickerAfter = buttons()
  result.pickerSelected = target.getAttribute("aria-pressed")

  // ── 3. The drawer: open, measure, close, and watch what happens ────────
  document.getElementById("open-editor").click()
  await sleep(450)
  const panel = document.querySelector('[data-slot="dialog-content"]')
  const overlay = document.querySelector('[data-slot="dialog-overlay"]')
  if (panel) {
    result.enterAnimated = panel.getAnimations().length > 0
    settle(panel)                       // where it comes to rest, not where it starts
    if (overlay) settle(overlay)
    const cs = getComputedStyle(panel)
    result.drawer = {
      rect: rect(panel),
      shadow: cs.boxShadow,
      state: panel.getAttribute("data-state"),
      viewport: { w: window.innerWidth, h: window.innerHeight },
      overlayBg: overlay ? getComputedStyle(overlay).backgroundColor : null,
      /* Why is it where it is: which offsets won, and is anything still moving. */
      box: {
        position: cs.position, left: cs.left, right: cs.right,
        transform: cs.transform, width: cs.width,
        animations: panel.getAnimations().map(function (a) {
          return (a.animationName || "?") + ":" + a.playState + "@" + Math.round(a.currentTime || 0) +
            "/" + ((a.effect && a.effect.getTiming().duration) || "?")
        }),
        animationDuration: cs.animationDuration,
        animationFillMode: cs.animationFillMode,
        offsetParent: panel.offsetParent ? panel.offsetParent.tagName : null,
        className: panel.className,
      },
    }
    const body = panel.querySelector(".overflow-y-auto")
    result.drawer.bodyScrollable = body ? body.scrollHeight > body.clientHeight + 4 : false
    const footer = panel.querySelector(".grid.shrink-0")
    if (body && footer) {
      const before = rect(footer)
      body.scrollTop = 400
      await sleep(60)
      result.drawer.footerMovedOnScroll = rect(footer).y !== before.y
      result.drawer.bodyDidScroll = body.scrollTop > 100
    }

    // Now close it, and look at the DOM on the very next frames.
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    await sleep(40)
    const during = document.querySelector('[data-slot="dialog-content"]')
    result.closing = {
      stillMounted: !!during,
      state: during ? during.getAttribute("data-state") : null,
      animationName: during ? getComputedStyle(during).animationName : null,
      animationDuration: during ? getComputedStyle(during).animationDuration : null,
    }
    result.overlayClosing = overlay
      ? { state: overlay.getAttribute("data-state"), animations: overlay.getAnimations().length }
      : null
    if (during) {
      result.exitAnims = endAnimations(during)   // play the exit out; Radix unmounts on animationend
    }
    if (overlay) endAnimations(overlay)
    await sleep(600)
    result.closedAfter = !!document.querySelector('[data-slot="dialog-content"]')
  } else {
    result.drawer = null
  }

  const pre = document.createElement("pre"); pre.id = "out"; pre.textContent = JSON.stringify(result); document.body.append(pre)
}
if (document.readyState === "complete") run(); else addEventListener("load", run)
</script>`

try {
  execFileSync(
    "npx",
    [
      "esbuild",
      join(root, "scripts/render-editor-motion.tsx"),
      "--bundle",
      "--format=iife",
      "--platform=browser",
      "--jsx=automatic",
      "--log-level=error",
      `--outfile=${join(out, "probe.js")}`,
      '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;',
      '--define:process.env.NODE_ENV="production"',
      `--alias:next/navigation=${join(stubs, "navigation.js")}`,
      `--alias:next/link=${join(stubs, "link.jsx")}`,
      `--alias:@=${root}`,
      "--loader:.jsx=jsx",
      "--loader:.css=empty",
      "--loader:.svg=dataurl",
    ],
    { cwd: root, stdio: "inherit" },
  )

  const file = join(out, "index.html")
  writeFileSync(
    file,
    `<!doctype html><html class="light capacitor"><head><meta charset="utf-8"><style>${css}</style><style>body{margin:0}${SAFE_AREA_SHIM}</style></head><body><div id="app"></div><script src="probe.js"></script>${PROBE}</body></html>`,
  )

  const dom = execFileSync(
    CHROMIUM,
    ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--window-size=1280,900",
     "--virtual-time-budget=20000", "--dump-dom", `file://${file}`],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] },
  )
  const match = dom.match(/<pre id="out">([\s\S]*?)<\/pre>/)
  if (!match) fail("Nothing reported. The probe did not run.")
  const r = JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"))

  let broken = 0
  const expect = (ok, what, got) => {
    console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${ok ? "" : `   ${got ?? ""}`}`)
    if (!ok) broken++
  }

  console.log("\nthe safe-area shield")
  expect(r.shieldWithout.display !== "none", "it is painted on an ordinary page", r.shieldWithout.display)
  expect(r.shieldWithout.height === "44px", "over the whole inset", r.shieldWithout.height)
  expect(r.shieldWith.display === "none", "and stands down where the editor is", r.shieldWith.display)
  expect(r.htmlBgWith === "rgb(255, 255, 255)", "with the canvas behind it white, not black", r.htmlBgWith)

  console.log("\nselecting a colour scheme")
  expect(r.pickerSelected === "true", "the click selected one", r.pickerSelected)
  expect(r.pickerBefore.length >= 5, "five schemes are offered", r.pickerBefore.length)
  const moved = r.pickerBefore
    .map((b, i) => ({ i, b, a: r.pickerAfter[i] }))
    .filter(({ b, a }) => !a || b.x !== a.x || b.y !== a.y || b.w !== a.w || b.h !== a.h)
  expect(moved.length === 0, "and not one button moved or changed size", JSON.stringify(moved))

  console.log("\nthe editor drawer")
  if (!r.drawer) {
    expect(false, "it opened", "no dialog content in the DOM")
  } else {
    const { rect, viewport } = r.drawer
    expect(Math.abs(rect.x + rect.w - viewport.w) <= 1, "pinned to the right edge", `right edge at ${rect.x + rect.w} of ${viewport.w}; ${JSON.stringify(r.drawer.box)}`)
    expect(rect.y === 0 && Math.abs(rect.h - viewport.h) <= 1, "full height", `y ${rect.y}, h ${rect.h} of ${viewport.h}`)
    expect(rect.w > 300 && rect.w < viewport.w / 2, "and a drawer's width, not a page", rect.w)
    expect(r.drawer.overlayBg === "rgba(0, 0, 0, 0)", "nothing dims the page behind it", r.drawer.overlayBg)
    expect(r.drawer.shadow !== "none", "depth says which is in front", r.drawer.shadow)
    expect(r.drawer.bodyScrollable === true, "the body is the part that scrolls", r.drawer.bodyScrollable)
    expect(r.drawer.bodyDidScroll === true, "and it really scrolls", r.drawer.bodyDidScroll)
    expect(r.drawer.footerMovedOnScroll === false, "while the footer with Save in it does not move", r.drawer.footerMovedOnScroll)

    console.log("\nand closing it is an animation, not a deletion")
    expect(r.closing.stillMounted === true, "the panel is still in the DOM a frame later", r.closing.stillMounted)
    expect(r.closing.state === "closed", "marked closed", r.closing.state)
    expect(r.closing.animationName && r.closing.animationName !== "none", "with an animation running", r.closing.animationName)
    expect(r.closedAfter === false, "and gone once it has played", `still there, exit was ${JSON.stringify(r.exitAnims)}`)
    expect(r.enterAnimated === true, "opening was an animation too", r.enterAnimated)
    expect(r.overlayClosing && r.overlayClosing.state === "closed" && r.overlayClosing.animations > 0,
      "and the darken behind it fades out rather than vanishing", JSON.stringify(r.overlayClosing))
  }

  console.log(broken === 0 ? "\nIt moves the way it says it does, and nothing moves with it.\n" : `\n${broken} measured wrong.\n`)
  process.exit(broken === 0 ? 0 : 1)
} finally {
  /* The temp directory is left behind on purpose: a failure can be opened. */
}
