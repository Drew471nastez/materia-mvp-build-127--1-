/**
 * ===========================================================================
 *  EVERY COMMUNITY ROUTE: THE SWITCH, WHO IS ASKING, HOW OFTEN, AND WHAT IT READS
 * ===========================================================================
 * Walks app/api/community/** and app/api/app/community/** when the suite runs
 * (so a route added tomorrow is held to this the day it lands) and reads
 * every exported handler of every route.ts:
 *
 *   SWITCH    the handler's first awaited step is requireCommunitiesOn(),
 *             and a refusal is returned: while communities are off every
 *             community route answers 404 communities_off and does nothing.
 *   WHO       it decides who is asking through the foundation's gates:
 *             requireMember or requireCreatorCommunity (lib/communities/
 *             server/context.ts), viewerContext for a route a non member
 *             may call (join, an invite), or requireCreator to create one.
 *             Never a role compared as a string in the route.
 *   HOW OFTEN every write (POST, PUT, PATCH, DELETE) is rate limited with
 *             lib/api/rate-limit's rateLimit (or, for an upload, the upload
 *             limiter lib/storage/upload-guard uploadRateLimit, as ARCH says),
 *             directly or through a helper in the same file that calls it.
 *   WHAT      nothing is read from the database before the gate has said
 *             yes, and no route selects every column.
 *
 * The checker is run against fixtures first, so a checker that waves
 * everything through fails here rather than passing quietly.
 *
 * Run with:  npm run test:push
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

import { stripComments } from "./_source"

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

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (e === "route.ts" || e === "route.tsx") out.push(p)
  }
  return out
}

/** The body of the block that opens at `open` (the index of its `{`). */
function block(src: string, open: number): string {
  let depth = 0
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++
    else if (src[i] === "}") {
      depth--
      if (depth === 0) return src.slice(open + 1, i)
    }
  }
  return src.slice(open + 1)
}

const WRITES = new Set(["POST", "PUT", "PATCH", "DELETE"])
const GATE = /\b(requireMember|requireCreatorCommunity|viewerContext|requireCreator)\s*\(/

export interface RouteProblem {
  handler: string
  problem: string
}

/** Everything wrong with one route file's source, by handler. Empty means it holds. */
/**
 * Whether a module's own function of this name calls a rate limiter: how a
 * route that imports its limiter (`manageLimit` from lib/communities/server/
 * creator.ts) is followed to the rateLimit call inside it.
 */
function moduleLimits(spec: string, name: string): boolean {
  if (!spec.startsWith("@/")) return false
  const base = spec.slice(2)
  const file = [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`].find((f) => existsSync(f))
  if (!file) return false
  const src = stripComments(readFileSync(file, "utf8"))
  const fn = new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\s*\\([^)]*\\)[^{]*\\{`).exec(src)
  if (fn) return LIMITER.test(block(src, fn.index + fn[0].length - 1))
  const arrow = new RegExp(`(?:export\\s+)?const\\s+${name}\\s*=\\s*(?:async\\s*)?\\([^)]*\\)\\s*(?::[^=]+)?=>\\s*`).exec(src)
  if (arrow) return LIMITER.test(src.slice(arrow.index, arrow.index + 600))
  return false
}

const LIMITER = /\b(?:rateLimit|uploadRateLimit)\s*\(/

export function auditRoute(source: string, opts: { followImports?: boolean } = {}): RouteProblem[] {
  const src = stripComments(source)
  const problems: RouteProblem[] = []
  const handlers = [...src.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\s*\([^)]*\)[^{]*\{/g)]
  const constHandlers = [...src.matchAll(/export\s+const\s+(GET|POST|PUT|PATCH|DELETE)\s*=/g)]
  for (const m of constHandlers) problems.push({ handler: m[1], problem: "is a const; write it as an async function so it can be checked" })
  if (handlers.length === 0 && constHandlers.length === 0) problems.push({ handler: "-", problem: "exports no handler" })

  /* Local helpers that rate limit, so a write may call one of them. */
  const limiters = new Set<string>()
  for (const f of src.matchAll(/(?:async\s+)?function\s+(\w+)\s*\([^)]*\)[^{]*\{/g)) {
    if (/^(GET|POST|PUT|PATCH|DELETE)$/.test(f[1])) continue
    if (/\b(?:rateLimit|uploadRateLimit)\s*\(/.test(block(src, f.index! + f[0].length - 1))) limiters.add(f[1])
  }
  for (const f of src.matchAll(/const\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*(?::[^=]+)?=>\s*\{/g)) {
    if (/\b(?:rateLimit|uploadRateLimit)\s*\(/.test(block(src, f.index! + f[0].length - 1))) limiters.add(f[1])
  }
  /* And helpers imported from the app's own modules that rate limit inside. */
  if (opts.followImports !== false) {
    for (const imp of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*"([^"]+)"/g)) {
      for (const part of imp[1].split(",")) {
        const name = part.trim().replace(/^type\s+/, "").split(/\s+as\s+/).pop()?.trim() ?? ""
        const original = part.trim().split(/\s+as\s+/)[0].trim()
        if (/^\w+$/.test(name) && moduleLimits(imp[2], original)) limiters.add(name)
      }
    }
  }

  for (const h of handlers) {
    const name = h[1]
    const body = block(src, h.index! + h[0].length - 1)
    const firstAwait = body.search(/\bawait\b/)
    const flagAt = body.search(/\bawait\s+requireCommunitiesOn\s*\(\s*\)/)
    if (flagAt < 0) problems.push({ handler: name, problem: "never checks the communities switch (requireCommunitiesOn)" })
    else if (firstAwait !== flagAt) problems.push({ handler: name, problem: "does something before checking the communities switch" })
    else if (!/const\s+(\w+)\s*=\s*await\s+requireCommunitiesOn\(\)\s*;?\s*if\s*\(\s*\1\s*\)\s*return\s+\1/.test(body)) problems.push({ handler: name, problem: "does not return the switch's refusal" })

    const gateAt = body.search(GATE)
    if (gateAt < 0) problems.push({ handler: name, problem: "decides nobody's access: no requireMember, requireCreatorCommunity, viewerContext or requireCreator" })
    const readAt = body.search(/\.from\s*\(|\.rpc\s*\(/)
    if (readAt >= 0 && (gateAt < 0 || readAt < gateAt)) problems.push({ handler: name, problem: "reads the database before deciding who is asking" })
    if (/\.select\(\s*["'`]\*["'`]/.test(body)) problems.push({ handler: name, problem: "selects every column" })
    if (/\.role\s*===?\s*["'](owner|admin|moderator|member)["']|["'](owner|admin|moderator)["']\s*===?\s*\w+\.role/.test(body)) problems.push({ handler: name, problem: "compares a role as a string instead of asking can()" })

    if (WRITES.has(name)) {
      const limited = /\b(?:rateLimit|uploadRateLimit)\s*\(/.test(body) || [...limiters].some((l) => new RegExp(`\\b${l}\\s*\\(`).test(body))
      if (!limited) problems.push({ handler: name, problem: "writes without a rate limit (rateLimit from lib/api/rate-limit)" })
    }
  }
  return problems
}

async function main() {
  console.log("\nThe checker itself, on fixtures\n")
  {
    const good = `
      import { requireCommunitiesOn } from "@/lib/communities/flag"
      export async function GET(request: Request, { params }: Ctx) {
        const off = await requireCommunitiesOn()
        if (off) return off
        const gate = await requireMember(db, id, userId, "view")
        if (gate instanceof NextResponse) return gate
        const { data } = await db.from("community_feed_posts").select("id, title")
        return NextResponse.json({ data })
      }
      async function limited(request: Request, userId: string) {
        return rateLimit({ bucket: "community-post", subjects: [userId], windows: RATE_LIMITS.post })
      }
      export async function POST(request: Request) {
        const off = await requireCommunitiesOn()
        if (off) return off
        const gate = await requireCreatorCommunity(id, "manage_spaces")
        if (gate instanceof NextResponse) return gate
        const slow = await limited(request, gate.ctx.userId)
        if (slow) return slow
        await db.from("community_spaces").insert({ name })
        return NextResponse.json({ ok: true })
      }`
    check("a route that holds is passed", auditRoute(good).length === 0, JSON.stringify(auditRoute(good)))
    const noFlag = `export async function GET() { const gate = await requireMember(db, id, u, "view"); return NextResponse.json({}) }`
    check("a route without the switch is caught", auditRoute(noFlag).some((p) => /switch/.test(p.problem)))
    const late = `export async function GET() { const gate = await requireMember(db, id, u, "view"); const off = await requireCommunitiesOn(); if (off) return off; return x }`
    check("a route that checks the switch second is caught", auditRoute(late).some((p) => /before checking the communities switch/.test(p.problem)))
    const ignored = `export async function GET() { await requireCommunitiesOn(); const g = await requireMember(db, id, u, "view"); return x }`
    check("a switch check whose answer is ignored is caught", auditRoute(ignored).some((p) => /refusal/.test(p.problem)))
    const noGate = `export async function GET() { const off = await requireCommunitiesOn(); if (off) return off; const { data } = await db.from("communities").select("id"); return x }`
    check("a route that reads with no gate is caught", auditRoute(noGate).some((p) => /decides nobody/.test(p.problem)) && auditRoute(noGate).some((p) => /before deciding/.test(p.problem)))
    const early = `export async function GET() { const off = await requireCommunitiesOn(); if (off) return off; const { data } = await db.from("community_members").select("id"); const g = await requireMember(db, id, u, "view"); return x }`
    check("a read before the gate is caught", auditRoute(early).some((p) => /before deciding/.test(p.problem)))
    const unlimited = `export async function POST() { const off = await requireCommunitiesOn(); if (off) return off; const g = await requireMember(db, id, u, "post"); await db.from("community_feed_posts").insert({}); return x }`
    check("a write with no rate limit is caught", auditRoute(unlimited).some((p) => /rate limit/.test(p.problem)))
    const star = `export async function GET() { const off = await requireCommunitiesOn(); if (off) return off; const g = await requireMember(db, id, u, "view"); const { data } = await db.from("communities").select("*"); return x }`
    check("select * is caught", auditRoute(star).some((p) => /every column/.test(p.problem)))
    const roleString = `export async function GET() { const off = await requireCommunitiesOn(); if (off) return off; const g = await requireMember(db, id, u, "view"); if (g.viewer.role === "admin") return y; return x }`
    check("a role compared as a string is caught", auditRoute(roleString).some((p) => /can\(\)/.test(p.problem)))
    const viaImport = (helper: string) => `import { ${helper} } from "@/lib/communities/server/creator"
      export async function POST() { const off = await requireCommunitiesOn(); if (off) return off; const g = await requireCreatorCommunity(id, "archive"); const l = await ${helper}(g.ctx.userId); return x }`
    check("a write limited by an imported helper that rate limits is passed", existsSync("lib/communities/server/creator.ts") ? auditRoute(viaImport("manageLimit")).length === 0 : true, JSON.stringify(auditRoute(viaImport("manageLimit"))))
    check("an imported helper that does not rate limit does not count", existsSync("lib/communities/server/creator.ts") ? auditRoute(viaImport("setArchived")).some((p) => /rate limit/.test(p.problem)) : true)
    const constHandler = `export const GET = async () => x`
    check("a handler written as a const is caught rather than skipped", auditRoute(constHandler).length > 0)
  }

  const routes = [...walk("app/api/community"), ...walk("app/api/app/community")].sort()
  console.log(`\nEvery community route on this branch (${routes.length})\n`)
  if (routes.length === 0) check("no community routes on this branch yet; the walk ran", true)
  for (const file of routes) {
    const problems = auditRoute(readFileSync(file, "utf8"))
    check(`${file} holds`, problems.length === 0, problems.map((p) => `${p.handler}: ${p.problem}`).join("\n        "))
  }

  console.log("\nThe platform's own community routes outside those folders\n")
  {
    const builder = "app/api/store-builder/communities/route.ts"
    const problems = auditRoute(readFileSync(builder, "utf8"))
    check(`${builder} holds`, problems.length === 0, problems.map((p) => `${p.handler}: ${p.problem}`).join("\n        "))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log("\nFailures:")
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
