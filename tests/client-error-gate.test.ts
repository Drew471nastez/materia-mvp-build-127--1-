/**
 * ===========================================================================
 *  THE GATE THAT WATCHES THE BROWSER HAS TO BE ABLE TO SEE
 * ===========================================================================
 * scripts/check-client-errors drives a real Chromium at real pages and fails
 * on anything a visitor's browser would have thrown. It is the only thing
 * standing between "it compiles" and "every page is a blank screen", because
 * a client-side crash leaves the server healthy, the deploy READY and every
 * curl returning 200.
 *
 * IT WAS RUNNING, AND IT PASSED WHILE THE WHOLE SITE WAS DOWN. Three reasons,
 * and this file exists so none of them can come back quietly:
 *
 *   1. It was grading Chromium's own certificate warning. Outbound HTTPS in
 *      the dev container goes through a TLS-terminating proxy the browser was
 *      never told about, so every navigation ended on "Privacy error" — a
 *      page with no errors on it.
 *
 *   2. "Nothing threw" was the entire pass condition, so a page that never
 *      loaded passed. Requiring a real HTTP status on the main document is
 *      the difference between "nothing was wrong" and "nothing was looked at".
 *
 *   3. It looked for Next's default crash sentence. Storelib has its own
 *      error boundary, and an error a boundary CATCHES never reaches
 *      Runtime.exceptionThrown — React handles it — so the boundary's own
 *      words were the only evidence and nothing was looking for them.
 *
 * And a fourth found while fixing those: it hard-coded a debugging port, so a
 * Chromium orphaned by an earlier run answered instead and the run drove a
 * browser it had not configured. Four orphans were alive at once.
 *
 * Proven end to end rather than argued: with the const-shadowing bug put back
 * and the site served locally, the gate reported
 *
 *     ✗  http://127.0.0.1:3120/  (200)
 *        the page rendered Storelib's error boundary
 *
 * and reported nothing once the bug was taken out again.
 *
 * Run with:  npm run test:push
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { stripComments } from "./_source"

let passed = 0
let failed = 0
const failures: string[] = []

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`)
  }
}

const root = process.cwd()
const gate = stripComments(readFileSync(join(root, "scripts/check-client-errors.mjs"), "utf8"))

console.log("\nThe client-error gate can see\n")

/* 1. A page that never loaded is a failure. */
check(
  "a main document with no HTTP status fails the run",
  /found\.status === null/.test(gate) && /never returned an HTTP status/.test(gate),
  "without this, a certificate warning or a DNS failure passes as a healthy page",
)
check("and so does a 4xx or 5xx", /found\.status >= 400/.test(gate))

/* 2. It knows what this app's crash actually looks like. */
check(
  "it reads the error boundary's wording out of lib/client-errors",
  /describeForUser/.test(gate) && /client-errors\.ts/.test(gate),
  "a copied string drifts from the component and the gate goes blind without saying so",
)
check(
  "and stops if it cannot find it",
  /this gate is blind without it[\s\S]{0,120}process\.exit\(1\)/.test(gate),
  "a matcher that silently matches nothing is how the crash shipped",
)
/** The string itself still has to be there to read. */
{
  const clientErrors = readFileSync(join(root, "lib/client-errors.ts"), "utf8")
  const fn = clientErrors.slice(clientErrors.indexOf("export function describeForUser"))
  const generic = fn.slice(0, fn.indexOf("\n}")).lastIndexOf("return {")
  const title = generic < 0 ? undefined : fn.slice(generic).match(/title:\s*"([^"]+)"/)?.[1]
  check("the boundary's generic title is readable", !!title, `read ${JSON.stringify(title)}`)
}

/* 3. It can reach the site it is grading. */
check(
  "it uses the environment's proxy when there is one",
  /--proxy-server=/.test(gate) && /HTTPS_PROXY/.test(gate),
  "Chromium reads neither the proxy setting nor the CA bundle the rest of the tooling uses",
)
check(
  "and pins that proxy's CA rather than turning verification off",
  /--ignore-certificate-errors-spki-list=/.test(gate) &&
    !/--ignore-certificate-errors[^-]/.test(gate) &&
    !/ignoreHTTPSErrors/.test(gate),
  "the flag without a list would accept any certificate at all",
)

/* 4. It drives the browser it started. */
check(
  "it lets Chromium choose its own debugging port",
  /--remote-debugging-port=0/.test(gate) && /DevToolsActivePort/.test(gate),
  "a fixed port is answered by whatever Chromium an earlier run left behind",
)
check(
  "in a profile of its own",
  /--user-data-dir=/.test(gate),
  "the port file is read out of that directory, which is what makes it our browser",
)
check(
  "and reaps it even when the parent is killed",
  /process\.on\(sig, reap\)/.test(gate),
  "a timeout does not reap the child, which is how the orphans accumulated",
)

/* 5. It reports faults and not weather. */
check(
  "a failure has to reproduce before it is reported",
  /await visit\([\s\S]{0,400}const again = await visit\(/.test(gate),
  "a transient chunk 502 between the runner and the host is not a bug in the page",
)
check(
  "and only the machine's own limits are filtered outright",
  /function isProbeNoise/.test(gate) && /WebGL/.test(gate),
  "headless Chromium has no GPU; nothing else may be ignored without reproducing",
)
check(
  "a chunk that fails to load is not filtered",
  !/isProbeNoise[\s\S]{0,200}(502|MIME|chunk)/.test(gate),
  "in production a chunk that will not load is a broken page",
)

/* 6. It looks at the pages that actually broke. */
{
  const paths = gate.slice(gate.indexOf("const DEFAULT_PATHS"), gate.indexOf("const PATHS"))
  check("it visits the creator page", /\$\{HANDLE\}`/.test(paths))
  check("the OnePage", /\$\{HANDLE\}\/links`/.test(paths))
  check("a product page", /\$\{HANDLE\}\/\$\{PRODUCT\}`/.test(paths))
  check("and the creator page editor", /"\/creator-page"/.test(paths))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log("\nFailures:")
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
