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
import { readFileSync } from "node:fs"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { IdeasComeToLife, IDEAS_HEADING, IDEAS_MOTION, IDEAS_SLIDES, IDEAS_STYLES } from "@/components/marketing/home/ideas-come-to-life"
import { BUILDER_CSS, BUILDER_DURATION_MS, CommunityBuilderMock, DesignMock, NinaPage, OnePageEditorMock, WebsiteBuilderMock } from "@/components/marketing/home/showcase-mocks/builder-mocks"
import { BusinessCarousel, BUSINESS_HEADING, BUSINESS_SLIDES } from "@/components/marketing/home/business-carousel"
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
  business: "components/marketing/home/business-carousel.tsx",
  pages: "components/marketing/home/showcase-mocks/business-mocks.tsx",
  marquee: "components/marketing/product-marquee.tsx",
}
const src = Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, read(f)])) as Record<keyof typeof FILES, string>
/** What a reader can see: the source without its comments. */
const visible = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")

console.log("\nSee your ideas come to life: the heading flips with the slides")
{
  const html = renderToStaticMarkup(createElement(IdeasComeToLife))
  check("it starts on See your ideas come to life., then Full control over design.", IDEAS_SLIDES[0].heading === IDEAS_HEADING && IDEAS_HEADING === "See your ideas come to life." && IDEAS_SLIDES[1].heading === "Full control over design.")
  check("each slide has a heading of its own", new Set(IDEAS_SLIDES.map((s) => s.heading)).size === IDEAS_SLIDES.length && IDEAS_SLIDES.length === 4)
  check("one heading for assistive tech, the flipping lines hidden from it", new RegExp(`<h2[^>]*aria-label="${IDEAS_HEADING}"`).test(html) && /<span class="ideas-stack" aria-hidden="true">/.test(html))
  check("every slide's heading is drawn, the first one on", (html.match(/class="ideas-line"/g) ?? []).length === 4 && (html.match(/class="ideas-line" data-flip="on"/g) ?? []).length === 1)
  check("the flip is transform and opacity only, and still under reduced motion", /\.ideas-line\{[^}]*transition:transform [^}]*,opacity [^}]*\}/.test(src.ideas) && !/\.ideas-line[^{]*\{[^}]*transition:[^}]*(top|height|margin|filter)/.test(src.ideas) && /@media\(prefers-reduced-motion:reduce\)\{[^@]*\.ideas-line,\.ideas-subline\{transition:none!important;transform:none!important\}/.test(src.ideas))
}

console.log("\nThe previews: a carousel that drags, swipes and plays by itself")
{
  const html = renderToStaticMarkup(createElement(IdeasComeToLife))
  check("every editor is a slide in one rail, the loop with no copies", (html.match(/data-ideas-slide=""/g) ?? []).length === IDEAS_SLIDES.length && /class="ideas-rail"[^>]*aria-roledescription="carousel"/.test(html))
  check("moved by the rail motion of the gallery under the hero (drag, swipe, momentum, snap, keys, autoplay on the compositor)", /new RailMotion\(el, slides\(\), slides\(\), IDEAS_MOTION/.test(src.ideas) && IDEAS_MOTION.loop === true && IDEAS_MOTION.compositor === true)
  check("a finger scrolls the page up and down; sideways moves the rail", /\.ideas-rail\{[^}]*touch-action:pan-y pinch-zoom/.test(src.ideas))
  check("one slide in front for one scripted moment of its editor, then the next glides in", IDEAS_MOTION.autoplayIntervalMs > 6000 && IDEAS_MOTION.autoplayIntervalMs <= BUILDER_DURATION_MS && IDEAS_MOTION.autoplayStepMs >= 800)
  check("autoplay and the editors' animations stop off screen and in a background tab", /rail\.setVisible\(e\.intersectionRatio >= 0\.4\)/.test(src.ideas) && /visibilitychange/.test(src.ideas) && /data-mock-live=\{\(i === index && live\) \|\| undefined\}/.test(src.ideas))
  check("nothing animates before the section is seen", !/data-mock-live="/.test(html))
  check("dots to jump to a slide, each named", (html.match(/class="ideas-dot"/g) ?? []).length === 4 && IDEAS_SLIDES.every((s) => html.includes(`aria-label="${s.title}"`)))
  check("no timers of its own", !/setInterval|setTimeout/.test(src.ideas))
  check("its stylesheets are the frame, the builders and its own", IDEAS_STYLES.map((s) => s.href).join() === "w12-smk-frame,w12-smk-builder,w12-ideas")
}

console.log("\nOn a phone: the editors as on a computer, never a phone shaped frame")
{
  check("one drawing per editor, no separate phone drawing", !/bm-phone|bm-desk|wxm-|opm-|cbm-|StatusBar/.test(src.builders))
  check("a phone draws the same editors on a narrower design width", /@media \(max-width:767px\)\{\s*\.bm-frame>\.smk\{--w:640\}/.test(BUILDER_CSS) && /\.ideas-mock\{aspect-ratio:640\/836\}/.test(src.ideas))
}

console.log("\nThe community editor as it really is (components/community/creator/page-editor)")
{
  const html = renderToStaticMarkup(createElement(CommunityBuilderMock))
  for (const want of ["Edit page", "Name and introduction", "Cover and gallery", "About", "Links", "Join button", "Visibility and search", "Computer", "Phone", "As a visitor", "Published", "Unsaved changes", "Saved", "Tagline", "Short description", "What&#x27;s inside"])
    check(`it shows ${want}`, html.includes(want))
  check("no admin shell around it (the editor owns the screen)", !/Dashboard|Creator Page|Search posts|Save draft/.test(html))
  const words = visible(src.builders + src.pages + src.ideas + src.business)
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

console.log("\nWhat a store sells (was: Every business, one home)")
{
  const html = renderToStaticMarkup(createElement(BusinessCarousel))
  check("a new heading", (BUSINESS_HEADING as string) !== "Every business, one home." && !/one home/i.test(BUSINESS_HEADING) && new RegExp(`aria-label="${BUSINESS_HEADING}"`).test(html))
  check("the kinds of things a store sells, a line each", BUSINESS_SLIDES.length === 5 && BUSINESS_SLIDES.every((s) => s.line.length > 20 && s.line.length < 90))
  check("a vertical list of tabs, not a row of pills", /role="tablist" aria-orientation="vertical"/.test(html) && !/className="[^"]*smk-pills/.test(src.business))
  check("one product page at a time, drawn at one size for every screen", (html.match(/role="tabpanel"/g) ?? []).length === 1 && html.includes("aspect-ratio:640/520") && !/Mobile|Desktop/.test(src.pages.replace(/\/\*[\s\S]*?\*\//g, "")))
  check("pages change by a crossfade, still under reduced motion", /@keyframes biz-in\{from\{opacity:0\}\}/.test(src.business) && /@media\(prefers-reduced-motion:reduce\)\{\s*\.biz-slide\{animation:none!important;transition:none!important\}/.test(src.business))
  check("nothing moves inside the pages", !/@keyframes|animation:/.test(src.pages))
}

console.log("\nSecond pass: the website builder as it really is, without Ask Storelib")
{
  const html = renderToStaticMarkup(createElement(WebsiteBuilderMock))
  const design = renderToStaticMarkup(createElement(DesignMock))
  const words = Object.values(src).map(visible).join("\n")
  check("no Loose florals, no Brush and Bloom, anywhere in these sections", !/loose florals|brush (&amp;|&|and) bloom|\bbloom\b/i.test(words))
  check("the site is a real looking brand (Hearth & Hand, a sourdough course)", html.includes("Hearth &amp; Hand") && html.includes("Bake real sourdough at home."))
  check("no Storelib AI key beside Publish (no logo, no Ask Storelib) on either website builder slide", ![html, design].some((h) => /data-storelib-logo|bm-logo|wx-ask|Ask Storelib/.test(h)) && !/StorelibLogo|StorelibTile/.test(visible(src.builders)))
  check("the bar: Back, the name, Preview, the page pill, undo, redo, the inspector, Publish", ["Hearth &amp; Hand", "Preview", "Home", "Publish"].every((w) => html.includes(w)) && /class="wx-key wx-inspect"/.test(html))
  check("the sidebar's Header, Page and Footer groups with Add section in its raised key (tree-parts.tsx)", /Header<\/p>[\s\S]*Page<\/p>[\s\S]*Footer<\/p>/.test(html) && (html.match(/class="wx-add-key"/g) ?? []).length === 3 && (html.match(/class="wx-badge"/g) ?? []).length === 2)
  check("Theme's tab wears the Settings icon, as the editor's does", /<span>[^<]*<svg[^>]*lucide-settings[^>]*>[\s\S]*?<\/svg> Theme<\/span>/.test(html))
  check("the selected section's chip says Selected (sections/_shared.tsx)", (html.match(/<em>Selected<\/em>/g) ?? []).length === 2)
  check("Publish opens its own panel and puts the change live", ["Changes since published 2 days ago", "Website URL", "No security issues found", "Publish changes", "Publishing", "Published just now"].every((w) => html.includes(w)))
}

console.log("\nSecond pass: the OnePage is a real theme, a real person, the official marks")
{
  const page = renderToStaticMarkup(createElement(NinaPage))
  const editor = renderToStaticMarkup(createElement(OnePageEditorMock))
  const words = Object.values(src).map(visible).join("\n")
  check("Maya Okafor is gone, from every one of these files", !/Maya|Okafor|mayaruns|av-maya|mr-run\b/.test(words))
  check("Nina Sato's page, in the editor and in its phone", page.includes("Nina Sato") && editor.includes("Nina Sato"))
  check("on the Air theme (a cool grey page, white buttons rounded 14)", /\.np\{[^}]*background:#eef0f3/.test(BUILDER_CSS) && /\.np-btn\{[^}]*border-radius:calc\(14\*var\(--u\)\);background:#fff/.test(BUILDER_CSS))
  check("with the Hero header: the photo melts into the page by the OnePage's own mask", /\.np-photo\{[^}]*mask-image:linear-gradient\(to bottom,#000 0%,#000 46%/.test(BUILDER_CSS) && page.includes("/home/showcase/op-nina-hero.webp"))
  check("four social marks on the page, drawn from the official ones (Simple Icons), not lucide stand ins", (page.match(/<svg[^>]*role="img"/g) ?? []).length >= 4 && !/lucide-(instagram|youtube|music)/.test(page + editor))
  check("the Links tab's chips in each brand's own colour (Instagram's gradient, TikTok's echo, YouTube red, Spotify green)", editor.includes('fill="url(#bm-ig)"') && editor.includes("bm-tt-c") && /#ff0000/i.test(editor) && /#1ed760/i.test(editor))
  check("the email signup is still the block the editor switches on", page.includes("Letters from the road") && editor.includes("Email signup"))
}

console.log("\nSecond pass: a little less height, a pixel less rounding")
{
  check("the previews are a little shorter: 1280/752 on a computer (was 16/10), 640/836 on a phone (was 640/880)", /\.ideas-mock\{aspect-ratio:1280\/752;/.test(src.ideas) && /\.ideas-mock\{aspect-ratio:640\/836\}/.test(src.ideas))
  check("the slides' corners one pixel less (clamp 11 to 17, was 12 to 18)", /\.ideas-slide\{[^}]*border-radius:clamp\(11px,1\.3vw,17px\)/.test(src.ideas))
  check("the product page's stage and card one pixel less", /\.biz-stage\{[^}]*border-radius:clamp\(15px,1\.8vw,23px\)/.test(src.business) && /\.bp-card\{[^}]*border-radius:17u/.test(src.pages))
  check("no small print under these sections", !/class(Name)?="[^"]*(fine-?print|small-?print|-note|-foot)"/.test(src.ideas + src.business + src.marquee))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
