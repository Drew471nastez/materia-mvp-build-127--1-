/**
 * AN ORDER'S PAGE: ITS ACTIONS, ITS FILES AND ITS TIMELINE
 *
 * The order opened over the Orders list (app/app/orders/order-detail.tsx)
 * resends the receipt, changes the buyer's email, downloads the invoice and
 * copies the order id, and the phone apps save the invoice and the export
 * through the system browser sheet. These are the parts that would go wrong
 * quietly:
 *
 *   an action on somebody else's order     every route asks lib/orders/owned.ts
 *                                          first, with the creator from the session
 *   a download that does nothing in the app lib/platform/save-file.ts, per platform
 *   a link that outlives its purpose        lib/orders/signed-link.ts
 *   an export that picks the wrong orders   the number runs in lib/orders/export-csv.ts
 *   a timeline in the wrong day             lib/orders/timeline.ts
 */
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { stripComments } from "./_source"
import { savePlan, saveFile, savedMessage, type SaveDeps } from "../lib/platform/save-file"
import { decodeRuns, encodeRuns, pickByNumber, safeFileName, ordersCsv } from "../lib/orders/export-csv"
import { groupOrders, type OrderRow } from "../lib/orders/order-view"
import { groupTimeline, orderEvents, relativeTime, paymentMethodOf } from "../lib/orders/timeline"
import { signOrderLink, verifyOrderLink, LINK_TTL_MS } from "../lib/orders/signed-link"
import { canEmailAccess, cleanEmail, isOrderId, ownedOrderLines } from "../lib/orders/owned"
import { untt } from "./i18n-source"

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
    console.log(`  FAIL  ${label}${detail === undefined ? "" : ` (${JSON.stringify(detail)})`}`)
  }
}
const read = (p: string) => untt(readFileSync(join(process.cwd(), p), "utf8"), p)
const code = (p: string) => stripComments(read(p))

function row(id: string, at: string, extra: Partial<OrderRow> = {}): OrderRow {
  return {
    id,
    product_id: extra.product_id ?? "p1",
    amount_cents: 1000,
    status: "completed",
    created_at: at,
    buyer_email: "ana@example.com",
    buyer_first_name: "Ana",
    buyer_last_name: "Pop",
    product: { id: extra.product_id ?? "p1", title: "Preset pack" },
    ...extra,
  }
}

/* A stand-in for the service role client: enough of PostgREST's chain for
   ownedOrderLines, over rows held in memory. */
function fakeAdmin(rows: any[]) {
  return {
    from() {
      const filters: Array<[string, unknown]> = []
      const q: any = {
        select: () => q,
        eq: (col: string, val: unknown) => {
          filters.push([col, val])
          return q
        },
        maybeSingle: async () => ({ data: rows.find((r) => filters.every(([c, v]) => r[c] === v)) ?? null, error: null }),
        then: (resolve: (v: unknown) => void) => resolve({ data: rows.filter((r) => filters.every(([c, v]) => r[c] === v)), error: null }),
      }
      return q
    },
  }
}

function routeFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) routeFiles(p, out)
    else if (name === "route.ts") out.push(p)
  }
  return out
}

async function main() {
  console.log("\nOnly the creator's own orders")
  {
    const A = "11111111-1111-4111-8111-111111111111"
    const B = "22222222-2222-4222-8222-222222222222"
    const C = "33333333-3333-4333-8333-333333333333"
    const D = "44444444-4444-4444-8444-444444444444"
    const mine = { id: "p1", title: "Pack", creator_id: "me" }
    const theirs = { id: "p9", title: "Other", creator_id: "them" }
    const admin = fakeAdmin([
      { id: A, created_at: "2025-01-01T10:00:00Z", stripe_session_id: "cs_1", product: mine, status: "completed" },
      { id: B, created_at: "2025-01-01T10:00:01Z", stripe_session_id: "cs_1", product: mine, status: "completed" },
      { id: C, created_at: "2025-01-01T10:00:02Z", stripe_session_id: "cs_1", product: theirs, status: "completed" },
      { id: D, created_at: "2025-01-02T10:00:00Z", stripe_session_id: null, product: theirs, status: "completed" },
    ])
    const basket = await ownedOrderLines(admin, "me", B)
    check("an order of mine comes back with every row of its payment", basket?.map((r) => r.id).join() === `${A},${B}`, basket?.map((r) => r.id))
    check("  and none of the rows another creator was paid for in the same basket", !basket?.some((r) => r.id === C))
    check("somebody else's order is not found", (await ownedOrderLines(admin, "me", D)) === null)
    check("  nor is my row asked for as another creator", (await ownedOrderLines(admin, "them", A))?.every((r) => r.product?.creator_id === "them") ?? true)
    check("an id that is not an id is not looked up", (await ownedOrderLines(admin, "me", "1 or 1=1")) === null && !isOrderId("x") && isOrderId(A))
    check("no creator, no order", (await ownedOrderLines(admin, "", A)) === null)
    check("only a paid row with a receipt can be emailed its access",
      canEmailAccess({ status: "completed", receipt_token: "t" }) && !canEmailAccess({ status: "refunded", receipt_token: "t" }) && !canEmailAccess({ status: "completed", receipt_token: null }))
    check("an address is trimmed and checked", cleanEmail("  ana@example.com ") === "ana@example.com" && cleanEmail("ana@") === null && cleanEmail(42) === null)

    /* Every route an order's page calls asks who is asking, then whether the order is theirs. */
    const routes = routeFiles(join(process.cwd(), "app/api/app/orders")).map((p) => p.slice(process.cwd().length + 1))
    check("the order routes exist", routes.length >= 4, routes)
    for (const path of routes) {
      const src = code(path)
      /* Changed on purpose (round AA, Team): storeIdFor (lib/team/server) is auth.getUser() and then
         the store this account owns, or works in as a member whose role has orders, checked in the database. */
      const who = /currentCreatorId\(\)/.test(src) || /auth\.getUser\(\)/.test(src) || (/await storeIdFor\("orders"(?:, \{ read: true \})?\)/.test(src) && /if \(store\.ok === false\)/.test(src))
        /* shopCaller("orders") (lib/physical/auth): the same sign in and store check, for a route that only reads counts. */
        || (/await shopCaller\("orders"(?:, \{ read: true \})?\)/.test(src) && /if \(c instanceof NextResponse\) return c/.test(src))
      check(`${path} asks who is signed in`, who)
      if (path.includes("[id]")) {
        check(`  and only acts on an order of theirs`, /await ownedOrderLines\(admin, creatorId, id\)/.test(src) && /if \(!lines\) return NextResponse\.json\(\{ error: "This order was not found\." \}, \{ status: 404 \}\)/.test(src))
      }
      check(`  and logs no address`, !/console\.(log|info|warn|error)\([^)]*(email|to\b)/i.test(src))
    }
    const exportRoute = code("app/api/app/orders/export/route.ts")
    check("the export link is only served to a link this server signed", /const link = verifyOrderLink\(/.test(exportRoute) && /if \(!link \|\| link\.k !== "csv"\)/.test(exportRoute))
    /* Changed on purpose: the export reads through lib/orders/paged.ts, as the page does (tests/orders-paging.test.ts). */
    check("  for the creator it was signed for", /readOrdersForExport\(admin, link\.c, /.test(exportRoute) && /readOrdersForExport\(admin, creator\.id, /.test(exportRoute))
    const invoice = code("app/api/invoice/route.ts")
    check("the invoice checks the order is the creator's, signed in or by link", (invoice.match(/ownedOrderLines\(admin, creatorId/g) ?? []).length >= 2 && /verifyOrderLink\(signed\)/.test(invoice))
    check("  and covers every row of the order", /for \(const line of lines\)/.test(invoice))
    check("  and does not print what Storelib kept on the buyer's invoice", !/Platform Fee|Net Earnings/.test(invoice))
    check("resending and changing the email are rate limited", /bucket: "order-resend"/.test(code("app/api/app/orders/[id]/resend/route.ts")) && /bucket: "order-email-change"/.test(code("app/api/app/orders/[id]/email/route.ts")))
    const client = code("app/app/orders/orders-client.tsx")
    check("the page no longer hands the buyer's receipt token to a route", !/receiptToken/.test(client) && !/receipt\/resend|receipt\/update-email/.test(client))
    check("  and sends only the order id", /\/api\/app\/orders\/\$\{encodeURIComponent\(order\.id\)\}\/resend/.test(client) && /\/api\/app\/orders\/\$\{encodeURIComponent\(order\.id\)\}\/email/.test(client))
    const notify = code("lib/orders/notify.ts")
    check("a resend clears the last send's record before sending", /buyer_notified_at: null, buyer_email_last_error: null/.test(notify) && /from\("email_logs"\)\.delete\(\)/.test(notify))
    check("  then reads back what the send wrote", /select\("id, buyer_email, buyer_notified_at, buyer_email_last_error"\)/.test(notify))
    check("  and keeps no copy of an address in the history", !/email:/.test(notify.split("recordOrderEvent")[1] ?? ""))
    check("the buyer's email is masked in the send log", /"to", maskEmail\(customerEmail\)/.test(read("lib/email.tsx")) && !/Buyer email sent successfully to:", customerEmail/.test(read("lib/email.tsx")))
    const refund = code("app/api/stripe/refund/route.ts")
    check("only a paid order can be refunded", /if \(order\.status !== "completed" && order\.status !== "refunded"\)/.test(refund) && /Number\.isFinite\(refundAmountCents\)/.test(refund))
    check("  and a partly refunded one only up to what is left", /maxRefundCents = Math\.max\(0, \(order\.amount_cents \|\| 0\) - alreadyRefunded\)/.test(refund))
    const page = code("app/app/orders/sales/page.tsx")
    /* Changed on purpose (rel-commerce, database audit F8): a found refund goes through lib/stripe/refund-sync, as the charge.refunded webhook does, which applies it to the row it names or shares it across the basket, each refund once, with its ledger line. */
    check("a refund on one item of a basket does not mark the whole basket", /await syncChargeRefund\(admin, stripe, charge\)/.test(page) && !/update\(\{ status: "refunded" \}\)/.test(page))
  }

  console.log("\nSaving a file, in a browser and in the apps")
  {
    check("a browser downloads the bytes", savePlan("web", true).via === "blob")
    check("iOS opens a PDF in its own viewer", JSON.stringify(savePlan("ios", true)) === JSON.stringify({ via: "browser", disposition: "inline", outcome: "ios-viewer" }))
    check("  and offers anything else as a download", savePlan("ios", false).disposition === "attachment" && savePlan("ios", false).outcome === "ios-download")
    check("Android is sent an attachment, which Chrome saves to Downloads", savePlan("android", true).disposition === "attachment" && savePlan("android", true).via === "browser")

    const run = async (platform: SaveDeps["platform"], viewable: boolean) => {
      const calls: string[] = []
      const outcome = await saveFile(
        {
          name: "invoice-1001.pdf",
          viewable,
          file: async () => {
            calls.push("file")
            return new Blob(["%PDF"])
          },
          link: async (d) => {
            calls.push(`link:${d}`)
            return `https://storelib.com/api/invoice?t=x&d=${d}`
          },
        },
        {
          platform,
          download: (_b, name) => void calls.push(`download:${name}`),
          openInBrowser: async (url) => void calls.push(`open:${url}`),
        },
      )
      return { outcome, calls }
    }
    const web = await run("web", true)
    check("on the web: the file is made and downloaded, no link asked for", web.calls.join() === "file,download:invoice-1001.pdf" && web.outcome === "downloaded", web.calls)
    const ios = await run("ios", true)
    check("on iOS: a link is asked for and opened, no blob made", ios.calls.join() === "link:inline,open:https://storelib.com/api/invoice?t=x&d=inline", ios.calls)
    const android = await run("android", true)
    check("on Android: the same, as an attachment", android.calls[0] === "link:attachment" && android.calls.length === 2 && android.outcome === "android-download", android.calls)
    let threw = false
    try {
      await saveFile(
        { name: "x", file: async () => new Blob([]), link: async () => { throw new Error("The invoice could not be made. Try again.") } },
        { platform: "ios", download: () => {}, openInBrowser: async () => {} },
      )
    } catch (e) {
      threw = (e as Error).message.startsWith("The invoice")
    }
    check("a link that could not be made reaches the notice", threw)
    const words = (["downloaded", "ios-viewer", "ios-download", "android-download"] as const).map((o) => savedMessage(o, "Invoice"))
    check("each notice says where the file went", words[0] === "Invoice downloaded" && /Save to Files/.test(words[1]) && /Files, in Downloads/.test(words[2]) && /Downloads/.test(words[3]), words)
    check("  in plain words, with no dashes", words.every((w) => !/[—–]/.test(w)))
    const saver = code("lib/platform/save-file.ts")
    check("the app is found from its bridge, never the user agent", /isNativePlatform/.test(saver) && !/userAgent/.test(saver))
    check("  and no plugin that is not installed is imported", !/@capacitor\/(filesystem|share)/.test(saver))
    check("a download's address is not revoked while the browser still reads it", /setTimeout\(\(\) => URL\.revokeObjectURL\(url\), \d{3,}\)/.test(saver))
    check("the invoice and the export both save through it",
      /await saveFile\(/.test(code("app/app/orders/orders-client.tsx")) && /saveFile\(\{/.test(code("app/app/orders/export-dialog.tsx")) && !/function download\(/.test(code("app/app/orders/export-dialog.tsx")))
  }

  console.log("\nA link to one file, for five minutes")
  {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key-long-enough"
    const now = Date.parse("2025-05-01T12:00:00Z")
    const token = signOrderLink({ k: "invoice", c: "creator-1", o: "order-1", z: "UTC", d: "inline" }, now)
    const back = token ? verifyOrderLink(token, now + 1000) : null
    check("a link this server signed opens", back?.k === "invoice" && back.c === "creator-1" && (back as any).o === "order-1")
    check("  and stops opening after five minutes", verifyOrderLink(token, now + LINK_TTL_MS + 1) === null)
    const [body, sig] = (token || ".").split(".")
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()), c: "creator-2" })).toString("base64url")
    check("a link edited to name another creator does not open", verifyOrderLink(`${forged}.${sig}`, now) === null)
    check("nor does garbage", verifyOrderLink("abc", now) === null && verifyOrderLink(null, now) === null && verifyOrderLink(`${body}.zz`, now) === null)
    process.env.SUPABASE_SERVICE_ROLE_KEY = "short"
    check("with no key to sign with, no link is made at all", signOrderLink({ k: "invoice", c: "c", o: "o", z: "UTC", d: "inline" }, now) === null && verifyOrderLink(token, now) === null)
  }

  console.log("\nThe export names its orders in few characters")
  {
    check("newest first is one run", encodeRuns([1005, 1004, 1003, 1002, 1001]) === "1005-1001")
    check("gaps and single orders", encodeRuns([1001, 1003, 1004, 1005, 1009]) === "1001,1003-1005,1009", encodeRuns([1001, 1003, 1004, 1005, 1009]))
    const shuffled = [1010, 1002, 1003, 1020, 1019, 1018, 1001]
    check("any order comes back exactly", JSON.stringify(decodeRuns(encodeRuns(shuffled))) === JSON.stringify(shuffled))
    check("a year of sales is still short", encodeRuns(Array.from({ length: 5000 }, (_, i) => 6000 - i)).length < 20)
    check("anything else is refused", decodeRuns("1-2;DROP") === null && decodeRuns("") === null && decodeRuns("1-9999999") === null)
    const orders = groupOrders([row("a", "2025-04-07T09:00:00Z"), row("b", "2025-04-08T09:00:00Z"), row("c", "2025-04-09T09:00:00Z")])
    const picked = pickByNumber(orders, [1003, 1001, 4242, 1003])
    check("the server picks the same orders, in the list's order, once each", picked.map((o) => o.number).join() === "1003,1001")
    check("  and writes the same file the browser would", ordersCsv(picked, "UTC", "plain") === ordersCsv([orders[0], orders[2]], "UTC", "plain"))
    check("a file name cannot carry a header", safeFileName('a"b\r\nSet-Cookie: x.csv', "orders.csv") === "abSet-Cookiex.csv" && safeFileName("", "orders.csv") === "orders.csv" && safeFileName(".env", "o.csv") === "o.csv")
  }

  console.log("\nThe timeline")
  {
    const tz = "America/New_York"
    const now = Date.parse("2025-04-09T16:00:00Z")
    const order = groupOrders([
      row("a", "2025-04-08T23:30:00Z", {
        stripe_payment_intent_id: "pi_1",
        card_brand: "visa",
        card_last4: "4242",
        buyer_notified_at: "2025-04-08T23:31:00Z",
        tip_cents: 200,
        /* Charged in dollars: the timeline writes it in the order's own currency (lib/orders/money). */
        currency: "USD",
      }),
    ])[0]
    const events = orderEvents(order, [{ id: "e1", type: "receipt_resent", at: "2025-04-09T15:50:00Z", by: "creator", failed: false }], [
      { id: "funds_available", label: "Available soon", description: "Typically 2–7 business days after payment", timestamp: "2025-04-12T00:00:00Z", status: "pending" },
      { id: "payment_completed", label: "Payment completed", timestamp: "2025-04-08T23:30:00Z", status: "completed" },
    ])
    const groups = groupTimeline(events, now, tz)
    check("grouped by the creator's day: 23:30 UTC on the 8th is the 8th in New York, yesterday", groups[0].day === "Yesterday", groups.map((g) => g.day))
    check("  and today's resend under Today", groups[1]?.day === "Today" && groups[1].events[0].glyph === "resent", groups[1])
    check("what has not happened yet goes last, under Next", groups.at(-1)?.day === "Next" && groups.at(-1)?.events[0].tone === "upcoming")
    check("Stripe's steps the order already says are not repeated", !events.some((e) => e.id === "stripe-payment_completed"))
    check("paid is green, with the card", events.find((e) => e.id === "paid")?.tone === "success" && events.find((e) => e.id === "paid")?.detail === "Visa •••• 4242")
    check("  and the total is what was charged, the tip already inside it", events.find((e) => e.id === "paid")?.text === "$10.00 paid", events.find((e) => e.id === "paid")?.text)
    const refunded = groupOrders([row("r", "2025-04-01T10:00:00Z", { status: "refunded", refund_amount_cents: 500, refunded_at: "2025-04-02T10:00:00Z" })])[0]
    check("a refund is red", orderEvents(refunded).find((e) => e.glyph === "refund")?.tone === "critical")
    const pending = groupOrders([row("p", "2025-04-01T10:00:00Z", { status: "pending" })])[0]
    check("a pending payment is amber", orderEvents(pending).find((e) => e.glyph === "pending")?.tone === "attention")
    const bounced = groupOrders([row("f", "2025-04-01T10:00:00Z", { buyer_email_last_error: "Mailbox full" })])[0]
    const bouncedGroups = groupTimeline(orderEvents(bounced), now, tz)
    check("an undated failure sits in the day of the event before it", bouncedGroups.length === 1 && bouncedGroups[0].events.at(-1)?.glyph === "mail-failed", bouncedGroups)
    check("relative time for the last day, then the clock", relativeTime("2025-04-09T15:48:00Z", now) === "12 min ago" && relativeTime("2025-04-09T13:00:00Z", now) === "3 h ago" && relativeTime("2025-04-07T13:00:00Z", now) === null)
    check("no dashes reach the page from Stripe's words", events.every((e) => !/ [—–] /.test(e.detail || "")))
    check("a free order says so", paymentMethodOf(groupOrders([row("z", "2025-04-01T10:00:00Z", { amount_cents: 0 })])[0]) === "No payment needed")

    const detail = code("app/app/orders/order-detail.tsx")
    const timeline = detail.slice(detail.indexOf("function Timeline("), detail.indexOf("function RefundDialog("))
    check("the timeline has no violet dots", !/8b5cf6|6d4ae0|violet|purple/i.test(timeline))
    check("  it draws a glyph per kind of event, in semantic colours", /GLYPH\[event\.glyph\]/.test(timeline) && /GLYPH_TONE\[event\.tone\]/.test(detail))
    check("  with the exact time on hover and on tap", /title=\{exact\}/.test(timeline) && /onClick=\{\(\) => setOpen\(expanded \? null : event\.id\)\}/.test(timeline))
    check("  and reads its history again after an action", /\[order\.id, revision\]/.test(timeline))
    /* "The timeline needs to be in a container: a gray background with
       depth, rounded corners, with dots behind." A well pressed into the
       page with its heading above it, not a white card, so not a card in a
       card; measured in Chromium by scripts/check-orders-page.mjs. */
    check("the timeline sits in a grey panel with 14px corners, its heading above it on the page",
      /<h2 className="px-1 text-\[13px\] font-semibold text-\[#1a1a2e\]">Timeline<\/h2>\s*<div data-timeline-panel="" className="mt-2 rounded-\[14px\][^"]*" style=\{PANEL_STYLE\}>/.test(timeline)
        && !/cn\(card, "min-w-0 px-4 pb-2 pt-3\.5"/.test(timeline))
    check("  a dot grid behind it in CSS, and depth from an inset hairline and an inset shade",
      /backgroundColor: "#f3f4f6"/.test(detail) && /backgroundImage: "radial-gradient\(circle, rgba\(17,24,39,0\.09\) 1px, transparent 1\.25px\)"/.test(detail)
        && /backgroundSize: "12px 12px"/.test(detail) && /boxShadow: "inset 0 0 0 1px rgba\(17,24,39,0\.06\), inset 0 1px 3px rgba\(17,24,39,0\.06\)/.test(detail)
        && !/url\(/.test(detail.slice(detail.indexOf("const PANEL_STYLE"), detail.indexOf("const activityOf"))))
    check("  each event a white node on the rail, a 13px semibold title, the time in tabular figures",
      /rounded-full border bg-white/.test(timeline) && /"text-\[13px\] font-semibold leading-\[18px\]"/.test(timeline)
        && /text-\[12px\] leading-4 tabular-nums text-\[#6b7280\]/.test(timeline)
        && /success: "text-\[#16803c\] border-\[#cde9d6\]"/.test(detail) && /upcoming: "text-\[#9ca3af\] border-dashed/.test(detail))
    check("  grouped under day headers, in the order the events came",
      /data-timeline-day=""/.test(timeline) && /for \(const g of groups\) \{\s*rows\.push\(\{ kind: "day"/.test(timeline))
  }

  console.log("\nThe controls and the slide")
  {
    const detail = code("app/app/orders/order-detail.tsx")
    check("copying goes through the helper that falls back when the clipboard is missing", /copyText\(text\)/.test(detail) && !/navigator\.clipboard/.test(detail))
    check("previous and next say what they do, whatever the list is sorted by", /aria-label="Previous order"/.test(detail) && /aria-label="Next order"/.test(detail) && !/Newer order|Older order/.test(detail))
    check("changing the email is always offered, not only with a receipt", /label: "Change customer email", icon: <Mail className="h-4 w-4" \/>, onClick: \(\) => fromMenu\("email"\)/.test(detail))
    check("a second tap while one action runs does nothing", /if \(busy\) return false/.test(detail))
    const client = code("app/app/orders/orders-client.tsx")
    const css = read("app/globals.css")
    const motion = code("app/app/orders/order-motion.ts")
    /* "Not so direct or clunky": the phone's own push and pop, started
       before the frame that draws the order is painted, on the compositor.
       The slide that came out once ("too smooth and flowy", a bar that
       arrived late) was a class put on after the paint; this is not. */
    check("an order is moved from the layout effect of the commit that draws or closes it",
      /React\.useLayoutEffect\(\(\) => \{\s*const was = settledId\.current[\s\S]{0,900}moveOrder\("push", detail, list\)[\s\S]{0,300}moveOrder\("pop", detail, list, \(\) => setLeavingId\(null\), \{ settle: false \}\)\s*\}, \[shownId\]\)/.test(client))
    check("  a step to the previous or next order moves nothing but the cards",
      /if \(was !== null \|\| !detail\) return/.test(client) && /\.orders-detail\[data-arrival="step"\] \.orders-body \{\s*animation: orders-body-in 120ms ease-out backwards;/.test(css) && !/^\.orders-body \{/m.test(css))
    /* Changed on purpose: "not that sliding". On a phone the order rises from the bottom over a list that holds still, the page layer's own motion, where it was pushed in from the right edge over a list moving left. */
    check("  on transform and opacity alone, as Web Animations, never a layout property: on a phone the order rises and drops on translateY, the list holds still",
      /detail\.animate\(\[\{ transform: `translate3d\(0, \$\{detailY\}px, 0\)` \}, \{ transform: `translate3d\(0, \$\{detailTo\}px, 0\)` \}\]/.test(motion) && !/list\.animate\(/.test(motion) && !/translate3d\(\$\{detailX\}px/.test(motion)
        && /const detailTo = kind === "push" \? 0 : height/.test(motion) && /body\.animate\(\[\{ opacity: 0 \}, \{ opacity: 1 \}\], \{ duration: ORDER_FADE_IN_MS/.test(motion)
        && !/\.animate\(\[\{ (left|top|width|height|margin)/.test(motion) && !/ORDER_PARALLAX/.test(motion))
    check("  the page layer's times and curve on a phone (one number in one place), a short fade wider, decided by the sheets' phone width",
      /export const ORDER_PUSH_MS = LAYER_MOTION_MS/.test(motion) && /export const ORDER_POP_MS = LAYER_LEAVE_MS/.test(motion) && /export const ORDER_EASE = LAYER_MOTION_EASE/.test(motion)
        && /import \{ LAYER_LEAVE_MS, LAYER_MOTION_EASE, LAYER_MOTION_MS, startWhenFramesFlow \} from "@\/components\/app\/page-layer"/.test(motion)
        && /export const ORDER_FADE_IN_MS = 150/.test(motion) && /export const ORDER_PHONE_QUERY = "\(max-width: 639px\)"/.test(motion))
    check("  the row answers the press on its own frame, before the order is drawn",
      /const onOpen = useStable\(\(id: string\) => \{[\s\S]{0,300}if \(listRef\.current\) markRow\(listRef\.current, id, "held"\)[\s\S]{0,80}writeAddress\(\(p\) => p\.set\("order", id\), "push"\)/.test(client))
    /* "When I open an order the top bar blends in with a delay, it looks
       cheap." On a computer the bar is never faded over the list's bar. */
    /* The list used to settle in after Back on a computer, from half faded and
       2px low: the owner's "bump", gone from Emails and then from Orders. The
       settle stays in order-motion for a list that asks for it; Orders does not. */
    check("  on a computer the order's bar is there on the first frame: only its cards fade in; back takes the order at once and the list is there whole, with no settle in",
      /const body = detail\.querySelector<HTMLElement>\("\.orders-body"\)/.test(motion) && !/detail\.animate\(\[\{ opacity/.test(motion)
        && /if \(kind === "pop"\) \{\s*settle\(detail, list\)\s*done\?\.\(\)/.test(motion)
        /* What is in the list settles in, never the list: it is the scroller,
           and moving it moved its scrollbar (scripts/check-scrollbar-stable.mjs). */
        && /for \(const layer of list\.children\) \{\s*\(layer as HTMLElement\)\.animate\(\s*\[\{ opacity: 0\.5, transform: "translate3d\(0, 2px, 0\)" \}/.test(motion)
        && !/list\.animate\(\s*\[\{ opacity/.test(motion)
        && /export const ORDER_LIST_BACK_MS = 180/.test(motion)
        && /done\?\.\(\)\s*if \(!settleIn\) return/.test(motion) && /\{ settle: false \}/.test(client))
    check("  and coming back to Orders from another page (the browser's back) lands nothing: the list is as it was left",
      /const \[returning\] = React\.useState\(\(\) => isTraversing\(\)\)/.test(client) && /React\.useLayoutEffect\(\(\) => \{\s*if \(returning\) holdLanding\(\)\s*\}, \[returning\]\)/.test(client))
    check("  interrupted, it starts from where the layer is, read before the running move is cancelled",
      /const detailY = moving \? yOf\(detail\)/.test(motion) && motion.indexOf("const detailY") < motion.indexOf("stop(detail)") && /return new DOMMatrixReadOnly\(t\)\.m42/.test(motion))
    check("  the pop holds its last frame until the order is taken away, so it cannot snap back",
      /fill: kind === "pop" \? "forwards" : "none"/.test(motion))
    check("  and reduced motion moves nothing", /if \(reducedMotion\(\) \|\| typeof detail\.animate !== "function"\) \{\s*settle\(detail, list\)\s*done\?\.\(\)/.test(motion))
    check("the list stays drawn under a moving order, and is hidden under a settled one",
      /* Changed on purpose: opacity, not visibility, which is inherited and restyled the whole list in the first and last frames of a move. */
      /\.orders-stage\[data-order-open\] > \.orders-list:not\(\[data-moving\]\) \{\s*opacity: 0;/.test(css) && !/\.orders-list:not\(\[data-moving\]\) \{\s*visibility: hidden;/.test(css)
        && /list\.dataset\.moving = ""/.test(motion) && /delete list\.dataset\.moving/.test(motion)
        && /data-order-open=\{listCovered \? "" : undefined\}/.test(client) && !/style=\{\{ visibility: listCovered/.test(client))
    check("an order going back is kept, inert, until it is off, worked out while rendering",
      /if \(shownId !== lastId\) \{\s*setLastId\(shownId\)\s*setLeavingId\(shownId === null \? lastId : null\)/.test(client)
        && /const displayed = shown \?\? leaving/.test(client) && /inert=\{!shown\}/.test(client))
    check("  and a browser that already drew its own back transition is not followed by a second",
      /hasUAVisualTransition/.test(client) && /if \(!detail \|\| skip\) \{\s*stillOrder\(detail, list\)\s*setLeavingId\(null\)/.test(client))
    check("the row the order came from is tinted, then fades, on opacity alone, written without drawing the list again",
      /markRow\(list, shownId, "held"\)/.test(client) && /markRow\(list, was, "fading"\)/.test(client)
        && /@keyframes orders-row-fade \{\s*0%, 30% \{ opacity: 1; \}\s*100% \{ opacity: 0; \}/.test(css)
        && /data-order-id=\{order\.id\}/.test(code("app/app/orders/orders-list.tsx")))
    check("a finger on a row, or a pointer resting on one, reads the order's history ahead, and the timeline starts from it",
      /onPointerDown=\{\(\) => prefetchOrder\(order\)\}/.test(code("app/app/orders/orders-list.tsx"))
        && /HOVER_PREFETCH_MS/.test(code("app/app/orders/orders-list.tsx"))
        && /useState<OrderActivity\[\]>\(\(\) => activityOf\(cachedJson\(activityUrl\(order\.id\)\)\) \?\? \[\]\)/.test(code("app/app/orders/order-detail.tsx"))
        && /readJson\(activityUrl\(order\.id\), revision > 0\)/.test(code("app/app/orders/order-detail.tsx")))
    check("the next order starts at its top before it is drawn, a leaving one where it was", /* Changed on purpose: a pane drawn for the first time is at its top already, and scrolling it made the browser lay out the whole page in the commit that starts the rise. */
      /const fresh = pane !== scrolledPane\.current\s*scrolledPane\.current = pane\s*if \(shownId && pane && !fresh\) pane\.scrollTo\(\{ top: 0 \}\)\s*\}, \[shownId\]\)/.test(client))
    check("a step draws the next order's cards fresh, the bar staying put", /<div key=\{order\.id\} className=\{cn\("orders-body /.test(detail) && detail.indexOf("<OrderBarFrame") < detail.indexOf("key={order.id}"))
    check("opened straight onto an order, the page does not fade in as a whole", /!openedOnOrder && "app-page-enter"/.test(client))

    /* Export: the shared sheet on a phone, a panel from the button wider. */
    const exporter = code("app/app/orders/export-dialog.tsx")
    check("Export is the shared sheet on a phone, with its title and no close button",
      /<BottomSheet isOpen=\{open\} onClose=\{onClose\} title="Export orders" dismissible=\{!busy\}>/.test(exporter) && !/<Dialog\b/.test(exporter) && !/aria-label="Close"/.test(exporter))
    check("  48px rows and one full width 48px button", /compact \? "min-h-\[48px\] px-3 text-\[15px\]/.test(exporter) && /className="flex h-12 w-full items-center justify-center rounded-xl bg-\[#1a1a2e\]/.test(exporter))
    check("  and a panel hung from the Export button on a computer", /<PopoverAnchor virtualRef=\{measure\} \/>/.test(exporter) && /align="end"/.test(exporter) && /data-orders-export=""/.test(code("app/app/orders/orders-list.tsx")))
    check("  whose choices are fresh on its first frame, not an effect later",
      /if \(open !== wasOpen\) \{\s*setWasOpen\(open\)\s*if \(open\) \{\s*setScope\(selected\.size > 0 \? "selected" : "matching"\)/.test(exporter) && !/React\.useEffect\(\(\) => \{\s*if \(!open\) return/.test(exporter))
    check("  and it stays up, saying so, until the file is made, then says how many",
      /setBusy\(true\)[\s\S]{0,120}const outcome = await saveFile\(/.test(exporter) && /onDone\(outcome === "downloaded" \? `\$\{what\} exported`/.test(exporter) && /"Exporting…"/.test(exporter))
    const parts = code("app/app/orders/order-parts.tsx")
    check("the bar is on the pane, its full width, and the date is inside it",
      /data-orders-bar="" data-scrolled="false" className="orders-bar sticky top-0 z-10 bg-\[#f8f9fa\]"/.test(parts) && /<OrderBarFrame[\s\S]*subtitle=\{/.test(detail))
    check("  with depth only once something is under it", /\.orders-bar\[data-scrolled="true"\] \{/.test(css) && /pane\.addEventListener\("scroll", read, \{ passive: true \}\)/.test(parts))
    check("the refund and the email change are the shared sheet on a phone and a centred dialog wider", /<BottomSheet isOpen=\{open\}/.test(detail) && /<Dialog open=\{open\}/.test(detail) && (detail.match(/<DialogShell$/gm) ?? []).length === 2)
    check("  and from the menu on a phone they wait for its sheet to leave", /later\.current = window\.setTimeout\(\(\) => setDialogNow\(next\), MENU_SHEET_LEFT_MS\)/.test(detail))
    check("the cards: items, payment, then the customer and details beside them, the timeline under",
      /lg:grid-cols-\[minmax\(0,2fr\)_minmax\(0,1fr\)\] lg:grid-rows-\[auto_auto_auto_1fr\]/.test(detail) && /lg:col-start-2 lg:row-span-4 lg:row-start-1/.test(detail))
    /* Changed on purpose: a pull to refresh reads the page again, and that is the one router.refresh in the file. */
    check("an action updates the rows from the server's answer, without reloading every order", (client.match(/router\.refresh\(\)/g) ?? []).length === 1 && /rowsArrived\.current = resolve\s+router\.refresh\(\)/.test(client) && /applyDelivery\(data\?\.lines\)/.test(client))
    const list = code("app/app/orders/orders-list.tsx")
    /* Changed on purpose: the list has one page of orders, and knows how many there are in all from the server (lib/orders/paged.ts summary). */
    check("Export is the violet action, and off with no orders", /className=\{cn\(buttonAccent, [^}]*\)\}\s*onClick=\{\(\) => props\.onExport\(\)\}\s*disabled=\{summary\.total === 0\}/.test(list))
    check("  44px to tap on a phone, 32px to see", /cn\(buttonAccent, "relative before:absolute before:-inset-y-1\.5 before:inset-x-0 before:content-\[''\] sm:before:hidden"\)/.test(list))
    check("  near black (no purple on the app's actions, the owner's ask), white, a step lighter on hover, with a shadow", /buttonAccent =\s*"[^"]*bg-\[#1a1a2e\][^"]*text-white[^"]*hover:bg-\[#2a2a40\]/.test(read("app/app/orders/order-parts.tsx")) && !/buttonAccent =\s*"[^"]*8b5cf6/.test(read("app/app/orders/order-parts.tsx")) && /buttonAccent =[\s\S]{0,200}shadow-\[/.test(read("app/app/orders/order-parts.tsx")))
  }

    {
    const inv = untt(readFileSync(join(process.cwd(), "app/api/invoice/route.ts"), "utf8"), "app/api/invoice/route.ts")
    check("the invoice never adds the tip on top of what was charged",
      /const total = lines\.reduce\(\(n, l\) => n \+ \(l\.amount_cents \|\| 0\), 0\)/.test(inv) && !/subtotal \+ tip/.test(inv)
        && /const whole = line\.amount_cents \|\| 0/.test(inv))
  }
console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main()
