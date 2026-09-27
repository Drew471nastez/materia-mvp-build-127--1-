/**
 * ===========================================================================
 *  THE ONEPAGE'S NEWER BLOCKS, THE SCHEDULE, THE SENSITIVE LINK AND THE FONTS
 * ===========================================================================
 * Headings, FAQs, countdowns, maps and videos (components/onepage/extra-blocks)
 * are drawn by one component that the editor's preview and the live page both
 * call. A block can be scheduled, and a link can ask before it opens. The
 * fonts the Design tab offers are loaded on both surfaces (lib/onepage/fonts).
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { extraBlockHasContent, isBlockShown, isScheduledNow, scheduleLabel, videoSource } from "@/lib/onepage/extra-blocks"
import { ONEPAGE_FONTS, familyOf, onePageFontHref, onePageFontHrefs, onePageFontSampleHref } from "@/lib/onepage/fonts"
import { createDefaultBlock } from "@/lib/onepage/types"

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

function main() {
  const NOW = Date.parse("2026-09-25T12:00:00Z")
  const DAY = 86_400_000
  const iso = (t: number) => new Date(t).toISOString()

  // ═══════════════════════════════════════════════════════════════════════
  section("A scheduled block is on the page only between its times")
  // ═══════════════════════════════════════════════════════════════════════
  {
    check("no schedule, always on", isScheduledNow({}, NOW) && isScheduledNow({ schedule: null }, NOW) && isScheduledNow(null, NOW))
    check("before its start it is off", !isScheduledNow({ schedule: { start_at: iso(NOW + DAY) } }, NOW))
    check("after its start it is on", isScheduledNow({ schedule: { start_at: iso(NOW - DAY) } }, NOW))
    check("at its end it is off", !isScheduledNow({ schedule: { end_at: iso(NOW) } }, NOW))
    check("between both it is on", isScheduledNow({ schedule: { start_at: iso(NOW - DAY), end_at: iso(NOW + DAY) } }, NOW))
    check("a time that cannot be read never hides a block", isScheduledNow({ schedule: { start_at: "soon", end_at: "" } }, NOW))
    check("the row says when it starts", scheduleLabel({ schedule: { start_at: iso(NOW + DAY) } }, NOW)?.text.startsWith("Starts ") === true && scheduleLabel({ schedule: { start_at: iso(NOW + DAY) } }, NOW)?.live === false)
    check("when it ends", scheduleLabel({ schedule: { end_at: iso(NOW + DAY) } }, NOW)?.text.startsWith("Until ") === true)
    check("and that it has ended", scheduleLabel({ schedule: { end_at: iso(NOW - DAY) } }, NOW)?.text.startsWith("Ended ") === true)
    check("and nothing when there is no schedule", scheduleLabel({ schedule: { start_at: null, end_at: null } }, NOW) === null)
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("A video link is read for YouTube, Vimeo and TikTok, and nothing else")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const yt = (u: string) => videoSource(u)?.kind === "youtube" && videoSource(u)?.id === "dQw4w9WgXcQ"
    check("youtube.com/watch", yt("https://www.youtube.com/watch?v=dQw4w9WgXcQ"))
    check("with other parameters first", yt("https://youtube.com/watch?feature=share&v=dQw4w9WgXcQ"))
    check("youtu.be", yt("https://youtu.be/dQw4w9WgXcQ?si=abc"))
    check("shorts and live", yt("https://youtube.com/shorts/dQw4w9WgXcQ") && yt("https://www.youtube.com/live/dQw4w9WgXcQ"))
    check("vimeo", videoSource("https://vimeo.com/76979871")?.kind === "vimeo" && videoSource("https://vimeo.com/76979871")?.id === "76979871")
    check("tiktok", videoSource("https://www.tiktok.com/@scout2015/video/6718335390845095173")?.id === "6718335390845095173")
    check("a channel, a profile or nothing is not a video", videoSource("https://youtube.com/@andrew") === null && videoSource("https://www.tiktok.com/@andrew") === null && videoSource("") === null && videoSource(null) === null)
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("A new block starts with something to show, and an empty one leaves no gap")
  // ═══════════════════════════════════════════════════════════════════════
  {
    check("a new heading has a line", extraBlockHasContent(createDefaultBlock("heading")))
    check("a new FAQ has a question", extraBlockHasContent(createDefaultBlock("faq")))
    check("a new countdown counts to a week from now", extraBlockHasContent(createDefaultBlock("countdown")))
    check("an empty map and an empty video are left out", !extraBlockHasContent(createDefaultBlock("map")) && !extraBlockHasContent(createDefaultBlock("video")))
    check("a map with an address and a video with a link are drawn",
      extraBlockHasContent({ type: "map", data: { address: "Strada Lipscani 12, Bucharest", show_button: true } }) &&
      extraBlockHasContent({ type: "video", data: { url: "https://youtu.be/dQw4w9WgXcQ" } }))
    check("a heading of spaces is empty", !extraBlockHasContent({ type: "heading", data: { text: "   ", size: "medium", alignment: "center" } }))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("The editor's preview and the live page draw them the same way")
  // ═══════════════════════════════════════════════════════════════════════
  {
    /*
      THE PREVIEW IS THE LIVE PAGE NOW, IN A FRAME (components/onepage/
      preview-document.tsx), not a second drawing that called the same
      block component (phone-preview.tsx, which drifted everywhere else).
      Changed on purpose: what is held of "the preview" is held of the code
      it runs, the live page's, once the frame is seen to run it.
    */
    const frame = read("components/onepage/preview-document.tsx")
    const live = read("components/onepage/public-onepage.tsx")
    const framed = /<PublicOnePage onepage=\{page as never\} \/>/.test(frame) && /export \{ PhonePreview, MobilePreviewContent \} from "\.\/live-preview"/.test(read("components/onepage/phone-preview.tsx"))
    const preview = framed ? live : read("components/onepage/phone-preview.tsx")
    const cases = /case "heading":\s*case "faq":\s*case "countdown":\s*case "map":\s*case "video":\s*return <ExtraBlock block=\{block\}/
    check("the preview calls the one component (the live page's own, framed)", framed && cases.test(preview))
    check("and so does the live page", cases.test(live))
    check("the preview and the live page leave out blocks by one rule (the live page's, and the page is built by one function for both)",
      framed && /const isBlockVisible = \(block: any\): boolean => isBlockShown\(block\)/.test(live) &&
      /publicOnePageFromDraft\(onepage as never, \{ displayName: owner\.displayName, liveAvatarUrl: owner\.avatarUrl \}\)/.test(read("components/onepage/live-preview.tsx")))
    const on = (block: any) => isBlockShown({ enabled: true, ...block }, NOW)
    check("a link with no address, or only https://, is not on the page", !on({ type: "link_button", data: { url: "https://" } }) && !on({ type: "link_button", data: { url: "" } }) && on({ type: "link_button", data: { url: "https://storelib.com" } }))
    check("nor is a block that is off, off schedule, a one letter text or an image with no picture",
      !isBlockShown({ enabled: false, type: "divider", data: {} }, NOW) &&
      !on({ type: "divider", data: {}, schedule: { start_at: iso(NOW + DAY) } }) &&
      !on({ type: "text", data: { content: "a" } }) && on({ type: "text", data: { content: "Hi there" } }) &&
      !on({ type: "image", data: { images: [] } }))
    /* Moved on purpose to lib/onepage/public-shape.ts, which the route calls with the published copy. */
    const page = read("app/(marketing)/l/[slug]/page.tsx")
    check("a block that has not started is not sent to the browser at all",
      /publicOnePage\(onepage, \{\s*source: "published"/.test(page) && /blocks\.filter\(\(b\) => isScheduledNow\(b, now\)\)/.test(read("lib/onepage/public-shape.ts")))

    const module = read("components/onepage/extra-blocks.tsx")
    check("the blocks take the page's own button look", /export function themeButtonStyle\(theme: OnePageTheme\)/.test(module) && (module.match(/themeButtonStyle\(look\.theme\)/g) ?? []).length >= 3)
    check("a countdown reads the clock only in the browser, so the first drawing matches the server's", /const \[now, setNow\] = React\.useState<number \| null>\(null\)/.test(module))
    check("a video's player loads on the first press, not with the page", /\{playing \? \(\s*<iframe/.test(module) && /youtube-nocookie\.com\/embed\//.test(module))
    check("the editor's map waits for the typing to stop", /useSettled\(typed, 700, !!look\.preview\)/.test(module)
      && /<ExtraBlockPreviewContext\.Provider value=\{true\}>/.test(read("components/onepage/preview-document.tsx")))
    check("the FAQ opens by its own height", /grid-rows-\[1fr\]/.test(module) && /grid-rows-\[0fr\]/.test(module))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("The newsletter's field and its button are one control")
  // ═══════════════════════════════════════════════════════════════════════
  {
    /*
      Circled on a phone screenshot: Subscribe, and the box beside it.
      Measured at 390 by scripts/check-onepage-bar.mjs — both were 43px
      tall, a pixel under the 44px a thumb is given everywhere else, and
      the box's corners were a hardcoded rounded-lg against the button's
      theme radius (999 on Olive and Riso: a pill beside a square box).
      The padding the page already used from 640px is used at every width,
      and the box borrows the button's radius.
    */
    const live = read("components/onepage/public-onepage.tsx")
    const email = live.slice(live.indexOf('case "email_capture":'), live.indexOf('case "group":'))
    check("nothing in the newsletter block is 43px tall on a phone any more", !/py-2\.5 sm:py-3/.test(email) && (email.match(/py-3 text-sm bg-white\/90/g) ?? []).length === 4)
    check("and the field wears the button's corners, whatever the theme sets",
      !/rounded-lg text-sm bg-white\/90/.test(email) && (email.match(/borderRadius: emailButtonStyles\.borderRadius/g) ?? []).length === 4)
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("A sensitive link asks first, and then behaves exactly as before")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const live = read("components/onepage/public-onepage.tsx")
    const module = read("components/onepage/extra-blocks.tsx")
    check("the question is on the live page once", (live.match(/<SensitiveLinkQuestion \/>/g) ?? []).length === 1)
    check("every box a block is drawn in carries the mark, a group's included", (live.match(/data-sensitive-label=\{sensitiveLabel\((block|child)\)\}/g) ?? []).length === 4)
    check("only a link marked sensitive is marked", /if \(block\?\.type !== "link_button" \|\| !block\.data\?\.sensitive\) return undefined/.test(live))
    check("the press is held before the link's own code hears it", /document\.addEventListener\("click", onClick, true\)/.test(module) && /e\.preventDefault\(\)\s*e\.stopPropagation\(\)/.test(module))
    check("Continue presses the same thing again, let through, so the click count and the new tab still happen",
      /letThrough = target\s*target\.click\(\)/.test(module) && /if \(letThrough === target\) \{\s*letThrough = null\s*return/.test(module))
    check("it is an alert dialog, closed by Escape or Go back", /role="alertdialog"/.test(module) && /e\.key === "Escape"/.test(module) && />\s*Go back\s*</.test(module))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("The editor offers them and edits them")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const tab = read("components/onepage/tabs/links-tab.tsx")
    check("the Add sheet lists all five", ["heading", "faq", "countdown", "map", "video"].every((t) => tab.includes(`EXTRA_BLOCK_CATALOG.${t},`)))
    check("each has its own form", /return <ExtraBlockEditor block=\{block\} updateData=\{updateData\} \/>/.test(tab))
    check("the schedule and the sensitive switch sit under every block's settings but the header's",
      /const settingsWithExtras = \(\) => \(/.test(tab) && /block\.type !== "header" \? \(\s*<BlockExtras/.test(tab) && (tab.match(/\{settingsWithExtras\(\)\}|return settingsWithExtras\(\)/g) ?? []).length === 2)
    check("a block inside a group is not scheduled on its own", /scheduling=\{!updateBlockOverride\}/.test(tab))
    check("the new blocks are not offered inside a group", /const blockedInGroup = \[[^\]]*"heading", "faq", "countdown", "map", "video"\]/.test(tab))
    check("a block's row says when it is scheduled or sensitive", /<BlockBadges block=\{block\} \/>/.test(tab))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("The fonts the Design tab offers are loaded, in the editor and on the page")
  // ═══════════════════════════════════════════════════════════════════════
  {
    check("a CSS value is read for its family", familyOf("'Playfair Display', serif") === "Playfair Display" && familyOf("Inter") === "Inter" && familyOf(`"DM Sans", sans-serif`) === "DM Sans" && familyOf(null) === null)
    const href = onePageFontHref("Playfair Display")
    check("a family is asked for with the weights the blocks use", href === "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&display=swap", String(href))
    check("a family with one weight is asked for as it is", onePageFontHref("Bebas Neue") === "https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap")
    check("Lato is not asked for weights it does not have", onePageFontHref("Lato")?.includes("wght@400;700&") === true)
    check("a family not on the list is never requested", onePageFontHref("Comic Sans MS") === null && onePageFontHref("x&family=evil") === null && onePageFontHrefs({ font_family: "'x&family=evil', serif" }).length === 0)
    check("body and title, once each", onePageFontHrefs({ font_family: "'Poppins', sans-serif", title_font: "'Poppins', sans-serif" }).length === 1 && onePageFontHrefs({ font_family: "'Inter', sans-serif", title_font: "'Bebas Neue', sans-serif" }).length === 2)
    check("the default Inter is the real Inter now", onePageFontHrefs({ font_family: "Inter" })[0]?.includes("family=Inter:") === true)
    const sample = onePageFontSampleHref(["Inter", "Bebas Neue", "Default (Same as body)"])
    check("the font list's samples are one request cut to the letters of the names", sample !== null && /family=Inter&family=Bebas\+Neue&text=/.test(sample) && !sample.includes("Default"))

    const design = read("components/onepage/tabs/design-tab.tsx")
    const offered = new Set<string>()
    for (const m of design.matchAll(/(?:value|font_family|title_font): "'([^']+)'/g)) offered.add(m[1])
    const missing = [...offered].filter((f) => !Object.prototype.hasOwnProperty.call(ONEPAGE_FONTS, f))
    check("every family the Design tab and its templates name can be loaded", offered.size >= 30 && missing.length === 0, `missing: ${missing.join(", ")} (of ${offered.size})`)
    check("the font list draws its samples", /\{FONT_SAMPLE_HREF \? <link rel="stylesheet" href=\{FONT_SAMPLE_HREF\} \/> : null\}/.test(design))
    const live = read("components/onepage/public-onepage.tsx")
    /* Changed on purpose: both of the preview's layouts frame the live page (components/onepage/live-preview.tsx), which loads them. */
    const previewFrames = read("components/onepage/live-preview.tsx")
    check("the preview loads the theme's fonts, in both of its layouts",
      (previewFrames.match(/<LivePreviewFrame page=\{page\}/g) ?? []).length === 2 && /<PublicOnePage onepage=\{page as never\} \/>/.test(read("components/onepage/preview-document.tsx")))
    check("and the live page loads the same links", /<OnePageFonts theme=\{safeTheme\} \/>/.test(live))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}

main()
