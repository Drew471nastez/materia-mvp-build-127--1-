/**
 * ===========================================================================
 *  HOME, LANDING ROUND: IDEAS, POSSIBILITIES AND WHAT A STORE SELLS
 * ===========================================================================
 * components/marketing/home/ideas-come-to-life.tsx (+ showcase-mocks/builder-mocks.tsx),
 * components/marketing/product-marquee.tsx, components/marketing/home/business-carousel.tsx
 * (+ showcase-mocks/business-mocks.tsx).
 *
 * The owner: the heading of "See your ideas come to life." flips with the
 * slides ("Full control over design." and on) over a smooth autoplay
 * carousel that drags and swipes; on phones the same editors as on a
 * computer, never phone shaped frames; the community editor as it really
 * is, without the typo; no florals and no Golden Hour presets anywhere;
 * Unlimited possibilities in two rows, not three; "every business one home
 * at all, please look at something else"; less "fans".
 */
import { existsSync, readFileSync } from "node:fs"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
/* Changed on purpose (landing round 4): the editors are behind thin pill tabs again (no carousel), the heading takes turns on its own clock, one community drawn inside, a merch store and a LUT pack (tests/home-landing-topb4.test.ts pins the rest). */
import { IdeasComeToLife, IDEAS_HEADING, IDEAS_HEADINGS, IDEAS_TABS, IDEAS_STYLES } from "@/components/marketing/home/ideas-come-to-life"
import { BUILDER_CSS, BUILDER_DURATION_MS, CommunityMock, DesmondPage, OnePageEditorMock, WebsiteBuilderMock } from "@/components/marketing/home/showcase-mocks/builder-mocks"
/* Changed on purpose (landing round 7): "One store for everything you sell" (business-carousel and its business-mocks) is off the home page and deleted, so nothing of it is read here. */
import { MARQUEE_ROWS, ProductMarquee } from "@/components/marketing/product-marquee"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail === undefined ? "" : ` ${JSON.stringify(detail)}`}`)
  }
}
const read = (p: string) => readFileSync(p, "utf8")
const FILES = {
  ideas: "components/marketing/home/ideas-come-to-life.tsx",
  builders: "components/marketing/home/showcase-mocks/builder-mocks.tsx",
  marquee: "components/marketing/product-marquee.tsx",
}
const src = Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, read(f)])) as Record<keyof typeof FILES, string>
/** What a reader can see: the source without its comments. */
const visible = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")

/* Changed on purpose (landing round 4): the heading changes by itself on its own CSS loop, and the editors sit behind thin pill tabs again, as before the carousel. */
console.log("\nSee your ideas come to life: the heading changes by itself, thin pill tabs")
{
  const html = renderToStaticMarkup(createElement(IdeasComeToLife))
  check("it starts on See your ideas come to life., then A drag and drop editor.", IDEAS_HEADINGS[0] === IDEAS_HEADING && IDEAS_HEADING === "See your ideas come to life." && IDEAS_HEADINGS[1] === "A drag and drop editor.")
  check("one heading for assistive tech, the lines hidden from it", new RegExp(`<h2[^>]*aria-label="${IDEAS_HEADING}"`).test(html) && /<span class="ideas-stack" aria-hidden="true">/.test(html))
  check("every heading is drawn", (html.match(/class="ideas-line"/g) ?? []).length === IDEAS_HEADINGS.length)
  check("the flip is still under reduced motion", /@media\(prefers-reduced-motion:reduce\)\{[^@]*\.ideas-line\{animation:none!important\}/.test(src.ideas))
  check("a tab for each editor, each named", (html.match(/class="ideas-tab"/g) ?? []).length === IDEAS_TABS.length && IDEAS_TABS.every((s) => html.includes(`<span>${s.title}</span>`)))
  /* Changed on purpose (landing round 15): each tab has its own moment's length (the website builder's edit is longer), read from the tab the clock is on. */
  check("one scripted moment per tab, then the next", /animationDuration: `\$\{IDEAS_TABS\[t\.index\]\.ms\}ms`/.test(src.ideas) && BUILDER_DURATION_MS > 6000 && IDEAS_TABS.every((s) => s.ms > 6000))
  check("autoplay and the editors' animations stop off screen and in a background tab", /useAutoTabs\(/.test(src.ideas) && /data-mock-live=\{\(state === "active" && t\.live\) \|\| undefined\}/.test(src.ideas))
  check("nothing animates before the section is seen", !/data-mock-live="/.test(html))
  check("no timers of its own", !/setInterval|setTimeout/.test(src.ideas))
  check("its stylesheets are the frame, the pills' clock, the builders and its own", IDEAS_STYLES.map((s) => s.href).join() === "w12-smk-frame,w12-smk-pills,w12-smk-builder,w12-ideas")
}

console.log("\nOn a phone: the editors as on a computer, never a phone shaped frame")
{
  check("one drawing per editor, no separate phone drawing", !/bm-phone|bm-desk|wxm-|opm-|cbm-|StatusBar/.test(src.builders))
  /* Changed on purpose (landing round 4, the owner: on phones show the editors exactly as on desktop): one design width at every size, the picture only smaller. */
  check("a phone draws the same editors at the same design width", /\.bm-frame>\.smk\{--w:1280\}/.test(BUILDER_CSS) && !/max-width:767px/.test(BUILDER_CSS) && /\.ideas-mock\{aspect-ratio:1280\/752;/.test(src.ideas))
}

/* Changed on purpose (landing round 4, the owner: one community, as it is, inside the community): the member frame of components/community/member, not the page editor. */
console.log("\nThe community as it really is inside (components/community/member)")
{
  const html = renderToStaticMarkup(createElement(CommunityMock))
  for (const want of ["Community", "Learn", "Calendar", "Members", "Leaderboards", "About", "Online", "Admins", "Upcoming event", "Share something...", "Pinned"])
    check(`it shows ${want}`, html.includes(want))
  check("no admin shell around it", !/Dashboard|Creator Page|Save draft/.test(html))
  const words = visible(src.builders + src.ideas)
  check("no misspellings the owner saw (bisqued and friends)", !/\bbisqued\b|\brecieve|\bseperate|\boccured|\bdefinately/i.test(words))
}

console.log("\nNo florals, no Golden Hour presets, less fans")
{
  const words = Object.values(src).map(visible).join("\n")
  check("no florals or flowers", !/floral|flower|bouquet|petal|Brush &amp; Bloom|bb-(hero|bouquet|palette|brushes|brush)\b/i.test(words))
  check("no Golden Hour presets", !/golden|Saltlight|sl-(coast|hero|cove|desert|lake|tokyo)\b/i.test(words))
  check("no fans", !/\bfans?\b/i.test(words))
  check("no banned words", !/\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform your|passive income)\b/i.test(words.replace(/transform:[^;}]*/g, "")))
  check("no em dashes in the copy", !/—/.test(words))
}

console.log("\nUnlimited possibilities: two rows")
{
  const html = renderToStaticMarkup(createElement(ProductMarquee))
  check("two rows, one left and one right", MARQUEE_ROWS.length === 2 && (html.match(/class="um-row"/g) ?? []).length === 2 && MARQUEE_ROWS.map((r) => r.direction).join() === "left,right")
  check("no third row in the source", !/ROW_3/.test(src.marquee))
}

console.log("\nWhat a store sells: gone from the page (landing round 7)")
{
  /* Changed on purpose (landing round 7): "One store for everything you sell" (business-carousel and its business-mocks) is off the home page and deleted, so nothing of it is read here. */
/* Changed on purpose (landing round 8): the owner, "Keep the One store for everything you sell section, of course": it is back, redesigned, after the ideas section (tests/home-landing-r8-business.test.ts pins it). */
  check("the section and its product pages are back", existsSync("components/marketing/home/business-carousel.tsx") && existsSync("components/marketing/home/showcase-mocks/business-mocks.tsx"))
}

/* Changed on purpose (landing round 4, the owner: a merch store with tees and caps, no sourdough; the Design slide went with the carousel). */
console.log("\nSecond pass: the website builder as it really is, without Ask Storelib")
{
  const html = renderToStaticMarkup(createElement(WebsiteBuilderMock))
  const words = Object.values(src).map(visible).join("\n")
  check("no Loose florals, no Brush and Bloom, anywhere in these sections", !/loose florals|brush (&amp;|&|and) bloom|\bbloom\b/i.test(words))
  // Changed on purpose (landing round 6): "a more simple and clean merch brand": Plain Weather, a small apparel label.
  // Changed on purpose (landing round 8): the owner wanted the merch brand "more bold, more colorful, more funky, like a real Storelib store".
  // Changed on purpose (landing round 12): the owner dropped the earlier builder example entirely; the first site is their own GodBless store (tests/home-landing-r12-top.test.ts).
  // Changed on purpose (landing round 13): the owner asked for an accurate website builder example; GodBless is replaced by their Materia Steez theme (SteezSite), pinned in tests/home-landing-r13-ideas.test.ts.
  check("the site is a real looking brand (Steez, then loudlib)", html.includes("Steez") && html.includes("Summer Madness") && html.includes("loudlib"))
  check("no Storelib AI key beside Publish (no logo, no Ask Storelib)", !/data-storelib-logo|bm-logo|wx-ask|Ask Storelib/.test(html) && !/StorelibLogo|StorelibTile/.test(visible(src.builders)))
  check("the bar: Back, the name, Preview, the page pill, undo, redo, the inspector, Publish", ["Steez", "Preview", "Home", "Publish"].every((w) => html.includes(w)) && /class="wx-key wx-inspect"/.test(html))
  check("the sidebar's Header, Page and Footer groups with Add section in its raised key (tree-parts.tsx)", /Header<\/p>[\s\S]*Page<\/p>[\s\S]*Footer<\/p>/.test(html) && (html.match(/class="wx-add-key"/g) ?? []).length === 6 && (html.match(/class="wx-badge"/g) ?? []).length === 6) /* Changed on purpose (landing round 13): one tree per site (Steez, loudlib), each with two header rows and the footer. */
  check("Theme's tab wears the Settings icon, as the editor's does", /<span>[^<]*<svg[^>]*lucide-settings[^>]*>[\s\S]*?<\/svg> Theme<\/span>/.test(html))
// Changed on purpose (landing round 11): two sites in the canvas, each with its two rings.
  // Changed on purpose (landing round 14): the builder now edits one heading per site, so one ring per site (tests/home-landing-r14-ideas.test.ts).
  check("the selected section's chip says Selected (sections/_shared.tsx)", (html.match(/<em>Selected<\/em>/g) ?? []).length === 2)
  check("Publish opens its own panel and puts the change live", ["Changes since published 2 days ago", "Website URL", "No security issues found", "Publish changes", "Publishing", "Published just now"].every((w) => html.includes(w)))
}

/* Changed on purpose (landing round 4, the owner: a new creator who sells a LUT pack, on a real Storelib OnePage theme): Desmond Ayo on Ember. */
console.log("\nSecond pass: the OnePage is a real theme, a real person, the official marks")
{
  const page = renderToStaticMarkup(createElement(DesmondPage))
  const editor = renderToStaticMarkup(createElement(OnePageEditorMock))
  const words = Object.values(src).map(visible).join("\n")
  check("Maya Okafor is gone, from every one of these files", !/Maya|Okafor|mayaruns|av-maya|mr-run\b/.test(words))
  check("Desmond Ayo's page, in the editor and in its phone", page.includes("Desmond Ayo") && editor.includes("Desmond Ayo"))
  check("on the Ember theme (deep brown, amber outlined pills)", /\.dp\{[^}]*#1b1612/.test(BUILDER_CSS) && /\.dp-btn\{[^}]*#f6b062/.test(BUILDER_CSS))
  check("four social marks on the page, drawn from the official ones (Simple Icons), not lucide stand ins", (page.match(/<svg[^>]*role="img"/g) ?? []).length >= 4 && !/lucide-(instagram|youtube|music)/.test(page + editor))
  check("the Links tab's chips in each brand's own colour (Instagram's gradient, TikTok's echo, YouTube red)", editor.includes('fill="url(#bm-ig)"') && editor.includes("bm-tt-c") && /#ff0000/i.test(editor))
  check("the email signup is still the block the editor switches on", page.includes("Grade notes") && editor.includes("Email signup"))
}

console.log("\nSecond pass: a little less height, a pixel less rounding")
{
  /* Changed on purpose (landing round 4): the computer's shape on every screen, and the panel of the tabs in place of the carousel's slide. */
  check("the previews are a little shorter: 1280/752 (was 16/10), on every screen", /\.ideas-mock\{aspect-ratio:1280\/752;/.test(src.ideas))
  /* Changed on purpose (landing round 9): the corners are the one frame's that holds every panel. */
  check("the panels' corners one pixel less (up to 17, was 18)", /\.ideas-frame\{[^}]*border-radius:clamp\(9px,1\.3vw,17px\)/.test(src.ideas))
  /* Changed on purpose (landing round 7): "One store for everything you sell" (business-carousel and its business-mocks) is off the home page and deleted, so nothing of it is read here. */
  check("no small print under these sections", !/class(Name)?="[^"]*(fine-?print|small-?print|-note|-foot)"/.test(src.ideas + src.marquee))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
