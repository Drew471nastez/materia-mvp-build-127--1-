/**
 * "A timeout is not a signed-out."
 *
 * These drive the real lib/auth/session-read.ts. The rule they protect is the
 * one that caused the random logout: four screens treated a slow
 * `getSession()` as proof that nobody was signed in, and threw signed-in people
 * onto /login and /welcome with valid sessions still sitting in storage.
 *
 * Run with:  npm run test:push
 */

import {
  readSessionBounded,
  treatAsSignedIn,
  hasStoredSessionToken,
  storedSessionKey,
} from "../lib/auth/session-read"

let passed = 0
let failed = 0
const failures: string[] = []

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail ? `\n          ${detail}` : ""}`)
  }
}
function eq(name: string, got: unknown, want: unknown) {
  const a = JSON.stringify(got)
  const b = JSON.stringify(want)
  check(name, a === b, `got ${a}\n          want ${b}`)
}
function section(title: string) {
  console.log(`\n${title}`)
}

// ── a fake device: localStorage and a supabase client, both controllable ────
const store = new Map<string, string>()
;(globalThis as any).window = globalThis
;(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
}
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abcdefgh.supabase.co"

const SESSION = { access_token: "a", refresh_token: "r", user: { id: "u1" } } as any

/** A client whose getSession resolves after `ms`, or never when ms is null. */
function client(ms: number | null, session: any = SESSION, reject = false) {
  return {
    auth: {
      getSession: () =>
        new Promise((resolve, rej) => {
          if (ms === null) return // never settles — a held lock
          setTimeout(() => (reject ? rej(new Error("boom")) : resolve({ data: { session } })), ms)
        }),
    },
  } as any
}

async function run() {
  // ──────────────────────────────────────────────────────────────────────
  section("the stored-token key")
  eq("is derived from the project ref", storedSessionKey(), "sb-abcdefgh-auth-token")

  // ──────────────────────────────────────────────────────────────────────
  section("hasStoredSessionToken — the durable evidence")
  store.clear()
  eq("nothing stored", hasStoredSessionToken(), false)
  store.set("sb-abcdefgh-auth-token", "{}")
  eq("a plain token counts", hasStoredSessionToken(), true)
  store.clear()
  store.set("sb-abcdefgh-auth-token.0", "{}")
  check("a CHUNKED token counts too — a big session must not read as signed out", hasStoredSessionToken())

  // ──────────────────────────────────────────────────────────────────────
  section("readSessionBounded — never waits forever")
  {
    const t0 = Date.now()
    const r = await readSessionBounded(client(null), 150)
    const waited = Date.now() - t0
    eq("a getSession that NEVER settles still returns", r.timedOut, true)
    check(`and returns promptly (${waited}ms)`, waited < 600)
    eq("with no session", r.session, null)
    eq("and it is not reported as a failure", r.failed, false)
  }
  {
    const r = await readSessionBounded(client(10), 500)
    eq("a fast read returns the session", r.session?.user?.id, "u1")
    eq("not timed out", r.timedOut, false)
  }
  {
    const r = await readSessionBounded(client(10, null), 500)
    eq("a genuine signed-out is a resolved null", r.session, null)
    eq("and is NOT a timeout", r.timedOut, false)
  }
  {
    const r = await readSessionBounded(client(10, null, true), 500)
    eq("a rejected read is flagged as failed", r.failed, true)
    eq("and not as a timeout", r.timedOut, false)
  }

  // ──────────────────────────────────────────────────────────────────────
  section("treatAsSignedIn — THE RULE")
  store.clear()
  store.set("sb-abcdefgh-auth-token", "{}")
  check(
    "read succeeded with a session → signed in",
    treatAsSignedIn({ session: SESSION, timedOut: false, failed: false }),
  )
  check(
    "TIMED OUT with a token on the device → STILL SIGNED IN (the whole point)",
    treatAsSignedIn({ session: null, timedOut: true, failed: false }),
  )
  check(
    "FAILED with a token on the device → still signed in",
    treatAsSignedIn({ session: null, timedOut: false, failed: true }),
  )
  check(
    "read SUCCEEDED and found nothing → signed out, even with a stale token present",
    !treatAsSignedIn({ session: null, timedOut: false, failed: false }),
  )
  store.clear()
  check(
    "timed out with NO token → nothing to go on, signed out",
    !treatAsSignedIn({ session: null, timedOut: true, failed: false }),
  )

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(`\nfailing: ${failures.join(", ")}`)
    process.exit(1)
  }
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
