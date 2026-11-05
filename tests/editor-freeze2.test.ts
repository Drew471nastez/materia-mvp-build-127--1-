/**
 * ===========================================================================
 *  THE CANVAS ON LANDING, THE SIDEBAR'S JUMP, A SETTING THAT RELOADED (1023, 2)
 * ===========================================================================
 * The owner, on the imported Materia theme: "when the editor opens the
 * canvas does not scroll and has no scrollbar until I turn on the inspector
 * and click a section"; "clicking a block in the sidebar scrolls the sidebar
 * to the bottom of its settings"; "changing some settings still refreshes
 * the whole canvas, which then freezes". Measured on the real editor by
 * scripts/check-canvas-landing.mjs, check-sidebar-open.mjs and
 * check-theme-settings-live.mjs on the owner's store
 * (scripts/materia-store-kit.mjs), and held here:
 *
 *   THE FIRST LOOK   a hold the page has from its first paint (a cookie
 *                    banner's consent, a drawer that opens itself in a
 *                    frame, a preloader's class) is looked at from the first
 *                    paint, at the load, when the builder shows the page,
 *                    and in the first wheel's own task (canvas-bridge.ts)
 *   THE WHEEL TAKEN  a smooth scroll that is stopped takes every wheel and
 *                    moves nothing: such a wheel is scrolled by the canvas
 *   WHAT HOLDS       only a layer over the page and the shape of a drawer
 *                    or a pop-up holds it; a banner along the foot and a
 *                    picture under the page do not
 *   THE PRELOADER    a preloader of the theme's own name still up after the
 *                    load is hidden as the known ones are
 *   THE SIDEBAR      a block's panel was taken for a row of a list and
 *                    brought into view by its foot; it opens at its top
 *   THE LAYOUT       a setting printed in the layout around the sections, or
 *                    a node added to the head, is changed in place
 *                    (planPatch `layout`, canvas-bridge.ts relayout), and
 *                    <html>/<body> keep the classes the theme's script added
 *
 * Run with:  npm run test:push
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { CANVAS_BRIDGE } from "@/lib/storelib-theme/compat/canvas-bridge"
import { planPatch, type DocShape } from "@/components/website-builder/compat/compat-canvas"
import { rowIntoView } from "@/lib/website-builder/steady-focus"
import { SCENARIOS, STORE_CHANGES, STORE_SETTINGS } from "../scripts/materia-store-kit.mjs"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail)}`}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

console.log("\nTHE FIRST LOOK: A HOLD FROM THE FIRST PAINT IS LET GO WITHOUT A CLICK")
{
  check("looked at as the bridge starts, and again at 0.4s, 1.5s and 4s", /\[0, 400, 1500, 4000\]\.forEach\(function \(ms\) \{ setTimeout\(firstLook, ms\); \}\)/.test(CANVAS_BRIDGE))
  check("and at the page's load", /if \(document\.readyState === "complete"\) afterLoad\(\); else addEventListener\("load", afterLoad, \{ once: true \}\)/.test(CANVAS_BRIDGE))
  check("the builder says heal when it shows the page in front, and the page looks then", /m\.type === "heal"\) \{[\s\S]{0,300}checkLock\(\);\s*stalledLoaders\(\);/.test(CANVAS_BRIDGE))
  const canvas = read("components/website-builder/compat/compat-canvas.tsx")
  check("  said with \"shown\", for the first page and every page that comes forward", /type: "shown" \}\)[\s\S]{0,600}type: "heal" \}\)/.test(canvas))
  /* Changed on purpose (round 14): the first wheel always looks (lockSeen starts null); later ones when <html> or <body> changed (lockDirty) or a second has gone. */
  check("the first wheel over a held page lets it go in its own task, before the browser scrolls", /addEventListener\("wheel", function \(e\) \{[\s\S]{0,800}if \(!unlocked && \(lockSeen === null \|\| lockDirty \|\| t0 - lockSeen > 1000\)\) \{[\s\S]{0,80}if \(lockedNow\(\)\) \{ clearTimeout\(lockTimer\); checkLock\(\); \}/.test(CANVAS_BRIDGE) && /lockSeen = null, lockDirty = true;/.test(CANVAS_BRIDGE) && /lockWatch = new MutationObserver\(function \(\) \{\s*lockDirty = true;/.test(CANVAS_BRIDGE))
  /* Changed on purpose (round 1026): the first swipe's look (AND THE FIRST SWIPE, AS THE FIRST WHEEL) now sits between the wheel's listener and ALREADY HELD; the wheel's is still capture and passive. */
  check("  in the capture phase, passive: nothing of the theme's can stop it hearing the wheel", /\}, \{ passive: true, capture: true \}\);\s*\/\*\s*AND THE FIRST SWIPE, AS THE FIRST WHEEL/.test(CANVAS_BRIDGE))
}

console.log("\nTHE WHEEL TAKEN: A STOPPED SMOOTH SCROLL")
{
  /* Changed on purpose (round 14): its own scroller under the pointer is looked for only for a wheel that was prevented, not for every wheel. */
  check("only a wheel the theme's script prevented", /if \(!e\.defaultPrevented \|\| takesWheel\(e\.target, dy\)\) return;/.test(CANVAS_BRIDGE))
  check("  and that moved nothing (no scroll event since it)", /if \(scrollY !== y \|\| lastScrollAt >= at\) return;/.test(CANVAS_BRIDGE))
  check("  never over a scroller of its own that could take it (a drawer's list, a row of cards)", /var takesWheel = function \(t, dy\)/.test(CANVAS_BRIDGE) && /cs\.overflowX === "auto" \|\| cs\.overflowX === "scroll"/.test(CANVAS_BRIDGE))
  check("  never with something open on screen", /if \(openOnScreen\(\)\) return;\s*scrollTo\(\{ top: Math\.max\(0, Math\.min\(room, y \+ dy\)\)/.test(CANVAS_BRIDGE))
  check("  by the wheel's own distance, lines and pages counted", /e\.deltaMode === 1 \? e\.deltaY \* 16 : e\.deltaMode === 2 \? e\.deltaY \* innerHeight : e\.deltaY/.test(CANVAS_BRIDGE))
}

console.log("\nWHAT HOLDS A PAGE IS OVER IT, AND THE SHAPE OF A DRAWER OR A POP-UP")
{
  check("a layer under the page's own content at that point holds nothing (a grain, a parallax picture)", /var underPage = false;/.test(CANVAS_BRIDGE) && /\} else underPage = true;/.test(CANVAS_BRIDGE))
  check("a layer holds only when at least half the screen tall (a cookie bar along the foot does not)", /var tall = Math\.min\(r\.bottom, vh\) - Math\.max\(r\.top, 0\) >= vh \* 0\.5;/.test(CANVAS_BRIDGE) && /if \(!underPage && tall && seen >= area \* 0\.25 && opacityOf\(layer\) >= 0\.05\) return true;/.test(CANVAS_BRIDGE))
  check("an open <dialog> still holds it", /var dialogs = document\.querySelectorAll\("dialog\[open\]"\)/.test(CANVAS_BRIDGE))
}

console.log("\nA PRELOADER THAT NEVER GOES")
{
  check("named as a loader is", /var LOADER_NAME = \/\(\^\|\[\^a-z\]\)\(pre-\?loader\|loader\|loading/.test(CANVAS_BRIDGE))
  check("fixed, over the whole screen, painted, holding no dialog or field", /if \(r\.width < vw \* 0\.9 \|\| r\.height < vh \* 0\.9\) continue;/.test(CANVAS_BRIDGE) && /dialog, \[role=dialog\], \[aria-modal=true\], input, select, textarea, form/.test(CANVAS_BRIDGE) && /if \(!paints\(n\)\) continue;/.test(CANVAS_BRIDGE))
  check("hidden the way CANVAS_HEAD hides the known ones: unseen, no pointer, never taken out", /\[data-sl-stalled\],\[data-sl-stalled\] \*\{visibility:hidden!important;pointer-events:none!important/.test(CANVAS_BRIDGE) && !/data-sl-stalled[^"]*"\)\.remove\(\)/.test(CANVAS_BRIDGE))
  check("a moment after the load, and 4s in at the latest", /setTimeout\(stalledLoaders, 1200\)/.test(CANVAS_BRIDGE) && /setTimeout\(stalledLoaders, 4000\);/.test(CANVAS_BRIDGE))
}

console.log("\nTHE SIDEBAR: A BLOCK'S SETTINGS OPEN AT THEIR TOP")
{
  const box = { top: 100, bottom: 600 }
  check("a row on screen: no scroll", rowIntoView({ top: 200, bottom: 240 }, box) === 0)
  check("a row below: brought up to the sidebar's foot", rowIntoView({ top: 620, bottom: 660 }, box) === 60)
  check("a row above: brought down to the sidebar's top", rowIntoView({ top: 40, bottom: 80 }, box) === -60)
  check("a row taller than the sidebar: its TOP at the top, never its foot at the foot (the jump)", rowIntoView({ top: 150, bottom: 1400 }, box) === 50, rowIntoView({ top: 150, bottom: 1400 }, box))
  check("  one starting above, taller than the sidebar: its top too", rowIntoView({ top: -300, bottom: 1400 }, box) === -400)
  const page = read("app/(storelib)/website-builder/editor/[installId]/page.tsx")
  check("the block's own panel is not a row to bring into view", /\.find\(\(el\) => !el\.closest\("\[data-wb-block-panel\]"\)\)/.test(page))
  check("its settings' scroller is the block's own, so another block opens at the top", /<div key=\{key\} data-sheet-scroll data-wb-block-scroll="" className="flex-1 overflow-y-auto wb-slim-scroll">/.test(page))
  check("the tree's rows go by rowIntoView", /const delta = rowIntoView\(r, box\)/.test(page))
}

console.log("\nTHE LAYOUT AROUND THE SECTIONS IS CHANGED IN PLACE")
{
  const shape = (o: Partial<DocShape> = {}): DocShape => ({
    head: "<script /a.js>", headNodes: ['<meta data-sl-d name="x">'], styles: [":root{--a:1}"], bodyStyles: [], fonts: [],
    htmlAttrs: { lang: "it" }, bodyAttrs: { class: "template-index" }, skeleton: "<main></main>", sections: new Map([["hero", "<div>hero</div>"]]), order: [{ id: "hero", group: "" }],
    headLayout: ['<meta data-sl-d name="x">', '<template data-sl-js="/a.js"></template>', "<style data-sl-d>:root{--a:1}</style>"],
    bodyLayout: '<main><template data-sl-sec="hero"></template></main>',
    ...o,
  })
  const a = shape()
  const banner = shape({ skeleton: '<main></main><div class="cookie-banner">Allow Cookies</div>', bodyLayout: '<main><template data-sl-sec="hero"></template></main><div class="cookie-banner">Allow Cookies</div>' })
  const p1 = planPatch(a, banner)
  check("markup added around the sections (a cookie banner switched on): changed in place, not loaded again", !!p1 && !!(p1.message.layout as { body?: unknown })?.body, p1?.message)
  check("  the layout before and after, as drawn", JSON.stringify((p1!.message.layout as { body: string[] }).body) === JSON.stringify([a.bodyLayout, banner.bodyLayout]))
  const shadow = shape({ styles: [":root{--a:1}", ".button{box-shadow:0 4px 12px}"], headLayout: [...a.headLayout!, "<style data-sl-d>.button{box-shadow:0 4px 12px}</style>"] })
  const p2 = planPatch(a, shadow)
  check("a <style> that comes with a switch: the head changed in place", !!p2 && !!(p2.message.layout as { head?: unknown })?.head && !p2.message.styles, p2?.message)
  const search = shape({ head: "<script /a.js>\n<script /predictive.js>", headLayout: [...a.headLayout!, '<template data-sl-js="/predictive.js"></template>'] })
  check("a script in the head with a switch: the head changed in place (the script started)", !!(planPatch(a, search)?.message.layout as { head?: unknown } | undefined)?.head && /var s = document\.createElement\("script"\);\s*s\.src = src;/.test(CANVAS_BRIDGE))
  const custom = shape({ headNodes: [...a.headNodes, '<meta data-sl-d name="materia-custom">'], headLayout: [...a.headLayout!, '<meta data-sl-d name="materia-custom">'] })
  check("a tag a setting adds to the head: changed in place", !!planPatch(a, custom)?.message.layout)
  const old = { ...a, headLayout: undefined, bodyLayout: undefined }
  check("a page drawn without the layout's marks is loaded again, as before", planPatch(old, { ...banner, headLayout: undefined, bodyLayout: undefined }) === null)
  check("the same layout: no layout sent", !planPatch(a, shape({ styles: [":root{--a:2}"] }))?.message.layout)
  const cls = planPatch(a, shape({ bodyAttrs: { class: "template-index layout--boxed" } }))
  check("<body> attributes go with what they were drawn as, so the theme's own classes stay", JSON.stringify(cls?.message.bodyFrom) === JSON.stringify({ class: "template-index" }) && /setAttrs\(document\.body, m\.bodyAttrs, m\.bodyFrom\)/.test(CANVAS_BRIDGE) && /wa\.forEach\(function \(w\) \{ if \(wb\.indexOf\(w\) < 0\) el\.classList\.remove\(w\); \}\);/.test(CANVAS_BRIDGE))

  check("the frame marks what was drawn before any script of the theme's runs", /var markTree = function \(c\)/.test(CANVAS_BRIDGE) && /document\.addEventListener\("readystatechange", function after\(\)/.test(CANVAS_BRIDGE))
  check("what the theme's scripts added is left alone (nothing marked is not the layout's)", /if \(c\.__slDrawn !== true\) continue;/.test(CANVAS_BRIDGE))
  check("sections stay where they are and are never moved by it", /if \(g && !isMark\(A\[o\.a\]\)\) later\.push\(g\.remove\.bind\(g\)\);/.test(CANVAS_BRIDGE) && /if \(isMark\(a\)\) return true;/.test(CANVAS_BRIDGE))
  check("a page that no longer matches its drawing is drawn again, saying why", /if \(!laidOut\) return reload\("layout: " \+ layoutWhy\);/.test(CANVAS_BRIDGE))
  check("a font changed keeps the head as drawn (marked, in place, the old let go once the new has loaded)", /l\.setAttribute\("data-sl-d", ""\); l\.setAttribute\("data-storelib-font", ""\);/.test(CANVAS_BRIDGE) && /stale\.forEach\(function \(l\) \{ l\.removeAttribute\("data-sl-d"\); \}\);/.test(CANVAS_BRIDGE))
  check("a theme's code is told the layout changed (storelib:layout-change)", /new CustomEvent\("storelib:layout-change"/.test(CANVAS_BRIDGE))
}

console.log("\nTHE STORE THE PROBES DRAW: EVERY TYPE OF THEME SETTING")
{
  const types = new Set(STORE_SETTINGS.flatMap((g: { settings: { type: string }[] }) => g.settings.map((s) => s.type)))
  const shopify = ["checkbox", "number", "radio", "range", "select", "text", "textarea", "color", "color_background", "color_scheme", "color_scheme_group", "font_picker", "html", "image_picker", "inline_richtext", "link_list", "liquid", "richtext", "text_alignment", "url", "video", "video_url", "collection", "collection_list", "product", "product_list", "page", "blog"]
  const missing = shopify.filter((t) => !types.has(t))
  check("every input type Shopify gives theme settings is in the store's settings_schema.json", missing.length === 0, missing)
  const ids = STORE_SETTINGS.flatMap((g: { settings: { id: string; type: string }[] }) => g.settings.filter((s) => s.type !== "color_scheme_group").map((s) => s.id))
  check("each has another value to be changed to", ids.every((id: string) => id in STORE_CHANGES), ids.filter((id: string) => !(id in STORE_CHANGES)))
  check("the landing scenarios: consent, a preloader, a drawer that opens itself, a stopped smooth scroll, a picture under the page, a tall banner", ["consent", "loader", "drawer", "smooth", "backdrop", "banner"].every((s) => SCENARIOS.includes(s)))
  const run = read("scripts/run-push-tests.mjs")
  check("this file runs with the push suite", run.includes('"tests/editor-freeze2.test.ts"'))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
