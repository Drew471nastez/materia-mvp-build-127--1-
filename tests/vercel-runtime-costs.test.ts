/**
 * ===========================================================================
 *  WHAT EACH REQUEST COSTS ONCE IT IS RUNNING
 * ===========================================================================
 * The owner: lower Vercel costs, with nothing a user or creator can see
 * changing. Three places paid for work nobody read:
 *
 *   1. proxy.ts read and renewed the session for beacons, CSP reports,
 *      scheduled jobs and webhooks, none of which reads a session.
 *   2. Every CSP report from every page of every host was a function call
 *      and a log line. Nineteen in twenty are now answered by the proxy.
 *   3. Every page load sent Storelib's own speed beacons, and every timed API
 *      call was recorded. One in four now; /admin/performance scales its
 *      counts back up. Creators' visitor analytics are not sampled.
 *
 * Run with:  NODE_OPTIONS="--conditions=react-server" npx tsx tests/vercel-runtime-costs.test.ts
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs"
import { join, relative, sep } from "node:path"
import { skipsSessionRefresh, carriesSignIn } from "@/lib/auth/no-session-paths"
import { CSP_REPORT_PATH, CSP_REPORT_SAMPLE_RATE, CONTENT_SECURITY_POLICY, keepsCspReport } from "@/lib/security/csp"
import { CLIENT_SAMPLE_RATE, SERVER_SAMPLE_RATE, estimatedCount } from "@/lib/perf/config"

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
const read = (p: string) => readFileSync(p, "utf8")
/** Code without its comments, for checks that something is absent. */
const code = (p: string) => read(p).replace(/^\s*\/\*[\s\S]*?\*\/\s*$/gm, "").replace(/^\s*(\/\/|\*).*$/gm, "")

console.log("\n1. The proxy reads no session for calls that read none")
{
  const signedIn = ["sb-abc-auth-token"]
  const exempt = [
    "/api/public/m", "/api/public/sv", "/api/public/vitals", "/api/perf/beacon", "/api/csp-report", "/api/client-errors",
    "/api/cron/rollup-daily", "/api/cron/process-scheduled-emails", "/api/stripe/webhook", "/api/stripe/webhook/connect",
    "/api/payments/airwallex/webhook", "/api/webhooks/mailgun", "/api/webhooks/video/mux", "/api/tracking/webhooks/shippo/t0k",
    "/api/health", "/api/version", "/api/metrics",
  ]
  check("beacons, reports, scheduled jobs and webhooks skip it", exempt.every((p) => skipsSessionRefresh(p, [])))
  check("whether or not the call carries a sign in", exempt.every((p) => skipsSessionRefresh(p, signedIn)))
  const kept = ["/api/payments/checkout", "/api/payments/webhook", "/api/perf/admin", "/api/store/ga-check", "/api/products", "/api/stripe/payouts", "/api/stripe/webhooks-list", "/app", "/sell", "/", "/api/cronjob", "/api/public"]
  check("the creator's payments, the admin, Settings' framed check and everything else still read it", kept.every((p) => !skipsSessionRefresh(p, [])))
  check("the visit and event trackers skip it for a visitor with no sign in", skipsSessionRefresh("/api/track-view", []) && skipsSessionRefresh("/api/track-event", ["visitor_id"]))
  check("and keep it for a signed in creator, whose own visits are left out with a renewed token", !skipsSessionRefresh("/api/track-view", signedIn) && !skipsSessionRefresh("/api/track-event", ["sb-x-auth-token.0"]))
  check("a sign in is recognised the way own-visit.ts recognises it", carriesSignIn(["sb-ref-auth-token"]) && !carriesSignIn(["visitor_id", "sl_lang"]) && /name\.startsWith\("sb-"\) && name\.includes\("auth-token"\)/.test(read("lib/analytics/own-visit.ts")))

  /* Every route the rule exempts, today and later, is read: none may read the session. */
  const routes: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      if (statSync(full).isDirectory()) walk(full)
      else if (name === "route.ts" || name === "route.tsx") routes.push(full)
    }
  }
  walk("app/api")
  const urlOf = (file: string) =>
    "/" + relative("app", file).split(sep).slice(0, -1).filter((s) => !/^\(.*\)$/.test(s)).map((s) => s.replace(/^\[+\.{0,3}([^\]]+)\]+$/, "$1")).join("/")
  const SESSION = /@\/lib\/supabase\/server|readCurrentUser|readVerifiedSession|currentUser\(|\.auth\.getUser|\.auth\.getSession|\bcookies\(\)|isOwnVisit|requireAdmin|adminSession/
  const exempted = routes.filter((f) => skipsSessionRefresh(urlOf(f), []) && !/track-(view|event)/.test(f))
  const reading = exempted.filter((f) => {
    let src = code(f)
    const target = src.match(/export \{[^}]*\} from "@\/(app\/api\/[^"]+)"/)
    if (target) {
      const next = `${target[1]}.ts`
      if (existsSync(next)) src += code(next)
    }
    return SESSION.test(src)
  })
  check(`every exempted handler (${exempted.length}) reads no session${reading.length ? `: ${reading.join(", ")}` : ""}`, exempted.length >= 25 && reading.length === 0)
  check("the trackers read it only through own-visit.ts, which is why they keep it when signed in", ["app/api/track-view/route.ts", "app/api/track-event/route.ts"].every((f) => !/@\/lib\/supabase\/server|getUser/.test(code(f))) && /isOwnVisit/.test(read("lib/analytics/collect-route.ts")))

  const proxy = read("proxy.ts")
  const at = (needle: string, from = 0) => proxy.indexOf(needle, from)
  const skip = at("if (skipsSessionRefresh(pathname,")
  check("the proxy skips only after the published site guards", skip > at('{ error: "Requests from published sites are not allowed." }') && skip > at("isPublishedSiteOrigin(request.headers.get(\"origin\"))"))
  check("after the custom domain lookup and the native app gate, which run as before", skip > at("await resolveCustomDomain(host)") && skip > at('url.pathname = "/native-start"'))
  check("and before the Supabase client is made or the session read", skip > 0 && skip < at("createServerClient(supabaseUrl") && skip < at("await readVerifiedSession(supabase") && at("await readVerifiedSession(supabase") > 0)
  /* Changed on purpose (round rel-auth): the cookie names are read once, for this skip and for the no session fast path after it (carriesSignIn). */
  check("answering with the response the request would have had", /const cookieNames = request\.cookies\.getAll\(\)\.map\(\(c\) => c\.name\)\s*if \(skipsSessionRefresh\(pathname, cookieNames\)\) return supabaseResponse/.test(proxy) && skip > at("supabaseResponse = respond()"))
}

console.log("\n2. CSP reports: a sample reaches a function")
{
  check("one in twenty is kept", CSP_REPORT_SAMPLE_RATE === 0.05)
  let kept = 0
  for (let i = 0; i < 10_000; i++) if (keepsCspReport(i / 10_000)) kept++
  check(`over an even spread of rolls, 5% are kept (${kept} of 10,000)`, kept === 500)
  const proxy = read("proxy.ts")
  const drop = proxy.indexOf("if (pathname === CSP_REPORT_PATH && request.method === \"POST\" && !keepsCspReport(Math.random()))")
  check("the proxy answers the rest with 204 before any lookup, on every host", drop > 0 && drop < proxy.indexOf("mcpHostRoute(bareHost") && /keepsCspReport\(Math\.random\(\)\)\) \{\s*return new NextResponse\(null, \{ status: 204 \}\)/.test(proxy))
  const route = read("app/api/csp-report/route.ts")
  check("the route logs what reaches it, capped per instance a minute", /if \(!allowedBeacon\("csp", Date\.now\(\), LINES_PER_MINUTE, lines\)\) break\s*console\.warn/.test(route) && /const LINES_PER_MINUTE = 30/.test(route))
  check("and still cuts the query and always answers 204", /const cut = raw\.split\(\/\[\?#\]\/\)\[0\]/.test(route) && (route.match(/status: 204/g) ?? []).length >= 2)
  const vercel = JSON.parse(read("vercel.json")) as { headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }> }
  const csp = vercel.headers.flatMap((h) => h.headers.map((x) => ({ source: h.source, ...x }))).find((x) => x.key === "Content-Security-Policy-Report-Only")
  check("the policy and its report address are unchanged, on every path", !!csp && csp.source === "/(.*)" && csp.value.includes(`report-uri ${CSP_REPORT_PATH}`) && CONTENT_SECURITY_POLICY.includes(`report-uri ${CSP_REPORT_PATH}`))
}

console.log("\n3. Speed beacons: one in four, counts scaled back up")
{
  check("one page load and one timed call in four", CLIENT_SAMPLE_RATE === 0.25 && SERVER_SAMPLE_RATE === 0.25)
  check("a count of sampled page views stands for four times as many", estimatedCount(25, 0.25) === 100 && estimatedCount(3, 0.25) === 12 && estimatedCount(25, 1) === 25 && estimatedCount(0, 0.25) === 0)
  const admin = read("app/admin/performance/performance-admin.tsx")
  check("page views per area are scaled", /estimated\(n, CLIENT_SAMPLE_RATE, "page view", "page views"\)/.test(admin))
  check("API calls and server errors are scaled", /estimated\(a\.samples, SERVER_SAMPLE_RATE, "call", "calls"\)/.test(admin) && /estimatedCount\(a\.bad, SERVER_SAMPLE_RATE\)/.test(admin))
  check("JavaScript errors are scaled, and the panel says from what", /estimatedCount\(e\.n, CLIENT_SAMPLE_RATE\)/.test(admin) && /Estimated from \$\{Math\.round\(CLIENT_SAMPLE_RATE \* 100\)\}% of page views/.test(admin))
  check("a problem's count is scaled by its own source's rate; a slow figure's samples are not", /p\.kind === "slow" \? plural\(p\.samples, "sample", "samples"\) : estimated\(p\.samples, p\.kind === "api-error" \? SERVER_SAMPLE_RATE : CLIENT_SAMPLE_RATE/.test(admin))
  check("an estimate says so", /\$\{rate < 1 \? "about " : ""\}/.test(admin))
  check("samples, which decide whether there is enough data, are never scaled", /plural\(samples, "sample", "samples"\)/.test(admin) && !/estimatedCount\(samples/.test(admin))
  check("the method note names both rates", /% of page loads and \$\{Math\.round\(SERVER_SAMPLE_RATE \* 100\)\}% of timed API calls are measured/.test(admin))
  check("the dice are still rolled before the collector is downloaded", /if \(Math\.random\(\) >= CLIENT_SAMPLE_RATE\) return/.test(read("components/perf/perf-beacon.tsx")))

  const exact = ["lib/analytics/page-tracker.ts", "lib/analytics/collect.ts", "lib/analytics/collect-route.ts", "app/api/track-view/route.ts", "app/api/track-event/route.ts", "components/website-builder/site-vitals.tsx", "lib/perf/site-vitals-inline.ts"]
  check("creators' visitor analytics are not sampled, and their websites' page views are all sent", exact.every((f) => !/SAMPLE_RATE|Math\.random\(\)/.test(code(f))))
  /*
    Website settings › Performance (part 210): every page view of a site's
    day is kept up to a thousand, then one in ten, then one in a hundred, by
    the database, and each kept row carries its weight so the counts the tab
    shows are the page views that arrived (tests/web-performance-v.test.ts).
    The route rolls no dice of its own.
  */
  check("a website's speed is sampled only by the database past a full day's sample, with weights", !/Math\.random\(\)/.test(code("app/api/public/vitals/route.ts")) && /p_full: FULL_SAMPLE_UNTIL/.test(code("app/api/public/vitals/route.ts")))
  check("a scheduled job's run is recorded every time", /export function timedJob[\s\S]*?\{\s*try \{\s*push\(/.test(read("lib/perf/server-timing.ts")))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
