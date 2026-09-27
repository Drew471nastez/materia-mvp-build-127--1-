/**
 * ===========================================================================
 *  MAILGUN'S SIGNATURE, CHECKED THE WAY MAILGUN SIGNS (app/api/webhooks/mailgun)
 * ===========================================================================
 * "[mailgun-webhook] Invalid webhook signature", 210 times since June.
 *
 * The check is Mailgun's documented one: the hex HMAC-SHA256 of timestamp
 * then token, keyed with the account's HTTP webhook signing key, compared in
 * constant time. The fixed delivery below was signed by Mailgun's own
 * documented Python verifier (hmac.new(key, f"{timestamp}{token}", sha256)),
 * run separately, and the route accepts it. So when Mailgun's deliveries
 * are refused, the key is the difference: MAILGUN_WEBHOOK_SIGNING_KEY is not
 * the signing key of the account whose webhooks point here. The refusal now
 * says which kind it is, "unsigned" (not Mailgun) or "no matching key".
 *
 * The real route runs here with the database as a stand-in: JSON, and the
 * form a legacy webhook posts.
 */
import { register } from "node:module"
import { createHmac } from "node:crypto"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { build } from "esbuild"
import { verifyMailgunSignature } from "@/lib/notify/webhook"

let passed = 0
let failed = 0
const failures: string[] = []
const out = console.log.bind(console)
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; out(`  ok    ${label}`) }
  else { failed++; failures.push(label); out(`  FAIL  ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`) }
}

/* Signed by Mailgun's documented Python verifier, not by this code. */
const KEY = "key-3ax6xnjp29jd6fds4gc373sgvjxteol0"
const DOCUMENTED = {
  timestamp: "1529006854",
  token: "a8ce0edb2dd8301dee6c2405235584e45aa91d1e9f979f3de0",
  signature: "b63c0701c4f4b614f272106a1b367c5c3369bcdca664ae73ebd52787e45eef07",
}

const dir = mkdtempSync(join(tmpdir(), "mailgun-stubs-"))
const stub = (name: string, source: string) => {
  const file = join(dir, `${name}.mjs`)
  writeFileSync(file, source)
  return pathToFileURL(file).href
}
const stubs = {
  "@supabase/supabase-js": stub("supabase", `const q = () => { const b = { insert: () => b, update: () => b, upsert: () => b, select: () => b, eq: () => b, in: () => b, is: () => b, ilike: () => b, maybeSingle: () => b, single: () => b, then: (r) => r({ data: null, error: null }) }; return b }
export const createClient = () => ({ from: q, rpc: async () => ({ data: null, error: null }) })
`),
  "@/lib/notify/store": stub("store", `export const supabaseNotifyStore = () => null\n`),
}
register(pathToFileURL(join(process.cwd(), "scripts/push-test-stubs.mjs")).href, { parentURL: import.meta.url, data: { stubs } })

const logged: string[] = []
console.error = (...a: unknown[]) => void logged.push(a.map(String).join(" "))
console.log = () => {}

const sign = (key: string, timestamp: string, token: string) => createHmac("sha256", key).update(timestamp + token).digest("hex")

async function main() {
  check("the documented delivery verifies with its key", verifyMailgunSignature(DOCUMENTED, [KEY]))
  check("and with no other", !verifyMailgunSignature(DOCUMENTED, ["key-somebody-else"]))
  check("the same bytes signed here agree with Mailgun's verifier", sign(KEY, DOCUMENTED.timestamp, DOCUMENTED.token) === DOCUMENTED.signature)

  process.env.MAILGUN_WEBHOOK_SIGNING_KEY = KEY
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://placeholder.supabase.co"
  process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder"
  const file = join(process.env.PUSH_TEST_OUT || dir, "__mailgun-route__", "route.mjs")
  await build({
    entryPoints: [join(process.cwd(), "app/api/webhooks/mailgun/route.ts")], outfile: file, bundle: true, format: "esm", platform: "node", target: "node20",
    logLevel: "error", alias: { "@": process.cwd() }, packages: "external",
    plugins: [{ name: "stand-ins", setup(b) { b.onResolve({ filter: /.*/ }, (a) => (a.path in stubs ? { path: a.path, external: true } : undefined)) } }],
    external: ["next/*", "server-only"],
  })
  const route = (await import(pathToFileURL(file).href)) as any
  const json = (body: unknown) => route.POST(new Request("https://storelib.com/api/webhooks/mailgun", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }))
  const now = String(Math.floor(Date.now() / 1000))
  const event = { id: "ev-1", event: "delivered", recipient: "buyer@example.com", timestamp: Number(now) }

  out("\nJSON, as Mailgun's webhooks send it")
  {
    logged.length = 0
    const res = await json({ signature: DOCUMENTED, "event-data": event })
    const b = await res.json()
    check("the documented delivery passes the signature check (and is then refused only as too old to replay)",
      res.status === 401 && b.error === "Stale request" && !logged.some((l) => /Invalid webhook signature/.test(l)), { status: res.status, b, logged })
    const token = "f".repeat(50)
    const fresh = await json({ signature: { timestamp: now, token, signature: sign(KEY, now, token) }, "event-data": event })
    check("a fresh delivery signed with the key: 200", fresh.status === 200, fresh.status)
  }

  out("\nA form, as legacy webhooks post it")
  {
    const token = "e".repeat(50)
    const form = new URLSearchParams({ event: "delivered", recipient: "buyer@example.com", timestamp: now, token, signature: sign(KEY, now, token) })
    const res = await route.POST(new Request("https://storelib.com/api/webhooks/mailgun", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form.toString() }))
    check("signed: 200", res.status === 200, res.status)
    const bad = new URLSearchParams({ event: "delivered", timestamp: now, token, signature: sign("key-other", now, token) })
    const refused = await route.POST(new Request("https://storelib.com/api/webhooks/mailgun", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: bad.toString() }))
    check("signed with another key: 401", refused.status === 401)
  }

  out("\nThe refusal says which kind it is")
  {
    logged.length = 0
    const unsigned = await json({ "event-data": event })
    check("no signature: 401, logged as unsigned", unsigned.status === 401 && logged.some((l) => l === "[mailgun-webhook] Invalid webhook signature: unsigned"), logged)
    logged.length = 0
    const token = "d".repeat(50)
    const other = await json({ signature: { timestamp: now, token, signature: sign("key-from-another-account", now, token) }, "event-data": event })
    check("Mailgun's shape, another key: 401, logged as no matching key", other.status === 401 && logged.some((l) => l === "[mailgun-webhook] Invalid webhook signature: no matching key"), logged)
    logged.length = 0
    const short = await json({ signature: { timestamp: now, token, signature: "abc" }, "event-data": event })
    check("a signature of the wrong length: 401, malformed", short.status === 401 && logged.some((l) => /: malformed$/.test(l)), logged)
    check("one line each, with no address in it", logged.length === 1 && !logged.some((l) => l.includes("buyer@example.com")), logged)
    const junk = await route.POST(new Request("https://storelib.com/api/webhooks/mailgun", { method: "POST", body: "not json" }))
    check("a body that is neither: 400", junk.status === 400)
  }

  out(`\n${passed} passed, ${failed} failed`)
  if (failed) { for (const f of failures) out(`  - ${f}`); process.exit(1) }
}
main()
