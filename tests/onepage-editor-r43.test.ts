/**
 * ===========================================================================
 *  ROUND 43: THE ONEPAGE EDITOR'S SHEETS, FOOT, STATS, HEADER AND WINDOWS
 * ===========================================================================
 * The font sheet as tall as its list (three quarters at most); a block that
 * is off fades its row, never its controls; Remove's question as one
 * compact line; a block's stats with the period as a popover and a way to
 * Analytics; the header's type and picture frame on the theme; the cover's
 * ring that follows the picture when the header is Left; one hold for every
 * window over the live page that keeps the scrollbar's room.
 *
 * scripts/check-onepage-editor-r43.mjs measures them in headless Chromium.
 *
 * Run: npx tsx tests/onepage-editor-r43.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  AVATAR_BORDER_DEFAULT,
  avatarBorderColor,
  avatarBorderWidth,
  avatarLook,
  avatarPx,
  avatarRadius,
  bioSizeClass,
  bioTypeStyle,
  titleSizeClass,
  titleTypeStyle,
} from "@/lib/onepage/header-style"
import { blockAnalyticsHref, blockReportOf } from "@/lib/onepage/analytics-href"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`) }
}
function section(t: string) { console.log(`\n${t}`) }
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, "")

function main() {
  const design = read("components/onepage/tabs/design-tab.tsx")
  const tab = read("components/onepage/tabs/links-tab.tsx")
  const foot = read("components/onepage/block-remove.tsx")
  const live = read("components/onepage/public-onepage.tsx")
  const picker = read("components/app/date-range-picker.tsx")
  const hold = read("lib/onepage/page-hold.ts")
  const checkout = read("components/checkout/checkout-window.tsx")
  const css = read("app/globals.css")

  section("1. The font sheet")
  {
    check("no fixed height: as tall as its list, three quarters of the screen at most", /maxHeight=\{FONT_SHEET_MAX\}/.test(design) && /FONT_SHEET_MAX = "min\(75dvh, 640px\)"/.test(design) && !/height="min\(80dvh, 640px\)"/.test(design))
    check("a search keeps a few rows of room", /phone && query\.trim\(\) \? \{ minHeight: FONT_SHEET_SEARCH_ROOM \}/.test(design))
    check("rows are 56px on a phone", /phone \? "min-h-\[56px\] py-1\.5" : "min-h-\[52px\]"/.test(design))
  }

  section("2. The name and the bio, as type")
  {
    const plain = { text_color: "#1a1a2e" }
    check("nothing chosen writes no style (an old page's markup is unchanged)", Object.keys(titleTypeStyle(plain)).length === 0 && Object.keys(bioTypeStyle(plain)).length === 0)
    const t = titleTypeStyle({ title_weight: 500, title_tracking: "wide", title_case: "upper" })
    check("weight, spacing and capitals for the name", t.fontWeight === 500 && t.letterSpacing === "0.06em" && t.textTransform === "uppercase", JSON.stringify(t))
    const b = bioTypeStyle({ bio_weight: 600, bio_tracking: "tight" })
    check("and for the bio", b.fontWeight === 600 && b.letterSpacing === "-0.02em" && !b.textTransform, JSON.stringify(b))
    check("a weight that is not offered falls back", Object.keys(titleTypeStyle({ title_weight: 650 })).length === 0)
    check("Default and Large are the classes the page always drew", titleSizeClass({}, false, false) === "text-[29px] sm:text-[33px]" && titleSizeClass({ title_size: "large" }, false, true) === "text-[39px]" && titleSizeClass({}, true, true) === "text-[31px]")
    check("Small is one step down", titleSizeClass({ title_size: "small" }, false, false) === "text-[25px] sm:text-[28px]")
    check("the bio's default is what both headers drew", bioSizeClass({}, false, true) === "text-sm sm:text-base" && bioSizeClass({}, true, true) === "text-base" && bioSizeClass({ bio_size: "large" }, false, false) === "text-[16px] sm:text-[18px]")
    check("the page and the hero both use them", (live.match(/titleSizeClass\(theme as never, (true|false), isDesktop\)/g) ?? []).length === 2 && (live.match(/\.\.\.titleTypeStyle\(theme as never\)/g) ?? []).length === 2 && (live.match(/\.\.\.bioTypeStyle\(theme as never\)/g) ?? []).length === 2)
    check("the Design tab sets them under Text", /<HeaderTypeSections \/>/.test(design) && /which="title"/.test(design) && /which="bio"/.test(design) && /tt\("Letter spacing"\)/.test(design) && /tt\("Capitals"\)/.test(design))
    check("a logo keeps its own size control beside it", /tt\("Logo size"\)/.test(design) && !/label=\{tt\("Title size"\)\}/.test(design))
  }

  section("3 and 4. An off block, and its foot")
  {
    check("the card itself is never faded", !/!block\.enabled && "opacity-50",\n      \)\}/.test(tab) && /data-block-off=\{block\.enabled \? undefined : ""\}/.test(tab))
    check("its picture and name are", (tab.match(/!block\.enabled && "opacity-50"/g) ?? []).length === 3 && (tab.match(/!child\.enabled && "opacity-50"/g) ?? []).length === 2)
    check("Remove's question is one line of 32px keys", /const confirmKey = cn\(\s*"inline-flex h-8/.test(foot) && !/min-h-\[64px\]/.test(foot) && /"inline-flex h-8 items-center gap-1\.5 rounded-\[9px\] px-2\.5 text-\[13px\]/.test(foot))
    check("the lines under Archive and Delete are their titles now", /title=\{tt\("Off the page, back any time"\)\}/.test(foot) && /title=\{tt\("Gone for good"\)\}/.test(foot) && /title=\{keep\.line\}/.test(foot))
  }

  section("5. Windows over the live page")
  {
    check("one counted hold that keeps the scrollbar's room", /holds\+\+/.test(hold) && /setProperty\("scrollbar-gutter", "stable"\)/.test(hold) && /if \(gap > 0\)/.test(hold))
    check("the checkout window uses it, not overflow alone", /return holdPage\(\)/.test(checkout) && !/html\.style\.overflow = "hidden"/.test(code(checkout)))
    check("a Radix lock is followed, and its own margin not added twice", /useEffect\(\(\) => followDialogLocks\(\), \[\]\)/.test(live) && /html\[data-op-hold\] body\[data-scroll-locked\] \{ overflow: visible !important; margin-right: 0 !important; \}/.test(css))
    /* Changed on purpose (round AL): Calendly's own pop-up is gone; it opens in the block sheet, which keeps the page still with its scrollbar (components/onepage/block-sheet useStillPage). */
    /* Changed on purpose (round AN): music and a PDF open in the block sheet too, so the free checkout is the one centred window left for useHeldPage. */
    check("the centred windows hold the page on a computer", /useHeldPage\(isPhone === false && quickCheckoutModalOpen/.test(live) && !/showCalendlyModal|spotifyModalOpen|pdfModalData/.test(live) && /* Round AS: held while the sheet is up, not while kept hidden. */ /useStillPage\((true|!kept), rootRef\)/.test(read("components/onepage/block-sheet.tsx")))
  }

  section("6. A block's stats")
  {
    check("the period is a popover over the stats, not inline", /<DateRangePicker value=\{statsPeriod\} onChange=\{setStatsPeriod\} today=\{statsToday\} overlay \/>/.test(tab) && /if \(phone && !overlay\)/.test(picker) && /data-drp-overlay/.test(picker))
    check("See in Analytics, through the router", /<NextLink\s+href=\{blockAnalyticsHref\(statsPeriod/.test(tab) && /tt\("See in Analytics"\)/.test(tab))
    check("to the OnePage's Top links on the same period", blockAnalyticsHref({ preset: "last_7_days", start: "2026-10-22", end: "2026-10-28" } as never, "clicks") === "/app/analytics?property=onepage&report=links")
    check("a custom period goes with it", blockAnalyticsHref({ preset: "custom", start: "2026-10-01", end: "2026-10-10" } as never, "clicks") === "/app/analytics?property=onepage&range=custom&from=2026-10-01&to=2026-10-10&report=links")
    check("a form's stats open Subscribers", blockReportOf("signups") === "subscribers" && /report=subscribers/.test(blockAnalyticsHref(null, "signups")))
  }

  section("7. The picture's frame")
  {
    check("unset: medium, round, a 1px ring in the text colour at an eighth", avatarPx({}, false) === 114 && avatarPx({}, true) === 121 && avatarRadius({}) === "9999px" && AVATAR_BORDER_DEFAULT === 1 && avatarBorderWidth({}) === 1 && avatarBorderColor({ text_color: "#1a1a2e" }) === "#1a1a2e20")
    check("sizes, shapes and corners", avatarPx({ avatar_size: "large" }, false) === 140 && avatarPx({ avatar_size: "small" }, true) === 94 && avatarRadius({ avatar_shape: "square" }) === "0px" && avatarRadius({ avatar_shape: "rounded", avatar_radius: 20 }) === "20px" && avatarRadius({ avatar_shape: "rounded" }) === "24px")
    check("no ring, and a ring of the creator's colour", avatarBorderWidth({ avatar_border_width: 0 }) === 0 && avatarBorderColor({ avatar_border_color: "#ff0000" }) === "#ff0000" && avatarBorderWidth({ avatar_border_width: 40 }) === 8)
    check("a colour that is not one is not written", avatarBorderColor({ avatar_border_color: "red;background:url(x)", text_color: "#000000" }) === "#00000020")
    check("one look for the picture, its glow and its ring", /const look = avatarLook\(theme as never, isDesktop\)/.test(live) && (live.match(/borderRadius: look\.radius/g) ?? []).length >= 5 && avatarLook({}, false).size === 114)
    check("the Design tab sets them", /<AvatarFrameSection \/>/.test(design) && /tt\("Corner radius"\)/.test(design) && /tt\("Border colour"\)/.test(design) && /emptyLabel=\{tt\("Theme"\)\}/.test(design))
  }

  section("8. The cover's ring follows the picture")
  {
    check("no circle of its own, centred under the cover", !/absolute left-1\/2 -translate-x-1\/2 rounded-full/.test(live))
    check("it is the picture's shadow in the page's colour", /boxShadow: cover && theme\.background_type === "solid" && theme\.background_color \? `0 0 0 4px \$\{theme\.background_color\}` : undefined/.test(live))
  }

  section("Words")
  {
    const files = [foot, hold, read("lib/onepage/header-style.ts"), read("lib/onepage/analytics-href.ts"), read("scripts/check-onepage-editor-r43.mjs")]
    const banned = /\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform your)\b/i
    check("no AI words in the new files", !files.some((s) => banned.test(code(s))))
    check("no em dashes in the new files", ![foot, hold, read("lib/onepage/header-style.ts"), read("lib/onepage/analytics-href.ts")].some((s) => /—/.test(s)))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}

main()
