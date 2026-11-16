/**
 * ===========================================================================
 *  WAVE 12, THE HOME PAGE'S FRAME
 * ===========================================================================
 * THE PAGE      the order the owner asked for, the removed sections gone
 *               from the page (and deleted when nothing else draws them),
 *               a slot for every section another track builds, pricing kept
 *               without its See full pricing button, the FAQ kept.
 * POSSIBILITIES "Unlimited possibilities", three edge-to-edge rows (left,
 *               right, left), a seamless transform-only loop that pauses
 *               under the pointer and off screen, a still wrapped version
 *               for reduced motion.
 * CLOSING CALL  the dark card above the footer: Start free and a second way
 *               in, its rise and light paused off screen, still with reduced
 *               motion.
 * FOOTER        dark, link groups, the app badges (App Store as a link,
 *               Google Play greyed and not a link), the language, the legal
 *               row; still drawn on every marketing page.
 * LAZY          lazySection() mounts near the screen and holds the height;
 *               <LazySection> keeps the server's markup.
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label)
    console.log(`  FAIL  ${label}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ""}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const gone = (p: string) => !existsSync(join(process.cwd(), p))
/* Code without its comments, so a note that names a removed thing does not count as using it. */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")

async function main() {
  const page = code("app/(storelib)/(marketing)/page.tsx")
  const pageRaw = read("app/(storelib)/(marketing)/page.tsx")

  console.log("\nThe page")
  {
    const removed = ["BentoGrid", "StatsBar", "ManageSection", "SplitFeaturesSection", "ToolStackSection", "FeaturesBadgesSection", "CtaSection", "CarouselSection"]
    check("none of the removed sections is on the page", removed.every((c) => !page.includes(c)), removed.filter((c) => page.includes(c)))
    check("the hero and the showcase stay, first", page.indexOf("<Hero />") > 0 && page.indexOf("<Hero />") < page.indexOf("<BuildShowcase />"))
    /* Changed on purpose (wave 12 integration): the slots are now the sections themselves, loaded by components/marketing/home/lazy-sections. */
    /* Changed on purpose (landing round 3): the owner asked for a new order by ground. The apps follow the audience on one white sheet, analytics and the map share a purple one, and the app closes the page with the final call. */
    // Changed on purpose (landing round 8): the business section is back after the ideas; the possibilities moved to just before what you could earn.
    // Changed on purpose (landing round 9): the owner moved the app up onto white (after the apps and the AI tools); the questions are last, then the closing call.
    const order = ["<BuildShowcase />", "<LazyEverythingInOnePlace />", "<LazyIdeasComeToLife />", "<LazyBusinessCarousel />", "<LazyCreatorsCarousel />", "<LazyHowItWorks />", "<LazyCheckoutScene />", "<LazyAudienceOwnership />", "<LazyIntegrationsSection />", "<LazyAppAnywhere />", "<LazyAnalyticsShowcase />", "<LazySellEverywhereMap />", "<ProductMarquee />", "<LazyEarningsCalculator />", "<PricingSection", "<FaqSection", "<FinalCta />"]
    const at = order.map((s) => pageRaw.indexOf(s))
    check("the sections and the other tracks' slots in the owner's order", at.every((n, i) => n > 0 && (i === 0 || n > at[i - 1])), order.filter((_, i) => at[i] <= 0 || (i > 0 && at[i] <= at[i - 1])))
    check("pricing is kept, without its See full pricing button", /<PricingSection editorial hideDetailsLink \/>/.test(page) && /\{!hideDetailsLink && \(/.test(read("components/marketing/pricing-section.tsx")))
    check("the FAQ is kept", /<FaqSection editorial \/>/.test(page))
    check("the canonical and the graph stay", /alternates: \{ canonical: "https:\/\/storelib\.com" \}/.test(page) && /jsonLdScript\(storelibHomeJsonLd\(\)\)/.test(page))
    for (const f of ["bento-grid", "stats-bar", "manage-section", "carousel-section", "globe-widget"]) check(`components/marketing/${f}.tsx is deleted (nothing draws it any more)`, gone(`components/marketing/${f}.tsx`))
    /* Still drawn by /pricing (pricing-client), so kept. */
    for (const f of ["split-features-section", "tool-stack-section", "features-badges-section", "cta-section"]) {
      check(`components/marketing/${f}.tsx stays: /pricing draws it`, !gone(`components/marketing/${f}.tsx`) && read("app/(storelib)/(marketing)/pricing/pricing-client.tsx").includes(`components/marketing/${f}"`))
    }
    check("AnimateOnScroll has a file of its own; nothing imports the bento", !/from "\.\/bento-grid"/.test(["pricing-section", "faq-section", "tool-stack-section", "split-features-section", "features-badges-section", "pill-tabs", "features-grid", "comparison-section"].map((f) => read(`components/marketing/${f}.tsx`)).join("\n")) && /export \{ AnimateOnScroll \}/.test(read("components/marketing/animate-on-scroll.tsx")))
    check("the below-the-fold sections are dynamic imports", ["product-marquee", "pricing-section", "faq-section", "home/final-cta"].every((f) => page.includes(`import("@/components/marketing/${f}")`)))
    check("the long server-drawn sections are wrapped in LazySection", (page.match(/<LazySection /g) ?? []).length >= 3)
    check("the old white-footer override for the home page is gone from globals.css", !/body:has\(\[data-landing-story\]\) \.storelib-footer/.test(read("app/globals.css")))
  }

  console.log("\nUnlimited possibilities")
  {
    const src = read("components/marketing/product-marquee.tsx")
    const { ProductMarquee, MARQUEE_ROWS } = await import("@/components/marketing/product-marquee")
    const html = renderToStaticMarkup(createElement(ProductMarquee))
    check("the heading is Unlimited possibilities", /aria-label="Unlimited possibilities"/.test(html))
    /* Changed on purpose (landing round, the owner: "keep only 2 rows, not 3"). */
    check("two rows: left, right", MARQUEE_ROWS.map((r) => r.direction).join() === "left,right" && (html.match(/class="um-row"/g) ?? []).length === 2)
    const labels = MARQUEE_ROWS.flatMap((r) => r.items.map((i) => i.label))
    /* Changed on purpose (landing round 7, the owner: photos and words as in the reference, not pills): fewer, larger things, 18 in all. */
    check("at least 16 different things, none twice", labels.length >= 16 && new Set(labels).size === labels.length, labels.length)
    check("each row is three identical copies, two hidden from screen readers", (html.match(/<ul class="um-copy"/g) ?? []).length === 6 && (html.match(/<ul class="um-copy" aria-hidden="true"/g) ?? []).length === 4)
    /* Changed on purpose (landing round 7): each thing is a photograph and its name, no emoji, no pill. */
    check("every item has its photo", (html.match(/class="um-item"/g) ?? []).length === labels.length * 3 && (html.match(/<span class="um-pic"/g) ?? []).length === labels.length * 3 && !/<svg/.test(html) && !/um-chip|um-emoji/.test(src))
    check("each photo different in every row", MARQUEE_ROWS.every((r) => new Set(r.items.map((i) => i.photo)).size === r.items.length))
    check("communities, never memberships", labels.includes("Communities") && !labels.includes("Memberships"))
    check("the loop moves by exactly one copy, with transform only", /@keyframes um-left\{from\{transform:translate3d\(0,0,0\)\}to\{transform:translate3d\(calc\(-100% \/ 3\),0,0\)\}\}/.test(src) && !/@keyframes um-[a-z]+\{[^}]*\b(left|margin|width):/.test(src))
    /* Changed on purpose (landing round 7): the items are spaced generously, as in the owner's reference. */
    check("copies are spaced by the item's own margin, not a gap on the track", /\.um-track\{display:flex;width:max-content;/.test(src) && !/\.um-track\{[^}]*gap:/.test(src) && /* Changed on purpose (landing round 9): an eighth smaller, the room between items with them. */ /\.um-item\{[^}]*margin-right:clamp\(40px,4\.8vw,92px\)/.test(src))
    check("edge to edge: the rows escape the page's 1400px column", /\[data-landing-story\] \[data-story-section\] > \.um-rows,\.um-rows\{max-width:none;margin:0;padding:0/.test(src))
    /* Changed on purpose (wave 13): a row under the mouse glides to a stop (its animation's playback rate eased) instead of freezing, and the purple hover is gone. */
    check("pauses off screen and in a background tab", /\.um\[data-um-paused\] \.um-track/.test(src) && /new IntersectionObserver/.test(src) && /document\.hidden/.test(src))
    check("a row under the mouse eases to a stop and back, on the compositor", /addEventListener\("pointerenter"/.test(src) && /easeRow\(track, 0,/.test(src) && /easeRow\(track, 1,/.test(src) && /updatePlaybackRate/.test(src) && !/\.um-row:hover \.um-track/.test(src))
    /* Changed on purpose (landing round 7): no pill to lift any more; a photo's tilt is a 2D transform that never changes, so no item is a compositor layer of its own. */
    check("an item at rest has no 3D transform and nothing purple", /* Changed on purpose (landing round 9): under a mouse a photo straightens and lifts (the owner asked for something smooth on hover); at rest it is as before, so only the rules that open a line (the rest state) are read. */ !/\n\.um-(item|pic)\{[^}]*translate3d/.test(src) && !/\n\.um-(item|pic)\{[^}]*transition/.test(src) && /@media\(hover:hover\) and \(pointer:fine\)\{\s*\.um-pic,\.um-pic img\{transition:transform/.test(src) && !/124,\s*58,\s*237|#d6c8fb|violet/i.test(src))
    check("reduced motion: still, one copy, wrapped and centred", /@media\(prefers-reduced-motion:reduce\)\{[\s\S]*\.um-track\{animation:none[\s\S]*\.um-copy\{flex:1 1 auto;flex-wrap:wrap;justify-content:center[\s\S]*\.um-copy\[aria-hidden\]\{display:none\}/.test(src))
    /* Changed on purpose (landing round 7): the photos sit beside the words; no emoji anywhere. */
    check("the words carry no emoji", !/\p{Extended_Pictographic}/u.test(labels.join("")) && !/emoji:/.test(src))
  }

  console.log("\nThe closing call")
  {
    const src = read("components/marketing/home/final-cta.tsx")
    const { FinalCta } = await import("@/components/marketing/home/final-cta")
    const html = renderToStaticMarkup(createElement(FinalCta))
    /* Changed on purpose (wave 13): the owner found it faded in and too tall. It is now a plain, short band: no card, no rise, no light, no receipts. */
    /* Changed on purpose (landing round 4): a new closing line on the dark close. */
    /* Changed on purpose (landing round 5): the owner asked to remove the "See creators on Storelib" button, so one way in is left. */
    check("a headline, a line and one way in", /<h2[^>]*id="fcta-title"[^>]*>Start selling <em>what you make\.<\/em><\/h2>/.test(html) && /href="\/signup\?intent=sell"[^>]*>Start free/.test(html) && !/fcta-secondary/.test(html))
    check("the old Your next chapter starts here is not used", !/Your next chapter/.test(code("components/marketing/home/final-cta.tsx")))
    /* Changed on purpose (landing round 4): the section itself still has no fade or rise; its only motion is the dot grid's light (dot-field.tsx), paused off screen. */
    check("no fade, no rise, no animation at all", !/@keyframes|animation|opacity|IntersectionObserver|data-armed/.test(src))
    check("no card, no light, no floating receipts", !/fcta-card|fcta-light|fcta-chip|border-radius:clamp/.test(src) && /<section class="fcta" data-final-cta=""/.test(html))
    /* Changed on purpose (landing round 4): the closing call ends the page's dark close, with room for its mark and dot grid (at most 152px). */
    // Changed on purpose (landing round 11): the owner: "too much height, reduce it just a little": at most 128px above and 116px below.
    check("its padding is bounded: at most 128px top and 116px bottom", /\.fcta\{[^}]*background:transparent;[^}]*padding:clamp\(76px,8\.4vw,128px\)[^}]*clamp\(68px,7\.6vw,116px\)/.test(src))
    check("the buttons are 44px or more on a phone", /\.fcta-btn\{[^}]*height:54px/.test(src))
  }

  console.log("\nThe questions")
  {
    /* Added (wave 13): the FAQ heading and its line were squeezed into a 280 to 320px column. */
    const faq = read("components/marketing/faq-section.tsx")
    check("the FAQ heading has a 420px column from lg up and stacks above the answers before that", /lg:w-\[420px\] xl:w-\[460px\]/.test(faq) && /flex flex-col lg:flex-row/.test(faq) && !/md:w-\[280px\]/.test(faq))
  }

  console.log("\nThe footer")
  {
    const src = read("components/marketing/footer.tsx")
    const { MarketingFooter, APP_STORE_HREF } = await import("@/components/marketing/footer")
    const html = renderToStaticMarkup(createElement(MarketingFooter))
    // Changed on purpose (landing round 9): the footer wears the white outline mark, not the violet picture.
    // Changed on purpose (landing round 11): the owner, "the Storelib icon in the footer should not be outlined": the app icon again.
    check("dark, with the logo", /class="storelib-footer[^"]*text-white/.test(html) && /<StorelibLogo size=\{40\} \/>/.test(src))
    /* Changed on purpose (landing round 3): four columns, as in the owner's picture; the same links. */
    check("four link groups and the legal row", ["Product", "Sell", "Resources", "Support", "Legal"].every((g) => html.includes(`aria-label="${g}"`)))
    check("the links are the footer's real ones", ["/explore", "/pricing", "/alternatives", "/features", "/developers", "/blog", "/terms", "/privacy", "/faq", "/sell/digital-products"].every((h) => html.includes(`href="${h}"`)))
    check("the App Store badge is a link to the App Store address the site uses, or # until it is set", /data-app-badge="ios"/.test(html) && /aria-label="Download on the App Store"/.test(html) && (APP_STORE_HREF === "#" || /^https:\/\/apps\.apple\.com\//.test(APP_STORE_HREF) || /^https:\/\//.test(APP_STORE_HREF)) && /TODO\(owner\): set NEXT_PUBLIC_IOS_APP_STORE_ID/.test(src))
    check("Google Play: greyed, Coming soon, not a link", /<span role="img" aria-label="Google Play: coming soon"[^>]*data-app-badge="android"/.test(html) && !/<a[^>]*data-app-badge="android"/.test(html))
    check("the language is chosen with the header's own picker, loaded only when asked", /data-footer-language=""/.test(html) && /import\("@\/components\/platform\/language-modal"\)/.test(src) && /ssr: false/.test(src))
    /* Changed on purpose (landing round 3): the owner asked for the newsletter box to go from the footer; cookie choices and the profiles work as before. */
    check("cookie choices and the profiles still work as before, and the newsletter box is gone", /openCookiePreferences\(\)/.test(src) && !/api\/newsletter/.test(src) && !/<form|<input/.test(src) && /\{SOCIAL\.length \? \(/.test(src))
    check("still drawn by ConditionalFooter on the marketing pages", /<MarketingFooter \/>/.test(read("components/marketing/conditional-footer.tsx")))
  }

  console.log("\nLazy sections")
  {
    const src = read("components/marketing/home/lazy-section.tsx")
    const { lazySection, LazySection, LAZY_AHEAD } = await import("@/components/marketing/home/lazy-section")
    const Lazy = lazySection(async () => () => createElement("p", null, "loaded"), { name: "probe", minHeight: "777px" })
    const box = renderToStaticMarkup(createElement(Lazy))
    check("lazySection draws only a box of the section's height on the server", /data-lazy-section="probe"/.test(box) && /min-height:777px/.test(box) && !/loaded/.test(box))
    /* Changed on purpose (wave 14): two and a half screens; at a screen and a half a fling on a phone reached the box before its section. */
    /* Changed on purpose (landing round 9): four screens; a flick on a phone covered two and a half in a third of a second and the owner still saw blank white boxes. */
    check("it mounts when the box comes within four screens", (LAZY_AHEAD as string) === "400% 0px 400% 0px" && /new IntersectionObserver/.test(src) && /* Changed on purpose (landing round 9): the mount is a promise now (it joins the line of sections drawn one at a time), so the call is marked void. */ /io\.disconnect\(\)\s*void mount\(\)/.test(src))
    check("at once for reduced motion, a link into the page, or no observer", /location\.hash\.length > 1/.test(src) && /prefers-reduced-motion: reduce/.test(src) && /typeof IntersectionObserver !== "function"/.test(src))
    /* Changed on purpose (landing round 12, the owner's iPhone recording of the page stuttering and popping): fetched from just after the first paint, not after the load event. */
    check("the code is fetched ahead from just after the first paint, not on Save-Data", /requestIdleCallback/.test(src) && !/addEventListener\("load"/.test(src) && /saveData/.test(src))
    const kept = renderToStaticMarkup(createElement(LazySection, { name: "faq", minHeight: "900px", children: createElement("h2", null, "Questions") }))
    /* Changed on purpose (landing round 12, the owner's iPhone recording of the page stuttering and popping): a server-drawn section is never skipped either. */
    check("LazySection keeps the server's markup and is never skipped", /<h2>Questions<\/h2>/.test(kept) && !/content-visibility/.test(kept) && !/contain-intrinsic-size/.test(kept))
    const sticky = renderToStaticMarkup(createElement(LazySection, { sticky: true, children: createElement("div", null, "x") }))
    check("but no containment for a section with a sticky child", !/content-visibility/.test(sticky))
  }

  console.log("\nScrolling without building (the frame-time pass)")
  {
    const src = code("components/marketing/home/lazy-section.tsx")
    const { LAZY_IDLE_AHEAD, insertSectionStyles } = await import("@/components/marketing/home/lazy-section")
    check("a section is drawn as a transition, so its render is sliced between frames", /startTransition\(\(\) => setSection/.test(src))
    /* Changed on purpose (wave 14): five screens ahead when idle (was three), and the chain mounts the waiting section nearest the screen first. */
    /* Changed on purpose (landing round 12, the owner's iPhone recording of the page stuttering and popping): the rest are built back to back, not one per roomy idle slot. */
    check("further ahead it mounts when idle, and the rest are built back to back", (LAZY_IDLE_AHEAD as string) === "800% 0px 800% 0px" && /function mountNext\(\)/.test(src) && !/timeRemaining\(\) < IDLE_ROOM_MS\) return idle\(mountNext/.test(src) && /requestAnimationFrame\(mountNext\)/.test(src))
    /* Changed on purpose (wave 14): it also starts LAZY_PREFETCH_LATEST_MS after the page came alive when the load event is late (a slow network), two sections at a time. */
    /* Changed on purpose (landing round 12, the owner's iPhone recording of the page stuttering and popping): it starts just after the first paint. */
    check("the prefetch starts just after the first paint and skips Save-Data and 2g", /afterLoad\(\)\.then\(start\)/.test(src) && /saveData/.test(src) && /LAZY_START_AFTER_PAINT_MS\)/.test(src))
    check("insertSectionStyles does nothing on the server", (insertSectionStyles([{ href: "x", precedence: "default", css: "" }]), true))
    /* Every stylesheet a lazy section lists is one it draws: the same href, so React finds it in <head> and adds none on mount. */
    const lazy = read("components/marketing/home/lazy-sections.tsx")
    const listed = [...lazy.matchAll(/styles: \(\) => import\("\.\/([\w-]+)"\)\.then\(\(m\) => m\.(\w+)\)/g)]
    /* Changed on purpose (wave 13): section 3 (everything-in-one-place) now draws its own stylesheet too, so it is listed. */
    /* Changed on purpose (landing round): the new Your AI tools work here too section (ai-tools-section) draws its own stylesheet too, so nine are listed. */
    /* Changed on purpose (landing round 8): the business carousel is back, so nine are listed. */
    check("the sections that draw their own stylesheets list them", listed.length === 9 && listed.some((m) => m[1] === "everything-in-one-place") && listed.some((m) => m[1] === "ai-tools-section"), listed.map((m) => m[1]))
    const modules: Record<string, Record<string, unknown>> = {
      "everything-in-one-place": await import("@/components/marketing/home/everything-in-one-place"),
      "ideas-come-to-life": await import("@/components/marketing/home/ideas-come-to-life"),
      "business-carousel": await import("@/components/marketing/home/business-carousel"),
      "creators-carousel": await import("@/components/marketing/home/creators-carousel"),
      "how-it-works": await import("@/components/marketing/home/how-it-works"),
      "checkout-scene": await import("@/components/marketing/home/checkout-scene"),
      "sell-everywhere-map": await import("@/components/marketing/home/sell-everywhere-map"),
      "earnings-calculator": await import("@/components/marketing/home/earnings-calculator"),
      "ai-tools-section": await import("@/components/marketing/home/ai-tools-section"),
    }
    for (const [, file, name] of listed) {
      const mod = modules[file] ?? {}
      const styles = mod[name] as { href: string; precedence: string; css: string }[]
      const own = read(`components/marketing/home/${file}.tsx`)
      check(`${file}: ${name} names real stylesheets it draws`, Array.isArray(styles) && styles.length > 0 && styles.every((s) => s.css.length > 100 && /^w1[23]-/.test(s.href) && (own.includes(`href="${s.href}"`) || own.includes(`"${s.href}"`) || /CommerceKitStyle/.test(own))), styles?.map((s) => s.href))
    }
    const html = renderToStaticMarkup(createElement(modules["ideas-come-to-life"].IdeasComeToLife as () => null))
    check("the showcase sections draw their mocks' styles as React stylesheets (href and precedence), once each", !/<style>/.test(html) && !/\.smk-frame\{[\s\S]*\.smk-frame\{/.test(html))
    const css = read("app/globals.css").replace(/\/\*[\s\S]*?\*\//g, "")
    check("no :has() before a combinator whose last part is * in globals.css (it restyled the whole page on every insertion)", !/:has\([^{}]*\)\s*>\s*\*\s*\{/.test(css))
    const creators = read("components/marketing/home/creators-carousel.tsx")
    check("no rule keyed on data-story-in-view ends in * (each section scrolling in or out restyled all of itself)", !/data-story-in-view[^{}]*\*\s*[,{]/.test(creators) && !/data-story-in-view[^{}]*\s\*\s*[,{]/.test(css))
  }

  /* Added on purpose (home page scroll pass 2). */
  console.log("\nScrolling without building, pass 2")
  {
    const src = code("components/marketing/home/lazy-section.tsx")
    /* Changed on purpose (landing round 12, the owner's iPhone recording of the page stuttering and popping): a built section is never skipped. */
    check("a mounted lazy section stays in its box and is never skipped", /data-lazy-mounted=""/.test(src) && !/contentVisibility: "auto"/.test(src))
    /* Changed on purpose (wave 14): laid out in slices (layOutInSlices), then its height kept as before. */
    /* Changed on purpose (landing round 11): the real height is kept exactly, unrounded (keepHeight), so a box drawn again is not a fraction of a pixel off. */
    /* Changed on purpose (landing round 12, the owner's iPhone recording of the page stuttering and popping): no slicing and no kept height: a built section is laid out once. */
    check("a built section is laid out once, with no slicing and no kept height", !/layOutInSlices/.test(src) && !/keepHeight/.test(src))
    const css = read("app/globals.css")
    const heading = code("components/marketing/story-heading.tsx")
    check("headings ink and rise from scroll-driven animations where the browser has them (no script per frame)", /@property --story-progress/.test(css) && /animation-timeline:--story-heading/.test(css) && /@keyframes story-heading-rise \{from\{transform:translate3d\(0,12px,0\)\}to\{transform:translate3d\(0,0,0\)\}\}/.test(css) && /function inkedByCss/.test(heading) && /data-story-js/.test(heading))
    /* Changed on purpose (wave 13): the owner wants the showcase heading inked by the scroll again, like the others, so it is no longer kept out of the scroll-driven animation. */
    check("the script keeps only headings inside a scrolling box; the showcase heading inks from the scroll too", !/hasAttribute\("data-story-showcase"\)\) return false/.test(heading) && /hidden\|auto\|scroll/.test(heading) && !/data-story-showcase\]\):not/.test(css) && !/"--story-progress": 1/.test(heading))
    const creators = code("components/marketing/home/creators-carousel.tsx")
    /* Changed on purpose (landing round 7): the speed the rail settles at is now `want` (goal is the function that works it out). */
    /* Changed on purpose (landing round 8): every leg of the creators rail's motion (in, cruise, out, a throw) is a Web Animation; halt() takes it back. */
    check("the creators rail cruises on the compositor (a Web Animation), not a transform set every frame", /track\.animate\(/.test(creators) && /const halt = /.test(creators) && /play\("cruise"/.test(creators))
    /* Changed on purpose (landing round): the sale notification is gone (the owner found it AI looking), so only the rail itself is checked. */
    check("the creators section runs no endless CSS loop of its own", !/infinite/.test(creators) && !existsSync("components/marketing/home/motion/sale-pop.tsx"))
    for (const f of ["how-it-works", "earnings-calculator"]) {
      const own = read(`components/marketing/home/${f}.tsx`)
      check(`${f}: rules keyed on data-commerce-live end in a class, not a tag`, !/\[data-commerce-live\][^{},]*\s(span|li|div|b|i|img|svg|path)\s*[,{]/.test(own) && !/\[data-commerce-live\][^{},]*>\s*(span|li)\s*[,{]/.test(own))
    }
  }

  /* Added on purpose (wave 14, scroll): sections arrive drawn, and idle work never lands in a scroll. */
  console.log("\nSections drawn before they arrive (wave 14)")
  {
    const src = code("components/marketing/home/lazy-section.tsx")
    const { LAZY_DRAW_AHEAD } = await import("@/components/marketing/home/lazy-section")
    /* Changed on purpose (landing round 9): two and a half screens ahead (it was one and a half). */
    /* Changed on purpose (landing round 12): built sections are never skipped, so this machinery is gone. */ check("no box is drawn ahead or contained (nothing is skipped)", !/box\.style\.contain = /.test(src))
    /* Changed on purpose (landing round 12, the owner's iPhone recording of the page stuttering and popping): nothing is switched between skipped and drawn. */
    check("no box is switched between skipped and drawn", !/watchDraw/.test(src))
    check("idle work waits until the page has stopped scrolling", /const CALM_MS = \d+/.test(src) && /since < CALM_MS/.test(src) && /addEventListener\("scroll", \(\) => \(lastScroll = performance\.now\(\)\), \{ passive: true, capture: true \}\)/.test(src))
    check("the idle chain mounts the waiting section nearest the screen first", /farness\(a\) - farness\(b\)/.test(src))
    check("a box hydrates empty, as the server drew it, even when its code arrived first (no hydration mismatch on a slow network)", /useSyncExternalStore\(noSubscription, drawnInBrowser, drawnOnServer\)/.test(src) && /useState<ComponentType<P> \| null>\(\(\) => \(browserDrawn \? cached : null\)\)/.test(src))
    /* Changed on purpose (landing round 12, the owner's iPhone recording of the page stuttering and popping): no slices: nothing is held back with content-visibility: hidden. */
    check("no section is held back in slices", !/SLICE_ELEMENTS/.test(src) && !/contentVisibility = "hidden"/.test(src))
    const globe = code("components/marketing/home/everything-globe.tsx")
    /* Changed on purpose (wave 14 integration): main fixed the same crash first, by drawing a second run on a fresh canvas instead of keeping the worker per canvas; main's version is kept, so this checks that. */
    check("the globe never asks a canvas it already handed to a worker for a context again (a second run gets a fresh canvas)", /const handedOver = new WeakSet<HTMLCanvasElement>\(\)/.test(globe) && /handedOver\.add\(canvas\)/.test(globe) && /if \(handedOver\.has\(canvas\)\) \{[\s\S]{0,200}canvas\.replaceWith\(fresh\)/.test(globe))
    const header = code("components/marketing/conditional-header.tsx")
    const client = code("components/platform/platform-header-client.tsx")
    /* Changed on purpose (wave 14 integration): main shipped the same /index fix as one shared useRoutePath (lib/navigation/route-path.ts, covered in home-hero too); main's version is kept, so this checks that. */
    check("the home page is \"/\" even where the server renders it as \"/index\" (Vercel's ISR), so its header is in the HTML", /const pathname = useRoutePath\(\)/.test(header) && (client.match(/const pathname = useRoutePath\(\)/g) || []).length === 2 && !/usePathname\(\)/.test(header))
  }

  console.log("\nNo hotlinked pictures")
  {
    const files = ["components/marketing/product-marquee.tsx", "components/marketing/home/final-cta.tsx", "components/marketing/home/lazy-section.tsx", "components/marketing/footer.tsx"]
    check("none of this wave's files loads a picture from another site", files.every((f) => !/https?:\/\/[^"'`\s]*\.(png|jpe?g|webp|gif|avif)/i.test(read(f)) && !/images\.unsplash\.com/.test(read(f))))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
