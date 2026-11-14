/**
 * ===========================================================================
 *  HOME, LANDING ROUND 4: IDEAS, ONE STORE, CREATORS
 * ===========================================================================
 * components/marketing/home/ideas-come-to-life.tsx (+ showcase-mocks/builder-mocks.tsx),
 * business-carousel.tsx (+ showcase-mocks/business-mocks.tsx), creators-carousel.tsx.
 *
 * The owner, round 4:
 *   - "See your ideas come to life": the pill tabs of before (thin, not fat),
 *     the website builder, the OnePage editor and the community; a heading
 *     that changes by itself ("A drag and drop editor" and so on) over a line
 *     about no code; on phones the editors as on a computer; a merch store
 *     (tees and caps), no sourdough; a creator selling a LUT pack on a real
 *     OnePage theme; one community only, drawn as it is inside.
 *   - "One store for everything you sell": the section holds still while the
 *     scroll steps through digital, physical, courses, communities and
 *     bookings, then lets go; it reads on white; new examples, a colourful
 *     physical product.
 *   - "Storelib is for creators": the button not solid purple; new pictures
 *     for agencies, YouTubers, musicians and educators.
 */
import { existsSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { IdeasComeToLife, IDEAS_HEADING, IDEAS_HEADINGS, IDEAS_STYLES, IDEAS_SUB, IDEAS_TABS } from "@/components/marketing/home/ideas-come-to-life"
import { BUILDER_CSS, CommunityMock, DesmondPage, PlainWeatherSite, OnePageEditorMock, WebsiteBuilderMock } from "@/components/marketing/home/showcase-mocks/builder-mocks"
import { BusinessCarousel, BUSINESS_SLIDES, BUSINESS_STYLES } from "@/components/marketing/home/business-carousel"
import { BUSINESS_MOCK_CSS } from "@/components/marketing/home/showcase-mocks/business-mocks"
import { CreatorsCarousel, CREATORS, CREATORS_CSS } from "@/components/marketing/home/creators-carousel"

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
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 600)}`}`)
  }
}
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")
const rule = (css: string, selector: string) => {
  const at = css.indexOf(`${selector}{`)
  return at < 0 ? "" : css.slice(at, css.indexOf("}", at) + 1)
}
const src = {
  ideas: read("components/marketing/home/ideas-come-to-life.tsx"),
  builders: read("components/marketing/home/showcase-mocks/builder-mocks.tsx"),
  business: read("components/marketing/home/business-carousel.tsx"),
  pages: read("components/marketing/home/showcase-mocks/business-mocks.tsx"),
  creators: read("components/marketing/home/creators-carousel.tsx"),
}
const ideasCss = IDEAS_STYLES.find((s) => s.href === "w12-ideas")?.css ?? ""
const bizCss = BUSINESS_STYLES.find((s) => s.href === "w12-biz")?.css ?? ""
const ideas = renderToStaticMarkup(createElement(IdeasComeToLife))

console.log("\n── See your ideas come to life: tabs (round 6: pills again) ──")
check("three tabs: the website builder, the OnePage editor, the community", IDEAS_TABS.map((t) => t.title).join() === "Website builder,OnePage editor,Community")
check("real tabs with their names written out", (ideas.match(/role="tab"/g) ?? []).length === 3 && IDEAS_TABS.every((t) => ideas.includes(`<span>${t.title}</span>`)))
check("the tabs sit above the picture", ideas.indexOf('class="ideas-tabs"') > 0 && ideas.indexOf('class="ideas-tabs"') < ideas.indexOf('class="ideas-stage"'))
const tab = rule(ideasCss, ".ideas-tab")
// Changed on purpose (landing round 6): the owner wants the tabs "with pill shapes like how it was before"; tests/home-landing-r6-ideas.test.ts pins them.
check("thin pill tabs, as in round 4", /border-radius:999px/.test(tab) && /height:30px/.test(tab))
check("a picture changes by a crossfade, no carousel to drag", /@keyframes ideas-in\{from\{opacity:0\}\}/.test(ideasCss) && !/RailMotion|rail-motion/.test(code(src.ideas)))
check("autoplay pauses off screen, in a hidden tab and under the pointer (use-auto-tabs)", /useAutoTabs\(/.test(src.ideas) && /\{\.\.\.t\.hoverProps\}/.test(src.ideas) && /data-mock-live=\{\(state === "active" && t\.live\) \|\| undefined\}/.test(src.ideas))
check("nothing animates before the section is seen", !/data-mock-live="/.test(ideas))

console.log("\n── The heading changes by itself ──")
check("three headings, See your ideas come to life. first, then A drag and drop editor.", IDEAS_HEADINGS.length === 3 && IDEAS_HEADINGS[0] === IDEAS_HEADING && IDEAS_HEADINGS[1] === "A drag and drop editor.")
check("one heading for assistive tech, the lines that take turns hidden from it", new RegExp(`<h2[^>]*aria-label="${IDEAS_HEADING}"`).test(ideas) && /<span class="ideas-stack" aria-hidden="true">/.test(ideas) && (ideas.match(/class="ideas-line"/g) ?? []).length === 3)
check("a line about building without code under it", /\bNo code\b/.test(IDEAS_SUB) && ideas.includes(IDEAS_SUB))
const flip = ideasCss.slice(ideasCss.indexOf("@keyframes ideas-flip"), ideasCss.indexOf("}}", ideasCss.indexOf("@keyframes ideas-flip")) + 2)
check("the flip is transform and opacity only", flip.length > 20 && !/(top|left|height|width|margin|filter)\s*:/.test(flip))
check("its loop runs only while the section is seen, never under reduced motion", /infinite both paused/.test(ideasCss) && /\.ideas\[data-live\] \.ideas-line\{animation-play-state:running\}/.test(ideasCss) && /prefers-reduced-motion:reduce\)\{[^@]*\.ideas-line\{animation:none!important\}/.test(ideasCss))
check("no timers of its own", !/setInterval|setTimeout/.test(src.ideas))

console.log("\n── On a phone: the editors exactly as on a computer ──")
check("one design width for every screen, no phone layout in the editors", /\.bm-frame>\.smk\{--w:1280\}/.test(BUILDER_CSS) && !/max-width:767px/.test(BUILDER_CSS) && !/--w:640/.test(BUILDER_CSS))
check("the picture keeps the computer's shape on a phone", /\.ideas-mock\{aspect-ratio:1280\/752;/.test(ideasCss) && !/aspect-ratio:640\/836/.test(ideasCss))

console.log("\n── The website builder: a real small store, no sourdough ──")
const site = renderToStaticMarkup(createElement(PlainWeatherSite))
const wb = renderToStaticMarkup(createElement(WebsiteBuilderMock))
// Changed on purpose (landing round 6): "come up with another example, a more simple and clean merch brand": Plain Weather replaces Saltmoor.
check("Plain Weather, a small apparel label's store", site.includes("Everyday cotton, cut and sewn in Porto.") && wb.includes("Plain Weather"))
check("its products are photographs that exist and are small", ["pw-hero", "pw-tee-white", "pw-tee-black", "pw-hoodie", "pw-cap"].every((n) => {
  const f = join(root, `public/home/showcase/${n}.webp`)
  return existsSync(f) && statSync(f).size < 120_000 && site.includes(`/home/showcase/${n}.webp`)
}))
check("Publish puts plainweather.co live, the selected sections outlined", wb.includes("plainweather.co") && (wb.match(/<em>Selected<\/em>/g) ?? []).length === 2)

console.log("\n── The OnePage editor: a LUT pack on a real theme ──")
const page = renderToStaticMarkup(createElement(DesmondPage))
const ope = renderToStaticMarkup(createElement(OnePageEditorMock))
check("a new creator who sells a pack of film LUTs", page.includes("Desmond Ayo") && page.includes("Night Stock, 14 film LUTs") && ope.includes("Night Stock, 14 film LUTs"))
const ember = read("components/onepage/themes/r40-themes.ts")
check("the Ember theme as Storelib defines it (deep brown, amber outlined pills, a Bodoni title)", /background_color: "#1b1612"/.test(ember) && /button_color: "#f6b062"/.test(ember) && /\.dp\{[^}]*#1b1612/.test(BUILDER_CSS) && /\.dp-btn\{[^}]*border-radius:calc\(999\*var\(--u\)\);box-shadow:inset 0 0 0 calc\(2\*var\(--u\)\) #f6b062/.test(BUILDER_CSS) && /\.dp-head h3\{[^}]*Bodoni Moda/.test(BUILDER_CSS))
check("the classic header with its Share and Subscribe keys in the top corners", /class="dp-corner dp-share"/.test(page) && /class="dp-corner dp-bell"/.test(page) && /class="smk-pic dp-av"/.test(page))
check("the email signup is still the block the editor switches on", page.includes("Grade notes, every other Sunday") && ope.includes("Email signup"))

console.log("\n── One community, drawn as it is inside ──")
const cm = renderToStaticMarkup(createElement(CommunityMock))
check("one community example in the section", IDEAS_TABS.filter((t) => /community/i.test(t.title)).length === 1 && !/CommunityBuilderMock|KilnAbout|Kiln &|ce-side/.test(src.builders))
// Changed on purpose (landing round 5): the community is The Strength Room, a paid strength coaching group.
check("the community's own bar: its mark, name, owner, the menu key, the search", cm.includes("The Strength Room") && cm.includes("By Rina Castillo") && cm.includes("Search discussions, members, or content..."))
check("the places row of the member frame (shell-frame.tsx)", ["Community", "Learn", "Calendar", "Members", "Leaderboards", "About"].every((p) => cm.includes(`>${p}<`)))
check("the community card: cover, address, Members, Online, Admins", cm.includes("storelib.com/community/strengthroom") && ["Members", "Online", "Admins"].every((w) => cm.includes(w)) && cm.includes("Upcoming event"))
check("the space chips, the composer and a pinned post", cm.includes("Share something...") && cm.includes("Pinned") && (cm.match(/class="cx-post"/g) ?? []).length === 2)

/* Changed on purpose (landing round 5): the owner asked for this section "how it was before", with no interactiveness that stops the scroll. tests/home-landing-r5-middle.test.ts pins the restored section; these keep what still holds. */
console.log("\n── One store for everything you sell: as before, no pin ──")
const biz = renderToStaticMarkup(createElement(BusinessCarousel))
check("five kinds in the owner's order", BUSINESS_SLIDES.map((s) => s.id).join() === "digital,physical,courses,communities,bookings")
check("no pinned track: no position: sticky, no scroll markers", !/position:sticky/.test(bizCss) && !/biz-track|biz-step/.test(bizCss + biz))
check("pages change by opacity only", !/\.biz-slide[^{]*\{[^}]*transition:[^}]*(top|height|margin|filter)/.test(bizCss))
check("it reads on white: dark words, no band colours", /\.biz\{position:relative;background:#fff;color:#18181b\}/.test(bizCss) && !/band-ink|band-muted/.test(src.business))
check("each product on a white card over the light grey stage, no coloured grounds", /\.bp\{[^}]*background:#eef0f2/.test(BUSINESS_MOCK_CSS) && /\.bp-card\{[^}]*background:#fff/.test(BUSINESS_MOCK_CSS) && !/\.bp-(digital|cap|course|community|booking)\{background:linear-gradient/.test(BUSINESS_MOCK_CSS))
check("the physical product is the tee of before, its photograph on file", src.pages.includes("Pines Tour Tee") && /Pines Tour Tee/.test(BUSINESS_SLIDES[1].alt) && existsSync(join(root, "public/home/showcase/hp-tee.webp")) && !existsSync(join(root, "public/home/showcase/bz-cap.webp")))
check("the page is a picture: no pointer, nothing that takes focus", /\.biz-stage \.smk\{pointer-events:none;user-select:none/.test(bizCss) && !/<(a|button|input)\b/.test(biz.slice(biz.indexOf('class="biz-stage"'))))

console.log("\n── Storelib is for creators ──")
const cta = rule(CREATORS_CSS, ".cc-cta")
check("the button is not solid purple: a white pill with a violet arrow", /background:#fff/.test(cta) && !/background:#7c3aed/.test(cta) && /\.cc-cta-ic\{[^}]*background:#7c3aed/.test(CREATORS_CSS))
check("it is still the one call to action, with a focus ring", renderToStaticMarkup(createElement(CreatorsCarousel)).includes('<a class="cc-cta" href="/signup">Start selling for free') && /\.cc-cta:focus-visible/.test(CREATORS_CSS))
check("new photographs for agencies, YouTubers, musicians and educators", ["agencies", "youtubers", "musicians", "educators"].every((slug) => {
  const c = CREATORS.find((x) => x.slug === slug)
  const a = join(root, `public/home/creators/${slug}-400.webp`)
  const b = join(root, `public/home/creators/${slug}-720.webp`)
  return !!c && existsSync(a) && existsSync(b) && statSync(a).size < 60_000 && statSync(b).size < 120_000
}))
check("their words follow the new pictures", /clapperboard/.test(CREATORS.find((c) => c.slug === "youtubers")!.alt) && /painting studio/.test(CREATORS.find((c) => c.slug === "educators")!.alt))

console.log("\n── Banned examples and words ──")
const words = Object.values(src).map(code).join("\n")
check(
  "none of this round's banned examples",
  !/sourdough|Hearth &|Golden Hour|wheel throwing|Wheel throwing|Drawing Basics|Saturday Run Club|Dust &|Elena Ruiz|Weeknight Pasta|Heavyweight|Hemi Walker|Lowtide|for real mornings/i.test(words),
)
check("no em dashes, no banned words, no fans", !/—/.test(words) && !/\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|passive income|fans?)\b/i.test(words.replace(/transform[:(][^;}]*/g, "")))
check("no hover style inside any mock", !/:hover/.test(src.pages) && !/:hover/.test(src.builders))
check("this suite runs with the push tests", read("scripts/run-push-tests.mjs").includes('"tests/home-landing-topb4.test.ts"'))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
