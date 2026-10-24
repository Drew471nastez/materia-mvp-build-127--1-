/**
 * ===========================================================================
 *  ROUND BB: AN ANNOUNCEMENT BAR STAYS WHERE IT WAS ADDED, THE WISHLIST PAGE
 *  SHOWS WHAT WAS SAVED
 * ===========================================================================
 * An announcement bar added among a page's sections was moved into the
 * Header group. It stays on the page now; one added from the Header group
 * still goes there.
 *
 * andrewrullz.storelib.com/wishlist showed nothing with two products saved:
 * an imported theme's /wishlist framed Storelib's page, which tried to draw
 * the theme's own stored wishlist sections it cannot draw. A theme with its
 * own wishlist page shows that page now, and its cards are shown by id or by
 * handle (the theme's hearts kept handles, its page compared ids).
 *
 * Signing in on a website: Use a different email ends the code the browser
 * was waiting on (it came back on the next visit) and keeps where the visitor
 * was going; an imported theme's Send a new code keeps it too, and keeps the
 * name a Create account form gave; in the editor, a sign in or account form
 * says it works on the live site instead of doing nothing.
 *
 * Run with:  npx tsx tests/round-bb.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { sectionGroupsFor, placeSection } from "../lib/storelib-theme/section-groups"
import { SECTION_SCHEMAS } from "../lib/website-builder/section-schemas"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`)
  }
}
const code = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

console.log("\nAn announcement bar goes where it was added\n")
{
  const groups = sectionGroupsFor(SECTION_SCHEMAS.announcement_banner as never, { type: "announcement_banner", kind: null })
  check("the built-in bar may go in the Header group or on a page, the Header group first", groups.join() === "header,template", groups)
  const page = [
    { id: "h", type: "header", name: "Header", settings: {} },
    { id: "hero", type: "hero", name: "Hero", settings: {} },
    { id: "f", type: "footer", name: "Footer", settings: {} },
  ]
  const kinds = (t: string) => (t === "header" ? "header" : t === "footer" ? "footer" : null)
  const bar = { id: "a", type: "announcement_banner", name: "Announcement", settings: {} }
  const onPage = placeSection(page as never, bar as never, { groups, group: "template", at: 1, kindOfType: kinds as never })
  check("added among the page's sections it stays on the page", onPage.group === "template", onPage.group)
  const inHeader = placeSection(page as never, bar as never, { groups, group: "header", kindOfType: kinds as never })
  check("added from the Header group it goes in the Header group", inHeader.group === "header", inHeader.group)
  check("a coded section named Announcement bar may go on a page too", sectionGroupsFor({ name: "Announcement bar" }).join() === "header,template")
  check("a schema that says enabled_on header only is kept there", sectionGroupsFor({ name: "Announcement bar", enabled_on: { groups: ["header"] } }).join() === "header")
}

console.log("\nThe wishlist page of an imported theme\n")
{
  const site = code("lib/storelib-theme/compat/site.ts")
  check("/wishlist draws the theme's own wishlist page when it has one", /if \(path === "\/wishlist"\) \{\s*\n\s*if \(site\.pages\.wishlist\) \{\s*\n\s*const own = at\("wishlist"/.test(site))
  check("  and Storelib's page in the theme's header and footer when it has none", /if \(own\) return own\s*\n\s*\}\s*\n\s*return accountShell\(site, req, path\)/.test(site))
  check("  the old early frame is gone", !/if \(path === "\/wishlist"\) return accountShell/.test(site))
  const account = code("app/(site)/w/[username]/render-account.tsx")
  check("the framed page never draws the theme's stored sections (only the theme can)", /stored && stored\.length > 0 && !imported \? stored : /.test(account))
  check("  and has no second language and currency bar under the theme's header", /language: imported \? undefined : language/.test(account))
  const shims = code("lib/storelib-theme/compat/shims.ts")
  check("the theme's wishlist cards are shown by id or by handle", /var reveal=function\(\)\{var lists=document\.querySelectorAll\("\[data-wishlist-local\]"\)/.test(shims) && /data-product-handle/.test(shims))
  check("  on load, on back/forward and on every change", /window\.addEventListener\("pageshow",reveal\)/.test(shims) && /materia:wishlist-change/.test(shims))
}

console.log("\nA receipt opened from a website's account stays on the website\n")
{
  const data = code("lib/site-accounts/account-data.ts")
  check("the website's account links receipts on its own host", /export const SITE_RECEIPTS = ""/.test(data) && /\$\{platform\}\/receipt\/\$\{encodeURIComponent\(token\)\}/.test(data))
  const callers = ["app/(site)/w/[username]/account/page.tsx", "app/(site)/w/[username]/account/orders/[id]/page.tsx", "lib/site-accounts/theme-visitor.ts"].map(code)
  check("  every account page of a website uses it, none storelib.com", callers.every((c) => /siteCustomer\(.*SITE_RECEIPTS/.test(c) && !/siteCustomer\(.*getMainDomain/.test(c)))
  const route = code("lib/checkout/site-checkout.ts")
  check("  and the website's host serves /receipt itself", /if \(path === "\/receipt" \|\| path\.startsWith\("\/receipt\/"\)\) return \{ kind: "pass" \}/.test(route))
}

console.log("\nSigning in on a website: a different email, a new code, and the editor\n")
{
  /* Use a different email: through a route that ends the code this browser waits on, keeping where the visitor was going. */
  const restart = code("app/api/site-account/restart/route.ts")
  check("Use a different email ends the code this browser waits on", /export async function GET/.test(restart) && /res\.cookies\.set\(pendingCookieName\(host\), "", \{ \.\.\.pendingCookie\(host\), maxAge: 0 \}\)/.test(restart))
  check("  lands on the email step, with where the sign in was going", /to\.searchParams\.set\("step", "email"\)/.test(restart) && /returnPathOf\(asked \?\? note\?\.r\)/.test(restart))
  const login = code("themes/default/sections/main_login.storelib")
  const routes = code("lib/storelib-theme/globals.ts")
  check("  the native sign in page links to it", /href="\{\{ routes\.account_change_email_url \}\}"/.test(login) && /account_change_email_url: "\/api\/site-account\/restart"/.test(routes) && !/href="[^"]*step=email/.test(login))
  check("  and the generated theme sources say the same", /routes\.account_change_email_url/.test(code("themes/default/sources.generated.ts")))
  const { signInContent } = require("../lib/storelib-theme/compat/account") as typeof import("../lib/storelib-theme/compat/account")
  const step = signInContent({ step: "code", email: "ana@mail.test", returnTo: "/checkout?items=a", notice: null })
  check("  an imported theme's code step links to it too", /href="\/api\/site-account\/restart">Use a different email</.test(step) && !/step=email/.test(step))

  /* Send a new code on an imported theme keeps where the sign in was going, from the note. */
  check("an imported theme's Send a new code keeps where the sign in was going", /name="return" value="\/checkout\?items=a"/.test(step))
  const site = code("lib/storelib-theme/compat/site.ts")
  check("  read from the note, not from the address", /returnTo: pending\.returnTo \|\| back/.test(site) && /pending: note \? \{ email: note\.m, returnTo: note\.r \} : null/.test(code("lib/site-accounts/theme-visitor.ts")))

  /* Send a new code keeps the name a Create account form gave, for the same email. */
  const route = code("app/api/site-account/code/route.ts")
  /* Changed on purpose (round BC): the call also carries the page's language and the code email's words. */
  check("Send a new code keeps the Create account name, for the same email only", /const held = again \? pendingFrom\(/.test(route) && /held\.m === cleanEmail\(form\?\.get\("email"\)\) \? held\.n/.test(route) && /requestCode\(\{ host, email: form\?\.get\("email"\), returnPath, name[,}]/.test(route))

  /* The editor: a native sign in or account form says it works on the live site, and sends nothing. */
  const section = code("components/website-builder/sections/StorelibSection.tsx")
  const preview = section.slice(section.indexOf('if (signupMode({ inEditor: inCanvas, creatorId }) === "preview")'), section.indexOf('if (intent === "native") return'))
  check("in the editor, Continue and Sign out say sign in works on the live site", /isAccountAction\(form\.getAttribute\("action"\)\)\) settle\(form, "note", "Signing in works on your live site\. Nothing is sent from the editor\."\)/.test(preview) && /e\.preventDefault\(\)/.test(preview))
  check("  and the form stays as designed (a note, no fields hidden)", /if \(state === "done"\) \{/.test(section) && /"sending" \| "done" \| "error" \| "note"/.test(section))
  check("  which forms count: the account routes and sign out, not a search box", /const path = \(action \?\? ""\)\.split\(\/\[\?#\]\/\)\[0\]\s+return path\.startsWith\("\/api\/site-account\/"\) \|\| path === "\/account\/logout"/.test(section))
  check("  no copy with an em dash", !/\u2014/.test(restart + login + step))
}

console.log("\nA section's own setting reaches the theme's script\n")
{
  const canvas = code("components/website-builder/compat/compat-canvas.tsx")
  check("a single section setting is said as storelib:settings-change with the section's id", /told\.path\.length === 2 && told\.path\[0\] === "settings"/.test(canvas) && /type: "settings", settings: \{ \[told\.path\[1\]\]: told\.to \}, live, section: s\.id \}/.test(canvas))
  const bridge = code("lib/storelib-theme/compat/canvas-bridge.ts")
  check("  and the frame puts the section's id in the event's detail", /detail: m\.section \? \{ settings: m\.settings \|\| \{\}, live: !!m\.live, section: String\(m\.section\) \}/.test(bridge))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
