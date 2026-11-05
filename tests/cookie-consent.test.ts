/**
 * ===========================================================================
 *  COOKIE CONSENT
 * ===========================================================================
 * lib/consent holds the rules, components/cookie-consent-banner.tsx asks,
 * and every tracker checks before it stores anything. What this pins:
 *
 *   the record    versioned, expiring, readable by server and page
 *   the default   nothing optional before a choice
 *   the trackers  no identifier without analytics consent, on the page and
 *                 on the server, which reads the record rather than trusting
 *                 the page
 *   the banner    reject as easy as accept; one banner, not two; reachable
 *                 again from every footer; its switch cannot draw outside
 *                 its track
 *   the list      every cookie the code sets is listed and given a category
 */
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

import {
  CONSENT_MAX_AGE,
  CONSENT_VERSION,
  OPTIONAL_COOKIES,
  STORED,
  allows,
  cookieValue,
  everything,
  parse,
  serialize,
} from "@/lib/consent/consent"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label + (detail ? ` — ${detail}` : "")); console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(p)
  }
  return out
}

function main() {
  const now = Date.parse("2026-09-23T12:00:00Z")

  console.log("\nThe record")
  const yes = everything(true, now)
  const text = serialize(yes)
  check("it is short and plain: version, three answers, when", /^2\.p1\.a1\.m1\.\d{10}$/.test(text))
  check("and reads back the same", JSON.stringify(parse(text, now)) === JSON.stringify(yes))
  check("an answer from an older policy is asked again", parse(text.replace(/^2\./, "1."), now) === null && CONSENT_VERSION === 2)
  check("an answer older than twelve months is asked again", parse(text, now + (CONSENT_MAX_AGE + 60) * 1000) === null)
  check("and rubbish is no answer", parse("yes please", now) === null && parse("", now) === null && parse(null, now) === null)
  check("a cookie is found in a header among others", cookieValue(`a=1; storelib_consent=${encodeURIComponent(text)}; b=2`, "storelib_consent") === text)

  console.log("\nNothing optional before a choice")
  check("no record allows only what is necessary", allows(null, "necessary") && !allows(null, "analytics") && !allows(null, "preferences") && !allows(null, "marketing"))
  const mixed = parse("2.p0.a1.m0.1790000000", now)
  check("and a record allows exactly what it says", allows(mixed, "analytics") && !allows(mixed, "preferences") && !allows(mixed, "marketing"))

  console.log("\nThe trackers ask")
  const utils = read("lib/analytics-utils.ts")
  check("no visitor or session cookie without analytics consent",
    /export function getOrCreateSessionId\(\): string \{\s*if \(typeof document === "undefined" \|\| !analyticsAllowed\(\)\) return ""/.test(utils)
      && /export function getOrCreateVisitorId\(\): string \{\s*if \(typeof document === "undefined" \|\| !analyticsAllowed\(\)\) return ""/.test(utils))
  check("and no attribution kept", /if \(!sessionId \|\| !analyticsAllowed\(\)\) return/.test(utils))
  /* The view tracker is lib/analytics/collect now; the cookie is written by lib/analytics/collect-route. */
  const view = read("lib/analytics/collect.ts")
  const door = read("lib/analytics/collect-route.ts")
  check("the server reads the visitor's own record, not what the page says",
    /allows\(parse\(req\.cookie\(CONSENT_COOKIE\), now\), "analytics"\)/.test(view))
  check("without it: a throwaway id, no city or region, and no cookie set",
    /consented \? "v" : "anon"/.test(view) && /city: consented \?/.test(view) && /if \(!consented\) return req\.cookie\("visitor_id"\) \? \{ clear: true \} : null/.test(view))
  check("and a cookie left from before is deleted", /res\.cookies\.set\("visitor_id", "", \{ maxAge: 0/.test(door))
  const client = read("lib/consent/client.ts")
  check("saying no takes back what yes had stored", /for \(const name of OPTIONAL_COOKIES\[category\]\) expire\(name\)/.test(client) && /materia_attr_/.test(client))
  check("the layout choices are remembered only with Preferences on",
    /hasConsent\("preferences"\)\) document\.cookie = `storelib_wishlist_count/.test(read("components/platform/platform-header-client.tsx"))
      && /hasConsent\("preferences"\)\) document\.cookie = `\$\{COLUMNS_COOKIE\}/.test(read("app/(storelib)/app/orders/orders-client.tsx"))
      && /storelib_consent=2\\\\\.p1/.test(read("app/(storelib)/layout.tsx")))
  check("every optional cookie is one the list calls optional",
    Object.entries(OPTIONAL_COOKIES).every(([cat, names]) => names.every((n) => STORED.some((s) => s.name.split(", ").includes(n) && s.category === cat))))

  console.log("\nThe banner")
  const banner = read("components/cookie-consent-banner.tsx")
  check("Accept all and Reject all are the same size, side by side", /grid grid-cols-2 gap-2/.test(banner) && /Reject all/.test(banner) && /Accept all/.test(banner))
  check("Vercel Analytics loads only with analytics consent", /consent\?\.analytics === true && !inSitesEditor && !embedded && <Analytics \/>/.test(banner))
  check("it is not drawn in the dashboard or the admin", /pathname === "\/app"/.test(banner) && /pathname\?\.startsWith\("\/app\/"\)/.test(banner) && /pathname\?\.startsWith\("\/admin"\)/.test(banner) && /const quiet = [^\n]*inApp/.test(banner))
  check("it is not drawn inside a preview frame", /window\.self !== window\.top/.test(banner) && /const quiet = [^\n]*embedded/.test(banner))
  /* The shared sheet says it is open on <html> and a Radix dialog by its scroll lock on <body>, not through :has():
     a :has() on the root that changes its answer restyled the whole document (scripts/check-app-sheets-frames.mjs). */
  check("it steps aside while a sheet or a modal dialog is open",
    /data-cookie-banner=""/.test(banner)
      && /html\[data-app-sheet-up="open"\] \[data-cookie-banner\],\s*body\[data-scroll-locked\] \[data-cookie-banner\],\s*html\[data-modal-any\] \[data-cookie-banner\] \{\s*visibility: hidden;/.test(read("app/globals.css")))
  check("the accept button's text reads on the site's accent", /function readableOn\(/.test(banner) && /color: onAccent/.test(banner))
  check("the preferences start with everything optional off", /preferences: c\?\.preferences \?\? false, analytics: c\?\.analytics \?\? false/.test(banner))
  check("the switch cannot draw outside its track: placed with left, moved by the exact travel",
    /absolute left-\[2px\] top-\[2px\] block h-5 w-5/.test(banner) && /relative h-6 w-10/.test(banner) && /translate-x-4/.test(banner))
  check("it is not drawn over the builder or the Sites editor", /pathname\?\.startsWith\("\/sites\/"\)/.test(banner) && /pathname\?\.startsWith\("\/website-builder\/"\)/.test(banner))
  const theme = read("components/website-builder/theme/ThemePage.tsx")
  check("a creator's site no longer draws a second banner of its own",
    !/storelib:cookies/.test(theme) && /setSiteConsentTheme\(/.test(theme))
  check("its words and colours style the one banner instead", /site\?\.text/.test(banner) && /site\?\.background/.test(banner))
  check("a site that set no banner colours gets Storelib's own, not a navy default", !/cookie_bg, "#0f172a"/.test(theme))
  for (const [where, file] of [
    ["storelib.com's footer", "components/marketing/footer.tsx"],
    ["a creator's page footer", "components/storefront/seller-footer.tsx"],
    ["a built site's footer", "components/website-builder/sections/renderers/FooterSection.tsx"],
  ]) {
    check(`the choice can be changed from ${where}`, /openCookiePreferences\(\)/.test(read(file)))
  }
  /*
    AND THE LINK SITS WITH THE OTHER LINKS. On a creator page it was a block
    of its own under the footer's row, centred on nothing, in its own size.
    Measured in a browser by scripts/check-footers.mjs; these keep the markup
    that the measurement depends on.
  */
  const seller = read("components/storefront/seller-footer.tsx")
  check("a creator page footer draws Cookie preferences inside the links group, with the links' own classes",
    /<nav aria-label="Legal" className=\{LINKS_ROW\[layout\]\} data-footer-links>[\s\S]*?href="\/privacy" className=\{link\}[\s\S]*?href="\/terms" className=\{link\}[\s\S]*?<CookiePreferencesLink className=\{link\}[\s\S]*?<\/nav>/.test(seller))
  check("and nowhere else: no second line under the footer's row",
    (seller.match(/<CookiePreferencesLink/g) ?? []).length === 1 && !/pb-4 text-center/.test(seller))
  check("on a phone the group wraps centred",
    /stack: "flex w-full flex-wrap items-baseline justify-center/.test(seller) && /responsive: "flex w-full flex-wrap items-baseline justify-center[^"]*sm:justify-end/.test(seller))
  const siteFooter = read("components/website-builder/sections/renderers/FooterSection.tsx")
  check("a built site's footer puts it on the copyright's line as an equal, not a fainter afterthought",
    /data-footer-bottom[\s\S]{0,500}?<span>\{str\(s\.copyright[\s\S]*?<nav aria-label="Policies"[\s\S]*?Cookie preferences/.test(siteFooter) && /"flex min-w-0 flex-wrap items-baseline/.test(siteFooter) && !/ml-3 underline-offset-2 opacity-80/.test(siteFooter))
  check("storelib.com's footer draws it with the Support links' class",
    /className=\{`\$\{linkClass\} cursor-pointer p-0`\} data-cookie-preferences/.test(read("components/marketing/footer.tsx")))
  check("the privacy policy lists every cookie from the same list, and can change the choice",
    /* Changed on purpose (r40): the policy's text is components/legal/privacy-body, drawn by /privacy and by a OnePage's sheet. */
    /<CookieTable \/>/.test(read("components/legal/privacy-body.tsx")) && /STORED\.filter/.test(read("components/legal/cookie-table.tsx")) && /id="cookies"/.test(read("components/legal/privacy-body.tsx")))

  console.log("\nEvery cookie the code sets is listed")
  const listed = STORED.flatMap((s) => s.name.split(", "))
  const known = (name: string) => listed.some((l) => (l.endsWith("*") ? name.startsWith(l.slice(0, -1)) : l === name || (l.includes("*") && new RegExp(`^${l.replace(/[.]/g, "\\.").replace("*", ".*")}$`).test(name))))
  const set = new Set<string>()
  for (const f of [...walk("app"), ...walk("components"), ...walk("lib")]) {
    const src = readFileSync(f, "utf8")
    for (const m of src.matchAll(/document\.cookie\s*=\s*[`'"]([a-z_][a-z0-9_.-]*)=/gi)) set.add(m[1])
    for (const m of src.matchAll(/cookies\.set\(\s*["']([a-z_][a-z0-9_.-]*)["']/gi)) set.add(m[1])
  }
  const unlisted = [...set].filter((n) => !known(n))
  check("no cookie is set that the policy does not list", unlisted.length === 0, unlisted.join(", "))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
