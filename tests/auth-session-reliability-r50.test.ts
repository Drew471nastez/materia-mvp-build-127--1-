/**
 * ===========================================================================
 *  ROUND 50: RANDOM SIGN OUTS, AND "SIGN IN TO USE THIS" WHILE SIGNED IN
 * ===========================================================================
 * The owner: "random logging out", "constant log outs, but just bars, not
 * actually logging me out", "Sign in to use this" while signed in, in the
 * website builder editor most of all.
 *
 *   1. A token refresh Auth could not answer keeps the session: every 5xx
 *      (Cloudflare's 520 to 530 pages included), a 408, a 429, and a 4xx page
 *      that is not Auth's own JSON. Auth's own refusals still sign out.
 *      Driven through the real GoTrue client.
 *   2. One renewal per refresh token: parallel requests holding the same
 *      expired session send one refresh to Auth, and each gets the answer.
 *   3. The proxy waits for a renewal still under way (lib/auth/renewal-watch).
 *   4. The editor's agent run and section writer: a 503 for "Auth did not
 *      answer" is asked again quietly, a 401 asks the browser's session
 *      first, and only a real sign out comes back as one.
 *   5. Routes: none answers 401 straight after a raw getUser() any more; the
 *      ones the owner named go through lib/auth/route-user, and a creator row
 *      that could not be read is 503, not "Sign in to use this".
 *
 * scripts/check-auth-session-r50.mjs runs the real proxy against a stand in
 * Supabase Auth that rotates refresh tokens and ends a session on reuse, and
 * measures revoked sessions, cleared cookies and false sign in prompts.
 */
import { AuthClient, isAuthRetryableFetchError } from "@supabase/supabase-js"
import { deadlineFetch, forgetSharedRenewals, isRefreshOutageStatus, refreshAnswer, renewalCounts } from "@/lib/net/deadline"
import { watchRenewals } from "@/lib/auth/renewal-watch"
import { streamPost } from "@/lib/website-builder/ask-client"
import { fetchSignedIn, UNSURE_BODY } from "@/lib/website-builder/session-keep"
import { AUTH_UNAVAILABLE_HEADER } from "@/lib/auth/recovery-backoff"
import { readCode } from "./_source"
import { readdirSync, statSync } from "node:fs"
import { join } from "node:path"

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
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail)?.slice(0, 400)}`}`)
  }
}
const section = (name: string) => console.log(`\n${name}`)
console.warn = () => {}
console.error = () => {}

const URL_BASE = "https://project.supabase.co/auth/v1"
const REFRESH = `${URL_BASE}/token?grant_type=refresh_token`
const KEY = "sb-project-auth-token"
const realNow = Date.now.bind(Date)
let skew = 0
Date.now = () => realNow() + skew

const user = { id: "11111111-1111-4111-8111-111111111111", aud: "authenticated", role: "authenticated", email: "a@example.com", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" }
const nowS = () => Math.floor(realNow() / 1000)
const renewed = () => ({ access_token: "new-access", refresh_token: "new-refresh", token_type: "bearer", expires_in: 3600, expires_at: nowS() + 3600, user })
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
const page = (status: number) => new Response(`<!doctype html><title>${status}</title>`, { status, headers: { "content-type": "text/html" } })

function memoryStorage() {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }
}

/** The real GoTrue client with an expired stored session, a stub under deadlineFetch, and what storage holds after. */
async function refreshWith(answer: () => Response) {
  const storage = memoryStorage()
  storage.setItem(KEY, JSON.stringify({ access_token: "old-access", refresh_token: `old-refresh-${Math.random()}`, token_type: "bearer", expires_in: 3600, expires_at: nowS() - 120, user }))
  const stub = (async () => {
    /* The library retries a retryable refresh until 30s have passed on its clock: move it on so a run takes a moment. */
    skew += 11_000
    return answer()
  }) as typeof fetch
  const client = new AuthClient({
    url: URL_BASE,
    storageKey: KEY,
    storage,
    autoRefreshToken: false,
    persistSession: true,
    detectSessionInUrl: false,
    fetch: ((i: RequestInfo | URL, init?: RequestInit) => deadlineFetch(i, init, { base: stub })) as typeof fetch,
  })
  const { error } = await client.getSession()
  skew = 0
  const stored = storage.getItem(KEY)
  return { error, stored: stored ? JSON.parse(stored) : null }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

async function main() {
  section("1. A refresh Auth could not answer keeps the session")
  for (const [label, answer] of [
    ["520 page from Cloudflare", () => page(520)],
    ["522 page", () => page(522)],
    ["524 page", () => page(524)],
    ["530 page", () => page(530)],
    ["501", () => json({ message: "not implemented" }, 501)],
    ["408", () => json({ message: "timeout" }, 408)],
    ["403 page from a firewall", () => page(403)],
    ["400 with no body", () => new Response("", { status: 400 })],
  ] as const) {
    const r = await refreshWith(answer)
    check(`${label}: the session stays in storage`, !!r.stored?.refresh_token, r.stored)
    check(`  and the error is retryable, never a sign out`, !!r.error && isAuthRetryableFetchError(r.error), String(r.error))
  }
  {
    const r = await refreshWith(() => json({ code: "refresh_token_already_used", error_code: "refresh_token_already_used", msg: "Invalid Refresh Token: Already Used" }, 400))
    check("Auth's own refusal (Already Used) still signs out", r.stored === null && !!r.error && !isAuthRetryableFetchError(r.error), String(r.error))
  }
  {
    const r = await refreshWith(() => json({ code: "session_not_found", msg: "Session not found" }, 403))
    check("Auth's own 403 JSON (session_not_found) still signs out", r.stored === null, r.stored)
  }
  check("every 5xx, 408 and 429 is an outage", [500, 501, 502, 504, 520, 522, 524, 530, 599, 408, 429].every(isRefreshOutageStatus) && ![400, 401, 403, 404, 422].some(isRefreshOutageStatus))
  {
    const kept = await refreshAnswer(REFRESH, "POST", json({ error: "invalid_grant", error_description: "Invalid Refresh Token: Refresh Token Not Found" }, 400))
    check("a JSON 400 is handed back whole, body included", kept.status === 400 && /Refresh Token Not Found/.test(await kept.text()))
    const other = await refreshAnswer(`${URL_BASE}/token?grant_type=password`, "POST", page(403))
    check("a sign in's answer is never touched", other.status === 403)
  }

  section("2. One renewal per refresh token")
  {
    forgetSharedRenewals()
    let calls = 0
    const base = (async () => {
      calls++
      await sleep(80)
      return json(renewed())
    }) as typeof fetch
    const init = (t: string) => ({ method: "POST", body: JSON.stringify({ refresh_token: t }), headers: { "content-type": "application/json" } })
    const answers = await Promise.all(Array.from({ length: 10 }, () => deadlineFetch(REFRESH, init("rt-A"), { base })))
    const bodies = await Promise.all(answers.map((a) => a.json() as Promise<{ refresh_token?: string }>))
    check("10 parallel renewals of one token send one request to Auth", calls === 1, calls)
    check("  and all ten get the renewed session", answers.every((a) => a.status === 200) && bodies.every((b) => b.refresh_token === "new-refresh"), bodies)
    check("  counted as one sent and nine shared", renewalCounts.sent === 1 && renewalCounts.shared === 9, renewalCounts)
    await deadlineFetch(REFRESH, init("rt-B"), { base })
    check("another token is its own renewal", calls === 2, calls)
    const late = await deadlineFetch(REFRESH, init("rt-A"), { base })
    check("the same token again within the window is the same answer, not a second rotation", calls === 2 && late.status === 200, calls)

    let failing = 0
    const failingBase = (async () => {
      failing++
      return failing === 1 ? json({ message: "down" }, 500) : json(renewed())
    }) as typeof fetch
    const first = await deadlineFetch(REFRESH, init("rt-C"), { base: failingBase })
    const second = await deadlineFetch(REFRESH, init("rt-C"), { base: failingBase })
    check("a failed renewal is not shared: the next caller asks Auth itself", first.status === 503 && second.status === 200 && failing === 2, { first: first.status, second: second.status, failing })

    let other = 0
    const otherBase = (async () => {
      other++
      return json(renewed())
    }) as typeof fetch
    await deadlineFetch(REFRESH, init("rt-A"), { base: otherBase })
    check("a different fetch underneath shares nothing with the first", other === 1)
  }

  section("3. The proxy waits for a renewal still under way")
  {
    let saved = false
    const slow = (async (i: RequestInfo | URL) => {
      await sleep(String(i).includes("refresh_token") ? 400 : 0)
      return json({})
    }) as typeof fetch
    const w = watchRenewals(slow)
    check("no renewal, nothing to wait for", !w.started())
    void w.fetch(REFRESH, { method: "POST", body: "{}" }).then(() => {
      setTimeout(() => {
        saved = true
        w.saved()
      }, 30)
    })
    check("a renewal sent is seen", w.started())
    const t0 = realNow()
    await w.settle(5_000)
    check("settle returns once the session is saved", saved && realNow() - t0 < 1_500, realNow() - t0)
    const idle = watchRenewals(slow)
    void idle.fetch(REFRESH, { method: "POST", body: "{}" })
    const t1 = realNow()
    await idle.settle(5_000)
    check("a renewal that ends with nothing saved is waited on about a second more, not the whole ceiling", realNow() - t1 < 2_500, realNow() - t1)
    const other = watchRenewals(slow)
    void other.fetch(`${URL_BASE}/user`, {})
    check("a /user read is not a renewal", !other.started())
    const proxy = readCode("proxy.ts")
    check("proxy.ts builds its session client on the watch", /const renewalWatch = watchRenewals\(deadlineFetch\)/.test(proxy) && /global: \{ fetch: renewalWatch\.fetch \}/.test(proxy))
    check("  setAll marks the session saved", /setAll\(cookiesToSet\) \{\s*renewalWatch\.saved\(\)/.test(proxy))
    check("  and an undecided read waits for the renewal before the response leaves", /current\.state === "indeterminate" && renewalWatch\.started\(\)\) await renewalWatch\.settle\(RENEWAL_WAIT_MS\)/.test(proxy))
  }

  section("4. The editor: a refusal at the sign in check is asked about, not shown")
  {
    const realFetch = globalThis.fetch
    const answers: Response[] = []
    let sent = 0
    globalThis.fetch = (async () => {
      sent++
      return answers.shift() ?? json({ error: "no more answers" }, 500)
    }) as typeof fetch
    const unavailable = () => new Response(JSON.stringify({ error: "We could not check your sign in just now. Try again in a moment.", retry: true }), { status: 503, headers: { "content-type": "application/json", [AUTH_UNAVAILABLE_HEADER]: "unavailable" } })
    const stream = () => new Response('{"type":"op"}\n{"type":"done"}\n', { status: 200, headers: { "content-type": "application/x-ndjson" } })
    const wait = async () => {}
    const lines: unknown[] = []
    const opts = () => ({ signal: new AbortController().signal, onLine: (l: unknown) => void lines.push(l) })

    answers.push(unavailable(), stream())
    let r = await streamPost("/api/website-builder/themes/i/agent", "{}", opts(), { wait, renew: async () => "renewed" })
    check("agent run: Auth did not answer once, asked again quietly, and the run streams", r.ok && sent === 2 && lines.length === 2, { r, sent })

    sent = 0
    answers.push(unavailable(), unavailable(), unavailable())
    r = await streamPost("/api/website-builder/themes/i/agent", "{}", opts(), { wait, renew: async () => "renewed" })
    check("  Auth still silent after the quiet tries: a 503 with Try again, never a 401", !r.ok && r.status === 503 && sent === 3 && !/sign in to use/i.test(r.error ?? ""), { r, sent })

    sent = 0
    let renews = 0
    answers.push(json({ error: "Sign in to use this." }, 401), stream())
    r = await streamPost("/api/website-builder/themes/i/agent", "{}", opts(), { wait, renew: async () => (renews++, "renewed") })
    check("  a 401 renews the browser's session and sends the run again", r.ok && sent === 2 && renews === 1, { r, sent })

    sent = 0
    answers.push(json({ error: "Sign in to use this." }, 401))
    r = await streamPost("/api/website-builder/themes/i/agent", "{}", opts(), { wait, renew: async () => "unsure" })
    check("  a 401 the browser could not settle is a 503 with Try again", !r.ok && r.status === 503 && r.error === UNSURE_BODY.error, r)

    sent = 0
    answers.push(json({ error: "Sign in to use this." }, 401))
    r = await streamPost("/api/website-builder/themes/i/agent", "{}", opts(), { wait, renew: async () => "signed-out" })
    check("  a real sign out is still a 401", !r.ok && r.status === 401 && sent === 1, r)

    sent = 0
    answers.push(json({ error: "Sign in to use this." }, 401), json({ error: "Sign in to use this." }, 401))
    r = await streamPost("/api/website-builder/themes/i/agent", "{}", opts(), { wait, renew: async () => "renewed" })
    check("  renewed and still refused: asked once, not in a loop", !r.ok && r.status === 401 && sent === 2, { r, sent })

    sent = 0
    answers.push(unavailable(), json({ ok: true }))
    const saved = await fetchSignedIn(() => fetch("/api/x", { method: "PUT", body: "{}" }), undefined, { wait })
    check("a save or a section write (fetchSignedIn): Auth silent once, asked again quietly", saved.status === 200 && sent === 2, { status: saved.status, sent })
    globalThis.fetch = realFetch

    const chat = readCode("components/website-builder/theme-chat.tsx")
    check("the section writer sends through fetchSignedIn", /fetchSignedIn\(\(\) => fetch\(`\/api\/website-builder\/themes\/\$\{installId\}\/sections\/code`, sectionInit\)\)/.test(chat))
  }

  section("5. Routes: Auth not answering is 503 with Try again, never \"Sign in\"")
  {
    const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
      const p = join(dir, n)
      return statSync(p).isDirectory() ? walk(p) : p.endsWith("route.ts") ? [p] : []
    })
    const raw = /const \{\s*data:\s*\{\s*user\s*\},?\s*\}\s*=\s*await\s+(?:\(await createClient\(\)\)|\w+)\.auth\.getUser\(\)\s*\n[ \t]*if \(!user\)\s*\{?\s*return\b[^\n]*(?:status:\s*401|,\s*401\s*\))/
    const left = walk(join(process.cwd(), "app/api")).filter((f) => raw.test(readCode(f.slice(process.cwd().length + 1))))
    check("no API route answers 401 straight after a raw getUser()", left.length === 0, left.map((f) => f.slice(process.cwd().length + 1)))
    for (const f of [
      "app/api/website-builder/themes/[installId]/agent/route.ts",
      "app/api/website-builder/themes/[installId]/agent/decide/route.ts",
      "app/api/website-builder/themes/[installId]/sections/code/route.ts",
      "app/api/website-builder/themes/[installId]/sections/code/fix/route.ts",
      "app/api/ai/seo/route.ts",
      "app/api/community/[communityId]/invite/redeem/route.ts",
      "app/api/website-builder/transcribe/route.ts",
      "app/api/website-builder/themes/[installId]/agent-connections/route.ts",
    ]) {
      const code = readCode(f)
      check(`${f.replace("app/api/", "")}: routeUser, and 503 when Auth did not answer`, /await routeUser\(/.test(code) && /authUnavailableResponse\(\)/.test(code) && !/auth\.getUser\(\)/.test(code))
    }
    const chat = readCode("lib/website-builder/agent/chat.ts")
    check("the editor's chat routes (ownThemeInstall): 503 when Auth did not answer", /if \(who\.kind === "unavailable"\) return \{ ok: false, status: 503 \}/.test(chat))
    const keys = readCode("app/api/ai-keys/route.ts")
    check("ai-keys: a creator row that could not be read is 503, not \"Sign in to use this\"", (keys.match(/if \(creatorId === "unavailable"\) return authUnavailableResponse\(\)/g) ?? []).length === 3)
    check("ai-models: the same", /if \(creatorId === "unavailable"\) return authUnavailableResponse\(\)/.test(readCode("app/api/ai-models/route.ts")))
    const current = readCode("lib/creators/current.ts")
    check("creatorIdOf throws on a failed read instead of answering null", /dataOrThrow\("creator id"/.test(current) && /export async function routeCreatorId/.test(current))
    const session = readCode("app/api/app/session/route.ts")
    check("the Android launcher's session check: Auth silent is not loggedIn: false", /if \(who\.kind === "unavailable"\) return NextResponse\.json\(\{ loggedIn: true, type: "unknown" \}/.test(session))
  }

  Date.now = realNow
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
}

main().catch((e) => {
  process.stdout.write(`${e instanceof Error ? e.stack : String(e)}\n`)
  process.exit(1)
})
