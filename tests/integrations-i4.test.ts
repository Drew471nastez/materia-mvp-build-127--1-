/**
 * Round I4: the integrations directory with less to read, Storelib's own
 * apps backed by real settings, an Essentials list pinned first with
 * "N of M set up", and one clean tile set for Storelib's own marks.
 *
 *   npx tsx tests/integrations-i4.test.ts
 *
 * The pictures are scripts in the round's scratchpad (desktop and phone,
 * the catalog, Essentials, a built in app's page and an icon sheet).
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { APP_STATE_LABEL, ESSENTIALS, STORELIB_APPS, STORELIB_CATALOG_APPS, appStatesFrom, essentialIds, essentialsProgress, storelibApps, type AppFacts } from "@/lib/integrations/storelib-apps"
import { INTEGRATIONS } from "@/lib/integrations/catalog"
import { untt } from "./i18n-source"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 300)}`}`)
}
const read = (p: string) => untt(readFileSync(join(process.cwd(), p), "utf8"), p)

const unknown: AppFacts = { paymentsReady: null, shippingRates: null, pickupOrLocal: null, taxRegions: null, reviewsOn: null, emailMarketing: null, domainLive: null, coupons: null, activeOffers: null, abandonedRecovery: null, requireAccount: null, moreMarkets: null, codeConnected: null }

console.log("\nStorelib's own apps are real features\n")
{
  const settings = read("components/app/settings-form-new.tsx")
  const tabs = new Set([...settings.slice(settings.indexOf("const TABS = ["), settings.indexOf("] as const")).matchAll(/\{ id: "([a-z_]+)"/g)].map((m) => m[1]))
  const broken = STORELIB_APPS.filter((a) => {
    const tab = a.href.match(/^\/app\/settings\?tab=([a-z_]+)$/)
    if (tab) return !tabs.has(tab[1])
    return !existsSync(join(process.cwd(), "app", a.href.replace(/^\//, ""), "page.tsx"))
  }).map((a) => a.href)
  check("every app goes to a page that exists (a Settings section or an /app page)", broken.length === 0, broken)
  check("every app has its own id, none the same as a catalog integration's", new Set(STORELIB_APPS.map((a) => a.id)).size === STORELIB_APPS.length && !STORELIB_APPS.some((a) => INTEGRATIONS.some((i) => i.id === a.id)))
  check("Reviews and Courier tracking are still the catalog's, with their pages", STORELIB_CATALOG_APPS.every((id) => INTEGRATIONS.some((i) => i.id === id)))
  check("the shipping ones only while physical commerce is on", storelibApps(false).every((a) => !a.physical) && storelibApps(true).length === STORELIB_APPS.length && storelibApps(false).length < STORELIB_APPS.length)
  const copy = STORELIB_APPS.map((a) => `${a.name} ${a.summary}`).join(" ")
  check("one short line each, plain words, no em dash, no Shopify", STORELIB_APPS.every((a) => a.summary.length <= 60) && !/[—–]|Shopify|Liquid|seamless|effortless|unlock|powerful/i.test(copy), STORELIB_APPS.filter((a) => a.summary.length > 60).map((a) => a.id))
  check("no app for something Storelib doesn't have (gift wrap, wishlist)", !/gift|wishlist/i.test(copy))
}

console.log("\nStates come from the store, never a guess\n")
{
  const none = appStatesFrom(unknown)
  check("a read that failed shows nothing", ["storelib-payments", "storelib-taxes", "storelib-domain", "storelib-discounts", "storelib-reviews", "storelib-email-marketing"].every((id) => none[id] === null))
  check("  only what is on for every store says On by itself (customer emails, analytics, tracking)", Object.entries(none).filter(([, v]) => v === "on").map(([k]) => k).sort().join() === "courier-tracking,storelib-analytics,storelib-customer-emails")
  const s = appStatesFrom({ ...unknown, paymentsReady: true, taxRegions: 0, coupons: 3, reviewsOn: false, abandonedRecovery: false, requireAccount: true, shippingRates: 0, pickupOrLocal: 1, domainLive: false })
  check("ready is On, nothing yet is Set up, a switch turned off is Off", s["storelib-payments"] === "on" && s["storelib-taxes"] === "setup" && s["storelib-discounts"] === "on" && s["storelib-reviews"] === "off" && s["storelib-checkout-reminders"] === "off" && s["storelib-accounts"] === "on" && s["storelib-domain"] === "setup")
  check("  shipping counts local pickup or delivery as a way to get it there", s["storelib-shipping"] === "on" && s["storelib-pickup"] === "on")
  check("the words: On, Off, Set up", APP_STATE_LABEL.on === "On" && APP_STATE_LABEL.off === "Off" && APP_STATE_LABEL.setup === "Set up")
}

console.log("\nEssentials\n")
{
  const all = new Set([...STORELIB_APPS.map((a) => a.id), ...INTEGRATIONS.map((i) => i.id)])
  check("every essential is an app or an integration there is", ESSENTIALS.every((e) => all.has(e.id)), ESSENTIALS.filter((e) => !all.has(e.id)))
  check("payments, shipping, taxes, customer emails, reviews, analytics, email marketing, a domain", essentialIds(true).join() === "storelib-payments,storelib-shipping,storelib-taxes,storelib-customer-emails,storelib-reviews,storelib-analytics,storelib-email-marketing,storelib-domain")
  check("  shipping only for a store that ships", essentialIds(false).length === 7 && !essentialIds(false).includes("storelib-shipping"))
  const states = appStatesFrom({ ...unknown, paymentsReady: true, reviewsOn: true, taxRegions: 0 })
  const p = essentialsProgress(true, states)
  check("N of M counts only what is On; unknown is not done", p.total === 8 && p.done === 4, p)
  check("  nothing read yet is 0 done, never more", essentialsProgress(false, {}).done === 0)
}

console.log("\nThe directory\n")
{
  const ui = read("components/app/settings/integrations-directory.tsx")
  /* Changed on purpose (the owner: "make the Storelib integrations the main thing there, and don't mix them in All"): Storelib apps first and where the page opens, Essentials after it. */
  check("All is the first pill and where the page opens, then Installed (changed on purpose: the owner, \"Storelib apps should not be the first pill\")", /useState<Filter>\("all"\)/.test(ui) && /* Changed on purpose (the owner: "get rid of the Essential pill"). */ /\["all", "installed", "storelib"/.test(ui))
  check("  All is everything; Storelib's core settings (payments, taxes...) are never listed as integrations", /filter === "all" \? true/.test(ui) && /\["all", entries\.length\]/.test(ui) && /apps\.filter\(\(a\) => !a\.core\)/.test(ui))
  /* Changed on purpose (the owner: "in the integrations get rid of the Essential pill"): no Essentials pill, nor the checklist it opened. */
  check("no Essentials pill, nor its checklist", !/"essentials"/.test(ui) && !/data-integration-essentials/.test(ui) && !/EssentialsPanel/.test(ui))
  check("a Storelib app card goes straight to where it is set up, with its state", /<Link href=\{hrefOf\(e\.app\)\} data-integration-card=\{e\.id\} data-storelib-app=\{e\.id\}/.test(ui) && /<AppBadge state=\{appState\(e\.id\)\} \/>/.test(ui))
  check("a search looks through everything whatever pill is on", /const shown = q\s*\? entries\.filter\(matches\)/.test(ui))
  check("on a phone one list of rows, from 640px a grid of cards", /divide-y divide-\[#f1f2f4\] overflow-hidden sm:grid sm:grid-cols-2/.test(ui) && /sm:h-full sm:flex-col/.test(ui))
  /* Changed on purpose (the owner: the pills were "buggy and glitchy"): no sliding thumb (it crossed wrapped rows diagonally, the words went white before it came), no fade on the cards; the pressed pill is dark in the same frame and still scrolled into view on a phone. */
  check("the pills: dark in the same frame, no thumb, no card fade, the pressed pill scrolled into view", !/data-integration-pill-thumb/.test(ui) && !/placeThumb/.test(ui) && /on \? "border-\[#1a1a2e\] bg-\[#1a1a2e\] text-white"/.test(ui) && !/translate3d\(0, 6px, 0\)/.test(ui) && /list\.animate\(\[\{ opacity: 0\.55 \}, \{ opacity: 1 \}\], \{ duration: 140/.test(ui) && /row\.scrollTo\(\{ left: to/.test(ui) && /reduced\(\)/.test(ui))
  check("  every logo is fetched once when the directory opens, so a category's cards paint with theirs", /new Image\(\)/.test(ui) && !/loading="lazy"/.test(read("components/app/settings/integration-mark.tsx").split("export function MiniMark")[0]))
  check("a page: What it does on top, the rest closed under How it works and your data", />What it does</.test(ui) && /<details className="group border-t/.test(ui) && /How it works and your data/.test(ui) && /item\.lead \?\? item\.about\[0\]/.test(ui))
  const long = INTEGRATIONS.filter((i) => (i.lead ?? i.about[0]).length > 160).map((i) => i.id)
  check("  what shows before the details is short for every integration", long.length === 0, long)
  check("  the whole story is still there, under the details", INTEGRATIONS.every((i) => i.about.length > 0 && i.data.length > 0))
}

console.log("\nThe states route reads the caller's own store\n")
{
  const route = read("app/api/store/integrations/apps/route.ts")
  const server = read("lib/integrations/storelib-apps-server.ts")
  check("signed in and their own store (or the one their team role lets them in)", /await shopCaller\(\)/.test(route) && /readAppFacts\(c\.db, c\.creatorId, physical\)/.test(route))
  const froms = [...server.matchAll(/db\.from\("([a-z_]+)"\)[^\n]*/g)]
  check("  every table read is filtered by the store's id (or its own websites' ids)", froms.length >= 8 && froms.every((m) => /\.eq\("creator_id", creatorId\)/.test(m[0]) || /\.in\("install_id", installRows/.test(m[0])), froms.map((m) => m[1]))
  check("  no database error text leaves it", !/error\.message|\.message\b/.test(server) && /return r\.error \? null : r/.test(server))
}

console.log("\nStorelib's own marks\n")
{
  const mark = read("components/app/settings/integration-mark.tsx")
  const tiles = new Set([...mark.slice(mark.indexOf("const STORELIB_TILES"), mark.indexOf("export const hasBuiltInArt")).matchAll(/^  "?([a-z-]+)"?: \{ icon: [A-Za-z]+, tint: "(money|ship|reach|insight|site)" \}/gm)].map((m) => m[1]))
  const missing = [...STORELIB_APPS.map((a) => a.id), ...STORELIB_CATALOG_APPS, "manual", "supplier-email", "custom-webhook", "csv"].filter((id) => !tiles.has(id))
  check("every Storelib app has a tile: a tint and a glyph", missing.length === 0, missing)
  check("one family: five tints, white glyph, one weight, the logo tile's corner", (mark.match(/top: "#/g) ?? []).length === 5 && /className="flex shrink-0 items-center justify-center text-white"/.test(mark) && /const radiusAt = \(size: number\) => Math\.max\(4, Math\.round\(size \* 0\.27\)\)/.test(mark))
  check("  no drawing, no logo badge, no purple", !/<path d=/.test(mark) && !/StorelibLogo/.test(mark) && !/#8b5cf6|#7c3aed|violet/i.test(mark))
  check("third party logos stay their own files", INTEGRATIONS.filter((i) => !STORELIB_CATALOG_APPS.includes(i.id as never) && i.logo).every((i) => existsSync(join(process.cwd(), "public", i.logo!))))
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
