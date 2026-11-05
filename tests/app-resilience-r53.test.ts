/**
 * Round 53: a slow or failing database read degrades only the part that
 * needs it.
 *
 * The owner: "I still sometimes get things not responding across the whole
 * app, and 'Storelib is not answering right now'." That screen was the /app
 * layout's answer to ONE failed read of the profile or the creator row, on a
 * full load, a pull to refresh, and every save that refreshes the page; and
 * the shell waited, with no ceiling, for every read it draws from.
 * scripts/check-app-resilience-r53.mjs counts it in Chromium against a stand
 * in database that is slow (2 to 10 s) or fails 10% and 30% of requests.
 *
 * This suite runs the shell's real readers (lib/auth/request-scope) against
 * a stand in PostgREST, the last good store (lib/net/last-good), the log out
 * helper (lib/auth/log-out), and pins the layout, Home and Settings.
 *
 * Run with:  npm run test:push
 */
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://stub.supabase.local"
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key-for-tests"
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key-for-tests-long-enough"

import { readCode } from "./_source"
import { LastGood, LAST_GOOD_MS } from "../lib/net/last-good"
import { creatorOrThrowForRequest, profileOrThrowForRequest, RETRY_PAUSE_MS } from "../lib/auth/request-scope"
import { endDeviceSession } from "../lib/auth/log-out"
import { isServiceUnavailable } from "../lib/net/service-error"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail !== undefined ? `\n          ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`)
  }
}
const section = (s: string) => console.log(`\n▸ ${s}`)

/* ── A stand in PostgREST: each table answers from a script of outcomes ── */
type Outcome = "ok" | "none" | 503 | 500 | 504 | "reset"
const script: Record<string, Outcome[]> = {}
const asked: Record<string, number> = {}
const ROWS: Record<string, Record<string, unknown>> = {
  profiles: { display_name: "Ana", avatar_url: null, username: "ana", email_verified: true, is_creator: true, welcome_completed: true },
  creators: { id: "c-1", user_id: "u-1", slug: "ana", username: "ana", display_name: "Ana", avatar_url: null, bio: null, onboarding_completed: true, payouts_enabled: false, charges_enabled: false, store_published: true },
}
globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url)
  const table = url.pathname.replace("/rest/v1/", "")
  /* The creator's private half is the service role's read: always answered, so the public half is what is under test. */
  const isPrivate = table === "creators" && (url.searchParams.get("select") || "").startsWith("stripe_onboarding_status")
  const key = isPrivate ? "creators-private" : table
  asked[key] = (asked[key] ?? 0) + 1
  const next: Outcome = isPrivate ? "ok" : (script[key]?.shift() ?? "ok")
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
  if (next === "reset") throw new TypeError("fetch failed")
  if (next === 503) return json(503, { message: "upstream unavailable" })
  if (next === 500) return json(500, { code: "57014", message: "canceling statement due to statement timeout", details: null, hint: null })
  if (next === 504) return json(504, { code: "PGRST003", message: "Timed out acquiring connection from connection pool.", details: null, hint: null })
  if (next === "none") return json(200, [])
  return json(200, [isPrivate ? { stripe_onboarding_status: null, stripe_account_id: null, subscription_plan_id: "free" } : ROWS[table]])
}) as typeof fetch

async function settle<T>(p: Promise<T>): Promise<{ value?: T; error?: unknown }> {
  try {
    return { value: await p }
  } catch (error) {
    return { error }
  }
}

async function main() {
  section("1. The last good store")
  let clock = 1_000
  const store = new LastGood(2, () => clock)
  store.remember("a", { n: 1 })
  check("a kept row comes back", (store.recall<{ n: number }>("a")?.n ?? 0) === 1)
  clock += LAST_GOOD_MS + 1
  check("and not past its age", store.recall("a") === undefined)
  store.remember("a", 1)
  store.remember("b", 2)
  store.remember("c", 3)
  check("bounded: the oldest key goes first", store.recall("a") === undefined && store.recall("b") === 2 && store.recall("c") === 3 && store.size === 2)
  store.forget("b")
  check("forget drops a key", store.recall("b") === undefined)

  section("2. The shell's two rows: asked again once, then the last good copy, then a failure")
  check("the pause before the second try is short", RETRY_PAUSE_MS > 0 && RETRY_PAUSE_MS <= 500)

  script.profiles = [503, "ok"]
  asked.profiles = 0
  const t0 = Date.now()
  const blip = await settle(profileOrThrowForRequest("u-1"))
  check("a 503 (not asked again by the fetch underneath) is asked again here and answers", !blip.error && (blip.value as { username?: string } | null)?.username === "ana", blip.error ? String(blip.error) : blip.value)
  check("  one more request, after the pause", asked.profiles === 2 && Date.now() - t0 >= RETRY_PAUSE_MS, { asked: asked.profiles })

  script.profiles = [500, 500]
  asked.profiles = 0
  const kept = await settle(profileOrThrowForRequest("u-1"))
  check("two failures in a row: the copy read a moment ago stands in, no screen", !kept.error && (kept.value as { username?: string } | null)?.username === "ana", kept.error ? String(kept.error) : kept.value)

  script.profiles = [500, 500]
  const stranger = await settle(profileOrThrowForRequest("u-2"))
  check("somebody else's copy never does: a person with none gets the failure", isServiceUnavailable(stranger.error))

  script.creators = ["reset", 503, 503]
  const creatorKept = await settle(creatorOrThrowForRequest("u-1"))
  check("the creator row: a dropped connection (asked again underneath), then two 503s, and no copy yet: the failure is handed on", isServiceUnavailable(creatorKept.error))
  script.creators = ["ok"]
  await settle(creatorOrThrowForRequest("u-1"))
  script.creators = [503, 503]
  const creatorAgain = await settle(creatorOrThrowForRequest("u-1"))
  check("  and once read, a failed read stands on it", !creatorAgain.error && (creatorAgain.value as { id?: string } | null)?.id === "c-1", creatorAgain.error ? String(creatorAgain.error) : creatorAgain.value)

  script.profiles = ["none"]
  const gone = await settle(profileOrThrowForRequest("u-1"))
  check("an answer of no row is no row, never the kept copy", !gone.error && gone.value === null)
  script.profiles = [500, 500]
  const afterGone = await settle(profileOrThrowForRequest("u-1"))
  check("  and the copy is forgotten with it", isServiceUnavailable(afterGone.error))

  section("3. The /app layout: never the whole screen, gates only from rows that were read")
  const layout = readCode("app/(storelib)/app/layout.tsx")
  check("the whole page screen is gone from the shell", !/<ServiceUnavailable\b/.test(layout) && !/components\/app\/service-unavailable/.test(layout))
  check("the two rows have a ceiling (SHELL_ROWS_MS) and a failure is 'not known', not a throw", /const SHELL_ROWS_MS = 6_000/.test(layout) && /resolve\(TIMED_OUT\), SHELL_ROWS_MS/.test(layout) && /if \(isServiceUnavailable\(e\)\) return TIMED_OUT/.test(layout))
  check("email and seller gates are decided only when the rows are known", /if \(known && !gateCheck\?\.email_verified\)/.test(layout) && /if \(known\) \{\s*const landing = appLanding/.test(layout))
  check("nobody is sent to /sell on a membership read that failed", /&& !memberRead\.failed\) \{\s*redirect\("\/sell"\)/.test(layout))
  check("every decoration has a ceiling: OnePage, team stores, ring, communities, currency", /within\(\s*Promise\.resolve\(supabase\.from\("onepages"\)/.test(layout) && /within\(teamStoresReadForRequest\(user\.id\), SHELL_EXTRA_MS/.test(layout) && /within\(ringRead, SHELL_SETUP_MS, null\)/.test(layout) && /within\(communitiesEnabled\(\), SHELL_SETUP_MS, false\)/.test(layout) && /within\(cachedStoreCurrency\(creator\.id\), SHELL_SETUP_MS, null\)/.test(layout))
  check("the ring is left out rather than drawn with a wrong count", /setupProgress=\{setup \? \{ completed: setup\.completed, total: setup\.total \} : undefined\}/.test(layout))
  check("drawn from a copy or the session alone, the shell asks again by itself", /\{refill \? <ShellRefill \/> : null\}/.test(layout))
  const refill = readCode("components/app/shell-refill.tsx")
  check("  in a transition, twice at most, never while one is on its way, and when back online", /startTransition\(\(\) => router\.refresh\(\)\)/.test(refill) && /REFILL_WAITS_MS = \[4_000, 15_000\]/.test(refill) && /if \(pendingRef\.current \|\| navigator\.onLine === false\)/.test(refill) && /addEventListener\("online"/.test(refill))

  section("4. Home: Getting started's reads have ceilings and a kept copy")
  const home = readCode("app/(storelib)/app/page.tsx")
  check("products, domains, the website and the counts each within HOME_PROGRESS_MS", (home.match(/HOME_PROGRESS_MS,?\s*LATE\)?/g) ?? []).length >= 4)
  check("the creator read is asked again once, then stands on the last good row", /lastGood\.recall<Awaited<ReturnType<typeof readHomeCreator>>>\(key\)/.test(home))
  check("late facts: the kept ones, else Home asks again in the browser", /progressPartial=\{progressLate && !keptFacts\}/.test(home) && /partial \|\| hasInAppHistory\(\) \? whenIdle\(ask\)/.test(readCode("components/app/home/use-home-progress.ts")))

  section("5. Log out ends the session on this device whatever Supabase Auth answers")
  const calls: string[] = []
  const serverOk = (async (url: string, init?: RequestInit) => {
    calls.push(`${init?.method} ${url} ${init?.body}`)
    return new Response(JSON.stringify({ ok: true, auth: false }), { status: 200, headers: { "content-type": "application/json" } })
  }) as unknown as typeof fetch
  const authFails = { signOut: async () => ({ error: { status: 500, message: "upstream" } }) }
  const local = await endDeviceSession("local", authFails, serverOk)
  check("Auth's logout failed (the cookie stayed): the server ends it", local.ended && calls.some((c) => c.startsWith("POST /api/auth/logout") && c.includes('"scope":"local"')), { local, calls })
  const offline = await endDeviceSession("local", { signOut: async () => { throw new TypeError("fetch failed") } }, (async () => { throw new TypeError("fetch failed") }) as unknown as typeof fetch)
  check("neither reachable: not ended, and the caller says so", !offline.ended)
  const server503 = (async () => new Response(JSON.stringify({ auth: false }), { status: 503 })) as unknown as typeof fetch
  const everywhere = await endDeviceSession("global", authFails, server503)
  check("everywhere that Auth did not do ends nothing", !everywhere.ended && !everywhere.everywhere)
  const everywhereOk = await endDeviceSession("global", { signOut: async () => ({ error: null }) }, serverOk)
  check("everywhere that Auth did is ended", everywhereOk.ended && everywhereOk.everywhere)

  const route = readCode("app/api/auth/logout/route.ts")
  check("the route expires every session cookie whatever Auth said", /for \(const c of jar\.getAll\(\)\) \{\s*if \(SESSION_COOKIE\.test\(c\.name\)\) jar\.set\(c\.name, "", \{ path: "\/", maxAge: 0 \}\)/.test(route))
  check("  same origin only; everywhere that failed is a 503 with nothing ended", /if \(!sameOrigin\(request\)\) return NextResponse\.json\(\{ error: "Forbidden" \}, \{ status: 403 \}\)/.test(route) && /if \(scope === "global" && !auth\) \{\s*return NextResponse\.json/.test(route))
  check("  a form post (a press before the script ran) goes on to the front page", /if \(form\) return NextResponse\.redirect\(new URL\("\/", request\.url\), \{ status: 303/.test(route))
  const settings = readCode("components/account/account-settings.tsx")
  check("Settings' Log out is a form posting there, handled in place once the script runs", /<form\s+method="post"\s+action="\/api\/auth\/logout"/.test(settings) && /e\.preventDefault\(\)\s*void logOut\("local"\)/.test(settings) && /type="submit"\s+disabled=\{!!leaving\}\s+data-account-logout=""/.test(settings))
  check("  and loads the front page whole after", /else window\.location\.assign\("\/"\)/.test(settings) && /endDeviceSession\(scope, createClient\(\)\.auth\)/.test(settings))
  check("every other Log out goes through the same helper", ["components/app/settings-form-new.tsx", "components/app/sidebar.tsx", "components/platform/platform-header-client.tsx"].every((f) => /endDeviceSession\("(local|global)"/.test(readCode(f))))

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
