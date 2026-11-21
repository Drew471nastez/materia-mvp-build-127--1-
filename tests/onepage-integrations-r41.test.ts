/**
 * ===========================================================================
 *  ROUND 41: EVERY ONEPAGE INTEGRATION, END TO END, WITH A FAKE TRANSPORT
 * ===========================================================================
 *   REQUESTS    the exact request each provider receives for one OnePage
 *               signup: Mailchimp, Kit, beehiiv, MailerLite, Brevo, Flodesk
 *               (method, address, the header that carries the key, the
 *               body), and Zapier, Make, Google Sheets and a webhook (the
 *               signed JSON, the same delivery id on a retry).
 *   CONNECTING  a key of the wrong shape is refused before anything is
 *               asked; the account read each key is checked with; lists,
 *               groups and segments read from each answer.
 *   ANSWERS     an address a provider will never take is handled, not an
 *               error on the card; a wrong key or list is said; busy is
 *               retried once.
 *   ONCE        the same signup again is not a second delivery (part 324),
 *               and a failed send gives its claim back.
 *   KLAVIYO     a OnePage signup starts Klaviyo's and Omnisend's sync at
 *               once, one per store and minute.
 *   PIXELS      PageView (the base tags), ViewContent on the product sheet,
 *               Lead on a signup, InitiateCheckout in the checkout window,
 *               Purchase with value, currency and one event id for every
 *               service, told once.
 *   ORDER       /app/integrations draws its order and pills from the server
 *               on the first frame.
 *   LESS TEXT   the setup steps are a tap away, not on the page.
 *   SQL         parts 323 and 324.
 *
 * Run: npx tsx --conditions=react-server tests/onepage-integrations-r41.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createHash, createHmac } from "node:crypto"
import {
  BREVO_API,
  FLODESK_API,
  MAILERLITE_API,
  accountRequest,
  deliveryKey,
  keyProblem,
  listsFrom,
  outcomeOf,
  refusalText,
  signupRequests,
  webhookSignature,
  type PageSignup,
  type ProviderRequest,
} from "@/lib/onepage/integrations/providers"
import { KEY_INTEGRATIONS, PAGE_INTEGRATIONS, needsList } from "@/lib/onepage/integrations/catalog"
import { deliverSignup, type Transport } from "@/lib/onepage/integrations/deliver-server"
import { listsFor } from "@/lib/onepage/integrations/connect-server"
import { queueMarketingSignup } from "@/lib/integrations/marketing/sync-server"
import { sealSecret } from "@/lib/physical/secrets"
import { paidEventId, pixelEvent, pixelLead, pixelPurchase } from "@/lib/analytics/pixels"
import { trackingTags } from "@/lib/store/tracking"
import { INTEGRATION_MARK_KEYS } from "@/components/onepage/brand-icons"

process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-role-key-for-sealing"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail: unknown = "") {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail ? `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`)
  }
}
function section(t: string) {
  console.log(`\n${t}`)
}
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")
const json = (r: ProviderRequest | undefined) => JSON.parse(r?.body ?? "null")

const SIGNUP: PageSignup = { email: " Ana@Example.com", name: "Ana Maria", form: "signup", blockId: "block_1", onepageId: "op1", pageUrl: "https://storelib.me/ana", at: "2026-10-28T10:00:00.000Z" }
const MC = "0123456789abcdef0123456789abcdef-us21"
const KIT = "kit_abcdefghijklmnopqrstuvwxyz"
const BEE = "b".repeat(40)
const ML = `eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.${"a".repeat(300)}.${"s".repeat(80)}`
const BREVO = `xkeysib-${"0".repeat(64)}-AbCdEfGh12345678`
const FLO = "fd_key_0123456789abcdefghij"
const UA = "Storelib/1.0 (+https://storelib.com)"

/* A database that answers the sender: the connected rows, the delivery claims (part 324), the counts. */
function fakeDb(rows: Record<string, unknown>[], opts: { claims?: boolean } = {}) {
  const claims = new Set<string>()
  const released: string[] = []
  const notes: { p_id: string; p_ok: boolean }[] = []
  const jobs: Record<string, unknown>[] = []
  const db = {
    from: (table: string) => {
      if (table === "onepage_integration_sends") {
        return {
          insert: async (row: { integration_id: string; send_key: string }) => {
            if (!opts.claims) return { error: { code: "42P01" } }
            const k = `${row.integration_id}:${row.send_key}`
            if (claims.has(k)) return { error: { code: "23505" } }
            claims.add(k)
            return { error: null }
          },
          delete: () => {
            const f: Record<string, string> = {}
            const q = {
              eq: (c: string, v: string) => {
                f[c] = v
                if (f.integration_id && f.send_key) {
                  claims.delete(`${f.integration_id}:${f.send_key}`)
                  released.push(f.integration_id)
                }
                return q
              },
            }
            return q
          },
        }
      }
      if (table === "commerce_integrations") {
        const q = { select: () => q, eq: () => q, in: () => q, then: (r: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(r) }
        return q
      }
      if (table === "commerce_jobs") return { insert: async (row: Record<string, unknown>) => (jobs.push(row), { error: null }) }
      const q = { select: () => q, eq: () => q, then: (r: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(r) }
      return q
    },
    rpc: async (_n: string, args: { p_id: string; p_ok: boolean }) => (notes.push(args), { data: null, error: null }),
  }
  return { db, claims, released, notes, jobs }
}
const noNudge = async () => 0

async function main() {
  section("The exact request each email tool receives for one signup")
  {
    check("every tool is listed once, in one fixed order", PAGE_INTEGRATIONS.join() === "mailchimp,kit,beehiiv,mailerlite,brevo,flodesk,zapier,make,sheets,webhook")
    check("every tool has its mark", PAGE_INTEGRATIONS.every((p) => INTEGRATION_MARK_KEYS.includes(p)), PAGE_INTEGRATIONS.filter((p) => !INTEGRATION_MARK_KEYS.includes(p)))

    const hash = createHash("md5").update("ana@example.com").digest("hex")
    const mc = signupRequests("mailchimp", MC, { list_id: "a1b2c3", tag: "OnePage" }, SIGNUP)
    check("Mailchimp: PUT the member by the address's MD5, merge validation skipped", mc[0].method === "PUT" && mc[0].url === `https://us21.api.mailchimp.com/3.0/lists/a1b2c3/members/${hash}?skip_merge_validation=true`)
    check("  Basic auth with the key, the key never in the address", mc[0].headers.authorization === `Basic ${Buffer.from(`storelib:${MC}`).toString("base64")}` && !mc[0].url.includes(MC) && mc[0].headers["user-agent"] === UA)
    check("  body: the address, status_if_new subscribed (pending with double opt in), FNAME", JSON.stringify(json(mc[0])) === JSON.stringify({ email_address: "ana@example.com", status_if_new: "subscribed", merge_fields: { FNAME: "Ana" } }) && json(signupRequests("mailchimp", MC, { list_id: "a1b2c3", double_optin: true }, SIGNUP)[0]).status_if_new === "pending")
    check("  the tag: POST …/tags, active", mc[1]?.url === `https://us21.api.mailchimp.com/3.0/lists/a1b2c3/members/${hash}/tags` && JSON.stringify(json(mc[1])) === JSON.stringify({ tags: [{ name: "OnePage", status: "active" }] }))

    const kit = signupRequests("kit", KIT, { list_id: "12345", tag_id: "678" }, SIGNUP)
    check("Kit v4: upsert the subscriber, then the form (with the page as referrer), then the tag", kit.map((r) => `${r.method} ${r.url}`).join(" | ") === "POST https://api.kit.com/v4/subscribers | POST https://api.kit.com/v4/forms/12345/subscribers | POST https://api.kit.com/v4/tags/678/subscribers")
    check("  X-Kit-Api-Key, bodies exact", kit.every((r) => r.headers["x-kit-api-key"] === KIT) && JSON.stringify(json(kit[0])) === JSON.stringify({ email_address: "ana@example.com", first_name: "Ana", state: "active" }) && JSON.stringify(json(kit[1])) === JSON.stringify({ email_address: "ana@example.com", referrer: "https://storelib.me/ana" }))

    const pub = "pub_00000000-0000-0000-0000-000000000000"
    const bh = signupRequests("beehiiv", BEE, { list_id: pub }, SIGNUP)
    check("beehiiv v2: POST the subscription on the publication, Bearer key", bh.length === 1 && bh[0].url === `https://api.beehiiv.com/v2/publications/${pub}/subscriptions` && bh[0].headers.authorization === `Bearer ${BEE}`)
    check("  body: reactivate, welcome email, utm and the referring page", JSON.stringify(json(bh[0])) === JSON.stringify({ email: "ana@example.com", reactivate_existing: true, send_welcome_email: true, utm_source: "storelib", utm_medium: "onepage", referring_site: "https://storelib.me/ana" }))

    const ml = signupRequests("mailerlite", ML, { list_id: "112233" }, SIGNUP)
    check("MailerLite: POST /api/subscribers on connect.mailerlite.com, Bearer token", ml.length === 1 && ml[0].method === "POST" && ml[0].url === `${MAILERLITE_API}/subscribers` && MAILERLITE_API === "https://connect.mailerlite.com/api" && ml[0].headers.authorization === `Bearer ${ML}`)
    check("  body: the address, the name field, the group; no status, so an unsubscribe there stands", JSON.stringify(json(ml[0])) === JSON.stringify({ email: "ana@example.com", fields: { name: "Ana" }, groups: ["112233"] }))
    check("  no group chosen: the account alone", JSON.stringify(json(signupRequests("mailerlite", ML, {}, SIGNUP)[0])) === JSON.stringify({ email: "ana@example.com", fields: { name: "Ana" } }))

    const br = signupRequests("brevo", BREVO, { list_id: "7" }, SIGNUP)
    check("Brevo v3: POST /v3/contacts, the api-key header", br.length === 1 && br[0].url === `${BREVO_API}/contacts` && BREVO_API === "https://api.brevo.com/v3" && br[0].headers["api-key"] === BREVO && !("authorization" in br[0].headers))
    check("  body: FIRSTNAME, the list as a number, updateEnabled for someone already there", JSON.stringify(json(br[0])) === JSON.stringify({ email: "ana@example.com", attributes: { FIRSTNAME: "Ana" }, listIds: [7], updateEnabled: true }))
    check("  no list, no request (Brevo needs one)", signupRequests("brevo", BREVO, {}, SIGNUP).length === 0 && needsList("brevo"))

    const fl = signupRequests("flodesk", FLO, { list_id: "64a1b2c3d4e5f60718293a4b", double_optin: true }, SIGNUP)
    check("Flodesk v1: POST /subscribers, Basic with the key as the user name", fl[0].url === `${FLODESK_API}/subscribers` && FLODESK_API === "https://api.flodesk.com/v1" && fl[0].headers.authorization === `Basic ${Buffer.from(`${FLO}:`).toString("base64")}` && fl[0].headers["user-agent"] === UA)
    check("  body: first name, the segment, Flodesk's own double opt in", JSON.stringify(json(fl[0])) === JSON.stringify({ email: "ana@example.com", first_name: "Ana", segment_ids: ["64a1b2c3d4e5f60718293a4b"], double_optin: true }))
    check("  and onto the segment for someone already there", fl[1]?.url === `${FLODESK_API}/subscribers/ana%40example.com/segments` && JSON.stringify(json(fl[1])) === JSON.stringify({ segment_ids: ["64a1b2c3d4e5f60718293a4b"] }))

    check("a list id of the wrong shape never reaches a path or a body", signupRequests("brevo", BREVO, { list_id: "7; drop" }, SIGNUP).length === 0 && signupRequests("mailerlite", ML, { list_id: "../x" }, SIGNUP).every((r) => !r.body?.includes("../x")) && signupRequests("flodesk", FLO, { list_id: "a/b" }, SIGNUP).length === 1)
  }

  section("Connecting: the key's shape, then the read that only a working key answers")
  {
    check("MailerLite Classic keys and Brevo SMTP keys are named for what they are", /Classic/.test(keyProblem("mailerlite", "0123456789abcdef0123456789abcdef") ?? "") && /SMTP/.test(keyProblem("brevo", "xsmtpsib-abc") ?? ""))
    check("good shapes pass", KEY_INTEGRATIONS.every((p) => keyProblem(p, { mailchimp: MC, kit: KIT, beehiiv: BEE, mailerlite: ML, brevo: BREVO, flodesk: FLO }[p]) === null))
    const reads = {
      mailerlite: accountRequest("mailerlite", ML)!,
      brevo: accountRequest("brevo", BREVO)!,
      flodesk: accountRequest("flodesk", FLO)!,
    }
    check("the account reads: MailerLite groups, Brevo lists, Flodesk segments", reads.mailerlite.url === `${MAILERLITE_API}/groups?limit=100&sort=name` && reads.brevo.url === `${BREVO_API}/contacts/lists?limit=50&offset=0&sort=desc` && reads.flodesk.url === `${FLODESK_API}/segments?per_page=100` && Object.values(reads).every((r) => r.method === "GET"))
    check("lists read from each answer", listsFrom("mailerlite", { data: [{ id: "1", name: "Fans" }] })[0]?.name === "Fans" && listsFrom("brevo", { lists: [{ id: 7, name: "News" }], count: 1 })[0]?.id === "7" && listsFrom("flodesk", { data: [{ id: "s1", name: "VIP" }] }).length === 1)
    const asked: string[] = []
    const ok = await listsFor("brevo", BREVO, async (r) => (asked.push(`${r.method} ${r.url} ${r.headers["api-key"] === BREVO}`), { status: 200, body: { lists: [{ id: 2, name: "Newsletter" }] } }))
    check("a key is kept only after the provider answered it", ok.ok === true && "lists" in ok && ok.lists[0].name === "Newsletter" && asked.length === 1 && asked[0].endsWith("true"))
    const no = await listsFor("mailerlite", ML, async () => ({ status: 401, body: { message: "Unauthenticated." } }))
    check("  a refused key is said, and not kept", "error" in no && /MailerLite did not accept the key/.test(no.error))
    const shape = await listsFor("flodesk", "short", async () => {
      throw new Error("asked")
    })
    check("  a key of the wrong shape asks nobody", "error" in shape)
  }

  section("What an answer means")
  {
    check("an address a provider will never take is handled, not an error", outcomeOf("mailerlite", 422, { message: "The email must be a valid email address.", errors: { email: ["The email must be a valid email address."] } }) === "ok" && outcomeOf("brevo", 400, { code: "invalid_parameter", message: "Invalid email address" }) === "ok" && outcomeOf("mailchimp", 400, { title: "Forgotten Email Not Subscribed" }) === "ok" && outcomeOf("flodesk", 422, { message: "email is invalid" }) === "ok")
    check("Mailchimp's Invalid Resource for a bad merge field is a problem to say, not hidden", outcomeOf("mailchimp", 400, { title: "Invalid Resource", detail: "Your merge fields were invalid." }) === "refused")
    check("busy or down: retry; a wrong key: refused", outcomeOf("brevo", 429, null) === "retry" && outcomeOf("flodesk", 503, null) === "retry" && outcomeOf("mailerlite", 401, null) === "refused")
    check("the card says it in the provider's words when short", refusalText("brevo", 400, { code: "invalid_parameter", message: "listIds not valid" }) === "Brevo: listIds not valid" && refusalText("flodesk", 404, {}) === "Flodesk could not find the list. Choose it again.")
  }

  section("Sending: every connected tool, the webhooks signed, a busy one asked once more")
  {
    const seen: { url: string; headers: Record<string, string>; body: string }[] = []
    let busy = true
    const transport: Transport = {
      ask: async (r) => {
        seen.push({ url: r.url, headers: r.headers, body: r.body ?? "" })
        if (r.url.startsWith(BREVO_API) && busy) {
          busy = false
          return { status: 503, body: null }
        }
        return { status: r.url.startsWith(BREVO_API) ? 201 : 200, body: {} }
      },
      post: async (url, body, headers) => {
        seen.push({ url, headers, body })
        if (url.includes("script.google.com")) return { status: 302, body: "" }
        return { status: 200, body: "" }
      },
      wait: async () => {},
    }
    const hook = (provider: string, url: string) => ({ id: provider, creator_id: "c1", provider, status: "connected", config: {}, secret_ciphertext: sealSecret(JSON.stringify({ url, secret: `${provider}-secret` })) })
    const { db, notes } = fakeDb([
      { id: "mailerlite", creator_id: "c1", provider: "mailerlite", status: "connected", config: { list_id: "112233" }, secret_ciphertext: sealSecret(ML) },
      { id: "brevo", creator_id: "c1", provider: "brevo", status: "connected", config: { list_id: "7" }, secret_ciphertext: sealSecret(BREVO) },
      { id: "flodesk", creator_id: "c1", provider: "flodesk", status: "connected", config: {}, secret_ciphertext: sealSecret(FLO) },
      hook("zapier", "https://hooks.zapier.com/hooks/catch/1/a/"),
      hook("make", "https://hook.eu1.make.com/abc"),
      hook("sheets", "https://script.google.com/macros/s/AKfy_1/exec"),
      hook("webhook", "https://example.com/storelib"),
    ])
    let nudged = 0
    const out = await deliverSignup(db, "c1", SIGNUP, transport, async () => ++nudged)
    check("every connected tool took it", Object.keys(out).sort().join() === "brevo,flodesk,mailerlite,make,sheets,webhook,zapier" && Object.values(out).every((r) => r?.ok === true), out)
    check("a busy Brevo was asked once more", seen.filter((s) => s.url === `${BREVO_API}/contacts`).length === 2)
    check("Klaviyo and Omnisend were asked to sync at once", nudged === 1)
    const hooks = seen.filter((s) => !s.url.startsWith("https://connect") && !s.url.startsWith(BREVO_API) && !s.url.startsWith(FLODESK_API))
    const payload = JSON.parse(hooks[0]?.body ?? "{}")
    check("each webhook got the same JSON shape", hooks.length === 4 && hooks.every((h) => h.body === hooks[0].body.replace(/"id":"[^"]+"/, `"id":"${JSON.parse(h.body).id}"`)) && payload.event === "onepage.signup" && payload.email === "ana@example.com" && payload.first_name === "Ana" && payload.page_url === "https://storelib.me/ana")
    check("  each signed with its own secret, HMAC SHA-256 of the body", hooks.every((h) => {
      const provider = h.url.includes("zapier") ? "zapier" : h.url.includes("make.com") ? "make" : h.url.includes("script.google") ? "sheets" : "webhook"
      return h.headers["x-storelib-signature"] === `sha256=${createHmac("sha256", `${provider}-secret`).update(h.body).digest("hex")}` && h.headers["x-storelib-signature"] === webhookSignature(`${provider}-secret`, h.body)
    }))
    check("  one delivery id for the signup, in the header and the body", new Set(hooks.map((h) => h.headers["x-storelib-delivery"])).size === 1 && hooks.every((h) => JSON.parse(h.body).id === h.headers["x-storelib-delivery"]) && hooks.every((h) => h.headers["x-storelib-event"] === "onepage.signup"))
    check("  an Apps Script's 302 is its answer", out.sheets?.ok === true)
    check("each result counted", notes.length === 7 && notes.every((n) => n.p_ok))
  }

  section("Once: the same signup again is not a second delivery (part 324)")
  {
    let calls = 0
    let refuse = true
    const transport: Transport = {
      ask: async () => ({ status: 200, body: {} }),
      post: async () => (calls++, refuse ? { status: 410, body: "" } : { status: 200, body: "" }),
      wait: async () => {},
    }
    const row = { id: "z1", creator_id: "c1", provider: "zapier", status: "connected", config: {}, secret_ciphertext: sealSecret(JSON.stringify({ url: "https://hooks.zapier.com/hooks/catch/1/a/", secret: "s" })) }
    const f = fakeDb([row], { claims: true })
    const first = await deliverSignup(f.db, "c1", SIGNUP, transport, noNudge)
    check("a refused send gives its claim back", first.zapier?.ok === false && f.released.includes("z1") && f.claims.size === 0)
    refuse = false
    const second = await deliverSignup(f.db, "c1", SIGNUP, transport, noNudge)
    const third = await deliverSignup(f.db, "c1", { ...SIGNUP, email: "ANA@example.com " }, transport, noNudge)
    check("so the next one goes, and the one after for the same address and block does not", second.zapier?.ok === true && third.zapier?.ok === true && "skipped" in (third.zapier ?? {}) && calls === 2)
    check("a different block is a different delivery", deliveryKey(SIGNUP) !== deliveryKey({ ...SIGNUP, blockId: "block_2" }) && deliveryKey(SIGNUP) === deliveryKey({ ...SIGNUP, email: "ana@EXAMPLE.com" }) && /^[0-9a-f]{64}$/.test(deliveryKey(SIGNUP)))
    const before = fakeDb([row])
    const unclaimed = await deliverSignup(before.db, "c1", SIGNUP, transport, noNudge)
    check("before part 324 runs, every signup is sent as before", unclaimed.zapier?.ok === true && !("skipped" in (unclaimed.zapier ?? {})))
  }

  section("Klaviyo and Omnisend: a OnePage signup starts their sync now")
  {
    const jobs: Record<string, unknown>[] = []
    const db = {
      from: (table: string) => {
        if (table === "commerce_jobs") return { insert: async (row: Record<string, unknown>) => (jobs.push(row), { error: null }) }
        const q = { select: () => q, eq: () => q, in: () => q, then: (r: (v: unknown) => unknown) => Promise.resolve({ data: [{ provider: "klaviyo" }, { provider: "omnisend" }], error: null }).then(r) }
        return q
      },
    }
    const at = Date.parse("2026-10-28T10:00:30Z")
    const n = await queueMarketingSignup(db, "c1", at)
    /* Changed on purpose (wave 9): keyed by the quarter minute, so a signup just after a sync ran gets its own rather than waiting for the quarter hour. */
    const minute = Math.floor(at / 15_000)
    check("one sync job per connected provider", n === 2 && jobs.length === 2)
    check("  keyed by the quarter minute, so a burst of signups is one sync", jobs.map((j) => j.idempotency_key).join() === `mkt:klaviyo:sync:c1:signup${minute},mkt:omnisend:sync:c1:signup${minute}` && jobs.every((j) => j.kind === "marketing_sync" && (j.payload as { op: string }).op === "sync"))
    const deliver = read("lib/onepage/integrations/deliver-server.ts")
    check("  every OnePage signup route reaches it through deliverSignup", /await nudge\(db, creatorId\)/.test(deliver) && /queueMarketingSignup/.test(deliver))
  }

  section("Pixels on the OnePage")
  {
    const calls: unknown[][] = []
    const store = new Map<string, string>()
    const win = {
      fbq: (...a: unknown[]) => calls.push(["fbq", ...a]),
      ttq: { track: (...a: unknown[]) => calls.push(["ttq", ...a]) },
      gtag: (...a: unknown[]) => calls.push(["gtag", ...a]),
      pintrk: (...a: unknown[]) => calls.push(["pintrk", ...a]),
      localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) },
      sessionStorage: { getItem: () => null, setItem: () => {} },
      setTimeout,
    } as unknown as Window
    const tags = trackingTags({ meta_pixel: "1234567890123456", tiktok_pixel: "C4A1B2C3D4E5F6G7H8I9", ga4: "G-1A2B3C4D5E" }, { asks: false })
    check("PageView: the base tags (Meta PageView, TikTok page, GA4 config)", /fbq\('track','PageView'\)/.test(tags.find((t) => t.key === "meta")?.inline ?? "") && /ttq\.page\(\)/.test(tags.find((t) => t.key === "tiktok")?.inline ?? "") && /gtag\('config',"G-1A2B3C4D5E"\)/.test(tags.find((t) => t.key === "gtag")?.inline ?? ""))

    pixelEvent(win, "view_item", "prod-1", { valueCents: 1250, currency: "usd" })
    check("ViewContent with value and currency", JSON.stringify(calls.find((c) => c[0] === "fbq")) === JSON.stringify(["fbq", "track", "ViewContent", { content_ids: ["prod-1"], content_type: "product", currency: "USD", value: 12.5 }]) && JSON.stringify(calls.find((c) => c[0] === "ttq")) === JSON.stringify(["ttq", "ViewContent", { content_id: "prod-1", content_type: "product", contents: [{ content_id: "prod-1", quantity: 1 }], currency: "USD", value: 12.5 }]))
    calls.length = 0
    pixelEvent(win, "begin_checkout", "prod-1", { valueCents: 2500, currency: "JPY" })
    check("InitiateCheckout, a yen price in yen", (calls.find((c) => c[0] === "fbq")?.[3] as { value: number })?.value === 2500 && calls.find((c) => c[0] === "fbq")?.[2] === "InitiateCheckout" && calls.find((c) => c[0] === "gtag")?.[2] === "begin_checkout")
    calls.length = 0
    pixelLead(win, { form: "signup", eventId: "3f2b0d8e-1111-4222-8333-944455556666" })
    check("Lead: Meta Lead, TikTok SubmitForm, GA4 generate_lead, Pinterest lead, one event id", JSON.stringify(calls) === JSON.stringify([
      ["gtag", "event", "generate_lead", { lead_source: "signup", event_id: "3f2b0d8e-1111-4222-8333-944455556666" }],
      ["fbq", "track", "Lead", { content_name: "signup" }, { eventID: "3f2b0d8e-1111-4222-8333-944455556666" }],
      ["ttq", "SubmitForm", { content_name: "signup" }, { event_id: "3f2b0d8e-1111-4222-8333-944455556666" }],
      ["pintrk", "track", "lead", { lead_type: "signup", event_id: "3f2b0d8e-1111-4222-8333-944455556666" }],
    ]), calls)
    calls.length = 0
    const id = await paidEventId("receipt-token-abc")
    check("one event id per order, the same every time, the token not readable from it", id === (await paidEventId("receipt-token-abc")) && /^sl-[0-9a-f]{16}$/.test(id) && !id.includes("receipt"))
    pixelPurchase(win, { eventId: id, valueCents: 1999, currency: "eur", productIds: ["prod-1"] })
    const fb = calls.find((c) => c[0] === "fbq")
    const tk = calls.find((c) => c[0] === "ttq")
    const ga = calls.find((c) => c[0] === "gtag")
    check("Purchase: Meta with value, currency and eventID", JSON.stringify(fb) === JSON.stringify(["fbq", "track", "Purchase", { value: 19.99, currency: "EUR", content_ids: ["prod-1"], content_type: "product", num_items: 1 }, { eventID: id }]))
    check("  TikTok CompletePayment with event_id; GA4 purchase with the same transaction_id", JSON.stringify(tk) === JSON.stringify(["ttq", "CompletePayment", { value: 19.99, currency: "EUR", content_type: "product", contents: [{ content_id: "prod-1", quantity: 1 }] }, { event_id: id }]) && ga?.[2] === "purchase" && (ga?.[3] as { transaction_id: string }).transaction_id === id)
    const n = calls.length
    pixelPurchase(win, { eventId: id, valueCents: 1999, currency: "eur", productIds: ["prod-1"] })
    check("  told once: the same order again tells nobody", calls.length === n)

    const st = read("components/website-builder/store-tracking.tsx")
    check("the purchase listener is on every page with the store's pixels, the OnePage included", /<PixelPaid currency=/.test(st) && /t\.meta_pixel \|\| t\.tiktok_pixel/.test(st))
    const ic = read("components/checkout/instant-checkout.tsx")
    check("the OnePage's checkout window says paid with the currency and the product, and InitiateCheckout once", /detail: \{ ref: receiptToken, totalCents: total, currency: currency\.toUpperCase\(\), productId \}/.test(ic) && /pixelEvent\(window, "begin_checkout", productId, \{ valueCents: baseCents, currency \}\)/.test(ic) && /\|\| preview\) return/.test(ic))
    check("the product sheet is a ViewContent once per opening", /pixelEvent\(window, "view_item", productId, \{ valueCents: p\.priceCents, currency: p\.currency \}\)/.test(read("components/onepage/product-sheet.tsx")))
    /* Changed on purpose (integrations audit): Subscribe now tells the pixels the id it sends to the server, so the server's Lead is the same lead (tests/onepage-integrations.test.ts). */
    check("each OnePage signup is a Lead", /pixelLead\(window, \{ form: "signup", eventId:/.test(read("components/onepage/public-onepage.tsx")) && /pixelLead\(window, \{ form: "lead_magnet"/.test(read("components/onepage/storelib-blocks.tsx")) && /pixelLead\(window, \{ form: "subscribe", eventId: leadId \}\)/.test(read("components/onepage/subscribe-sheet.tsx")))
    check("GA's own purchase listener uses the same id", /paidEventId\(d\.ref\)/.test(read("components/analytics/ga-route.tsx")))
  }

  section("/app/integrations: the order is there on the first paint")
  {
    const page = read("app/(storelib)/app/integrations/page.tsx")
    check("the page reads the order, the overrides and what is connected with the page", /integrationPopularity\(c\.db\)/.test(page) && /cachedCatalogOverrides\(\)/.test(page) && /loadTracking\(c\.db, c\.creatorId\)/.test(page) && /loadMarketing\(c\.db, c\.creatorId\)/.test(page) && /<IntegrationsClient initial=\{await initialFor\(\)\} \/>/.test(page))
    check("  never waits long for it", /const WAIT_MS = 1200/.test(page))
    const dir = read("components/app/settings/integrations-directory.tsx")
    check("the directory draws its first frame from it", ["served?.scores", "served?.overrides", "served?.tracking", "served?.marketing"].every((x) => dir.includes(x)))
    check("  a later read that says the same thing moves nothing", /JSON\.stringify\(had\) === JSON\.stringify\(r\.data\.overrides \?\? \[\]\) \? had/.test(dir))
    const pi = read("components/onepage/page-integrations.tsx")
    check("OnePage Settings: every row from the first frame, in one order; a quiet bar while loading, never a status that then changes", /loading=\{all === undefined\}/.test(pi) && !/animate-pulse rounded-xl/.test(pi) && /shown\.map\(\(p\) =>/.test(pi))
  }

  section("Less text: one line, the action, the status; the setup a tap away")
  {
    const pi = read("components/onepage/page-integrations.tsx")
    check("the sheet: one line of purpose, then the one thing to do", /data-integration-purpose=""/.test(pi) && /data-integration-setup-open=""/.test(pi))
    check("  the steps and the Apps Script live on the sheet's second view", /function SetupView/.test(pi) && /<SetupView provider=\{provider\}/.test(pi) && /\{provider === "sheets" \? \(\s*<div className="relative rounded-xl bg-\[#111113\]/.test(pi))
    check("  the Apps Script takes a lock, so two signups at once are two rows", /LockService\.getScriptLock\(\)/.test(pi))
    check("  no em dash in what it says", !/—/.test(pi) && !/—/.test(read("components/onepage/settings-integrations.tsx")))
    const det = read("components/app/settings/integration-detail.tsx")
    check("/app: the steps in a modal, the long text behind Details", /<Modal open=\{howTo\}/.test(det) && /data-integration-steps-open=""/.test(det) && /<Modal open=\{details\}/.test(det) && /data-integration-details-open=""/.test(det))
    check("  the page itself: the setup, the status and the way out", /main=\{\s*<>\s*\{setup\}\s*\{statusSection\}\s*\{danger\}\s*<\/>\s*\}/.test(det))
    check("  Mailchimp, Brevo, Zapier and Make connect for the OnePage from their /app page too", /isPageIntegration\(item\.id\) \? <PageIntegrationsSection only=\{\[item\.id\]\} \/>/.test(det))
    const si = read("components/onepage/settings-integrations.tsx")
    check("OnePage Settings lost its explaining sentences", !/What your page is connected to/.test(si) && !/These tags load on your page/.test(si) && !/Each signup on your page goes to these/.test(pi))
  }

  section("SQL parts 323 and 324")
  {
    for (const [part, name] of [["323", "onepage_integrations_more_tools"], ["324", "onepage_integration_sends"]]) {
      const a = read(`supabase/sql/run-now/${part}_${name}.sql`)
      check(`${part}: its migration is byte for byte the same`, a === read(`supabase/migrations/20271029_${name}.sql`))
      check(`${part}: guarded by to_regclass, a README row, a check column`, /to_regclass\('public\.onepage_integrations'\) IS NULL/.test(a) && read("supabase/sql/run-now/README.md").includes(`| \`${part}_${name}.sql\``) && read("supabase/sql/run-now/99_check_after.sql").includes(`as p${part}_${name}`))
    }
    const a = read("supabase/sql/run-now/323_onepage_integrations_more_tools.sql")
    check("323: dropped and added NOT VALID, then validated, with all ten tools", /DROP CONSTRAINT IF EXISTS onepage_integrations_provider_check/.test(a) && /NOT VALID; ALTER TABLE public\.onepage_integrations VALIDATE CONSTRAINT onepage_integrations_provider_check/.test(a) && PAGE_INTEGRATIONS.every((p) => a.includes(`'${p}'`)))
    const b = read("supabase/sql/run-now/324_onepage_integration_sends.sql")
    check("324: row level security on, nothing for anon or authenticated, no address kept", /ENABLE ROW LEVEL SECURITY/.test(b) && /REVOKE ALL ON public\.onepage_integration_sends FROM PUBLIC, anon, authenticated/.test(b) && /send_key ~ '\^\[0-9a-f\]\{64\}\$'/.test(b) && /ON DELETE CASCADE/.test(b))
    check("connecting a new tool before 323 says which part is needed", /error\.code === "23514" \? NEEDS_SQL_323/.test(read("lib/onepage/integrations/connect-server.ts")))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
