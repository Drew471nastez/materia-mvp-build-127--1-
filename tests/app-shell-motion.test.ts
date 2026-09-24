/**
 * ===========================================================================
 *  THE /app SHELL IN MOTION: SHEETS, NAVIGATION, SETTINGS TABS, AVATARS
 * ===========================================================================
 * The motion itself is measured in a browser, frame by frame:
 *
 *   scripts/check-sheet-motion.mjs     every way a sheet closes slides out; the pill stays under it
 *   scripts/check-app-mobile-nav.mjs   the real pill under an open sheet: visible, in place, not tappable
 *   scripts/check-app-stage.mjs        a fast page shows no outline or bar; the landing; back keeps scroll
 *   scripts/check-settings-tabs.mjs    the tab bar and the new tab hold still through every switch
 *   scripts/check-upgrade-page.mjs     the plans page covers the shell; Back goes back
 *   scripts/check-app-avatar.mjs       no initials before a photo; one fade; none on the way back
 *
 * What is held here is the logic those rest on (the navigation record, the
 * way back) and the lines that would undo them without anything else
 * failing.
 *
 * Run with:  npm run test:push
 */

import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import {
  beginAppNavigation,
  endAppNavigation,
  getAppNavigation,
  hasInAppHistory,
  markLanded,
  markTraversal,
  NAV_BAR_AFTER_MS,
  NAV_ENTER_MS,
  NAV_ENTER_RISE_PX,
  NAV_SKELETON_AFTER_MS,
  NAV_PHONE_OUTLINE_AFTER_MS,
  NAV_PHONE_OUTLINE_FADE_MS,
  drawsOutline,
  outlineDelay,
  recalledScroll,
  rememberScroll,
  takeTraversal,
} from "@/lib/ui/app-navigation"

const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

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
function section(title: string) {
  console.log(`\n${title}`)
}

/* The record only runs where there is a window; a bare one is enough here. */
const g = globalThis as unknown as { window?: unknown }
if (!g.window) g.window = globalThis

section("A navigation, from start to landing")
{
  check("nothing is underway to begin with", getAppNavigation() === null)
  beginAppNavigation("/app/orders")
  const nav = getAppNavigation()
  check("a click records where it is going, and when", nav?.href === "/app/orders" && typeof nav?.startedAt === "number")
  beginAppNavigation("/app/analytics")
  check("a second click replaces the first", getAppNavigation()?.href === "/app/analytics")
  endAppNavigation()
  check("the commit clears it", getAppNavigation() === null)
  endAppNavigation()
  check("and clearing twice is harmless", getAppNavigation() === null)
  check(
    "the thresholds are the ones asked for: nothing under 300ms, an outline only past a second, a 180ms landing with a 4 to 6px rise",
    NAV_BAR_AFTER_MS === 300 && NAV_SKELETON_AFTER_MS === 1000 && NAV_ENTER_MS >= 160 && NAV_ENTER_MS <= 200 && NAV_ENTER_RISE_PX >= 4 && NAV_ENTER_RISE_PX <= 6,
  )
}

section("The outline of a page on its way")
{
  check("a phone's outline comes at 90ms on a 120ms fade; a computer's after a second",
    NAV_PHONE_OUTLINE_AFTER_MS === 90 && NAV_PHONE_OUTLINE_FADE_MS === 120
      && outlineDelay("/app/orders", true) === 90 && outlineDelay("/app/orders", false) === 1000
      && outlineDelay("/app", true) === 90 && outlineDelay("/app/products?tab=all", true) === 90)
  check("never for the product editor, new or saved, at any width",
    ["/app/products/new", "/app/products/8f0c2b1e-3a4d-4c5e-9f60-718293a4b5c6", "/app/products/abc/", "/app/products/new?from=x"]
      .every((h) => !drawsOutline(h) && outlineDelay(h, true) === null && outlineDelay(h, false) === null))
  check("nor for a page drawn over the whole shell, nor outside /app, nor an unknown address",
    !drawsOutline("/app/settings/billing/upgrade") && !drawsOutline("/explore") && !drawsOutline("/application") && !drawsOutline(null))
  const route = code("components/app/route-skeletons.tsx")
  check("and the outlines have no editor in them to draw", !/EditorSkeleton/.test(route) && /if \(path\.startsWith\("\/app\/products\/"\)\) return null/.test(route))
  const stage = code("components/app/app-stage.tsx")
  check("the stage asks for the delay by address, fades a phone's outline on opacity alone, and fades it out from where it got to",
    /outlineDelay\(href, phone\)/.test(stage)
      && /el\.animate\(\[\{ opacity: 0 \}, \{ opacity: 1 \}\], \{ duration: NAV_PHONE_OUTLINE_FADE_MS/.test(stage)
      && /const from = Number\(getComputedStyle\(el\)\.opacity\)/.test(stage))
  const bar = code("components/app/navigation-loading-bar.tsx")
  check("a phone shows the outline in place of the bar, and keeps the bar where there is no outline",
    /if \(isPhoneShell\(\) && outlineDelay\(nav\.href, true\) !== null\) return/.test(bar))
}

section("Pages drawn over the whole shell")
{
  const upgrade = code("app/app/settings/billing/upgrade/layout.tsx")
  const newLayout = code("app/app/products/new/layout.tsx")
  const idLayout = code("app/app/products/[id]/layout.tsx")
  check("the plans page and both editor addresses use the one shared layer; the editor keeps the pill and its bar clears the status bar itself",
    /<PageLayer inset="white">/.test(upgrade) && /<PageLayer pill inset="bar">/.test(newLayout) && /<PageLayer pill inset="bar">/.test(idLayout))
  const layer = code("components/app/page-layer.tsx")
  check("the layer is the whole window, between the header and the pill, and pads itself under the status bar",
    /fixed inset-0 z-\[52\]/.test(layer) && /pt-\[env\(safe-area-inset-top,0px\)\]/.test(layer) && /classList\.add\("has-page-layer"\)/.test(layer))
  const css = read("app/globals.css")
  check("while a layer is up the shell's chrome is not painted, the scroller is no stacking context on iOS, and the black shield stands down, each by :has() and by class",
    /html:has\(\[data-page-layer\]\) \[data-shell-chrome\] \{\s*visibility: hidden;/.test(css)
      && /html\.has-page-layer \[data-shell-chrome\] \{\s*visibility: hidden;/.test(css)
      && /html:has\(\[data-page-layer\]\) \.app-content-scroll \{\s*-webkit-overflow-scrolling: auto;/.test(css)
      && /html\.capacitor:has\(\[data-page-layer\]\)::before \{\s*display: none;/.test(css)
      && /html\.capacitor\.has-page-layer::before \{\s*display: none;/.test(css))
  check("the pill steps aside only for a layer that does not keep it, and a layer that does gives the scroller room for it",
    /html:has\(\[data-page-layer=""\]\) \[data-app-nav-pill\] \{\s*visibility: hidden;/.test(css)
      && /\[data-page-layer="pill"\] \[data-page-layer-scroll\] > \.page-scroll \{\s*padding-bottom: calc\(104px \+ env\(safe-area-inset-bottom, 0px\)\);/.test(css))
  const sidebar = read("components/app/sidebar.tsx")
  check("both headers and the rail say they are the shell's chrome", (sidebar.match(/data-shell-chrome=""/g) || []).length >= 3)
}

section("The way back")
{
  check("a back or forward is told apart from a new visit, once", (() => {
    const before = takeTraversal()
    markTraversal()
    return before === false && takeTraversal() === true && takeTraversal() === false
  })())
  rememberScroll("/app/orders", 120, 900)
  check("where the reader was is kept per address", JSON.stringify(recalledScroll("/app/orders")) === JSON.stringify({ outer: 120, inner: 900 }))
  check("and an address never visited has nothing", recalledScroll("/app/nowhere") === null)
  for (let i = 0; i < 80; i++) rememberScroll(`/app/page-${i}`, i, i)
  check("a long session keeps a bounded number of addresses", recalledScroll("/app/orders") === null && recalledScroll("/app/page-79") !== null)
  check("a page opened cold has no /app page behind it", hasInAppHistory() === false)
  markLanded()
  check("and one landed on in the app does", hasInAppHistory() === true)
}

section("Sheets")
{
  const sheet = code("components/ui/bottom-sheet.tsx")
  check("a sheet taken away while on screen leaves a copy that finishes the slide",
    /function leaveBehind\(root: HTMLElement, fromY: number, height: number, scrimOpacity: number\)/.test(sheet)
      && /useLayoutEffect\(\(\) => \{\s*const leave = leaveRef\s*return \(\) => leave\.current\(\)\s*\}, \[\]\)/.test(sheet)
      && /ghost\.setAttribute\("inert", ""\)/.test(sheet) && /a\.onfinish = done/.test(sheet))
  check("a closing sheet gives the tap back at once", /style=\{isOpen \? undefined : \{ pointerEvents: "none" \}\}/.test(sheet))
  const css = read("app/globals.css")
  check("the pill is never hidden, faded or dropped under the page for a sheet",
    /html:has\(\[data-app-sheet\]\) \[data-app-nav-pill\],[\s\S]{0,200}z-index: 39;/.test(css)
      && !/html:has\(\[data-app-sheet[^\]]*\]\)[^{]*\[data-app-nav-pill\][^{]*\{[^}]*(opacity|visibility|display|transform)/.test(css))
}

section("Navigation")
{
  const offenders = ["app/app/loading.tsx", "app/app/orders/loading.tsx", "app/app/orders/sales/loading.tsx", "app/app/orders/[id]/loading.tsx", "app/app/settings/loading.tsx", "app/app/customers/loading.tsx", "app/app/emails/loading.tsx", "app/app/analytics/loading.tsx", "app/app/payouts/loading.tsx", "app/app/coupons/loading.tsx", "app/app/coupons/new/loading.tsx", "app/app/onepage/loading.tsx", "app/app/website-builder/loading.tsx"].filter((f) => existsSync(join(root, f)))
  check("no /app page swaps itself for a loading boundary on the first frame of a navigation", offenders.length === 0, offenders.join(", "))
  const stage = code("components/app/app-stage.tsx")
  check("the landing starts before the new page is painted, and moves only transform and opacity",
    /useLayoutEffect\(\(\) => \{[\s\S]*playEntrance\(s\.outer\)/.test(stage)
      && /\[\{ opacity: 0, translate: `0 \$\{NAV_ENTER_RISE_PX\}px` \}, \{ opacity: 1, translate: "0 0" \}\]/.test(stage)
      && !/fill: "(forwards|both)"[\s\S]{0,40}NAV_ENTER_EASE \}\s*,?\s*\)\s*\}\s*\}\s*export function AppStage/.test(stage))
  check("a page with something fixed showing gets the fade without the rise", /const rise = !holdsVisibleFixed\(child\)/.test(stage))
  check("reduced motion means no landing at all", /if \(reducedMotion\(\)\) return/.test(stage))
  check("the scroll is set in the same frame, and a back puts it where it was",
    /const saved = traversal \? recalledScroll\(key\) : null/.test(stage) && /s\.outer\.scrollTop = saved\?\.outer \?\? 0/.test(stage))
  check("the shell's own after paint scroll reset is gone", !/scrollEl\.scrollTop = 0/.test(code("components/app/app-layout-wrapper.tsx")))
  check("the shell mounts the stage", /<AppStage \/>/.test(read("components/app/app-layout-wrapper.tsx")))
  check("inside the shell a page does not fade a second time on its own class",
    /html\.app-layout \.app-content-scroll \.app-page-enter \{\s*animation: none;/.test(read("app/globals.css")))
  const bar = code("components/app/navigation-loading-bar.tsx")
  check("the bar waits before it shows, and back and forward are seen as navigations",
    /NAV_BAR_AFTER_MS - \(performance\.now\(\) - nav\.startedAt\)/.test(bar) && /window\.addEventListener\("popstate", onPop\)/.test(bar))
  check("a modified click (a new tab) starts nothing", /e\.metaKey \|\| e\.ctrlKey \|\| e\.shiftKey \|\| e\.altKey/.test(bar))
}

section("Avatars")
{
  const avatar = code("components/app/app-avatar.tsx")
  check("while a photo is on its way the circle has no initials in it",
    /\{photo \? \(/.test(avatar) && /data-state=\{photo \? \(loaded \? "photo" : "waiting"\) : "initials"\}/.test(avatar))
  check("it fades in over 150ms, and only when it arrived after the first paint",
    /transition: fade \? "opacity 150ms ease-out" : undefined/.test(avatar) && /if \(img\.complete && img\.naturalWidth > 0\)/.test(avatar))
  check("a photo already shown in this tab is drawn at once", /useState\(\(\) => !!url && shown\.has\(url\)\)/.test(avatar))
  check("it is asked for at its drawn size, never through a storage transform",
    /optimizedSrcSet\(url,/.test(avatar) && /toOriginalImageUrl\(src\)/.test(avatar) && !/render\/image/.test(avatar))
  /* The phone's account trigger and sheet live in their own file now (components/app/mobile-account-menu.tsx). */
  const sidebar = code("components/app/sidebar.tsx") + code("components/app/mobile-account-menu.tsx")
  check("the header, the account sheet and the sidebar all use it, and none draws initials under a photo",
    (sidebar.match(/<AppAvatar /g) ?? []).length === 4 && !/>\s*\{userInitials\}\s*</.test(sidebar))
  const settings = code("components/app/settings-form-new.tsx")
  check("so does Settings, without the purple gradient behind the initials",
    /<AppAvatar\s+src=\{avatarUrl \|\| null\}/.test(settings) && !/from-\[#8b5cf6\] to-\[#a78bfa\]/.test(settings))
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failing:", failures.join(", "))
  process.exit(1)
}
