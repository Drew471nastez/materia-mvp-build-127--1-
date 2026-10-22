/**
 * Runs scripts/measure-community-member-server.ts: bundled with esbuild for node, with the request-only modules (the
 * router, cookies and headers, server-only, the session read from cookies) stood in, so the real server code of a
 * member's community pages runs outside a request. React's cache() is one per request here, as on the server
 * (outside a server render React's own cache() remembers nothing); unstable_cache answers from what it already
 * holds, as a warm server does.
 *
 *   node scripts/measure-community-member-server.mjs [LAT]
 *   COLD=1    nothing held in the data cache (the first member in WALL_CACHE_S)
 *   BEFORE=1  the home address as it was before round 39 (the sales page's load first)
 *   PARTS=1   when each of the frame's four reads finished, after the viewer
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { createRequire } from "node:module"
import { build } from "esbuild"

const root = process.cwd()
const out = join(root, ".community-member39-server-probe")
mkdirSync(out, { recursive: true })
const require = createRequire(join(root, "package.json"))
globalThis.__realReact = require("react")

/* One request's cache(): every call with the same arguments shares one answer until the next request. */
const reactShim = `const R = globalThis.__realReact
let store = new Map()
globalThis.__resetRequest = () => { store = new Map() }
export const cache = (fn) => { const id = Symbol(); return (...args) => { const key = id.toString() + JSON.stringify(args.map((a) => (a && typeof a === "object" ? a.id ?? a.userId ?? JSON.stringify(a).slice(0, 200) : a))); let m = store.get(fn); if (!m) store.set(fn, (m = new Map())); if (!m.has(key)) m.set(key, fn(...args)); return m.get(key) } }
export default R
export const { createElement, Fragment, useState, useEffect, useMemo, useRef, useCallback, useContext, createContext, forwardRef, memo, Suspense, use, startTransition } = R
`
const wait = `const lat = () => globalThis.__lat ?? 50
const timed = async (name, v) => { const start = performance.now(); await new Promise((r) => setTimeout(r, lat())); globalThis.__span?.(name, start, performance.now()); return v }`
const stubs = {
  "server-only": "export {}\n",
  "next/navigation": "export const notFound = () => { throw new Error('NOT_FOUND') }\nexport const redirect = (u) => { throw new Error('REDIRECT ' + u) }\nexport const permanentRedirect = redirect\n",
  "next/headers": "export const cookies = async () => ({ get: () => undefined, getAll: () => [], set() {} })\nexport const headers = async () => new Headers()\n",
  "next/server": "export const connection = async () => {}\nexport class NextResponse extends Response { static json(b, i) { return new Response(JSON.stringify(b), i) } }\nexport const after = (f) => { try { const r = typeof f === 'function' ? f() : f; if (r && r.catch) r.catch(() => {}) } catch {} }\n",
  /* Warm by default (what a community most members are in sees: one reader in WALL_CACHE_S fills it for the rest); COLD=1 never holds anything. */
  "next/cache": (process.env.COLD ? "export const unstable_cache = (f) => f\n" : "const held = new Map()\nexport const unstable_cache = (f, keys = []) => async (...a) => { const k = JSON.stringify([keys, a]); if (!held.has(k)) held.set(k, await f(...a)); return held.get(k) }\n") + "export const revalidatePath = () => {}\nexport const revalidateTag = () => {}\nexport const updateTag = () => {}\nexport const unstable_noStore = () => {}\n",
  react: reactShim,
  supabaseAdmin: "export function createAdminClient() { return globalThis.__db }\n",
  flags: "export const PLATFORM_FLAG_KEYS = ['communities']\nexport const FLAG_CACHE_MS = 10000\nexport const isPlatformFlagKey = () => true\n/* Held in the server's memory for ten seconds (lib/platform/flags.ts): warm, nothing to wait for. */\nexport async function readFlag() { return true }\nexport async function setFlag() {}\nexport function clearFlagCache() {}\n",
  requestScope: `import { cache } from "react"
${wait}
/* The sign in (Supabase auth, a network read) and the creator and profile rows, one wait each, as lib/auth/request-scope.ts reads them. */
export const currentUserForRequest = cache(async () => timed("auth.getUser", { user: { id: globalThis.__me, created_at: "2025-01-01T00:00:00Z", user_metadata: { onboarded: true, welcome_seen: true } }, state: "signed_in" }))
export const profileForRequest = cache(async () => timed("profiles(me)", null))
export const creatorForRequest = cache(async () => timed("creators(me)", null))
export const sellerAccessForRequest = cache(async (id) => { await Promise.all([creatorForRequest(id), profileForRequest(id)]); return { creator: null, profile: null } })
export const SHELL_CREATOR_COLUMNS = ""
export const SHELL_PRIVATE_CREATOR_COLUMNS = ""
`,
}
for (const [name, body] of Object.entries(stubs)) writeFileSync(join(out, `${name.replace(/\W+/g, "_")}.mjs`), body)
const file = (name) => join(out, `${name.replace(/\W+/g, "_")}.mjs`)
await build({
  entryPoints: [join(root, "scripts/measure-community-member-server.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: join(out, "measure.cjs"),
  logLevel: "error",
  absWorkingDir: root,
  alias: { "@": "." },
  packages: "external",
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [
    {
      name: "request-stubs",
      setup(b) {
        b.onResolve({ filter: /^(server-only|next\/navigation|next\/headers|next\/cache|next\/server|react)$/ }, (a) => ({ path: file(a.path) }))
        b.onResolve({ filter: /lib\/supabase\/admin$/ }, () => ({ path: file("supabaseAdmin") }))
        b.onResolve({ filter: /lib\/platform\/flags$/ }, () => ({ path: file("flags") }))
        b.onResolve({ filter: /lib\/auth\/request-scope$/ }, () => ({ path: file("requestScope") }))
      },
    },
  ],
})
process.argv = [process.argv[0], join(out, "measure.cjs"), ...process.argv.slice(2)]
try {
  const { done } = await import(pathToFileURL(join(out, "measure.cjs")).href)
  await done
} finally {
  rmSync(out, { recursive: true, force: true })
}
