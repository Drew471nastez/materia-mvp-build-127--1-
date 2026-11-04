/**
 * ===========================================================================
 *  ROUND 48, SECURITY HARDENING
 * ===========================================================================
 * Each block is one finding of the round (docs/reliability/SECURITY.md,
 * section 7): what was wrong, shown, and what stops it coming back.
 *
 *   R48-1  the About story of a creator page was rendered as raw markup;
 *          the page builder's own save stored it as sent
 *   R48-2  ?redirect= on /verify-email and /signup, and the stored redirect
 *          and ?fallback= on /auth/complete, were followed to any site
 *   R48-3  the password reset code routes: no rate limit, a reset code
 *          could be exchanged twice by two requests at once
 *   R48-4  the content security policy is ENFORCED on /app, /admin and the
 *          sign in pages of storelib.com, report only everywhere else
 *   R48-5  HSTS with includeSubDomains on storelib.com, and a Permissions-
 *          Policy on every other host
 *   R48-6  a theme package's SVG is never stored under a public address
 */
import { readFileSync } from "node:fs"
import { readCode } from "./_source"

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
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail)?.slice(0, 500)}`}`)
  }
}
const read = (p: string) => readFileSync(p, "utf8")

/* ── R48-1 ───────────────────────────────────────────────────────────────── */

async function aboutStoryIsCleaned() {
  console.log("\nR48-1. The About story on a creator page is drawn through the allow list")
  const { cleanStoredHtml } = await import("@/lib/rich-text/html")
  const attack = `<p>Hi</p><img src="x" onerror="fetch('/api/x')"><script>alert(1)</script><a href="javascript:alert(1)">go</a><svg onload="alert(1)"></svg>`
  const out = cleanStoredHtml(attack)
  check("an onerror, a script, a javascript: link and an svg onload are gone", !/onerror|<script|javascript:|onload|<svg/i.test(out), out)
  check("  and the writing is kept", out.includes("<p>Hi</p>") && out.includes("go"), out)
  const ok = cleanStoredHtml(`<h2>Story</h2><p><strong>Made</strong> by hand, <a href="https://example.com">here</a>.</p><ul><li>one</li></ul>`)
  check("a story the editor writes comes through unchanged in substance", /<h2>Story<\/h2>/.test(ok) && /<strong>Made<\/strong>/.test(ok) && /href="https:\/\/example\.com"/.test(ok) && /<li>one<\/li>/.test(ok), ok)

  const sink = readCode("components/store-builder/unified-section-renderer.tsx")
  check("the renderer cleans aboutContent at the sink", /__html: cleanStoredHtml\(settings\.aboutContent \|\| ""\)/.test(sink))
  check("  and no raw aboutContent reaches dangerouslySetInnerHTML", !/__html: settings\.aboutContent/.test(sink))

  const { sanitizeRichText } = await import("@/lib/website-builder/sanitize")
  check("the server side cleaner drops the same attack", !/onerror|<script|javascript:/i.test(sanitizeRichText(attack)))
  const save = readCode("app/api/store-builder/route.ts")
  check("the page builder's save cleans an about section's story before storing it", /section\?\.type === "about"/.test(save) && /aboutContent = sanitizeRichText\(story\)/.test(save))
}

/* ── R48-2 ───────────────────────────────────────────────────────────────── */

async function redirectsStayOurs() {
  console.log("\nR48-2. A redirect after sign up or sign in goes to Storelib only")
  const { safeReturnTarget } = await import("@/lib/auth/return-to")
  const rules = { mainDomain: "storelib.com" }
  for (const bad of ["https://evil.example/login", "//evil.example", "/\\evil.example", "javascript:alert(1)", "https://jane.storelib.com/fake-login", "https://storelib.com.evil.example/"]) {
    check(`refused: ${bad}`, safeReturnTarget(bad, rules) === null, safeReturnTarget(bad, rules))
  }
  check("kept: the receipt path the receipt page sends", safeReturnTarget("/receipt/abc123", rules) === "/receipt/abc123")
  check("kept: a page on storelib.com", safeReturnTarget("https://storelib.com/app", rules) !== null)

  const verify = readCode("app/(auth)/verify-email/verify-email-content.tsx")
  check("/verify-email checks ?redirect before following it", /const redirectUrl = safeReturnTarget\(searchParams\.get\("redirect"\)/.test(verify))
  const signup = readCode("app/(auth)/signup/page.tsx")
  check("/signup checks ?redirect before storing it for after Google", /const redirectUrl = safeReturnTarget\(searchParams\.get\("redirect"\)/.test(signup))
  const complete = readCode("app/auth/complete/page.tsx")
  check("/auth/complete checks the stored redirect (a subdomain can write that cookie)", /const storedUrl = safeReturnTarget\(redirectData\.url/.test(complete) && !/let finalUrl = redirectData\.url/.test(complete))
  check("  and ?fallback", /const fallback = safeReturnTarget\(searchParams\.get\("fallback"\)/.test(complete))
}

/* ── R48-3 ───────────────────────────────────────────────────────────────── */

function resetRoutesAreLimited() {
  console.log("\nR48-3. The password reset code routes")
  const exchange = readCode("app/api/auth/exchange-reset-code/route.ts")
  check("exchange-reset-code is rate limited by address", /bucket: "reset-code", subjects: \[addressSubject\(request\)\]/.test(exchange))
  check("  claims the code only if it is still unused, and refuses the second request", /\.update\(\{ used: true \}\)\s*\.eq\("id", resetRequest\.id\)\s*\.eq\("used", false\)\s*\.select\("id"\)/.test(exchange) && /claimed\.length === 0/.test(exchange))
  check("  before it makes a recovery session", exchange.indexOf('.eq("used", false)') < exchange.indexOf("generateLink"))
  check("  and refuses a code that is not a short string", /typeof code !== "string" \|\| code\.length > 200/.test(exchange))
  const complete = readCode("app/api/auth/complete-reset-password/route.ts")
  check("complete-reset-password: limited, typed, and the token claimed before the password changes", /bucket: "reset-complete"/.test(complete) && /typeof token !== "string" \|\| typeof newPassword !== "string"/.test(complete) && complete.indexOf('.eq("used", false)') < complete.indexOf("updateUserById"))
  const validate = readCode("app/api/auth/validate-reset-token/route.ts")
  check("validate-reset-token: limited and typed", /bucket: "reset-validate"/.test(validate) && /typeof token !== "string"/.test(validate))
}

function proxySourceOf(): string {
  const src = readCode("proxy.ts")
  return src.slice(src.indexOf("export async function proxy("), src.indexOf("async function routeRequest("))
}

/* ── R48-4 ───────────────────────────────────────────────────────────────── */

async function cspEnforcedOnOwnPages() {
  console.log("\nR48-4. The content security policy, enforced on Storelib's own pages")
  const csp = await import("@/lib/security/csp")
  const { CONTENT_SECURITY_POLICY, ENFORCED_CONTENT_SECURITY_POLICY, enforcesCsp, withEnforcedCsp } = csp
  check("the enforced policy is the report only one with its own report address", ENFORCED_CONTENT_SECURITY_POLICY === CONTENT_SECURITY_POLICY.replace(/report-uri \/api\/csp-report$/, "report-uri /api/csp-report?enforced=1"))
  check("  still no <object>, no <base> elsewhere, forms post here, framed by nobody else", /object-src 'none'/.test(ENFORCED_CONTENT_SECURITY_POLICY) && /base-uri 'self'/.test(ENFORCED_CONTENT_SECURITY_POLICY) && /form-action 'self'/.test(ENFORCED_CONTENT_SECURITY_POLICY) && /frame-ancestors 'self'/.test(ENFORCED_CONTENT_SECURITY_POLICY))
  check("Font Awesome from cdnjs, which every non extension report on Nov 1 was, is allowed as style and font", /style-src [^;]*https:\/\/cdnjs\.cloudflare\.com/.test(CONTENT_SECURITY_POLICY) && /font-src [^;]*https:\/\/cdnjs\.cloudflare\.com/.test(CONTENT_SECURITY_POLICY))
  check("X's widgets.js, which the description renderer loads, is allowed as script", /script-src [^;]*https:\/\/platform\.twitter\.com/.test(CONTENT_SECURITY_POLICY) && /platform\.twitter\.com\/widgets\.js/.test(readCode("components/store-builder/description-rich-editor.tsx")))
  check("vercel.json carries the same report only policy", read("vercel.json").includes(CONTENT_SECURITY_POLICY))

  const yes: [string, string][] = [["storelib.com", "/app"], ["storelib.com", "/app/products"], ["www.storelib.com", "/admin/blog"], ["storelib.com", "/login"], ["storelib.com", "/signup/verify"], ["storelib.com", "/reset-password"], ["storelib.com", "/verify-email"], ["storelib.com", "/auth/complete"], ["storelib.com:443", "/app"]]
  const no: [string, string][] = [["jane.storelib.com", "/app"], ["shop.example.com", "/login"], ["storelib.me", "/app"], ["storelib.com", "/website-builder/editor/x"], ["storelib.com", "/checkout"], ["storelib.com", "/p/thing"], ["storelib.com", "/"], ["storelib.com", "/jane"], ["storelib.com", "/application"], ["storelib.com.evil.example", "/app"]]
  for (const [h, p] of yes) check(`enforced on ${h}${p}`, enforcesCsp(h, p))
  for (const [h, p] of no) check(`report only on ${h}${p}`, !enforcesCsp(h, p))
  check("joined to a policy already set, as a second policy", withEnforcedCsp("frame-src 'self'") === `frame-src 'self', ${ENFORCED_CONTENT_SECURITY_POLICY}` && withEnforcedCsp(null) === ENFORCED_CONTENT_SECURITY_POLICY)

  /* Through the real proxy. */
  const { proxy } = await import("@/proxy")
  const { NextRequest } = await import("next/server")
  const ask = async (url: string, headers: Record<string, string> = {}) => {
    const res = (await proxy(new NextRequest(url, { headers: { host: new URL(url).host, accept: "text/html", ...headers } }) as never)) as Response
    return { status: res.status, csp: res.headers.get("content-security-policy") }
  }
  const app = await ask("https://storelib.com/app")
  check("the proxy: /app signed out (its 307) carries the enforced policy", app.csp === ENFORCED_CONTENT_SECURITY_POLICY, app)
  const login = await ask("https://storelib.com/login")
  check("the proxy: /login carries it", login.csp === ENFORCED_CONTENT_SECURITY_POLICY, login)
  /*
    The WebView's Stripe frame list (proxy.ts, Capacitor) is set at the end of
    the routing, which this harness does not reach without a database; the
    join is checked on the function, and here that it runs on the routing's
    answer, whatever set it. The local production build measured it for real
    (docs/reliability/SECURITY.md section 7).
  */
  const native = await ask("https://storelib.com/login", { "user-agent": "Mozilla/5.0 Capacitor" })
  check("the proxy: in the app's WebView the enforced policy is there too", !!native.csp && native.csp.endsWith(ENFORCED_CONTENT_SECURITY_POLICY), native)
  const wrapper = proxySourceOf()
  check("  joined in proxy() after routeRequest, to whatever policy the routing set", /const res = forgetStaleCountry\(request, await routeRequest\(request\)\)[\s\S]*enforcesCsp\(request\.headers\.get\("host"\), request\.nextUrl\.pathname, MAIN_DOMAIN\)[\s\S]*withEnforcedCsp\(res\.headers\.get\("Content-Security-Policy"\)\)/.test(wrapper))
  const home = await ask("https://storelib.com/pricing")
  check("the proxy: a marketing page enforces nothing", home.csp === null, home)

  console.log("\nThe report route says which kind it was")
  const route = await import("@/app/api/csp-report/route")
  const lines: string[] = []
  const warn = console.warn
  console.warn = (...a: unknown[]) => { lines.push(a.map(String).join(" ")) }
  try {
    const body = JSON.stringify({ "csp-report": { "blocked-uri": "https://evil.example/x.js?token=1", "effective-directive": "script-src-elem", "document-uri": "https://storelib.com/app?code=secret" } })
    await route.POST(new Request("https://storelib.com/api/csp-report?enforced=1", { method: "POST", body }))
    await route.POST(new Request("https://storelib.com/api/csp-report", { method: "POST", body }))
  } finally {
    console.warn = warn
  }
  check("an enforced report is logged as blocked", lines[0] === "[csp] blocked https://evil.example/x.js (script-src-elem) on https://storelib.com/app", lines)
  check("  a report only one as would have blocked, and neither keeps a query", lines[1] === "[csp] would have blocked https://evil.example/x.js (script-src-elem) on https://storelib.com/app", lines)
  const proxySource = readCode("proxy.ts")
  check("the proxy keeps every enforced report (no 1 in 20 sample)", /!request\.nextUrl\.searchParams\.has\("enforced"\) && !keepsCspReport/.test(proxySource))
}

/* ── R48-5 ───────────────────────────────────────────────────────────────── */

type Rule = { source: string; has?: { type: string; value: string }[]; missing?: { type: string; value: string }[]; headers: { key: string; value: string }[] }

function headersEverywhere() {
  console.log("\nR48-5. Transport security and permissions on every host")
  const rules = (JSON.parse(read("vercel.json")) as { headers: Rule[] }).headers
  const hostRe = (v: string) => new RegExp(`^(?:${v})$`)
  const appRule = rules.find((r) => r.has?.some((h) => h.type === "host") && r.headers.some((h) => h.key === "Strict-Transport-Security"))
  const hsts = appRule?.headers.find((h) => h.key === "Strict-Transport-Security")?.value ?? ""
  check("storelib.com sends HSTS for two years with includeSubDomains", /max-age=63072000/.test(hsts) && /includeSubDomains/.test(hsts), hsts)
  check("  only on storelib.com and www (a custom domain keeps Vercel's own, without subdomains)", !!appRule && hostRe(appRule.has![0].value).test("storelib.com") && hostRe(appRule.has![0].value).test("www.storelib.com") && !hostRe(appRule.has![0].value).test("shop.example.com"))
  const other = rules.find((r) => r.missing?.some((h) => h.type === "host"))
  const pp = other?.headers.find((h) => h.key === "Permissions-Policy")?.value ?? ""
  check("every other host gets a Permissions-Policy", !!other && other.source === "/(.*)" && pp.length > 0, other)
  check("  that turns off only what no site, theme or embed here uses", pp === "usb=(), serial=(), hid=(), bluetooth=(), display-capture=()", pp)
  check("  and never applies on storelib.com, so the two rules do not both send it", hostRe(other!.missing![0].value).test("storelib.com") && hostRe(other!.missing![0].value).test("www.storelib.com"))
  const base = rules.find((r) => !r.has && !r.missing)
  const keys = base?.headers.map((h) => h.key) ?? []
  check("every host keeps nosniff, a referrer policy and X-Frame-Options", keys.includes("X-Content-Type-Options") && keys.includes("Referrer-Policy") && keys.includes("X-Frame-Options"))
}

/* ── R48-6 ───────────────────────────────────────────────────────────────── */

async function svgNeverPublic() {
  console.log("\nR48-6. An SVG in a theme package is not stored as a public picture")
  const { inspectHead } = await import("@/lib/security/uploads/inspect")
  const svg = new TextEncoder().encode(`<svg xmlns="http://www.w3.org/2000/svg"><script>alert(document.domain)</script></svg>`)
  const asImage = inspectHead({ fileName: "logo.svg", size: svg.byteLength, head: svg, context: "public_image" })
  check("refused as a public image", !asImage.ok, asImage)
  const asFile = inspectHead({ fileName: "logo.svg", size: svg.byteLength, head: svg, context: "link_page_file" })
  check("refused as a page file", !asFile.ok, asFile)
  const html = new TextEncoder().encode(`<!doctype html><script>alert(1)</script>`)
  check("an HTML page named .png is refused as a public image", !inspectHead({ fileName: "a.png", size: html.byteLength, head: html, context: "public_image" }).ok)
  const { safeStoredContentType } = await import("@/lib/storage/file-signature")
  check("and anything rendered is stored as a download", safeStoredContentType("image/svg+xml", svg) === "application/octet-stream" && safeStoredContentType("text/html", null) === "application/octet-stream")
}

async function run() {
  await aboutStoryIsCleaned()
  await redirectsStayOurs()
  resetRoutesAreLimited()
  await cspEnforcedOnOwnPages()
  headersEverywhere()
  await svgNeverPublic()
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
  process.exit(0)
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
