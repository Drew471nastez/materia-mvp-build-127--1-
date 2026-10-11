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

console.log("\nPublishing ends, and sooner")
{
  const editor = read("app/website-builder/editor/[installId]/page.tsx")
  const publish = editor.slice(editor.indexOf("const publishChanges = async"), editor.indexOf("const handleSave = async"))
  check("the three saves before a publish go at the same time", /await Promise\.all\(\[\s*putJsonWithRetry\([^)]*settings`/.test(publish) && /syncHeaderFooterToAllPages\("draft"\),\s*\]\)/.test(publish))
  check("the publish itself has an end, and says so when it is reached", /fetchWithin\(`\/api\/website-builder\/themes\/\$\{installId\}\/publish`[\s\S]*?PUBLISH_MS\)/.test(publish) && /e instanceof LoadTimeout/.test(publish) && /const PUBLISH_MS = 45_000/.test(editor))
  check("  and a refusal that is not JSON is still a message, not a spinner", /await res\.json\(\)\.catch\(\(\) => \(\{\}\)\)/.test(publish))
  check("the header and footer copy to every page has an end", /fetchWithin\(`\/api\/website-builder\/themes\/\$\{installId\}\/sections\/sync-global`[\s\S]{0,600}?20_000\)\.catch\(\(\) => null\)/.test(editor))
  check("every save try has an end, retried like a dropped connection", /fetchWithin\(url, \{ method: "PUT"[^)]*\}, ATTEMPT_MS\)/.test(read("lib/website-builder/save-request.ts")))
  const route = read("app/api/website-builder/themes/[installId]/publish/route.ts")
  const later = route.slice(route.indexOf("after(async () => {"))
  check("the history row, the backup and the files' versions come after the answer", /takeBackup\(admin, installId/.test(later) && /theme_publish_history/.test(later) && /recordVersion\(admin, installId, file\.path/.test(later) && route.indexOf("after(async () => {") < route.indexOf("await revalidatePublishedSite(creator.id)\n\n"))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
