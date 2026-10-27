/**
 * ===========================================================================
 *  ROUND 25: SECTION LINKS IN THE EDITOR AND ON THE SITE
 * ===========================================================================
 * Against Materia b6cabaa. Measured in Chromium by
 * scripts/check-materia-section-links.mjs (the canvas bridge with the
 * theme's own section-links.js, real mouse and touch) and
 * scripts/check-section-scroll-bridge.mjs (a section script asking the page
 * for another section). This runs the validators and reads the rest.
 *
 *   npm run test:push
 */
import { readCode } from "./_source"
import { acceptSectionKey, samePageSection } from "@/lib/storelib-theme/sandbox/protocol"

let passed = 0
let failed = 0
function check(label: string, ok: boolean) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    console.log(`  FAIL  ${label}`)
  }
}

console.log("\nA section, as a script names it (protocol.ts)")
check("a key, an anchor and a #anchor", acceptSectionKey("benefits_bar_b3YbxP") === "benefits_bar_b3YbxP" && acceptSectionKey("section-faq") === "section-faq" && acceptSectionKey("#faq") === "faq")
check("nothing that could leave a selector", [`x"]),body{display:none}/*`, "a b", "", "-x", "x".repeat(97), 7, null].every((k) => acceptSectionKey(k) === null))
check("a link to this page's section is that section", samePageSection("/#section-faq", "/") === "section-faq" && samePageSection("#faq", "/pages/about") === "faq" && samePageSection("/pages/about/#faq", "/pages/about") === "faq")
check("another page, or no hash, is a navigation", samePageSection("/pages/other#faq", "/pages/about") === null && samePageSection("/pages/about", "/pages/about") === null)

console.log("\nThe page's side (section-sandbox.tsx)")
const sandbox = readCode("components/website-builder/sections/section-sandbox.tsx")
check("only from a registered section of its own frame, with a checked key", /if \(!frameRef\.current \|\| event\.source !== frameRef\.current\.contentWindow\) return/.test(sandbox) && /const entry = live\.current\.get\(from\)\s*const key = acceptSectionKey\(raw\)/.test(sandbox))
check("scrolled with section-motion's scroll, once every 250ms at most", /scrollToHash\(root, `#\$\{hash\}`\)/.test(sandbox) && /if \(now - lastReveal\.current < 250\) return true/.test(sandbox))
check("navigate() to this page's section scrolls, in the editor too", /if \(same && reveal\(String\(msg\.id\), same\)\) return/.test(sandbox))
check("and a script can ask by name", /scrollToSection: function \(key\) \{ post\(\{ k: "reveal"/.test(readCode("lib/storelib-theme/sandbox/guest-source.ts")))

console.log("\nAn imported theme's canvas")
const canvas = readCode("components/website-builder/compat/compat-canvas.tsx")
check("its page's canonical is the website's address, not the builder's", (canvas.match(/\.\.\.canonicalOf\(props\.siteUrl\)/g) ?? []).length === 3 && /return \{ canonicalHost: new URL\(siteUrl\)\.host \}/.test(canvas))
const bridge = readCode("lib/storelib-theme/compat/canvas-bridge.ts")
check("a link's own address is back before the theme's first listener sees a press", /window\.__slGiveBack = giveBack/.test(bridge) && /export const CANVAS_HEAD = `<script>addEventListener\("pointerdown",function\(\)\{var g=window\.__slGiveBack;if\(g\)g\(\)\},true\)/.test(bridge))
check("a section whose margin leaves it never rests, so nothing moves mid scroll", /if \(marginEscapes\(s\)\) return false/.test(bridge))

check("this suite runs with the others", readCode("scripts/run-push-tests.mjs").includes('"tests/section-links25.test.ts"'))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
