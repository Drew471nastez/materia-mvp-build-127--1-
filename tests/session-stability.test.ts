/**
 * ===========================================================================
 *  "SOMETIMES IT JUST LOGS PEOPLE OUT, ESPECIALLY AS WE SHIP"
 * ===========================================================================
 * Each cause found, and the check that holds its fix in place:
 *
 *   1. PAGES REDIRECTED ON A BLIP. The /app layout had learned that "Supabase
 *      did not answer" is not "nobody is signed in"; the pages beside it,
 *      rendered at the same moment, had not, and their redirect("/login")
 *      won. Cold functions after a deploy make that answer slow more often.
 *      Pages now ask lib/auth/page-user.ts.
 *
 *   2. EVERY SIGN OUT BUTTON SIGNED YOU OUT EVERYWHERE. supabase-js signs out
 *      with scope "global" unless told otherwise, which revokes every session
 *      the person has: signing out on a phone ended the laptop's session too.
 *
 *   3. THE PHONE HELD ONE SESSION IN TWO PLACES that renewed separately
 *      (Preferences and the WebView's cookies). Two renewals apart, Supabase
 *      reads the older copy as a replayed token and revokes the session.
 *      lib/supabase/session-jar.ts keeps them as one.
 *
 *   4. A DROPPED CONNECTION READ AS SIGNED OUT on the client: the gate's
 *      getSession() and the email editor's getUser() went to /login on any
 *      null, and the durable evidence check never looked at the web's cookie.
 *
 *   5. THE PROXY REBUILT ITS RESPONSE FROM A SECOND COPY OF ITS RULES when the
 *      session was renewed, and that copy did not pass the renewed request on.
 *
 * The proxy's real behaviour, with real cookies and a stubbed Supabase, is
 * measured by scripts/check-session-proxy.mjs.
 *
 * Run with:  npm run test:push
 */
import { readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { readCode } from "./_source"
import { classifyAuthError, isSignedOutAnswer } from "../lib/auth/auth-error"
import {
  fresherSession,
  parseCookieHeader,
  readSessionFromCookies,
  sessionCookieRemovals,
  sessionCookieWrites,
  storedSessionKey,
} from "../lib/supabase/session-jar"

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

/* ── A fake browser: a cookie jar that honours max-age=0, and localStorage ── */
const cookies = new Map<string, string>()
const local = new Map<string, string>()
;(globalThis as any).window = globalThis
;(globalThis as any).location = { protocol: "https:" }
;(globalThis as any).localStorage = {
  getItem: (k: string) => (local.has(k) ? local.get(k)! : null),
  setItem: (k: string, v: string) => void local.set(k, String(v)),
  removeItem: (k: string) => void local.delete(k),
  key: (i: number) => [...local.keys()][i] ?? null,
  get length() {
    return local.size
  },
}
;(globalThis as any).document = {
  get cookie() {
    return [...cookies].map(([k, v]) => `${k}=${v}`).join("; ")
  },
  set cookie(line: string) {
    const [pair, ...attrs] = line.split(";")
    const eq = pair.indexOf("=")
    const name = pair.slice(0, eq).trim()
    const value = pair.slice(eq + 1).trim()
    if (attrs.some((a) => /^\s*max-age=0\s*$/i.test(a))) cookies.delete(name)
    else cookies.set(name, value)
  },
}
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abcdefgh.supabase.co"
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon"

const KEY = "sb-abcdefgh-auth-token"
const session = (rt: string, exp: number, pad = 0) =>
  JSON.stringify({ access_token: `a-${rt}`, refresh_token: rt, expires_at: exp, user: { id: "u1", note: "x".repeat(pad) } })

/** Every app/ source file that renders a page or guards one. */
function guardFiles(dir = "app"): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      if (p === join("app", "api")) continue
      out.push(...guardFiles(p))
    } else if (/^(page|layout)\.tsx$|^_server\.ts$|^load-[\w-]+\.ts$/.test(name)) out.push(p)
  }
  return out
}

async function main() {
  console.log("\n1. A dropped connection is never read as a sign-out")
  {
    const cases: Array<[string, unknown, boolean]> = [
      ["no session at all", { name: "AuthSessionMissingError", message: "Auth session missing!" }, true],
      ["a reused refresh token", { code: "refresh_token_already_used", status: 400 }, true],
      ["a session somebody signed out of", { code: "session_not_found", status: 403 }, true],
      ["a rejected token (401)", { status: 401, message: "Unauthorized" }, true],
      ["a fetch that never completed", { name: "AuthRetryableFetchError", status: 0 }, false],
      ["a 502 from the auth service", { status: 502, message: "Bad Gateway" }, false],
      ["Safari's offline error", { message: "Load failed" }, false],
      ["Chrome's offline error", { message: "TypeError: Failed to fetch (network)" }, false],
      ["an error nobody recognises", { message: "something odd" }, false],
    ]
    for (const [label, error, signedOut] of cases) {
      check(`${label}: ${signedOut ? "signed out" : "not signed out"}`, classifyAuthError(error).signedOut === signedOut)
    }
    check("no user and no error is a real sign-out", isSignedOutAnswer(false, null))
    check("no user and a network error is not", !isSignedOutAnswer(false, { name: "AuthRetryableFetchError" }))
    check("a user is never signed out, whatever else came back", !isSignedOutAnswer(true, { code: "session_not_found" }))

    const server = readCode("lib/auth/current-user.ts")
    check("the server reader classifies with the same function", /classifyAuthError/.test(server) && !/DEFINITELY_SIGNED_OUT\s*=/.test(server))
  }

  console.log("\n2. A page never sends a signed in person to /login on a blip")
  {
    const helper = readCode("lib/auth/page-user.ts")
    check("pageUser redirects only when the answer was 'nobody'", /if \(shouldSendToLogin\(current\)\) redirect\(loginPath\)/.test(helper))
    check("and otherwise hands back what it has, null included", /return current\.user/.test(helper))

    const files = guardFiles()
    const blind: string[] = []
    for (const file of files) {
      const code = readCode(file)
      if (/if\s*\(\s*!user\s*\)\s*(\{\s*)?(return\s+)?redirect\(/.test(code)) blind.push(file)
    }
    check(`no page or layout redirects on a missing user without asking why (${files.length} files read)`, blind.length === 0, blind.join(", "))

    const direct: string[] = []
    for (const file of files) {
      const code = readCode(file)
      if (/redirect\([^)]*\/login/.test(code) && /auth\.getUser\(\)/.test(code)) direct.push(file)
    }
    check("nothing that can send to /login reads getUser() and drops its error", direct.length === 0, direct.join(", "))

    for (const layout of ["app/(storelib)/app/layout.tsx", "app/(storelib)/account/library/layout.tsx", "app/(storelib)/dashboard/layout.tsx", "app/(storelib)/creator-page/layout.tsx", "app/(storelib)/website-builder/layout.tsx"]) {
      const code = readCode(layout)
      check(`${layout} recovers an undetermined session instead of redirecting`, /current\.state === "indeterminate"/.test(code))
    }
    const sites = readCode("app/(storelib)/sites/[siteId]/page.tsx")
    check("a page with no gate of its own renders the recovery itself", /if \(!user\) return <SessionRecovery \/>/.test(sites))
    /* The settings route and the sheet over the page both render the form from _view.tsx. */
    const settings = readCode("app/(storelib)/app/settings/_view.tsx")
    check("the settings page renders nothing, not a crash, while the layout recovers", /if \(!data\) return null/.test(settings))
  }

  console.log("\n3. Signing out here does not sign out every other device")
  {
    const roots = ["app", "components", "lib"]
    const calls: Array<{ file: string; scope: string }> = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name)
        if (statSync(p).isDirectory()) walk(p)
        else if (/\.(ts|tsx)$/.test(name)) {
          const code = readCode(p)
          for (const m of code.matchAll(/auth\.signOut\(([^)]*)\)/g)) calls.push({ file: p, scope: m[1].trim() })
        }
      }
    }
    roots.forEach(walk)
    const bare = calls.filter((c) => c.scope === "")
    check(`every signOut() names its scope (${calls.length} calls)`, calls.length > 0 && bare.length === 0, bare.map((c) => c.file).join(", "))
    const global = calls.filter((c) => /global/.test(c.scope)).map((c) => c.file)
    const allowed = ["components/app/settings-form-new.tsx", "app/(storelib)/(auth)/reset-password/page.tsx"]
    check(
      "only 'Sign out of all devices' and a password reset reach every device",
      global.every((f) => allowed.includes(f)),
      global.join(", "),
    )
  }

  console.log("\n4. The phone's session is one session, not two that drift")
  {
    check("the key is derived from the project", storedSessionKey() === KEY, String(storedSessionKey()))

    // Pure pieces first.
    check("the later expiry wins", fresherSession(session("t1", 100), session("t2", 200)) === session("t2", 200))
    check("the device copy is kept on a tie", fresherSession(session("t1", 100), session("t1b", 100)) === session("t1", 100))
    check("a copy that does not parse never wins", fresherSession(session("t1", 100), "garbage") === session("t1", 100))
    check("nothing at all is nothing", fresherSession(null, null) === null)

    const big = session("big", 300, 5000)
    const writes = sessionCookieWrites(KEY, big, "", true)
    // Changed on purpose (round AX): on HTTPS the chunks go under the session's __Host- name (lib/supabase/host-session.ts).
    check(`a big session is split the way the server splits it (${writes.length} chunks)`, writes.length >= 2 && writes[0].startsWith(`__Host-${KEY}.0=base64-`))
    check("each chunk is persistent, lax, secure", writes.every((w) => /max-age=34560000; samesite=lax; secure$/.test(w)))
    for (const w of writes) (globalThis as any).document.cookie = w
    const roundTrip = await readSessionFromCookies(KEY, (globalThis as any).document.cookie)
    check("and reads back as the same session", roundTrip === big)

    const small = session("small", 400)
    for (const w of sessionCookieWrites(KEY, small, (globalThis as any).document.cookie, true)) (globalThis as any).document.cookie = w
    const jar = parseCookieHeader((globalThis as any).document.cookie)
    // Changed on purpose (round AX): the same, under the __Host- name.
    check("a shorter session leaves no stale chunk behind", jar.has(`__Host-${KEY}`) && !jar.has(`__Host-${KEY}.0`) && !jar.has(`__Host-${KEY}.1`) && !jar.has(KEY), [...jar.keys()].join(","))
    check("removal expires every piece", sessionCookieRemovals(KEY, (globalThis as any).document.cookie, true).length === 1)
    cookies.clear()

    // Now the adapter the native client really stores through.
    const { capacitorStorage } = await import("../lib/supabase/client")

    // The server renewed the cookie while the app was busy elsewhere.
    local.set(KEY, session("t1", 1000))
    for (const w of sessionCookieWrites(KEY, session("t2", 2000), "", true)) (globalThis as any).document.cookie = w
    const read = await capacitorStorage.getItem(KEY)
    check("the app reads the newer cookie, not its own older copy", read === session("t2", 2000), String(read).slice(0, 60))
    check("and its own copy is brought up to date", local.get(KEY) === session("t2", 2000))

    // The app renews twice in a row (an hour or two in the editor).
    await capacitorStorage.setItem(KEY, session("t3", 3000))
    await capacitorStorage.setItem(KEY, session("t4", 4000))
    const sent = await readSessionFromCookies(KEY, (globalThis as any).document.cookie)
    check("every renewal reaches the cookie the server reads, so it never lags", sent === session("t4", 4000), String(sent).slice(0, 60))

    // The app's copy is newer than the cookie: it keeps its own.
    cookies.clear()
    for (const w of sessionCookieWrites(KEY, session("t3", 3000), "", true)) (globalThis as any).document.cookie = w
    check("a newer device copy is not replaced by an older cookie", (await capacitorStorage.getItem(KEY)) === session("t4", 4000))

    // The WebView lost its cookies: the device copy still holds the session.
    cookies.clear()
    check("with no cookie at all the device copy is the session", (await capacitorStorage.getItem(KEY)) === session("t4", 4000))

    // Anything that is not the session stays the device's alone.
    await capacitorStorage.setItem(`${KEY}-code-verifier`, "verifier")
    check("the PKCE verifier is not written to a cookie", !(globalThis as any).document.cookie.includes("code-verifier"))
    check("and reads back", (await capacitorStorage.getItem(`${KEY}-code-verifier`)) === "verifier")

    for (const w of sessionCookieWrites(KEY, session("t4", 4000), "", true)) (globalThis as any).document.cookie = w
    await capacitorStorage.removeItem(KEY)
    check("signing out clears both copies", !(globalThis as any).document.cookie.includes(KEY) && !local.has(KEY))
  }

  console.log("\n5. The durable evidence knows where the web keeps its session")
  {
    const { hasStoredSessionToken } = await import("../lib/auth/session-read")
    cookies.clear()
    local.clear()
    check("nothing stored reads as nothing", !hasStoredSessionToken())
    for (const w of sessionCookieWrites(KEY, session("w1", 100), "", true)) (globalThis as any).document.cookie = w
    check("a session cookie counts as a stored session", hasStoredSessionToken())
    cookies.clear()
    for (const w of sessionCookieWrites(KEY, session("w2", 100, 5000), "", true)) (globalThis as any).document.cookie = w
    check("so does a chunked one", hasStoredSessionToken())
    cookies.clear()

    const gate = readCode("components/native-auth-gate.tsx")
    check("the gate reads getSession's error", /const \{ data: \{ session \}, error \} = await supabase\.auth\.getSession\(\)/.test(gate))
    check("and a failed renewal is not sent to /login", /if \(!session && !isSignedOutAnswer\(false, error\)\) \{\s*setStuck\(true\)/.test(gate))
    check("a read that threw keeps a stored session", /catch \{[\s\S]{0,200}if \(hasStoredSessionToken\(\)\) setStuck\(true\)\s*else router\.replace\("\/login"\)/.test(gate))

    /* The email editor is the composer now (components/email/compose). It
       never sends anybody to /login itself: with no user it waits, and the
       app's own gate decides what a sign-out is. */
    const editor = readCode("app/(storelib)/app/emails/new/page.tsx")
    const composer = readCode("components/email/compose/composer.tsx") + readCode("components/email/compose/compose-page.tsx")
    /* Changed on purpose (round 40 team permissions): the composer asks the server who is sending (app/api/email/area?part=sender, which signs the caller in and finds the store), and with no answer it waits the same way it waited with no user. */
    check("the email editor only leaves for /login on a real sign-out",
      /* Changed on purpose (round 51): a new email may open with people, a segment or a layout chosen (preset). */
      /<ComposePage\s+campaignId=\{null\}/.test(editor) && !/\/login/.test(composer) && /if \(!sender \|\| !live\) return/.test(composer))
  }

  console.log("\n6. The proxy builds its response one way")
  {
    const proxy = readCode("proxy.ts")
    const setAll = proxy.slice(proxy.indexOf("setAll(cookiesToSet)"), proxy.indexOf("setAll(cookiesToSet)") + 900)
    check("a renewal rebuilds the response with the same function", /supabaseResponse = respond\(\)/.test(setAll))
    check("and not with a second copy of the rewrite rules", !/rewriteUrl\.pathname =/.test(setAll))
    check("a rewrite hands the renewed request on", /NextResponse\.rewrite\(rewriteUrl, \{ request \}\)/.test(proxy))
    check("the default is next() with the request", /let respond: \(\) => NextResponse = \(\) => NextResponse\.next\(\{ request \}\)/.test(proxy))
    check(
      "a redirect to /login still carries the cookies just written",
      /for \(const cookie of supabaseResponse\.cookies\.getAll\(\)\) redirect\.cookies\.set\(cookie\)/.test(proxy),
    )
    check("the proxy probe is on disk", readCode("scripts/check-session-proxy.mjs").length > 0)
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main()
