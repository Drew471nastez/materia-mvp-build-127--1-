/**
 * A STRANGER'S COMMUNITY PAGE, ONE CDN COPY (round 66): next.config.mjs rewrites a stranger's /community/<slug> and
 * /about to their own cache key and holds that answer at the CDN; a signed in request (any production session
 * cookie), a client side move and any other host are never rewritten nor held; every staff write and take down
 * clears the copy; the layout draws no stranger's Referer.
 */
import { readFileSync } from "node:fs"

let passed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failures.push(`${name}${detail === undefined ? "" : ` (${JSON.stringify(detail)})`}`)
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}`)
}
const read = (f: string) => readFileSync(f, "utf8")

async function main() {
const config = await import("../next.config.mjs")
const next = config.default as { rewrites: () => Promise<{ beforeFiles: any[] }>; headers: () => Promise<any[]> }
const rewrites = (await next.rewrites()).beforeFiles.filter((r) => r.source.startsWith("/community"))
const headers = (await next.headers()).filter((r) => r.source.startsWith("/community"))
const sessionKey = `sb-${new URL("https://skgtqglupjcnfhfscink.supabase.co").hostname.split(".")[0]}-auth-token`

console.log("\n1. Who is rewritten")
check("the page and About, nothing else under /community", rewrites.length === 2 && rewrites.map((r) => r.source).join() === "/community/:slug,/community/:slug/about")
check("to the stranger's own key", rewrites.every((r) => r.destination === `${r.source}?${config.STRANGER_QUERY}=1`))
const cookies = (rules: any[]) => rules.every((r) => [sessionKey, `${sessionKey}.0`, `${sessionKey}.1`, `__Host-${sessionKey}`, `__Host-${sessionKey}.0`].every((k) => r.missing.some((m: any) => m.type === "cookie" && m.key === k)))
check("never somebody with the production session cookie, whole or in chunks, under either name", cookies(rewrites), config.SESSION_COOKIES)
check("never a client side move", rewrites.every((r) => r.missing.some((m: any) => m.type === "header" && m.key === "rsc")))
check("only on storelib.com", rewrites.every((r) => r.has.length === 1 && r.has[0].type === "host" && /storelib/.test(r.has[0].value)))

console.log("\n2. What is held")
check("the same two addresses, the same conditions", headers.length === 2 && cookies(headers) && headers.every((h) => h.missing.some((m: any) => m.key === "rsc")))
check("a minute fresh, five more while redrawn, under the community's tag", headers.every((h) => h.headers.some((x: any) => x.key === "Vercel-CDN-Cache-Control" && x.value === "public, s-maxage=60, stale-while-revalidate=300") && h.headers.some((x: any) => x.key === "Vercel-Cache-Tag" && x.value === "community-page::slug")))

console.log("\n3. Cleared and personal")
const cache = read("lib/communities/server/public-cache.ts")
check("every staff write and take down clears the copy", /if \(slug\) revalidateTag\(communityPageCdnTag\(slug\), \{ expire: 0 \}\)/.test(cache) && /`community-page:\$\{slug\.toLowerCase\(\)\}`/.test(cache) && (read("lib/communities/server/context.ts").match(/communityPublicChangedAfter\(community\.id, community\.creator_id, community\.slug\)/g) ?? []).length === 2 && /\(row as \{ slug\?: string \| null \}\)\.slug \?\? null\)/.test(read("lib/communities/server/admin.ts")))
check("a stranger's copy draws no Referer", /visitBeacon\(page, page\.viewer \? \(await headers\(\)\)\.get\("referer"\) : null\)/.test(read("app/(storelib)/(marketing)/community/[slug]/layout.tsx")))

console.log(`\n${passed} passed, ${failures.length} failed`)
if (failures.length) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
}
void main()
