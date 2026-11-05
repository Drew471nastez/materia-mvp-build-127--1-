/**
 * ===========================================================================
 *  FIVE THINGS FROM ONE ROUND OF USING THE BUILDER ON A PHONE
 * ===========================================================================
 * 1. Two addresses, two things: `<name>.storelib.com` is the website,
 *    `storelib.com/<name>` is the creator's page. Nothing is "coming soon".
 * 2. The fonts a theme chooses are loaded, not only named.
 * 3. A half-open sheet can still be scrolled to the bottom.
 * 4. Create in the code editor shows that it is creating.
 * 5. The preview scroller heals itself: tests/canvas-scroll.test.ts.
 */
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { OFFERED_FAMILIES, chosenFamilies, fontStylesheetHref } from "@/lib/website-builder/font-link"
import { getWebsiteShareUrl, getWebsiteUrlDisplay } from "@/lib/url-helpers"

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
  // ═══════════════════════════════════════════════════════════════════════
  section("Two addresses, two things")
  // ═══════════════════════════════════════════════════════════════════════
  {
    check("the website is on the subdomain", getWebsiteShareUrl("AndrewRullz") === "https://andrewrullz.storelib.com")
    check("and is shown that way", getWebsiteUrlDisplay("andrewrullz") === "andrewrullz.storelib.com")

    const proxy = read("proxy.ts")
    check("a subdomain page with no AI site goes to the website route", /const isWebsite = \(!looksLikeFile \|\| seoFile\) && !\(await hasLiveAiSite\(subdomain\)\)/.test(proxy) && /`\/w\/\$\{subdomain\}/.test(proxy))
    check("but an asset request never pays that lookup", /const looksLikeFile = \/\\\.\[a-z0-9\]\{1,8\}\$\/i\.test\(pathname\)/.test(proxy))
    check("and a lookup that fails reads as the last answer, else no AI site, never an error page", /async function liveAiSiteAnswer[\s\S]*?return rememberedAnswer\(/.test(proxy) && /return \(await liveAiSiteAnswer\(slug\)\) === true/.test(proxy) && /ask\(\)\.catch\(\(\) => \(\{ value: false, failed: true \}\)\)/.test(proxy) && /if \(fresh\.failed\) return held \? held\.value : "unavailable"/.test(proxy) && /return \(await rememberedAnswer\(key, ask\)\) === true/.test(proxy)) /* rel3-leftovers SITE-8: nothing held is "unavailable" (a 503 on the subdomain); every boolean caller still reads it as no. */

    const apex = read("app/(storelib)/(marketing)/[sellername]/page.tsx")
    check("the apex path is the creator page", /from "\.\.\/u\/\[username\]\/page"/.test(apex) && /return await StorefrontPage\(/.test(apex))
    check("with the creator page's own metadata", /storefrontMetadata\(/.test(apex))
    check("and no website logic left in it", !/ThemePage|pageSections|store_theme_installs/.test(apex))

    // The front page and every sub-page hand their work to one renderer.
    const w = read("app/(site)/w/[username]/render-site.tsx")
    check("the website route serves from the cache", /* Changed on purpose (round AC): the market (currency) rides beside the language. */ /await publishedSiteByName\(username, pageKey, locale, market\)/.test(w))
    /**
     * AND THEN THE REDIRECT CAME OFF. A website's address and its creator's
     * page are two things; sending one to the other made them look like one
     * address with two spellings. The page it renders instead names the
     * address, says it is not published, and offers the creator page as a
     * link rather than as a destination.
     */
    /*
      AND NOW IT SAYS COMING SOON. The owner asked for what a shop shows
      before it opens: Coming soon and a box to be told when it does (the
      creator's Subscribers). Still on its own address, still no redirect,
      still the creator page as a link and not a destination.
    */
    check(
      "a site with nothing published stays on its own address and says so",
      /found\.kind === "unpublished"\) return <SiteNotPublished username=\{username\} displayName=\{found\.displayName\} creatorId=\{/.test(w) &&
        !/found\.kind === "unpublished"\) redirect\(/.test(w) &&
        !/Coming Soon/.test(w) &&
        ((page) =>
          /Coming soon/.test(page) &&
          /<ComingSoonSignup creatorId=\{creatorId\} \/>/.test(page) &&
          /See \{name\} on Storelib/.test(page) &&
          /const creator = `https:\/\/\$\{getMainDomain\(\)\}\/\$\{lower\}`/.test(page))(
            readFileSync(join(root, "app/(site)/w/[username]/not-published.tsx"), "utf8"),
          ),
    )
    check("a renamed creator's site follows them to the new subdomain, for good and to the same page",
      /found\.kind === "renamed"\) permanentRedirect\(pageUrl\(`https:\/\/\$\{found\.to\}\.\$\{getMainDomain\(\)\}`, pageKey\)\)/.test(w))
    check("its metadata reads published settings only", /* Changed on purpose (round AB): every language of the website. */ /const settings: ThemeSettingsValues = localizer \? [^\n]*: \(found\.site\.themeSettings \?\? \{\}\)/.test(w) && !/settingsRow\.draft_settings/.test(w))
    check("the preview path draws the shop too", /shopProducts\(admin as never, creatorId\)/.test(w) || (/const \{ owner, products, productCount \} = await ownerOf\(creatorId, installId, themeSettings\)/.test(w) && /renderWithSources\(owner\.sources, dressed\.sections, themeSettings, template, products,/.test(w)))

    for (const f of ["app/(site)/w/[username]/render-site.tsx", "app/(storelib)/(marketing)/[sellername]/page.tsx", "components/website-builder/theme/render-product.tsx"]) {
      check(`${f.split("/").slice(-2, -1)[0]}: no "Coming Soon"`, !/Coming Soon/.test(read(f)))
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("The fonts a theme chooses are loaded")
  // ═══════════════════════════════════════════════════════════════════════
  {
    check("the allow-list is the panel's own options", OFFERED_FAMILIES.has("Playfair Display") && OFFERED_FAMILIES.has("Inter") && OFFERED_FAMILIES.size >= 15)
    check("nothing chosen, nothing requested", fontStylesheetHref({}) === null && fontStylesheetHref(null) === null)
    const href = fontStylesheetHref({ font_heading: "Playfair Display", font_body: "DM Sans", font_accent: "" })
    check("the chosen families, and only those", href === "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&family=DM+Sans:wght@400;500;600;700&display=swap", href ?? "null")
    check("the same family twice is requested once", JSON.stringify(chosenFamilies({ font_heading: "Lora", font_body: "Inter", font_accent: "Lora" })) === JSON.stringify(["Lora", "Inter"]))
    /**
     * A URL built from a free string is a URL somebody else gets to write.
     * A family the panel does not offer requests nothing.
     */
    check("a family the panel does not offer is not requested", fontStylesheetHref({ font_heading: "Comic Sans MS", font_body: "x&family=evil" }) === null)
    check("and a string that is not a family is not either", chosenFamilies({ font_heading: 42 as never, font_body: "  " }).length === 0)

    const page = read("components/website-builder/theme/ThemePage.tsx")
    check("ThemePage renders the link beside the theme's stylesheet", /const fontHref = fontStylesheetHref\(/.test(page) && /\{fontHref && <link rel="stylesheet" href=\{fontHref\} \/>\}/.test(page))

    /** Every shipped section reads its font from the theme, never a literal. */
    const files = readdirSync(join(root, "themes/default/sections")).filter((f) => f.endsWith(".storelib"))
    // `(?!\\s*…)`: a lookahead after `\\s*` must re-state the space, or the
    // matcher backtracks to zero spaces and reads " var" as not "var".
    const literal = files.filter((f) => /font-family\s*:(?!\s*(var\(--|inherit\b))/.test(read(`themes/default/sections/${f}`)))
    check(`no shipped section hard-codes a font family (${files.length} files)`, literal.length === 0, literal.join(", "))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("A half-open sheet reaches its own bottom")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const sheet = read("components/website-builder/mobile-editor-sheet.tsx")
    const css = read("app/globals.css")
    check("the sheet says how much of itself is off screen", /sheet\.style\.setProperty\("--wb-sheet-hidden", fit \? "0px" : `\$\{Math\.max\(0, Math\.round\(y\)\)\}px`\)/.test(sheet))
    check("and the scroller gets exactly that much room after its content", /\[data-mobile-bottom-sheet\] \[data-sheet-scroll\]::after \{[\s\S]*?height: var\(--wb-sheet-hidden, 0px\);/.test(css))
    /**
     * A content-fit sheet measures its content to size itself. Room added
     * after the content would be measured, grow the sheet, add more room,
     * and never settle — so it gets none, and a spacer is used rather than
     * padding because the measurement reads padding.
     */
    check("a content-fit sheet gets no room, or it would never settle", /fit \? "0px"/.test(sheet))
    /**
     * THIS ASSERTION USED TO SAY THE OPPOSITE, AND IT WAS WRONG.
     *
     * It required the property to be written inside `writeTransform`,
     * "written in the same place as the transform, so it moves with the
     * finger". Two measurements say that was the bug rather than the fix.
     *
     * `--wb-sheet-hidden` feeds the HEIGHT of the spacer after the
     * scroller's content. A transform is compositor work; a height is not.
     * Written on every drag frame it invalidated layout on every drag
     * frame: scripts/check-sheet-frames.mjs counts 57 layouts across a
     * one-second drag with it, and 0 without.
     *
     * And "moves with the finger" is not something the user wanted. The
     * same probe, with the scroller pinned to the bottom before the drag:
     *
     *   every frame   spacer 354px → 614px, scrollTop 1442, max 1442 → 1702
     *   at rest only  spacer 354px,          scrollTop 1442, max 1442
     *
     * So the old behaviour un-pinned the content from the bottom by 260px
     * while the finger was still down. Dragging the sheet scrolled what was
     * inside it.
     *
     * The room still has to be right whenever the sheet is AT REST, which is
     * when it is read — and it comes to rest in two ways, a snap under a
     * finger and a move with no finger at all, so both paths are checked.
     */
    check("the room is set where the sheet comes to rest, not on every drag frame", (() => {
      const i = sheet.indexOf("const writeTransform")
      const j = sheet.indexOf("const layoutHiddenRoom")
      if (i < 0 || j < 0) return false
      /* The write lives in its own callback, not inside writeTransform. */
      const body = sheet.slice(i, sheet.indexOf("\n  }", i))
      return !body.includes("--wb-sheet-hidden")
    })())
    /**
     * AND NOT IN THE FRAME THE SNAP STARTS. These two pinned the write to
     * `applyTransformNow`, which is the call that STARTS a snap, so the first
     * frame of every release carried a layout of the scroller before the
     * compositor could begin the move. The write now waits for the move to
     * finish: a release writes it when its settle finishes, and a move with
     * no finger schedules it for when that move ends. Pinned both ways.
     */
    check("a snap under a finger brings it up to date once it has arrived", (() => {
      const i = sheet.indexOf("const applyTransformNow")
      const body = sheet.slice(i, sheet.indexOf("\n  }", i))
      const finish = sheet.slice(sheet.indexOf("const finishSettle"), sheet.indexOf("const beginSettle"))
      return i > 0 && !body.includes("layoutHiddenRoom(") && /layoutHiddenRoom\(targetY\)/.test(finish)
    })())
    check("and so does coming to rest with no finger on it", /React\.useEffect\(\(\) => \{\s*if \(drag\.current\.active \|\| settle\.current\.active\) return\s*scheduleRoom\(open \? settledY : closedY\)/.test(sheet) &&
      /const wait = motionUntil\.current - performance\.now\(\)/.test(sheet))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("Create says that it is creating")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const code = read("app/(storelib)/website-builder/code/[installId]/page.tsx")
    // The dialog it now lives in is roomier than the explorer column was, so
    // the spinner is drawn at the size the buttons around it are.
    check("the button carries a spinner and says so while the file is written", /\{creating && <Loader2 className="h-3 w-3 shrink-0 animate-spin" \/>\}/.test(code) && /\{creating \? "Creating" : "Create"\}/.test(code))
    check("and cannot be pressed twice", /disabled=\{!fileNameOf\(pendingAction\.path\)\.name \|\| creating\}/.test(code) && /if \(creating\) return/.test(code))
    check("the flag is cleared whatever the server says", /\} finally \{\s*setCreating\(false\)/.test(code))
  }

  // ════════════════════════════════════════════════════════════════════════
  section("The touch rules do not undo the things they are painted over")
  // ════════════════════════════════════════════════════════════════════════
  /**
   * Two `!important` rules under `@media (hover: none)` were reaching past
   * the components they were written for. Both were measured with
   * scripts/check-section-library.mjs, which now emulates a finger: before
   * the fix it reported the selected pill's background overridden by
   * `[data-mobile-bottom-sheet] button:hover` and the preview's scale
   * overridden by `.group *`.
   */
  {
    const css = read("app/globals.css")
    const editor = read("app/(storelib)/website-builder/editor/[installId]/page.tsx")

    // A tapped pill keeps :hover on a phone until something else is tapped,
    // so the row-flash suppressor landed on the one chip you had chosen.
    //
    // The chips were the first thing it ate and not the last: it took the
    // profile editor's Save button too, which is bg-primary with near-white
    // text, so clearing the background left nothing visible on the white
    // footer. The opt-out is automatic now, so the selector carries more
    // :not()s than the chip one. This pin still asks the question it always
    // asked, and lets them through.
    check(
      "the sheet's hover wipe skips the chips, and anything else with its own background",
      /\[data-mobile-bottom-sheet\] button:not\(\.wb-chip\)[^,{]*:hover/.test(css) &&
        /\[data-mobile-top-sheet\] button:not\(\.wb-chip\)[^,{]*:hover/.test(css),
    )
    check("and it still flattens everything else in a sheet", /background-color: transparent !important/.test(css))

    // The preview's scale is what makes a section drawn at 390 or 800 fit a
    // card a third of that, so it is not hover decoration.
    /*
      The selector has grown a second exception since — `.swiper-wrapper`,
      because Swiper renders its own strip and there is no prop that would put
      an attribute on it. So this matches the opt-out rather than the whole
      selector text, which is the part the preview cards depend on.
    */
    check(
      "a load-bearing transform survives touch",
      /\.group \*:not\(\[data-keep-transform\]\)/.test(css),
      "the preview's scale is what makes a section drawn at 800px fit a card a third of that",
    )
    check("and its transitions are still killed like the rest", /\.group \*\[data-keep-transform\] \{\s*transition-property: none !important;/.test(css))
    /* One preview box now, shared by the phone's sheet and the computer's dialog (section-library.tsx). */
    const library = read("components/website-builder/editor/section-library.tsx")
    check("the preview box claims its transform", /data-keep-transform/.test(library) && !/data-keep-transform/.test(editor))

    // The state a stylesheet, a test and a screen reader can all read.
    check("the selected chip says so in the DOM, not only in a class", /data-on=\{on \? "true" : "false"\}/.test(library) && /aria-pressed=\{on\}/.test(library))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}

main()
