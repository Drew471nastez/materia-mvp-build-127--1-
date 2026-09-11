/**
 * ===========================================================================
 *  THE ADD SECTION CARDS, LOOKED AT
 * ===========================================================================
 * Two claims, measured rather than asserted.
 *
 *   A section you wrote draws on its card. It exists only in your saved
 *   files, and the cards used to be given none of them on purpose, so it
 *   arrived as an empty box under its own name.
 *
 *   A card is a fixed shape. A section taller than the box is cropped by it
 *   rather than stretching it, because a grid whose cards are each as tall
 *   as their content is a grid that resettles every time a preview lands.
 *
 *   pnpm build && node scripts/check-library-cards.mjs   (add KEEP_SHOT=1)
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(m); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const cssDir = join(root, ".next/static/chunks")
if (!existsSync(cssDir)) fail("No production build found. Run `pnpm build` first.")
const css = readdirSync(cssDir).filter((f) => f.endsWith(".css")).map((f) => readFileSync(join(cssDir, f), "utf8")).join("\n")

const stubs = join(root, ".wb-probe")
mkdirSync(stubs, { recursive: true })
writeFileSync(join(stubs, "link.jsx"), `import React from "react"\nexport default function Link({ href, children, ...rest }) { return React.createElement("a", { href, ...rest }, children) }\n`)
writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => "/"\nexport const useRouter = () => ({ push() {}, replace() {}, refresh() {}, prefetch() {} })\nexport const useSearchParams = () => new URLSearchParams()\n`)

const MEASURE = `
<script>
(function () {
  const out = []
  for (const box of document.querySelectorAll("[data-box]")) {
    const name = box.getAttribute("data-box")
    const inner = document.querySelector('[data-inner="' + name + '"]')
    const card = document.querySelector('[data-card="' + name + '"]')
    /**
     * textContent, not innerText: content-visibility lets the browser skip
     * rendering a box that is off screen, and innerText is empty for skipped
     * content — which reads exactly like a card that drew nothing.
     */
    const clone = inner.cloneNode(true)
    for (const st of clone.querySelectorAll("style")) st.remove()
    const text = (clone.textContent || "").replace(/\\s+/g, " ").trim()
    const r = inner.getBoundingClientRect()
    out.push({
      name,
      boxHeight: Math.round(box.getBoundingClientRect().height),
      cardHeight: Math.round(card.getBoundingClientRect().height),
      /**
       * The height the section takes AS DRAWN — getBoundingClientRect is
       * after the transform, so this is what the box has to crop, not the
       * figure the section was laid out at.
       */
      contentHeight: Math.round(r.height),
      words: text ? text.split(" ").length : 0,
      sample: text.slice(0, 60),
      /** Also after the transform, for the same reason: scrollWidth is not. */
      drawnWidth: Math.round(r.width),
      boxWidth: Math.round(box.getBoundingClientRect().width),
    })
  }
  const pre = document.createElement("pre"); pre.id = "result"; pre.textContent = JSON.stringify(out); document.body.append(pre)
})()
</script>`

const out = mkdtempSync(join(tmpdir(), "storelib-cards-"))
const bundle = join(out, "probe.js")
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-library-cards.tsx"),
  "--bundle", "--platform=node", "--format=cjs", "--jsx=automatic", "--log-level=error", `--outfile=${bundle}`,
  `--alias:next/link=${join(stubs, "link.jsx")}`, `--alias:next/navigation=${join(stubs, "navigation.js")}`, `--alias:@=${root}`],
  { stdio: ["ignore", "ignore", "inherit"] })
execFileSync("node", [bundle], { env: { ...process.env, OUT_DIR: out }, stdio: ["ignore", "ignore", "inherit"] })

const body = readFileSync(join(out, "cards.html"), "utf8")
const file = join(out, "index.html")
writeFileSync(file, `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style><style>
  body{margin:0;padding:24px;background:#e9eaee;font-family:Inter,system-ui,sans-serif}
  .card{display:block;padding:0;border:1px solid #e5e7eb;border-radius:12px;background:#fff;overflow:hidden;text-align:left}
  .card__title{padding:12px 16px 10px;font-size:14px;font-weight:600}
  .card__box{border-top:1px solid #f0f0f2}
</style></head><body>${body}${MEASURE}</body></html>`)

const dom = execFileSync(CHROMIUM, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
  "--window-size=520,1400", "--virtual-time-budget=3000", "--run-all-compositor-stages-before-draw",
  "--dump-dom", `file://${file}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 })
const m = dom.match(/<pre id="result">([\s\S]*?)<\/pre>/)
if (!m) fail("The page did not report.")
const decode = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
const records = JSON.parse(decode(m[1]))

if (process.env.KEEP_SHOT) {
  execFileSync(CHROMIUM, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
    "--window-size=520,1400", "--virtual-time-budget=3000",
    `--screenshot=${join(root, ".wb-probe/library-cards.png")}`, "--screenshot-full-page", `file://${file}`],
    { stdio: ["ignore", "ignore", "ignore"] })
  console.log("  shot: .wb-probe/library-cards.png")
}

const problems = []
const mine = records.find((r) => r.name === "mine")
const missing = records.find((r) => r.name === "missing")
if (!mine || !missing) fail("The probe did not render both cards.")

for (const r of records) console.log(`  ${r.name}: card ${r.cardHeight}px, box ${r.boxHeight}px, the section itself ${r.contentHeight}px, ${r.words} words — ${r.sample || "(nothing)"}`)

if (mine.words < 5) problems.push(`a section you wrote draws ${mine.words} words on its card: the cards are not getting your files`)
if (!/Questions, answered/.test(mine.sample)) problems.push(`a section you wrote draws something, but not its own content: "${mine.sample}"`)
if (mine.contentHeight <= mine.boxHeight) problems.push(`the tall section is not taller than its box (${mine.contentHeight} vs ${mine.boxHeight}), so cropping is untested`)
for (const r of records) {
  if (r.boxHeight !== 159) problems.push(`${r.name}: the preview box is ${r.boxHeight}px, not the 159px its width makes it`)
  if (r.drawnWidth > r.boxWidth + 1) problems.push(`${r.name}: the preview is drawn ${r.drawnWidth}px wide inside a ${r.boxWidth}px card`)
}
// A card with no file behind it must not grow either: it is a placeholder.
if (missing.cardHeight !== mine.cardHeight) problems.push(`cards are not the same height: ${mine.cardHeight}px against ${missing.cardHeight}px`)

if (problems.length) { console.error("\n" + problems.map((p) => `  ${p}`).join("\n")); process.exit(1) }
console.log("\na section you wrote draws its own content on its card, and every card is the same fixed shape whatever is inside it")
