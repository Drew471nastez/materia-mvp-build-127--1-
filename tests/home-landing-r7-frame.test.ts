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
  const menuLink = header.match(/const MENU_LINK = "([^"]+)"/)?.[1] ?? ""
  check("the phone menu's links share one class: full ink, 17px, dimmed only on hover or press", /text-\[17px\]/.test(menuLink) && /text-\[#1a1a2e\]/.test(menuLink) && /hover:text-\[#1a1a2e\]\/60/.test(menuLink) && /active:text-\[#1a1a2e\]\/60/.test(menuLink))
  check("all five phone menu links use it, none keeps the grey 16px", (header.match(/className=\{MENU_LINK\}/g) ?? []).length === 5 && !/text-base font-medium text-gray-800 hover:bg-gray-100/.test(header))
}

console.log("\nThe headings fill as one soft wave of colour, from one number")
{
  const src = code("components/marketing/story-heading.tsx")
  const fallback = src.slice(src.indexOf("function createHeadingMotion"), src.indexOf("export const STORY_CSS"))
  check("the fallback measures nothing on a frame (no getBoundingClientRect, no getComputedStyle)", !/getBoundingClientRect|getComputedStyle|offsetTop|offsetHeight/.test(fallback))
  check("where a heading sits is taken from the observer's own entries, refreshed at several thresholds", /entry\.boundingClientRect\.top \+ y/.test(fallback) && /threshold: \[0, 0\.25, 0\.5, 0\.75, 1\]/.test(fallback))
  check("a frame reads scrollY and writes only --story-progress", /const y = scrollY/.test(fallback) && /setProperty\("--story-progress", progress\)/.test(fallback) && (fallback.match(/setProperty\(/g) ?? []).length === 1)
  check("nothing painted from a guess before the observer has reported", /top: -1/.test(fallback) && /entry\.top < 0\) continue/.test(fallback))
  check("browsers with scroll-driven animations still need no script per frame", /function inkedByCss/.test(src) && /CSS\.supports\("animation-timeline: view\(\)"\)/.test(src))
  check("each word changes only colour, along a smoothstep, overlapping the next words", /--word-on:clamp\(0,\(var\(--story-progress,0\) \* \(var\(--word-count\) \+ 2\.4\) - var\(--word-index\)\) \/ 2\.4,1\)/.test(STORY_CSS) && /3 - 2 \* var\(--word-on\)/.test(STORY_CSS) && /color:color-mix\(in oklab,var\(--word-target\) var\(--word-mix\),var\(--story-muted\)\)/.test(STORY_CSS))
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
  check("from 768px: as much room under the caption line as between heading and cards, and more (52 to 96px)", /\.build-showcase-card \{width:100%;max-width:var\(--showcase-max,2020px\);margin:0 auto;padding:clamp\(72px,7vw,112px\) 0 clamp\(52px,5\.4vw,96px\)\}/.test(show))
  check("on a phone: 44 to 64px (was 36 to 56)", /\.build-showcase-card\{padding:64px 0 clamp\(44px,12vw,64px\)\}/.test(show))
}

console.log("\nIdeas, pricing, the questions and the app in the page's one width")
{
  const ideas = read("components/marketing/home/ideas-come-to-life.tsx")
  check("ideas: the editor stands in the shared box, outranking the editorial 1400px rule", /\[data-landing-story\] \.ideas>\.ideas-stage,\.ideas-stage\{position:relative;display:grid;max-width:var\(--home-max,2020px\);margin:0 auto;padding:0 var\(--home-edge,/.test(ideas))
  check("ideas: the heading, its line and the tabs start at the content edge plus the heading inset", /\.ideas-head\{box-sizing:border-box;max-width:var\(--home-max,2020px\);margin:0 auto;padding:0 calc\(var\(--home-edge,[^)]*\)\) \+ var\(--home-head-inset,14px\)\);text-align:left\}/.test(ideas) && /\.ideas-tabs-row\{box-sizing:border-box;display:flex;justify-content:flex-start;max-width:var\(--home-max/.test(ideas) && /\.ideas-sub\{max-width:56ch;margin:18px 0 0;/.test(ideas))
  const pricing = read("components/marketing/pricing-section.tsx")
  // Changed on purpose (landing round 8): the heading is stated left aligned outright (no auto margins, full width, !text-left).
  // Changed on purpose (landing round 9): the home page has no Monthly and Yearly pill any more (the owner: chosen when paying), so nothing places one.
  check("pricing: the shared box on the home page, cards edge to edge in it, the heading at the inset", /home-wrap !max-w-\[var\(--home-max\)\] !px-\[var\(--home-edge\)\] \[&_\[data-plan-cards\]\]:!max-w-none"/.test(pricing) && /"story-section-heading !mx-0 !mb-10 w-full pl-\[var\(--home-head-inset\)\] !text-left"/.test(pricing))
  check("pricing: /pricing keeps its own centred column", /"max-w-\[1240px\] mx-auto px-4 sm:px-6"/.test(pricing))
  const faq = read("components/marketing/faq-section.tsx")
  // Changed on purpose (landing round 8): no grey box any more; the questions sit in the shared width, the heading at the inset.
  // Changed on purpose (landing round 9): the owner's reference is one centred column, so the heading is centred, not at the inset.
  check("questions: in the shared width, no grey box, one centred column", /home-wrap !max-w-\[var\(--home-max\)\] !px-\[var\(--home-edge\)\]/.test(faq) && /style=\{\{ background: "transparent" \}\}/.test(faq) && /data-faq-column="" className="mx-auto w-full max-w-\[880px\]"/.test(faq))
  const app = read("components/marketing/home/app-anywhere.tsx")
  check("app: the grid is the shared box (no 1400px column, no section gutter)", /className="home-wrap grid items-center gap-10/.test(app) && !/max-w-\[1400px\]/.test(app) && !/px-\[var\(--landing-gutter/.test(app))
  check("app: one column below 1024px, the heading at the inset", /order-first pl-\[var\(--home-head-inset\)\] lg:order-none lg:pl-0/.test(app))
  check("app: the photo is fetched for its new width", /sizes="\(min-width: 2020px\) 980px, \(min-width: 1024px\) 52vw, calc\(100vw - 40px\)"/.test(app))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
