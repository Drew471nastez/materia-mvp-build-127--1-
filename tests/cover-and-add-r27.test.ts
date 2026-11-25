/**
 * ===========================================================================
 *  THE COVER'S BROWSER IN EVERY FUNCTION THAT USES IT, AND ONE PRESS OF ADD,
 *  ONE WEBSITE (round 27)
 * ===========================================================================
 * Production, 2026-11-21 to 11-25: "[cover] could not take the screenshots:
 * The input directory .../@sparticuz/chromium/bin does not exist" from the
 * folded /api/website-builder/[...__fold] entry and from
 * /api/themes/marketplace/add, then 15 to 17 cover requests per new website.
 *
 *   TRACE        next.config.mjs's includes, matched the way Next's build
 *                matches them (its own picomatch, `contains`, the entry
 *                normalised as collect-build-traces.js does), carry the
 *                browser's bin/ into the folded entry, the cover route and
 *                Add, whichever way the build lays them out
 *   NO BROWSER   remembered by the server; the route says cover_unavailable
 *                with a wait; a template website gets the template's picture
 *   BACK OFF     the page asks no more while told to wait, a site at most
 *                twice in a row after failures, and stops looking when told
 *   ONE WEBSITE  a press's key: the same press again is the same website,
 *                twice at once waits, two servers keep the oldest
 *
 * Run with:  pnpm test:push
 */
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { createRequire } from "node:module"
import { BROWSER_MISSING_MS, CoverUnavailable, browserKnownMissing, forgetBrowserMissing, isBrowserMissing, noteBrowserMissing, templateCoverFallback, templateCoverPaths } from "@/lib/website-builder/template-cover"
import { FAILED_PAUSE_MS, MAX_FAILED_ASKS, mayAskCover, requestCover, resetCoverAsks, watchCover } from "@/lib/website-builder/cover-refresh"
import { ADD_KEY_SETTING, addKeyOfSettings, installsWithAddKey, isAddKey, oncePerKey, oneWebsitePerKey, withAddKey } from "@/lib/themes/add-attempt"
import { ADD_RESEND_MS, addAttemptKey, postAddTheme, settleAddAttempt } from "@/lib/themes/add-attempt-client"

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
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `   (${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 600)})`}`)
  }
}
const section = (t: string) => console.log(`\n${t}`)
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
const PRODUCTION_ERROR = 'The input directory "/var/task/node_modules/.pnpm/@sparticuz+chromium@153.0.0/node_modules/@sparticuz/chromium/bin" does not exist. If you are using a bundler (esbuild, webpack, etc.), you must externalize @sparticuz/chromium so it is not relocated.'

async function main() {
  section("The browser is traced into every function that photographs")
  {
    const req = createRequire(join(process.cwd(), "package.json"))
    const picomatch = req("next/dist/compiled/picomatch") as (glob: string, o: object) => (s: string) => boolean
    const { normalizeAppPath } = req("next/dist/shared/lib/router/utils/app-paths") as { normalizeAppPath: (p: string) => string }
    const mod = (await import(join(process.cwd(), "next.config.mjs"))) as { default: unknown }
    const config = (typeof mod.default === "function" ? await (mod.default as (p: string, o: object) => unknown)("phase-production-build", {}) : mod.default) as { outputFileTracingIncludes: Record<string, string[]> }
    const includes = config.outputFileTracingIncludes
    /* As collect-build-traces.js: the entry normalised, each key a picomatch glob with dot and contains. */
    const includedFor = (entry: string) => {
      const route = normalizeAppPath(entry)
      return Object.entries(includes).filter(([glob]) => picomatch(glob, { dot: true, contains: true })(route)).flatMap(([, list]) => list)
    }
    const BIN = /^\.\/node_modules\/\.pnpm\/@sparticuz\+chromium@\*\/node_modules\/@sparticuz\/chromium\/bin\/\*\*$/
    const entries = [
      "/api/website-builder/[...__fold]/route", /* what Vercel builds (scripts/fold-api-routes.mjs: 80 routes into one entry) */
      "/api/website-builder/themes/[installId]/cover/route",
      "/api/website-builder/themes/create/route",
      "/api/themes/marketplace/add/route",
      "/api/themes/[...__fold]/route",
    ]
    for (const e of entries) check(`  ${e}: the browser's bin/`, includedFor(e).some((g) => BIN.test(g)), includedFor(e))
    check("  and the templates' files still with Add and the folded builder", includedFor("/api/themes/marketplace/add/route").includes("./theme-packages/**/*") && includedFor("/api/website-builder/[...__fold]/route").includes("./theme-packages/**/*"))
    const pnpmDir = join("node_modules", ".pnpm")
    const pkg = readdirSync(pnpmDir).find((d) => d.startsWith("@sparticuz+chromium@"))
    const bin = pkg ? join(pnpmDir, pkg, "node_modules", "@sparticuz", "chromium", "bin") : ""
    check("  the glob names a folder that is there, with the packed browser in it", !!pkg && existsSync(bin) && readdirSync(bin).some((f) => /chromium/.test(f)), pkg)
    check("  the package stays outside the bundle", /serverExternalPackages: \[[^\]]*'@sparticuz\/chromium', 'puppeteer-core'\]/.test(read("next.config.mjs")))
  }

  section("No browser: said once, remembered, and the template's picture instead")
  {
    forgetBrowserMissing()
    check("the production error is 'no browser'", isBrowserMissing(new Error(PRODUCTION_ERROR)) && isBrowserMissing(new CoverUnavailable()))
    check("  a slow page is not", !isBrowserMissing(new Error("the render page answered 503")) && !isBrowserMissing(new Error("Navigation timeout of 9000 ms exceeded")))
    const t0 = 1_000_000
    noteBrowserMissing(t0)
    check(`  remembered for ${BROWSER_MISSING_MS / 60_000} minutes, then tried again`, browserKnownMissing(t0 + 1000) && !browserKnownMissing(t0 + BROWSER_MISSING_MS + 1))
    forgetBrowserMissing()
    const take = code("lib/website-builder/cover-take.ts")
    check("  takeCover starts no browser while it is known missing, and notes it when a launch says so", /if \(browserKnownMissing\(\)\) throw new CoverUnavailable\(\)/.test(take) && /if \(isBrowserMissing\(e\)\) noteBrowserMissing\(\)/.test(take) && take.indexOf("browserKnownMissing()") < take.indexOf("takeCoverShots(page)"))
    const route = code("app/api/website-builder/themes/[installId]/cover/route.ts")
    check("  the cover route: the template's picture, else 503 cover_unavailable with Retry-After", /const fallback = await templateCoverOf\(owner, renderOrigin\(req\.url\)\)/.test(route) && /code: "cover_unavailable", retry_after_s: COVER_RETRY_AFTER_S \}, \{ status: 503, headers: \{ "Retry-After"/.test(route) && /browserKnownMissing\(\) \? \{ url: null, unavailable: true \}/.test(route))
    check("  a new website's photograph after the answer falls back the same way", /if \(isBrowserMissing\(e\)\) await templateCoverOf\(owner, origin\)/.test(take))

    check("a template listing has its two pictures; anything else none", JSON.stringify(templateCoverPaths("clothing")) === JSON.stringify({ cover: "/themes/materia/clothing.webp", phone: "/themes/materia/clothing-phone.webp" }) && templateCoverPaths("not-a-template") === null && templateCoverPaths(null) === null)
    const webp = readFileSync(join("public", "themes", "materia", "clothing.webp"))
    const served: string[] = []
    const fetchImpl = async (u: URL) => { served.push(u.pathname); return { ok: true, arrayBuffer: async () => webp.buffer.slice(webp.byteOffset, webp.byteOffset + webp.byteLength) as ArrayBuffer } }
    const stored: number[] = []
    const store = async (d: Buffer, p: Buffer | null) => { stored.push(d.byteLength + (p?.byteLength ?? 0)); return { url: "https://x/cover.webp" } }
    const got = await templateCoverFallback({ settings: async () => ({ compat: { listing: "clothing" } }), newest: async () => null, store, origin: "https://storelib.com", maxBytes: 2 * 1024 * 1024, fetchImpl })
    check("  a template website with no cover gets the template's own picture, both widths", got?.url === "https://x/cover.webp" && served.join(",") === "/themes/materia/clothing.webp,/themes/materia/clothing-phone.webp" && stored.length === 1)
    const kept = await templateCoverFallback({ settings: async () => ({ compat: { listing: "clothing" } }), newest: async () => ({ url: "old" }), store, origin: "https://storelib.com", maxBytes: 2 * 1024 * 1024, fetchImpl })
    const notTemplate = await templateCoverFallback({ settings: async () => ({ marketplace_listing: "someones-upload" }), newest: async () => null, store, origin: "https://storelib.com", maxBytes: 2 * 1024 * 1024, fetchImpl })
    const notWebp = await templateCoverFallback({ settings: async () => ({ compat: { listing: "clothing" } }), newest: async () => null, store, origin: "https://storelib.com", maxBytes: 2 * 1024 * 1024, fetchImpl: async () => ({ ok: true, arrayBuffer: async () => new TextEncoder().encode("<html>").buffer as ArrayBuffer }) })
    check("  never over a cover the website has, never for an uploaded theme, never a page that is not a picture", kept === null && notTemplate === null && notWebp === null && stored.length === 1)
  }

  section("The page backs off")
  {
    const calls: { method: string; url: string }[] = []
    let answer: () => Response = () => new Response("{}", { status: 500 })
    ;(globalThis as { fetch: unknown }).fetch = async (url: string, init?: RequestInit) => {
      calls.push({ method: init?.method ?? "GET", url })
      return answer()
    }
    resetCoverAsks()
    answer = () => new Response(JSON.stringify({ error: "x", code: "cover_unavailable", retry_after_s: 600 }), { status: 503 })
    await requestCover("site-a")
    await requestCover("site-a")
    await requestCover("site-b")
    check("told cover_unavailable: no site is asked again until the wait is over", calls.length === 1 && !mayAskCover("site-b") && mayAskCover("site-b", Date.now() + 601_000), calls)

    resetCoverAsks()
    calls.length = 0
    answer = () => new Response("{}", { status: 502 })
    for (let i = 0; i < 5; i++) await requestCover("site-c")
    check(`  other failures: a site is asked at most ${MAX_FAILED_ASKS} times in a row, then left for ${FAILED_PAUSE_MS / 60_000} minutes`, calls.length === MAX_FAILED_ASKS && !mayAskCover("site-c") && mayAskCover("site-c", Date.now() + FAILED_PAUSE_MS + 1) && mayAskCover("site-d"))

    resetCoverAsks()
    calls.length = 0
    let n = 0
    answer = () => (++n === 1 ? new Response("{}", { status: 502 }) : new Response(JSON.stringify({ url: "https://x/c.webp", mobile_url: null, updated_at: new Date().toISOString() }), { status: 200 }))
    await requestCover("site-e")
    const ok = await requestCover("site-e")
    await requestCover("site-e")
    check("  a cover that arrives starts the count again", ok?.url === "https://x/c.webp" && calls.length === 3)

    resetCoverAsks()
    calls.length = 0
    answer = () => new Response(JSON.stringify({ url: null, unavailable: true }), { status: 200 })
    const looked = await watchCover("site-f", [1, 1, 1, 1, 1, 1, 1, 1, 1])
    await requestCover("site-f")
    check("  a look that says no photograph is coming stops looking, and asks for none", looked === null && calls.length === 1 && calls[0].method === "GET", calls)
    resetCoverAsks()
  }

  section("One press of Add, one website")
  {
    check("a key is the page's kind of value", isAddKey("3f2a9c1e-1b2c-4d5e-8f90-123456789abc") && !isAddKey("short") && !isAddKey("a,b=c.eq.x") && !isAddKey(42))
    const plain = withAddKey({ a: 1 }, "key-12345678")
    const compat = withAddKey({ compat: { listing: "clothing" } }, "key-12345678")
    check("  written beside the listing note, read back the same", plain[ADD_KEY_SETTING] === "key-12345678" && (compat.compat as { add_key?: string; listing?: string }).add_key === "key-12345678" && (compat.compat as { listing?: string }).listing === "clothing" && addKeyOfSettings(plain) === "key-12345678" && addKeyOfSettings(compat) === "key-12345678" && addKeyOfSettings({}) === null)

    type Row = Record<string, unknown>
    const tables: Record<string, Row[]> = {
      store_theme_installs: [
        { id: "w1", name: "Clothing", created_at: "2026-11-25T10:00:00Z", creator_id: "c1" },
        { id: "w2", name: "Clothing", created_at: "2026-11-25T10:00:03Z", creator_id: "c1" },
        { id: "w3", name: "Other", created_at: "2026-11-25T09:00:00Z", creator_id: "c1" },
        { id: "z1", name: "Theirs", created_at: "2026-11-25T08:00:00Z", creator_id: "c2" },
      ],
      store_theme_settings: [
        { install_id: "w1", settings: { compat: { listing: "clothing", add_key: "key-12345678" } } },
        { install_id: "w2", settings: { compat: { listing: "clothing", add_key: "key-12345678" } } },
        { install_id: "w3", settings: { compat: { listing: "x" } } },
        { install_id: "z1", settings: { compat: { add_key: "key-12345678" } } },
      ],
    }
    const deleted: string[] = []
    const admin = {
      from(table: string) {
        const filters: ((r: Row) => boolean)[] = []
        let del = false
        const q: Record<string, unknown> = {
          select: () => q,
          eq: (k: string, v: unknown) => { filters.push((r) => r[k] === v); return q },
          in: (k: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[k])); return q },
          or: (expr: string) => {
            const key = /eq\.([A-Za-z0-9_-]+)/.exec(expr)?.[1]
            filters.push((r) => addKeyOfSettings(r.settings) === key)
            return q
          },
          delete: () => { del = true; return q },
          then: (ok: (v: unknown) => unknown) => {
            const rows = tables[table].filter((r) => filters.every((f) => f(r)))
            if (del) { for (const r of rows) deleted.push(String(r.id)); tables[table] = tables[table].filter((r) => !rows.includes(r)); return Promise.resolve({ error: null }).then(ok) }
            return Promise.resolve({ data: rows, error: null }).then(ok)
          },
        }
        return q
      },
    }
    const found = await installsWithAddKey(admin as never, "c1", "key-12345678")
    check("  the store's websites with the key, oldest first, never another store's", found.map((f) => f.id).join(",") === "w1,w2")
    const kept = await oneWebsitePerKey(admin as never, "c1", "key-12345678", "w2")
    check("  two servers made two: the younger goes, the older is the answer", kept?.id === "w1" && deleted.join(",") === "w2" && tables.store_theme_installs.some((r) => r.id === "w1"))
    const alone = await oneWebsitePerKey(admin as never, "c1", "key-12345678", "w1")
    check("  the oldest itself stays", alone === null && deleted.length === 1)

    const order: string[] = []
    let release!: () => void
    const first = oncePerKey("k-same-123", async () => { order.push("first starts"); await new Promise<void>((r) => (release = r)); order.push("first ends"); return 1 })
    const second = oncePerKey("k-same-123", async () => { order.push("second starts"); return 2 })
    await new Promise((r) => setTimeout(r, 5))
    release()
    await Promise.all([first, second])
    check("  the same key twice at once on one server: the second starts after the first ends", order.join(" | ") === "first starts | first ends | second starts", order)

    const add = code("app/api/themes/marketplace/add/route.ts")
    check("the route: the key read, the same press answered before the rate limit, the key in the first write, the race settled", /return oncePerKey\(key, \(\) => addToLibrary\(req, key\)\)/.test(add) && add.indexOf("installsWithAddKey(") < add.indexOf("const limited = await rateLimit(") && /const keyed = key \? withAddKey\(marked, key\) : marked/.test(add) && (add.match(/const earlier = await settled\(/g) ?? []).length === 3 && /replay: true/.test(add))

    const sent: { key: string }[] = []
    let mode: "drop" | "ok" | "500" = "drop"
    let drops = 0
    const fetchImpl = async (_u: string, init: RequestInit) => {
      sent.push(JSON.parse(String(init.body)))
      if (mode === "drop" && drops++ === 0) throw new TypeError("Failed to fetch")
      return new Response("{}", { status: mode === "500" ? 500 : 200 })
    }
    const waits: number[] = []
    settleAddAttempt("clothing")
    const r1 = await postAddTheme("clothing", fetchImpl, async (ms) => { waits.push(ms) })
    check("the page: a press with no answer is sent again once, with the same key", r1.status === 200 && sent.length === 2 && sent[0].key === sent[1].key && waits[0] === ADD_RESEND_MS)
    const next = addAttemptKey("clothing")
    check("  an answer settles it: the next press is a new key", next !== sent[0].key)
    mode = "500"
    sent.length = 0
    await postAddTheme("clothing", fetchImpl, async () => {})
    mode = "ok"
    await postAddTheme("clothing", fetchImpl, async () => {})
    check("  a 5xx keeps the key: the next press is the same press", sent.length === 2 && sent[0].key === sent[1].key && sent[0].key === next)
    check("  both pages press through it", /await postAddTheme\(slug\)/.test(code("components/themes/use-add-theme.ts")) && /await postAddTheme\(l\.slug\)/.test(code("app/(storelib)/app/website-builder/website-builder-client.tsx")))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log("\nFailures:")
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
