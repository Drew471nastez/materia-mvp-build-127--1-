/**
 * ===========================================================================
 *  AN APP LINK BRIDGE TOKEN IS USED ONCE, EVEN BY TWO REQUESTS AT ONCE
 * ===========================================================================
 * Round rel2-security2 (SEC-10). app/(storelib)/app/auth/callback read the token row,
 * then deleted it in a second statement: two requests that arrived together
 * both read it and both got the session. lib/auth/bridge-token.ts now deletes
 * and reads in one statement (DELETE ... RETURNING), so the database gives the
 * row to one caller only.
 *
 * The "before" is shown by the control below: the old read-then-delete,
 * run against the same fake database, hands the session out twice.
 */
import { fakeDb } from "./_fake-db"
import { readCode } from "./_source"
import { consumeBridgeToken } from "@/lib/auth/bridge-token"

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

const TOKEN = "11111111-2222-4333-8444-555555555555"
const soon = () => new Date(Date.now() + 5 * 60_000).toISOString()
const row = (extra: Record<string, unknown> = {}) => ({ id: TOKEN, access_token: "a.b.c", refresh_token: "r1", next_path: "/library", expires_at: soon(), ...extra })

/* The route's old steps, kept here only to show what the change prevents. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function oldConsume(db: any, token: string) {
  const { data } = await db.from("oauth_bridge_tokens").select("id, access_token, refresh_token, next_path, expires_at").eq("id", token).maybeSingle()
  if (!data) return false
  await db.from("oauth_bridge_tokens").delete().eq("id", token)
  return true
}

async function main() {
  console.log("\nControl: the old read, then delete")
  {
    const db = fakeDb({ oauth_bridge_tokens: [row()] })
    const both = await Promise.all([oldConsume(db, TOKEN), oldConsume(db, TOKEN)])
    check("two requests at once both got the session (the bug)", both.filter(Boolean).length === 2, both)
  }

  console.log("\nOne statement")
  {
    const db = fakeDb({ oauth_bridge_tokens: [row()] })
    const both = await Promise.all([consumeBridgeToken(db, TOKEN), consumeBridgeToken(db, TOKEN)])
    const wins = both.filter((r) => r.ok)
    check("two requests at once: exactly one gets the session", wins.length === 1, both)
    check("  the other is refused as invalid", both.some((r) => r.ok === false && r.reason === "invalid"))
    const first = wins[0]
    check("  the winner gets the stored tokens and path", !!first && first.ok && first.session.accessToken === "a.b.c" && first.session.refreshToken === "r1" && first.session.nextPath === "/library")
    const left = await db.from("oauth_bridge_tokens").select("id").eq("id", TOKEN)
    check("  the row is gone", (left.data ?? []).length === 0, left.data)
    const later = await consumeBridgeToken(db, TOKEN)
    check("  a third try later is refused", later.ok === false)
  }
  {
    const db = fakeDb({ oauth_bridge_tokens: [row({ expires_at: new Date(Date.now() - 1000).toISOString() })] })
    const r = await consumeBridgeToken(db, TOKEN)
    check("an expired token is refused as expired", r.ok === false && r.reason === "expired", r)
    const { data } = await db.from("oauth_bridge_tokens").select("id").eq("id", TOKEN)
    check("  and removed", (data ?? []).length === 0, data)
  }
  {
    const db = fakeDb({ oauth_bridge_tokens: [row()] })
    const r = await consumeBridgeToken(db, "not-a-uuid")
    const { data } = await db.from("oauth_bridge_tokens").select("id")
    check("a token that is not a uuid touches nothing", r.ok === false && r.reason === "invalid" && (data ?? []).length === 1, { r, data })
  }
  {
    const db = fakeDb({ oauth_bridge_tokens: [row()] }, { failWith: { oauth_bridge_tokens: { message: "down" } } })
    const r = await consumeBridgeToken(db, TOKEN)
    check("a database error is not a session", r.ok === false && r.reason === "unavailable", r)
  }

  console.log("\nThe route")
  const route = readCode("app/(storelib)/app/auth/callback/route.ts")
  check("consumes through consumeBridgeToken", /consumeBridgeToken\(createAdminClient\(\), bridgeToken\)/.test(route))
  check("  no separate select of the token row", !/\.from\("oauth_bridge_tokens"\)/.test(route))
  check("  the stored path is checked as a same-site path", /sameOriginPath\(consumed\.session\.nextPath, next\)/.test(route))
  check("  every redirect is no-store", /function go\(/.test(route) && /"Cache-Control", "no-store"/.test(route) && !/return NextResponse\.redirect\(/.test(route))

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
