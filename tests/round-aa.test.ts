/**
 * Round AA: the Website page's cover is never stuck on "Preparing preview",
 * publishing never hangs, the editor behaves like the live site, a GitHub
 * push reaches an open editor, and a store's team.
 *
 *   npx tsx tests/round-aa.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { POLL_MAX_MS, nextPollDelay } from "@/lib/agent-access/connection-mark"
import { resolveEditorHref } from "@/lib/website-builder/editor-navigation"
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
  /* Changed on purpose (round 34): Publish writes its draft through the draft's queue (after any autosave on its way), whose one write sends the three at once. */
  const send = editor.slice(editor.indexOf("const sendDraft = async"), editor.indexOf("const sendDraftLatest"))
  check("the three saves before a publish go at the same time", /await draftQueue\.save\(snap\)/.test(publish) && /await Promise\.all\(\[\s*settingsSame \? [\s\S]{0,120}? : putJsonWithRetry\([^)]*settings`/.test(send) && /syncHeaderFooterToAllPages\("draft", snap\.sections, snap\.page\),\s*\]\)/.test(send))
  check("the publish itself has an end, and says so when it is reached", /fetchWithin\(`\/api\/website-builder\/themes\/\$\{installId\}\/publish`[\s\S]*?PUBLISH_MS\)/.test(publish) && /e instanceof LoadTimeout/.test(publish) && /const PUBLISH_MS = 45_000/.test(editor))
  check("  and a refusal that is not JSON is still a message, not a spinner", /await res\.json\(\)\.catch\(\(\) => \(\{\}\)\)/.test(publish))
  check("the header and footer copy to every page has an end", /fetchWithin\(`\/api\/website-builder\/themes\/\$\{installId\}\/sections\/sync-global`[\s\S]{0,600}?20_000\)\)?\.catch\(\(\) => null\)/.test(editor)) /* Changed on purpose (round 12, WBPERF): inside fetchSignedIn, a 401 asked about first. */
  check("every save try has an end, retried like a dropped connection", /fetchWithin\(url, \{ method: "PUT"[^)]*\}, ATTEMPT_MS\)/.test(read("lib/website-builder/save-request.ts")))
  const route = read("app/api/website-builder/themes/[installId]/publish/route.ts")
  const later = route.slice(route.indexOf("after(async () => {"))
  check("the history row, the backup and the files' versions come after the answer", /takeBackup\(admin, installId/.test(later) && /theme_publish_history/.test(later) && /recordVersion\(admin, installId, file\.path/.test(later) && route.indexOf("after(async () => {") < route.indexOf("await revalidatePublishedSite(creator.id)\n\n"))
}

console.log("\nThe editor follows the site's links as the live site does")
{
  const ctx = { currentPage: "about", inspectorEnabled: true, fromNav: true, shopPath: "/products", customPageKeys: [] as string[] }
  check("a menu link to the page that is open is that page, with the inspector on", JSON.stringify(resolveEditorHref("/about", ctx)) === '{"kind":"page","key":"about"}')
  check("  and without fromNav a tap with the inspector on selects instead", resolveEditorHref("/about", { ...ctx, fromNav: false }).kind === "ignore")
  const editor = read("app/website-builder/editor/[installId]/page.tsx")
  check("the page that is open goes to its top, smoothly, instead of nothing", /if \(decision\.key === currentPageRef\.current && !decision\.anchor\) \{\s*document\.getElementById\("wb-preview-root"\)\?\.scrollTo\(\{ top: 0, behavior: "smooth" \}\)/.test(editor))
  const section = read("components/website-builder/sections/StorelibSection.tsx")
  check("a .storelib section says when its link is the site's navigation", section.includes(`const fromNav = chrome || !!a.closest("nav, [role='navigation']")`) && section.includes(`section.group === "header" || section.group === "footer"`) && section.includes(`onEditorNavigate(a.getAttribute("href") ?? "#", fromNav)`))
}

console.log("\nA push to GitHub reaches an open editor")
{
  // Changed on purpose (the owner: lower Vercel costs): ten seconds while someone is at the editor; left alone two minutes, every thirty (tests/polling-costs.test.ts). Coming back reads at once.
  check("an idle editor asks at least every ten seconds", nextPollDelay(POLL_MAX_MS, false) === 10_000)
  const hook = read("components/website-builder/site-connections.tsx")
  check("and while the tab is visible it asks once a second, so a push does not wait on that", /document\.visibilityState === "visible" \? \(arrived && eventsFull \? 200 : POLL_ACTIVE_MS\)/.test(hook))
  check("  and at once when the pointer comes back over it, at most every few seconds", /addEventListener\("pointerenter", wake\)/.test(hook) && /removeEventListener\("pointerenter", wake\)/.test(hook) && /if \(!back && Date\.now\(\) - woke < WAKE_GAP_MS && \(timer !== null \|\| busy\)\) return/.test(hook))
  const editor = read("app/website-builder/editor/[installId]/page.tsx")
  check("what arrives is a draft, so Publish says the site has changes", /const handleAgentEvents = async[\s\S]{0,900}?if \(events\.length > 0\) setUnpublished\(true\)/.test(editor))
  check("an imported theme reads its files again, keeping the page drawn meanwhile", /setCompatFilesVersion\(\(n\) => n \+ 1\)/.test(editor) && /filesVersion=\{compatFilesVersion\}/.test(editor) && /compatFilesChanged\(installId\)/.test(editor) && /loadCompatFiles\(installId\)\.then\([\s\S]{0,200}?\}, \[installId, attempt, filesVersion\]\)/.test(read("components/website-builder/compat/compat-canvas.tsx")))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
