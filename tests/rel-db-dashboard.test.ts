/**
 * DATABASE AND CREATOR DASHBOARD RELIABILITY (round rel-db, fix phase)
 *
 * 1. NO RAW CLIENT. Every server module under app/ and lib/ that talks to
 *    Supabase goes through the shared factories (lib/supabase/*), whose fetch
 *    gives every request a deadline (lib/net/deadline.ts). A client built from
 *    @supabase/supabase-js by hand waits up to undici's 300s instead. The few
 *    files owned by other areas (payments, Mailgun, crons, auth) are listed
 *    by name and reported, not changed here.
 */
import { readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { readCode } from "./_source"

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
    console.log(`  FAIL  ${label}${detail === undefined ? "" : `  ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`)
  }
}

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(f) ? [p] : []
  })

/* Raw clients in files another area owns: reported for that area, not changed in this round. */
const OWNED_ELSEWHERE = new Set([
  "app/api/stripe/webhook/route.ts",
  "app/api/stripe/webhook/connect/route.ts",
  "lib/stripe/connect-webhook.ts",
  "app/api/webhooks/mailgun/route.ts",
  "app/api/cron/process-scheduled-emails/route.ts",
  "app/api/auth/unconfirmed-account/route.ts",
])

async function run() {
  console.log("\n1. Every server Supabase client has a deadline")
  const raw: string[] = []
  for (const file of [...walk("app"), ...walk("lib")]) {
    if (file.startsWith("lib/supabase/")) continue
    const src = readCode(file)
    if (/^\s*["']use client["']/m.test(src)) continue
    /* createClient imported from supabase-js itself, under any local name */
    const m = src.match(/import\s*\{([^}]*)\}\s*from\s*["']@supabase\/supabase-js["']/)
    if (!m) continue
    const local = m[1].split(",").map((s) => s.trim()).find((s) => /^createClient(\s+as\s+\w+)?$/.test(s))
    if (!local) continue
    const name = local.includes(" as ") ? local.split(/\s+as\s+/)[1] : "createClient"
    const calls = [...src.matchAll(new RegExp(`\\b${name}\\(([\\s\\S]*?)\\n\\s*\\}?\\)`, "g"))]
    /* A call that passes the shared fetch is bounded; anything else waits on bare fetch. */
    const bounded = calls.length > 0 && calls.every((c) => /global:\s*\{\s*fetch:\s*(mediaFetch|deadlineFetch)/.test(c[1]))
    if (!bounded) raw.push(file)
  }
  const mine = raw.filter((f) => !OWNED_ELSEWHERE.has(f))
  check("no raw @supabase/supabase-js createClient outside lib/supabase (except files owned elsewhere)", mine.length === 0, mine)
  for (const f of [
    "app/api/domains/cleanup/route.ts",
    "app/api/wishlist/route.ts",
    "app/api/wishlist/check/route.ts",
    "app/api/wishlist/merge/route.ts",
    "app/api/security/confirm-device/route.ts",
    "app/api/security/verify-email/route.ts",
  ]) {
    check(`  ${f} uses createAdminClient from @/lib/supabase/admin`, /import \{ createAdminClient \} from "@\/lib\/supabase\/admin"/.test(readCode(f)) && !/@supabase\/supabase-js/.test(readCode(f)))
  }
  check("  business login's anon client passes the shared fetch", /global: \{ fetch: mediaFetch \}/.test(readCode("lib/businesses/server.ts")))
  const wish = readCode("app/api/wishlist/route.ts")
  check("  the wishlist still answers empty (not a 500) when the service key is missing", /if \(!url \|\| !key\) \{[\s\S]*?return null[\s\S]*?\}\s*return createAdminClient\(\)/.test(wish))
  if (raw.some((f) => OWNED_ELSEWHERE.has(f))) console.log(`  note  still raw, owned by another area: ${raw.filter((f) => OWNED_ELSEWHERE.has(f)).join(", ")}`)

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
