/**
 * ===========================================================================
 *  THE KEYBOARD DOES NOT MOVE CANCEL AND SAVE OFF THE BOTTOM
 * ===========================================================================
 * The complaint was that opening the keyboard lifted the buttons into the
 * middle of the screen with the page showing above and below them. The cause
 * was that the panel was centred: the app shell shrinks the creator page's
 * frame to the strip above the keyboard, and a centred box re-centres in the
 * strip.
 *
 * So the measurement is about the FOOTER'S DISTANCE FROM THE BOTTOM OF THE
 * VISIBLE AREA, before and after. It must be the same both times, and it must
 * be small. Checking only "the footer is visible" would have passed on the
 * broken build too, because the broken footer was visible — it was just in
 * the wrong place.
 *
 * Both of the ways the keyboard reaches a creator page are covered:
 *   inset 0   — inside the workspace iframe, which the shell already shrank
 *   inset 336 — the page opened directly, where nothing shrank
 *
 *   pnpm build && node scripts/check-editor-keyboard.mjs
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

const out = mkdtempSync(join(tmpdir(), "storelib-kb-"))
const stub = join(out, "router-stub.js")
writeFileSync(stub, "export const useRouter = () => ({ refresh(){}, push(){}, replace(){}, back(){}, forward(){}, prefetch(){} })\nexport const usePathname = () => '/'\nexport const useSearchParams = () => new URLSearchParams()\nexport const useParams = () => ({})\n")
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-editor-keyboard.tsx"),
  "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(out, "probe.js")}`,
  '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;',
  '--define:process.env.NODE_ENV="production"',
  `--alias:@=${root}`, `--alias:next/navigation=${stub}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
  { stdio: ["ignore", "ignore", "inherit"] })

/**
 * TWO PAGE LOADS, NOT ONE PAGE POKED TWICE.
 *
 * The first version of this set the custom property at runtime and measured
 * straight after. The panel reported the new variable and the old geometry,
 * while a plain control box on the same page moved correctly — a recalc
 * artefact of this headless build, not a fact about the sheet. Baking the
 * value into the page and loading it twice asks the same question with
 * nothing in between to be stale.
 */
function load(label, inset) {
  const file = join(out, `page-${inset}.html`)
  writeFileSync(file, `<!doctype html><html class="${inset > 0 ? "keyboard-open" : ""}"><head><meta charset="utf-8"><style>${css}</style><style>html,body{margin:0;overflow:hidden;height:100%}:root{--keyboard-inset-height:${inset}px}
/* The open animation never finishes under virtual time, so the panel sits at
   scale(0.95) for ever and every edge reads ~8px inside where it really is.
   Measuring a frozen animation is measuring the harness. */
[data-slot="dialog-content"]{animation:none!important;transform:none!important;opacity:1!important}</style></head><body><div id="app"></div><script src="probe.js"></script>
<script>
setTimeout(function () {
  var panel = document.querySelector('[data-slot="dialog-content"]')
  var footer = document.querySelector('[data-editor-footer]')
  var body = panel && panel.querySelector(".overflow-y-auto")
  if (!panel || !footer) { var e = document.createElement("pre"); e.id = "result"; e.textContent = '{"missing":true}'; document.body.append(e); return }
  var p = panel.getBoundingClientRect(), f = footer.getBoundingClientRect()
  var cs = getComputedStyle(panel)
  /* clientHeight/clientWidth are the initial containing block: the box a
     fixed element is actually laid out against. innerWidth includes the
     scrollbar and would be 25px wider than anything can ever be. */
  var vpH = document.documentElement.clientHeight, vpW = document.documentElement.clientWidth
  var visibleBottom = vpH - ${inset}
  var res = {
    inset: ${inset},
    viewport: { w: vpW, h: vpH },
    panel: { top: Math.round(p.top), bottom: Math.round(p.bottom), left: Math.round(p.left), width: Math.round(p.width), height: Math.round(p.height) },
    footerTop: Math.round(f.top),
    footerBottom: Math.round(f.bottom),
    visibleBottom: visibleBottom,
    footerGapFromVisibleBottom: Math.round(visibleBottom - f.bottom),
    panelBelowVisible: Math.round(p.bottom - visibleBottom),
    bodyHeight: body ? Math.round(body.getBoundingClientRect().height) : 0,
    bodyScrolls: body ? body.scrollHeight > body.clientHeight + 1 : false,
    radius: cs.borderTopLeftRadius + "/" + cs.borderBottomLeftRadius,
  }
  var pre = document.createElement("pre"); pre.id = "result"; pre.textContent = JSON.stringify(res); document.body.append(pre)
}, 700)
</script></body></html>`)
  const dom = execFileSync(CHROMIUM, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
    "--window-size=390,844", "--force-device-scale-factor=1", "--virtual-time-budget=12000", "--dump-dom", `file://${file}`],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 32 * 1024 * 1024 })
  const m = dom.match(/<pre id="result">([\s\S]*?)<\/pre>/)
  if (!m) fail(`${label}: the editor never reported. It threw while mounting.`)
  const row = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"))
  if (row.missing) fail(`${label}: the panel or its footer is not in the DOM.`)
  return Object.assign({ label }, row)
}

/* 336px is an iPhone keyboard with its accessory bar, rounded off. */
const closed = load("keyboard closed", 0)
const open = load("keyboard open", 336)
console.log(JSON.stringify([closed, open], null, 2))

const problems = []
for (const r of [closed, open]) {
  if (r.footerGapFromVisibleBottom > 40) problems.push(`${r.label}: the buttons float ${r.footerGapFromVisibleBottom}px above the bottom of the visible area. That is the gap in the screenshot.`)
  if (r.footerGapFromVisibleBottom < -1) problems.push(`${r.label}: the buttons are ${-r.footerGapFromVisibleBottom}px below the visible area, behind the keyboard.`)
  if (r.panelBelowVisible > 1) problems.push(`${r.label}: ${r.panelBelowVisible}px of the sheet is under the keyboard.`)
  if (r.panel.top < 0) problems.push(`${r.label}: the sheet starts ${-r.panel.top}px above the top of the screen.`)
  if (r.panel.left !== 0) problems.push(`${r.label}: the sheet starts at x=${r.panel.left}, not against the screen edge.`)
  if (!/^\d+px\/0px$/.test(r.radius)) problems.push(`${r.label}: the corners read ${r.radius}; the bottom two should be square against the screen edge.`)
}

/* THE POINT OF THE CHANGE: the keyboard must not move the buttons. */
const drift = Math.abs(open.footerGapFromVisibleBottom - closed.footerGapFromVisibleBottom)
if (drift > 8) problems.push(`the keyboard moved the buttons ${drift}px relative to the bottom of the visible area (${closed.footerGapFromVisibleBottom}px -> ${open.footerGapFromVisibleBottom}px).`)

/* The height has to come from somewhere, and it comes from the body. */
if (!(open.bodyHeight < closed.bodyHeight - 100)) problems.push(`the scrolling body did not give up the height (${closed.bodyHeight}px -> ${open.bodyHeight}px); something else did.`)
if (!open.bodyScrolls) problems.push("with the keyboard up the body does not scroll, so the fields above it are unreachable.")

if (problems.length) fail(problems.map((p) => `  - ${p}`).join("\n"))
console.log("\nThe buttons stay on the bottom edge of the visible area, keyboard or not. The body gives up the height and still scrolls.\n")
