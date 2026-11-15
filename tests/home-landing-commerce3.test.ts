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

console.log("\nHow it works: four cards, wide and narrow")
// Changed on purpose (landing round 7): the owner asked for section 3's structure, a two by two grid of wide and narrow cards, not six even tiles.
// Changed on purpose (landing round 9): three cards in one row from 1100px, narrow, wide, narrow (the owner's reference); one column on a phone.
check("three cards, narrow, wide, narrow, in one row; one column on a phone", () => {
  assert.equal((how.match(/class="cmh-card /g) ?? []).length, 3)
  assert.deepEqual([...how.matchAll(/class="cmh-card (cmh-wide|cmh-narrow)"/g)].map((m) => m[1]), ["cmh-narrow", "cmh-wide", "cmh-narrow"])
  assert.ok(/\.cmh-grid\{display:grid;grid-template-columns:minmax\(0,1fr\)/.test(howCss))
  assert.ok(/\.cmh-grid\{grid-template-columns:minmax\(0,1fr\) minmax\(0,2fr\) minmax\(0,1fr\)/.test(howCss))
})
check("the first tile still sells a physical and a digital product, and there are no Golden Hour presets", () => {
  const w = words(how)
  /* Changed on purpose (landing round 4): no blue tee, no Weeknight Pasta. */
  // Changed on purpose (landing round 5): no cap either (the owner); the physical product is Nadia's signed print.
  // Changed on purpose (landing round 7): the owner did not like Nadia Brooks or LaSalle at dusk; the shop is Linde Woodshop, an apron and workbench plans.
  // Changed on purpose (landing round 8): the owner asked for "just a t-shirt" and the Cine Tones LUT pack in place of the apron and the plans.
  // Changed on purpose (landing round 9): no products card (it repeated section 3); the two products are section 3's, as the shop's top products.
  assert.ok(!/Sell physical and digital products\./.test(w) && /Midnight Studio Tee/.test(w) && /Cine Tones LUT Pack/.test(w) && !/LaSalle|Nadia|The Loop|Darkroom cap|Apron|Workbench/.test(w))
  for (const f of [HOW, CO, "components/marketing/home/ebook-cover.tsx", "components/marketing/home/commerce-kit.tsx"]) assert.ok(!/golden hour|preset/i.test(read(f)), f)
})

console.log("\nYour own domain")
/* Changed on purpose (landing round 4): a cleaner design: the pill over the domain's own card (Pro, the three addresses, DNS checked, HTTPS on), no drawn website. */
// Changed on purpose (landing round 5): the owner found the tile "too colorful": one dark card, the address bar with its lock on top, the two records Storelib asks for, no purple TLD, no green pill.
// Changed on purpose (landing round 7, the owner: "bring back the design how it was before", on black to purple): the round 3 tile again, his website under the address pill and the three addresses checked, on a dark ground that turns deep purple.
// Changed on purpose (landing round 8) (the owner: the www, shop and club banner was "too complex", and the black card the odd one out): one browser window on a light ground, his domain typing into the address bar over his website.
// Changed on purpose (landing round 9): the owner liked the card, not its design: one address pill over his website on a peach ground, no browser window.
// Changed on purpose (landing round 10): the owner: "more simple and clean, similar to Ready for Google and AI search": one address on a white band, its ending gliding through, no website, no ticks.
// Changed on purpose (landing round 11): the owner disliked the pictures again: his website in a browser, the address closing from lindewood.storelib.com to lindewood.com, on a warm near white ground.
check("the tile: his website in a browser, its address closing to his own domain, on a light ground", () => {
  assert.ok(how.includes('class="cmh-dm-win"') && how.includes('class="cmh-dm-page"') && !how.includes("cmh-dm-band") && !how.includes("cmh-pill") && !how.includes("cmh-dm-row"))
  assert.ok(how.includes(`<span class="cmh-dm-name">${HOW_DOMAIN.name}</span>`) && `${HOW_DOMAIN.name}.com` === HOW_DOMAIN.host && `${HOW_DOMAIN.name}.storelib.com` === HOW_DOMAIN.before)
  assert.ok(/data-ground="domain"/.test(how) && !/data-ground="night"/.test(how))
  assert.ok(!/backdrop-filter|blur\(/.test(howCss), "no glass")
  assert.ok(/Use your own domain/.test(words(how)))
})
check("the address is one Storelib would accept, and is not a Storelib name", () => {
  const apex = cleanHostname(HOW_DOMAIN.host)
  assert.equal(apex, HOW_DOMAIN.host)
  assert.equal(hostnameProblem(apex), null)
  /* A bare domain is served at its www; the bar shows it the way a buyer types it. */
  assert.equal(servingHost(apex), `www.${apex}`)
  assert.ok(!/storelib/.test(apex))
})
// Changed on purpose (landing round 9): the caption is one short line ("your site"); the three purposes stay the code's.
check("it serves one of the things a domain can serve in the product", () => {
  assert.ok((DOMAIN_PURPOSES as readonly string[]).includes(HOW_DOMAIN.purpose))
  const w = words(how)
  /* The creator page's domain serves the OnePage too (at /links). */
  assert.ok(/OnePage at \/links/.test(read("components/app/settings/domains-panel.tsx")) && /OnePage at \/links/.test(read("lib/custom-domains/store.ts")))
  /* One community per domain. */
  assert.ok(/purpose 'community'/.test(read("lib/custom-domains/store.ts")))
  /* Nothing else is claimed: no store, checkout, email or app on the domain. */
  const cap = w.slice(w.indexOf("Use your own domain"))
  assert.ok(!/email|checkout|app\b|buy a domain|free/i.test(cap), cap)
})
check("the caption's claims are the code's: Pro, a domain you own, HTTPS follows", () => {
  const w = words(how)
  const cap = w.slice(w.indexOf("Use your own domain"))
  // Changed on purpose (landing round 9): one short line; DNS and HTTPS are ticked in the picture.
  assert.ok(/On Pro, point a domain you own at your site\. HTTPS is set up for you\./.test(cap))
  assert.ok(!/DNS found|HTTPS on/.test(w)) // Changed on purpose (landing round 10): no ticks in the picture; the lock on the band stays.
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
// Changed on purpose (landing round 10): one reel of endings and one turning light, no ticks.
// Changed on purpose (landing round 11): ".storelib" fades, ".com" closes over it, the lock turns violet, the address fades back to start.
check("its motion: the address closes, transform and opacity only, paused off screen, still when motion is reduced", () => {
  // Changed on purpose (landing round 8): the letters come one after another, then the lock; no ticks.
  // Changed on purpose (landing round 9): no typing; the address swaps, then the lock turns violet, then DNS and HTTPS tick.
  const keys = ["cmh-dm-cut", "cmh-dm-com", "cmh-dm-on", "cmh-dm-text"]
  for (const k of keys) {
    const m = howCss.match(new RegExp(`@keyframes ${k}\\{([\\s\\S]*?\\})\\}`))
    assert.ok(m, k)
    const props = [...m![1].matchAll(/([a-z-]+):/g)].map((x) => x[1])
    assert.ok(props.every((p) => p === "opacity" || p === "transform"), `${k}: ${props.join(",")}`)
  }
  assert.ok(/class="cmh-a cmh-dm-cut"/.test(how) && /class="cmh-a cmh-dm-com"/.test(how) && /class="cmh-a cmh-dm-on"/.test(how))
  assert.ok(/\.cmh-a\{[^}]*animation-play-state:paused!important/.test(howCss))
  assert.ok(/\[data-commerce-live\] \.cmh-a\{animation-play-state:running!important\}/.test(howCss))
  assert.ok(/@media \(prefers-reduced-motion:reduce\)\{\s*\.cmh-a\{animation:none!important\}/.test(howCss)) /* Changed on purpose (landing round 4): no spinner any more. */
})

console.log("\nCheckout tabs")
const loopS = Number(read(CO).match(/const LOOP_S = (\d+)/)![1])
check("every demo loops: one cycle that repeats for as long as its panel is open and on screen", () => {
  assert.ok(new RegExp(`animation-duration:${loopS}s;animation-iteration-count:infinite`).test(coCss))
  /* Changed on purpose (landing round 4): the scene's own scroll-driven block comes first now; the demos' loops are the block keyed on the open panel. */
  // Changed on purpose (landing round 8): the demos are cards, each keyed on its own live attribute.
  const live = [...coCss.matchAll(/@media \(prefers-reduced-motion:no-preference\)\{([\s\S]*?)\n\}/g)].map((m) => m[1]).find((b) => b.includes(".cmc-card[data-commerce-live]"))!
  const names = [...live.matchAll(/animation-name:([a-z0-9-]+)/g)].map((m) => m[1])
  assert.ok(names.length >= 30, String(names.length))
  for (const line of live.split("\n").filter((l) => /animation-name/.test(l))) assert.ok(/^\s*\.cmc-card\[data-commerce-live\] /.test(line), line)
  /* Nothing in a demo plays once and stops. */
  assert.ok(!/\.cmc-card\[data-commerce-live\] [^{]*\{animation:[^}]* both [\d.]+s\}/.test(coCss))
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
  // Changed on purpose (landing round 8): no autoplay: every card runs its own loop while it is on screen.
  assert.ok(!/AUTO_MS|setTimeout/.test(read(CO)))
})
check("the demos move by transform and opacity only", () => {
  for (const m of coCss.matchAll(/@keyframes (cmv-[a-z0-9-]+)\{([\s\S]*?\})\}/g)) {
    const props = [...m[2].matchAll(/[{;]([a-z-]+):/g)].map((x) => x[1])
    assert.ok(props.every((p) => p === "opacity" || p === "transform" || p === "animation-timing-function"), `${m[1]}: ${props.join(",")}`)
  }
})
check("One-tap payments is a phone and nothing else", () => {
  /* Changed on purpose (landing round 8): the demos are cards (data-k), not tab panels. */
  const panel = co.slice(co.indexOf('data-k="tap"'), co.indexOf('data-k="currency"'))
  assert.equal((panel.match(/class="cmc-phone"/g) ?? []).length, 1)
  assert.ok(!/cmv-br|cmv-bar|cmv-url|cmv-page/.test(panel), "no browser")
  /* Changed on purpose (landing round 7): the phone is the full page checkout, its express Apple Pay button and then Apple Pay's own sheet. */
  // Changed on purpose (landing round 8): the phone sells the Cine Tones LUT Pack ($29).
  assert.ok(/Pay \$29\.00/.test(words(panel)) && /Confirm with Side Button/.test(words(panel)))
  // Changed on purpose (landing round 9): one picture for Built to convert on every screen (the owner: on a phone "like on desktop"), so the phone layout that followed the window is gone.
  const convert = co.slice(co.indexOf('class="cdx"'), co.indexOf('data-k="tap"'))
  assert.ok(/cdx-win/.test(convert) && !/class="cmc-phone"/.test(convert), "the browser is Built to convert's") /* Changed on purpose (landing round 4): the website checkout's window. */
})
/* Changed on purpose (landing round 5, the owner: "not pill shapes, should be tabs, how they were before"): the dark tab cards of 0724a74c1, no pills. */
/* Changed on purpose (landing round 8): the tabs became four dark cards in a grid that slides up over the phone (the owner's recording); still no pills. */
check("the demos are dark cards in a grid, not pills: no coloured chips", () => {
  const grid = rule(coCss, ".cmc-bento")
  assert.ok(/display:grid/.test(grid) && !/999px/.test(grid))
  // Changed on purpose (landing round 10): the same dark, a little see-through, so the products going round behind the cards show faintly.
  // Changed on purpose (landing round 11): the cards are solid (the owner: not transparent).
  assert.ok(/\.cmc-card\{[^}]*border-radius:28px;background:#111113/.test(coCss) && !/\.cmc-card\{[^}]*999px/.test(coCss))
  assert.equal((co.match(/class="cmc-card"/g) ?? []).length, 4)
  assert.equal((co.match(/role="tab"/g) ?? []).length, 0)
})
check("on black the cards are dark surfaces: the panel, the price card, the email, the receipt, the seller's note", () => {
  /* Changed on purpose (landing round 8): the cards are the surfaces (cmc-card), the price tiles (cv-tile) and the email dark on them; the wallet rows became the wallets' own black buttons. */
  // Changed on purpose (landing round 10): see above.
  // Changed on purpose (landing round 11): the cards are solid.
  assert.ok(/\.cmc-card\{[^}]*background:#111113;border:1px solid rgba\(255,255,255,\.08\)/.test(coCss))
  assert.ok(/\.cmv-mail\{[^}]*background:#1a1a1e/.test(coCss) && /\.cv-tile\{[^}]*background:#1a1a1e/.test(coCss))
  assert.ok(/\.cmv-sale\{[^}]*background:#26262b/.test(coCss))
  for (const sel of [".cv-tile", ".cmv-mail", ".tp-btn", ".cmv-sale", ".cv-chips", ".cmc-vis"]) assert.ok(!/background:(#fff|#f[0-9a-f]{5}|rgba\(24[0-9],)/.test(rule(coCss, sel)), sel)
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
  /* Changed on purpose (landing round 8): no tabs, so nothing in the checkout has a hover state. */
  assert.ok(hovers.length === 0, hovers.join(" | "))
  assert.ok(!/<(a|button|input|select)\b/.test(how), "no control in How it works")
  const buttons = co.match(/<button\b[^>]*>/g) ?? []
  assert.ok(buttons.length === 0) /* Changed on purpose (landing round 8): no tabs, no buttons; the cards are read and swiped, not pressed. */
  assert.ok(!/<(a|input|select)\b/.test(co))
})

check("registered in the push suite", () => {
  assert.ok(read("scripts/run-push-tests.mjs").includes('"tests/home-landing-commerce3.test.ts"'))
})

console.log(`\nhome-landing-commerce3: ${passed} checks passed`)
