/**
 * ===========================================================================
 *  THE PHONE MENU OPENS ON TOP OF THE LAYER THE PILL SITS WITH
 * ===========================================================================
 * "While Settings is open, tapping the menu button in the bottom bar does
 * not show the menu." The button turned into an X and the screen kept
 * showing Settings: the menu was at z 45, Settings as a page at 49. The
 * product editor's layer (52) had the same fault.
 *
 * scripts/check-app-menu19.mjs taps it in Chromium over each layer and asks
 * the screen what is on top. This holds the numbers that make that true,
 * read from the files that set them, so a later change to any one of them
 * is caught here without a browser.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail ? ` (${detail})` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "")

const nav = strip(read("components/app/sidebar-mobile-nav.tsx"))
const shell = strip(read("components/app/sidebar.tsx"))
const sheet = strip(read("components/app/settings-sheet.tsx"))
const layer = strip(read("components/app/page-layer.tsx"))
const css = read("app/globals.css")

const z = (src: string, re: RegExp) => {
  const m = src.match(re)
  return m ? Number(m[1]) : NaN
}

/* The menu's own box: the element carrying id="app-mobile-menu". */
const menuTag = nav.slice(nav.indexOf('id="app-mobile-menu"'), nav.indexOf("<nav", nav.indexOf('id="app-mobile-menu"')))
const menuZ = z(menuTag, /className="[^"]*\bz-\[(\d+)\]/)
const pillZ = z(nav, /data-app-nav-pill=""\s*className="[^"]*\bz-\[(\d+)\]/)
const headerZ = z(shell, /className="fixed top-0 left-0 right-0 z-(\d+) md:hidden bg-\[#111111\]"/)
const settingsZ = z(sheet, /max-lg:z-\[(\d+)\]/)
const layerZ = z(layer, /max-md:fixed max-md:inset-0 max-md:z-\[(\d+)\]/)

console.log("\nOver Settings as a page")
check("the numbers are all found", [menuZ, pillZ, headerZ, settingsZ, layerZ].every(Number.isFinite), JSON.stringify({ menuZ, pillZ, headerZ, settingsZ, layerZ }))
check("the menu is above Settings on a phone", menuZ > settingsZ, `${menuZ} over ${settingsZ}`)
check("and never above the header, which keeps its rounded corners over the menu", menuZ <= headerZ, `${menuZ} against ${headerZ}`)
check("and under the pill, so the X that closes it stays on top", menuZ < pillZ, `${menuZ} under ${pillZ}`)
{
  /* Equal z: the later one paints on top, so the menu has to come first. */
  const menuAt = shell.indexOf("<MobileMenuPage")
  const headerAt = shell.indexOf('className="fixed top-0 left-0 right-0 z-50 md:hidden bg-[#111111]"')
  const pillAt = shell.indexOf("<MobileNavPill")
  check("sidebar.tsx renders the menu before the phone header", menuAt > 0 && headerAt > 0 && menuAt < headerAt, `${menuAt} / ${headerAt}`)
  check("and the pill after both", pillAt > headerAt)
}

console.log("\nOver a page layer that keeps the pill (the product editor)")
{
  const rule = css.match(/html\.has-phone-page-layer #app-mobile-menu \{([^}]*)\}/)
  const body = rule?.[1] ?? ""
  const lifted = z(body, /z-index:\s*(\d+)/)
  check("app/globals.css lifts the menu over a phone page layer", !!rule)
  check("above the layer and under the pill", lifted > layerZ && lifted < pillZ, `${layerZ} < ${lifted} < ${pillZ}`)
  check("from the top of the screen, since the layer hides the header", /\btop:\s*0;/.test(body) && /padding-top:\s*env\(safe-area-inset-top/.test(body))
  /* The rule sits in the phone's media block, next to the class it reads. */
  const at = css.indexOf("html.has-phone-page-layer #app-mobile-menu")
  const open = css.lastIndexOf("@media (max-width: 767px)", at)
  const between = css.slice(open, at)
  check("inside the phone's media block", open > 0 && between.split("{").length - between.split("}").length >= 1)
  check("the menu's top is a class, so that rule can move it (a style would win)", /\btop-\[calc\(68px\+env\(safe-area-inset-top,0px\)\)\]/.test(menuTag) && !/\btop:\s*"calc\(68px/.test(menuTag))
}

console.log("\nThe button says what is on the screen")
check("the X is the menu's own open state", /aria-expanded=\{menuOpen\}/.test(nav) && /<MenuGlyph open=\{menuOpen\} \/>/.test(nav))
check("and the menu shows that same state", /<MobileMenuPage\s+open=\{mobileMenuOpen\}/.test(shell) && /<MobileNavPill\s+menuOpen=\{mobileMenuOpen\}/.test(shell))
check("the motion is the menu's one transition, unchanged", /open \? "translateY\(0\)" : "translateY\(14px\)"/.test(nav) && /visibility: open \? "visible" : "hidden"/.test(nav))

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed) process.exit(1)
