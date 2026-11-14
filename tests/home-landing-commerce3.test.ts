/**
 * LANDING ROUND 3, THE COMMERCE SECTIONS (storelib.com home)
 *
 * What the owner asked for, pinned:
 *
 *   your own domain   a sixth tile in How it works (no new section): the
 *                     shop's website under a large address pill, the TLD in
 *                     purple, a green tick, and under it the things a domain
 *                     can serve. Every claim is held to the product's code:
 *                     the three purposes, Pro, the DNS check, HTTPS.
 *   the grid          six equal tiles, three across on a desktop
 *   checkout tabs     "Built to convert" starts over after Payment complete
 *                     (every demo is one loop that repeats while on screen),
 *                     "One-tap payments" is a phone and nothing else, the
 *                     tabs are the pill tabs in their dark form, the cards on
 *                     black are dark surfaces
 *   pictures          nothing a mock draws takes the pointer or has a hover
 */
import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { createElement } from "react"
import { renderToString } from "react-dom/server"
import { HowItWorks, HOW_DOMAIN, HOW_IT_WORKS_STYLES } from "../components/marketing/home/how-it-works"
import { CheckoutScene, CHECKOUT_STYLES } from "../components/marketing/home/checkout-scene"
import { DOMAIN_PURPOSES, CNAME_TARGET, cleanHostname, hostnameProblem, servingHost } from "../lib/custom-domains/hostname"
import { siteLimits } from "../lib/sites/plan"

let passed = 0
const check = (label: string, fn: () => void) => {
  fn()
  passed++
  console.log(`  ok    ${label}`)
}
const read = (p: string) => readFileSync(p, "utf8")
const words = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<!-- -->/g, "").replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/\s+/g, " ")

const HOW = "components/marketing/home/how-it-works.tsx"
const CO = "components/marketing/home/checkout-scene.tsx"
const how = renderToString(createElement(HowItWorks))
const co = renderToString(createElement(CheckoutScene))
const howCss = HOW_IT_WORKS_STYLES.map((s) => s.css).join("\n")
const coCss = CHECKOUT_STYLES.map((s) => s.css).join("\n")
const rule = (css: string, selector: string) => {
  const i = css.indexOf(`${selector}{`)
  assert.ok(i >= 0, `no rule for ${selector}`)
  return css.slice(i, css.indexOf("}", i))
}

console.log("\nHow it works: six even tiles")
check("six tiles, none wider than another, three across on a desktop, two, then one", () => {
  assert.equal((how.match(/class="cmh-tile"/g) ?? []).length, 6)
  assert.ok(!/data-wide/.test(how) && !/data-wide/.test(howCss))
  assert.ok(/\.cmh-grid\{[^}]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/.test(howCss))
  assert.ok(/@media \(max-width:1179px\)\{\s*\.cmh-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)\}/.test(howCss))
  assert.ok(/@media \(max-width:639px\)\{\s*\.cmh-grid\{grid-template-columns:1fr\}/.test(howCss))
})
check("the first tile still sells a physical and a digital product, and there are no Golden Hour presets", () => {
  const w = words(how)
  assert.ok(/Sell physical and digital products\./.test(w) && /Darkroom cap/.test(w) && /After Dark/.test(w)) /* Changed on purpose (landing round 4): no blue tee, no Weeknight Pasta. */
  for (const f of [HOW, CO, "components/marketing/home/ebook-cover.tsx", "components/marketing/home/commerce-kit.tsx"]) assert.ok(!/golden hour|preset/i.test(read(f)), f)
})

console.log("\nYour own domain")
check("the tile: an address pill with the TLD apart and a tick, over the domain's settings card", () => {
  /* Changed on purpose (landing round 4): a cleaner design: the pill over the domain's own card (Pro, the three addresses, DNS checked, HTTPS on), no drawn website. */
  assert.ok(how.includes('class="cmh-dm-pill"') && how.includes('class="cmh-dm-card"') && /DNS checked/.test(words(how)) && /HTTPS on/.test(words(how)))
  assert.ok(new RegExp(`${HOW_DOMAIN.name.replace(/\./g, "\\.")}<b>\\${HOW_DOMAIN.tld}</b>`).test(how.replace(/<!-- -->/g, "")))
  assert.ok(/\.cmh-dm-addr b\{[^}]*color:#7c3aed/.test(howCss), "the TLD is purple")
  assert.ok(/\.cmh-dm-ok\{[^}]*color:#16a34a/.test(howCss), "the tick is green")
  assert.ok(/Use your own domain\./.test(words(how)))
})
check("the address is one Storelib would accept, and is not a Storelib name", () => {
  const host = `${HOW_DOMAIN.name}${HOW_DOMAIN.tld}`
  const apex = cleanHostname(host)
  assert.equal(hostnameProblem(apex), null)
  /* A bare domain is served at its www, which is the address the pill shows. */
  assert.equal(servingHost(apex), host)
  assert.ok(!/storelib/.test(host))
  for (const t of HOW_DOMAIN.targets.slice(1)) {
    const sub = `${t.sub}.${apex}`
    assert.equal(hostnameProblem(cleanHostname(sub)), null, sub)
    assert.equal(servingHost(sub), sub)
    assert.ok(how.replace(/<!-- -->/g, "").includes(`<b>${t.sub}</b>.${apex}`), sub)
  }
})
check("it shows exactly what a domain can serve in the product: the website, the creator page (with the OnePage), a community", () => {
  assert.deepEqual(HOW_DOMAIN.targets.map((t) => t.purpose), [...DOMAIN_PURPOSES])
  const w = words(how)
  for (const t of HOW_DOMAIN.targets) assert.ok(w.includes(t.what), t.what)
  /* The creator page's domain serves the OnePage too (at /links). */
  assert.ok(/OnePage at \/links/.test(read("components/app/settings/domains-panel.tsx")) && /OnePage at \/links/.test(read("lib/custom-domains/store.ts")))
  assert.ok(HOW_DOMAIN.targets.find((t) => t.purpose === "creator_page")!.what.includes("OnePage"))
  /* One community per domain. */
  assert.ok(/purpose 'community'/.test(read("lib/custom-domains/store.ts")))
  /* Nothing else is claimed: no store, checkout, email or app on the domain. */
  const cap = w.slice(w.indexOf("Use your own domain."))
  assert.ok(!/email|checkout|app\b|buy a domain|free/i.test(cap), cap)
})
check("the caption's claims are the code's: Pro, a domain you own, the DNS is checked, HTTPS follows", () => {
  const w = words(how)
  const cap = w.slice(w.indexOf("Use your own domain."))
  assert.ok(/On Pro, point a domain you own at your website, your creator page or a community\./.test(cap))
  assert.ok(/Storelib checks the DNS and adds HTTPS\./.test(cap))
  assert.equal(siteLimits("free").customDomain, false)
  assert.equal(siteLimits("pro").customDomain, true)
  const api = read("app/api/domains/route.ts")
  assert.ok(/siteGate\([^)]*\), "customDomain"\)/.test(api), "adding a domain is gated on the plan")
  const verify = read("app/api/domains/verify/route.ts")
  assert.ok(/resolveCname|resolve4/.test(verify) && /httpsAnswers/.test(verify), "the check reads DNS and waits for the certificate")
  assert.ok(/pending\s+-> ssl_provisioning -> active/.test(verify))
  assert.equal(CNAME_TARGET, "domains.storelib.com")
  assert.ok(existsSync("components/app/settings/domains-panel.tsx") && /slowingPoll/.test(read("components/app/settings/domains-panel.tsx")), "and it is asked again without the creator pressing anything")
})
check("its motion: the ticks come one after another, transform and opacity only, paused off screen, still when motion is reduced", () => {
  for (const k of ["cmh-dok", "cmh-dt0", "cmh-dt1", "cmh-dt2"]) {
    const m = howCss.match(new RegExp(`@keyframes ${k}\\{([\\s\\S]*?\\})\\}`))
    assert.ok(m, k)
    const props = [...m![1].matchAll(/([a-z-]+):/g)].map((x) => x[1])
    assert.ok(props.every((p) => p === "opacity" || p === "transform"), `${k}: ${props.join(",")}`)
  }
  const starts = ["cmh-dt0", "cmh-dt1", "cmh-dt2"].map((k) => Number(howCss.match(new RegExp(`@keyframes ${k}\\{0%,(\\d+)%`))![1]))
  assert.ok(starts[0] < starts[1] && starts[1] < starts[2], starts.join(","))
  assert.ok(/class="cmh-a cmh-dm-tick"/.test(how) && /class="cmh-a cmh-dm-ok"/.test(how))
  assert.ok(/\.cmh-a\{[^}]*animation-play-state:paused!important/.test(howCss))
  assert.ok(/\[data-commerce-live\] \.cmh-a\{animation-play-state:running!important\}/.test(howCss))
  assert.ok(/@media \(prefers-reduced-motion:reduce\)\{\s*\.cmh-a\{animation:none!important\}/.test(howCss)) /* Changed on purpose (landing round 4): no spinner any more. */
})

console.log("\nCheckout tabs")
const loopS = Number(read(CO).match(/const LOOP_S = (\d+)/)![1])
check("every demo loops: one cycle that repeats for as long as its panel is open and on screen", () => {
  assert.ok(new RegExp(`animation-duration:${loopS}s;animation-iteration-count:infinite`).test(coCss))
  /* Changed on purpose (landing round 4): the scene's own scroll-driven block comes first now; the demos' loops are the block keyed on the open panel. */
  const live = [...coCss.matchAll(/@media \(prefers-reduced-motion:no-preference\)\{([\s\S]*?)\n\}/g)].map((m) => m[1]).find((b) => b.includes(".cmc-panel[data-on]"))!
  const names = [...live.matchAll(/animation-name:([a-z0-9-]+)/g)].map((m) => m[1])
  assert.ok(names.length >= 30, String(names.length))
  for (const line of live.split("\n").filter((l) => /animation-name/.test(l))) assert.ok(/^\s*\[data-commerce-live\] \.cmc-panel\[data-on\] /.test(line), line)
  /* Nothing in a demo plays once and stops. */
  assert.ok(!/\.cmc-panel\[data-on\] [^{]*\{animation:[^}]* both [\d.]+s\}/.test(coCss))
  assert.ok(!/\.cmv-[a-z0-9-]+[^{}]*\{[^}]*animation:[^}]*forwards/.test(coCss))
})
/* Changed on purpose (landing round 4): Built to convert is the website checkout on a computer again (the owner's ask); its loop fills the form, pays, and goes back to the top under the paid screen before it fades. */
check("Built to convert starts over: the paid screen and the seller's note leave before the loop ends", () => {
  const kf = (name: string) => {
    const m = coCss.match(new RegExp(`@keyframes ${name}\\{([\\s\\S]*?\\})\\}`))
    assert.ok(m, name)
    return m![1]
  }
  for (const name of ["cdx-paid", "cmv-sale"]) {
    const k = kf(name)
    assert.ok(/^0%,[\d.]+%\{opacity:0/.test(k), `${name} starts hidden`)
    assert.ok(/,100%\{opacity:0/.test(k), `${name} ends hidden`)
  }
  assert.ok(/100%\{transform:translate3d\(0,0,0\)\}/.test(kf("cdx-scroll")), "the page is back at its top")
  assert.ok(/const AUTO_MS = LOOP_S \* 1000/.test(read(CO)))
})
check("the demos move by transform and opacity only", () => {
  for (const m of coCss.matchAll(/@keyframes (cmv-[a-z0-9-]+)\{([\s\S]*?\})\}/g)) {
    const props = [...m[2].matchAll(/[{;]([a-z-]+):/g)].map((x) => x[1])
    assert.ok(props.every((p) => p === "opacity" || p === "transform" || p === "animation-timing-function"), `${m[1]}: ${props.join(",")}`)
  }
})
check("One-tap payments is a phone and nothing else", () => {
  const panel = co.slice(co.indexOf('id="cmc-panel-tap"'), co.indexOf('id="cmc-panel-currency"'))
  assert.equal((panel.match(/class="cmc-phone"/g) ?? []).length, 1)
  assert.ok(!/cmv-br|cmv-bar|cmv-url|cmv-page/.test(panel), "no browser")
  assert.ok(/Pay \$19\.00 with Apple Pay/.test(words(panel)))
  const convert = co.slice(co.indexOf('id="cmc-panel-convert"'), co.indexOf('id="cmc-panel-tap"'))
  assert.ok(/cdx-win/.test(convert) && !/class="cmc-phone"/.test(convert), "the browser is Built to convert's") /* Changed on purpose (landing round 4): the website checkout's window. */
})
check("the tabs are the pill tabs in their dark form: a dark track with a light edge, the chosen pill white, no coloured chips", () => {
  const list = rule(coCss, ".cmc-tablist")
  assert.ok(/border-radius:999px/.test(list) && /background:#141416/.test(list) && /border:1px solid rgba\(255,255,255,\.08\)/.test(list))
  assert.ok(/\.cmc-tab\{[^}]*border-radius:999px[^}]*background:transparent/.test(coCss))
  assert.ok(/\.cmc-tab::before\{[^}]*background:#fff/.test(coCss) && /\.cmc-tab\[data-on\]\{color:#18181b\}/.test(coCss))
  assert.equal((co.match(/role="tab"/g) ?? []).length, 4) /* Changed on purpose (landing round 4): four tabs. */
  const tabs = co.slice(co.indexOf('role="tablist"'), co.indexOf('class="cmc-panels"'))
  assert.ok(!/<svg|<img/.test(tabs))
})
check("on black the cards are dark surfaces: the panel, the price card, the email, the receipt, the seller's note", () => {
  assert.ok(/\.cmc-panel\{[^}]*background:#111113;border:1px solid rgba\(255,255,255,\.08\)/.test(coCss))
  /* Changed on purpose (landing round 4): the receipt card went with the fifth tab; the wallet rows of One-tap payments are dark cards too. */
  assert.ok(/\.cmv-cc,\.cmv-mail,\.cmv-link\{[^}]*background:#1a1a1e/.test(coCss))
  assert.ok(/\.cmv-sale\{[^}]*background:#26262b/.test(coCss))
  for (const sel of [".cmv-cc", ".cmv-mail", ".cmv-link", ".cmv-sale", ".cmv-chips", ".cmc-vis"]) assert.ok(!/background:(#fff|#f[0-9a-f]{5}|rgba\(24[0-9],)/.test(rule(coCss, sel)), sel)
})
check("the words in the reminder are the email's own, and the currencies are ones checkout charges in", () => {
  const tpl = read("lib/physical/email-templates.ts")
  for (const s of ["Still thinking it over?", "Finish checkout", "you got as far as checkout and stopped there. If the payment failed or something looked off, you can pick up where you left off."]) {
    assert.ok(tpl.includes(s) && words(co).includes(s), s)
  }
  const rules = read("lib/payments/fees/currency-rules.ts")
  for (const code of ["USD", "EUR", "GBP", "JPY", "CAD"]) assert.ok(new RegExp(`\\b${code}: \\{`).test(rules) && words(co).includes(code), code)
})

console.log("\nPictures are not controls")
check("a mock takes no pointer and has no hover state; only the tabs are controls", () => {
  assert.ok(/\.cmh-stage\{[^}]*pointer-events:none/.test(howCss))
  assert.ok(/\.cmc-vis\{[^}]*pointer-events:none/.test(coCss))
  assert.ok(/\.cmc-phone\{[^}]*pointer-events:none/.test(coCss))
  assert.ok(!/:hover/.test(howCss))
  /* The checkout's own stylesheet (the kit's, shared with the calculator's real chips, is not this section's). */
  const own = CHECKOUT_STYLES.find((x) => x.href === "w12-commerce-checkout")!.css.replace(/@media \(hover:hover\)\{/g, "")
  const hovers = [...own.matchAll(/([^{}]*):hover[^{]*\{/g)].map((m) => m[0])
  assert.ok(hovers.length > 0 && hovers.every((h) => /^\.cmc-tab/.test(h.trim())), hovers.join(" | "))
  assert.ok(!/<(a|button|input|select)\b/.test(how), "no control in How it works")
  const buttons = co.match(/<button\b[^>]*>/g) ?? []
  assert.ok(buttons.length === 4 && buttons.every((b) => /role="tab"/.test(b))) /* Changed on purpose (landing round 4): four tabs. */
  assert.ok(!/<(a|input|select)\b/.test(co))
})

check("registered in the push suite", () => {
  assert.ok(read("scripts/run-push-tests.mjs").includes('"tests/home-landing-commerce3.test.ts"'))
})

console.log(`\nhome-landing-commerce3: ${passed} checks passed`)
