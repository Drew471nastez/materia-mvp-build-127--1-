/**
 * ===========================================================================
 *  HOME: GETTING STARTED, THE GUIDE, YOUR PLAN, THE GLOBE, AND UPGRADE TO PRO
 * ===========================================================================
 * The Store setup list on Home was replaced by three cards under the Pro plan
 * banner (components/app/home/home-cards.tsx), the banner got a globe that
 * turns and can be spun (components/app/home/globe.tsx), and the Upgrade to
 * Pro card in the sidebar and the phone menu became a white card with a
 * violet bolt. What each of those promised, pinned where a browser is not
 * needed. scripts/check-home-cards.mjs measures the rest in Chromium.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { GLOBE_STEP, landDots, toSphere } from "../components/app/home/globe-land"
import { OFFERED_PLANS } from "../lib/billing/plans"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label + (detail ? ` — ${detail}` : "")); console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const dash = read("components/app/dashboard-client.tsx")
const cards = read("components/app/home/home-cards.tsx")
const globe = read("components/app/home/globe.tsx")
const banner = read("components/app/home/home-banner.tsx")
const land = read("components/app/home/globe-land.ts")
const css = read("app/globals.css")
const desktop = read("components/app/sidebar-desktop-nav.tsx")
const phone = read("components/app/sidebar-mobile-nav.tsx")

/** The HOME CARDS block of globals.css, and nothing else. */
const homeCss = css.slice(css.indexOf("/* ─── HOME CARDS"))

function main() {
  console.log("\nthe Store setup list is gone")
  check("no store-setup-section on Home", !/store-setup-section/.test(dash))
  check("nor its sub-steps, icons or ring", !/stepSubsteps|stepIcons|ProgressCircle|expandedStep/.test(dash))
  check("the three cards sit under the banner", dash.indexOf("<HomeCards") > dash.indexOf("Dashboard Banner") && dash.indexOf("<HomeCards") < dash.indexOf("Add a product card"))
  check("and the quick actions are all still there", ["/app/products/new", "/app/onepage", "/app/analytics", "/app/settings?tab=domains"].every((h) => dash.includes(`href="${h}"`)))

  console.log("\nGetting started")
  const ids = [...dash.matchAll(/\{ id: "(\w+)", label: "([^"]+)"/g)].map((m) => m[1])
  check("six steps", new Set(ids).size === 6, ids.join(","))
  check("signing up is always done", /\{ id: "signup", label: "Sign up", done: true/.test(dash))
  check("each other step is read off the account", /done: hasProducts/.test(dash) && /done: websitePublished/.test(dash) && /done: hasPayouts/.test(dash) && /done: !!\(connectedDomain \|\| websiteDomain\)/.test(dash) && /done: hasFirstSale/.test(dash))
  check("the website builder is a full page load, as the sidebar does it", /href: "\/app\/website-builder", hardNavigation: true/.test(dash))
  check("the purple bar counts the same six", /const completedSteps = startSteps\.filter/.test(dash) && /const totalSteps = startSteps\.length/.test(dash))
  check("and its Continue points at Getting started", /onClick=\{bumpGettingStarted\}/.test(dash))
  check("what is left comes first, what is done after", /\[\.\.\.steps\.filter\(\(s\) => !s\.done\), \.\.\.steps\.filter\(\(s\) => s\.done\)\]/.test(cards))
  check("done steps are crossed out", /line-through/.test(cards))
  check("only the next step carries the arrow", /\{isNext && \(/.test(cards) && /isNext=\{step === next\}/.test(cards))
  check("no sub-steps", !/substep/i.test(cards))
  check("PayPal, Visa and Stripe at its foot", ["paypal", "visa", "stripe"].every((t) => cards.includes(`data-pay-tile="${t}"`)))

  console.log("\nthe guide")
  check("says Welcome to Storelib, with the Storelib mark", /Welcome to\s*<br \/>\s*Storelib/.test(cards) && /<StorelibMark/.test(cards))
  check("never Academy or Amboras", !/Academy|Amboras/.test(cards))
  check("pressing it bumps Getting started", /onClick=\{bumpGettingStarted\}/.test(cards))
  check("scrolled to first when it is off screen", /scrollIntoView\(\{ behavior: "smooth", block: "center" \}\)/.test(cards))

  console.log("\nYour Plan")
  check("the plan by the name Billing uses", /planDisplayName\(id\)/.test(cards))
  check("its lines from the table the pricing cards read", /OFFERED_PLANS\.find/.test(cards))
  check("Free has lines to show", (OFFERED_PLANS.find((p) => p.id === "free")?.features.length ?? 0) >= 5)
  check("Upgrade to Pro on Free, to the upgrade page", /"Upgrade to Pro"/.test(cards) && /"\/app\/settings\/billing\/upgrade"/.test(cards))
  check("never No plan or Subscribe to plan", !/No plan|Subscribe to plan/.test(cards))

  console.log("\nhover, on a mouse only, and never on transform")
  check("no hover:shadow class, which a tap strips on a touch screen", ![...cards.matchAll(/(?:className=|const CARD = )[{`"]+([^`"]*)/g)].some((m) => /hover:shadow/.test(m[1])))
  check("no .group, whose children lose their transforms on a touch screen", !/className="[^"]*\bgroup\b/.test(cards))
  check("the card's hover is behind (hover: hover) and (pointer: fine)", /@media \(hover: hover\) and \(pointer: fine\) \{\s*\.home-card:hover \{/.test(homeCss))
  check("the tiles move on hover under the same", /@media \(hover: hover\) and \(pointer: fine\) \{\s*\.home-card:hover \[data-pay-tile="paypal"\]/.test(homeCss))
  check("everything moves on translate, rotate and scale", !/\btransform\s*:/.test(homeCss.slice(0, homeCss.indexOf("@media (prefers-reduced-motion"))))
  check("with reduced motion the bump is off", /prefers-reduced-motion: reduce\) \{\s*\.home-card\[data-bump\]/.test(homeCss))

  console.log("\nthe globe")
  const dots = landDots()
  const count = dots.length / 3
  let total = 0
  for (let r = 0; r < Math.round(180 / GLOBE_STEP); r++) {
    const lat = 90 - GLOBE_STEP / 2 - r * GLOBE_STEP
    total += Math.max(1, Math.round((360 * Math.cos((lat * Math.PI) / 180)) / GLOBE_STEP))
  }
  const mask = land.match(/const LAND_MASK =\n  "([^"]*)"/)?.[1] ?? ""
  check("the mask has a bit for every dot", Buffer.from(mask, "base64").length === Math.ceil(total / 8), `${Buffer.from(mask, "base64").length} bytes for ${total} dots`)
  check("about three tenths of them land", count / total > 0.24 && count / total < 0.34, `${count} of ${total}`)
  const near = (lat: number, lon: number, deg: number) => {
    const [x, y, z] = toSphere(lat, lon)
    const cos = Math.cos((deg * Math.PI) / 180)
    for (let i = 0; i < count; i++) if (dots[i * 3] * x + dots[i * 3 + 1] * y + dots[i * 3 + 2] * z > cos) return true
    return false
  }
  check("land at Bucharest, Paris, Chicago and Nairobi", near(44.43, 26.1, 2) && near(48.85, 2.35, 2) && near(41.88, -87.63, 2) && near(-1.29, 36.82, 2))
  check("none in the middle of the Pacific or the Atlantic", !near(0, -150, 4) && !near(30, -40, 4))
  check("it only runs while it can be seen", /IntersectionObserver/.test(globe) && /visibilitychange/.test(globe) && /cancelAnimationFrame/.test(globe))
  check("and not while the page under it scrolls", /addEventListener\("scroll", onScroll, \{ capture: true, passive: true \}\)/.test(globe) && /scrolling = true\s*\n\s*sleep\(\)/.test(globe))
  check("it never renders React to turn", !/useState/.test(globe))
  /* "When I touch over the globe it should not scroll, it should just let me interact with the globe." */
  check("a finger on the ball turns it and never scrolls: touch-action none on the round grip only", /data-home-globe-grip=""[\s\S]{0,400}touchAction: "none"/.test(globe) && /rounded-full/.test(globe))
  check("the canvas takes no touches, so the rest of its box scrolls", /pointer-events:none/.test(globe))
  check("and the banner's text still scrolls the page", /\.home-banner-text \{[^}]*touch-action: pan-y;/.test(banner))
  check("grab, and grabbing while dragged", /cursor-grab/.test(globe) && /"grabbing"/.test(globe))
  check("a throw keeps its speed, up to a limit, and settles back", /MAX_SPEED/.test(globe) && /SETTLE_MS/.test(globe))
  check("reduced motion stops it turning on its own", /prefers-reduced-motion: reduce/.test(globe))
  check("drawn with WebGL, the 2D canvas where WebGL would be software", /createGlRenderer\(canvas, ball\)/.test(globe) && /create2dRenderer\(canvas, ball\)/.test(globe) && /failIfMajorPerformanceCaveat: true/.test(read("components/app/home/globe-gl.ts")))
  check("never sharper than 2x", /MAX_DPR = 2\b/.test(read("components/app/home/globe-scene.ts")) && /Math\.min\(window\.devicePixelRatio \|\| 1, MAX_DPR\)/.test(globe))
  check("it is in the banner, and the banner is on Home", /<BannerGlobe/.test(banner) && /<HomeBanner /.test(dash))
  check("the text stops where the globe's atmosphere begins: one set of numbers places both", /padding: 18px calc\(var\(--gx\) \+ var\(--g\) \* 0\.452 \+ var\(--gap\)\)/.test(banner) && /right: calc\(var\(--gx\) - var\(--g\) \/ 2\);/.test(banner))

  console.log("\nUpgrade to Pro")
  check("the sidebar card has the violet bolt", /<UpgradeBolt size=\{32\} \/>/.test(desktop))
  check("and so does the phone menu", /<UpgradeBolt size=\{34\} \/>/.test(phone))
  check("both on white cards", /border-\[#e6e7eb\] bg-white/.test(desktop) && /border-\[#e6e7eb\] bg-white/.test(phone))
  check("the bolt is white", /fill="#fff"/.test(read("components/app/upgrade-bolt.tsx")))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
