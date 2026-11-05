/**
 * ===========================================================================
 *  WHAT VERCEL BUILDS, AND WHAT EACH BUILD AND VISIT COSTS
 * ===========================================================================
 * The owner: "lowest practical monthly costs without sacrificing speed,
 * stability or functionality", and a build that runs out of memory on the
 * Standard (4 CPU, 8 GB) machine. Measured with a sampler over the whole
 * build's process tree on a 4 CPU machine, cold `pnpm build`:
 *
 *   Turbopack source maps on (default)   peak 8,524 MB, compiled in 2.6-3.3 min
 *   turbopackMemoryLimit 4.5 GB          peak 8,583 MB (no effect)
 *   Turbopack source maps off            peak 6,960 MB, compiled in 2.3 min
 *
 * Measured again on 2026-10-29, the app grown since, same machine, sampled
 * every 0.5 s, cold `pnpm build`:
 *
 *   as it was                            peak 8,447 MB (Turbopack 7.2 GB, CSS worker 0.86 GB)
 *   hover variant in its own file        CSS worker 0.86 GB to 0.33 GB, same CSS byte for byte
 *   input source maps not read           a further 80 MB, 20 s
 *   result                               peak 7,797 to 7,842 MB over three builds
 *
 *   turbopackMemoryLimit 3 GB, RAYON/TOKIO at 1 thread, scope hoisting off:
 *   no change. Filesystem cache for build: 10.7 GB cold, worse. Client nested
 *   async chunking off: compile still running after 30 min.
 *
 * Run with:  npm run test:push
 */
import { readFileSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { readCode } from "./_source"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}`)
  }
}

console.log("\n1. Builds")
const config = readFileSync("next.config.mjs", "utf8")
check("Turbopack's production build makes no source maps (8.5 GB to 7.0 GB peak)", /turbopackSourceMaps: false,/.test(config))
check("and the source maps packages ship are not read in either", /turbopackInputSourceMaps: false,/.test(config))
const globalsCss = readFileSync("app/globals.css", "utf8")
check("no block @custom-variant in globals.css: Tailwind clones the whole file's source for every class that uses one (CSS worker 610 MB to 90 MB)", !/@custom-variant [\w-]+\s*\{/.test(globalsCss) && /^@import "\.\/hover-variant\.css";$/m.test(globalsCss) && /@custom-variant hover \{/.test(readFileSync("app/hover-variant.css", "utf8")))
check("sass is loaded from node_modules on the server, not bundled", /serverExternalPackages:[^\]]*'sass'/.test(config))
check("type checking and the rest of the build are as they were (no new skips)", !/eslint:\s*\{\s*ignoreDuringBuilds/.test(config))
const vercel = JSON.parse(readFileSync("vercel.json", "utf8"))
check("agent branches (claude/*, codex/*) do not deploy on every push", vercel.git?.deploymentEnabled?.["claude/*"] === false && vercel.git?.deploymentEnabled?.["codex/*"] === false)
check("main is not turned off", vercel.git?.deploymentEnabled?.main !== false)
check("the ignored build step is the script", vercel.ignoreCommand === "bash scripts/vercel/ignore-build.sh")
const build = JSON.parse(readFileSync("package.json", "utf8")).scripts.build as string
const nativeLimits = readFileSync("scripts/build-limits.env", "utf8")
check("native build pools use explicit build-only limits, with the Node heap still bounded", build.includes("scripts/build-next.mjs") && build.includes("--max-old-space-size=4096") && readFileSync("scripts/build-next.mjs", "utf8").includes('process.loadEnvFile(new URL("./build-limits.env", import.meta.url))') && /^RAYON_NUM_THREADS=2$/m.test(nativeLimits) && /^TOKIO_WORKER_THREADS=2$/m.test(nativeLimits))
check("every cron is still there", Array.isArray(vercel.crons) && vercel.crons.length >= 12)

const run = (prev: string, cur: string) => {
  try {
    execFileSync("bash", ["scripts/vercel/ignore-build.sh"], { env: { ...process.env, VERCEL_GIT_PREVIOUS_SHA: prev, VERCEL_GIT_COMMIT_SHA: cur }, stdio: "pipe" })
    return 0
  } catch (e) {
    return (e as { status?: number }).status ?? 1
  }
}
check("no previous deployment: builds", run("", "HEAD") === 1)
check("a previous commit the clone does not have: builds", run("0000000000000000000000000000000000000000", "HEAD") === 1)
check("a redeploy with nothing changed: builds", run("HEAD", "HEAD") === 1)
const script = readFileSync("scripts/vercel/ignore-build.sh", "utf8")
check("only tests, docs, SQL, native shells, CI, root notes and check scripts may skip", /grep -vE '\^\(tests\/\|docs\/\|supabase\/\|sql\/\|android\/\|ios\/\|\\\.github\/\|scratchpad\/\|\[\^\/\]\+\\\.md\$\|scripts\/\(check\|render\|probe\)-\[\^\/\]\+\$\)'/.test(script))
check("nothing the app reads lives in a skipped folder", !/from ["'](@\/|\.\.\/)+(docs|supabase|sql|tests|android|ios)\//.test(readCode("proxy.ts") + readCode("lib/website-builder/published-site.ts")))

console.log("\n2. Visits")
const proxy = readCode("proxy.ts")
check("a built website's homepage on a connected domain is cached 60s like its subdomain, not the landing page's hour", /else if \(builtSite && \(pathname === "\/" \|\| pathname === ""\)\) r\.headers\.set\("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300"\)/.test(proxy))
check("and a password page or a market's prices are still never shared", /if \(guardedDomain\) r\.headers\.set\("Cache-Control", "private, no-store"\)/.test(proxy) && /else if \(\/~m-\/\.test\(rewritePath\)\) r\.headers\.set\("Cache-Control", "private, no-cache"\)/.test(proxy))
check("Supabase pictures are optimized only from storage paths", (config.match(/supabase\.co',\n\s*pathname: '\/storage\/v1\/\*\*'/g) ?? []).length === 2)

console.log("\n3. Polling")
const detail = readCode("app/(storelib)/app/emails/email-detail.tsx")
check("an email that is sending is read every 5s, not while the tab is hidden, and at once when it comes back", /if \(!document\.hidden\) refresh\(reportKey\(seed\.id\)\)\s*\}, 5000\)/.test(detail) && /addEventListener\("visibilitychange", back\)/.test(detail))
const composer = readCode("components/email/compose/composer.tsx")
check("the composer's send progress the same way", /if \(document\.hidden\) return/.test(composer) && /setInterval\(ask, 5000\)/.test(composer) && /addEventListener\("visibilitychange", ask\)/.test(composer))
const links = readCode("components/onepage/tabs/links-tab.tsx")
check("a music link's missing picture is asked a few times, not every 4s forever, and not while hidden", /const THUMBNAIL_RETRIES = 5/.test(links) && /if \(tries >= THUMBNAIL_RETRIES\) return/.test(links) && /!onepage\?\.draft_blocks \|\| document\.hidden/.test(links))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
