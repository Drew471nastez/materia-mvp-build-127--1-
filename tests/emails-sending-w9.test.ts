/**
 * Wave 9, emails: every email a store sends goes From its own address once
 * its sending domain is verified, and Storelib's address otherwise; the
 * domain is checked again without a press; the email platforms hear of a
 * new subscriber or an unsubscribe within the minute, also when physical
 * commerce is switched off. Nothing real is called: Mailgun is a stub of
 * its API shape, the store's own sender is a stub lookup, the database is
 * tests/fake-supabase.
 *
 *   node scripts/run-push-tests.mjs   (this suite is in SUITES)
 */
import "./_mailgun-env"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { FakeSupabase } from "./fake-supabase"
import { asOwnSender, fromName, hostOf, ownFrom } from "@/lib/emails/sending-domain"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 700)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

/* ── Mailgun, stubbed ──────────────────────────────────────────────────── */

type Call = { method: string; url: string; path: string; form: FormData | URLSearchParams | null }
let calls: Call[] = []
const realHost: string[] = []
const mgDomains = new Map<string, { state: string }>()
globalThis.fetch = (async (input: any, init: any = {}) => {
  const url = typeof input === "string" ? input : input.url
  const u = new URL(url)
  if (u.origin !== "https://mailgun.test") {
    realHost.push(url)
    throw new Error(`a real address was called: ${url}`)
  }
  const c: Call = { method: init.method ?? "GET", url, path: u.pathname, form: init.body ?? null }
  calls.push(c)
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
  if (/\/(bounces|complaints)\//.test(c.path)) return json(404, { message: "not found" })
  if (c.method === "POST" && /^\/v3\/[^/]+\/messages$/.test(c.path)) return json(200, { id: "<m1@x>", message: "Queued." })
  const verify = /^\/v4\/domains\/([^/]+)\/verify$/.exec(c.path)
  if (c.method === "PUT" && verify) {
    const d = mgDomains.get(verify[1])
    if (!d) return json(404, { message: "Domain not found" })
    const v = d.state === "active" ? "valid" : "invalid"
    return json(200, { domain: { name: verify[1], state: d.state }, sending_dns_records: [{ record_type: "TXT", valid: v, name: verify[1], value: "v=spf1 include:mailgun.org ~all" }, { record_type: "TXT", valid: v, name: `pic._domainkey.${verify[1]}`, value: "k=rsa; p=X" }] })
  }
  return json(404, { message: "not stubbed" })
}) as typeof fetch

const CREATOR = "11111111-1111-4111-8111-111111111111"
const NOW = Date.parse("2026-11-10T12:00:00.000Z")

async function main() {
  const { storeSender, withStoreSender, sendMailgunOnce, sendMailgunEmail, storelibFromAddress, buildMailgunFromHeader } = await import("@/lib/mailgun")
  const { sendEmail } = await import("@/lib/mail")

  console.log("\n1. Which address an email comes from\n")
  {
    check("fromName reads the display name, quoted or not", fromName("Ana <a@b.co>") === "Ana" && fromName('"Ana, Studio" <a@b.co>') === "Ana, Studio" && fromName("a@b.co") === "")
    check("no verified domain: the From is left exactly as asked", JSON.stringify(asOwnSender("Ana <noreply@storelib.com>", null)) === JSON.stringify({ from: "Ana <noreply@storelib.com>" }))
    const own = asOwnSender('"Ana, Studio" <noreply@storelib.com>', { address: "hello@mail.shop.com", domain: "mail.shop.com" })
    check("verified: the store's name kept, its own address, through its own domain", own.from === ownFrom("Ana, Studio", "hello@mail.shop.com") && own.from === '"Ana, Studio" <hello@mail.shop.com>' && own.sendingDomain === "mail.shop.com", own)
    check("Storelib's own address is the one sends really use (no MAILGUN_FROM_EMAIL here: EMAIL_FROM's)", storelibFromAddress() === "noreply@storelib.com", storelibFromAddress())
  }

  console.log("\n2. A send for a store (lib/mailgun.ts `store`)\n")
  {
    const asked: string[] = []
    let answer: { address: string; domain: string } | null = { address: "hello@mail.shop.com", domain: "mail.shop.com" }
    storeSender.lookup = async (id) => {
      asked.push(id)
      return answer
    }
    const r = await withStoreSender({ to: "a@b.co", subject: "s", html: "h", from: buildMailgunFromHeader("Ana Pop"), store: CREATOR })
    check("withStoreSender: the store asked for, From and domain its own", asked[0] === CREATOR && r.from === "Ana Pop <hello@mail.shop.com>" && r.sendingDomain === "mail.shop.com", r)
    const given = await withStoreSender({ to: "a@b.co", subject: "s", html: "h", sendingDomain: "other.shop.com", store: CREATOR })
    check("  a send that names its domain already is not changed", given.sendingDomain === "other.shop.com" && asked.length === 1)
    const none = await withStoreSender({ to: "a@b.co", subject: "s", html: "h", from: "Ana <noreply@storelib.com>" })
    check("  no store: not looked up, not changed", none.from === "Ana <noreply@storelib.com>" && !none.sendingDomain && asked.length === 1)
    storeSender.lookup = async () => {
      throw new Error("db down")
    }
    const broken = await withStoreSender({ to: "a@b.co", subject: "s", html: "h", from: "Ana <noreply@storelib.com>", store: CREATOR })
    check("  a lookup that fails sends as Storelib's, never throws", broken.from === "Ana <noreply@storelib.com>" && !broken.sendingDomain)

    storeSender.lookup = async () => answer
    calls = []
    const once = await sendMailgunOnce({ to: "reader@example.com", subject: "Hi", html: "<p>Hi</p>", from: buildMailgunFromHeader("Ana Pop"), store: CREATOR })
    const msg = calls.find((c) => /\/messages$/.test(c.path))
    check("sendMailgunOnce with store: /v3/mail.shop.com/messages, From hello@mail.shop.com", once.success && msg?.path === "/v3/mail.shop.com/messages" && String((msg.form as FormData).get("from")) === "Ana Pop <hello@mail.shop.com>", { path: msg?.path })

    calls = []
    const sent = await sendEmail({ to: "reader@example.com", subject: "Your order", html: "<p>Hi</p>", from: buildMailgunFromHeader("Ana Pop"), store: CREATOR })
    const m2 = calls.find((c) => /\/messages$/.test(c.path))
    check("sendEmail (lib/mail.ts) passes store through: own domain, own From", sent.success && m2?.path === "/v3/mail.shop.com/messages" && String((m2.form as FormData).get("from")) === "Ana Pop <hello@mail.shop.com>", { path: m2?.path })
    check("  bounces and complaints looked up on the domain it is sent through", calls.some((c) => c.path.startsWith("/v3/mail.shop.com/bounces/")) && !calls.some((c) => c.path.startsWith("/v3/storelib.com/bounces/")), calls.map((c) => c.path))

    answer = null
    calls = []
    await sendMailgunEmail({ to: "reader@example.com", subject: "Your order", html: "<p>Hi</p>", from: buildMailgunFromHeader("Ana Pop"), store: CREATOR })
    const m3 = calls.find((c) => /\/messages$/.test(c.path))
    check("not verified: Storelib's domain and address, the store's name in front", m3?.path === "/v3/storelib.com/messages" && String((m3.form as FormData).get("from")) === "Ana Pop <noreply@storelib.com>", { path: m3?.path })
  }

  console.log("\n3. Every send a buyer, member or student gets names its store\n")
  {
    const sites: [string, RegExp][] = [
      ["lib/email.tsx", /from: buildFromHeaderLocal\(fromName\),\s*store: creatorId,/],
      ["lib/email.tsx", /store: signer\?\.creatorId \?\? null/],
      ["lib/email.tsx", /ownSendingFor\(admin, creatorId, fromName\)/],
      ["lib/automations/abandoned-reminder.ts", /store: s\.creator_id/],
      ["lib/courses/emails.ts", /store: product\.creator_id/],
      ["lib/physical/jobs-server.ts", /from: buildFromHeader\(shopName\),\s*store: co\.creator_id,\s*to: co\.buyer_email/],
      ["lib/forms/delivery-server.ts", /store: identity\?\.fromName \? job\.owner_id : null/],
      ["lib/communities/server/membership-lifecycle.ts", /store: r\.product\.creator_id/],
      ["app/api/cron/process-scheduled-emails/route.ts", /store: email\.creator_id/],
      ["app/api/email/messages/[id]/reply/route.ts", /store: gate\.creatorId/],
      ["app/api/checkout/site/track/route.ts", /store: site\.creatorId/],
      ["app/api/site-account/code/route.ts", /store: creatorId \?\? null/],
      ["app/api/store/emails/test/route.ts", /store: c\.creatorId/],
      ["app/api/app/community/[id]/emails/test/route.ts", /store: gate\.community\.creator_id/],
      ["lib/email-campaigns/queue.ts", /verifiedSender\(db, creatorId\)/],
      ["lib/automations/run.ts", /verifiedSender\(db, pending\.creatorId\)/],
      ["lib/notify/worker.ts", /verifiedSender\(db, creatorId\)/],
    ]
    for (const [f, re] of sites) check(`  ${f}`, re.test(read(f)))
    const area = read("app/api/email/area/route.ts")
    check("Emails › Settings and the composer say the address mail really leaves from", /fromAddress: own\?\.address \?\? storelibFromAddress\(\)/.test(area) && /ownDomain: !!own/.test(area) && /data-compose-from/.test(read("components/email/compose/composer.tsx")) && /data-sending-from-line/.test(read("app/(storelib)/app/emails/emails-home.tsx")))
  }

  console.log("\n4. The domain checked again without a press\n")
  {
    const { recheckDue, recheckSendingDomains, verifiedSender, forgetSender } = await import("@/lib/emails/sending-domain-server")
    const at = (ms: number) => new Date(NOW - ms).toISOString()
    check("waiting, added today: due after ten minutes", recheckDue({ status: "pending", last_checked_at: at(11 * 60e3), created_at: at(3600e3) }, NOW) && !recheckDue({ status: "pending", last_checked_at: at(5 * 60e3), created_at: at(3600e3) }, NOW))
    check("waiting for days: every six hours; after a month, left for Check DNS", !recheckDue({ status: "pending", last_checked_at: at(3600e3), created_at: at(5 * 86400e3) }, NOW) && recheckDue({ status: "failed", last_checked_at: at(7 * 3600e3), created_at: at(5 * 86400e3) }, NOW) && !recheckDue({ status: "pending", last_checked_at: at(7 * 86400e3), created_at: at(40 * 86400e3) }, NOW))
    check("verified: once a day", recheckDue({ status: "verified", last_checked_at: at(25 * 3600e3), created_at: at(90 * 86400e3) }, NOW) && !recheckDue({ status: "verified", last_checked_at: at(2 * 3600e3), created_at: at(90 * 86400e3) }, NOW))

    const db = new FakeSupabase()
    db.clock = NOW
    db.table("email_sending_domains", { unique: [["creator_id"], ["domain"]] }, [
      { id: "d1", creator_id: CREATOR, domain: "mail.shop.com", from_local: "hello", status: "pending", records: [], last_checked_at: at(20 * 60e3), verified_at: null, last_error: null, created_at: at(3600e3) },
      { id: "d2", creator_id: "22222222-2222-4222-8222-222222222222", domain: "mail.two.com", from_local: "hi", status: "verified", records: [], last_checked_at: at(26 * 3600e3), verified_at: at(30 * 86400e3), last_error: null, created_at: at(40 * 86400e3) },
      { id: "d3", creator_id: "33333333-3333-4333-8333-333333333333", domain: "mail.three.com", from_local: "hi", status: "pending", records: [], last_checked_at: at(60e3), verified_at: null, last_error: null, created_at: at(3600e3) },
    ])
    mgDomains.set("mail.shop.com", { state: "active" })
    mgDomains.set("mail.two.com", { state: "unverified" })
    mgDomains.set("mail.three.com", { state: "active" })
    calls = []
    const txt = async () => [["v=DMARC1; p=none;"]]
    const n = await recheckSendingDomains(db, { now: NOW, txt })
    const rows = db.rows("email_sending_domains")
    const one = rows.find((r) => r.id === "d1")
    const two = rows.find((r) => r.id === "d2")
    const three = rows.find((r) => r.id === "d3")
    check("the cron's look: the due ones checked with Mailgun, the one checked a minute ago left", n === 2 && calls.filter((c) => c.method === "PUT").length === 2 && three?.status === "pending", { n, calls: calls.map((c) => c.path) })
    check("  records now in place: verified, and its mail goes From it", one?.status === "verified" && !!one.verified_at)
    forgetSender(CREATOR)
    check("  verifiedSender answers the store's own address", (await verifiedSender(db, CREATOR, NOW + 5))?.address === "hello@mail.shop.com")
    check("  records taken away from a verified domain: failed, mail back to Storelib's address", two?.status === "failed" && (await verifiedSender(db, "22222222-2222-4222-8222-222222222222", NOW + 5)) === null)
    mgDomains.set("mail.two.com", { state: "unverified" })
    two!.last_checked_at = at(25 * 3600e3)
    await recheckSendingDomains(db, { now: NOW + 60e3, txt })
    check("  a failed domain checked again and still missing stays failed (not back to waiting)", db.rows("email_sending_domains").find((r) => r.id === "d2")?.status === "failed")
    const cron = read("app/api/cron/physical/route.ts")
    check("the cron runs it before the physical commerce switch", cron.indexOf("recheckSendingDomains(db)") > 0 && cron.indexOf("recheckSendingDomains(db)") < cron.indexOf("if (!(await isPhysicalCommerceEnabled()))"))
  }

  console.log("\n5. Email platforms, within the minute\n")
  {
    const cron = read("app/api/cron/physical/route.ts")
    const gate = cron.indexOf("if (!(await isPhysicalCommerceEnabled()))")
    const off = cron.slice(gate, cron.indexOf("const { data: expired"))
    check("physical commerce off: the quarter hour sync is still scheduled and the queue run", /scheduleMarketingSyncs\(db\)/.test(off) && /runJobs\(db, 25\)/.test(off))
    const { queueMarketingSignup } = await import("@/lib/integrations/marketing/sync-server")
    const db = new FakeSupabase()
    db.clock = NOW
    db.table("commerce_integrations", {}, [
      { id: "i1", creator_id: CREATOR, provider: "brevo", status: "connected", config: {} },
      { id: "i2", creator_id: CREATOR, provider: "klaviyo", status: "connected", config: {} },
      { id: "i3", creator_id: CREATOR, provider: "kit", status: "disconnected", config: {} },
    ])
    db.table("commerce_jobs", { unique: [["idempotency_key"]], defaults: () => ({ status: "queued", attempts: 0 }) })
    const a = await queueMarketingSignup(db, CREATOR, NOW)
    const again = await queueMarketingSignup(db, CREATOR, NOW + 5_000)
    const later = await queueMarketingSignup(db, CREATOR, NOW + 20_000)
    check("a new subscriber: a sync queued for each connected platform, none for a disconnected one", a === 2 && db.rows("commerce_jobs").every((j) => j.kind === "marketing_sync" && ["brevo", "klaviyo"].includes(j.payload.provider)))
    check("  signups at once are one sync; one twenty seconds later gets its own (not the next quarter hour)", again === 0 && later === 2, { again, later })
    for (const [f, re] of [
      ["app/api/email/area/route.ts", /syncPlatformsSoon\(gate\.db, gate\.creatorId\)/],
      ["app/api/contacts/[key]/route.ts", /if \(done\) await syncPlatformsSoon\(gate\.db, gate\.creatorId\)/],
      ["app/api/webhooks/mailgun/route.ts", /await platformsSoon\(data\)/],
      ["app/api/email/unsubscribe/route.ts", /syncPlatformsSoon\(adminSupabase, subscriber\.creator_id\)/],
      ["app/api/subscribe/route.ts", /syncPlatformsSoon\(adminSupabase, resolvedCreatorId\)/],
    ] as const)
      check(`  an unsubscribe or signup in ${f} reaches the platforms within the minute`, re.test(read(f)))
  }

  console.log("\n6. The setup's pure parts\n")
  {
    check("hostOf: the name as most DNS providers take it", hostOf("_dmarc.mail.shop.com", "mail.shop.com") === "_dmarc.mail" && hostOf("shop.com", "shop.com") === "@" && hostOf("pic._domainkey.mail.shop.co.uk", "mail.shop.co.uk") === "pic._domainkey.mail" && hostOf("email.mail.shop.com", "mail.shop.com") === "email.mail")
    const ui = read("components/email/connected-platforms.tsx")
    check("the setup polls quietly while waiting, every 30s for ten minutes, only while in view", /POLL_MS = 30_000/.test(ui) && /POLL_TIMES = 20/.test(ui) && /visibilityState !== "visible"/.test(ui))
    check("a root domain is offered mail.<domain>", /suggest = cleanDomain && isRootDomain\(cleanDomain\) \? `mail\.\$\{cleanDomain\}`/.test(ui))
    check("opening a platform eases its height in 150ms and never more", /duration-150/.test(ui) && !/duration-(?:[2-9]\d\d|1[6-9]\d)/.test(ui))
    check("the panel shows no key, only what the server answers", !/apiKey|secret_ciphertext/.test(ui))
  }

  check("no real address was ever called", realHost.length === 0, realHost)
  console.log(`\n${passed} passed, ${failed} failed\n`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
