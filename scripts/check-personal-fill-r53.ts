/**
 * ===========================================================================
 *  THE SHARED PAGE'S FILL, IN A REAL BROWSER (round 53)
 * ===========================================================================
 * A theme whose header draws the cart count and the account link, with a
 * <style> inside the section (which the live page gathers into its head,
 * ./first-load.ts, leaving a <template data-sl-moved> in its place). The
 * shared copy is drawn as the handler draws it (no cart, nobody signed in),
 * made ready for its first paint, and opened in headless Chromium with the
 * buyer's hints; its private request is answered with what the handler's
 * personalAnswer answers for a buyer with two things in the cart who is
 * signed in. Then: is the count 2, does the link say their name, and is the
 * element the theme's script bound a listener to still the same element.
 *
 *   npx tsx scripts/check-personal-fill-r53.ts
 */
import puppeteer from "puppeteer-core"
import { CompatTheme, wrapCompatTemplate } from "../lib/storelib-theme/compat/theme"
import { answer, type SiteData } from "../lib/storelib-theme/compat/site"
import { readierFirstLoad } from "../lib/storelib-theme/compat/first-load"
import { personalFillTag } from "../lib/storelib-theme/compat/personal-fill"

const section = (type: string, markup: string) => `${wrapCompatTemplate(markup)}\n\n<schema>\n${JSON.stringify({ type, name: type, settings: [] })}\n</schema>\n`
const theme = new CompatTheme({
  "layout/theme.storelib": wrapCompatTemplate(`<html><head>{{ content_for_header }}</head><body>{% sections 'header-group' %}<div id="lay" data-n="{{ cart.item_count }}">{{ cart.item_count }}</div><main>{{ content_for_layout }}</main></body></html>`),
  "sections/hdr.storelib": section("hdr", `<style>.hdr{color:#1a1a2e}</style><header class="hdr"><nav id="nav"><a href="/">Home</a></nav><a id="icon" href="/cart"><span class="count" data-count="{{ cart.item_count }}">{{ cart.item_count }}</span></a>{% if customer %}<a class="acct" href="/account">Hi {{ customer.first_name }}</a>{% else %}<a class="acct" href="/account/login">Log in</a>{% endif %}</header>`),
  "sections/hero.storelib": section("hero", `<h1>Linen for summer</h1>`),
}, {}, { assetUrl: (n) => `/a/${n}` })
const ID = "00000000-0000-4000-8000-000000000001"
const site: SiteData = { creatorId: "c0ffee00-0000-4000-8000-000000000000", theme, pages: { home: [{ id: "header", type: "hdr", group: "header" }, { id: "hero", type: "hero" }] }, products: [{ id: ID, settings: { title: "Shirt", price: "$40.00", url: "/products/shirt", slug: "shirt", available: true } } as never], collections: [], menus: {}, shop: { name: "Shop", currency: "USD", moneyFormat: "${{amount}}" }, host: "shop.test" }

async function main() {
const shared = await answer(site, { method: "GET", path: "/", query: new URLSearchParams(), body: null, cart: [] })
let html = String(shared.body)
const end = html.search(/<\/body>(?![\s\S]*<\/body>)/i)
html = `${html.slice(0, end)}${personalFillTag(shared.personal ?? { sections: [], layout: false })}${html.slice(end)}`
html = readierFirstLoad(html).html
const ids = (shared.personal?.sections ?? []).join(",")
const mine = await answer(site, { method: "GET", path: "/", query: new URLSearchParams(`sl_personal=${ids}&sl_layout=1`), body: null, cart: [{ k: "k1", p: ID, v: null, q: 2 }], account: { customer: { name: "Ana Pop", first_name: "Ana", email: "ana@mail.test", orders: [], orders_count: 0 } } })

const browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] })
let bad = 0
try {
  const page = await browser.newPage()
  await page.setRequestInterception(true)
  let asked = 0
  page.on("request", (r) => {
    const u = new URL(r.url())
    if (u.searchParams.has("sl_personal")) { asked++; r.respond({ status: 200, contentType: "application/json", body: String(mine.body) }); return }
    if (u.pathname === "/") { r.respond({ status: 200, contentType: "text/html", body: html }); return }
    r.respond({ status: 404, body: "" })
  })
  await page.setCookie({ name: "sl_cart_n", value: "2", url: "https://shop.test/" }, { name: "sl_signed_in", value: "1", url: "https://shop.test/" })
  await page.evaluateOnNewDocument(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const nav = document.getElementById("nav") as HTMLElement & { __bound?: number }
      const icon = document.getElementById("icon") as HTMLElement & { __bound?: number }
      if (nav) nav.__bound = 1
      if (icon) icon.__bound = 1
    })
  })
  await page.goto("https://shop.test/", { waitUntil: "load" })
  await new Promise((r) => setTimeout(r, 800))
  const seen = await page.evaluate(() => ({
    count: document.querySelector(".count")?.textContent,
    attr: document.querySelector(".count")?.getAttribute("data-count"),
    acct: document.querySelector(".acct")?.textContent,
    href: document.querySelector(".acct")?.getAttribute("href"),
    lay: document.getElementById("lay")?.textContent,
    navSame: (document.getElementById("nav") as unknown as { __bound?: number })?.__bound === 1,
    iconSame: (document.getElementById("icon") as unknown as { __bound?: number })?.__bound === 1,
    hint: document.cookie,
  }))
  const ok = (what: string, cond: boolean) => { console.log(`  ${cond ? "ok  " : "FAIL"}  ${what}`); if (!cond) bad++ }
  console.log(JSON.stringify(seen))
  ok("one private request", asked === 1)
  ok("the cart count says 2, text and attribute", seen.count === "2" && seen.attr === "2")
  ok("the account link is theirs", seen.acct === "Hi Ana" && seen.href === "/account")
  ok("the layout's own count too", seen.lay === "2")
  ok("the header's elements the theme bound are the same elements", seen.navSame && seen.iconSame)
} finally {
  await browser.close()
}
console.log(bad ? `\n${bad} failed` : "\nall passed")
process.exit(bad ? 1 : 0)
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
