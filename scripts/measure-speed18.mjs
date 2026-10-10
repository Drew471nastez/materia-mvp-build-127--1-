/**
 * ===========================================================================
 *  HOW MUCH A PUBLIC PAGE ASKS THE DATABASE, BEFORE AND AFTER
 * ===========================================================================
 * Runs the real route code of Storelib's public pages in Node against a
 * realistic fixture (scripts/speed18/fixture.ts) and prints, for each page
 * and for a first and a repeat visit:
 *
 *   trips      database round trips the visitor waits on
 *   behind     round trips made after the answer (a cache refreshed behind
 *              the visitor, `after()` work), which nobody waits on
 *   ms         the server's time to its answer with every round trip taking
 *              RTT ms (default 20, roughly a Vercel function to Supabase in
 *              the same region); `ms@0` is the same with no network at all
 *   held       whether Next may keep the rendered page (ISR) or must render
 *              it for every visitor (the route's `dynamic`/`revalidate`)
 *
 * Supabase is answered by scripts/speed18/fake-postgrest.ts, Next's data
 * cache by scripts/speed18/shims/next-cache.ts (keys, tags, TTLs and
 * stale-while-revalidate as Next 16 keeps them).
 *
 * BASE=<git ref> builds the same bench from that commit's sources as well
 * and prints both, so a before and an after come from one machine and one
 * run:
 *
 *   node scripts/measure-speed18.mjs
 *   BASE=c4aa9f4a node scripts/measure-speed18.mjs
 *   RTT=40 ONLY=site-home,explore node scripts/measure-speed18.mjs
 */
import { execFileSync, execSync } from "node:child_process"
import { existsSync, mkdirSync, rmSync, writeFileSync, statSync } from "node:fs"
import { join, resolve } from "node:path"
import { build } from "esbuild"

const root = process.cwd()
const dir = join(root, ".speed18-probe")
mkdirSync(dir, { recursive: true })
const realReact = resolve(root, "node_modules/react/index.js")

function plugin(srcRoot) {
  const shims = join(root, "scripts/speed18/shims")
  return {
    name: "speed18",
    setup(b) {
      b.onResolve({ filter: /^next\/cache$/ }, () => ({ path: join(shims, "next-cache.ts") }))
      b.onResolve({ filter: /^next\/(headers|navigation)$/ }, () => ({ path: join(shims, "next-misc.ts") }))
      b.onResolve({ filter: /^next\/server$/ }, () => ({ path: join(shims, "next-server.ts") }))
      b.onResolve({ filter: /^next\/dist\// }, (args) => ({ path: args.path, external: true }))
      b.onResolve({ filter: /^next\/(link|image|script|dynamic|og|font\/.*|legacy\/image|form)$/ }, () => ({ path: join(shims, "next-client.ts") }))
      b.onResolve({ filter: /^next\/[a-z-]+$/ }, (args) => ({ path: `${args.path}.js`, external: true }))
      /* A stylesheet, ours or a package's: nothing to count. */
      b.onResolve({ filter: /(\.css$|^[a-z@][^.]*\/css(\/[^.]*)?$)/ }, () => ({ path: "css", namespace: "empty" }))
      b.onResolve({ filter: /^server-only$/ }, () => ({ path: "server-only", namespace: "empty" }))
      b.onResolve({ filter: /^__REAL_REACT__$/ }, () => ({ path: realReact, external: true }))
      b.onResolve({ filter: /^react$/ }, (args) => (args.importer.endsWith("react-cache.ts") ? undefined : { path: join(shims, "react-cache.ts") }))
      b.onResolve({ filter: /^@\// }, (args) => {
        const base = join(srcRoot, args.path.slice(2))
        for (const ext of ["", ".ts", ".tsx", ".js", ".mjs", "/index.ts", "/index.tsx", "/index.js"]) {
          if (existsSync(base + ext) && statSync(base + ext).isFile()) return { path: base + ext }
        }
        return undefined
      })
      b.onLoad({ filter: /.*/, namespace: "empty" }, () => ({ contents: "export {}", loader: "js" }))
    },
  }
}

async function bundle(label, srcRoot) {
  const out = join(dir, `bench-${label}.mjs`)
  await build({
    entryPoints: [join(root, "scripts/speed18/bench.tsx")],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    jsx: "automatic",
    packages: "external",
    outfile: out,
    logLevel: "error",
    loader: { ".css": "empty", ".svg": "dataurl", ".png": "dataurl", ".jpg": "dataurl", ".woff2": "empty", ".storelib": "text", ".md": "text" },
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [plugin(srcRoot)],
    banner: { js: `import { createRequire as __cr } from "node:module"; const require = __cr(import.meta.url);` },
  })
  return out
}

const builds = []
if (process.env.BASE) {
  const base = join(dir, "base")
  rmSync(base, { recursive: true, force: true })
  mkdirSync(base, { recursive: true })
  const paths = ["app", "components", "lib", "hooks", "themes", "content", "styles", "services", "proxy.ts", "tsconfig.json", "package.json"].filter((p) => existsSync(join(root, p)))
  execSync(`git archive ${process.env.BASE} ${paths.join(" ")} | tar -x -C ${base}`, { cwd: root, stdio: ["ignore", "ignore", "inherit"] })
  builds.push({ label: `before (${process.env.BASE})`, file: await bundle("base", base) })
}
builds.push({ label: "now (working tree)", file: await bundle("now", root) })

/* One process per scenario, so what one page left in a server's memory never warms the next. */
const run = (file, env) => {
  const out = execFileSync(process.execPath, [file], { cwd: root, encoding: "utf8", maxBuffer: 1 << 26, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "inherit"] })
  return JSON.parse(out.trim().split("\n").filter((l) => l.startsWith("{")).pop())
}
const results = []
try {
  for (const b of builds) {
    const wanted = (process.env.ONLY ?? "").split(",").filter(Boolean)
    const names = run(b.file, { SPEED18_LIST: "1" }).names.filter((n) => !wanted.length || wanted.includes(n))
    const rows = []
    for (const name of names) rows.push(...run(b.file, { ONLY: name }).rows)
    results.push({ label: b.label, rows })
  }
} finally {
  if (!process.env.KEEP) rmSync(dir, { recursive: true, force: true })
}

const pad = (s, n) => String(s).padEnd(n)
const padl = (s, n) => String(s).padStart(n)
console.log(`\nRTT ${process.env.RTT || 20}ms per database round trip (simulated); numbers are per visit.\n`)
const scenarios = [...new Set(results.flatMap((r) => r.rows.map((x) => x.name)))]
for (const name of scenarios) {
  console.log(name)
  for (const r of results) {
    const row = r.rows.find((x) => x.name === name)
    if (!row) {
      console.log(`  ${pad(r.label, 26)} (no such scenario)`)
      continue
    }
    for (const v of row.visits) {
      console.log(
        `  ${pad(r.label, 26)} ${pad(v.label, 14)} trips ${padl(v.trips, 3)}  behind ${padl(v.behind, 2)}  ${padl(v.ms.toFixed(0), 5)}ms  ms@0 ${padl(v.ms0.toFixed(1), 6)}  held ${row.held}${v.error ? `  (${v.error})` : ""}`,
      )
    }
  }
  console.log("")
}
if (process.env.TABLES) {
  for (const r of results) {
    console.log(`\n${r.label}: round trips by table`)
    for (const row of r.rows) {
      for (const v of row.visits) console.log(`  ${row.name} ${v.label}: ${v.tables.join(", ")}${v.answer ? `  => ${v.answer}` : ""}`)
    }
  }
}
if (process.env.JSON_OUT) writeFileSync(process.env.JSON_OUT, JSON.stringify(results, null, 2))
