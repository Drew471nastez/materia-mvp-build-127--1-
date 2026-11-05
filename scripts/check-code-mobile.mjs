/**
 * ===========================================================================
 *  A FIELD UNDER 16 PIXELS ZOOMS THE PAGE, AND THE PAGE DOES NOT COME BACK
 * ===========================================================================
 * iOS zooms when a text field smaller than 16px takes focus. That is not a
 * preference, it is what WKWebView does, and it is the whole of "the code
 * editor is not clean on a phone": tap the file filter, the page jumps to
 * about 1.3x, and it STAYS there. The bar is now wider than the screen, the
 * editor is scrolled sideways, and nothing on the page can undo it — pinching
 * back is the only way out, and only if the viewport allows it.
 *
 * The code area already knew this: its text is 16px on a phone and 12 from
 * `md` up. The three fields around it did not — the file filter at 11.5px and
 * the two path fields at 12.
 *
 * So this renders each field at both widths and reads the font size the
 * browser RESOLVED, which is the number iOS compares against. The desktop
 * column is a control of the opposite kind: the sizes must come back DOWN
 * above `md`, or the fix is just "make everything big", which would leave a
 * 16px filter box in a 224px explorer column.
 *
 *   node scripts/check-code-mobile.mjs
 */
import { execFileSync } from "node:child_process"
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()

const fail = (m) => {
  console.error(m)
  process.exit(1)
}
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}. Set CHROMIUM=/path/to/chromium.`)

/** The size at or above which iOS leaves the page alone. */
const NO_ZOOM = 16
/** A small phone, and the narrowest width that is still `md`. */
const PHONE = 390, DESK = 820

/**
 * Every text field in the code editor, WITH THE CLASSES IT ACTUALLY SHIPS
 * WITH, read out of the page.
 *
 * These used to be copies, typed here. A copy measures itself: when the
 * new-file field moved into a centred dialog and was redrawn at a different
 * size, this went on measuring the string it no longer used and went on
 * passing. A probe that cannot notice a change is a probe that is not
 * checking anything.
 *
 * The page is the source. A field that cannot be found in it fails the run
 * rather than quietly dropping out of the list.
 */
const page = readFileSync(join(root, "app/(storelib)/website-builder/code/[installId]/page.tsx"), "utf8")
const classOf = (label, marker) => {
  const at = page.indexOf(marker)
  if (at < 0) fail(`Could not find the ${label} field in the code editor (looked for ${marker}).`)
  const m = /className="([^"]+)"/.exec(page.slice(at, at + 900))
  if (!m) fail(`Found ${label} but no className after it.`)
  return m[1]
}
const FIELDS = [
  ["filter", classOf("filter", 'placeholder="Find a file…"')],
  ["new-file", classOf("new-file", 'label="Name of the new section"')],
  ["path", classOf("path", `label={pendingAction.kind === "rename" ? "New name" : "Name"}`)],
  // The control: the filter as it was, which is the field that was reported.
  ["before", "w-full rounded-md border py-1 pl-7 pr-6 text-[11.5px]"],
]

/**
 * The classes above are Tailwind, and this fixture has no Tailwind. Rather
 * than pull the build in, the two utilities that matter are declared here and
 * the rest are inert — so what is measured is the SIZE and the BREAKPOINT,
 * which is the whole claim.
 */
/**
 * Whatever size the field is actually written at, not a list of the sizes it
 * has been written at before. The classes come out of the page now, so the
 * fixture has to be able to draw any of them: it reads the number out of
 * `text-[Npx]` and `md:text-[Npx]` and declares exactly those two rules.
 * A field that names no size at all fails the run rather than defaulting to
 * a number that would make it look correct.
 */
const sizeOf = (cls, label) => {
  const base = /(?:^|\s)text-\[([0-9.]+)px\]/.exec(cls)
  if (!base) fail(`The ${label} field names no base text size: ${cls}`)
  const md = /(?:^|\s)md:text-\[([0-9.]+)px\]/.exec(cls)
  return { base: base[1], md: md ? md[1] : null }
}
const SIZES = FIELDS.map(([id, cls]) => [id, sizeOf(cls, id)])

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}
body{font:14px system-ui;background:#fff;padding:8px}
input{display:block;width:100%;margin-bottom:8px;border:1px solid #ddd;border-radius:6px;padding:4px 8px}
${SIZES.map(([id, s]) => `#f-${id}{font-size:${s.base}px}`).join("\n")}
@media (min-width:768px){
${SIZES.filter(([, s]) => s.md).map(([id, s]) => `  #f-${id}{font-size:${s.md}px}`).join("\n")}
}
</style></head><body>
${SIZES.map(([id]) => `<input id="f-${id}" value="x">`).join("\n")}
<script>
const out = {}
for (const id of ${JSON.stringify(FIELDS.map(([id]) => id))}) {
  out[id] = parseFloat(getComputedStyle(document.getElementById("f-" + id)).fontSize)
}
document.title = JSON.stringify({ width: window.innerWidth, sizes: out })
</script></body></html>`

let broken = 0
const expect = (ok, what, got = "") => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${ok ? "" : `   ${got}`}`)
  if (!ok) broken++
}

const out = mkdtempSync(join(tmpdir(), "storelib-codemob-"))
try {
  const page = join(out, "fields.html")
  writeFileSync(page, html)
  const read = (w) => {
    const dom = execFileSync(
      CHROMIUM,
      ["--headless=new", "--no-sandbox", "--disable-gpu", `--window-size=${w},700`,
       "--virtual-time-budget=1200", "--dump-dom", `file://${page}`],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    )
    const t = dom.match(/<title>(.*?)<\/title>/)
    if (!t) fail("the fixture never reported its measurements")
    return JSON.parse(t[1])
  }
  const phone = read(PHONE)
  const desk = read(DESK)

  console.log("\na field under 16 pixels zooms the page, and the page does not come back\n")

  const shipped = FIELDS.filter(([id]) => id !== "before").map(([id]) => id)
  for (const id of shipped) {
    expect(phone.sizes[id] >= NO_ZOOM, `the ${id} field is ${NO_ZOOM}px on a phone, so focusing it does not zoom`,
      `it resolves to ${phone.sizes[id]}px at ${phone.width}px wide`)
  }
  expect(phone.sizes.before < NO_ZOOM,
    "the filter used to be under it, so this is a real measurement",
    `the control already measured ${phone.sizes.before}px`)

  // And the other half: it has to come back down, or the explorer column is
  // full of 16px text in 224 pixels.
  for (const id of shipped) {
    expect(desk.sizes[id] < NO_ZOOM, `and the ${id} field is back to its own size on a desktop`,
      `it is still ${desk.sizes[id]}px at ${desk.width}px wide`)
  }

  console.log("")
  for (const [id] of FIELDS) {
    console.log(`  ${id.padEnd(10)} phone ${String(phone.sizes[id]).padStart(5)}px   desktop ${String(desk.sizes[id]).padStart(5)}px`)
  }
  console.log("")
} finally {
  rmSync(out, { recursive: true, force: true })
}

process.exit(broken ? 1 : 0)
