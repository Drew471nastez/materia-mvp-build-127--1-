/**
 * LEAVING A CREATOR'S LIST, AND THE CARD BOTH UNSUBSCRIBE PAGES SHARE
 *
 *   1. Opening the link changes nothing: /unsubscribe and the GET of
 *      /api/email/unsubscribe only read, and ask first. Mail scanners open
 *      every link in an email.
 *   2. The page's button is a plain form POST to /api/email/unsubscribe,
 *      which answers with the page in its new state; the RFC 8058 one-click
 *      and the JSON request are unchanged, and every unsubscribe still sets
 *      the status, ends the automations and records the event.
 *   3. Each state draws: confirm, off, already, on, invalid, limited, error.
 *   4. The sender is the creator: an https picture or the first letter in a
 *      neutral circle, never a picture from anywhere else, and the address
 *      is only ever shown masked.
 *   5. The card: no script, no outside stylesheet or font, dark mode, 44px
 *      buttons, a keyboard ring, the result announced, everything escaped.
 */
import { readCode } from "./_source"
import { maskEmail, subscriberPage, subscriberPageWords, type SubscriberPageState } from "@/lib/subscriber-unsubscribe-page"
import { unsubscribeCard } from "@/lib/unsubscribe-card"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    const d = detail === undefined ? "" : `: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`
    failures.push(label + d)
    console.log(`  FAIL  ${label}${d}`)
  }
}

const sender = { name: "Maya's Studio", imageUrl: null }
const shown = { token: "tok-1", sender, maskedEmail: "j***n@example.com" }
const ALL: SubscriberPageState[] = [
  { kind: "confirm", ...shown },
  { kind: "off", ...shown },
  { kind: "already", ...shown },
  { kind: "on", ...shown },
  { kind: "invalid" },
  { kind: "limited" },
  { kind: "error", token: "tok-1", sender, action: "unsubscribe" },
]

console.log("\nOpening the link only asks")
{
  const route = readCode("app/api/email/unsubscribe/route.ts")
  const get = route.slice(route.indexOf("export async function GET("), route.indexOf("export async function POST("))
  check("the API GET answers the shared page and writes nothing", /answerUnsubscribeLink\(request\)/.test(get) && !/\.update\(|\.insert\(|endAutomations/.test(get))
  const page = readCode("app/unsubscribe/route.ts")
  check("/unsubscribe is the same page, with no script to run", /answerUnsubscribeLink\(request\)/.test(page) && !/fetch\(/.test(page))
  const server = readCode("lib/subscriber-unsubscribe-server.ts")
  const answer = server.slice(server.indexOf("export async function answerUnsubscribeLink("))
  check("the GET reads the token and never writes", /\.eq\("unsubscribe_token", token\)/.test(answer) && !/\.update\(|\.insert\(|\.delete\(/.test(answer))
  check("still on the list, it asks; already off, it says so", /subscriber\.status === "unsubscribed" \? "already" : "confirm"/.test(answer))
  check("limited per address, and the answers are never cached or indexed", /rateLimit\(\{ bucket: "subscriber-unsubscribe-page", subjects: \[addressSubject\(request\)\]/.test(server) && /"Cache-Control": "no-store"/.test(server) && /"X-Robots-Tag": "noindex"/.test(server))
  check("the sender is read as the creator is now", /loadBrand\(db, creatorId\)/.test(server) && /brand\.logoUrl \?\? brand\.avatarUrl/.test(server))
}

console.log("\nThe button is the POST, and the POST still does everything")
{
  const route = readCode("app/api/email/unsubscribe/route.ts")
  const post = route.slice(route.indexOf("export async function POST("))
  check("RFC 8058 one-click still only ever unsubscribes", /form\.get\("List-Unsubscribe"\) === "One-Click"\) action = "unsubscribe"/.test(post))
  check("the page's form (token and action fields) is read as the page", /else if \(form\.has\("token"\)\)[\s\S]{0,80}fromPage = true/.test(post))
  check("and answered with the page, not JSON", /if \(fromPage\) return pageResponse\(\{ kind: "on"/.test(post) && /return pageResponse\(\{ kind: "off"/.test(post))
  check("JSON callers still get JSON", /NextResponse\.json\(\{ success: true, message: "Unsubscribed successfully" \}\)/.test(post) && /NextResponse\.json\(\{ success: true, message: "Resubscribed successfully" \}\)/.test(post))
  check("an unsubscribe sets the status, ends the automations, records the event", /status: "unsubscribed",\s*is_active: false,\s*unsubscribed_at: now/.test(post) && /await endAutomations\(adminSupabase, subscriber\)/.test(post) && (post.match(/event_type: "unsubscribed"/g) ?? []).length === 2)
  check("the page's unsubscribe is recorded as a link click against the latest campaign", /method: "link_click"/.test(post) && /\.from\("email_campaigns"\)/.test(post))
  check("a resubscribe keeps unsubscribed_at", /status: "subscribed",\s*is_active: true,\s*\}/.test(post.replace(/\/\/.*$/gm, "")))
  check("a failed write answers the error page with the same action to try again", /pageResponse\(\{ kind: "error", token, sender, action: pageAction \}, 500\)/.test(post))
}

console.log("\nEvery state")
{
  for (const state of ALL) {
    const html = subscriberPage(state)
    const words = subscriberPageWords(state)
    check(`${state.kind} draws its heading and line`, html.includes(`>${words.heading.replace(/'/g, "&#39;")}</h1>`) && html.includes(words.body.replace(/'/g, "&#39;")), words)
  }
  const confirm = subscriberPage(ALL[0])
  check("confirm asks, naming the store, with Unsubscribe as the primary", /Unsubscribe from Maya&#39;s Studio\?/.test(confirm) && /name="action" value="unsubscribe"[\s\S]*class="btn btn-primary">Unsubscribe</.test(confirm))
  check("the button posts the token to the route as a plain form", /<form method="post" action="\/api\/email\/unsubscribe">\s*<input type="hidden" name="token" value="tok-1">/.test(confirm))
  const off = subscriberPage(ALL[1])
  check("after it, a calm confirmation with Resubscribe as the secondary", /You are unsubscribed/.test(off) && /name="action" value="resubscribe"[\s\S]*class="btn btn-secondary">Resubscribe</.test(off) && /badge-done/.test(off))
  check("back on, Unsubscribe is there again, quietly", /name="action" value="unsubscribe"[\s\S]*btn-secondary">Unsubscribe</.test(subscriberPage(ALL[3])))
  check("a link that does not work, or too many tries, has no button", !/<form/.test(subscriberPage({ kind: "invalid" })) && !/<form/.test(subscriberPage({ kind: "limited" })))
  check("a failed write offers the same action again", /name="action" value="unsubscribe"[\s\S]*Try again/.test(subscriberPage(ALL[6])))
  check("the result is announced; the question is not", /role="status" aria-live="polite"/.test(off) && !/aria-live/.test(confirm) && /role="alert"/.test(subscriberPage({ kind: "invalid" })))
  const copy = ALL.map((s) => { const w = subscriberPageWords(s); return `${w.heading} ${w.body} ${w.button?.label ?? ""}` }).join(" ")
  check("plain words, no dashes", !/[—–]/.test(copy) && !/\b(unlock|seamless|effortless|journey)\b/i.test(copy))
}

console.log("\nThe sender, and the address")
{
  const withPicture = subscriberPage({ kind: "confirm", ...shown, sender: { name: "Northwind", imageUrl: "https://cdn.example.com/logo.png" } })
  check("an https picture is drawn, with the letter behind it if it does not load", /<img class="avatar" src="https:\/\/cdn\.example\.com\/logo\.png" alt=""[^>]*data-initial="N"/.test(withPicture))
  const plain = subscriberPage({ kind: "confirm", ...shown, sender: { name: "northwind", imageUrl: "http://cdn.example.com/logo.png" } })
  check("anything but https is not, and the first letter stands in", !/<img/.test(plain) && /avatar-initial" aria-hidden="true">N</.test(plain))
  check("a javascript: picture is never drawn", !/javascript:/i.test(subscriberPage({ kind: "confirm", ...shown, sender: { name: "x", imageUrl: "javascript:alert(1)" } })))
  check("with no sender known, a plain envelope and never Storelib's mark", /class="envelope"/.test(subscriberPage({ kind: "invalid" })) && !/class="mark"/.test(subscriberPage({ kind: "invalid" })))
  check("the address is masked", maskEmail("jordan@example.com") === "j***n@example.com" && maskEmail("jo@example.com") === "***@example.com" && maskEmail("nope") === "***")
  const pages = ALL.map(subscriberPage).join("")
  check("no whole address anywhere", !/[a-z0-9]{2,}@/i.test(pages.replace(/@media/g, "")))
}

console.log("\nThe card")
{
  const hostile = subscriberPage({ kind: "confirm", token: '"><script>alert(1)</script>', sender: { name: "<b>Evil</b>", imageUrl: 'https://x.test/"onerror="alert(1)' }, maskedEmail: "<i>" })
  check("everything it prints is escaped", !/<script>alert|<b>Evil|<i>|"onerror="/.test(hostile) && /&lt;b&gt;Evil/.test(hostile))
  for (const [name, html] of [["a creator's", subscriberPage(ALL[0])], ["Storelib's", unsubscribeCard({ title: "t", sender: { kind: "storelib" }, tone: "done", heading: "h", body: "b" })]] as const) {
    check(`${name}: no script, no outside stylesheet or font`, !/<script/i.test(html) && !/<link/i.test(html) && !/@import|url\(http/i.test(html))
    check(`${name}: dark when the device is dark`, /@media \(prefers-color-scheme: dark\)/.test(html) && /name="color-scheme" content="light dark"/.test(html))
    check(`${name}: phone first, a 16px gutter and a 440px card`, /name="viewport" content="width=device-width, initial-scale=1/.test(html) && /padding: 32px 16px/.test(html) && /max-width: 440px/.test(html) && /overflow-x: hidden/.test(html))
    check(`${name}: buttons 44px or taller, with a keyboard ring`, /min-height: 44px/.test(html) && /\.btn:focus-visible, a:focus-visible \{ outline: 2px solid/.test(html))
    check(`${name}: labelled by its heading, not indexed, no referrer`, /<main aria-labelledby="heading">/.test(html) && /<h1 id="heading">/.test(html) && /name="robots" content="noindex"/.test(html) && /name="referrer" content="no-referrer"/.test(html))
  }
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
