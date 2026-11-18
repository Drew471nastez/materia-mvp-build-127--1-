#!/usr/bin/env node
/**
 * First-load JavaScript per key route, against a budget.
 *
 *   node scripts/perf-budget.mjs            check .next against perf-budgets.json
 *   node scripts/perf-budget.mjs --write    set every budget to today + 10%
 *   node scripts/perf-budget.mjs --dir X    read another build folder
 *   node scripts/perf-budget.mjs --budgets F   another budgets file
 *
 * Run after `next build`. Next 16 builds with Turbopack, which writes no
 * app-build-manifest.json and prints no size column. What it does write, for
 * every page, is `server/app/<page>_client-reference-manifest.js`: its
 * `entryJSFiles` names the client chunks of each segment on the way to the
 * page (root layout, group layouts, error and not-found boundaries, the page).
 * A route's first load is those chunks plus build-manifest.json's
 * `rootMainFiles` (the runtime and React), each counted once, gzipped. The
 * nomodule polyfill is left out: modern browsers never fetch it.
 *
 * A route over its budget fails the run. So does the server output
 * (`.next/server`, the code the functions are made from, without the trace
 * lists) when it grows past its own. The figures go to `.next/perf-budget.json` and, on GitHub, to the
 * job summary.
 *
 * Budgets live in perf-budgets.json at the root. Raising one is a decision:
 * edit the number in the same pull request as the code that needs it, and
 * say why in the description.
 */
import { readFileSync, readdirSync, statSync, writeFileSync, appendFileSync, existsSync } from "node:fs"
import { join, resolve } from "node:path"
import { gzipSync } from "node:zlib"
import vm from "node:vm"
import { pathToFileURL } from "node:url"

const args = process.argv.slice(2)
const WRITE = args.includes("--write")
const dirArg = args.indexOf("--dir")
const NEXT = dirArg >= 0 ? args[dirArg + 1] : ".next"
const budgetsArg = args.indexOf("--budgets")
const BUDGETS_FILE = budgetsArg >= 0 ? args[budgetsArg + 1] : "perf-budgets.json"
const HEADROOM = 1.1

/** The routes that matter most, by the address a person types. */
export const ROUTES = [
  { route: "/", label: "Home" },
  { route: "/pricing", label: "Pricing" },
  { route: "/explore", label: "Explore" },
  { route: "/p/[slug]", label: "Product page" },
  { route: "/app", label: "Dashboard" },
  /* Round 12 (PLATPERF): the dashboard pages people move between most, each its own first load. */
  { route: "/app/products", label: "Dashboard: Products" },
  { route: "/app/orders", label: "Dashboard: Orders" },
  { route: "/app/analytics", label: "Dashboard: Analytics" },
  { route: "/app/emails", label: "Dashboard: Emails" },
  { route: "/app/settings", label: "Dashboard: Settings" },
  { route: "/website-builder/editor/[installId]", label: "Website editor" },
  { route: "/w/[username]", label: "Website on storelib.com" },
  { route: "/checkout/site", label: "Website checkout" },
]

const kb = (bytes) => Math.round((bytes / 1024) * 10) / 10

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"))
}

/** Runs a client reference manifest in a sandbox and returns what it assigns. */
function loadManifest(path) {
  const sandbox = { globalThis: {} }
  sandbox.globalThis = sandbox
  vm.runInNewContext(readFileSync(path, "utf8"), sandbox, { filename: path, timeout: 5000 })
  const all = sandbox.__RSC_MANIFEST ?? {}
  const first = Object.values(all)[0]
  if (!first) throw new Error(`${path} assigned no manifest`)
  return first
}

const sizeCache = new Map()
function sizeOf(nextDir, file) {
  const path = join(nextDir, file)
  if (sizeCache.has(path)) return sizeCache.get(path)
  const buf = readFileSync(path)
  const s = { raw: buf.length, gzip: gzipSync(buf, { level: 9 }).length }
  sizeCache.set(path, s)
  return s
}

/**
 * Bytes under `dir`. `skip` leaves files out by name: the server output is
 * measured without its `.nft.json` trace lists, which name node_modules by a
 * relative path as deep as the checkout, so the same build measured 9 MB
 * more in a nested worktree than at a repository root.
 */
function dirBytes(dir, skip = () => false) {
  let total = 0
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) total += dirBytes(p, skip)
    else if (!skip(name)) total += st.size
  }
  return total
}

/** Turbopack lists entry files; Webpack stores [chunk id, file] references on client modules. */
export function entryChunks(manifest) {
  const entries = manifest.entryJSFiles
  const lists = entries && Object.keys(entries).length
    ? Object.values(entries)
    : Object.values(manifest.clientModules ?? {}).map((module) => module.chunks ?? [])
  const files = new Set()
  for (const list of lists) {
    if (!Array.isArray(list)) throw new Error("Unknown client-reference chunk format")
    for (const file of list) if (typeof file === "string" && file.endsWith(".js")) files.add(decodeURIComponent(file))
  }
  return files
}

export function measure(nextDir = NEXT) {
  const build = readJson(join(nextDir, "build-manifest.json"))
  const appPaths = readJson(join(nextDir, "app-path-routes-manifest.json"))
  const byRoute = new Map(Object.entries(appPaths).filter(([k]) => k.endsWith("/page")).map(([k, v]) => [v, k]))
  const rootMain = build.rootMainFiles ?? []

  const routes = ROUTES.map(({ route, label }) => {
    const page = byRoute.get(route)
    if (!page) return { route, label, missing: `no page for ${route} in app-path-routes-manifest.json` }
    const file = join(nextDir, "server/app", `${page}_client-reference-manifest.js`)
    if (!existsSync(file)) return { route, label, page, missing: `${file} not found` }
    const manifest = loadManifest(file)
    const chunks = new Set(rootMain)
    for (const file of entryChunks(manifest)) chunks.add(file)
    let raw = 0
    let gzip = 0
    for (const c of chunks) {
      const s = sizeOf(nextDir, c)
      raw += s.raw
      gzip += s.gzip
    }
    return { route, label, page, chunks: chunks.size, rawKb: kb(raw), gzipKb: kb(gzip) }
  })

  const serverDir = join(nextDir, "server")
  const staticDir = join(nextDir, "static")
  return {
    measuredAt: new Date().toISOString(),
    buildId: existsSync(join(nextDir, "BUILD_ID")) ? readFileSync(join(nextDir, "BUILD_ID"), "utf8").trim() : null,
    routes,
    serverOutputMb: Math.round((dirBytes(serverDir, (n) => n.endsWith(".nft.json")) / 1048576) * 10) / 10,
    staticOutputMb: existsSync(staticDir) ? Math.round((dirBytes(staticDir) / 1048576) * 10) / 10 : null,
  }
}

function main() {
  if (!existsSync(join(NEXT, "build-manifest.json"))) {
    console.error(`perf-budget: no build in ${NEXT}. Run \`pnpm build\` first.`)
    process.exit(2)
  }
  const m = measure()
  const missing = m.routes.filter((r) => r.missing)

  if (WRITE) {
    if (missing.length) {
      for (const r of missing) console.error(`perf-budget: ${r.missing}`)
      process.exit(1)
    }
    const budgets = {
      $comment: "First-load JS per route, gzipped KB, and the server output in MB. Set by `node scripts/perf-budget.mjs --write` at the measured value plus 10%. Raising one is a decision: change it in the pull request that needs it and say why.",
      measuredAt: m.measuredAt,
      routes: Object.fromEntries(m.routes.map((r) => [r.route, { firstLoadGzipKb: Math.ceil(r.gzipKb * HEADROOM), measuredGzipKb: r.gzipKb }])),
      serverOutputMb: { budget: Math.ceil(m.serverOutputMb * HEADROOM), measured: m.serverOutputMb },
    }
    writeFileSync(BUDGETS_FILE, JSON.stringify(budgets, null, 2) + "\n")
    console.log(`perf-budget: wrote ${BUDGETS_FILE}`)
  }

  const budgets = readJson(BUDGETS_FILE)
  const failures = []
  const rows = []
  for (const r of m.routes) {
    if (r.missing) {
      failures.push(`${r.route}: ${r.missing}`)
      rows.push({ route: r.route, label: r.label, gzipKb: null, budget: null, ok: false })
      continue
    }
    const budget = budgets.routes?.[r.route]?.firstLoadGzipKb
    if (typeof budget !== "number") {
      failures.push(`${r.route}: no budget in ${BUDGETS_FILE}`)
      rows.push({ ...r, budget: null, ok: false })
      continue
    }
    const ok = r.gzipKb <= budget
    if (!ok) failures.push(`${r.route}: ${r.gzipKb} KB first-load JS is over its ${budget} KB budget`)
    rows.push({ ...r, budget, ok })
  }
  const serverBudget = budgets.serverOutputMb?.budget
  const serverOk = typeof serverBudget === "number" ? m.serverOutputMb <= serverBudget : true
  if (!serverOk) failures.push(`server output: ${m.serverOutputMb} MB is over its ${serverBudget} MB budget`)

  console.log("\nFirst-load JS (gzip), per route")
  for (const r of rows) {
    const fig = r.gzipKb === null ? "missing" : `${r.gzipKb.toFixed(1)} KB`.padStart(10)
    console.log(`  ${r.ok ? "ok  " : "OVER"}  ${r.route.padEnd(38)} ${fig}  budget ${r.budget ?? "?"} KB  (${r.rawKb ?? "?"} KB raw, ${r.chunks ?? "?"} chunks)`)
  }
  console.log(`\nServer output: ${m.serverOutputMb} MB (budget ${serverBudget ?? "none"} MB). Static: ${m.staticOutputMb} MB.`)

  try {
    writeFileSync(join(NEXT, "perf-budget.json"), JSON.stringify({ ...m, failures }, null, 2) + "\n")
  } catch {
    /* printed above either way */
  }

  if (process.env.GITHUB_STEP_SUMMARY) {
    const lines = [
      "### First-load JS per route",
      "",
      "| Route | Gzip | Budget | Raw | |",
      "| --- | ---: | ---: | ---: | --- |",
      ...rows.map((r) => `| \`${r.route}\` | ${r.gzipKb ?? "missing"} KB | ${r.budget ?? "?"} KB | ${r.rawKb ?? "?"} KB | ${r.ok ? "ok" : "**over**"} |`),
      "",
      `Server output: **${m.serverOutputMb} MB** (budget ${serverBudget ?? "none"} MB). Static: ${m.staticOutputMb} MB.`,
      "",
    ]
    try {
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join("\n"))
    } catch {
      /* a nicety */
    }
  }

  if (failures.length) {
    console.error("\nperf-budget: over budget")
    for (const f of failures) console.error(`  ${f}`)
    console.error(`\nIf the growth is deliberate, raise the number in ${BUDGETS_FILE} in this pull request and say why.`)
    process.exit(1)
  }
  console.log("\nperf-budget: every route within budget")
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main()
