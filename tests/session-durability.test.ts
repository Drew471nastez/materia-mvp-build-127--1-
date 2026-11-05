/**
 * ===========================================================================
 *  "IT LOGS ME OUT AND I DID NOT DO ANYTHING"
 * ===========================================================================
 * lib/auth/session-read.ts already says it on the client: a timeout is not a
 * signed-out. Its header points at a server-side counterpart that draws the
 * same distinction, and that file did not exist. Meanwhile the mistake it
 * names was live in every server guard in the app:
 *
 *     const { data: { user } } = await supabase.auth.getUser()
 *     if (!user) redirect("/login")
 *
 * `error` is discarded, so three different outcomes become one. "Nobody is
 * signed in", "this token is revoked", and "Supabase did not answer" are not
 * the same event, and only the first two are a sign-out.
 *
 * proxy.ts runs that on EVERY matched request, so the dice were rolled all
 * day. Rare, random, correlated with nothing anybody did, impossible to
 * reproduce on purpose. That is the report.
 *
 * What is checked here:
 *
 *   1. THE CLASSIFIER IS DRIVEN, against the error shapes supabase-js really
 *      produces. A revoked token still signs you out; a 502 does not.
 *   2. THE RETRY IS REAL, and only for the undetermined case.
 *   3. THE GUARDS USE IT, by reading the source, so a new guard written next
 *      year that reaches for the old pattern is visible.
 *   4. THE REDIRECT CARRIES ITS COOKIES, which was a second, worse bug: a
 *      rotated refresh token written onto a response that was then thrown
 *      away.
 *
 * Run with:  npm run test:push
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"
import Module from "node:module"

import type { AuthState } from "../lib/auth/current-user"

/**
 * `import "server-only"` throws outside a server bundle, and keeping that
 * guard on the module is the point: it is what stops a helper that reads
 * cookies from ever being pulled into a client bundle. So it is stubbed here
 * for the length of one import rather than removed from the source.
 *
 * The classifier is then RUN, not read. Checking that a file mentions the
 * right function name proves nothing about what a 502 does to somebody's
 * session; calling it with the error shapes supabase-js produces does.
 */
const load = (Module as unknown as { _load: (r: string, ...rest: unknown[]) => unknown })._load
;(Module as unknown as { _load: unknown })._load = function (request: string, ...rest: unknown[]) {
  if (request === "server-only") return {}
  return load.call(this, request, ...rest)
}

/** Required, not awaited: the runner compiles these to CJS. */
const { readCurrentUser, shouldSendToLogin } =
  Module.createRequire(import.meta.url)("../lib/auth/current-user") as typeof import("../lib/auth/current-user")

const root = process.cwd()
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
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`)
  }
}

/** A stand-in for the auth half of a Supabase client. */
function fakeSupabase(answers: Array<{ user?: unknown; error?: unknown; hang?: boolean }>) {
  let i = 0
  const calls = { n: 0 }
  return {
    calls,
    client: {
      auth: {
        getUser: async () => {
          calls.n++
          const a = answers[Math.min(i++, answers.length - 1)]
          if (a.hang) return await new Promise(() => {})
          return { data: { user: a.user ?? null }, error: a.error ?? null }
        },
      },
    } as never,
  }
}

async function main() {
  console.log("\nA blip must never be mistaken for a sign-out")

  // ── 1. The three outcomes ──────────────────────────────────────────────
  {
    const signedIn = fakeSupabase([{ user: { id: "u1" } }])
    const r1 = await readCurrentUser(signedIn.client)
    check("a real user is authenticated", r1.state === "authenticated" && r1.user !== null, r1.state)
    check("and is not sent to a login form", !shouldSendToLogin(r1))
    check("and is not retried, because the question was answered", signedIn.calls.n === 1, `${signedIn.calls.n} calls`)

    const nobody = fakeSupabase([{ user: null, error: null }])
    const r2 = await readCurrentUser(nobody.client)
    check("no user and no error is anonymous", r2.state === "anonymous", r2.state)
    check("and IS sent to a login form", shouldSendToLogin(r2))
    check("and is not retried either", nobody.calls.n === 1, `${nobody.calls.n} calls`)
  }

  // ── 2. The error shapes supabase-js actually produces ──────────────────
  const cases: Array<[string, unknown, AuthState]> = [
    /**
     * THE ONE FROM THE PRODUCTION LOG. Seen on /native-start:
     * "Invalid Refresh Token: Refresh Token Not Found". The session really is
     * finished, so this must still sign people out or a dead session keeps
     * somebody trapped in a broken app.
     */
    ["a revoked refresh token", { code: "refresh_token_not_found", status: 400, name: "AuthApiError" }, "anonymous"],
    ["a reused refresh token", { code: "refresh_token_already_used", status: 400, name: "AuthApiError" }, "anonymous"],
    ["a session that is gone", { code: "session_not_found", status: 404, name: "AuthApiError" }, "anonymous"],
    ["a deleted user", { code: "user_not_found", status: 404, name: "AuthApiError" }, "anonymous"],
    ["a malformed jwt", { code: "bad_jwt", status: 401, name: "AuthApiError" }, "anonymous"],
    ["no token at all", { name: "AuthSessionMissingError", message: "Auth session missing!", status: 400 }, "anonymous"],
    ["a rejected token", { status: 401, name: "AuthApiError", message: "Unauthorized" }, "anonymous"],

    /** And the ones that were costing people their sessions. */
    ["the request never completed", { name: "AuthRetryableFetchError", status: 0 }, "indeterminate"],
    ["the auth service 502ed", { status: 502, name: "AuthApiError", message: "Bad gateway" }, "indeterminate"],
    ["the auth service 503ed", { status: 503, name: "AuthApiError" }, "indeterminate"],
    ["fetch failed outright", { message: "fetch failed", name: "TypeError" }, "indeterminate"],
    ["the socket timed out", { message: "network timeout at https://x.supabase.co", name: "FetchError" }, "indeterminate"],
    ["something nobody has seen before", { message: "???", name: "Weird" }, "indeterminate"],
  ]

  for (const [label, error, expected] of cases) {
    const { client } = fakeSupabase([{ user: null, error }])
    const r = await readCurrentUser(client, { retries: 0 })
    check(`${label} reads as ${expected}`, r.state === expected, `got ${r.state}`)
  }

  // ── 3. The retry ───────────────────────────────────────────────────────
  {
    /** A blip that clears is the common case, and it must not cost a session. */
    const blip = fakeSupabase([
      { user: null, error: { name: "AuthRetryableFetchError", status: 0 } },
      { user: { id: "u1" } },
    ])
    const r = await readCurrentUser(blip.client)
    check("a blip that clears on the retry keeps the session", r.state === "authenticated", r.state)
    check("and it took exactly two goes", blip.calls.n === 2, `${blip.calls.n} calls`)

    const down = fakeSupabase([{ user: null, error: { status: 503 } }])
    const r2 = await readCurrentUser(down.client)
    check("a failure that persists is still not a sign-out", r2.state === "indeterminate", r2.state)
    check("and it is never sent to a login form", !shouldSendToLogin(r2))
    check("it says why, for the log", typeof r2.reason === "string" && r2.reason.length > 0, String(r2.reason))

    /** A definite answer is never retried: that would slow every page down. */
    const gone = fakeSupabase([{ user: null, error: { code: "refresh_token_not_found" } }, { user: { id: "u1" } }])
    await readCurrentUser(gone.client)
    check("a definite sign-out is not re-asked", gone.calls.n === 1, `${gone.calls.n} calls`)
  }

  // ── 4. It cannot hang ──────────────────────────────────────────────────
  {
    const started = Date.now()
    const { client } = fakeSupabase([{ hang: true }])
    const r = await readCurrentUser(client, { timeoutMs: 150, retries: 1 })
    const took = Date.now() - started
    check("a hung call is bounded", took < 2_000, `${took}ms`)
    check("and a hang is not a sign-out", r.state === "indeterminate", r.state)
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  THE GUARDS THEMSELVES
  // ═══════════════════════════════════════════════════════════════════════
  const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ")

  {
    const proxy = strip(readFileSync(join(root, "proxy.ts"), "utf8"))
    check("the proxy classifies instead of guessing", proxy.includes("readCurrentUser") || proxy.includes("readVerifiedSession"))
    check(
      "and only a definite anonymous is redirected",
      /shouldSendToLogin\(current\)/.test(proxy) && !/!user\s*\)\s*\{[\s\S]{0,120}pathname = "\/login"/.test(proxy),
    )
    /**
     * THE SECOND BUG, AND THE WORSE ONE. NextResponse.redirect builds a NEW
     * response, so every Set-Cookie the Supabase client had just written was
     * discarded — including a ROTATED refresh token. Supabase had retired the
     * old one, the browser never got its replacement, and the next request had
     * nothing that worked. A sign-out caused by the redirect itself, and one
     * that survives a restart.
     */
    check(
      "and a redirect carries the cookies that were just written",
      /supabaseResponse\.cookies\.getAll\(\)\)\s*redirect\.cookies\.set\(cookie\)/.test(proxy.replace(/\s+/g, " ")) ||
        /for \(const cookie of supabaseResponse\.cookies\.getAll\(\)\) redirect\.cookies\.set\(cookie\)/.test(proxy),
    )
  }

  /**
   * A layout may call readCurrentUser directly, or through the per-request
   * cache in lib/auth/request-scope.ts, which exists so a layout and the page
   * inside it do not both put the question on the wire. It decides nothing of
   * its own, and this checks that: it has to reach readCurrentUser, and it
   * must not carry any redirect or classification logic.
   */
  const requestScope = strip(readFileSync(join(root, "lib/auth/request-scope.ts"), "utf8"))
  check(
    "the per-request cache asks the real reader and decides nothing itself",
    requestScope.includes("readCurrentUser") &&
      requestScope.includes("cache(") &&
      !/redirect\(/.test(requestScope) &&
      !/state === "/.test(requestScope),
  )

  for (const layout of ["app/(storelib)/app/layout.tsx", "app/(storelib)/account/library/layout.tsx"]) {
    const code = strip(readFileSync(join(root, layout), "utf8"))
    check(
      `${layout} classifies instead of guessing`,
      code.includes("readCurrentUser") || code.includes("currentUserForRequest"),
    )
    check(
      `${layout} never reads the user straight off the auth client`,
      !/auth\.getUser\(\)/.test(code),
      "getUser() throws the error away, and the error is the whole distinction",
    )
    check(
      `${layout} does not send an undetermined request to /login`,
      /current\.state === "indeterminate"/.test(code),
    )
  }

  {
    /**
     * Recovery reloads the page. Unbounded, that is a page that reloads
     * itself forever while somebody watches it.
     */
    const gate = readFileSync(join(root, "components/native-auth-gate.tsx"), "utf8")
    check("recovery is counted", gate.includes("noteRecovery") && gate.includes("MAX_RECOVERIES"))
    /* Changed on purpose (round net-1028): the navigation is a form post (postSessionSync), tokens out of the address. */
    check("counted before navigating, so a reload loop counts itself", /noteRecovery\(\)\s*\n\s*postSessionSync\(/.test(gate))
    check("and cleared when a layout finally renders", /clearRecoveries\(\)/.test(gate))
    check(
      "a slow read with a session on the device does not go to /login",
      /hasStoredSessionToken\(\)\) setStuck\(true\)/.test(gate),
    )
    check("and the screen it shows does not claim they were signed out", /You are still signed in/.test(gate))
    check(
      "nor does it say the session expired",
      !/session (has )?expired|signed you out|log in again/i.test(gate.slice(gate.indexOf("if (stuck)"), gate.indexOf("if (stuck)") + 1200)),
    )
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main()
