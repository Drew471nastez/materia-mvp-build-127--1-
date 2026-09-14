/**
 * ===========================================================================
 *  THE BUYING CARD FOLLOWS THE PAGE DOWN
 * ===========================================================================
 * The card carries `sticky top-6`, and a class is not a behaviour: `position:
 * sticky` does nothing at all if any ancestor has `overflow` other than
 * visible, and nothing useful in a grid whose items stretch. Neither failure
 * shows up in the source — the class is right there, looking correct.
 *
 * So this builds the card's real ancestry, scrolls a tall page, and reads
 * where the card actually is. It also checks the title is above the price,
 * because the point of the card following you is that it still says what you
 * are buying when the page's own heading has scrolled away.
 *
 *   pnpm build && node scripts/check-buy-card.mjs
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

const out = mkdtempSync(join(tmpdir(), "storelib-buycard-"))

/**
 * The card's ancestry as the product section builds it: a grid of five
 * columns, items aligned to the start, the card in the last two. The
 * `OVERFLOW` placeholder is what the break-test flips, because an ancestor
 * with a clipped overflow is the one thing that silently kills sticky.
 */
const page = (overflow, gridClass) => `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style><style>
  body{margin:0;font-family:Inter,system-ui,sans-serif}
  #wrap{overflow:${overflow}}
</style></head><body>
<div id="wrap">
  <div style="max-width:1170px;margin:0 auto;padding:24px">
    <div class="grid gap-8 lg:grid-cols-5 lg:gap-12 ${gridClass}">
      <div class="lg:col-span-3" style="min-width:0">
        <div style="height:2400px;background:linear-gradient(#eef,#dde)"></div>
      </div>
      <div class="hidden lg:block lg:col-span-2">
        <div id="card" class="sticky top-6 rounded-xl border p-6" style="background:#fff">
          <h2 id="title" class="mb-2 text-lg font-semibold leading-snug line-clamp-2">Geanta Guess Reptila</h2>
          <div id="price" class="text-3xl font-bold">$350.00</div>
          <button class="w-full" style="margin-top:12px">I want this!</button>
        </div>
      </div>
    </div>
  </div>
</div>
<script>
setTimeout(function () {
  var card = document.getElementById("card")
  var title = document.getElementById("title")
  var price = document.getElementById("price")
  var before = Math.round(card.getBoundingClientRect().top)
  window.scrollTo(0, 1200)
  setTimeout(function () {
    var after = Math.round(card.getBoundingClientRect().top)
    var pre = document.createElement("pre"); pre.id = "result"
    pre.textContent = JSON.stringify({
      topBeforeScroll: before,
      topAfterScroll: after,
      scrolled: Math.round(window.scrollY),
      titleAbovePrice: Math.round(title.getBoundingClientRect().top) < Math.round(price.getBoundingClientRect().top),
      titleText: title.textContent.trim(),
    })
    document.body.append(pre)
  }, 120)
}, 300)
</script></body></html>`

function measure(label, overflow, gridClass) {
  const file = join(out, `${label}.html`)
  writeFileSync(file, page(overflow, gridClass))
  const dom = execFileSync(CHROMIUM, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
    "--window-size=1440,900", "--virtual-time-budget=10000", "--dump-dom", `file://${file}`],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 32 * 1024 * 1024 })
  const m = dom.match(/<pre id="result">([\s\S]*?)<\/pre>/)
  if (!m) fail(`${label}: the card never reported.`)
  return JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&"))
}

/*
 * THE GRID IS THE WHOLE ANSWER, and it is not obvious from the source.
 *
 * `items-start` shrinks a grid item to its content, so the column holding
 * the card is exactly the card's height — and a sticky element with no room
 * inside its containing block has nowhere to stick. It scrolls away looking
 * exactly like an element with no sticky at all.
 *
 * Stretched, the column is as tall as the row, and the card travels down it.
 */
const before = measure("items-start", "visible", "lg:items-start")
const ok = measure("shipped", "visible", "")
console.log(`\n  with lg:items-start: the card ends at ${before.topAfterScroll}px after scrolling — it does not stick`)
console.log(`\n  the page scrolled ${ok.scrolled}px`)
console.log(`  the card's top: ${ok.topBeforeScroll}px before, ${ok.topAfterScroll}px after`)
console.log(`  "${ok.titleText}" is ${ok.titleAbovePrice ? "above" : "BELOW"} the price\n`)

const problems = []
if (Math.abs(before.topAfterScroll - 24) <= 2) problems.push(`With lg:items-start the card held its position, so that is not what was breaking it and this probe is measuring the wrong thing.`)
if (ok.scrolled < 500) problems.push(`The page only scrolled ${ok.scrolled}px, so nothing was really tested.`)
if (Math.abs(ok.topAfterScroll - 24) > 2) problems.push(`After scrolling ${ok.scrolled}px the card's top is at ${ok.topAfterScroll}px. Sticky at top-6 should hold it at 24px; it is being carried off the screen.`)
if (!ok.titleAbovePrice) problems.push(`The title is not above the price in the card.`)
if (!ok.titleText) problems.push(`The card has no title in it at all.`)

/* And the thing that silently kills it, so the check is known to be live. */
const clipped = measure("clipped", "hidden", "")
if (Math.abs(clipped.topAfterScroll - 24) <= 2) {
  problems.push(`With an ancestor set to overflow:hidden the card STILL held its position, so this probe is not actually measuring sticky.`)
} else {
  console.log(`  (control: with an ancestor clipped, the card lands at ${clipped.topAfterScroll}px — so the measurement is live)\n`)
}

if (problems.length) {
  console.error(`${problems.length} problem${problems.length > 1 ? "s" : ""}:\n`)
  problems.forEach((p, i) => console.error(`  ${i + 1}. ${p}`))
  console.error("")
  process.exit(1)
}
console.log("The card holds at the top of the screen while the page scrolls, with the title over the price.\n")
