/**
 * ===========================================================================
 *  THE MENU OPENS WHERE IT WAS PRESSED, AND A PRESS LEAVES A MARK
 * ===========================================================================
 * Two things, both of which only exist over time, so both are driven rather
 * than read.
 *
 *   the menu   anchored under the dots at the size of its contents, not a
 *              full-width panel at the bottom of the screen
 *   the press  visible for long enough to be seen, however fast the tap
 *
 * THE PRESS IS CHECKED ON THE CLASS, NOT ON A COMPUTED OPACITY. Under
 * --virtual-time-budget a CSS transition never advances, so a computed
 * opacity is always its start value and would report a working press as
 * broken. What the component decides — pressed or not — is in the class list,
 * and that is what is asked.
 *
 *   pnpm build && node scripts/check-bar-menu.mjs
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const cssDir = join(root, ".next/static/chunks")
if (!existsSync(cssDir)) fail("No production build found. Run `pnpm build` first.")
const css = readdirSync(cssDir).filter((f) => f.endsWith(".css")).map((f) => readFileSync(join(cssDir, f), "utf8")).join("\n")

const out = mkdtempSync(join(tmpdir(), "storelib-menu-"))
const stub = join(out, "nav.js")
writeFileSync(stub, "export const useRouter=()=>({refresh(){},push(){},replace(){},back(){},forward(){},prefetch(){}});export const usePathname=()=>'/p/x';export const useSearchParams=()=>new URLSearchParams();export const useParams=()=>({})\n")
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-bar-menu.tsx"),
  "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(out, "probe.js")}`,
  '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;',
  '--define:process.env.NODE_ENV="production"',
  `--alias:@=${root}`, `--alias:next/navigation=${stub}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
  { stdio: ["ignore", "ignore", "inherit"] })

writeFileSync(join(out, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style><style>html,body{margin:0;overflow:hidden}#app{width:390px}</style></head><body><script>window.__err=[];addEventListener("error",function(e){window.__err.push(String(e.message))})</script><div id="app"></div><script src="probe.js"></script>
<script>
function r(el) { var b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) } }
function disc() {
  var back = document.querySelector('button[aria-label="Back"]')
  return back ? back.querySelector("span[aria-hidden]") : null
}
var steps = []
setTimeout(function () {
  var dots = document.querySelector('button[aria-label="More"]')
  var back = document.querySelector('button[aria-label="Back"]')
  steps.push({ at: "before", menu: !!document.querySelector('[role="menu"]'), dots: dots ? r(dots) : null, bar: r(document.querySelector('[data-product-bar="phone"]')) })

  /* The press: pointerdown only, then released immediately. A real tap is
     often shorter than one frame, which is the whole problem. */
  var d = disc()
  steps.push({ at: "at rest", discClass: d ? d.className : null })
  back.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))
  setTimeout(function () {
    var d2 = disc()
    steps.push({ at: "pressed", discClass: d2 ? d2.className : null })
    setTimeout(function () {
      var d3 = disc()
      steps.push({ at: "after the hold", discClass: d3 ? d3.className : null })

      dots.click()
      setTimeout(function () {
        var menu = document.querySelector('[role="menu"]')
        steps.push({
          at: "menu open",
          menu: !!menu,
          rect: menu ? r(menu) : null,
          items: menu ? [].map.call(menu.querySelectorAll('[role="menuitem"]'), function (b) { return b.textContent.trim() }) : [],
          animation: menu ? getComputedStyle(menu).animationName : null,
        })
        var pre = document.createElement("pre"); pre.id = "result"
        pre.textContent = JSON.stringify({ steps: steps, errors: window.__err, viewport: innerWidth })
        document.body.append(pre)
      }, 200)
    }, 320)
  }, 60)
}, 700)
</script></body></html>`)

const dom = execFileSync(CHROMIUM, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
  "--window-size=390,844", "--force-device-scale-factor=1", "--virtual-time-budget=14000", "--dump-dom", `file://${join(out, "index.html")}`],
  { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 32 * 1024 * 1024 })
const m = dom.match(/<pre id="result">([\s\S]*?)<\/pre>/)
if (!m) fail("Nothing reported. The probe threw before it could answer.")
const p = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"))
if (p.errors?.length) fail(`it threw: ${p.errors.join(" | ")}`)
console.log(JSON.stringify(p.steps, null, 2))

const get = (k) => p.steps.find((s) => s.at === k)
const before = get("before"), rest = get("at rest"), pressed = get("pressed"), after = get("after the hold"), open = get("menu open")
const problems = []
if (!before || !rest || !pressed || !after || !open) problems.push("one of the readings is missing.")
else {
  if (before.menu) problems.push("the menu is open before anything was pressed.")

  /* THE PRESS. A pointerdown with no click still has to show. */
  if (!rest.discClass || !/opacity-0/.test(rest.discClass)) problems.push(`at rest the mark is not hidden (${rest.discClass}).`)
  if (!pressed.discClass || !/opacity-\[0\.14\]/.test(pressed.discClass)) {
    problems.push(`a press leaves no visible mark (${pressed.discClass}) — this is the "it feels cheap".`)
  }
  if (!after.discClass || !/opacity-0/.test(after.discClass)) problems.push(`the mark never clears (${after.discClass}).`)

  /* THE MENU. Inline, anchored, at the size of what is in it. */
  if (!open.menu) problems.push("pressing the dots opened nothing.")
  if (open.rect) {
    /*
      Measured against THE BAR, not the window. This Chromium reports an
      innerWidth of 500 for a 390px window, so anchoring judged against the
      viewport called a correctly placed menu misplaced — the harness's
      number, not the page's.
    */
    const barRight = before.bar.x + before.bar.w
    const menuRight = open.rect.x + open.rect.w
    if (open.rect.w > before.bar.w * 0.6) problems.push(`the menu is ${open.rect.w}px of the bar's ${before.bar.w} — that is a sheet, not a menu.`)
    if (barRight - menuRight > 24) problems.push(`the menu's right edge is ${barRight - menuRight}px in from the bar's, so it is not under the dots.`)
    if (menuRight > barRight) problems.push(`the menu runs ${menuRight - barRight}px past the bar's right edge.`)
    /* Under the bar, not up from the bottom of the screen. */
    const barBottom = before.bar.y + before.bar.h
    if (Math.abs(open.rect.y - barBottom) > 20) problems.push(`the menu opens ${open.rect.y}px down with the bar ending at ${barBottom}: it is not anchored to the bar.`)
  }
  if (open.items.join("/") !== "Share/Report") problems.push(`the menu holds ${JSON.stringify(open.items)}, not Share then Report.`)
  if (open.animation !== "product-bar-menu-in") problems.push(`the menu does not grow from its corner (animation: ${open.animation}).`)
}

if (problems.length) fail(problems.map((x) => `  - ${x}`).join("\n"))
console.log("\nThe menu opens under the dots at its own size, and a press leaves a mark that comes and goes.\n")
