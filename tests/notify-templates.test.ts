/**
 * ===========================================================================
 *  EVERY NOTIFICATION RENDERS, SAFELY AND IN PLAIN WORDS
 * ===========================================================================
 * lib/notify/templates turns a notification type and its data into an email
 * and an in-app line. What this pins:
 *
 *   every type renders subject, preview, HTML and text, with full data and
 *   with none, and nothing prints "undefined", "NaN", "null" or "[object"
 *   subjects stay short, and no copy uses a dash as punctuation, an emoji, a
 *   banned phrase or more than one exclamation mark (and only where allowed)
 *   a product title carrying markup is escaped, and a javascript: or foreign
 *   unsubscribe address is refused
 *   the unsubscribe link appears only when one is given, and never on a
 *   security email
 *   customer emails never link into /app
 *   the HTML has the viewport meta and the 600px container; the text part
 *   carries the action address
 */
import { NOTIFICATION_TYPES, type NotificationType, type TemplateContext } from "../lib/notify/types"
import { renderEmail, renderInApp, DATA_KEYS, audienceOf, formatMoney } from "../lib/notify/templates"
import { CATALOG, Data } from "../lib/notify/templates/catalog"
import { actionUrl, escapeHtml, safeHttpUrl, sameSiteUrl } from "../lib/notify/templates/escape"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}${detail !== undefined ? ` (${JSON.stringify(detail)})` : ""}`) }
}

const BASE = "https://storelib.com"
const ctx: TemplateContext = { baseUrl: BASE, recipientName: "Ana Lopez", when: "September 26, 2026 at 3:14 PM" }
const ctxUnsub: TemplateContext = { ...ctx, unsubscribeUrl: `${BASE}/api/notify/unsubscribe?t=abc`, preferencesUrl: `${BASE}/app/settings?tab=notifications` }

const FULL: Record<string, unknown> = {
  storeName: "Ana's Studio",
  creatorName: "Ana Lopez",
  userId: "u_123",
  email: "ana@example.com",
  productTitle: "Lightroom Presets Vol 2",
  productId: "prod_1",
  paymentsReady: true,
  amountCents: 12040,
  currency: "usd",
  payoutId: "po_123",
  arrivalDate: "2026-09-30",
  bankLast4: "6789",
  cardLast4: "4242",
  orderId: "ord_1",
  orderNumber: "1042",
  customerName: "Sam Rivera",
  disputeId: "dp_1",
  reason: "account_closed",
  dueBy: "2026-10-05",
  planName: "Pro",
  nextBillingDate: "2026-10-26",
  endsAt: "2026-10-26",
  domain: "shop.example.com",
  newEmailMasked: "a***@example.com",
  occurredAt: "2026-09-26T15:14:00Z",
  device: "Chrome on macOS",
  location: "Lisbon, Portugal",
  receiptToken: "rt_abc",
}

const BANNED = [
  "elevate", "unlock", "seamless", "dive in", "we're thrilled", "we are thrilled", "journey", "game changer", "game-changer",
  "act now", "guarantee", "free!!!", "urgent", "don't miss", "click here", "limited time", "re:", "fwd:", "delve", "supercharge",
]
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u
const EXCLAIM_OK: NotificationType[] = ["FIRST_SALE", "FIRST_PRODUCT_PUBLISHED"]

function visibleText(html: string): string {
  return html
    .replace(/<(style|title)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
}

function main() {
  console.log("notify templates")

  check("DATA_KEYS and the catalog cover every type", NOTIFICATION_TYPES.every((t) => Array.isArray(DATA_KEYS[t]) && typeof CATALOG[t] === "function"))
  check("money is formatted from cents", formatMoney(12040, "usd") === "$120.40" && formatMoney(1500, "eur") === "€15.00" && formatMoney(500, "jpy") === "¥500")
  check("money that is not a number is empty", formatMoney(undefined, "usd") === "" && formatMoney("abc", "usd") === "" && formatMoney(NaN, "usd") === "")

  for (const type of NOTIFICATION_TYPES) {
    for (const [label, data, c] of [["full", FULL, ctx], ["empty", {}, { baseUrl: BASE }], ["unsub", FULL, ctxUnsub]] as const) {
      const e = renderEmail(type, data as Record<string, unknown>, c as TemplateContext)
      const i = renderInApp(type, data as Record<string, unknown>, c as TemplateContext)
      const all = [e.subject, e.preview, e.html, e.text, i.title, i.body, i.actionLabel ?? "", i.actionUrl ?? ""].join("\n")
      const words = [e.subject, e.preview, visibleText(e.html), e.text, i.title, i.body].join("\n")
      const tag = `${type} (${label})`
      check(`${tag} renders every part`, Boolean(e.subject && e.preview && e.html && e.text && i.title && i.body))
      check(`${tag} prints no undefined, NaN, null or [object`, !/undefined|NaN|\bnull\b|\[object/.test(all), all.match(/undefined|NaN|\bnull\b|\[object/)?.[0])
      check(`${tag} subject is at most 60 characters`, e.subject.length <= 60, e.subject)
      check(`${tag} has no em or en dash`, !/[—–]/.test(all))
      check(`${tag} uses no " - " as a dash`, !/ - /.test(words), words.match(/.{20} - .{20}/)?.[0])
      const lower = words.toLowerCase()
      const hit = BANNED.find((b) => lower.includes(b))
      check(`${tag} has no banned phrase`, !hit, hit)
      check(`${tag} subject has no emoji, capitals or Re:`, !EMOJI.test(e.subject) && !/\b[A-Z]{4,}\b/.test(e.subject) && !/^(re|fwd?):/i.test(e.subject), e.subject)
      const bangs = (e.subject + "\n" + e.preview + "\n" + e.text).split("!").length - 1
      check(`${tag} exclamation marks only where allowed`, EXCLAIM_OK.includes(type) ? e.subject.split("!").length - 1 <= 1 : bangs === 0, bangs)
      check(`${tag} html has the viewport meta`, e.html.includes('<meta name="viewport" content="width=device-width,initial-scale=1">'))
      check(`${tag} html has a 600px fluid container`, /width:100%;max-width:600px/.test(e.html))
      check(`${tag} html has the color-scheme meta and a hidden preheader`, e.html.includes('name="color-scheme"') && e.html.includes("display:none;font-size:1px"))
      check(`${tag} every image has alt text`, (e.html.match(/<img\b[^>]*>/g) || []).every((img) => /\balt="/.test(img)))
      const hrefs = [...e.html.matchAll(/href="([^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, "&"))
      check(`${tag} every link goes to Storelib`, hrefs.every((h) => h.startsWith(`${BASE}/`)), hrefs.filter((h) => !h.startsWith(`${BASE}/`)))
      const btn = e.html.match(/class="sn-btn"[\s\S]*?href="([^"]*)"/)
      if (btn) {
        const url = btn[1].replace(/&amp;/g, "&")
        check(`${tag} plain text has the action address`, e.text.includes(url), url)
      }
      if (audienceOf(type) === "customer") {
        check(`${tag} customer email never links to /app`, !hrefs.some((h) => h.includes("/app/") || h.endsWith("/app")) && !e.text.includes("/app/") && !(i.actionUrl || "").startsWith("/app"))
      } else {
        check(`${tag} creator email never links to buyer pages`, !hrefs.some((h) => /\/(receipt|library)\b/.test(h)))
      }
      const hasUnsub = /Unsubscribe/.test(e.html) || /Unsubscribe/.test(e.text)
      const security = /Security notice/.test(e.html)
      if (label !== "unsub") check(`${tag} no unsubscribe link without an address`, !hasUnsub)
      else if (security) check(`${tag} security email never carries an unsubscribe link`, !hasUnsub)
      if (security) check(`${tag} security email says what to do if it was not you`, e.text.includes("If you did not do this, secure your account") && /tab=security/.test(e.html))
      if (security && label === "full") check(`${tag} security email says when`, e.text.includes(ctx.when as string))
    }
  }

  // Lifecycle and optional ones carry the unsubscribe link when it is given
  for (const type of ["FIRST_PRODUCT_REMINDER", "PAYMENT_SETUP_REMINDER", "NEW_SALE"] as NotificationType[]) {
    const e = renderEmail(type, FULL, ctxUnsub)
    check(`${type} shows unsubscribe and settings when given`, e.html.includes("Unsubscribe") && e.text.includes(`Unsubscribe: ${ctxUnsub.unsubscribeUrl}`) && e.text.includes("Notification settings:"))
  }
  const reminder = renderEmail("PAYMENT_SETUP_REMINDER", FULL, ctx)
  check("a reminder says it can be turned off", /turn these reminders off/.test(reminder.text))

  // Injection
  const evil = { ...FULL, productTitle: `<img src=x onerror=alert(1)>`, customerName: `"><script>alert(1)</script>`, productId: `javascript:alert(1)`, domain: `<b>x</b>` }
  for (const type of NOTIFICATION_TYPES) {
    const e = renderEmail(type, evil, { ...ctx, recipientName: "<svg onload=alert(1)>" })
    const ok = !e.html.includes("<img src=x") && !e.html.includes("<script") && !e.html.includes("<svg") && !e.html.includes("<b>x") && !/href="javascript:/i.test(e.html)
    check(`${type} escapes markup in data`, ok)
  }
  const sale = renderEmail("FIRST_SALE", evil, ctx)
  check("an escaped title shows as text", sale.html.includes("&lt;img src=x onerror=alert(1)&gt;"))
  check("a javascript: product id stays inside a Storelib path", /href="https:\/\/storelib\.com\/app\/products\/javascript%3Aalert\(1\)"/.test(renderEmail("FINISH_PRODUCT_REMINDER", evil, ctx).html))
  const hostile = renderEmail("NEW_SALE", FULL, { ...ctx, unsubscribeUrl: "javascript:alert(1)", preferencesUrl: "https://evil.example/prefs" })
  check("a javascript: unsubscribe address is refused", !hostile.html.includes("javascript:") && !hostile.html.includes("Unsubscribe"))
  check("a foreign preferences address is refused", !hostile.html.includes("evil.example"))
  check("escapeHtml escapes quotes and angle brackets", escapeHtml(`<a href="x">'`) === "&lt;a href=&quot;x&quot;&gt;&#39;")
  check("safeHttpUrl refuses javascript:, data: and protocol relative", !safeHttpUrl("javascript:alert(1)") && !safeHttpUrl("data:text/html,hi") && !safeHttpUrl("//evil.com") && safeHttpUrl("https://storelib.com/x") === "https://storelib.com/x")
  check("actionUrl refuses a path that names another host", !actionUrl(BASE, "//evil.com/x") && !actionUrl(BASE, "https://evil.com") && !actionUrl(BASE, "/\\evil.com") && actionUrl(BASE, "/app/payouts") === `${BASE}/app/payouts`)
  check("actionUrl uses the canonical origin only", actionUrl("javascript:alert(1)", "/app") === "https://storelib.com/app")
  check("sameSiteUrl accepts www and refuses other hosts", sameSiteUrl(BASE, "https://www.storelib.com/u") === "https://www.storelib.com/u" && !sameSiteUrl(BASE, "https://storelib.com.evil.io/u"))

  // Money and first names
  const sent = renderEmail("PAYOUT_SENT", FULL, ctx)
  check("payout subject is specific", sent.subject === "Your payout of $120.40 is on its way", sent.subject)
  /* Changed on purpose: the sale email is the creator's order notice, and the buyer is their customer, so the body names them in full
     (tests/sale-email.test.ts); the preview line, which shows in the inbox list, keeps to the first name. */
  const saleMail = renderEmail("NEW_SALE", FULL, ctx)
  check("the sale preview names the customer by first name, the order by full name", saleMail.preview.startsWith("Sam bought") && !saleMail.preview.includes("Rivera") && saleMail.text.includes("Name: Sam Rivera"))
  check("security emails never show more than a masked number", !/\d{5,}/.test(renderEmail("PAYOUT_METHOD_CHANGED", { ...FULL, bankLast4: "000123456789" }, ctx).text.replace(/2026/g, "")))
  check("a full new email is masked", renderEmail("EMAIL_CHANGED", { newEmailMasked: "sam@example.com" }, ctx).text.includes("s***@example.com"))
  check("empty data leaves out fact rows", !/Amount:\s*\n/.test(renderEmail("PAYOUT_SENT", {}, ctx).text) && !renderEmail("PAYOUT_SENT", {}, ctx).text.includes("Amount:"))
  check("Data reads nothing from a missing key", new Data({}).text("x") === "" && new Data({ x: { a: 1 } }).text("x") === "")
  check("in-app keeps a relative Storelib path", renderInApp("PAYOUT_FAILED", FULL, ctx).actionUrl === "/app/settings?tab=payments")
  check("receipt links to the buyer's receipt", renderEmail("PURCHASE_CONFIRMATION", FULL, ctx).text.includes(`${BASE}/receipt/rt_abc`))

  /* WHOSE NAME IS IN THE INBOX. Only the seller's own ask names the seller; every platform email stays Storelib's. */
  const NAMED: NotificationType[] = ["REVIEW_REQUEST", "REVIEW_REMINDER"]
  for (const type of NOTIFICATION_TYPES) {
    const e = renderEmail(type, { ...FULL, creatorSupportEmail: "hello@anastudio.com" }, ctx)
    if (NAMED.includes(type)) {
      check(`${type} is sent under the seller's name, replying to their support inbox`, e.fromName === "Ana Lopez" && e.replyTo === "hello@anastudio.com", [e.fromName, e.replyTo])
    } else {
      check(`${type} comes from Storelib`, !e.fromName && !e.replyTo, [e.fromName, e.replyTo])
    }
  }
  const noSupport = renderEmail("REVIEW_REQUEST", { ...FULL, creatorSupportEmail: "not an address" }, ctx)
  check("a reply-to that is not a plain address is dropped, not repaired", noSupport.fromName === "Ana Lopez" && !noSupport.replyTo, noSupport.replyTo)
  const evilName = renderEmail("REVIEW_REQUEST", { ...FULL, creatorName: 'Ana" <spoof@evil.io>' }, ctx)
  check("a seller name cannot carry an address into the From header", !/[<>"]/.test(evilName.fromName ?? ""), evilName.fromName)

  /* THE REVIEW EMAIL'S OWN PARTS: the product card, five star links, one button, a footer that says what it turns off. */
  const ask = renderEmail("REVIEW_REQUEST", { ...FULL, productImage: "https://cdn.example.com/presets.png" }, ctxUnsub)
  check("the stars are five links, each opening the receipt at that rating", [1, 2, 3, 4, 5].every((n) => ask.html.includes(`${BASE}/receipt/rt_abc?rate=${n}#review`) && ask.text.includes(`${BASE}/receipt/rt_abc?rate=${n}#review`)))
  check("the product card carries the picture with the title as its alt text", /<img[^>]*alt="Lightroom Presets Vol 2"/.test(ask.html) && /src="https:\/\//.test(ask.html))
  check("the card names the creator under the title", ask.html.includes("by Ana Lopez") && ask.text.includes("by Ana Lopez"))
  check("one button, near black", (ask.html.match(/class="sn-btn"/g) ?? []).length === 1 && ask.html.includes('bgcolor="#1a1a2e"'))
  check("the footer link says it turns review emails off", ask.text.includes(`Turn off review emails: ${ctxUnsub.unsubscribeUrl}`) && !ask.text.includes("Unsubscribe:"))
  const noPicture = renderEmail("REVIEW_REQUEST", { ...FULL, productImage: "http://cdn.example.com/x.png" }, ctx)
  check("a picture that is not https is left out, and the letter tile is drawn", !/<img[^>]*alt="Lightroom/.test(noPicture.html) && noPicture.html.includes('class="sn-tile"'))

  /* No purple anywhere in a notification email: the owner's rule for the whole product. */
  for (const type of NOTIFICATION_TYPES) {
    const e = renderEmail(type, FULL, ctxUnsub)
    const purple = e.html.match(/#(8b5cf6|7c3aed|6d28d9|5b21b6|4c1d95|a78bfa|c4b5fd|ddd6fe|ede9fe|f5f3ff|2f2f4d)/i)
    check(`${type} has no purple`, !purple, purple?.[0])
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
}

main()
