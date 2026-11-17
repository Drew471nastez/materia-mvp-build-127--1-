/**
 * ===========================================================================
 *  THE API ROUTES, FOLDED INTO ONE ENTRY PER AREA, FOR THE PRODUCTION BUILD
 * ===========================================================================
 * Vercel's Standard build machine (4 CPUs, 8 GB, 7 GB for the build) killed
 * the production build at the end of compiling. Measured on 4 CPUs, cold
 * `pnpm build`, the whole process tree: 7,900 MB with the app as it is,
 * 5,300 MB with app/api taken out. Turbopack keeps a graph and chunking of
 * its own for every route entry, about 3 MB each, and there are 825 of them.
 *
 * So, in the production build only, each area of app/api below is one entry:
 * every plain route.ts in it is renamed route.folded.ts in place (a name the
 * router does not read, so its relative imports still resolve), and the area
 * gets one app/api/<area>/[...__fold]/route.ts that matches the address the
 * way the router did (static segments before [dynamic] before [...catch-all],
 * then [[...optional]]) and calls the same module's GET, POST, ... with the
 * same request and the same params. Addresses, methods, handlers, bodies and
 * headers do not change. The repository's own files do not change either:
 * this runs only on Vercel (VERCEL=1) or when STORELIB_FOLD_API=1 is set,
 * on a checkout that is thrown away after the build.
 *
 * Left as their own routes: an area's own route.ts, any route with route
 * segment config that a shared entry cannot carry (revalidate, static
 * params, a runtime other than Node), and the areas in KEEP (payments and
 * webhooks, cron, auth): those are called by other services and keep the
 * exact entry they were registered with.
 *
 *   node scripts/fold-api-routes.mjs            fold (only on Vercel or with STORELIB_FOLD_API=1)
 *   node scripts/fold-api-routes.mjs --dry      say what it would fold
 */
import { readdirSync, readFileSync, renameSync, writeFileSync, mkdirSync, statSync, existsSync } from "node:fs"
import { dirname, join, relative, resolve, sep } from "node:path"

const ROOT = process.cwd()
const API = join(ROOT, "app", "api")
const DRY = process.argv.includes("--dry")
const ON = process.env.VERCEL === "1" || process.env.STORELIB_FOLD_API === "1"
/** Called by other services, or about sign-in: each keeps its own entry. */
const KEEP = new Set(["stripe", "cron", "auth", "webhooks", "webhook", "paypal", "inngest", "health"])
const METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
/** Route segment config a shared entry cannot carry for one of its routes. */
const UNFOLDABLE = /export\s+(const|async function|function)\s+(revalidate|generateStaticParams|dynamicParams|fetchCache|preferredRegion)\b|export\s+const\s+runtime\s*=\s*["'](?!nodejs)|force-static/
const SLUG = "__fold"

if (!ON && !DRY) {
  console.log("fold-api-routes: off (runs on Vercel, or with STORELIB_FOLD_API=1)")
  process.exit(0)
}

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })

/** A path's segments as the router reads them: route groups (x) and the file name dropped. */
function segmentsOf(file, areaDir) {
  return relative(areaDir, file).split(sep).slice(0, -1).filter((s) => !(s.startsWith("(") && s.endsWith(")")))
}
const kindOf = (s) => (s.startsWith("[[...") ? 3 : s.startsWith("[...") ? 2 : s.startsWith("[") ? 1 : 0)

let folded = 0
let entries = 0
/** Every route file renamed, without its extension: an import of one (another route re-exporting its POST) is pointed at the new name. */
const renamed = new Set()
for (const area of readdirSync(API).sort()) {
  const areaDir = join(API, area)
  if (!statSync(areaDir).isDirectory() || KEEP.has(area) || area.startsWith("_") || area.startsWith("(") || area.startsWith("[")) continue
  const routes = walk(areaDir).filter((f) => f.endsWith(`${sep}route.ts`) || f.endsWith(`${sep}route.tsx`))
  const plain = []
  const kept = []
  for (const f of routes) {
    const segs = segmentsOf(f, areaDir)
    const src = readFileSync(f, "utf8")
    if (segs.length === 0 || UNFOLDABLE.test(src) || segs.some((s) => s.startsWith("@") || s.startsWith("_"))) kept.push(segs)
    else plain.push({ file: f, segs, src })
  }
  if (plain.length < 2) continue
  /* The catch-all sits beside the area's own top-level folders; a route left there with a dynamic first folder would clash with it. */
  if (kept.some((segs) => segs.length > 0 && kindOf(segs[0]) > 0) || existsSync(join(areaDir, `[...${SLUG}]`))) {
    console.log(`fold-api-routes: ${area} left as it is (a route left in it starts with a dynamic folder)`)
    continue
  }
  /* The order the router matches in: segment by segment, static before dynamic before catch-all before optional catch-all. */
  plain.sort((a, b) => {
    for (let i = 0; i < Math.max(a.segs.length, b.segs.length); i++) {
      const x = a.segs[i]
      const y = b.segs[i]
      if (x === undefined) return -1
      if (y === undefined) return 1
      const d = kindOf(x) - kindOf(y)
      if (d) return d
    }
    return 0
  })
  const maxDuration = Math.max(0, ...plain.map((r) => Number(/export\s+const\s+maxDuration\s*=\s*(\d+)/.exec(r.src)?.[1] ?? 0)))
  const dir = join(areaDir, `[...${SLUG}]`)
  const lines = []
  plain.forEach((r, i) => {
    const target = relative(dir, r.file.replace(/route\.tsx?$/, "route.folded")).split(sep).join("/")
    lines.push(`import * as r${i} from "${target.startsWith(".") ? target : `./${target}`}"`)
  })
  const table = plain.map((r, i) => `  [${JSON.stringify(r.segs)}, r${i}],`).join("\n")
  const body = `/* Generated by scripts/fold-api-routes.mjs for the production build: every plain route under app/api/${area}, one entry. Not in the repository. */
import type { NextRequest } from "next/server"
${lines.join("\n")}

type Mod = Record<string, unknown>
const ROUTES: [string[], Mod][] = [
${table}
]
${maxDuration ? `export const maxDuration = ${maxDuration}\n` : ""}export const dynamic = "force-dynamic"

function match(pattern: string[], path: string[]): Record<string, string | string[]> | null {
  const params: Record<string, string | string[]> = {}
  let i = 0
  for (const seg of pattern) {
    if (seg.startsWith("[[...")) {
      const rest = path.slice(i)
      if (rest.length) params[seg.slice(5, -2)] = rest
      return params
    }
    if (seg.startsWith("[...")) {
      const rest = path.slice(i)
      if (!rest.length) return null
      params[seg.slice(4, -1)] = rest
      return params
    }
    if (i >= path.length) return null
    if (seg.startsWith("[")) params[seg.slice(1, -1)] = path[i]
    else if (seg !== path[i]) return null
    i++
  }
  return i === path.length ? params : null
}

async function handle(method: string, req: NextRequest, ctx: { params: Promise<{ ${SLUG}: string[] }> }) {
  const path = (await ctx.params).${SLUG}
  for (const [pattern, mod] of ROUTES) {
    const params = match(pattern, path)
    if (!params) continue
    let fn = mod[method] as ((r: NextRequest, c: { params: Promise<Record<string, string | string[]>> }) => unknown) | undefined
    /* As the router does: HEAD falls back to GET; OPTIONS with no handler answers with the methods there are. */
    if (!fn && method === "HEAD") fn = mod.GET as typeof fn
    if (!fn && method === "OPTIONS") {
      const allow = ${JSON.stringify(METHODS)}.filter((m) => typeof mod[m] === "function" || (m === "HEAD" && typeof mod.GET === "function") || m === "OPTIONS")
      return new Response(null, { status: 204, headers: { Allow: allow.join(", ") } })
    }
    if (!fn) return new Response(null, { status: 405, headers: { Allow: ${JSON.stringify(METHODS)}.filter((m) => typeof mod[m] === "function").join(", ") } })
    return fn(req, { params: Promise.resolve(params) })
  }
  return new Response("Not Found", { status: 404 })
}

${METHODS.map((m) => `export function ${m}(req: NextRequest, ctx: { params: Promise<{ ${SLUG}: string[] }> }) { return handle("${m}", req, ctx) }`).join("\n")}
`
  if (DRY) {
    console.log(`fold-api-routes: ${area}: ${plain.length} routes into one entry${kept.length ? `, ${kept.length} left as they are` : ""}${maxDuration ? `, maxDuration ${maxDuration}` : ""}`)
  } else {
    for (const r of plain) {
      renameSync(r.file, r.file.replace(/route\.(tsx?)$/, "route.folded.$1"))
      renamed.add(r.file.replace(/\.tsx?$/, ""))
    }
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, "route.ts"), body)
  }
  folded += plain.length
  entries++
}
/*
  A route that imports another route ("@/app/api/perf/beacon/route", or a relative path): the import now names
  route.folded. Read across app, lib and components; only a specifier that resolves to a renamed file changes.
*/
let rewired = 0
if (!DRY && renamed.size) {
  const SPEC = /(from\s*|import\(\s*)(["'])([^"']+\/route)\2/g
  for (const top of ["app", "lib", "components"]) {
    const base = join(ROOT, top)
    if (!existsSync(base)) continue
    for (const file of walk(base)) {
      if (!/\.(tsx?|mjs|js)$/.test(file)) continue
      const text = readFileSync(file, "utf8")
      if (!text.includes("/route")) continue
      const next = text.replace(SPEC, (whole, lead, q, spec) => {
        const target = spec.startsWith("@/") ? join(ROOT, spec.slice(2)) : spec.startsWith(".") ? resolve(dirname(file), spec) : null
        if (!target || !renamed.has(target)) return whole
        rewired++
        return `${lead}${q}${spec}.folded${q}`
      })
      if (next !== text) writeFileSync(file, next)
    }
  }
}
console.log(`fold-api-routes: ${folded} routes in ${entries} entries${rewired ? `, ${rewired} imports of them pointed at the new names` : ""}${DRY ? " (dry run)" : ""}`)
