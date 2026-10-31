/**
 * ===========================================================================
 *  GET /auth/sync-session SIGNS NOBODY IN
 * ===========================================================================
 * Round rel-security (F4). The GET took tokens from the query and wrote them
 * into the visitor's cookies with no origin check: login CSRF from any page,
 * and refresh tokens in request logs. Every caller posts, so the GET now only
 * goes on to its path. This runs the real handler.
 */
import { GET } from "@/app/auth/sync-session/route"
import { readCode } from "./_source"

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

async function main() {
  console.log("\nGET with tokens, from another site")
  {
    const res = await GET(
      new Request("https://storelib.com/auth/sync-session?access_token=a.b.c&refresh_token=r1&next=%2Flibrary", {
        headers: { "sec-fetch-site": "same-site", "sec-fetch-mode": "navigate" },
      }),
    )
    const cookies = res.headers.get("set-cookie") ?? ""
    check("no session cookie is written", !/sb-[^=]*-auth-token/.test(cookies) && !/access_token|r1/.test(cookies), cookies)
    check("  it goes on to its path, a 303", res.status === 303 && res.headers.get("location") === "https://storelib.com/library", { status: res.status, location: res.headers.get("location") })
    check("  never cached, and the address with the tokens is not sent on as a referrer", res.headers.get("cache-control") === "no-store" && res.headers.get("referrer-policy") === "no-referrer")
  }
  {
    const res = await GET(new Request("https://storelib.com/auth/sync-session?access_token=a&refresh_token=b&next=https%3A%2F%2Fevil.example%2F"))
    check("an address in next is not followed", res.headers.get("location") === "https://storelib.com/auth/continue", res.headers.get("location"))
  }
  const route = readCode("app/auth/sync-session/route.ts")
  const get = route.slice(route.indexOf("export async function GET"), route.indexOf("export async function POST"))
  check("the GET never reaches setSession", !/syncSession\(|setSession\(/.test(get))
  check("the POST still does, behind its origin check", /export async function POST/.test(route) && /from !== origin/.test(route) && /return syncSession\(request, str\("access_token"\), str\("refresh_token"\), next, 303\)/.test(route))
  for (const f of ["lib/native-oauth.ts", "components/auth/viewer-sync.tsx", "lib/auth/continue-client.ts", "app/(auth)/login/page.tsx", "app/(auth)/signup/page.tsx"]) {
    check(`${f}: no navigation to a sync-session address (posted through goToAuthHref)`, !/location\.(assign|replace|href)\s*[(=]\s*[`"']?\/auth\/sync-session/.test(readCode(f)))
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
