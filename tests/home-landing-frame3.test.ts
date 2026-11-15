/**
 * ===========================================================================
 *  HOME, LANDING ROUND 3: THE FRAME
 * ===========================================================================
 * What the owner asked of the page's frame, held in place:
 *
 *   The sheets      the page's base is dark; the light sections ride on
 *                   white sheets and two stretches on purple ones, rounded
 *                   top and bottom, rising over the dark by the page's own
 *                   scroll: no script, no scroll listener, no animation, no
 *                   fade, no scale, one scrollbar, off for reduced motion.
 *   The order       dark hero and showcase; white (work, ideas,
 *                   possibilities, one store, creators, how it works); the
 *                   dark checkout; white (audience, apps, AI tools); purple
 *                   (analytics, the map); white (earnings, pricing, the
 *                   questions); purple (the app, the closing call); footer.
 *   One store       on white, with no black band and no recolouring.
 *   The footer      the logo and the app badges, four link columns, a
 *                   hairline, the language, the legal links; no newsletter.
 *   The phone bar   on the home page a white "Start now" pill beside the
 *                   menu for a visitor, the person's photo when signed in.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { ScrollRevealBackdrop, ScrollRevealPanel, SHEET_CSS } from "@/components/marketing/scroll-reveal-panel"
import { BAND_CSS } from "@/components/marketing/landing-story"
import { MarketingFooter } from "@/components/marketing/footer"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 600)}`}`)
  }
}
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")
const text = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")
const BANNED = /\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform|passive income)\b/i

console.log("\n── The sheet ──")
{
  const src = code("components/marketing/scroll-reveal-panel.tsx")
  const inside = createElement("p", null, "inside")
  const white = renderToStaticMarkup(createElement(ScrollRevealPanel, { tone: "white", children: inside }))
  const purple = renderToStaticMarkup(createElement(ScrollRevealPanel, { tone: "purple", radius: "30px", padding: "12px", className: "mine", children: inside }))
  const dark = renderToStaticMarkup(createElement(ScrollRevealBackdrop, { children: inside }))
  check("a white sheet is one plain block around its children", /<div data-sheet="white"><p>inside<\/p><\/div>/.test(white))
  check("a purple sheet is also the purple band the sections' rules key on", /data-sheet="purple" data-band="purple"/.test(purple))
  check("radius, padding and a class name can be set", /class="mine"/.test(purple) && /--srp-r:30px/.test(purple) && /--srp-pad:12px/.test(purple))
  // Changed on purpose (landing round 5): no hold box: a sheet and a dark stretch are each one plain block.
  check("a sheet and a dark stretch are each one plain block", /^<style[^>]*>[\s\S]*<\/style><div data-sheet="purple"/.test(purple) && /<\/style><div data-sheet-backdrop=""><p>inside<\/p><\/div>$/.test(dark))
  check("its rules are one stylesheet, drawn once however many sheets there are", /<style href="scroll-reveal-panel" precedence="default">/.test(src))
  /* Changed on purpose (landing round 4): the sheet now rises with a small side inset and the block behind recedes, as CSS scroll-driven animations of transform and opacity (tests/home-landing-frame4.test.ts); still no script. */
  check("no script at all: no client directive, no hook, no listener, no observer", !/"use client"/.test(src) && !/\buse[A-Z]\w*\(/.test(src) && !/addEventListener|IntersectionObserver|ResizeObserver|requestAnimationFrame/.test(src))
  check("nothing is animated by a transition, filter or will-change; motion is only scroll-driven", !/transition|filter|will-change/.test(SHEET_CSS) && !/animation-timeline:(?!view\(\)|--srp-box)/.test(SHEET_CSS))
  check("no second scrollbar: the sheet never scrolls or clips by itself", !/overflow/.test(SHEET_CSS))
  check("rounded top and bottom: about 22px on a phone, 32px on a tablet, 48px on a computer", /--srp-r:clamp\(22px,4\.2vw,48px\)/.test(SHEET_CSS) && /\[data-sheet\]\{[^}]*border-radius:var\(--srp-r\)/.test(SHEET_CSS))
  /* Changed on purpose (landing round 4): each tone also names its colour (--srp-bg) for the fillets of a flat ground. */
  check("white, and the deep purple with the band's light words", /\[data-sheet="white"\]\{--srp-bg:#fff;background:#fff;color:#18181b\}/.test(SHEET_CSS) && /\[data-sheet="purple"\]\{--srp-bg:#24104f;--band-ink:#fff;--band-muted:#cdc2f7;--band-line:rgba\(255,255,255,\.16\);background:[^}]*#24104f;color:#fff\}/.test(SHEET_CSS))
  check("above the dark page, under the header (z-index 1 against the header's 40)", /\[data-sheet\]\{position:relative;z-index:1/.test(SHEET_CSS))
  // Changed on purpose (landing round 5): nothing is held any more (the owner: stutters, black bands, sections that stop the scroll); a sheet laps over the block before by its corner and scrolls with the page (tests/home-landing-r5-frame.test.ts).
  check("no sticky hold, no screen tall box: the sheet scrolls with the page", !/sticky|data-sheet-hold|--srp-cover/.test(SHEET_CSS))
  check("the next sheet laps over the end of the block before by its corner", /\[data-sheet\]:not\(\[data-sheet-flat\]\)\{margin-top:calc\(var\(--srp-r\) \* -1\)\}/.test(SHEET_CSS))
  check("a sheet under another loses its bottom corners, so no dark shows between them", /\[data-sheet\]:has\(\+\[data-sheet\]:not\(\[data-sheet-flat\]\)\)\{border-bottom-left-radius:0;border-bottom-right-radius:0/.test(SHEET_CSS))
}

console.log("\n── The bands it replaced ──")
{
  const story = code("components/marketing/landing-story.tsx")
  check("StoryBand is gone, and the scroll-driven scale with it", !/StoryBand/.test(story) && !/band-rise|animation-timeline|scale\(/.test(BAND_CSS))
  check("no black band, and nothing recolours the business section", !/data-band="black"/.test(BAND_CSS) && !/\.biz/.test(BAND_CSS))
  /* Changed on purpose (landing round 4): the app is on the page's dark close now and draws itself for dark. */
  check("analytics and the map still read light on purple", /\[data-band\] #analytics-showcase\{background:transparent;color:#fff\}/.test(BAND_CSS) && /\[data-band\] \.cmm\{background:transparent;color:#fff\}/.test(BAND_CSS))
  /* Changed on purpose (landing round 4): the closing call is on the dark close, light by its own rules, with a white button. */
  check("the closing call reads light with a white button, by its own rules", !/fcta/.test(BAND_CSS) && /\.fcta-primary\{background:#fff;color:#18181b\}/.test(read("components/marketing/home/final-cta.tsx")))
}

console.log("\n── The page ──")
{
  /* Without the comments, and without the empty braces a JSX comment leaves behind. */
  const page = code("app/(storelib)/(marketing)/page.tsx").replace(/\{\s*\}/g, "")
  check("the page's base is dark", /<div className="bg-\[#050506\]" data-home-ground="dark">/.test(page) && !/className="bg-white"/.test(page))
  /* Each ground, in the owner's order, with exactly the sections he listed. */
  /* Changed on purpose (landing round 4): the hero is not held and the first white ground is flat (Make the work must not arrive as a drawer); the close is dark, not purple. */
  const grounds: [string, string[]][] = [
    ["<ScrollRevealBackdrop>", ["<Hero />", "<BuildShowcase />"]], // Changed on purpose (landing round 5): nothing is held, so no hold props.
    ['<ScrollRevealPanel tone="white" arrive="flat">', ["<LazyEverythingInOnePlace />", "<LazyIdeasComeToLife />", /* Changed on purpose (landing round 8): the business section is back, after the ideas. */ "<LazyBusinessCarousel />", "<ProductMarquee />", "<LazyCreatorsCarousel />", "<LazyHowItWorks />"]],
    ["<ScrollRevealBackdrop>", ["<LazyCheckoutScene />"]],
    ['<ScrollRevealPanel tone="white">', ["<LazyAudienceOwnership />", "<LazyIntegrationsSection />", "<LazyAiToolsSection />"]],
    ['<ScrollRevealPanel tone="purple">', ["<LazyAnalyticsShowcase />", "<LazySellEverywhereMap />"]],
    ['<ScrollRevealPanel tone="white">', ["<LazyEarningsCalculator />", "<PricingSection", "<FaqSection"]],
    ["<ScrollRevealBackdrop>", ["<LazyAppAnywhere />", "<FinalCta />"]],
  ]
  let at = 0
  const wrong: string[] = []
  for (const [open, sections] of grounds) {
    const start = page.indexOf(open, at)
    if (start < 0) {
      wrong.push(open)
      continue
    }
    const end = page.indexOf(open.startsWith("<ScrollRevealBackdrop") ? "</ScrollRevealBackdrop>" : "</ScrollRevealPanel>", start)
    const inside = page.slice(start, end)
    let last = -1
    for (const s of sections) {
      const i = inside.indexOf(s)
      if (i <= last) wrong.push(`${open} ${s}`)
      last = i
    }
    const others = ["<Hero />", "<BuildShowcase />", "<LazyEverythingInOnePlace />", "<LazyIdeasComeToLife />", "<ProductMarquee />", "<LazyBusinessCarousel />", "<LazyCreatorsCarousel />", "<LazyHowItWorks />", "<LazyCheckoutScene />", "<LazyAudienceOwnership />", "<LazyIntegrationsSection />", "<LazyAiToolsSection />", "<LazyAnalyticsShowcase />", "<LazySellEverywhereMap />", "<LazyEarningsCalculator />", "<PricingSection", "<FaqSection", "<LazyAppAnywhere />", "<FinalCta />"].filter((s) => !sections.includes(s))
    for (const s of others) if (inside.includes(s)) wrong.push(`${s} inside ${open}`)
    at = end
  }
  check("the grounds and their sections, in the owner's order", wrong.length === 0, wrong)
  check("everything is inside the one story root, so loops still pause off screen", /<LandingStory>\s*<ScrollRevealBackdrop/.test(page) && /<\/ScrollRevealBackdrop>\s*<\/LandingStory>/.test(page))
  // Changed on purpose (landing round 8): One store for everything you sell is back, on the white ground, right after the ideas section, with no band.
  check("One store for everything you sell is back after the ideas, with no band", !/StoryBand|data-band/.test(page) && /<LazyIdeasComeToLife \/>[\s\S]{0,200}<LazyBusinessCarousel \/>/.test(page))
  check("the questions' sheet is not held, so a link to #faq lands on them", /<ScrollRevealPanel tone="white">\s*<LazyEarningsCalculator \/>/.test(page))
  check("every server-drawn lazy box keeps its name", ["possibilities", "pricing", "faq"].every((n) => page.includes(`<LazySection name="${n}"`)))
  check("the measured heights are still written into the page", /<style dangerouslySetInnerHTML=\{\{ __html: LAZY_SECTION_HEIGHTS_CSS \}\} \/>/.test(page))
}

console.log("\n── The footer ──")
{
  const src = code("components/marketing/footer.tsx")
  const html = renderToStaticMarkup(createElement(MarketingFooter))
  check("no newsletter box: no form, no field, no request", !/<form|<input/.test(html) && !/api\/newsletter|Join Our Community|footer-email/i.test(src))
  check("the logo at the left with both app badges under it", /data-footer-brand=""[\s\S]*data-footer-apps=""[\s\S]*data-app-badge="ios"[\s\S]*data-app-badge="android"/.test(html) && html.indexOf("data-footer-brand") < html.indexOf('aria-label="Product"'))
  check("four link columns, in order", ["Product", "Sell", "Resources", "Support"].every((g, i, a) => html.includes(`<nav aria-label="${g}"`) && (i === 0 || html.indexOf(`aria-label="${g}"`) > html.indexOf(`aria-label="${a[i - 1]}"`))))
  check("every link the footer had is still there", ["/", "/explore", "/blog", "/login", "/pricing", "/alternatives", "/features", "/developers", "/faq", "/sell/digital-products", "/terms", "/privacy"].every((h) => html.includes(`href="${h}"`)) && /mailto:team@storelib\.com\?subject=Affiliate%20Program/.test(html) && /data-cookie-preferences/.test(html))
  check("a hairline, then the language and the legal links on one row", /data-footer-bottom=""/.test(html) && /border-t border-white\/\[0\.1\]/.test(html) && html.indexOf("data-footer-language") > html.indexOf("data-footer-bottom") && html.indexOf('aria-label="Legal"') > html.indexOf("data-footer-language"))
  check("profiles are round white icons at the right, drawn only when confirmed", /rounded-full bg-white text-black/.test(src) && /md:ml-auto" data-storelib-social=""/.test(src) && /\{SOCIAL\.length \? \(/.test(src))
  check("black, as it was", /class="storelib-footer[^"]*text-white/.test(html))
  check("words: no em dash, no banned word", !/—/.test(text(html)) && !BANNED.test(text(html)))
}

console.log("\n── The phone bar on the home page ──")
{
  const src = code("components/platform/platform-header-client.tsx")
  const row = src.slice(src.indexOf("data-home-phone-actions"), src.indexOf("<AnimatedHamburger isOpen={mobileMenuOpen} />"))
  check("only on the home page, in the phone row, before the menu button", /data-home-phone-actions=\{pathname === "\/" \? "" : undefined\}/.test(src) && /\{pathname === "\/" \? \(/.test(row) && row.length > 0)
  check("a visitor gets a white Start now pill that goes where Sell on Storelib goes", /<Link\s+\{\.\.\.guestLink\(GUEST_SELL\)\}\s+data-home-phone-start=""/.test(row) && /Start now/.test(row) && /bg-white text-black/.test(row) && /rounded-full/.test(row))
  check("somebody signed in gets their photo instead, which opens the account sheet", /user \? \(\s*<button[\s\S]*onClick=\{\(\) => setMobileProfileOpen\(true\)\}[\s\S]*data-home-phone-avatar=""[\s\S]*<AppAvatar\s+src=\{avatarUrl\}/.test(row))
  check("from what the header already knows: no new read", !/fetch\(|createClient\(|\.from\(/.test(row))
  check("until the header knows who is looking the pill holds its place unseen", /data-placeholder=\{loading \? "" : undefined\}/.test(row) && /aria-hidden=\{loading \|\| undefined\}/.test(row) && /tabIndex=\{loading \? -1 : undefined\}/.test(row) && /loading && "invisible"/.test(row))
  check("a thumb can hit it: 38px tall in a 42px row, no double-tap wait", /h-\[38px\] touch-manipulation/.test(row))
  check("the computer's row is as it was", /<GuestHeaderActions withLogin link=\{guestLink\} chrome=\{chrome\} \/>/.test(src) && !/data-home-phone/.test(src.slice(src.indexOf("Homepage Desktop Header"), src.indexOf("Mobile Homepage/Marketing Header"))))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
