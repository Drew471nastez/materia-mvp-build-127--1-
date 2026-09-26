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
  /* Changed on purpose: "Remove the Upgrade to Pro in Getting started." */
  check("seven steps, Upgrade to Pro not among them", /SETUP_ORDER: readonly SetupStepId\[\] = \["signup", "guide", "product", "payments", "store", "sale", "domain"\]/.test(progress) && !/label: "Upgrade to Pro"/.test(progress))
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
  check("once all seven are done, the same card shows the challenges", /progress\.phase === "challenges"/.test(cards) && /progress\.challenges : progress\.steps/.test(cards) && /"Challenges" : "Getting started"/.test(cards))

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
  /* Changed back on purpose: "the texture that was the first time, not the one with the dots". */
  const band = homeCss.slice(homeCss.indexOf(".home-plan-head {"), homeCss.indexOf(".home-plan-check {"))
  check("the band is the first deep violet sky: clouds and grain over the violet", /feTurbulence type='fractalNoise' baseFrequency='0\.010 0\.032'/.test(band) && /#1f0b4a 0%, #321170 46%, #4c1d95 100%/.test(band), band.slice(0, 160))
  check("  no dots, and nothing in it moves", !/home-plan-dots/.test(homeCss) && !/home-plan-dots/.test(cards) && !/\.home-plan-head[^{]*\{[^}]*transition/.test(homeCss))
  check("  clipped to the card's corners by a mask too, for iPhone", /\.home-plan-head \{[^}]*mask-image/.test(band))
  check("  the same 46px, the plan's name in white on it", /home-plan-head flex h-\[46px\] shrink-0 items-center rounded-t-\[19px\] px-5/.test(cards) && /id="your-plan-title" className="text-\[13\.5px\] font-semibold text-white"/.test(cards))

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
  check("every hover rule has its played twin, word for word", hovered.length >= 8 && hovered.every(([sel, body]) => played.some(([s, b]) => s === sel && b === body)), JSON.stringify({ hovered: hovered.length, played: played.length }))
  check("on a phone it plays after two seconds 60% on screen, then every six, held 2.2s so the slow lift arrives and settles", /AUTOPLAY_AFTER_MS = 2000/.test(cards) && /AUTOPLAY_EVERY_MS = 6000/.test(cards) && /AUTOPLAY_HOLD_MS = 2200/.test(cards) && /AUTOPLAY_IN_VIEW = 0\.6/.test(cards) && /new IntersectionObserver/.test(cards))
  check("  and stops off screen, under a finger, in a hidden tab, with a mouse and for reduced motion", /const may = inView && !touching && document\.visibilityState === "visible" && !mouse\.matches && !calm\.matches/.test(cards) && /"touchstart"/.test(cards) && /"visibilitychange"/.test(cards))
  check("  and every timer goes with it", /const stop = \(\) => \{\s*window\.clearTimeout\(start\)\s*window\.clearInterval\(cycle\)/.test(cards))
  check("  and nothing plays while a sheet covers the page", /hasAttribute\("data-app-sheet-up"\) \|\| document\.body\.hasAttribute\("data-scroll-locked"\)\) return/.test(cards))
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
  /* Changed on purpose: "make it how it was before... the bolt is white on a purple circle, how it was before, but more depth." */
  check("the sidebar card has the bolt, 28px", /<UpgradeBolt size=\{28\} \/>/.test(desktop))
  check("and so does the phone menu, at its old 32px", /<UpgradeBolt size=\{32\} \/>/.test(phone))
  const cardClass = (src: string) => /data-upgrade-card=""[\s\S]*?className="([^"]*)"/.exec(src)?.[1] ?? ""
  check("the rail's card is the one from before 09-25: light violet, a violet hairline, 12px corners",
    /rounded-\[12px\] border border-violet-100\/60 bg-gradient-to-r from-violet-50\/80 to-purple-50\/80/.test(cardClass(desktop)) && !/shadow/.test(cardClass(desktop)), cardClass(desktop))
  check("  13px title, 11px line", /<p className="truncate text-\[13px\] font-semibold text-neutral-900">\{upgradeTitle\}<\/p>/.test(desktop) && /<p className="truncate text-\[11px\] text-neutral-600">\{upgradeSubtitle\}<\/p>/.test(desktop))
  check("the phone menu's is its own from before: white, a violet hairline, 16px corners",
    /rounded-\[16px\] border border-violet-100\/70 bg-white/.test(cardClass(phone)) && !/shadow/.test(cardClass(phone)), cardClass(phone))
  check("both are a named group, so the bolt answers the card's hover without .group", /^group\/upgrade /.test(cardClass(desktop)) && /^group\/upgrade /.test(cardClass(phone)))
  const bolt = read("components/app/upgrade-bolt.tsx").replace(/\/\*[\s\S]*?\*\//g, "")
  check("the bolt is white on solid #8b5cf6", /bg-\[#8b5cf6\]/.test(bolt) && /UPGRADE_FILL = "#8b5cf6"/.test(bolt) && /fill=\{UPGRADE_INK\}/.test(bolt) && /UPGRADE_INK = "#ffffff"/.test(bolt))
  check("  with depth: light on top, a hairline ring, a darker foot, a soft shadow",
    /shadow-\[inset_0_1px_0_rgba\(255,255,255,0\.3\),inset_0_0_0_1px_rgba\(76,29,149,0\.16\),inset_0_-1px_0_rgba\(76,29,149,0\.3\),0_1px_2px_rgba\(76,29,149,0\.28\),0_2px_6px_-1px_rgba\(76,29,149,0\.2\)\]/.test(bolt))
  check("  a touch deeper under the card's hover", /group-hover\/upgrade:bg-\[#7c4fe6\]/.test(bolt) && /group-hover\/upgrade:shadow-\[/.test(bolt))
  check("  and no gradient or glow", !/gradient|drop-shadow|0 4px 10px/.test(bolt))
  check("the words are the ones from before: Unlock more benefits, in every language as they were",
    /"nav\.unlockBenefits": "Unlock more benefits"/.test(read("lib/i18n/translations.ts")) && /"nav\.unlockBenefits": "Unlock more benefits"/.test(read("lib/i18n/dict/dashboard.ts"))
      && !/Lower fees, your own domain/.test(read("lib/i18n/translations.ts") + read("lib/i18n/dict/dashboard.ts")))
  check("the card goes to the plans page the way the rows go to theirs, on a press this tab follows",
    /onClick=\{\(e\) => \{ if \(isPlainClick\(e\.nativeEvent\)\) onNavigate\?\.\(UPGRADE_HREF\) \}\}/.test(desktop) && /onPrefetch\?\.\(UPGRADE_HREF\)/.test(desktop)
      && /if \(isPlainClick\(e\.nativeEvent\)\) onNavigate\?\.\(UPGRADE_HREF\)/.test(phone) && /prefetchAppPage\(router, UPGRADE_HREF\)/.test(phone))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
