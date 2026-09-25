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
const land = read("components/app/home/globe-land.ts")
const css = read("app/globals.css")
const desktop = read("components/app/sidebar-desktop-nav.tsx")
const phone = read("components/app/sidebar-mobile-nav.tsx")
const quick = read("components/app/home/quick-actions.tsx")
const progress = read("lib/home/progress.ts")
const appLink = read("components/app/app-link.tsx")

/** The HOME CARDS block of globals.css, and nothing else. */
const homeCss = css.slice(css.indexOf("/* ─── HOME CARDS"))

function main() {
  console.log("\nthe Store setup list is gone")
  check("nor its sub-steps, icons or ring", !/stepSubsteps|stepIcons|ProgressCircle|expandedStep/.test(dash))
  check("the id the sidebar's Setup ring scrolls to marks the three cards", /id="store-setup-section"[^>]*>\s*<HomeCards/.test(dash))
  check("the three cards sit under the banner", dash.indexOf("<HomeCards") > dash.indexOf("Dashboard Banner") && dash.indexOf("<HomeCards") < dash.indexOf("<QuickActions"))
  check("and the quick actions are all still there", ["/app/products/new", "/app/onepage", "/app/analytics", "/app/settings?tab=domains"].every((h) => quick.includes(`href: "${h}"`)))

  console.log("\nGetting started (the rules are lib/home/progress, held by tests/home-progress)")
  check("eight steps", /SETUP_ORDER: readonly SetupStepId\[\] = \["signup", "guide", "product", "payments", "store", "sale", "pro", "domain"\]/.test(progress))
  check("signing up is always done", /signup: \{ id: "signup", label: "Sign up", done: true/.test(progress))
  check("Home works them out from the account's facts", /homeProgress\(facts\)/.test(dash) && /<HomeCards progress=\{progress\}/.test(dash))
  check("the website builder is a page in the shell, as the sidebar opens it now", /href: "\/app\/website-builder"/.test(progress) && !/hardNavigation/.test(cards) && !/<a\s+href/.test(cards))
  check("the purple bar counts the same steps", /const completedSteps = progress\.completed/.test(dash) && /const totalSteps = progress\.total/.test(dash))
  check("and its Continue points at Getting started", /onClick=\{bumpGettingStarted\}/.test(dash))
  check("what is left comes first, what is done after", /\[\.\.\.items\.filter\(\(s\) => !s\.done\), \.\.\.items\.filter\(\(s\) => s\.done\)\]/.test(cards))
  check("done steps are crossed out", /line-through/.test(cards))
  check("only the next step carries the arrow", /\{isNext && \(/.test(cards) && /isNext=\{item === next\}/.test(cards))
  check("a step that ticks slides to its place rather than jumping", /row\.animate\(\[\{ transform: `translateY\(\$\{before - top\}px\)` \}/.test(cards))
  check("no sub-steps", !/substep/i.test(cards))
  check("PayPal, Visa and Stripe at its foot", ["paypal", "visa", "stripe"].every((t) => cards.includes(`data-pay-tile="${t}"`)))
  check("once all eight are done, the same card shows the challenges", /progress\.phase === "challenges"/.test(cards) && /progress\.challenges : progress\.steps/.test(cards) && /"Challenges" : "Getting started"/.test(cards))

  console.log("\nevery press on Home moves like the sidebar")
  check("each step that is a page is an AppLink", /<AppLink href=\{href\} className=\{row\}/.test(cards))
  check("the plan's button is one", /<AppLink\s+href=\{free \? "\/app\/settings\/billing\/upgrade" : "\/app\/settings\/billing"\}/.test(cards))
  check("the quick actions are too", /<AppLink\s+key=\{a\.href\}\s+href=\{a\.href\}/.test(quick))
  check("an AppLink fetches the whole page ahead, as the rail's rows do", /prefetchAppPage\(router, href\)/.test(appLink) && /onMouseEnter/.test(appLink) && /onFocus/.test(appLink) && /onPointerDown/.test(appLink))
  check("and tells the shell where it is going on the press", /startNavigationLoading\(href\)/.test(appLink))
  check("the next step's page is fetched once the card is seen", /useWarmWhenSeen\(cardRef, next\?\.href \?\? null\)/.test(cards))
  check("no window.location on Home", !/window\.location/.test(cards) && !/window\.location/.test(quick))

  console.log("\nthe guide")
  check("says Welcome to Storelib, with the Storelib mark", /Welcome to\s*<br \/>\s*Storelib/.test(cards) && /<StorelibMark/.test(cards))
  check("never Academy or Amboras", !/Academy|Amboras/.test(cards))
  check("pressing it bumps Getting started, and is kept as opened", /onClick=\{onOpen \?\? bumpGettingStarted\}/.test(cards) && /markGuideOpened\(\)\s*\n\s*bumpGettingStarted\(\)/.test(dash))
  check("scrolled to first when it is off screen", /scrollIntoView\(\{ behavior: "smooth", block: "center" \}\)/.test(cards))

  console.log("\nYour Plan")
  check("the plan by the name Billing uses", /planDisplayName\(id\)/.test(cards))
  check("its lines from the table the pricing cards read", /OFFERED_PLANS\.find/.test(cards))
  check("Free has lines to show", (OFFERED_PLANS.find((p) => p.id === "free")?.features.length ?? 0) >= 5)
  check("Upgrade to Pro on Free, to the upgrade page", /"Upgrade to Pro"/.test(cards) && /"\/app\/settings\/billing\/upgrade"/.test(cards))
  check("never No plan or Subscribe to plan", !/No plan|Subscribe to plan/.test(cards))
  check("each check is one light grey circle, the same size on every line", /data-plan-check="" className="home-plan-check mt-px flex h-\[18px\] w-\[18px\]/.test(cards) && /text-\[#6b7280\]/.test(cards.slice(cards.indexOf("data-plan-check"))))
  const checkCss = homeCss.slice(homeCss.indexOf(".home-plan-check {"), homeCss.indexOf("}", homeCss.indexOf(".home-plan-check {")))
  check("  #f1f2f4, a 1px #e3e5e8 ring and a lit top edge", /background: #f1f2f4/.test(checkCss) && /0 0 0 1px #e3e5e8/.test(checkCss) && /inset 0 1px 0 rgba\(255, 255, 255/.test(checkCss))
  const sky = homeCss.slice(homeCss.indexOf(".home-plan-sky {"), homeCss.indexOf(".home-plan-check {"))
  check("the band is a violet gradient carrying a halftone of dots in two sizes, masked to fade", /linear-gradient\(100deg/.test(sky) && (sky.match(/radial-gradient\(circle/g) ?? []).length === 2 && /mask-image: linear-gradient\(90deg, transparent/.test(sky))
  check("  drawn by the browser, no image and no noise filter", !/url\(/.test(sky) && !/feTurbulence/.test(sky))

  console.log("\nhover, on a mouse only, never on transform, and played on a phone")
  check("no hover:shadow class, which a tap strips on a touch screen", ![...cards.matchAll(/(?:className=|const CARD = )[{`"]+([^`"]*)/g)].some((m) => /hover:shadow/.test(m[1])))
  check("no .group, whose children lose their transforms on a touch screen", !/className="[^"]*\bgroup\b/.test(cards))
  check("the card's hover is behind (hover: hover) and (pointer: fine)", /@media \(hover: hover\) and \(pointer: fine\) \{\s*\.home-card:hover::before \{ opacity: 1; \}/.test(homeCss))
  check("the tiles move on hover under the same", /@media \(hover: hover\) and \(pointer: fine\) \{[^}]*\}\s*\.home-card:hover \[data-pay-tile="paypal"\]/.test(homeCss))
  check("everything moves on translate, rotate and scale", !/\btransform\s*:/.test(homeCss.slice(0, homeCss.indexOf("@media (prefers-reduced-motion"))))
  const block = homeCss.slice(0, homeCss.indexOf("@media (prefers-reduced-motion"))
  const transitioned = [...block.matchAll(/transition:\s*([^;]+);/g)].flatMap((m) => m[1].split(/,(?![^(]*\))/).map((part) => part.trim().split(/\s+/)[0]))
  check("and only opacity, translate, rotate and scale are ever transitioned: a hover paints nothing", transitioned.length > 0 && transitioned.every((p) => ["opacity", "translate", "rotate", "scale"].includes(p)), transitioned.join(","))
  check("the deeper shadow is a layer that fades in, not a box-shadow that changes", /\.home-card::before \{[^}]*box-shadow:[^}]*opacity: 0;/.test(homeCss) && !/\.home-card:hover \{[^}]*box-shadow/.test(homeCss))
  const hovered = [...block.matchAll(/\.home-(?:card|guide):hover([^{]*)\{([^}]*)\}/g)].map((m) => [m[1].trim(), m[2].trim()])
  const played = [...block.matchAll(/\.home-(?:card|guide)\[data-play\]([^{]*)\{([^}]*)\}/g)].map((m) => [m[1].trim(), m[2].trim()])
  check("every hover rule has its played twin, word for word", hovered.length >= 8 && hovered.every(([sel, body]) => played.some(([s, b]) => s === sel && b === body)), { hovered: hovered.length, played: played.length })
  check("on a phone it plays after two seconds 60% on screen, then every five", /AUTOPLAY_AFTER_MS = 2000/.test(cards) && /AUTOPLAY_EVERY_MS = 5000/.test(cards) && /AUTOPLAY_IN_VIEW = 0\.6/.test(cards) && /new IntersectionObserver/.test(cards))
  check("  and stops off screen, under a finger, in a hidden tab, with a mouse and for reduced motion", /const may = inView && !touching && document\.visibilityState === "visible" && !mouse\.matches && !calm\.matches/.test(cards) && /"touchstart"/.test(cards) && /"visibilitychange"/.test(cards))
  check("  and every timer goes with it", /const stop = \(\) => \{\s*window\.clearTimeout\(start\)\s*window\.clearInterval\(cycle\)/.test(cards))
  check("all three cards play it", (cards.match(/= useHoverAutoplay</g) ?? []).length === 3)
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
  check("it never renders React to turn", !/useState/.test(globe))
  check("a finger can still scroll the page past it", /touchAction: "pan-y"/.test(globe))
  check("grab, and grabbing while dragged", /"grab"/.test(globe) && /"grabbing"/.test(globe))
  check("a throw keeps its speed, up to a limit, and settles back", /MAX_SPEED/.test(globe) && /SETTLE_MS/.test(globe))
  check("reduced motion stops it turning on its own", /prefers-reduced-motion: reduce/.test(globe))
  check("it is in the banner", /<BannerGlobe/.test(dash))
  check("the banner text lets the pointer through to it, the buttons excepted", /pointer-events-none relative z-10[^"]*\[&_a\]:pointer-events-auto \[&_button\]:pointer-events-auto/.test(dash))

  console.log("\nUpgrade to Pro")
  check("the sidebar card has the violet bolt", /<UpgradeBolt size=\{32\} \/>/.test(desktop))
  check("and so does the phone menu", /<UpgradeBolt size=\{34\} \/>/.test(phone))
  check("both on white cards", /border-\[#e6e7eb\] bg-white/.test(desktop) && /border-\[#e6e7eb\] bg-white/.test(phone))
  check("the bolt is white", /fill="#fff"/.test(read("components/app/upgrade-bolt.tsx")))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
