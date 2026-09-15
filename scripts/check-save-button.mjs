/**
 * ===========================================================================
 *  WHAT COLOUR THE SAVE BUTTON ACTUALLY IS WHILE IT SAVES
 * ===========================================================================
 * "When I click the save button it becomes white suddenly and it bugs."
 *
 * Three rounds of reasoning about this have now been wrong, each of them a
 * plausible story about class precedence told without looking. This looks:
 * it lays the real footer out with the real built stylesheet and reports the
 * computed background colour and opacity of both buttons in every state the
 * sheet can put them in.
 *
 * The class strings come from components/ui/button (the cva base and the
 * default variant) and from components/storefront/editor-sheet (the footer),
 * so this measures the shipped button rather than a description of it.
 *
 *   pnpm build && node scripts/check-save-button.mjs
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => {
  console.error(`\n${m}\n`)
  process.exit(1)
}
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)

const cssDir = join(root, ".next/static/chunks")
if (!existsSync(cssDir)) fail("No production build found. Run `pnpm build` first.")
const css = readdirSync(cssDir)
  .filter((f) => f.endsWith(".css"))
  .map((f) => readFileSync(join(cssDir, f), "utf8"))
  .join("\n")

const read = (p) => readFileSync(join(root, p), "utf8")
const pick = (src, re, what) => {
  const hit = src.match(re)?.[1]
  if (!hit) fail(`Could not find ${what}.`)
  return hit
}

const button = read("components/ui/button.tsx")
const sheet = read("components/storefront/editor-sheet.tsx")

/** The cva base, the default variant and the default size, as shipped. */
const base = pick(button, /cva\(\s*"([^"]+)"/, "the button's base classes")
const variantDefault = pick(button, /default: '(bg-primary[^']+)'/, "the default variant")
const variantOutline = pick(button, /outline:\s*\n?\s*'([^']+)'/, "the outline variant")
const sizeDefault = pick(button, /default: '(h-9 px-4[^']+)'/, "the default size")
const footerRow = pick(sheet, /<div className="(grid shrink-0 grid-cols-2[^"]*)"/, "the footer row")

/** The Save button's whole JSX, from its first attribute to its label. */
const saveJsx = sheet.slice(sheet.indexOf("aria-busy={busy"), sheet.indexOf("{saveLabel}"))
const saveExtra = pick(saveJsx, /className="([^"]*)"/, "the Save button's own classes")

/**
 * ===========================================================================
 *  DOES THE COMPONENT SET `disabled` WHILE IT IS SAVING?
 * ===========================================================================
 * This is read out of the JSX rather than assumed, and it is the whole point
 * of the probe. The first version modelled the saving state as "not disabled"
 * because that is what the component happens to do today — so putting
 * `disabled={busy || saveDisabled}` back changed nothing here and the control
 * experiment passed against the exact bug this exists to catch.
 *
 * The attribute is what pulls in `disabled:opacity-50` from the button
 * variants, so whether it is set IS the question. Now the probe renders the
 * saving button the way the component would.
 */
const disabledExpr = pick(saveJsx, /\sdisabled=\{([^}]*)\}/, "the Save button's disabled expression")
const disabledWhileBusy = /\bbusy\b/.test(disabledExpr)

console.log(`\n  Save adds: "${saveExtra}"`)
console.log(`  disabled={${disabledExpr}}  ->  a save in flight is ${disabledWhileBusy ? "DISABLED" : "not disabled"}`)

const SAVE = `${base} ${variantDefault} ${sizeDefault} ${saveExtra}`
const CANCEL = `${base} ${variantOutline} ${sizeDefault} w-full`

/**
 * Every state the footer can be in. `disabled` is the attribute, not a class:
 * the whole question is what the `disabled:` utilities do when it is present.
 */
const STATES = [
  { name: "idle", disabled: false },
  { name: "saving", disabled: disabledWhileBusy, busy: true },
  { name: "nothing to save", disabled: true },
]

const out = mkdtempSync(join(tmpdir(), "storelib-save-"))
writeFileSync(
  join(out, "index.html"),
  `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style>
<style>html,body{margin:0;background:#fff;font-family:system-ui}</style></head>
<body><div id="r"></div><script>
var STATES = ${JSON.stringify(STATES)}
var rows = []
STATES.forEach(function (st) {
  /*
    className, not innerHTML. The button's base class string contains an
    arbitrary-variant selector with single quotes in it, and pasting that into
    a single-quoted HTML string terminates the string. That cost this probe
    its first run: nothing laid out and nothing was measured.

    And no backticks in this comment: it is inside a template literal.
  */
  var wrap = document.createElement("div")
  wrap.className = ${JSON.stringify(footerRow)}
  var cancel = document.createElement("button")
  cancel.className = ${JSON.stringify(CANCEL)}
  cancel.textContent = "Cancel"
  var save = document.createElement("button")
  save.className = ${JSON.stringify(SAVE)}
  save.textContent = "Save"
  if (st.disabled) save.disabled = true
  wrap.appendChild(cancel)
  wrap.appendChild(save)
  document.body.appendChild(wrap)
  var cs = getComputedStyle(save)
  rows.push({
    state: st.name,
    background: cs.backgroundColor,
    color: cs.color,
    opacity: cs.opacity,
    width: Math.round(save.getBoundingClientRect().width),
  })
})
document.getElementById("r").setAttribute("data-m", JSON.stringify(rows))
</script></body></html>`,
)

const raw = execFileSync(
  CHROMIUM,
  ["--headless", "--disable-gpu", "--no-sandbox", "--window-size=900,700",
   "--virtual-time-budget=4000", "--dump-dom", `file://${join(out, "index.html")}`],
  { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
)
const m = raw.match(/data-m="([^"]+)"/)
if (!m) fail("The probe page did not lay out, so nothing was measured.")
const rows = JSON.parse(m[1].replace(/&quot;/g, '"'))

/** Is this colour effectively white, or transparent onto white? */
const isBlank = (c) => {
  const n = c.match(/[\d.]+/g)?.map(Number) ?? []
  if (n.length === 4 && n[3] < 0.1) return true
  return n.length >= 3 && n[0] > 245 && n[1] > 245 && n[2] > 245
}

const problems = []
console.log("")
for (const r of rows) {
  console.log(
    `  ${r.state.padEnd(16)} background ${r.background.padEnd(22)} text ${r.color.padEnd(22)} opacity ${r.opacity}`,
  )
  if (r.width === 0) problems.push(`${r.state}: the button has no width.`)
  /* The one that matters. A save in flight must still look like a button. */
  if (r.state === "saving") {
    if (isBlank(r.background)) problems.push(`saving: the background is ${r.background} — that is the white button.`)
    if (Number(r.opacity) < 0.95) problems.push(`saving: opacity ${r.opacity}, so the whole control is faded out.`)
  }
}

/**
 * THE CONTROL, BUILT IN. "It is not white while saving" is only worth reading
 * if this probe can see a white one, so the disabled state is measured
 * alongside: that IS the faded button, and if it comes back identical to the
 * saving state then nothing here is measuring the difference.
 */
const saving = rows.find((r) => r.state === "saving")
const off = rows.find((r) => r.state === "nothing to save")
if (saving && off && saving.opacity === off.opacity && saving.background === off.background) {
  problems.push(
    "a save in flight looks exactly like a disabled button, so this probe cannot tell them apart.",
  )
}

if (problems.length > 0) {
  console.error("")
  for (const p of problems) console.error(`  ${p}`)
  console.error("")
  process.exit(1)
}
console.log("\n  A save in flight still looks like a button.\n")
