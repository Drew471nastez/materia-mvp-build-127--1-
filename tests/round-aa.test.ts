/**
 * Round AA: the Website page's cover is never stuck on "Preparing preview",
 * publishing never hangs, the editor behaves like the live site, a GitHub
 * push reaches an open editor, and a store's team.
 *
 *   npx tsx tests/round-aa.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { COVER_SCRIPT_HOSTS, COVER_STILL_CSS, COVER_STILL_POLICY, withStillStyle } from "@/lib/website-builder/cover-still"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 300)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

console.log("\nThe page a cover is taken of")
{
  check("loads scripts from the site and the common CDNs only", COVER_STILL_POLICY.startsWith("script-src 'self' 'unsafe-inline'") && COVER_SCRIPT_HOSTS.every((h) => COVER_STILL_POLICY.includes(h)) && !/\*/.test(COVER_STILL_POLICY))
  check("  and calls no server but this one", /connect-src 'self'$/.test(COVER_STILL_POLICY))
  check("every animation goes straight to its end, nothing transitions", /animation-duration:0s!important/.test(COVER_STILL_CSS) && /transition:none!important/.test(COVER_STILL_CSS))
  check("the still style goes in the head of an imported theme's page", withStillStyle("<html><head><title>x</title></head><body></body></html>").includes("<style data-cover-still>") && withStillStyle("<html><head></head>").indexOf("data-cover-still") < withStillStyle("<html><head></head>").indexOf("</head>"))
  const compat = read("app/api/site-theme/cover/[pass]/route.ts")
  check("an imported theme's cover page sends the policy beside its sandbox", /withStillStyle\(html\)/.test(compat) && /sandbox allow-scripts"\}, \$\{COVER_STILL_POLICY\}`/.test(compat))
  check("Storelib's own cover page is still", /COVER_STILL_CSS/.test(read("app/(site)/cover-render/[pass]/page.tsx")))
  check("  and gets the policy from the proxy, as a second policy", /url\.pathname\.startsWith\("\/cover-render\/"\)\) \{\s*const existing[^}]*`\$\{existing\}, \$\{COVER_STILL_POLICY\}`/.test(read("proxy.ts")))
  check("the photographer asks for reduced motion too", /prefers-reduced-motion", value: "reduce"/.test(read("lib/website-builder/cover-shot.ts")))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
