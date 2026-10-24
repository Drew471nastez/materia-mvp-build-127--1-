/**
 * ===========================================================================
 *  THE ONEPAGE EDITOR: A WAY IN, A WAY OUT, AND THE WHOLE SCREEN ON A PHONE
 * ===========================================================================
 * components/onepage/onepage-editor.tsx, held to what was asked of it:
 *
 *   full screen on a phone    starts at the top, its white bar in the safe
 *                             area, the black header and shield not painted
 *   a way out                 an arrow in the phone bar, asking first when
 *                             there is unsaved work, then the dark glass
 *   a way in                  the light loader, faded off what arrived
 *   undo and redo             the icon squares from the rest of /app
 *   three more designs        Studio, Night and Peach
 *   settings                  SEO as one share card, no upload modal, no
 *                             stock icons in the section list
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { untt } from "./i18n-source"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label)
    console.log(`  FAIL  ${label}`)
  }
}
const read = (p: string) => untt(readFileSync(join(process.cwd(), p), "utf8"), p)
const editor = read("components/onepage/onepage-editor.tsx")
const css = read("app/globals.css")
const design = read("components/onepage/tabs/design-tab.tsx")
const settings = read("components/onepage/tabs/settings-tab.tsx")
/* The SEO section is its own file now (components/onepage/seo-panel.tsx). */
const seoPanel = read("components/onepage/seo-panel.tsx")

console.log("\nFull screen on a phone")
/* Changed on purpose (round 11): from 768px the editor starts where the rail ends, open (240px) or a row of icons (--app-rail-w, lib/ui/app-rail), not at a fixed 240px. */
check("the editor starts at the top of the screen, under the header only from 768px", /fixed left-0 right-0 top-0 md:left-\[var\(--app-rail-w,240px\)\] md:top-\[58px\]/.test(editor))
check("its bar pads itself into the safe area on a phone", /box-content flex items-center border-b bg-white[^"]*pt-\[env\(safe-area-inset-top\)\] md:pt-0/.test(editor))
/*
  AND IT EARNS ITS SPACE. Reported of a phone: a white bar over a dark page
  with nothing in the middle of it. Measured at 390 by scripts/check-onepage-
  bar.mjs: 56px of bar for a 36px back arrow, and a 91px hole across the
  middle — the shape of the DESKTOP layout, whose tab pill and settings
  button are `hidden` here. The height is the one the controls need now, and
  the hole carries the save state, which under 640px the save button says
  with an icon alone. The word needs about 52px to read, so it is there from
  375px up.
*/
check("the phone bar is the height its controls need, 44px, and 60 from 640", /h-11 sm:h-\[60px\] pt-\[env\(safe-area-inset-top\)\]/.test(editor))
check("its middle says whether the page is saved, where the save button has no words",
  /* From 390px, not 375 (changed on purpose, round 10): with the share square and the save icon in the bar there was room for "Unsa…" at 390. */
  /data-onepage-state=""/.test(editor) && /hidden min-\[390px\]:block md:hidden/.test(editor) &&
  /\? "Saving…"/.test(editor) && /\? "Unsaved"/.test(editor) && /: "Saved"/.test(editor))
check("it sets with-op-editor on <html>", /<HtmlClass name="with-op-editor" \/>/.test(editor))
const phoneBlock = css.slice(css.indexOf("The OnePage editor, full screen on a phone"))
check("which hides the shell chrome under 768px only", /@media \(max-width: 767px\) \{\s*html\.with-op-editor \[data-shell-chrome\] \{\s*visibility: hidden;/.test(phoneBlock))
check("and stands the native black shield down", /html\.capacitor\.with-op-editor\.with-op-editor::before \{\s*display: none;/.test(phoneBlock))
check("the editor keeps z 30, so its dialogs and sheets still open over it", /style=\{\{ zIndex: 30, \.\.\.bottomAboveKeyboard\(\) \}\}/.test(editor))

console.log("\nA way out, and a way in")
check("an arrow in the phone bar", /data-onepage-exit=""/.test(editor) && /md:hidden -ml-1 inline-flex h-9 w-9/.test(editor))
check("it asks first when there is unsaved work", /const handleExit = \(\) => \{\s*if \(isDirty\) \{\s*setPendingNavigation\("\/app"\)\s*setShowUnsavedDialog\(true\)/.test(editor))
check("Save and Discard both leave through the glass", (editor.match(/if \(pendingNavigation === "\/app"\) \{\s*leave\(\)/g) ?? []).length === 2)
check("the glass is the builder's, with Going back", /<div className="wb-leaving"[^>]*>\s*<BuilderLoader className="wb-leaving-content" tone="dark" lines=\{\["Going back", "Almost there"\]\} \/>/.test(editor))
check("the push waits to be seen and has a ceiling", /LEAVING_SEEN_MS\)/.test(editor) && /navigateWithCeiling\(/.test(editor))
check("and the glass can come back down", /window\.addEventListener\("pageshow", onPageShow\)/.test(editor) && /const watchdog = window\.setTimeout\(revive, 6000\)/.test(editor))
check("an answered question does not bring the browser's own prompt", /if \(isDirty && !leavingRef\.current\)/.test(editor))
check("the light loader on the way in, faded off", /wb-canvas-loader absolute inset-0/.test(editor) && /useLinger\(!arrived, 320\)/.test(editor))

console.log("\nUndo and redo")
check("both are the icon squares, not ghost buttons", (editor.match(/className=\{cn\(iconDepth, "h-8 w-8 rounded-\[9px\] text-\[#374151\]"\)\}/g) ?? []).length === 2)

console.log("\nThe editor's questions")
/* Changed on purpose (round 10): kept as well (keepMounted), so the tap only slides it up. */
check("on a phone they are the shared sheet", /<BottomSheet isOpen=\{open\} onClose=\{onClose\} label=\{label\} hideFrom="md" keepMounted>/.test(editor))
check("with no drag kept in React state any more", !/setDragY\(/.test(editor))

/*
  ONE TAB TO THE NEXT. Each tab was mounted on the tap and thrown away on
  the next, in one scroll box they shared: a single-frame swap, the tab
  built on the tap, and Links back at its top after Design. Measured by
  scripts/check-onepage-motion.mjs (tabs): the pill slides over 8 to 12
  frames, no frame shows no tab, Links comes back at 260px.
*/
console.log("\nSwitching tabs")
check("each tab has its own scroll box, the one on screen is the editor's scroll container",
  /data-tab-panel=\{t\}/.test(editor) && /data-scroll-container=\{t === panels\.tab \? "links-tab" : undefined\}/.test(editor))
check("Links, Design and Products are kept, out of sight in React's Activity", /<Activity mode=\{shown \? "visible" : "hidden"\}>/.test(editor) && /const KEPT_TABS: TabType\[\] = \["links", "design", "products"\]/.test(editor))
check("and built ahead while the page is idle", /requestIdleCallback\(build/.test(editor))
/* Changed on purpose (round 10): it also opens on the last section chosen, or the one the address names. */
check("Settings is still built each time it opens, and saves through the editor's own Save", /t === "settings" \? \(\s*<SettingsTab ref=\{settingsTabRef\} pageUrl=\{pageUrl\} onSave=\{handleSaveWithProCheck\} userPlan=\{userPlan\} section=\{settingsSection\.current\}/.test(editor))
check("each tab comes back to where it was scrolled", /scrollMemory\.current\[from\] = outgoing\.scrollTop/.test(editor) && /incoming\.scrollTop = scrollMemory\.current\[to\] \?\? 0/.test(editor))
/*
  "Even when I'm switching in the bottom tabs, make sure it's smooth and
  clean. Direct, not so much animation." The new tab slid 12px over 220ms
  and the old slid the other way: now one 120ms fade of the new tab over
  the old, which stays whole under it and is hidden once covered.
  scripts/check-onepage-editor-nav.mjs (tabs): animations moving a tab 2 to
  0, frames with a tab off its place 12 to 16 to 0, longest 220 to 120ms,
  no frame without a tab, Links back at 260px.
*/
check("the switch is one short fade on the compositor, and nothing slides",
  /const fade = incoming\.animate\(\[\{ opacity: 0 \}, \{ opacity: 1 \}\], \{ duration: TAB_FADE_IN_MS, easing: TAB_FADE_EASE \}\)/.test(editor)
  && /const TAB_FADE_IN_MS = 120/.test(editor) && !/TAB_SHIFT_PX/.test(editor) && !/outgoing\.animate\(/.test(editor) && !/incoming\.animate\(\s*\[\{ transform/.test(editor))
/*
  "No slide-in slide effect" (the phone bar): the computer's segmented row
  keeps its sliding pill; the phone's buttons change in place
  (tests/onepage-arrival.test.ts, scripts/check-onepage-tabbar.mjs).
*/
/* The slide itself is the one every pill-tab row uses now (components/onepage/pill-tabs usePillSlide), stretching on both axes for a list as well as a row, and it starts on the button going down. */
const pills = read("components/onepage/pill-tabs.tsx")
check("the computer row's pill slides by transform, started from the press", /data-tab-pill=""/.test(editor) && /pillMoves\.current\.forEach\(\(slide\) => slide\(tab\)\)/.test(editor) && /usePillSlide\(activeTab\)/.test(editor)
  && /scale\(\$\{from\.w \/ w\}, \$\{from\.h \/ h\}\)/.test(pills) && /pillMoves\.current = \[desktopPill\.slideTo\]/.test(editor) && /onPointerDown=\{desktopPress\(tab\.id\)\.onPointerDown\}/.test(editor))
check("the panels follow a frame after the bars", /requestAnimationFrame\(\(\) => \{\s*timer = window\.setTimeout\(\(\) => startTransition\(\(\) => setPanelTab\(activeTab\)\), 0\)/.test(editor))

/*
  "The settings button sits too much in the corner, almost not visible."
  It was a 40px grey square against the right edge. Measured by
  scripts/check-onepage-seo.mjs at 360, 390 and 430: four buttons of one
  size (76, 83.5, 93.5 by 54), 16px from both edges, 10px above the foot
  or the home indicator, the pill exactly over the chosen one.
*/
console.log("\nThe phone's tab bar")
check("four equal buttons, Settings one of them with its word",
  /grid grid-cols-4 gap-1\.5 px-3 pt-\[9px\] min-\[340px\]:gap-2 min-\[340px\]:px-4/.test(editor) && /\[\.\.\.tabs, \{ id: "settings" as const, label: "Settings", icon: SlidersHorizontal \}\]/.test(editor) && !/aria-label="Settings"/.test(editor))
check("each 54px, white with a hairline and a soft foot; the chosen one near black with Preview's light and shade",
  /relative isolate flex h-\[54px\] min-w-0 cursor-pointer touch-manipulation select-none items-center justify-center rounded-\[12px\] border border-\[#e3e4e8\] bg-white/.test(editor) && /rounded-\[12px\] bg-\[#1a1a2e\] shadow-\[inset_0_1px_0_rgba\(255,255,255,0\.14\)/.test(editor))
check("the bar is one shared height, and the tabs leave that room under their content",
  /h-\[var\(--op-tabbar-h\)\]/.test(editor) && /--op-tabbar-h: calc\(64px \+ max\(10px, env\(safe-area-inset-bottom, 0px\)\)\)/.test(css) && /\.op-tabbar-clearance \{\s*padding-bottom: calc\(var\(--op-tabbar-h\) \+ 16px\)/.test(css))

console.log("\nThree more designs")
for (const [id, category] of [["studio", "light"], ["night", "dark"], ["peach", "gradient"]]) {
  check(`${id}, under ${category}`, new RegExp(`id: "${id}",\\s*name: "[A-Z][a-z]+",\\s*category: "${category}",`).test(design))
}

console.log("\nSettings")
check("SEO is the share card and the Google result, as they will look", /data-og-card=""/.test(seoPanel) && /Shared link/.test(seoPanel) && /data-search-preview=""/.test(seoPanel) && /<SeoPanel pageUrl=\{pageUrl\}/.test(settings))
check("Use my own picture opens the picker straight away, no modal", /fileInputRef\.current\?\.click\(\)/.test(seoPanel) && !/showOgImageModal/.test(seoPanel + settings) && !/Upload Social Image/.test(seoPanel + settings))
check("the section list is words, no icons", !/icon: [A-Z]/.test(settings.slice(settings.indexOf("const SETTINGS_SECTIONS"), settings.indexOf("const SETTINGS_SECTIONS") + 600)))
/*
  A section swapped in one frame; then it settled in tone as Website Settings' tabs do, rebuilt on
  every press. "Laggy, buggy, direct to direct": now every section is kept (built in the idle time)
  and a switch crossfades the two, with the pill sliding from the press and each section's scroll
  kept (components/onepage/pill-tabs; scripts/check-onepage-pill-tabs.mjs measures it).
*/
/* Changed on purpose (round 10): one row of pills at every width, so one PillTabs, not two (the list on a computer is gone). */
check("a section changes by one kept crossfade, its row the editor's one pill-tab row",
  /data-settings-section=\{id\}/.test(settings) && /<PillPanels dataPanels="settings"/.test(settings)
  && (settings.match(/<PillTabs\b/g) ?? []).length === 1 && !/key=\{activeSection\}/.test(settings) && !/const NavItem/.test(settings))

/*
  ROUND 10. "Make the settings not with the sidebar there, make it with pill
  shapes, as settings categories." One row of pills across the top at every
  width, the Theme page's chips, held at the top of the tab, scrolling
  sideways on a phone with no bar, the chosen one always in view; a switch
  fades and slides 10px from the side the pill went; #settings-seo opens a
  section, and choosing one writes it there. scripts/check-onepage-shell.mjs
  measures it at 390 and 1440.
*/
const pillTabs = read("components/onepage/pill-tabs.tsx")
/* Changed on purpose (round 11): the pills are Storelib's own (components/onepage/pill-tabs PILL_TAB, lib/ui/pill-switch), a caller only sizes them. */
check("Settings is one row of pills at every width, no list down the side",
  /<PillTabs\s+dataRow="settings-pills"/.test(settings) && !/dataRow="settings-list"/.test(settings) && !/dataRow="settings-chips"/.test(settings)
  && !/w-48 flex-shrink-0/.test(settings) && !/md:flex-row gap-6/.test(settings)
  && /itemClassName="h-10 px-4 text-\[13px\] sm:h-9"/.test(settings) && !/pillClassName=/.test(settings))
check("the row stays at the top, scrolls with no bar, and keeps the chosen pill in view",
  /sticky top-0 z-20/.test(settings) && /overflow-x-auto[^"]*no-scrollbar/.test(settings) && /keepInView\n/.test(settings)
  && /row\.scrollTo\(\{ left: to, behavior: instant \|\| reducedMotion\(\) \? "auto" : "smooth" \}\)/.test(pillTabs))
/*
  Changed on purpose (round 11): "the switching [...] should inherit how Storelib feels [...] the settings of the app".
  The section left goes in the frame the next one lands, which lands from CONTENT_IN_FROM on opacity alone
  (lib/ui/pill-switch landContent), the way Storelib's settings and library switch. No slide, no crossfade.
*/
check("a switch lands the next section as Storelib's settings do: the one left gone at once, the next from most of the way there, on opacity only",
  /<PillPanels dataPanels="settings" value=\{active\} panels=/.test(settings) && !/PANEL_SLIDE_PX/.test(pillTabs)
  && /export const PANEL_IN_MS = CONTENT_IN_MS/.test(pillTabs) && /incoming\.animate\(\[\{ opacity: PANEL_IN_FROM \}, \{ opacity: 1 \}\]/.test(pillTabs)
  && /const drawn = p\.id === state\.shown\n/.test(pillTabs))
check("#settings-<section> opens that section, Back and a typed address switch to it, and a choice is written there",
  /hash\.startsWith\("settings-"\)/.test(editor) && /SETTINGS_SECTION_IDS as readonly string\[\]\)\.includes\(section\)/.test(editor)
  && /setSettingsJump\(/.test(editor) && /`#settings-\$\{id\}`/.test(editor) && /section=\{settingsSection\.current\} jump=\{settingsJump\} onSectionChange=\{onSettingsSection\}/.test(editor))

/*
  ROUND 10. "Make sure the notification toasts don't overlap the top bar or
  the important things." Every toast in the editor sits in its ToastSpot:
  above the phone's tab bar, at the foot of the editor's column on a
  computer, clear of the rail and the preview; it moves on named properties.
*/
const toast = read("components/ui/save-notification.tsx")
check("every toast in the editor sits clear of its bars and its preview",
  /<ToastSpot spot="onepage-editor">\s*<EditorLayout \/>\s*<\/ToastSpot>/.test(editor)
  && /bottom-\[calc\(var\(--op-tabbar-h\)\+12px\)\][^"]*md:bottom-6 md:left-\[240px\] md:right-\[410px\]/.test(toast)
  && /transitionProperty: "opacity, translate, scale"/.test(toast))

/* ROUND 10. The phone bar's middle word reads whole: the bar's gaps are 6px on a phone and it shows from 390px. */
check("the phone bar's gaps leave the save state its whole word",
  /flex items-center gap-1\.5 sm:gap-3 h-full w-full/.test(editor) && /flex items-center gap-1\.5 sm:gap-3 shrink-0 pr-3/.test(editor) && /"md:hidden h-8 px-2\.5 rounded-lg"/.test(editor))

/*
  ROUND 10. Every sheet in the editor is the shared sheet, and the shared
  sheet rests the way the website builder's primed sheet does: a kept sheet
  waits below the screen at an opacity no eye can see, so the tap that opens
  it restyles nothing inside it. The editor's two questions are kept too.
*/
const bottomSheet = read("components/ui/bottom-sheet.tsx")
check("a kept sheet opens without restyling what is inside it, as the builder's primed sheet does",
  /const REST_OPACITY = 0\.0015/.test(bottomSheet) && !/visibility: "hidden"/.test(bottomSheet) && /aria-hidden=\{atRest \? true : undefined\}/.test(bottomSheet)
  && /pointerEvents: "auto",/.test(bottomSheet))
check("the editor's questions are kept sheets", /<BottomSheet isOpen=\{open\} onClose=\{onClose\} label=\{label\} hideFrom="md" keepMounted>/.test(editor))

/*
  ROUND 10, AUDIT FOLLOW-UPS (scratchpad AUDIT.md S1, S2, S4; scripts/check-onepage-shell.mjs
  ONLY=sections and ONLY=resttab measure them).
*/
const live = read("components/onepage/public-onepage.tsx")
const context = read("lib/onepage/context.tsx")
check("S1: Glass on a light page is ink glass, for the bell and the share button, on the live page and so in the preview",
  /export function pageIsLight\(/.test(live) && /const GLASS_ON_LIGHT_BELL = \{/.test(live) && /const GLASS_ON_LIGHT_SHARE = \{/.test(live)
  && (live.match(/onLight=\{pageIsLight\(safeTheme\)\}/g) ?? []).length === 2 && /const s = inkGlass \? GLASS_ON_LIGHT_BELL/.test(live) && /const s = inkGlass \? GLASS_ON_LIGHT_SHARE/.test(live))
check("S2: each Settings section's Save lights for its own changes only, against the page as last saved",
  /getSavedSettings: \(\) =>/.test(context) && /const getSavedSettings = useCallback/.test(context)
  && /const sectionUnsaved: Record</.test(settings) && /const saveRow = \(section: keyof typeof sectionUnsaved\) =>/.test(settings)
  && /footer=\{saveRow\("seo"\)\}/.test(settings) && /\{saveRow\(kind\)\}/.test(settings) && /\{saveRow\("verified"\)\}/.test(settings) && /\{saveRow\("basic"\)\}/.test(settings))
check("S3: a section not shown is inert (PillPanels)", /inert=\{p\.id !== state\.live\}/.test(pillTabs))
check("S4: a resting kept sheet is out of the tab order by content-visibility, set a frame after it rests and cleared in the open",
  /sheet\.style\.contentVisibility = "hidden"/.test(bottomSheet) && /if \(sheet\.style\.contentVisibility\) sheet\.style\.contentVisibility = ""\s*sizeUp\(sheet\)/.test(bottomSheet)
  && !/\.inert = (true|false)/.test(bottomSheet))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
