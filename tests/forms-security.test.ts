/**
 * Public form submissions and the owner's integrations: the honeypot and
 * the minimum time, the two rate limits (per address, per address and
 * form), the payload cap, webhook signatures (tampering, replay), retry
 * timing, webhook addresses, and the sealed secret never leaving the
 * server.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { spamVerdict, formSubject, SUBMIT_LIMITS, MAX_SUBMIT_BYTES, MIN_FILL_MS, UPLOAD_LIMITS } from "../lib/forms/spam"
import { signWebhook, verifyWebhook, retryDelayMs, webhookUrlProblem, newWebhookSecret, MAX_ATTEMPTS } from "../lib/forms/webhook"
import { clientIntegrations, mergeIntegrations, clientForm } from "../lib/forms/integrations"

let passed = 0
const check = (name: string, fn: () => void) => {
  fn()
  passed++
  console.log("ok -", name)
}

check("the honeypot thanks a bot and keeps nothing; too fast or too old is refused", () => {
  const now = 1_800_000_000_000
  assert.deepEqual(spamVerdict({ website: "http://spam", started_at: now - 10_000 }, now), { kind: "trap" })
  assert.deepEqual(spamVerdict({ website: 1, started_at: now - 10_000 }, now), { kind: "trap" })
  assert.equal(spamVerdict({ website: "", started_at: now - 10_000 }, now).kind, "ok")
  assert.equal(spamVerdict({ started_at: now - MIN_FILL_MS + 1 }, now).kind, "refuse")
  assert.equal(spamVerdict({ started_at: now - MIN_FILL_MS }, now).kind, "ok")
  assert.equal(spamVerdict({ started_at: "123" }, now).kind, "refuse")
  assert.equal(spamVerdict({}, now).kind, "refuse")
  assert.equal(spamVerdict({ started_at: now + 3_600_000 }, now).kind, "refuse")
  assert.equal(spamVerdict({ started_at: now - 2 * 86_400_000 }, now).kind, "refuse")
})

check("rate limits count per address and per address on one form, and the body is capped", () => {
  assert.equal(formSubject("ip:abc", "AAAAAAAA-0000-4000-8000-000000000001"), "ip:abc|form:aaaaaaaa-0000-4000-8000-000000000001")
  assert.equal(formSubject(null, "x"), null)
  assert.ok(SUBMIT_LIMITS.addressForm[0].limit < SUBMIT_LIMITS.address[0].limit)
  assert.ok(MAX_SUBMIT_BYTES <= 128 * 1024)
  assert.ok(UPLOAD_LIMITS[0].limit <= 10)
  const route = readFileSync("app/api/forms/[id]/submit/route.ts", "utf8")
  assert.match(route, /"native-form-submit", address, SUBMIT_LIMITS\.address/)
  assert.match(route, /"native-form-submit-form", formSubject\(address, id\), SUBMIT_LIMITS\.addressForm/)
  assert.match(route, /boundedJson\(request, MAX_SUBMIT_BYTES\)/)
  /* Ownership comes from the form row, never the body. */
  assert.match(route, /owner_id: form\.owner_id/)
  assert.doesNotMatch(route, /body\.owner_id/)
  const upload = readFileSync("app/api/forms/[id]/upload/route.ts", "utf8")
  assert.match(upload, /FORM_UPLOAD_MAX_BYTES \+ 64 \* 1024/)
  assert.match(upload, /rateLimit\(/)
})

check("a webhook signature verifies, and fails when the body, secret or time is wrong", () => {
  const secret = newWebhookSecret()
  assert.match(secret, /^whsec_[A-Za-z0-9_-]{32}$/)
  const body = JSON.stringify({ event: "form.response", response: { id: "x" } })
  const ts = 1_800_000_000
  const sig = signWebhook(secret, ts, body)
  assert.match(sig, /^v1=[0-9a-f]{64}$/)
  assert.equal(verifyWebhook(secret, sig, ts, body, ts * 1000), true)
  assert.equal(verifyWebhook(secret, sig, String(ts), body, ts * 1000 + 299_000), true)
  assert.equal(verifyWebhook(secret, sig, ts, body + " ", ts * 1000), false)
  assert.equal(verifyWebhook("whsec_other", sig, ts, body, ts * 1000), false)
  assert.equal(verifyWebhook(secret, sig, ts + 1, body, ts * 1000), false)
  assert.equal(verifyWebhook(secret, sig, ts, body, ts * 1000 + 301_000), false)
  assert.equal(verifyWebhook(secret, sig.slice(0, -1), ts, body, ts * 1000), false)
  assert.equal(verifyWebhook(secret, null, ts, body, ts * 1000), false)
})

check("retries back off and stop", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 9].map((n) => retryDelayMs(n) / 60_000), [1, 5, 30, 120, 360, 1440, 1440])
  assert.equal(MAX_ATTEMPTS, 6)
})

check("only public https addresses can receive a webhook", () => {
  assert.equal(webhookUrlProblem("https://hooks.example.com/storelib"), null)
  for (const bad of ["http://hooks.example.com", "https://localhost/x", "https://10.0.0.1/x", "https://[::1]/x", "https://user:pw@example.com", "https://example.com:8443/x", "https://intranet/x", "https://printer.local/x", "ftp://example.com", "nonsense", 42])
    assert.ok(webhookUrlProblem(bad), String(bad))
})

check("the sealed webhook secret is kept on save and never sent to the browser", () => {
  const stored = { notify_email: false, webhook: { enabled: true, url: "https://a.example.com/h", secret_sealed: "v1.nonce.tag.body", secret_hint: "wxyz" }, google_sheets: { prepared: true } }
  const client = clientIntegrations(stored)
  assert.deepEqual(client, { notify_email: false, webhook: { enabled: true, url: "https://a.example.com/h", secret_hint: "wxyz" }, google_sheets: { prepared: true } })
  assert.ok(!JSON.stringify(clientForm({ id: "f", integration_settings: stored })).includes("v1.nonce"))
  /* A browser cannot set or replace the sealed secret: only the secret route writes it. */
  const merged = mergeIntegrations(stored, { webhook: { enabled: true, url: "https://b.example.com/h", secret_sealed: "attacker" } })
  assert.equal(merged.webhook!.secret_sealed, "v1.nonce.tag.body")
  assert.equal(merged.webhook!.url, "https://b.example.com/h")
  assert.throws(() => mergeIntegrations(stored, { webhook: { enabled: true, url: "http://b.example.com" } }), /https/)
  assert.throws(() => mergeIntegrations({}, { webhook: { enabled: true, url: "https://b.example.com/h" } }), /signing secret/)
  assert.equal(mergeIntegrations({}, { webhook: { enabled: false, url: "" } }).webhook!.enabled, false)
})

check("public reads strip the gated link and quiz results; the owner's routes stay owner-scoped", () => {
  const pub = readFileSync("app/api/forms/[id]/public/route.ts", "utf8")
  assert.match(pub, /publicDefinition\(validateDefinition\(data\.published\)\)/)
  const page = readFileSync("app/(storelib)/request/forms/[id]/page.tsx", "utf8")
  assert.match(page, /publicDefinition\(/)
  for (const file of ["app/api/leads/route.ts", "app/api/leads/[id]/route.ts", "app/api/leads/export/route.ts", "app/api/leads/[id]/files/[upload]/route.ts", "app/api/forms/[id]/route.ts", "app/api/forms/[id]/webhook/route.ts", "app/api/bookings/[id]/route.ts"]) {
    const src = readFileSync(file, "utf8")
    assert.match(src, /formActor\(\)/, file)
    assert.match(src, /owner_id", actor\.user\.id/, file)
  }
  const files = readFileSync("app/api/leads/[id]/files/[upload]/route.ts", "utf8")
  assert.match(files, /createSignedUrl\(row\.path, OWNER_LINK_SECONDS/)
})

check("the migration keeps answers immutable and every new table behind owner RLS", () => {
  const sql = readFileSync("supabase/migrations/20271130_forms_bookings.sql", "utf8")
  for (const t of ["form_uploads", "form_bookings"]) {
    assert.match(sql, new RegExp(`alter table public\\.${t} enable row level security`))
    assert.match(sql, new RegExp(`revoke all on public\\.${t} from public, anon, authenticated`))
  }
  assert.match(sql, /grant update \(status, notes, updated_at\) on public\.form_submissions to authenticated/)
  assert.doesNotMatch(sql, /grant (insert|update) on public\.form_submissions/)
  assert.doesNotMatch(sql, /\bdrop table\b|\btruncate\b|delete from/i)
  assert.match(sql, /revoke all on function public\.native_form_book\([^)]*\) from public, anon, authenticated/)
  assert.match(sql, /'form-uploads', 'form-uploads', false/)
})

console.log(`forms-security: ${passed} passed`)
