/**
 * THE NOTIFICATION ENGINE'S UNSUBSCRIBE LINK, AND THE PREFERENCES BEHIND IT
 *
 *   1. A token signed for a person and a category verifies to exactly that,
 *      with NOTIFY_UNSUBSCRIBE_SECRET or, without it, EMAIL_LINK_SECRET.
 *   2. A token changed in any part (payload, signature, category) is
 *      refused, and so is one signed with another key.
 *   3. Security, account and payouts and payments are never signed, and a
 *      token naming one is refused even with a valid signature.
 *   4. The route reads the RFC 8058 one-click POST (form body
 *      "List-Unsubscribe=One-Click", token in the query) as an unsubscribe
 *      whatever else it carries, JSON as {token, action}, and the page's
 *      own button as a form.
 *   5. The page names the category, never an address, and escapes what it
 *      prints.
 *   6. The preferences route refuses a change to a required category, and
 *      a required category reads on whatever is stored.
 */
import { createHmac } from "node:crypto"

import { readCode } from "./_source"
import { signUnsubscribe, signWith, unsubscribeUrl, verifyUnsubscribe, verifyWith } from "@/lib/notify/unsubscribe"
import { page, pageWords, readRequest } from "@/lib/notify/unsubscribe-page"
import { CATEGORY_INFO, REQUIRED_CATEGORIES, UNSUBSCRIBABLE, parseChanges, preferencesView } from "@/lib/notify/preference-view"

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
const throws = (fn: () => unknown) => {
  try {
    fn()
    return false
  } catch {
    return true
  }
}

const KEY = "a-notify-unsubscribe-key-long-enough"
const USER = "5b0c1d2e-3f40-4a5b-8c6d-7e8f90a1b2c3"

async function main() {
  console.log("\nSigned and verified")
  {
    const token = signWith(KEY, USER, "sales", 1_790_000_000)
    const ok = verifyWith(KEY, token)
    check("a token verifies to its person and category", ok?.userId === USER && ok?.category === "sales" && ok?.issuedAt === 1_790_000_000, ok)
    check("the token is two base64url parts, nothing else", /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token), token)
    check("it carries no email address", !Buffer.from(token.split(".")[0], "base64url").toString().includes("@"))
    check("another key does not verify it", verifyWith("some-other-key-that-is-long", token) === null)
    check("a key under 16 characters signs nothing", throws(() => signWith("short", USER, "sales")))
    check("and verifies nothing", verifyWith("short", token) === null)
    for (const c of UNSUBSCRIBABLE) check(`${c} can be signed`, verifyWith(KEY, signWith(KEY, USER, c))?.category === c)

    process.env.NOTIFY_UNSUBSCRIBE_SECRET = ""
    process.env.EMAIL_LINK_SECRET = "the-email-link-secret-fallback"
    const viaFallback = signUnsubscribe(USER, "lifecycle")
    check("without NOTIFY_UNSUBSCRIBE_SECRET, EMAIL_LINK_SECRET signs", verifyUnsubscribe(viaFallback)?.category === "lifecycle")
    process.env.NOTIFY_UNSUBSCRIBE_SECRET = KEY
    check("NOTIFY_UNSUBSCRIBE_SECRET wins when it is set", verifyUnsubscribe(viaFallback) === null && verifyUnsubscribe(signUnsubscribe(USER, "tips"))?.category === "tips")
    const url = unsubscribeUrl(USER, "marketing")
    check("the link is the canonical host's unsubscribe route", /^https:\/\/[^/]+\/api\/notify\/unsubscribe\?token=[A-Za-z0-9_.%-]+$/.test(url), url)
    process.env.NOTIFY_UNSUBSCRIBE_SECRET = ""
    process.env.EMAIL_LINK_SECRET = ""
    check("with no key at all the link is the settings page, and nothing throws", /\/app\/settings\?tab=(notifications|privacy#notifications)$/.test(unsubscribeUrl(USER, "sales")), unsubscribeUrl(USER, "sales"))
    check("and nothing verifies", verifyUnsubscribe(viaFallback) === null)
    process.env.NOTIFY_UNSUBSCRIBE_SECRET = KEY
  }

  console.log("\nTampered with, refused")
  {
    const token = signWith(KEY, USER, "sales", 1_790_000_000)
    const [payload, sig] = token.split(".")
    const other = Buffer.from(`${USER}.marketing.1790000000`).toString("base64url")
    check("a payload swapped for another category", verifyWith(KEY, `${other}.${sig}`) === null)
    const flipped = Buffer.from(sig, "base64url")
    flipped[0] ^= 1
    check("a signature with one bit changed", verifyWith(KEY, `${payload}.${flipped.toString("base64url")}`) === null)
    check("a signature cut short", verifyWith(KEY, `${payload}.${sig.slice(0, 20)}`) === null)
    check("a third part added", verifyWith(KEY, `${token}.x`) === null)
    check("no signature", verifyWith(KEY, payload) === null && verifyWith(KEY, `${payload}.`) === null)
    check("not a string, empty, or far too long", verifyWith(KEY, null) === null && verifyWith(KEY, "") === null && verifyWith(KEY, "a".repeat(500)) === null)
    check("a different user in the payload", verifyWith(KEY, `${Buffer.from(`${USER.replace("5b", "6b")}.sales.1790000000`).toString("base64url")}.${sig}`) === null)
  }

  console.log("\nWhat is always sent can never be unsubscribed from")
  {
    for (const c of ["security", "account", "payouts_and_payments"] as const) {
      check(`${c} is refused when signing`, throws(() => signWith(KEY, USER, c)))
      /* Signed by hand with the right key, the way a leaked key would. */
      const k = createHmac("sha256", KEY).update("storelib.notify-unsubscribe.v1").digest()
      const p = `${USER}.${c}.1790000000`
      const forged = `${Buffer.from(p).toString("base64url")}.${createHmac("sha256", k).update(p).digest("base64url")}`
      check(`${c} with a valid signature is still refused`, verifyWith(KEY, forged) === null)
    }
    check("the required categories are exactly those three", REQUIRED_CATEGORIES.slice().sort().join() === "account,payouts_and_payments,security")
    check("and none of them is unsubscribable", REQUIRED_CATEGORIES.every((c) => !UNSUBSCRIBABLE.includes(c)))
    const inTheFuture = `${USER}.sales.${Math.floor(Date.now() / 1000) + 10 * 86_400}`
    const k = createHmac("sha256", KEY).update("storelib.notify-unsubscribe.v1").digest()
    check("a token dated days ahead was not made here", verifyWith(KEY, `${Buffer.from(inTheFuture).toString("base64url")}.${createHmac("sha256", k).update(inTheFuture).digest("base64url")}`) === null)
  }

  console.log("\nThe requests the route reads")
  {
    const token = signWith(KEY, USER, "sales")
    const oneClick = await readRequest(
      new Request(`https://storelib.com/api/notify/unsubscribe?token=${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "List-Unsubscribe=One-Click",
      }),
    )
    check("RFC 8058: a one-click POST with the token in the query", oneClick.mode === "one_click" && oneClick.token === token && oneClick.action === "unsubscribe", oneClick)
    const sneaky = await readRequest(
      new Request(`https://storelib.com/api/notify/unsubscribe?token=${token}`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "List-Unsubscribe=One-Click&action=resubscribe",
      }),
    )
    check("a one-click request only ever unsubscribes", sneaky.action === "unsubscribe")
    const json = await readRequest(
      new Request("https://storelib.com/api/notify/unsubscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, action: "resubscribe" }) }),
    )
    check("JSON {token, action}", json.mode === "json" && json.token === token && json.action === "resubscribe")
    const bad = await readRequest(new Request("https://storelib.com/api/notify/unsubscribe", { method: "POST", headers: { "content-type": "application/json" }, body: "{not json" }))
    check("JSON that is not JSON is no token, not a crash", bad.token === null && bad.action === "unsubscribe")
    const form = await readRequest(
      new Request("https://storelib.com/api/notify/unsubscribe", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token, action: "resubscribe" }).toString(),
      }),
    )
    check("the page's own button, as a form", form.mode === "form" && form.token === token && form.action === "resubscribe")

    const route = readCode("app/api/notify/unsubscribe/route.ts")
    check("both handlers are there", /export async function GET\(/.test(route) && /export async function POST\(/.test(route))
    /* Mail scanners open every link: opening it only asks, the button (a POST) turns the emails off. */
    const getBody = route.slice(route.indexOf("export async function GET("), route.indexOf("export async function POST("))
    check("opening the link changes nothing: it asks first", !/apply\(/.test(getBody) && /kind: "confirm"/.test(getBody))
    check("and the question's button turns them off", pageWords({ kind: "confirm", emails: "sale emails", token: "t", preferencesUrl: "/" }).button?.action === "unsubscribe")
    check("the write is setPreference, email only, from the unsubscribe link", /setPreference\(createAdminClient\(\), userId, category, "email", action === "resubscribe", "unsubscribe_link"\)/.test(route))
    check("limited per address, both ways in", (route.match(/await rateLimit\(\{ bucket: "notify-unsubscribe", subjects: \[addressSubject\(request\)\]/g) ?? []).length === 2)
    check("a one-click answer is a plain 200 with nothing to read", /req\.mode === "one_click" \? \{ ok: true \}/.test(route))
    check("the answers are never cached or indexed", /"Cache-Control": "no-store"/.test(route) && /"X-Robots-Tag": "noindex"/.test(route))
    check("no address is looked up or answered", !/email_address|recipientOf|\.from\("profiles"\)|maskEmail/.test(route))
  }

  console.log("\nThe page")
  {
    const off = page({ kind: "off", emails: "sale emails", token: "t.k", preferencesUrl: "https://storelib.com/app/settings?tab=privacy#notifications" })
    check("it says which emails were turned off", /<h1[^>]*>Sale emails are off<\/h1>/.test(off))
    check("with one button to turn them back on, posting the token", /name="action" value="resubscribe"/.test(off) && /Turn them back on/.test(off) && /name="token" value="t\.k"/.test(off))
    check("and a link to every setting", /href="https:\/\/storelib\.com\/app\/settings\?tab=privacy#notifications">All notification settings/.test(off))
    check("no address anywhere on it", !/@/.test(off.replace(/@media/g, "")))
    check("not indexed, no referrer", /name="robots" content="noindex"/.test(off) && /name="referrer" content="no-referrer"/.test(off))
    const hostile = page({ kind: "off", emails: "sale emails", token: '"><script>alert(1)</script>', preferencesUrl: "https://storelib.com/x" })
    check("what it prints is escaped", !/<script>alert/.test(hostile) && /&quot;&gt;&lt;script&gt;/.test(hostile))
    check("turned back on, the button turns them off again", pageWords({ kind: "on", emails: "sale emails", token: "t", preferencesUrl: "/" }).button?.action === "unsubscribe")
    check("a broken link has no button", pageWords({ kind: "invalid", preferencesUrl: "/" }).button === undefined)
    const words = CATEGORY_INFO.filter((c) => !c.required).map((c) => pageWords({ kind: "off", emails: c.emails, token: "t", preferencesUrl: "/" }).title)
    check("every optional category reads as a sentence", words.every((w) => /^[A-Z][a-z].* are off$/.test(w)), words)
    const confirm = page({ kind: "confirm", emails: "sale emails", token: "t.k", preferencesUrl: "https://storelib.com/app/settings?tab=notifications" })
    check("the question is the shared card, drawn with the Storelib mark and name", /class="sender"[\s\S]*<svg class="mark"[\s\S]*<p class="sender-name">Storelib<\/p>/.test(confirm))
    check("its button is the primary, a plain form POST that works with no JavaScript", /<form method="post" action="\/api\/notify\/unsubscribe">[\s\S]*name="action" value="unsubscribe"[\s\S]*class="btn btn-primary">Turn them off</.test(confirm) && !/<script/i.test(confirm))
    check("after it, turning them back on is the quieter secondary", /class="btn btn-secondary">Turn them back on</.test(off))
    check("the result is announced; the question is not", /role="status" aria-live="polite"/.test(off) && !/aria-live/.test(confirm) && /role="alert"/.test(page({ kind: "error", preferencesUrl: "/" })))
    check("every state draws, with the settings link and no button where there is nothing to do", (["invalid", "limited", "error"] as const).every((kind) => { const p = page({ kind, preferencesUrl: "/s" }); return /All notification settings/.test(p) && !/<form/.test(p) }))
    check("dark when the device is dark, from nothing but its own styles", /@media \(prefers-color-scheme: dark\)/.test(off) && /name="color-scheme" content="light dark"/.test(off) && !/<link[^>]+stylesheet|src="http/i.test(off))
    const copy = [off, ...words].join(" ")
    check("plain words, no dashes", !copy.includes("—") && !/\b(unlock|seamless|effortless)\b/i.test(copy))
  }

  console.log("\nThe preferences behind the settings")
  {
    const view = preferencesView([
      { category: "sales", channel: "email", enabled: false, updatedAt: "2026-09-20T10:00:00Z" },
      { category: "security", channel: "email", enabled: false, updatedAt: "2026-09-20T10:00:00Z" },
    ])
    const row = (c: string) => view.find((v) => v.category === c)!
    check("eight categories, in the settings order", view.map((v) => v.label).join() === "Sales,Payouts and payments,Product and store,Account,Security,Tips and ideas,Onboarding reminders,Storelib news")
    check("a stored choice is read, with when it was made", row("sales").channels.email.enabled === false && row("sales").channels.email.updatedAt === "2026-09-20T10:00:00Z")
    check("no row is the default: sales in app on", row("sales").channels.in_app.enabled === true && row("sales").channels.in_app.updatedAt === null)
    check("a required category is on whatever is stored", row("security").required && row("security").channels.email.enabled === true)
    check("marketing email waits for a yes", row("marketing").channels.email.enabled === false && row("tips").channels.email.enabled === false)
    const refused = parseChanges({ category: "security", channel: "email", enabled: false })
    check("a change to a required category is refused with the reason", "error" in refused && /always sent/.test(refused.error), refused)
    check("so is one to payouts and payments inside a batch", "error" in parseChanges({ changes: [{ category: "sales", channel: "email", enabled: false }, { category: "payouts_and_payments", channel: "in_app", enabled: false }] }))
    check("an unknown category or channel is refused", "error" in parseChanges({ category: "nope", channel: "email", enabled: false }) && "error" in parseChanges({ category: "sales", channel: "sms", enabled: false }))
    check("a value that is not true or false is refused", "error" in parseChanges({ category: "sales", channel: "email", enabled: "no" }))
    const one = parseChanges({ category: "sales", channel: "email", enabled: false })
    check("one change reads as one", "changes" in one && one.changes.length === 1 && one.changes[0].enabled === false)

    const route = readCode("app/api/notifications/preferences/route.ts")
    check("the route asks who it is with the person's own session", /readCurrentUser\(supabase\)/.test(route) && /createClient\(\)/.test(route))
    check("and writes through preferences.ts with the source settings", /setPreference\(db, current\.user\.id, c\.category, c\.channel, c\.enabled, "settings"\)/.test(route))
    check("the body is checked before anything is written", route.indexOf("parseChanges(body)") < route.indexOf("setPreference("))

    const form = readCode("components/app/settings-form-new.tsx")
    check("Settings has a Notifications tab, and ?tab=notifications opens it", /id: "notifications", label: "Notifications"/.test(form) && /TAB_IDS: TabId\[\] = \[[^\]]*"notifications"/.test(form) && /activeTab === "notifications" && <NotificationPreferencesPanel \/>/.test(form))
    check("an older ?tab=privacy#notifications link lands on it too", /tab === "privacy" && window\.location\.hash === "#notifications"/.test(form))
    const panel = readCode("components/app/settings/notification-preferences.tsx")
    check("the panel reads and writes the route", /fetch\("\/api\/notifications\/preferences", \{ cache: "no-store" \}\)/.test(panel) && /method: "PUT"/.test(panel))
    check("a required category says Always on, with no switch", /row\.required \? \([\s\S]{0,200}Always on/.test(panel) && /\{REQUIRED_WHY\}/.test(panel))
    check("sales email is every sale or off", /<option value="every">Every sale<\/option>/.test(panel) && /<option value="off">Off<\/option>/.test(panel))
    check("a failed save goes back to what was saved and says so", /show\(category, channel, confirmed\.current\.get\(cell\) \?\? !enabled\)/.test(panel) && /role="alert"/.test(panel))
    check("an older answer arriving late changes nothing", /if \(latest\.current\.get\(cell\) !== id\) return/.test(panel))
    check("rows are 48px or taller", /<li className="flex min-h-12/.test(panel))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

void main()
