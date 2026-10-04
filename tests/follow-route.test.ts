/**
 * ===========================================================================
 *  FOLLOW, AND FOLLOW AGAIN, AND UNFOLLOW (app/api/follow)
 * ===========================================================================
 * "[follow] insert failed { code: '42501', message: 'new row violates
 * row-level security policy (USING expression) for table "follows"' }".
 *
 * The route inserts with the signed-in person's own client, so row-level
 * security decides. `follows` lets a user insert and delete their own rows
 * and has no UPDATE policy, on purpose. A plain upsert is INSERT ... ON
 * CONFLICT DO UPDATE, and a follow that already exists takes the UPDATE
 * path: refused. Measured on Postgres 16 with the table's own policies
 * (supabase/sql/RUN_EVERYTHING.sql): the second upsert raised exactly the
 * production error, ON CONFLICT DO NOTHING inserted nothing and raised
 * nothing, and a follow for somebody else was still refused.
 *
 * The route runs here against a stand-in client that answers the way those
 * policies did.
 *
 * AND IT ANSWERS FIRST. "Clicking Follow then quickly clicking again blocks
 * for about 3 seconds": the answer waited for the follower's handle and the
 * "followed you" notice. Here those stand in as a slow afterFollow and
 * next/server's after() as a queue, so the test can see the answer leave
 * before them, and that they still run, once, for a follow only.
 */
import { register } from "node:module"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { build } from "esbuild"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`) }
}

const ME = "00000000-0000-4000-8000-00000000000a"
const THEM = "00000000-0000-4000-8000-00000000000b"
type Row = { follower_id: string; following_id: string }
const S: any = ((globalThis as any).__followStubs = { user: { id: ME }, rows: [] as Row[], calls: [] as string[], later: [] as (() => unknown)[], effects: [] as string[], effectMs: 400 })

/* The policies of `follows`: insert and delete your own, read all, no update. */
const client = `const S = () => globalThis.__followStubs
const RLS = { code: "42501", message: 'new row violates row-level security policy (USING expression) for table "follows"' }
function table() {
  let filters = []
  const q = {
    upsert(row, opts) {
      S().calls.push("upsert " + JSON.stringify(opts))
      if (row.follower_id !== S().user.id) return Promise.resolve({ error: { code: "42501", message: 'new row violates row-level security policy for table "follows"' } })
      const exists = S().rows.some((r) => r.follower_id === row.follower_id && r.following_id === row.following_id)
      if (exists) return Promise.resolve(opts && opts.ignoreDuplicates ? { error: null } : { error: RLS })
      S().rows.push({ follower_id: row.follower_id, following_id: row.following_id })
      return Promise.resolve({ error: null })
    },
    delete() { q.op = "delete"; return q },
    select() { q.op = "count"; return q },
    eq(c, v) { filters.push([c, v]); return q },
    then(resolve) {
      const match = (r) => filters.every(([c, v]) => r[c] === v)
      if (q.op === "delete") { S().calls.push("delete"); S().rows = S().rows.filter((r) => !(match(r) && r.follower_id === S().user.id)); return resolve({ error: null }) }
      return resolve({ count: S().rows.filter(match).length, error: null })
    },
  }
  return q
}
export const createClient = async () => ({ auth: { getUser: async () => ({ data: { user: S().user }, error: null }) }, from: () => table() })
`
/* The handle and the notice, as slow as a dozen round trips to the database. */
const effects = `export async function afterFollow(followerId, targetId) {
  await new Promise((r) => setTimeout(r, globalThis.__followStubs.effectMs))
  globalThis.__followStubs.effects.push(followerId + ">" + targetId)
}
`
/* next/server as it is, except after(), which queues the task the way a request does once its answer has gone. */
const nextServer = `import { createRequire } from "node:module"
const real = createRequire(${JSON.stringify(join(process.cwd(), "package.json"))})("next/server")
export const NextResponse = real.NextResponse
export const NextRequest = real.NextRequest
export function after(task) { globalThis.__followStubs.later.push(task) }
`
const dir = mkdtempSync(join(tmpdir(), "follow-stubs-"))
writeFileSync(join(dir, "server.mjs"), client)
writeFileSync(join(dir, "effects.mjs"), effects)
writeFileSync(join(dir, "next-server.mjs"), nextServer)
const stubs: Record<string, string> = { "@/lib/supabase/server": pathToFileURL(join(dir, "server.mjs")).href }
const answering = { ...stubs, "@/lib/profile/follow-effects": pathToFileURL(join(dir, "effects.mjs")).href, "next/server": pathToFileURL(join(dir, "next-server.mjs")).href }
register(pathToFileURL(join(process.cwd(), "scripts/push-test-stubs.mjs")).href, { parentURL: import.meta.url, data: { stubs: answering } })

async function main() {
  const out = join(process.env.PUSH_TEST_OUT || dir, "__follow-route__", "route.mjs")
  await build({
    entryPoints: [join(process.cwd(), "app/api/follow/route.ts")], outfile: out, bundle: true, format: "esm", platform: "node", target: "node20",
    logLevel: "error", alias: { "@": process.cwd() }, packages: "external",
    plugins: [{ name: "stand-ins", setup(b) { b.onResolve({ filter: /.*/ }, (a) => (a.path in answering ? { path: a.path, external: true } : undefined)) } }],
    external: ["next/*", "server-only"],
  })
  const route = (await import(pathToFileURL(out).href)) as any
  const post = (body: unknown) => route.POST(new Request("https://storelib.com/api/follow", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }))
  /* Each answer here leaves a queued handle-and-notice behind; they are run where a test needs them. */
  const drain = async () => {
    const tasks = S.later.splice(0)
    for (const t of tasks) await t()
    return tasks.length
  }

  console.log("\nA signed in person follows, taps again, unfollows, follows again")
  {
    const first = await post({ creatorUserId: THEM })
    const a = await first.json()
    check("follow: 200, following, one follower", first.status === 200 && a.following === true && a.followers === 1, a)
    const again = await post({ creatorUserId: THEM })
    const b = await again.json()
    check("the same follow again (a second tap): 200, not the RLS refusal", again.status === 200 && b.following === true && b.followers === 1, { status: again.status, b })
    check("asked as ON CONFLICT DO NOTHING", S.calls.every((c: string) => !c.startsWith("upsert") || /"ignoreDuplicates":true/.test(c)), S.calls)
    const un = await post({ creatorUserId: THEM, follow: false })
    const c = await un.json()
    check("unfollow: 200, not following, no followers", un.status === 200 && c.following === false && c.followers === 0, c)
    const back = await post({ creatorUserId: THEM })
    check("follow again after unfollowing: 200", back.status === 200 && (await back.json()).followers === 1)
    await drain()
  }

  console.log("\nThe answer goes before the handle and the notice")
  {
    S.rows = []
    S.effects = []
    S.later = []
    const t0 = performance.now()
    const res = await post({ userId: THEM })
    const ms = performance.now() - t0
    const a = await res.json()
    check(`a follow answers without waiting for them (${Math.round(ms)}ms with a ${S.effectMs}ms afterFollow)`, res.status === 200 && a.following === true && ms < S.effectMs / 2 && S.effects.length === 0, { ms, a })
    check("  they are queued with after(), once, for this follower and person", S.later.length === 1)
    await drain()
    check("  and they run once the answer has gone", S.effects.join() === `${ME}>${THEM}`, S.effects)
    const un = await post({ userId: THEM, follow: false })
    check("an unfollow queues nothing", un.status === 200 && S.later.length === 0 && (await un.json()).following === false)
  }

  console.log("\nWhat is still refused")
  {
    check("yourself: 400", (await post({ creatorUserId: ME })).status === 400)
    S.user = null
    check("signed out: 401", (await post({ creatorUserId: THEM })).status === 401)
    S.user = { id: ME }
    const src = readFileSync(join(process.cwd(), "app/api/follow/route.ts"), "utf8")
    check("the follower is the session's, never the body's", /follower_id: user\.id/.test(src) && !/follower_id: body/.test(src))
    check("the route uses the person's own client, so the policy still decides", /from "@\/lib\/supabase\/server"/.test(src) && !/createAdminClient/.test(src))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) { for (const f of failures) console.log(`  - ${f}`); process.exit(1) }
}
main()
