/**
 * ===========================================================================
 *  "VIEW IN BROWSER" IN CAMPAIGN EMAILS (lib/email-campaigns/view-online.ts)
 * ===========================================================================
 * A public page with an unguessable, signed address: one reader's copy
 * (their name, their own unsubscribe link) or the campaign's own (scheduled
 * or sent). It never counts an open and never routes a link through the
 * click counter.
 */
process.env.EMAIL_LINK_SECRET ||= "test-secret-for-view-online-0123456789"
process.env.NEXT_PUBLIC_APP_URL ||= "https://storelib.com"

import { readFileSync } from "node:fs"
import { fakeDb } from "./_fake-db"
import { readViewToken, viewOnlineUrl, viewToken } from "@/lib/email-campaigns/view-online"
import { renderViewOnline } from "@/lib/email-campaigns/view-online-server"
import { buildEmail } from "@/lib/email-campaigns/template"
import { messageFor, type Frame } from "@/lib/email-campaigns/queue"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    console.log(`  FAIL  ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`)
  }
}
const read = (p: string) => readFileSync(p, "utf8")

const CAMPAIGN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const DRAFT = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
const RECIPIENT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const SUBSCRIBER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
const CREATOR = "33333333-3333-4333-8333-333333333333"
const USER = "66666666-6666-4666-8666-666666666666"
const UNSUB = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"
const TRACK = "ffffffff-ffff-4fff-8fff-ffffffffffff"

async function main() {
  console.log("\n1. The address: signed, unguessable, not editable into another\n")
  {
    const t = viewToken({ kind: "recipient", id: RECIPIENT })!
    check("a token for a reader's copy", typeof t === "string" && t.startsWith(`r.${RECIPIENT}.`) && t.split(".")[2].length === 32, t)
    check("reads back as that reader", JSON.stringify(readViewToken(t)) === JSON.stringify({ kind: "recipient", id: RECIPIENT }))
    const other = t.replace(RECIPIENT, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbc")
    check("another id under the same signature opens nothing", readViewToken(other) === null)
    check("a reader's signature does not open the campaign's page", readViewToken(t.replace(/^r\./, "c.")) === null)
    check("a bare id, a changed signature, junk: nothing", readViewToken(`r.${RECIPIENT}`) === null && readViewToken(t.slice(0, -1) + (t.endsWith("0") ? "1" : "0")) === null && readViewToken("../etc") === null && readViewToken(null) === null)
    check("the page's address", viewOnlineUrl({ kind: "campaign", id: CAMPAIGN }) === `https://storelib.com/api/email/view?t=${viewToken({ kind: "campaign", id: CAMPAIGN })}`)
    check("an id that is not a uuid gets no link", viewToken({ kind: "recipient", id: "1" }) === null)
  }

  console.log("\n2. In the email: above it, never through the click counter\n")
  {
    const frame: Frame = {
      subject: "Hello {{first_name}}",
      previewText: "",
      body: `<p>Hi {{first_name}}, <a href="https://example.com/shop">shop</a></p>`,
      sender: { creatorId: CREATOR, userId: USER, name: "Ana", from: "Ana <hello@storelib.com>", replyTo: "ana@example.com", avatarUrl: null, username: "ana", accountEmail: null, planId: null, planStatus: null, blocked: false, brand: { name: "Atelier Ana", logoUrl: null, storeUrl: null, accent: null, address: null } } as never,
      trackOpens: true,
    }
    const msg = messageFor(frame, CAMPAIGN, { id: RECIPIENT, email: "maria@example.com", name: "Maria", subscriber_id: SUBSCRIBER, tracking_token: TRACK } as never, UNSUB)
    const view = viewOnlineUrl({ kind: "recipient", id: RECIPIENT })!
    check("each reader's email links their own copy", msg.html.includes(`href="${view}"`) && msg.html.includes("View in browser"), msg.html.slice(0, 200))
    check("the link sits above the email, before the store's header", msg.html.indexOf("View in browser") < msg.html.indexOf("Atelier Ana"))
    check("and is not rewritten through /api/email/click", !msg.html.includes(`click?u=${Buffer.from(view).toString("base64url")}`))
    check("buildEmail without it draws no line (previews, the page itself)", !buildEmail({ subject: "x", bodyHtml: "<p>x</p>", brand: frame.sender.brand, kind: "marketing" }).includes("View in browser"))
  }

  console.log("\n3. The page: the reader's own copy, no pixel, their unsubscribe link\n")
  {
    const body = "<p>Hi {{first_name}}, new mugs are in.</p>"
    const db = fakeDb({
      campaign_recipients: [{ id: RECIPIENT, campaign_id: CAMPAIGN, name: "Maria", email: "maria@example.com", subscriber_id: SUBSCRIBER, tracking_token: TRACK }],
      subscribers: [{ id: SUBSCRIBER, unsubscribe_token: UNSUB }],
      email_campaigns: [
        { id: CAMPAIGN, creator_id: CREATOR, subject: "New mugs, {{first_name}}", preview_text: "", body, status: "sent", from_name: null, rendered_html: "<html>kept copy</html>" },
        { id: DRAFT, creator_id: CREATOR, subject: "Draft", preview_text: "", body, status: "draft", from_name: null },
      ],
      creators: [{ id: CREATOR, user_id: USER, support_email: "ana@example.com", slug: "ana", headline: null }],
      profiles: [{ id: USER, email: "ana@example.com", display_name: "Ana", username: "ana", avatar_url: null }],
      store_settings: [],
      store_theme_settings: [],
    })
    const mine = await renderViewOnline(db, viewToken({ kind: "recipient", id: RECIPIENT }))
    check("a reader's link opens their copy", mine.ok)
    if (mine.ok) {
      check("  with their name in it", mine.html.includes("Hi Maria") && mine.subject.includes("New mugs"), mine.html.match(/Hi [^,<]*/)?.[0])
      check("  and their own unsubscribe link, which works from here", mine.html.includes(UNSUB))
      check("  no open pixel, no click counter", !mine.html.includes("/api/email/track") && !mine.html.includes("/api/email/click"))
      check("  no View in browser line on the page itself", !mine.html.includes("View in browser"))
    }
    const own = await renderViewOnline(db, viewToken({ kind: "campaign", id: CAMPAIGN }))
    check("the campaign's own link draws the copy kept when it was sent", own.ok && own.html === "<html>kept copy</html>")
    const draft = await renderViewOnline(db, viewToken({ kind: "campaign", id: DRAFT }))
    check("a draft has no page", !draft.ok)
    check("a forged token has no page", !(await renderViewOnline(db, `r.${RECIPIENT}.${"0".repeat(32)}`)).ok)
    const touched = (db as any).log.filter((e: any) => e.op !== "select")
    check("viewing writes nothing: no open recorded", touched.length === 0, touched)

    const scheduled = fakeDb({
      email_campaigns: [{ id: CAMPAIGN, creator_id: CREATOR, subject: "Soon", preview_text: "", body, status: "scheduled", from_name: null }],
      creators: [{ id: CREATOR, user_id: USER, support_email: "ana@example.com", slug: "ana", headline: null }],
      profiles: [{ id: USER, email: "ana@example.com", display_name: "Ana", username: "ana", avatar_url: null }],
      store_settings: [],
      store_theme_settings: [],
    })
    const soon = await renderViewOnline(scheduled, viewToken({ kind: "campaign", id: CAMPAIGN }))
    check("a scheduled email's page draws it as it will go, with the generic unsubscribe page", soon.ok && soon.html.includes("new mugs are in") && soon.html.includes("/unsubscribe"), soon.ok ? undefined : soon)
  }

  console.log("\n4. The route and the owner's page\n")
  {
    const route = read("app/api/email/view/route.ts")
    check("never indexed, never shared-cached, no referrer, no script", /"X-Robots-Tag": "noindex, nofollow"/.test(route) && /"Cache-Control": "private, no-store"/.test(route) && /"Referrer-Policy": "no-referrer"/.test(route) && /default-src 'none'/.test(route) && !/script-src [^']*'self'/.test(route))
    check("the email's report gives the scheduled or sent email's page", /view_url: status === "draft" \? null : viewOnlineUrl\(\{ kind: "campaign", id: c\.id \}\)/.test(read("app/api/email/campaigns/[id]/report/route.ts")))
    check("the email's page in Emails opens it", /tt\("View in browser"\)/.test(read("app/app/emails/email-detail.tsx")) && /report\?\.view_url/.test(read("app/app/emails/email-detail.tsx")))
  }

  console.log(`\n${passed} passed, ${failed} failed\n`)
  if (failed) process.exit(1)
}

void main().catch((e) => {
  console.error(e)
  process.exit(1)
})
