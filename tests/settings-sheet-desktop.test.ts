/**
 * The Settings sheet on a computer (round of the owner's seven notes):
 * the rail keeps the page under the sheet lit, a section pressed while
 * scrolled glides to the top, the open and close are cheap, the Domains
 * blur is explained in view, every integration has its mark, and the
 * sections' column has depth. Measured in a browser by
 * scripts/check-settings-sheet-desktop.mjs and scripts/check-integration-marks.mjs.
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { forgetCommitted, markCommitted, pageUnderSettingsSheet } from "../lib/ui/app-navigation"
import { INTEGRATIONS } from "../lib/integrations/catalog"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail !== undefined ? `\n        ${JSON.stringify(detail)}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

console.log("\nThe rail keeps the page under the sheet lit\n")
{
  forgetCommitted()
  markCommitted("/app/orders", "")
  check("on the press, before Settings commits: the page still showing", pageUnderSettingsSheet("/app/settings") === "/app/orders")
  markCommitted("/app/settings", "?tab=taxes")
  check("while it is up: the page it was opened over", pageUnderSettingsSheet("/app/settings") === "/app/orders")
  markCommitted("/app/settings", "?tab=domains")
  check("a change of section inside it keeps the same page", pageUnderSettingsSheet("/app/settings") === "/app/orders")
  check("any other address is itself", pageUnderSettingsSheet("/app/orders") === null && pageUnderSettingsSheet("/app/settings/billing/upgrade") === null)
  markCommitted("/app/orders", "")
  check("closed back onto the page: nothing is under anything", pageUnderSettingsSheet("/app/orders") === null)
  forgetCommitted()
  markCommitted("/app/settings", "")
  check("Settings opened on its own (a reload) is under nothing, so its own row lights", pageUnderSettingsSheet("/app/settings") === null)
  forgetCommitted()
  markCommitted("/app", "")
  forgetCommitted()
  check("after leaving the shell, a stale page is not taken as under it", pageUnderSettingsSheet("/app/settings") === null)
  const nav = read("lib/ui/app-navigation.ts")
  check("the rows read it, only where Settings is a sheet (1024px up)", /return \(settingsIsSheet\(\) && pageUnderSettingsSheet\(shown\)\) \|\| shown/.test(nav) && /min-width: 1024px/.test(nav))
  check("the stage forgets on leaving the shell", /useEffect\(\(\) => \(\) => forgetCommitted\(\), \[\]\)|useEffect\(\(\) => \(\) => \{\s*\n\s*forgetCommitted\(\)/.test(read("components/app/app-stage.tsx")))
}

/*
  Changed on purpose (round R1). The glide to the top, with the new section
  held back until the glide neared the top, was the "little bit of a bump"
  the owner kept feeling: the old section rode up the screen and was replaced
  mid motion, 400 to 470ms after the press (scripts/check-settings-sheet-
  desktop.mjs measured it). The section now swaps on the press and is placed
  at its top before it is painted. The glide stays for Integrations' Back.
*/
console.log("\nA section pressed while scrolled opens at its top, at once\n")
{
  const form = read("components/app/settings-form-new.tsx")
  const glide = read("lib/ui/glide-scroll.ts")
  check("no glide and no wait for one in Settings' sections", !/glideScrollTop|startGlide|nearTop|GLIDE_SHOW_WITHIN/.test(form))
  /* Changed on purpose (round 20, the owner: "it should auto scroll up smoothly, clean"): placed just above its top in that frame, then the browser's smooth scroll (tests/settings20.test.ts). */
  check("the scroll is placed for the section in the layout effect, before it is painted", /useLayoutEffect\(\(\) => \{\n    if \(!scrollPending\.current\) return/.test(form) && /scroller\.scrollTop = start/.test(form))
  check("a section whose data is kept swaps on the press, in a transition so the pill's frame is not held", /if \(urls\.every\(\(u\) => peekGet\(u\) !== null\)\) show\(\)/.test(form) && /startTransition\(\(\) => setPanelTab\(activeTab\)\)/.test(form))
  /* Changed on purpose (round 23): Integrations' Back no longer glides, it lands where the list was left (tests/integrations23.test.ts). */
  check("the browser's own smooth scroll, on the compositor", /el\.scrollTo\(\{ top: to, behavior: "smooth" \}\)/.test(glide))
}

console.log("\nOpen and close\n")
{
  const sheet = read("components/app/settings-sheet.tsx")
  check("closed from rest it leaves at speed in 260ms; a drag keeps the finger's curve", /const OUT_EASE = "cubic-bezier\(0\.4, 0, 0\.7, 0\.2\)"/.test(sheet) && /const CLOSE_MS = 260/.test(sheet) && /const ease = from > 0 \|\| speed > 0 \? EASE : OUT_EASE/.test(sheet))
  check("only a document that can scroll is held (no relayout of the page under it)", /if \(html\.scrollHeight <= html\.clientHeight\) return \(\) => html\.removeAttribute\("data-settings-sheet-up"\)/.test(sheet))
  check("Settings fetches its sections ahead once the sheet has risen, not during the rise", /closest\("\[data-settings-sheet\]"\) as HTMLElement \| null\)\?\.getAnimations\?\.\(\)/.test(read("components/app/settings-form-new.tsx")))
}

console.log("\nDomains on the free plan\n")
{
  const panel = read("components/app/settings/domains-panel.tsx")
  check("the blur is set, never eased (no filter transition)", !/transition-\[filter/.test(panel))
  check("the Pro bar stays in view from 1024px while the blurred cards scroll", /data-domains-upgrade=""/.test(panel) && /lg:sticky lg:top-3/.test(panel))
  check("a failed plan read keeps the server's plan", /setUserPlan\(\(plan\) => plan \?\? "free"\)/.test(read("components/app/settings-form-new.tsx")))
}

console.log("\nEvery integration has its mark\n")
{
  const mark = read("components/app/settings/integration-mark.tsx")
  /* Storelib's own drawings, by the ids they are keyed on. */
  const art = new Set([...mark.slice(mark.indexOf("const BUILT_IN_ART"), mark.indexOf("export const hasBuiltInArt")).matchAll(/^  "?([a-z-]+)"?: \(/gm)].map((m) => m[1]))
  check("Storelib's four built in ones are drawn", ["manual", "supplier-email", "custom-webhook", "csv"].every((id) => art.has(id)), [...art])
  const missing = INTEGRATIONS.filter((i) => !art.has(i.id) && !i.logo).map((i) => i.id)
  check("every catalog entry has a logo or Storelib's drawing", missing.length === 0, missing)
  const files = INTEGRATIONS.filter((i) => i.logo?.startsWith("/")).filter((i) => !existsSync(join(process.cwd(), "public", i.logo!))).map((i) => i.logo)
  check("and every logo file is there", files.length === 0, files)
  check("a logo that fails to load falls back to the initial", /onError=\{\(\) => setFailed\(logo\)\}/.test(mark) && /if \(item\.logo && failed !== item\.logo\)/.test(mark) && /\{markInitial\(item\.name\)\}/.test(mark))
  check("the provider cards and /admin draw the same mark", /<Mark item=\{\{ id, name: provider\.name, logo: provider\.logo \?\? integrationById\(id\)\?\.logo \?\? null \}\}/.test(read("components/physical/integrations-marketplace.tsx")) && /<Mark item=\{\{ id: r\.id, name: r\.name, logo: r\.logo \}\} size=\{28\} \/>/.test(read("app/admin/integrations/integrations-admin.tsx")))
}

console.log("\nThe sections' column\n")
{
  const form = read("components/app/settings-form-new.tsx")
  check("the open row sits a hair above the column, as the rail's does", /bg-\[#e9e9eb\] font-medium text-\[#1a1a2e\] shadow-\[0_1px_2px_rgba\(16,18,27,0\.08\),inset_0_0_0_1px_rgba\(16,18,27,0\.05\),inset_0_1px_0_rgba\(255,255,255,0\.7\)\]/.test(form))
  check("a press gives under the pointer and the states ease in place", /transition-\[background-color,box-shadow,color,scale\] duration-150 ease-out active:scale-\[0\.98\]/.test(form))
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
