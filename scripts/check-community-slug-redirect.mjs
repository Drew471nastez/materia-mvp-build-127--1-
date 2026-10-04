/**
 * ===========================================================================
 *  AN OLD COMMUNITY ADDRESS, FOLLOWED END TO END (without a server)
 * ===========================================================================
 * The real proxy (proxy.ts) and the real community layout
 * (app/(marketing)/community/[slug]/layout.tsx), with Next's own
 * permanentRedirect: a request for /community/<old>/... goes through the
 * proxy, which hands the layout the path and query in its header; the
 * layout, given a community that now lives at <new> (as loadCommunity
 * answers through community_slug_history, run-now part 94), throws Next's
 * redirect. Its digest says where and with which status: a 308 to the same
 * page under the new address, the query kept.
 *
 *   ADDRESSES   the home, a post with a query, About, the invite landing with
 *               its invite, a space, the case of an address
 *   NOT MOVED   the current address renders, no redirect
 *   HIDDEN      a draft (for somebody who is not its staff), a suspended
 *               community and the switch off: no redirect (the page under
 *               it answers 404), so an old address says nothing about them
 *   SPOOFED     a header a visitor sent is replaced by the proxy
 *
 *   node scripts/check-community-slug-redirect.mjs
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { build } from "esbuild"

const root = process.cwd()
const dir = join(root, ".community-slug-redirect-probe")
mkdirSync(dir, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}

try {
  writeFileSync(join(dir, "empty.js"), "export {}\n")
  writeFileSync(join(dir, "headers.js"), `export async function headers() { return new Headers(globalThis.__forwarded || {}) }\nexport async function cookies() { return { get() {}, getAll() { return [] } } }\n`)
  writeFileSync(join(dir, "data.js"), `export async function memberPage(slug) { return globalThis.__page(slug) }\n`)
  writeFileSync(join(dir, "shell.js"), `export const CommunityShell = () => "member frame"\nexport const CommunityPublicShell = () => "public frame"\n`)
  writeFileSync(join(dir, "server.js"), `export * from "next/server.js"\nexport async function connection() {}\n`)
  writeFileSync(join(dir, "entry.ts"), `export { proxy } from "../proxy"\nexport { default as Layout } from "../app/(marketing)/community/[slug]/layout"\nexport { NextRequest } from "next/server.js"\n`)
  await build({
    entryPoints: [join(dir, "entry.ts")],
    bundle: true,
    platform: "node",
    format: "esm",
    jsx: "automatic",
    outfile: join(dir, "out.mjs"),
    absWorkingDir: root,
    alias: { "@": "." },
    logLevel: "error",
    external: ["next", "next/*", "@supabase/*", "react", "react-dom", "react/jsx-runtime"],
    banner: { js: 'import { createRequire } from "module"; const require = createRequire(import.meta.url);' },
    plugins: [
      {
        name: "stubs",
        setup(b) {
          b.onResolve({ filter: /^server-only$/ }, () => ({ path: resolve(dir, "empty.js") }))
          b.onResolve({ filter: /^next\/headers$/ }, () => ({ path: resolve(dir, "headers.js") }))
          b.onResolve({ filter: /^next\/server$/ }, (a) => (a.importer.endsWith("layout.tsx") ? { path: resolve(dir, "server.js") } : { path: "next/server.js", external: true }))
          b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: "next/navigation.js", external: true }))
          b.onResolve({ filter: /components\/community\/member\/data$/ }, () => ({ path: resolve(dir, "data.js") }))
          b.onResolve({ filter: /components\/community\/member\/shell$/ }, () => ({ path: resolve(dir, "shell.js") }))
        },
      },
    ],
  })
  const { proxy, Layout, NextRequest } = await import(pathToFileURL(join(dir, "out.mjs")).href)

  const COMMUNITY = { id: "c1", slug: "clay-studio", name: "Clay Studio", status: "published" }
  const visitor = (community, state = "not_member") => () => ({ state, community, viewer: { isOwner: false, isCreatorAccount: false, role: null } })

  /** One request: through the proxy, then the layout. Answers the redirect's target and status, or "rendered". */
  async function follow(url, page, spoof = null) {
    const req = new NextRequest(url, { headers: { host: "storelib.com", ...(spoof ? { "x-storelib-community-path": spoof } : {}) } })
    const res = await proxy(req)
    const forwarded = res.headers.get("x-middleware-request-x-storelib-community-path")
    globalThis.__forwarded = forwarded ? { "x-storelib-community-path": forwarded } : {}
    globalThis.__page = page
    const slug = new URL(url).pathname.split("/")[2]
    try {
      await Layout({ children: "page", params: Promise.resolve({ slug }) })
      return { rendered: true, forwarded }
    } catch (e) {
      const digest = String(e?.digest || "")
      if (!digest.startsWith("NEXT_REDIRECT")) throw e
      const parts = digest.split(";")
      return { to: parts[2], status: Number(parts[3]), forwarded }
    }
  }

  console.log("\nAn old address, through the proxy and the layout")
  const cases = [
    ["https://storelib.com/community/clay-club", "/community/clay-studio"],
    ["https://storelib.com/community/clay-club/post/7d1c?c=42&ref=x", "/community/clay-studio/post/7d1c?c=42&ref=x"],
    ["https://storelib.com/community/clay-club/about", "/community/clay-studio/about"],
    ["https://storelib.com/community/clay-club/join?invite=Abc_123-xyz7890123", "/community/clay-studio/join?invite=Abc_123-xyz7890123"],
    ["https://storelib.com/community/clay-club/space/critique?sort=top", "/community/clay-studio/space/critique?sort=top"],
    ["https://storelib.com/community/Clay-Studio/members", "/community/clay-studio/members"],
  ]
  for (const [url, to] of cases) {
    const r = await follow(url, visitor(COMMUNITY))
    expect(r.to === to && r.status === 308, `${new URL(url).pathname}${new URL(url).search} -> 308 ${to}`, r)
  }
  const member = await follow("https://storelib.com/community/clay-club/saved", visitor(COMMUNITY, "member"))
  expect(member.to === "/community/clay-studio/saved" && member.status === 308, "a member too, before the member frame is drawn", member)
  const spoofed = await follow("https://storelib.com/community/clay-club/post/1", visitor(COMMUNITY), "/community/clay-club/../../evil")
  expect(spoofed.forwarded === "/community/clay-club/post/1" && spoofed.to === "/community/clay-studio/post/1", "a header the visitor sent is replaced by the proxy's", spoofed)

  console.log("\nNo redirect")
  const here = await follow("https://storelib.com/community/clay-studio/post/1", visitor(COMMUNITY))
  expect(here.rendered === true, "the current address renders", here)
  const draft = await follow("https://storelib.com/community/clay-club", visitor({ ...COMMUNITY, status: "draft" }))
  expect(draft.rendered === true, "a draft, for somebody who is not its staff: no redirect (its page is a 404)", draft)
  const staffDraft = await follow("https://storelib.com/community/clay-club", () => ({ state: "member", community: { ...COMMUNITY, status: "draft" }, viewer: { isOwner: true, isCreatorAccount: true, role: "owner" } }))
  expect(staffDraft.to === "/community/clay-studio" && staffDraft.status === 308, "a draft's own staff are sent on", staffDraft)
  const closed = await follow("https://storelib.com/community/clay-club", visitor(COMMUNITY, "closed"))
  expect(closed.rendered === true, "a suspended community: no redirect", closed)
  const off = await follow("https://storelib.com/community/clay-club", () => ({ state: "off", community: null, viewer: null }))
  expect(off.rendered === true, "communities switched off: no redirect", off)
  const missing = await follow("https://storelib.com/community/never-was", () => ({ state: "missing", community: null, viewer: null }))
  expect(missing.rendered === true, "an address nobody had: no redirect (404 below)", missing)
} finally {
  rmSync(dir, { recursive: true, force: true })
}
console.log(broken ? `\n${broken} check(s) failed` : "\nall checks passed")
process.exit(broken ? 1 : 0)
