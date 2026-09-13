/**
 * ===========================================================================
 *  THE CHART TOOLTIP, MEASURED AGAINST THE CARD IT LIVES IN
 * ===========================================================================
 * "The model there in the chart looks very bad and gets underlap in there in
 * the container."
 *
 * It did: at the first point the box was centred on x≈0 and translated back
 * by half its own width, so half of it was outside the card — "p 6" and
 * "ews: 3" instead of "Sep 6" and "Views: 3".
 *
 * The clamp that was supposed to prevent it divided by the tooltip's own
 * width, read from a ref that is null on the render which first shows the
 * tooltip. Width 0, clamp a no-op.
 *
 * The replacement anchors to the edge instead of centring, and needs no
 * measurement. Which means the thing that can now be wrong is the CSS: does
 * `left: calc(100% - 8px)` with `translateX(-100%)` actually put a box of
 * any width inside the card? That is what this measures — every position a
 * finger can produce, at several box widths, in a real browser.
 *
 *   node scripts/check-chart-tooltip.mjs
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)

/*
 * The rule the components apply, restated in the page below: the whole
 * position is one transform, and every percentage in it resolves against the
 * TOOLTIP'S OWN box, which is the point — nothing measures it.
 */

const out = mkdtempSync(join(tmpdir(), "storelib-tooltip-"))
const file = join(out, "index.html")

/** No regex literals or backslashes: a backslash in a template literal is eaten. */
writeFileSync(file, `<!doctype html><html><head><meta charset="utf-8"><style>
  body { margin: 0; font-family: system-ui, sans-serif; }
  .card { position: relative; overflow: hidden; background: #fff; border-radius: 16px; }
  .tip {
    position: absolute; top: 8px;
    background: #1a1a2e; color: #fff; border-radius: 8px;
    font-size: 12px; padding: 6px 12px; white-space: nowrap;
    max-width: calc(100% - 16px);
  }
</style></head><body>
<div id="stage"></div>
<script>
(function () {
  function shift(pct, track) {
    var x = (pct / 100) * track
    return "translateX(clamp(8px, calc(" + x.toFixed(1) + "px - 50%), calc(" + track + "px - 100% - 8px))) translateZ(0)"
  }

  var stage = document.getElementById("stage")
  var results = []
  /* Phone, small phone, and a desktop card. */
  var cardWidths = [320, 360, 430, 720]
  /* Short label through to the longest one this tooltip really shows. */
  var labels = ["Sep 6", "Views: 3", "Revenue: $1,240.50", "Sep 13 — Views: 128,400 (12 refunded)"]

  for (var c = 0; c < cardWidths.length; c++) {
    for (var l = 0; l < labels.length; l++) {
      var card = document.createElement("div")
      card.className = "card"
      card.style.width = cardWidths[c] + "px"
      card.style.height = "60px"
      stage.appendChild(card)

      var tip = document.createElement("div")
      tip.className = "tip"
      tip.textContent = labels[l]
      card.appendChild(tip)

      /* Every position a finger can land on, at one percent steps. */
      for (var pct = 0; pct <= 100; pct++) {
        tip.style.left = "0"
        tip.style.transform = shift(pct, cardWidths[c])
        var cb = card.getBoundingClientRect()
        var tb = tip.getBoundingClientRect()
        var overLeft = Math.round(cb.left - tb.left)
        var overRight = Math.round(tb.right - cb.right)
        if (overLeft > 0 || overRight > 0) {
          results.push({
            cardWidth: cardWidths[c], label: labels[l], pct: pct,
            overLeft: overLeft, overRight: overRight,
            tipWidth: Math.round(tb.width),
          })
        }
      }
      stage.removeChild(card)
    }
  }

  var pre = document.createElement("pre")
  pre.id = "result"
  pre.textContent = JSON.stringify({ escapes: results, checked: cardWidths.length * labels.length * 101 })
  document.body.appendChild(pre)
})()
</script></body></html>`)

const dom = execFileSync(CHROMIUM, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
  "--window-size=900,600", "--virtual-time-budget=4000", "--dump-dom", `file://${file}`],
  { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 32 * 1024 * 1024 })

const m = dom.match(/<pre id="result">([\s\S]*?)<\/pre>/)
if (!m) fail("The page did not report. Nothing was measured.")
const decode = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
const r = JSON.parse(decode(m[1]))

console.log(`  ${r.checked} positions measured: 4 card widths x 4 label lengths x every percent`)

if (r.escapes.length > 0) {
  const worst = r.escapes.reduce((a, b) => (Math.max(b.overLeft, b.overRight) > Math.max(a.overLeft, a.overRight) ? b : a))
  console.log(`  ${r.escapes.length} of them put the box outside the card`)
  console.log(`  worst: "${worst.label}" (${worst.tipWidth}px) at ${worst.pct}% in a ${worst.cardWidth}px card — ${worst.overLeft}px past the left, ${worst.overRight}px past the right`)
  fail("the tooltip still underlaps the container")
}

console.log("\nat every position a finger can produce, at every card width and label length, the tooltip stays inside the card.")
