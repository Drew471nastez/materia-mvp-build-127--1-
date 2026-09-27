/**
 * ===========================================================================
 *  "INVALID REFRESH TOKEN: ALREADY USED" IN THE PROXY (lib/auth/quiet-refusals)
 * ===========================================================================
 * Two requests with one expired session each ask Supabase for a new one;
 * the second is refused, because the first spent the refresh token. The
 * real @supabase/ssr client runs here against a stand-in Supabase that
 * refuses the way the log shows, with the proxy's own reading of the answer
 * (lib/auth/current-user): the request goes on as signed out, the dead
 * cookie is cleared so nothing tries it again, and the log gets one plain
 * line where supabase-js wrote two errors.
 */
import { createServerClient } from "@supabase/ssr"
import { readCurrentUser, shouldSendToLogin } from "@/lib/auth/current-user"
import { quietAuthRefusals, refusalCode } from "@/lib/auth/quiet-refusals"
import { readFileSync } from "node:fs"
import { join } from "node:path"

let passed = 0
let failed = 0
const failures: string[] = []
const out = console.log.bind(console)
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; out(`  ok    ${label}`) }
  else { failed++; failures.push(label); out(`  FAIL  ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`) }
}

/* Every console.error and console.warn from here on, supabase-js's included. */
const errors: unknown[][] = []
const warns: string[] = []
console.error = (...a: unknown[]) => void errors.push(a)
console.warn = (...a: unknown[]) => void warns.push(a.map(String).join(" "))

const expired = {
  access_token: "a.b.c", refresh_token: "rt-spent", token_type: "bearer", expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) - 60, user: { id: "u1", aud: "authenticated", role: "authenticated" },
}
const cookie = { name: "sb-abcd-auth-token", value: "base64-" + Buffer.from(JSON.stringify(expired)).toString("base64url") }

function client(answer: "refused" | "renewed") {
  const set: Array<{ name: string; value: string; options?: { maxAge?: number } }> = []
  const fetch = async (url: string | URL) => {
    const u = String(url)
    if (u.includes("/token?grant_type=refresh_token")) {
      if (answer === "refused")
        return new Response(JSON.stringify({ code: 400, error_code: "refresh_token_already_used", msg: "Invalid Refresh Token: Already Used" }), { status: 400, headers: { "content-type": "application/json" } })
      return new Response(JSON.stringify({ ...expired, access_token: "new.token.here", refresh_token: "rt-new", expires_at: Math.floor(Date.now() / 1000) + 3600 }), { status: 200, headers: { "content-type": "application/json" } })
    }
    if (u.endsWith("/user")) return new Response(JSON.stringify(expired.user), { status: 200, headers: { "content-type": "application/json" } })
    return new Response("{}", { status: 404 })
  }
  const supabase = createServerClient("https://abcd.supabase.co", "anon", {
    global: { fetch: fetch as typeof globalThis.fetch },
    cookies: { getAll: () => [cookie], setAll: (c) => void set.push(...(c as typeof set)) },
  })
  return { supabase, set }
}
const settle = () => new Promise((r) => setTimeout(r, 30))

async function main() {
  out("\nWithout the quieting, what the error table counted")
  {
    const { supabase } = client("refused")
    await readCurrentUser(supabase as never, { retries: 0 })
    await settle()
    const refusals = errors.filter((a) => refusalCode(a) === "refresh_token_already_used")
    check("supabase-js writes the refusal with console.error, more than once", refusals.length >= 2, errors.length)
  }

  out("\nWith it")
  errors.length = 0
  check("installed on the console", quietAuthRefusals(console))
  check("once", !quietAuthRefusals(console))
  {
    const { supabase, set } = client("refused")
    const current = await readCurrentUser(supabase as never, { retries: 0 })
    await settle()
    check("the request goes on as signed out, not undetermined", current.state === "anonymous" && current.user === null, current)
    check("so /app sends it to sign in, rather than keeping a dead session", shouldSendToLogin(current))
    check("the dead cookie is cleared, so the next request does not try it again", set.some((c) => c.name === cookie.name && c.value === "" && c.options?.maxAge === 0), set)
    check("no console.error at all", errors.length === 0, errors.map((a) => String(a[0])))
    check("one line, naming the refusal", warns.length === 1 && /refused the session's refresh \(refresh_token_already_used\); the request went on as signed out/.test(warns[0]), warns)
  }
  {
    warns.length = 0
    const { supabase, set } = client("renewed")
    const current = await readCurrentUser(supabase as never, { retries: 0 })
    await settle()
    check("a refresh that works still signs the person in and writes the new cookie, silently", current.state === "authenticated" && set.some((c) => c.name === cookie.name && c.value.startsWith("base64-")) && errors.length === 0 && warns.length === 0, { state: current.state, errors: errors.length, warns })
  }
  {
    console.error("[checkout] something real went wrong", { code: "X" })
    console.error(Object.assign(new Error("Database error"), { name: "AuthApiError", __isAuthError: true, code: "unexpected_failure" }))
    check("every other error is still an error", errors.length === 2, errors.length)
  }

  out("\nThe proxy has it, and is still the recommended @supabase/ssr shape")
  {
    const proxy = readFileSync(join(process.cwd(), "proxy.ts"), "utf8")
    check("the proxy installs it", /\nquietAuthRefusals\(\)\n/.test(proxy))
    check("cookies read from the request and written to it and to the response",
      /getAll\(\) \{\s*return request\.cookies\.getAll\(\)/.test(proxy) && /cookiesToSet\.forEach\(\(\{ name, value \}\) => request\.cookies\.set\(name, value\)\)/.test(proxy))
    check("the user asked for right after the client is made", /const current = await readCurrentUser\(supabase\)/.test(proxy))
    check("a redirect to sign in carries the cleared cookies", /for \(const cookie of supabaseResponse\.cookies\.getAll\(\)\) redirect\.cookies\.set\(cookie\)/.test(proxy))
  }

  out(`\n${passed} passed, ${failed} failed`)
  if (failed) { for (const f of failures) out(`  - ${f}`); process.exit(1) }
}
main()
