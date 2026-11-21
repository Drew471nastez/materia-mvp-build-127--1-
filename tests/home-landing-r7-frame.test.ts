/**
 * Landing round 7 (frame): the header's links plain and a size up, the
 * headings' scroll fill as one soft wave of colour, "One store for everything
 * you sell" off the home page, room under the showcase's cards, and the
 * ideas, pricing, questions and app sections in the page's one width.
 */
import { existsSync, readFileSync } from "node:fs"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { STORY_CSS, StoryHeading } from "@/components/marketing/story-heading"
import { LAZY_SECTION_HEIGHTS_CSS } from "@/components/marketing/home/lazy-sections"

let failed = 0
let passed = 0
function check(name: string, ok: boolean) {
  if (ok) { passed++; console.log(`  ok    ${name}`) } else { failed++; console.log(`  FAIL  ${name}`) }
}
const read = (p: string) => readFileSync(p, "utf8")
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "")

console.log("\nThe header's links: plain, full strength, a size up; only a hover dims one")
{
  const header = read("components/platform/platform-header-client.tsx")
  const nav = header.slice(header.indexOf('<nav data-marketing-nav=""'), header.indexOf("</nav>", header.indexOf('<nav data-marketing-nav=""')))
  check("desktop links are 15px, 16px from lg (were 14 and 15)", /text-\[15px\] lg:text-\[16px\] font-medium/.test(nav) && !/text-\[14px\] lg:text-\[15px\]/.test(nav))
  check("on the dark home header every link is plain white and dims on hover", /"text-white hover:text-white\/65"/.test(nav) && !/text-white\/65 hover:text-white"/.test(nav))
  check("on a light header every link is full ink and dims on hover", /"text-\[#1a1a2e\] hover:text-\[#1a1a2e\]\/60"/.test(nav) && !/text-neutral-500 hover/.test(nav))
  check("no link is drawn dimmer for not being the current page", !/item\.active \?/.test(nav))
  /* Changed on purpose (wave 18): the phone menu is the full-screen one (components/platform/marketing-phone-menu.tsx), in the bar's colours and a size up again (19px); the rule is kept: full ink, dimmed only on hover or press, one class for every page link. */
  const menu = read("components/platform/marketing-phone-menu.tsx")
  const menuRow = menu.match(/export const MENU_ROW = "([^"]+)"/)?.[1] ?? ""
  check("the phone menu's links share one class: full ink, 19px, dimmed only on hover or press", /text-\[19px\]/.test(menuRow) && /row: "text-\[#1a1a2e\] active:text-\[#1a1a2e\]\/55 hover:text-\[#1a1a2e\]\/65"/.test(menu) && /row: "text-white active:text-white\/55 hover:text-white\/70"/.test(menu))
  check("all five phone menu links use it (one map over Home, Discover, Blog, Pricing, FAQ), none keeps the grey 16px", (header.match(/className=\{cn\(MENU_ROW, tone\.row, tone\.focus, "rounded-md"\)\}/g) ?? []).length === 1 && /label: "Home"[\s\S]{0,200}label: "Discover"[\s\S]{0,200}label: "Blog"[\s\S]{0,200}label: "Pricing"[\s\S]{0,200}label: "FAQ"/.test(header) && !/text-base font-medium text-gray-800 hover:bg-gray-100/.test(header))
}

console.log("\nThe headings fill as one soft wave of colour, from one number")
{
  const src = code("components/marketing/story-heading.tsx")
  // Changed on purpose (landing round 9): the fallback no longer follows the scroll at all (on an iPhone it trailed the scroll and the heading shook); it inks a heading once, as it comes on screen.
  const fallback = src.slice(src.indexOf("function createHeadingInk"), src.indexOf("export const STORY_CSS"))
  check("the fallback measures nothing on a frame (no getBoundingClientRect, no getComputedStyle)", !/getBoundingClientRect|getComputedStyle|offsetTop|offsetHeight/.test(fallback))
  check("the fallback has no scroll listener and no frame: one observer marks a heading inked", fallback.length > 200 && !/addEventListener|requestAnimationFrame|scrollY|setProperty/.test(fallback) && (fallback.match(/new IntersectionObserver\(/g) ?? []).length === 1 && /node\.setAttribute\("data-story-inked", ""\)/.test(fallback))
  check("on screen or already passed, then let go", /!entry\.isIntersecting && entry\.boundingClientRect\.bottom >= 0\) continue/.test(fallback) && /observer\?\.unobserve\(node\)/.test(fallback))
  // Changed on purpose (landing round 11): the owner wanted the fill "more smooth, buttery": the fallback's transition is 1.8s on a softer curve (it was 1.1s).
  check("the stylesheet runs the one number from 0 to 1 as a transition", /\[data-story-js\] > span \{--story-progress:0\}/.test(src) && /\[data-story-js\]\[data-story-inked\] > span \{--story-progress:1\}/.test(src) && /transition:--story-progress \$\{INK_FALLBACK_MS\}ms/.test(src))
  check("browsers with scroll-driven animations still need no script per frame", /function inkedByCss/.test(src) && /CSS\.supports\("animation-timeline: view\(\)"\)/.test(src))
  // Changed on purpose (landing round 11): each word takes four words of the wave to fill (it was 2.4), a softer ramp.
  check("each word changes only colour, along a smoothstep, overlapping the next words", /--word-on:clamp\(0,\(var\(--story-progress,0\) \* \(var\(--word-count\) \+ 4\) - var\(--word-index\)\) \/ 4,1\)/.test(STORY_CSS) && /3 - 2 \* var\(--word-on\)/.test(STORY_CSS) && /color:color-mix\(in oklab,var\(--word-target\) var\(--word-mix\),var\(--story-muted\)\)/.test(STORY_CSS))
  check("the hard-edged gradient wipe per word is turned off where color-mix works", /@supports \(color:color-mix\(in oklab,red 50%,blue\)\)/.test(STORY_CSS) && /background:none;-webkit-background-clip:border-box;background-clip:border-box/.test(STORY_CSS))
  check("its selector outranks the showcase heading's own gradient rule in app/globals.css", /\.story-heading\[data-story-heading\] \[data-story-word\]\[data-story-word\]/.test(STORY_CSS))
  check("forced colours still get plain text", /forced-colors:active\)[^}]*color:CanvasText/.test(STORY_CSS))
  const html = renderToStaticMarkup(createElement(StoryHeading, { text: "Pricing and plans", accent: ["plans"] }))
  check("the stylesheet is one hoisted <style href> for every heading", /<style[^>]*href="story-heading"/.test(html) || /data-precedence="default"/.test(html) || html.includes("--word-on"))
  check("the words keep their index and count for the stylesheet", /--word-index:2/.test(html) && /--word-count:3/.test(html))
}

console.log("\n\"One store for everything you sell\" is off the home page")
{
  const page = read("app/(storelib)/(marketing)/page.tsx")
  /* Changed on purpose (landing round 8): the owner, "Keep the One store for everything you sell section, of course": it is back, redesigned, after the ideas section (tests/home-landing-r8-business.test.ts pins it). */
  check("the page draws the business carousel again", /<LazyBusinessCarousel \/>/.test(page))
  const lazy = read("components/marketing/home/lazy-sections.tsx")
  check("its lazy box is back", /LazyBusinessCarousel/.test(lazy) && /"\.\/business-carousel"/.test(lazy))
  // Changed on purpose (landing round 8): the section is back and measured, so its heights are written with the others.
  check("its measured heights are written with the others", /data-lazy-section="business"/.test(LAZY_SECTION_HEIGHTS_CSS))
  check("its files are back with the course photograph; the old tee, padel and host photographs stay deleted", ["components/marketing/home/business-carousel.tsx", "components/marketing/home/showcase-mocks/business-mocks.tsx", "public/home/showcase/bz-dj.webp"].every((f) => existsSync(f)) && ["public/home/showcase/hp-tee.webp", "public/home/showcase/bz-padel.webp", "public/home/showcase/bz-host.webp"].every((f) => !existsSync(f)))
  check("the mocks the ideas section still uses are kept", ["frame.tsx", "pills.ts", "use-auto-tabs.ts", "builder-mocks.tsx"].every((f) => existsSync(`components/marketing/home/showcase-mocks/${f}`)))
  check("the height script no longer speaks of it", !/business/.test(read("scripts/measure-home-lazy-heights.mjs")))
}

console.log("\nRoom under the showcase's cards")
{
  const show = read("components/marketing/build-showcase.tsx")
  check("from 768px: as much room under the caption line as between heading and cards, and more (52 to 96px)", /\.build-showcase-card \{position:relative;z-index:1;width:100%;max-width:var\(--showcase-max,2020px\);margin:0 auto;padding:clamp\(72px,7vw,112px\) 0 clamp\(52px,5\.4vw,96px\)\}/.test(show))
  check("on a phone: 44 to 64px (was 36 to 56)", /\.build-showcase-card\{padding:64px 0 clamp\(44px,12vw,64px\)\}/.test(show))
}

console.log("\nIdeas, pricing, the questions and the app in the page's one width")
{
  const ideas = read("components/marketing/home/ideas-come-to-life.tsx")
  check("ideas: the editor stands in the shared box, outranking the editorial 1400px rule", /\[data-landing-story\] \.ideas>\.ideas-stage,\.ideas-stage\{position:relative;display:grid;max-width:var\(--home-max,2020px\);margin:0 auto;padding:0 var\(--home-edge,/.test(ideas))
  check("ideas: the heading, its line and the tabs start at the content edge plus the heading inset", /\.ideas-head\{box-sizing:border-box;max-width:var\(--home-max,2020px\);margin:0 auto;padding:0 calc\(var\(--home-edge,[^)]*\)\) \+ var\(--home-head-inset,14px\)\);text-align:center\}/.test(ideas) && /\.ideas-tabs-row\{box-sizing:border-box;display:flex;justify-content:center;max-width:var\(--home-max/.test(ideas)) /* Changed on purpose (landing round 9): the owner wants the heading, its line and the tabs centred; they keep the shared box and its gutters. Changed on purpose (landing round 10): the line under the heading is gone. */
  const pricing = read("components/marketing/pricing-section.tsx")
  // Changed on purpose (landing round 8): the heading is stated left aligned outright (no auto margins, full width, !text-left).
  // Changed on purpose (landing round 9): the home page has no Monthly and Yearly pill any more (the owner: chosen when paying), so nothing places one.
  /* Changed on purpose (pricing round 5): the cards sit on their own grey ground now, so the ground is what spans the box edge to edge. */
  check("pricing: the shared box on the home page, cards edge to edge in it, the heading at the inset", /home-wrap !max-w-\[var\(--home-max\)\] !px-\[var\(--home-edge\)\] \[--plan-bleed:var\(--home-edge\)\] \[&_\[data-plan-ground\]\]:!max-w-none"/.test(pricing) /* Changed on purpose (landing round 15): --plan-bleed lets the phone's sideways row of cards run to the screen's edge. */ && /"story-section-heading !mx-0 !mb-10 w-full pl-\[var\(--home-head-inset\)\] !text-left"/.test(pricing))
  check("pricing: /pricing keeps its own centred column", /"max-w-\[1240px\] mx-auto px-4 sm:px-6 \[--plan-bleed:16px\] sm:\[--plan-bleed:24px\]"/.test(pricing) /* Changed on purpose (landing round 15): the bleed for the phone's sideways row of cards. */)
  const faq = read("components/marketing/faq-section.tsx")
  // Changed on purpose (landing round 8): no grey box any more; the questions sit in the shared width, the heading at the inset.
  // Changed on purpose (landing round 9): the owner's reference is one centred column, so the heading is centred, not at the inset.
  check("questions: in the shared width, no grey box, one centred column", /home-wrap !max-w-\[var\(--home-max\)\] !px-\[var\(--home-edge\)\]/.test(faq) && /style=\{\{ background: "transparent" \}\}/.test(faq) && /data-faq-column="" className="!mx-auto w-full !max-w-\[880px\] !px-0"/.test(faq))
  const app = read("components/marketing/home/app-anywhere.tsx")
  // Changed on purpose (landing round 9): no two column grid any more; the heading, one wide stage and the points sit in the shared box, one under the other.
  // Changed on purpose (landing round 11): round 8's two columns again (the photograph and the words), in the shared box.
  check("app: everything in the shared box (no 1400px column, no section gutter)", /<div className=\{`home-wrap \$\{s\.grid\}`\}>/.test(app) && !/max-w-\[1400px\]/.test(app) && !/px-\[var\(--landing-gutter/.test(app))
  // Changed on purpose (landing round 9): one column at every width; the heading's inset is in the module (.head).
  // Changed on purpose (landing round 11): the words' column carries the inset on a phone, where it sits over the photograph's edge.
  check("app: the heading at the inset", /className=\{s\.copy\}/.test(app) && /\.copy \{[^}]*padding-left: var\(--home-head-inset, 0px\);/.test(read("components/marketing/home/app-anywhere.module.css")))
  // Changed on purpose (landing round 9): the photograph is gone (a drawn stage takes its place); its pictures are two 96px thumbnails at their drawn size.
  // Changed on purpose (landing round 11): the owner: "how it was before, the image and things": his photograph is back, sized, lazy and async.
  // Changed on purpose (landing round 21): loaded as soon as its section mounts (eager); a fast flick reached it while it was still blank.
  check("app: the owner's photograph, sized, loaded with its section and async", /src="\/home\/app\/storelib-app-720\.webp"/.test(app) && /width=\{1280\}\s*height=\{960\}/.test(app) && /loading="eager"\s*decoding="async"/.test(app))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
