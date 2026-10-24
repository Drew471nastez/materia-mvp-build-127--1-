/**
 * ===========================================================================
 *  THE WISHLIST, IN THE BUILDER'S CANVAS
 * ===========================================================================
 * "Make wishlists fully functional inside the Website Builder preview."
 *
 * The real editor (editor-probe-harness.mjs), a home page with the product
 * grid and the Wishlist page, four products. A heart pressed on the home page
 * must show on the Wishlist page, and its heart there must take it out again
 * with the empty line shown. Before any heart, the Wishlist page shows sample
 * cards so it can be styled. Nothing is written to the browser's storage.
 *
 *   node scripts/check-editor-wishlist.mjs
 */
import { drivePage } from "./editor-probe-harness.mjs"

const CARDS = ["Linen shirt", "Wool scarf", "Canvas tote", "Leather belt", "Felt hat", "Silk tie"].map((title, i) => ({
  id: `00000000-0000-4000-8000-00000000000${i + 1}`,
  type: "product",
  settings: {
    title, price: `$${24 + i * 6}.00`, compare_price: "", currency: "USD", free: false, pay_what_you_want: false,
    image: "", images: [], url: `/products/p${i}`, slug: `p${i}`, kind: "physical", available: true, tag: "", checkout_url: "", variants: [],
  },
}))

const BODY = `<script>
window.PROBE_CARDS = ${JSON.stringify(CARDS)}
window.PROBE_PAGES = { home: ["product_grid", "footer"], wishlist: ["main_wishlist", "footer"] }
window.PROBE_PAGE_DELAY_MS = 40
</script>`

const DRIVE = `
(async function () {
  var steps = []
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms) }) }
  /* Sections draw into shadow roots: every query goes through them. */
  function all(sel, root) {
    var out = [], stack = [root || document]
    while (stack.length) {
      var n = stack.pop()
      if (n.querySelectorAll) n.querySelectorAll(sel).forEach(function (e) { out.push(e) })
      var kids = n.querySelectorAll ? n.querySelectorAll("*") : []
      for (var i = 0; i < kids.length; i++) if (kids[i].shadowRoot) stack.push(kids[i].shadowRoot)
    }
    return out
  }
  function canvas() { return document.getElementById("wb-preview-root") }
  function visibleCards() { return all("[data-storelib-wishlist-card]", canvas()).filter(function (c) { return !c.hidden }).map(function (c) { return c.getAttribute("data-storelib-wishlist-card").slice(-1) }) }
  function emptyShown() { return all("[data-storelib-wishlist-empty]", canvas()).some(function (e) { return !e.hidden }) }
  async function open(key) {
    var opener = null
    document.querySelectorAll("button").forEach(function (b) { var t = (b.textContent || "").trim(); if (!opener && b.getClientRects().length && t.length < 40 && (/ page$/i.test(t) || /^(Home|Wishlist)$/.test(t))) opener = b })
    if (!opener) return "no switcher"
    opener.click()
    for (var i = 0; i < 40 && !document.querySelector("[data-page-row='" + key + "']"); i++) await sleep(50)
    var row = document.querySelector("[data-page-row='" + key + "']")
    if (!row) return "no row " + key
    row.click()
    await sleep(1800)
    return "ok"
  }
  try {
    for (var t = 0; t < 150 && !canvas(); t++) await sleep(200)
    await sleep(1500)
    var storageBefore = Object.keys(localStorage).filter(function (k) { return /wishlist/i.test(k) }).length
    steps.push({ label: "open wishlist first", r: await open("wishlist") })
    steps.push({ label: "before any heart: samples", cards: visibleCards(), empty: emptyShown() })
    var sample3 = all("[data-storelib-wishlist-card]:not([hidden]) [data-storelib-wishlist]", canvas()).find(function (h) { return /0003$/.test(h.getAttribute("data-storelib-wishlist")) })
    if (sample3) sample3.click()
    await sleep(300)
    steps.push({ label: "a sample's heart takes it out", cards: visibleCards() })
    steps.push({ label: "back home", r: await open("home") })
    var hearts = all("[data-storelib-wishlist]", canvas())
    steps.push({ label: "hearts on home", n: hearts.length })
    var second = hearts.find(function (h) { return /0005$/.test(h.getAttribute("data-storelib-wishlist")) })
    var sixth = hearts.find(function (h) { return /0006$/.test(h.getAttribute("data-storelib-wishlist")) })
    if (second) second.click()
    if (sixth) sixth.click()
    await sleep(300)
    steps.push({ label: "pressed on home", second: second && second.getAttribute("aria-pressed"), sixth: sixth && sixth.getAttribute("aria-pressed") })
    steps.push({ label: "to wishlist", r: await open("wishlist") })
    steps.push({ label: "saved shown", cards: visibleCards(), empty: emptyShown() })
    var remove = all("[data-storelib-wishlist-card]:not([hidden]) [data-storelib-wishlist]", canvas())
    remove.forEach(function (h) { h.click() })
    await sleep(300)
    steps.push({ label: "after removing all", cards: visibleCards(), empty: emptyShown() })
    var storageAfter = Object.keys(localStorage).filter(function (k) { return /wishlist/i.test(k) }).length
    steps.push({ label: "storage", before: storageBefore, after: storageAfter, cookie: /sl_wishlist/.test(document.cookie) })
  } catch (e) { steps.push({ label: "threw", message: String(e && e.message) }) }
  return steps
})()`

const steps = await drivePage({ width: 1440, height: 900, body: BODY, drive: DRIVE })
let bad = 0
const at = (l) => steps.find((s) => s.label === l) ?? {}
for (const s of steps) console.log("  " + JSON.stringify(s))
const expect = (name, ok) => { console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}`); if (!ok) bad++ }
console.log("")
expect("before any heart, four sample cards show, no empty line", JSON.stringify(at("before any heart: samples").cards) === JSON.stringify(["1", "2", "3", "4"]) && at("before any heart: samples").empty === false)
expect("a sample's heart takes that sample out, the others stay", JSON.stringify(at("a sample's heart takes it out").cards) === JSON.stringify(["1", "2", "4"]))
expect("hearts pressed on the home page show pressed", at("pressed on home").second === "true" && at("pressed on home").sixth === "true")
expect("the Wishlist page shows the samples kept and the two hearted", JSON.stringify([...(at("saved shown").cards ?? [])].sort()) === JSON.stringify(["1", "2", "4", "5", "6"]) && at("saved shown").empty === false)
expect("taking every one out leaves the empty line", (at("after removing all").cards ?? [1]).length === 0 && at("after removing all").empty === true)
expect("nothing written to this browser's storage or cookies", at("storage").after === at("storage").before && at("storage").cookie === false)
process.exit(bad ? 1 : 0)
