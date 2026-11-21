/**
 * THE LEGAL UPDATE (2026-11-20): the Terms of service, the Privacy policy and
 * the Refund policy, held to the code they describe.
 *
 *   FIGURES    every plan price, fee rate, small order line and limit the
 *              Terms print is the one lib/legal/figures reads from the code
 *              that charges it, and none is typed into the text
 *   PROCESSORS every service the Privacy policy names is in lib/legal/processors,
 *              each entry's source file really calls it, and every entry is
 *              printed
 *   COOKIES    every cookie the code sets (by literal name or through a named
 *              constant) is in the cookie table (lib/consent/consent STORED)
 *   LINKS      the three documents link to each other, from /refund-policy too
 *   COPY       no em dash, none of the banned words, a date of 2026-11-20, and
 *              nothing left open on the page (LEGAL_DETAILS hides what the owner has not supplied)
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { readCode } from "./_source"
import { LEGAL_DOCS } from "@/components/legal/legal-parts"
import { TERMS_TOC, TermsBody } from "@/components/legal/terms-body"
import { PRIVACY_TOC, PrivacyBody } from "@/components/legal/privacy-body"
import { REFUND_TOC, RefundBody } from "@/components/legal/refund-body"
import { PROCESSORS, creatorTools, namedServices } from "@/lib/legal/processors"
import { FIXED_FEE, LEGAL_DETAILS, LEGAL_EFFECTIVE, SMALL_ORDER_LINE, feeRows, noticeWords, planPrice } from "@/lib/legal/figures"
import { cardRateLabel, smallOrderRateFor } from "@/lib/billing/fee-calculator"
import { ratePercentLabel } from "@/lib/payments/fees/config"
import { OFFERED_PLAN_IDS, PRO_PRICE_CENTS, SCALE_PRICE_CENTS, formatPlanPrice } from "@/lib/billing/plans"
import { CURRENCY_FEE_RULES } from "@/lib/payments/fees/currency-rules"
import { MONTHLY_EMAILS } from "@/lib/email-campaigns/limits"
import { STORED } from "@/lib/consent/consent"
import { TRACKERS, TRACKER_ORDER } from "@/lib/store/tracking"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label)
    console.log(`  FAIL  ${label}${detail === undefined ? "" : `   ${JSON.stringify(detail)}`}`)
  }
}
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")
/** The words a page reads, tags and entities out. */
const words = (html: string) =>
  html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;|&apos;|&#39;/g, "'").replace(/&quot;|&ldquo;|&rdquo;|“|”/g, '"').replace(/\s+/g, " ")

const terms = renderToStaticMarkup(createElement(TermsBody))
const privacy = renderToStaticMarkup(createElement(PrivacyBody))
const refunds = renderToStaticMarkup(createElement(RefundBody))
const T = words(terms)
const P = words(privacy)
const R = words(refunds)

console.log("\nThe three documents")
{
  check("terms, privacy and refunds at /terms, /privacy and /refund-policy", LEGAL_DOCS.terms.href === "/terms" && LEGAL_DOCS.privacy.href === "/privacy" && LEGAL_DOCS.refunds.href === "/refund-policy")
  check("all three effective and last updated on 2026-11-20", LEGAL_EFFECTIVE === "2026-11-20" && Object.values(LEGAL_DOCS).every((d) => d.effective === "2026-11-20" && d.updated === "2026-11-20"))
  for (const [name, toc, html] of [["terms", TERMS_TOC, terms], ["privacy", PRIVACY_TOC, privacy], ["refunds", REFUND_TOC, refunds]] as const) {
    check(`${name}: every contents entry has its numbered heading`, toc.every((t, i) => html.includes(`<h2 id="${t.id}"`) && t.label.startsWith(`${i + 1}. `)), toc.filter((t) => !html.includes(`<h2 id="${t.id}"`)))
  }
  check("/refund-policy draws the Refund policy in the legal layout", /<LegalPage kind="refunds" toc=\{REFUND_TOC\}>/.test(readCode("app/(storelib)/refund-policy/page.tsx")) && /ConditionalHeader/.test(readCode("app/(storelib)/refund-policy/layout.tsx")))
  check("/refund-policy is a reserved first segment and a web page", /"refund-policy"/.test(read("lib/routes/reserved-segments.ts")) && /"refund-policy"/.test(read("lib/platform/app-links.ts")))
}

console.log("\nThe Terms' numbers come from the code")
{
  const fileT = readCode("components/legal/terms-body.tsx")
  check("the terms read their numbers from lib/legal/figures", /from "@\/lib\/legal\/figures"/.test(fileT) && /feeRows\(\)/.test(fileT))
  check("and type no rate, price or dollar amount themselves", !/\d+(\.\d+)?\s?%/.test(fileT) && !/\$\d/.test(fileT.replace(/\$\{/g, "")), fileT.match(/\d+(\.\d+)?\s?%|\$\d[\d.,]*/g))
  for (const id of OFFERED_PLAN_IDS) {
    for (const kind of ["digital", "physical"] as const) {
      const rate = cardRateLabel(id, kind)
      const small = ratePercentLabel(smallOrderRateFor(id, kind))
      check(`${id} ${kind}: ${rate}, small orders ${small}`, T.includes(rate) && T.includes(small))
    }
  }
  check("Grow and Pro priced as checkout charges them", T.includes(`${formatPlanPrice(PRO_PRICE_CENTS)} a month`) && T.includes(`${formatPlanPrice(SCALE_PRICE_CENTS)} a month`) && planPrice("growth") === formatPlanPrice(PRO_PRICE_CENTS))
  check("the small order line and the fixed fee from the USD fee rule", SMALL_ORDER_LINE === `$${(CURRENCY_FEE_RULES.USD.microThresholdMinor / 100).toFixed(2)}` && FIXED_FEE === `$${(CURRENCY_FEE_RULES.USD.fixedFeeMinor / 100).toFixed(2)}` && T.includes(`${SMALL_ORDER_LINE} or more`) && T.includes(FIXED_FEE))
  check("a row for every plan on sale", feeRows().map((r) => r.id).join() === OFFERED_PLAN_IDS.join())
  check("campaign email limits from lib/email-campaigns/limits", OFFERED_PLAN_IDS.every((id) => T.includes(MONTHLY_EMAILS[id].toLocaleString("en-US"))))
  check("the refund policy and privacy policy type no plan price or rate either", !/\d+(\.\d+)?\s?%/.test(readCode("components/legal/refund-body.tsx") + readCode("components/legal/privacy-body.tsx")))
  check("the Terms say the fee is not returned on a refund, as app/api/stripe/refund does", /fee is not returned/.test(T) && /reverse_transfer = true/.test(read("app/api/stripe/refund/route.ts")) && !/refund_application_fee/.test(read("app/api/stripe/refund/route.ts")))
  check("the Terms describe destination charges, as the checkout makes them", /charged on Storelib's Stripe account/.test(T) && /transfer_data: \{ destination/.test(read("lib/physical/checkout-server.ts")))
}

console.log("\nEvery processor named is in the inventory, and the inventory is true")
{
  for (const p of PROCESSORS) {
    const src = existsSync(join(root, p.source)) ? read(p.source) : ""
    check(`${p.name}: ${p.source} calls it`, !!src && src.toLowerCase().includes((p.match ?? p.name).toLowerCase()))
    check(`${p.name}: printed in the policy`, P.includes(p.name))
  }
  for (const g of creatorTools()) check(`creator tools, ${g.title}: printed`, g.names.every((n) => P.includes(n)), g.names.filter((n) => !P.includes(n)))
  check("the creator's trackers are the product's own list", TRACKER_ORDER.every((id) => creatorTools()[0].names.includes(TRACKERS[id].name)))
  /* Services a privacy policy might mention: none may be in the text without being in the inventory. */
  const KNOWN = ["Stripe", "Supabase", "Vercel", "Mailgun", "Resend", "SendGrid", "Postmark", "Firebase", "OneSignal", "Anthropic", "OpenAI", "Gemini", "Cloudflare", "DeepL", "Hugging Face", "MyMemory", "Pexels", "Unsplash", "AfterShip", "17TRACK", "Mux", "Bunny", "Sentry", "Datadog", "LogRocket", "PostHog", "Mixpanel", "Amplitude", "Segment", "Hotjar", "Intercom", "Crisp", "Zendesk", "Airwallex", "PayPal", "Paddle", "Printful", "Printify", "Gelato", "Shippo", "EasyPost", "ShipStation", "Mailchimp", "Klaviyo", "Omnisend", "Brevo", "MailerLite", "beehiiv", "Flodesk", "Zapier", "Make", "Google Sheets", "Calendly", "Cal.com", "Discord", "Telegram", "GitHub", "Meta Pixel", "TikTok Pixel", "Pinterest Tag", "Microsoft Clarity", "Google Analytics", "Google Tag Manager", "Google Ads"]
  const inventory = namedServices().join(" | ").toLowerCase()
  const stray = KNOWN.filter((k) => new RegExp(`\\b${k.replace(/[.]/g, "\\.")}\\b`).test(P) && !inventory.includes(k.toLowerCase()))
  check("no service is named in the policy that the inventory does not hold", stray.length === 0, stray)
  check("the policy draws the inventory, not a copy", /PROCESSORS\.map/.test(readCode("components/legal/privacy-body.tsx")) && /creatorTools\(\)/.test(readCode("components/legal/privacy-body.tsx")))
}

console.log("\nEvery cookie the code sets is in the cookie table")
{
  function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(join(root, dir))) {
      if (name === "node_modules" || name.startsWith(".")) continue
      const p = join(dir, name)
      if (statSync(join(root, p)).isDirectory()) walk(p, out)
      else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) && !/\.generated\./.test(name)) out.push(p)
    }
    return out
  }
  const files = [...walk("app"), ...walk("components"), ...walk("lib"), "proxy.ts"].filter((f) => existsSync(join(root, f)))
  const sources = files.map((f) => read(f))
  const all = sources.join("\n")
  /* A constant's string value, followed through one alias (ADMIN_COOKIE = COOKIE). */
  const resolve = (id: string, depth = 0): string | null => {
    const lit = new RegExp(`(?:export\\s+)?const\\s+${id}\\b\\s*(?::[^=\\n]+)?=\\s*["'\`]([^"'\`$]+)["'\`]`).exec(all)
    if (lit) return lit[1]
    const alias = new RegExp(`(?:export\\s+)?const\\s+${id}\\b\\s*=\\s*([A-Z_][A-Z0-9_]*)\\b`).exec(all)
    return alias && depth < 3 ? resolve(alias[1], depth + 1) : null
  }
  /* The few names made by a function, each checked against its source below. */
  const BY_FUNCTION: Record<string, { name: string; file: string; shows: RegExp }> = {
    sessionCookieName: { name: "__Host-sl_site_session", file: "lib/site-accounts/session.ts", shows: /SESSION_NAME = "sl_site_session"[\s\S]*__Host-\$\{SESSION_NAME\}/ },
    pendingCookieName: { name: "__Host-sl_site_pending", file: "lib/site-accounts/session.ts", shows: /PENDING_NAME = "sl_site_pending"[\s\S]*__Host-\$\{PENDING_NAME\}/ },
    passCookieName: { name: "__Host-sl_site_pass", file: "lib/site-password/pass.ts", shows: /SESSION_NAME = "sl_site_pass"[\s\S]*__Host-\$\{SESSION_NAME\}/ },
  }
  for (const [fn, b] of Object.entries(BY_FUNCTION)) check(`${fn}() names ${b.name}`, b.shows.test(read(b.file)))
  /* Names a library chooses (Supabase's session chunks), or a cookie expired by its own name: not set by name here. */
  const DYNAMIC = new Set(["name", "out", "c.name", "line", "c", "cookie", "clearCookie", "value", "cookies", "lines", "attributes"])
  const set = new Set<string>()
  const unresolved = new Set<string>()
  const add = (raw: string, src = all) => {
    const id = raw.trim()
    if (/^["'`]/.test(id)) return set.add(id.slice(1).replace(/["'`].*$/, ""))
    const fn = /^([a-zA-Z]+)\(/.exec(id)
    if (fn && BY_FUNCTION[fn[1]]) return set.add(BY_FUNCTION[fn[1]].name)
    /* Supabase's own session names (lib/supabase/server, session-jar), listed as __Host-sb-* and sb-host-only. */
    if (DYNAMIC.has(id) || /^\{/.test(id) || /c\.name|outgoingName\(/.test(id)) return
    if (!/^[A-Za-z_$][\w$.]*$/.test(id)) return void unresolved.add(id)
    /* The constant in the same file first (a local HINT is not another file's HINT), then anywhere. */
    const own = new RegExp(`const\\s+${id}\\b\\s*(?::[^=\\n]+)?=\\s*["'\`]([^"'\`$]+)["'\`]`).exec(src)
    const v = own ? own[1] : resolve(id)
    if (v) set.add(v)
    else unresolved.add(id)
  }
  /* A line that only expires a cookie (Max-Age=0) sets nothing. */
  const expiring = (src: string, at: number) => /^[^\n]{0,160}?max-age=0\b/i.test(src.slice(at, at + 160)) || /^[^\n]{0,160}?maxAge:\s*0\b/.test(src.slice(at, at + 200))
  for (const src of sources) {
    for (const m of src.matchAll(/(?:cookies|cookieStore)\.set\(\s*([^,)]+)/g)) if (!expiring(src, m.index ?? 0)) add(m[1], src)
    for (const m of src.matchAll(/\.cookies\.set\(\{\s*name:\s*([A-Za-z_."'`-]+)/g)) if (!expiring(src, m.index ?? 0)) add(m[1], src)
    for (const m of src.matchAll(/document\.cookie\s*=\s*`\$\{([A-Z_][A-Z0-9_.]*)\}=/g)) if (!expiring(src, m.index ?? 0)) add(m[1], src)
    for (const m of src.matchAll(/document\.cookie\s*=\s*[`'"]([a-z_][a-z0-9_.-]*)=/gi)) if (!expiring(src, m.index ?? 0)) set.add(m[1])
    /* Cookie lines built as strings: a name, "=", and a Path or Max-Age further on. */
    for (const m of src.matchAll(/[`'"]\$\{([A-Z_][A-Z0-9_]*)\}=[^`'"\n]*(?:Path=|Max-Age=|path=|max-age=)/g)) if (!expiring(src, m.index ?? 0)) add(m[1], src)
    for (const m of src.matchAll(/[`'"]([a-z_][a-z0-9_.-]*)=(?:\$\{[^}]+\}|[^;`'"\s]*);\s*(?:Path|Max-Age|path|max-age)=/g)) if (!expiring(src, m.index ?? 0)) set.add(m[1])
  }
  /* STORAGE_KEYS.language and .currency (components/locale-provider): storelib_language, storelib_currency. */
  unresolved.delete("STORAGE_KEYS.language")
  unresolved.delete("STORAGE_KEYS.currency")
  const listed = STORED.flatMap((s) => s.name.split(", "))
  const known = (name: string) => listed.some((l) => (l.endsWith("*") ? name.startsWith(l.slice(0, -1)) : l === name))
  const missing = [...set].filter((n) => !known(n))
  check(`found the cookies the code sets (${set.size})`, set.size >= 40, [...set])
  check("every name the code sets a cookie under could be read", unresolved.size === 0, [...unresolved])
  check("every cookie the code sets is in the cookie table", missing.length === 0, missing)
  check("the table shows each one with what it does and how long it lasts", STORED.every((s) => s.purpose.length > 8 && s.lasts.length > 0))
  check("the privacy policy draws that table", /<CookieTable \/>/.test(readCode("components/legal/privacy-body.tsx")) && /id="cookies"/.test(privacy))
}

console.log("\nThe documents link to each other, and the site links to them")
{
  const links = (html: string) => [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1].replace(/#.*$/, ""))
  const t = links(terms)
  const p = links(privacy)
  const r = links(refunds)
  check("terms link to privacy and refunds", t.includes("/privacy") && t.includes("/refund-policy"))
  check("privacy links to terms and refunds", p.includes("/terms") && p.includes("/refund-policy"))
  check("refunds link to terms and privacy", r.includes("/terms") && r.includes("/privacy"))
  check("every in-document link names a section that exists", [terms, privacy, refunds].every((html) => [...html.matchAll(/href="\/(terms|privacy|refund-policy)#(s\d+|cookies)"/g)].every((m) => {
    const target = m[1] === "terms" ? terms : m[1] === "privacy" ? privacy : refunds
    return target.includes(`id="${m[2]}"`)
  })))
  check("the footer links all three", /\{ label: "Refund Policy", href: "\/refund-policy" \}/.test(read("components/marketing/footer.tsx")) && /href: "\/terms"/.test(read("components/marketing/footer.tsx")) && /href: "\/privacy"/.test(read("components/marketing/footer.tsx")))
  check("a creator page's footer and the compact footer too", /href="\/refund-policy"/.test(read("components/storefront/seller-footer.tsx")) && /href: "\/refund-policy"/.test(read("components/marketing/shop-compact-footer.tsx")))
  check("the checkouts' agreement links reach the page", /href="\/refund-policy"/.test(read("app/(storelib)/checkout/checkout-client.tsx")) && /"\/refund-policy"/.test(read("app/(storelib)/checkout/site/site-checkout.tsx")) && /platformHref\("\/refund-policy"\)/.test(read("components/checkout/instant-checkout.tsx")))
  check("the sheet a OnePage opens reads all three", /refunds: LEGAL_DOCS\.refunds\.title/.test(read("components/onepage/onepage-legal-links.tsx")) && /<RefundBody \/>/.test(read("components/legal/legal-reader.tsx")))
}

console.log("\nThe copy")
{
  const all = T + P + R
  check("no em dash", !/—/.test(all) && !/&mdash;/.test(terms + privacy + refunds))
  const banned = ["unlock", "elevate", "seamless", "powerful", "effortless", "supercharge", "transform"].filter((w) => new RegExp(`\\b${w}`, "i").test(all))
  check("none of the banned words", banned.length === 0, banned)
  /* Changed on purpose (legal update, the owner: "keep the placeholders hidden"): what only the owner can supply is in LEGAL_DETAILS, and a line that needs it is left out until it is set. */
  check("no placeholder reaches the page: no brackets, no tint", !/data-legal-placeholder/.test(terms + privacy + refunds) && !/\[[^\]]*(to be confirmed|to be published|confirm with counsel)[^\]]*\]/i.test(all))
  check("while the owner's details are empty, their lines are left out", Object.values(LEGAL_DETAILS).every((v) => v === null) && !/Data protection officer:|EU and UK representative:|designated agent under the US Digital Millennium Copyright Act is/.test(all))
  check("  and the gaps still read: reasonable notice, copyright notices to legal@, retention in words", /reasonable advance notice/.test(all) && /legal@storelib\.com/.test(T) && /Support requests/.test(P))
  check("no Placeholder left in the legal parts", !/export function Placeholder/.test(read("components/legal/legal-parts.tsx")))
  check("a notice period reads in days once it is set", noticeWords(30) === "30 days' notice" && noticeWords(null) === "reasonable advance notice")
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
