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
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
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
      const who = /currentCreatorId\(\)/.test(src) || /auth\.getUser\(\)/.test(src)
      check(`${path} asks who is signed in`, who)
      if (path.includes("[id]")) {
        check(`  and only acts on an order of theirs`, /await ownedOrderLines\(admin, creatorId, id\)/.test(src) && /if \(!lines\) return NextResponse\.json\(\{ error: "This order was not found\." \}, \{ status: 404 \}\)/.test(src))
      }
      check(`  and logs no address`, !/console\.(log|info|warn|error)\([^)]*(email|to\b)/i.test(src))
    }
    const exportRoute = code("app/api/app/orders/export/route.ts")
    check("the export link is only served to a link this server signed", /const link = verifyOrderLink\(/.test(exportRoute) && /if \(!link \|\| link\.k !== "csv"\)/.test(exportRoute))
    check("  for the creator it was signed for", /readCreatorOrders\(admin, link\.c\)/.test(exportRoute))
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
    check("the buyer's email is masked in the send log", /to: maskEmail\(customerEmail\)/.test(read("lib/email.tsx")) && !/Buyer email sent successfully to:", customerEmail/.test(read("lib/email.tsx")))
    const refund = code("app/api/stripe/refund/route.ts")
    check("only a paid order can be refunded", /if \(order\.status !== "completed"\)/.test(refund) && /Number\.isFinite\(refundAmountCents\)/.test(refund))
    const page = code("app/app/orders/sales/page.tsx")
    check("a refund on one item of a basket does not mark the whole basket", /if \(group\.length > 1 && !charge\.refunded\) continue/.test(page))
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
    check("  and the total includes the tip", events.find((e) => e.id === "paid")?.text === "$12.00 paid")
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
  }

  console.log("\nThe controls and the slide")
  {
    const detail = code("app/app/orders/order-detail.tsx")
    check("copying goes through the helper that falls back when the clipboard is missing", /copyText\(text\)/.test(detail) && !/navigator\.clipboard/.test(detail))
    check("previous and next say what they do, whatever the list is sorted by", /aria-label="Previous order"/.test(detail) && /aria-label="Next order"/.test(detail) && !/Newer order|Older order/.test(detail))
    check("changing the email is always offered, not only with a receipt", /label: "Change customer email", icon: <Mail className="h-4 w-4" \/>, onClick: \(\) => setDialog\("email"\)/.test(detail))
    check("a second tap while one action runs does nothing", /if \(busy\) return false/.test(detail))
    const client = code("app/app/orders/orders-client.tsx")
    check("the slide moves on when the animation ends, with a net", /onAnimationEnd=\{onSlideEnd\}/.test(client) && /SLIDE_NET_MS/.test(client))
    check("reduced motion opens and closes at once", (client.match(/if \(prefersReducedMotion\(\)\)/g) ?? []).length === 2)
    check("the next order starts at its top before it is drawn", /React\.useLayoutEffect\(\(\) => \{\s*detailRef\.current\?\.scrollTo\(\{ top: 0 \}\)\s*\}, \[shown\?\.id\]\)/.test(client))
    check("a step plays a short step in, from the side it came from", /data-dir=\{step\?\.id === shown\.id \? step\.dir : undefined\}/.test(client) && /\.orders-step\[data-dir="next"\]/.test(read("app/globals.css")))
    check("  and reduced motion stills that too", /\.orders-detail\[data-stage\],\s*\n\s*\.orders-step\[data-dir\] \{\s*\n\s*animation: none;/.test(read("app/globals.css")))
    check("an action updates the rows from the server's answer, without reloading every order", !/router\.refresh\(\)/.test(client) && /applyDelivery\(data\?\.lines\)/.test(client))
    const list = code("app/app/orders/orders-list.tsx")
    check("Export is the violet action, and off with no orders", /className=\{buttonAccent\}\s*onClick=\{\(\) => props\.onExport\(\)\}\s*disabled=\{allOrders\.length === 0\}/.test(list))
    check("  violet, white, a step darker on hover, with a shadow", /bg-\[#8b5cf6\][^"]*text-white[^"]*hover:bg-\[#7c3aed\]/.test(read("app/app/orders/order-parts.tsx")) && /buttonAccent =[\s\S]{0,200}shadow-\[/.test(read("app/app/orders/order-parts.tsx")))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main()
