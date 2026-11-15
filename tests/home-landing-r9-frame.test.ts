/**
 * Landing round 9 (frame). The owner, on an iPhone: sections went by as blank
 * white boxes when flung, headings shook while scrolling, the hero showed a
 * grey ground before its film, Start now came into the bar too early, and
 * the order was wrong at the end. So: the app sits on white after the AI
 * tools and the map on white after the purple, the questions are last and
 * the closing call stands alone above the footer; every section's code is
 * fetched once the page has painted and nothing waits for the scroll to stop
 * for ever; an entrance never hides a block that is flung past; on a touch
 * screen no heading moves with the scroll; the film is two small files of
 * our own with their first frames as posters; the bar's button waits for the
 * showcase on a phone.
 */
import { existsSync, readFileSync, statSync } from "node:fs"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { FAST_PX_PER_MS, FLUNG_AHEAD, FLUNG_OWN, LATE_ABOVE, REVEAL_CSS } from "@/components/marketing/landing-story"
import { STORY_CSS } from "@/components/marketing/story-heading"
import { SHEET_CSS } from "@/components/marketing/scroll-reveal-panel"
import { LAZY_AHEAD, LAZY_BUSY_WAIT_MS, LAZY_CODE_LATEST_MS, LAZY_DRAW_AHEAD, LAZY_DRAW_LATEST_MS, LAZY_IDLE_AHEAD, LAZY_NOW, lazySection } from "@/components/marketing/home/lazy-section"
import { HERO_VIDEO } from "@/lib/marketing/hero-video"
import { HERO_MEDIA_BOOT } from "@/lib/marketing/hero-startup"
import { HeroVideo } from "@/components/marketing/hero-video"

let failed = 0
let passed = 0
function check(name: string, ok: boolean) {
  if (ok) { passed++; console.log(`  ok    ${name}`) } else { failed++; console.log(`  FAIL  ${name}`) }
}
const read = (p: string) => readFileSync(p, "utf8")
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")

console.log("\nThe order: the app and the map on white, the questions last, the closing call alone")
{
  const page = code("app/(storelib)/(marketing)/page.tsx").replace(/\{\s*\}/g, "")
  check("the app follows the apps and the AI tools on their white sheet", /<ScrollRevealPanel tone="white">\s*<LazyAudienceOwnership \/>\s*<LazyIntegrationsSection \/>\s*<LazyAiToolsSection \/>\s*<LazyAppAnywhere \/>\s*<\/ScrollRevealPanel>/.test(page))
  check("the purple sheet holds what is working alone, and still rises", /<ScrollRevealPanel tone="purple" arrive="rise">\s*<DotField [^>]*\/>\s*<LazyAnalyticsShowcase \/>\s*<\/ScrollRevealPanel>/.test(page))
  check("the map opens the white sheet right after the purple", /<\/ScrollRevealPanel>\s*<ScrollRevealPanel tone="white">\s*<LazySellEverywhereMap \/>\s*<LazySection name="possibilities"/.test(page))
  check("the questions are the last section of the last sheet", /<LazySection name="faq"[^>]*>\s*<FaqSection editorial \/>\s*<\/LazySection>\s*<\/ScrollRevealPanel>/.test(page))
  check("then only the closing call, above the footer", /<\/ScrollRevealPanel>\s*<ScrollRevealBackdrop>\s*<FinalCta \/>\s*<\/ScrollRevealBackdrop>\s*<\/LandingStory>/.test(page))
  const grounds = (page.match(/<ScrollReveal(?:Backdrop|Panel tone="\w+"(?: arrive="rise")?)>/g) || []).join(" ")
  check("the grounds: dark, white, dark, white, purple, white, dark (every join is a lower block lapping an upper one)", grounds === '<ScrollRevealBackdrop> <ScrollRevealPanel tone="white"> <ScrollRevealBackdrop> <ScrollRevealPanel tone="white"> <ScrollRevealPanel tone="purple" arrive="rise"> <ScrollRevealPanel tone="white"> <ScrollRevealBackdrop>')
  const lazy = ["LazyEverythingInOnePlace", "LazyIdeasComeToLife", "LazyBusinessCarousel", "LazyCreatorsCarousel", "LazyHowItWorks", "LazyCheckoutScene", "LazyAudienceOwnership", "LazyIntegrationsSection", "LazyAiToolsSection", "LazyAppAnywhere", "LazyAnalyticsShowcase", "LazySellEverywhereMap", "LazyEarningsCalculator"]
  check("every lazy wrapper is kept, each on the page once", lazy.every((n) => (page.match(new RegExp(`<${n} />`, "g")) || []).length === 1))
  check("the server-drawn sections keep their boxes", (page.match(/<LazySection name="(possibilities|pricing|faq)"/g) || []).length === 3)
}

console.log("\nFlung: no empty box")
{
  const src = code("components/marketing/home/lazy-section.tsx")
  check("one section is drawn at a time, the nearest first (transitions asked for together are shown together, when the last is done)", /function drawNext\(\) \{\s*if \(drawing \|\| !jobs\.length\) return\s*jobs\.sort\(\(a, b\) => farness\(a\.box \?\? document\.body\) - farness\(b\.box \?\? document\.body\)\)/.test(src) && /jobs\.push\(job\)\s*drawNext\(\)/.test(src))
  check("  the line moves on when the section is in the page, or after 1.5s at the latest", LAZY_DRAW_LATEST_MS === 1500 && /committed = drawn\s*window\.setTimeout\(drawn, LAZY_DRAW_LATEST_MS\)\s*startTransition\(\(\) => setSection\(\(\) => c\)\)/.test(src) && /live = false\s*committed\?\.\(\)/.test(src))
  check("a box within a screen of the screen, still empty, while the page is being scrolled, is filled now, in one go, out of the line (standing still, as the page loads, it only goes first in the line)", LAZY_NOW === "100% 0px 100% 0px" && /soon\.disconnect\(\)\s*void mount\(performance\.now\(\) - lastScroll < CALM_MS\)/.test(src) && /\{ rootMargin: LAZY_NOW \}/.test(src) && /if \(i >= 0\) jobs\.splice\(i, 1\)/.test(src) && /if \(live\) setSection\(\(\) => c\)\s*settle\?\.\(\)/.test(src))
  check("a section mounts four screens ahead, is drawn two and a half ahead, and idle work reaches eight", LAZY_AHEAD === "400% 0px 400% 0px" && LAZY_DRAW_AHEAD === "250% 0px 250% 0px" && LAZY_IDLE_AHEAD === "800% 0px 800% 0px")
  check("every section's code is asked for once the page has painted, at the latest 700ms on, without waiting for load or for the scroll to stop", LAZY_CODE_LATEST_MS === 700 && /requestAnimationFrame\(\(\) =>\s*requestAnimationFrame\(\(\) => \{\s*if \(typeof window\.requestIdleCallback === "function"\) window\.requestIdleCallback\(code, \{ timeout: LAZY_CODE_LATEST_MS \}\)/.test(src))
  const codeFn = src.slice(src.indexOf("const code = () => {"), src.indexOf("requestAnimationFrame(() =>\n    requestAnimationFrame"))
  check("  three at a time, the code alone (no styles, no mount), and never through the calm-idle gate", /running < 3 && queue\.length/.test(codeFn) && /load\.code \? load\.code\(\)/.test(codeFn) && !/idle\(|style\(|mount/.test(codeFn) && /loader\.code = get/.test(src))
  check("  not on Save-Data or 2g: the check comes before both prefetches", src.indexOf("conn?.saveData") > 0 && src.indexOf("conn?.saveData") < src.indexOf("const code = () => {"))
  check("nothing waits for the page to stop scrolling for ever: every idle step is bounded", LAZY_BUSY_WAIT_MS === 450 && !/idle\((mountNext|step|next)\)/.test(src) && (src.match(/idle\((?:mountNext|step|next), LAZY_BUSY_WAIT_MS\)/g) || []).length >= 7 && /idle\(\(\) => live && mount\(\), LAZY_BUSY_WAIT_MS\)/.test(src))
  check("the calm gate still holds the work back while the page scrolls, up to that bound", /if \(since < CALM_MS && now < until\)/.test(src))
  const Lazy = lazySection(async () => () => createElement("p", null, "x"), { name: "probe9", minHeight: "640px" })
  const box = renderToStaticMarkup(createElement(Lazy))
  check("the box keeps its reserved height before the section arrives, and after (contain-intrinsic-size)", /data-lazy-section="probe9"/.test(box) && /min-height:640px/.test(box) && /containIntrinsicSize: `auto \$\{options\.minHeight\}`/.test(src))

  const story = code("components/marketing/landing-story.tsx")
  check("a busy page in the middle of a fling still reads as fast (a gap of up to half a second counts)", /speed = dt > 500 \? 0 : Math\.abs\(y - lastY\) \/ dt/.test(story) && /performance\.now\(\) - lastAt < 300/.test(story))
  check("the entrance knows how fast the page moves from one passive scroll listener that reads no layout", FAST_PX_PER_MS === 1.4 && /window\.addEventListener\("scroll", onScroll, \{ passive: true \}\)/.test(story) && /window\.removeEventListener\("scroll", onScroll\)/.test(story) && !/getBoundingClientRect|getComputedStyle|offsetTop|offsetHeight/.test(story))
  check("a waiting block that comes on screen while flung, late, or from above is simply shown: no transition", LATE_ABOVE === 0.5 && /if \(el\.dataset\.reveal === "wait" && !fast\(\) && entry\.boundingClientRect\.top > innerHeight \* LATE_ABOVE\) el\.dataset\.reveal = "in"\s*else delete el\.dataset\.reveal/.test(story))
  check("one flung past above the screen is let go too", /else if \(el\.dataset\.reveal === "wait" && entry\.boundingClientRect\.height > 0 && entry\.boundingClientRect\.bottom < 0\) show\(el\)/.test(story))
  check("while the page is flung nothing new is hidden", /if \(!entry\.isIntersecting && \(skipped \|\| box\.top > innerHeight\) && !fast\(\)\) \{\s*el\.dataset\.reveal = "wait"/.test(story))
  check("the sections' own waiting blocks are watched a screen and a half out: the two card grids, the platform roots, AnimateOnScroll", FLUNG_OWN === ".ev-card,.cmh-card,[class*='__root'],[data-story-reveal]" && FLUNG_AHEAD === "150% 0px 150% 0px" && /\{ rootMargin: FLUNG_AHEAD \}/.test(story) && /ahead\.observe\(block\)/.test(story))
  check("  those are really how the sections hide and show them", /\.ev-card\{[^}]*opacity:0/.test(read("components/marketing/home/everything-in-one-place.tsx")) && /\.ev-card\[data-in\]\{opacity:1;transform:none\}/.test(read("components/marketing/home/everything-in-one-place.tsx")) /* Changed on purpose (landing round 9): the How it works rebuild shows its cards at once (no fade), so only the chart waits to be seen. */ && !/\.cmh-card\{[^}]*opacity:0/.test(read("components/marketing/home/how-it-works.tsx")) && /\.root\[data-platform-in\] \.reveal \{\s*opacity: 1;/.test(read("components/marketing/home/platform.module.css")) && /data-story-reveal=""/.test(read("components/marketing/animate-on-scroll.tsx")))
  check("  flung, each gets its own mark at once, with its transition off for two frames", /if \(card\) el\.dataset\.in = ""\s*else el\.setAttribute\("data-platform-in", ""\)\s*requestAnimationFrame\(\(\) => requestAnimationFrame\(\(\) => el\.removeAttribute\("data-reveal-now"\)\)\)/.test(story) && /\[data-landing-story\] \[data-reveal-now\],\[data-landing-story\] \[data-reveal-now\] \[class\*="__reveal"\]\{transition:none!important\}/.test(REVEAL_CSS))
  check("  when the fling starts (the scroll listener) and as each comes near during it (the observer)", /if \(speed > FAST_PX_PER_MS && near\.size\) for \(const el of \[\.\.\.near\]\) showNow\(el\)/.test(story) && /else if \(flung\) showNow\(el\)\s*else near\.add\(el\)/.test(story))
  check("  this script's own waiting blocks are shown the same way", /el\.dataset\.reveal = "wait"\s*ahead\?\.observe\(el\)/.test(story) && /if \(el\.dataset\.reveal === "wait"\) return show\(el\)/.test(story))
  check("  at reading speed nothing is marked: the sections' entrances play as written", /if \(!entry\.isIntersecting\) near\.delete\(el\)\s*else if \(flung\) showNow\(el\)/.test(story) && !/setInterval|setTimeout/.test(story))
  check("shown means the attribute is gone, so no transition rule matches", /\[data-landing-story\] \[data-reveal\]\{transition:/.test(REVEAL_CSS) && !/\[data-landing-story\] \.[\w-]+\{transition/.test(REVEAL_CSS))
  check("the entrance is shorter: 500ms, lead lines 60ms and blocks 120ms behind", /transition:opacity \.5s [^;]*,translate \.5s/.test(REVEAL_CSS) && /--reveal-delay:60ms/.test(REVEAL_CSS) && /--reveal-delay:120ms/.test(REVEAL_CSS) && !/\.65s|170ms/.test(REVEAL_CSS))
}

console.log("\nOn a phone nothing moves with the scroll")
{
  const phone = REVEAL_CSS.slice(REVEAL_CSS.indexOf("@media (max-width:767px),(hover:none) and (pointer:coarse){"))
  check("phones and touch screens have their own entrance", phone.length > 100 && phone.length < REVEAL_CSS.length)
  check("  a block only fades (no translate), 380ms", /\[data-reveal\]\[data-reveal\]\{transition:opacity \.38s ease-out;translate:none\}/.test(phone))
  check("  a heading fades as one piece", /\.story-heading\[data-reveal="wait"\]\{opacity:0\}/.test(phone))
  check("  its words stay where they are, each fully there", /\.story-heading\[data-reveal\] \[data-story-word\]\[data-story-word\]\{transition:none;opacity:1;translate:none\}/.test(phone))
  check("on a touch screen the heading's rise with the scroll is off (it trails a phone's scroll and shakes)", /@media \(hover:none\) and \(pointer:coarse\) \{\s*\.story-heading\.story-heading\.story-heading \{animation:none;transform:none\}\s*\}/.test(STORY_CSS))
  check("  a heading a section writes itself (the ideas') is covered: the rule needs the class alone", /className="story-heading ideas-h"/.test(read("components/marketing/home/ideas-come-to-life.tsx")))
  check("the purple sheet rises only with a mouse: on a touch screen it laps like every other sheet", /@media \(prefers-reduced-motion:no-preference\) and \(hover:hover\) and \(pointer:fine\) \{\s*:is\(\[data-sheet\],\[data-sheet-backdrop\]\):has\(\+\[data-sheet-rise\]\)\{--srp-next-rise:/.test(SHEET_CSS) && (SHEET_CSS.match(/animation-timeline/g) || []).length === 2)
  const heading = code("components/marketing/story-heading.tsx")
  check("the heading script has no scroll listener, no frame and no layout read left", !/addEventListener\("scroll"|requestAnimationFrame|scrollY|setProperty|getBoundingClientRect\(\)/.test(heading) && !/createHeadingMotion/.test(heading))
  check("without scroll-driven animations a heading inks once, by a transition of the one number, and never moves", /\.story-heading\[data-story-heading\]\[data-story-js\] \{transform:none\}/.test(STORY_CSS) && /\[data-story-js\] > span \{transition:--story-progress 1\.1s /.test(STORY_CSS) && /\[data-story-js\]\[data-story-inked\] > span \{--story-progress:1\}/.test(STORY_CSS))
  check("  the transition only where motion is welcome", /@media \(prefers-reduced-motion:no-preference\) \{\s*\.story-heading\[data-story-heading\]\[data-story-js\] > span \{transition/.test(STORY_CSS))
  check("  --story-progress is a registered number, so it can be run", /@property --story-progress \{syntax:"<number>";inherits:true;initial-value:0\}/.test(read("app/globals.css")))
  check("no section height follows the moving toolbar: the sheets use svh or px only", !/\d(vh|dvh|lvh)\b/.test(read("components/marketing/scroll-reveal-panel.tsx").split("export const SHEET_CSS")[1].split("`")[1]))
}

console.log("\nThe hero is its film from the first paint")
{
  const mp4 = (p: string) => {
    const b = readFileSync("public" + p)
    return { size: b.length, moov: b.indexOf("moov"), mdat: b.indexOf("mdat") }
  }
  const wide = mp4(HERO_VIDEO.src)
  const phone = mp4(HERO_VIDEO.phoneSrc)
  check("the film is served from this site, in two cuts", HERO_VIDEO.src === "/marketing/hero/cinematic-1600.mp4" && HERO_VIDEO.phoneSrc === "/marketing/hero/cinematic-phone.mp4" && existsSync("public" + HERO_VIDEO.src) && existsSync("public" + HERO_VIDEO.phoneSrc))
  check("  small: under 3.2 MB and under 1.9 MB (the supplied one is 17.5 MB)", wide.size < 3_200_000 && phone.size < 1_900_000)
  check("  each with its index before its pictures (faststart), so the first bytes are enough to draw a frame", wide.moov > 0 && wide.moov < wide.mdat && phone.moov > 0 && phone.moov < phone.mdat)
  check("  no sound track to download", !readFileSync("public" + HERO_VIDEO.src).includes("mp4a") && !readFileSync("public" + HERO_VIDEO.phoneSrc).includes("mp4a"))
  check("the poster is a real picture (the film's first frame), one per cut, each under 50 KB", /\.webp$/.test(HERO_VIDEO.poster) && /\.webp$/.test(HERO_VIDEO.phonePoster) && statSync("public" + HERO_VIDEO.poster).size < 50_000 && statSync("public" + HERO_VIDEO.phonePoster).size < 50_000 && statSync("public" + HERO_VIDEO.poster).size > 4_000 && !existsSync("public/marketing/hero/cinematic-poster.svg"))
  check("the phone cut is used where the hero is in its phone layout", HERO_VIDEO.phoneMedia === "(max-width: 639px)" && /@media \(max-width: 639px\) \{\s*\.cinematic-poster, \.cinematic-video \{ object-position/.test(read("components/marketing/hero.tsx")))
  const hero = code("components/marketing/hero.tsx")
  check("both posters are preloaded at high priority, each for its own width", /<link rel="preload" as="image" href=\{HERO_VIDEO\.poster\} media="\(min-width: 640px\)" fetchPriority="high" \/>/.test(hero) && /<link rel="preload" as="image" href=\{HERO_VIDEO\.phonePoster\} media=\{HERO_VIDEO\.phoneMedia\} fetchPriority="high" \/>/.test(hero))
  check("no second host to open for the film", !/preconnect/.test(hero) && !/supabase/.test(hero))
  const html = renderToStaticMarkup(createElement(HeroVideo))
  check("the server draws the poster as a picture: the phone frame on a phone, the wide one otherwise, high priority", /<picture><source media="\(max-width: 639px\)" srcSet="\/marketing\/hero\/cinematic-poster-phone\.webp"[^>]*\/><img class="cinematic-poster" src="\/marketing\/hero\/cinematic-poster-1600\.webp"[^>]*fetchPriority="high"/i.test(html))
  check("the film is muted, inline, looping, and the server names no src (preferences are asked first)", /<video[^>]*muted=""/.test(html) && /playsInline=""/i.test(html) && /loop=""/.test(html) && /autoPlay=""/i.test(html) && !/<video[^>]+\ssrc=/.test(html) && /preload="none"/.test(html))
  check("it carries both cuts and the width that picks the phone one", /data-video-src="\/marketing\/hero\/cinematic-1600\.mp4"/.test(html) && /data-video-src-phone="\/marketing\/hero\/cinematic-phone\.mp4"/.test(html) && /data-video-phone-media="\(max-width: 639px\)"/.test(html))
  check("as the HTML is parsed the film is picked, asked for whole and played", /v\.preload='auto';v\.src=v\.dataset\.videoSrcPhone&&matchMedia\(v\.dataset\.videoPhoneMedia\)\.matches\?v\.dataset\.videoSrcPhone:v\.dataset\.videoSrc;v\.play\(\)/.test(HERO_MEDIA_BOOT))
  check("  still not for reduced motion, reduced data, Save-Data or 2g", /prefers-reduced-motion:no-preference/.test(HERO_MEDIA_BOOT) && /prefers-reduced-data:reduce/.test(HERO_MEDIA_BOOT) && /saveData/.test(HERO_MEDIA_BOOT))
  check("the film shows only once it has a frame, over the same frame as the poster: no flash", /\.cinematic-video \{ opacity: 0; \}\s*\.cinematic-video\[data-ready="true"\] \{ opacity: 1; \}/.test(read("components/marketing/hero.tsx")) && /requestVideoFrameCallback/.test(HERO_MEDIA_BOOT))
  check("React picks the same cut", /video\.src = heroVideoSource\(\)/.test(code("components/marketing/hero-video.tsx")) && /matchMedia\(HERO_VIDEO\.phoneMedia\)\.matches \? HERO_VIDEO\.phoneSrc : HERO_VIDEO\.src/.test(code("lib/marketing/hero-video.ts")))
}

console.log("\nStart now waits for the showcase on a phone")
{
  const header = code("components/platform/platform-header-client.tsx")
  const fx = header.slice(header.indexOf('const cta = document.querySelector("[data-home-hero] .cinematic-actions")'), header.indexOf("}, [pathname])", header.indexOf('"data-home-cta"')))
  check("the same observer watches the hero's buttons and the showcase", /const showcase = document\.querySelector\("\[data-build-showcase\]"\)/.test(fx) && /io\.observe\(cta\)\s*if \(showcase\) io\.observe\(showcase\)/.test(fx) && (fx.match(/new IntersectionObserver\(/g) || []).length === 1)
  check("the showcase carries the mark it is found by", /data-build-showcase=""/.test(read("components/marketing/build-showcase.tsx")))
  check("on a phone (the bar's phone row, below 768px) the showcase decides; a computer keeps the hero's buttons", /const phone = matchMedia\("\(max-width: 767px\)"\)/.test(fx) && /const watched = phone\.matches && showcase \? showcase : cta/.test(fx) && /md:hidden flex min-h-\[42px\]/.test(header))
  check("gone means all of it is under the bar", /gone\.set\(entry\.target, !entry\.isIntersecting && entry\.boundingClientRect\.top < \(entry\.rootBounds\?\.top \?\? top\)\)/.test(fx))
  check("an attribute on the bar: no listener, no state", /el\.setAttribute\("data-home-cta", gone\.get\(watched\) \? "shown" : "hidden"\)/.test(fx) && !/addEventListener|useState/.test(fx))
  const hero = read("components/marketing/hero.tsx")
  const shown = /#platform-header-root :is\(\[data-home-phone-start\],\[data-guest-signup\]\) \{([^}]*)\}/.exec(hero)?.[1] ?? ""
  const hidden = /#platform-header-root:not\(\[data-home-cta="shown"\]\) :is\(\[data-home-phone-start\],\[data-guest-signup\]\) \{([^}]*)\}/.exec(hero)?.[1] ?? ""
  check("it arrives on a long soft fade over a 4px rise: opacity and translate only", /transition:opacity 560ms cubic-bezier\(\.33,0,\.2,1\),translate 640ms cubic-bezier\(\.22,1,\.36,1\)/.test(shown) && /opacity:0; translate:0 4px; visibility:hidden; pointer-events:none/.test(hidden))
  check("the bar's height cannot change: no size, margin, padding or display in either rule", !/height|width|margin|padding|display/.test(shown + hidden))
}

console.log("\nRegistered")
{
  const runner = read("scripts/run-push-tests.mjs")
  check("this suite runs with the push tests, after the round 8 ones", /"tests\/home-landing-r8-frame\.test\.ts",[\s\S]{0,6000}"tests\/home-landing-r9-frame\.test\.ts",/.test(runner))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
