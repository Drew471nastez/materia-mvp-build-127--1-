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
  check("  no dots", !/home-plan-dots/.test(homeCss) && !/home-plan-dots/.test(cards))
  /* Changed on purpose: it was "nothing in it moves". Asked for again: "when I hover, the sky texture moved very smooth, and when I hovered out it goes back very smooth". */
  check("  its clouds drift on hover as they first did, a layer slid on translate, and the band itself never transitions", /\.home-plan-head::before \{[^}]*baseFrequency='0\.010 0\.032'[^}]*transition: translate \d+ms/.test(band) && !/\.home-plan-head \{[^}]*transition/.test(band) && /\.home-card:hover \.home-plan-head::before \{ translate: -\d+px 0; \}/.test(homeCss))
  check("  the darker left edge lies over the clouds, so the white name reads wherever they are", /\.home-plan-head::after \{[^}]*linear-gradient\(90deg, rgba\(18, 6, 46, 0\.62\)/.test(band))
  /* The card rises as well as darkening its edge: "the container moved very smoothly" when hovered in and out. */
  check("the card rises a little on hover, on translate, with a strip under it so a still mouse on its edge keeps it", /\.home-card:hover \{ translate: 0 -\d+px; \}/.test(homeCss) && /\.home-card \{[^}]*translate \d+ms/.test(homeCss) && /\.home-card::after \{[^}]*top: 100%;/.test(homeCss))
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
  /* "Make sure it never stops, never glitches, never pauses." It turns through a scroll; the cost is kept down by a frame budget instead. */
  check("the globe never rests while the page scrolls, and draws at most every 15ms when nobody holds it",
    !/scrolling/.test(globe) && !/addEventListener\("scroll"/.test(globe) && /const IDLE_FRAME_MS = 15/.test(globe) && /!dragging && painted && now - painted < IDLE_FRAME_MS/.test(globe))
  check("one turn that never starts over: a remount carries on the same angle and the same context", /yaw = pose\.yaw \+/.test(globe) && /pose\.at = performance\.now\(\)/.test(globe) && /if \(!reuse\(\)\) mount\(true\)/.test(globe) && /KEEP_MS/.test(globe))
  check("a pause (hidden tab, off screen) resumes by one frame's step, not the pause's", /last = 0\s*\n\s*frame = requestAnimationFrame\(tick\)/.test(globe))
  check("it never renders React to turn", !/useState/.test(globe))
  /* "When I touch over the globe it should not scroll, it should just let me interact with the globe." */
  /* Round 7, the same ask again: a finger on the ball is the globe's, both ways, and the page does not scroll under it. */
  check("a finger on the ball turns and tips it and never scrolls the page: touch-action none on the round grip",
    /data-home-globe-grip=""[\s\S]{0,400}touchAction: "none"/.test(globe) && /rounded-full/.test(globe) && /\n\s*tilt = Math\.max\(TILT_MIN/.test(globe) && !/byMouse/.test(globe))
  check("the canvas takes no touches, so the rest of its box scrolls", /pointer-events:none/.test(globe))
  check("and the banner's text still scrolls the page", /\.home-banner-text \{[^}]*touch-action: pan-y;/.test(banner))
  check("grab, and grabbing while dragged", /cursor-grab/.test(globe) && /"grabbing"/.test(globe))
  check("a throw keeps its speed, up to a limit, and settles back", /MAX_SPEED/.test(globe) && /SETTLE_MS/.test(globe))
  check("reduced motion stops it turning on its own", /prefers-reduced-motion: reduce/.test(globe))
  check("drawn with WebGL, the 2D canvas where WebGL would be software", /createGlRenderer\(canvas, ball\)/.test(globe) && /create2dRenderer\(canvas, ball\)/.test(globe) && /failIfMajorPerformanceCaveat: true/.test(read("components/app/home/globe-gl.ts")))
  check("never sharper than 2x", /MAX_DPR = 2\b/.test(read("components/app/home/globe-scene.ts")) && /Math\.min\(window\.devicePixelRatio \|\| 1, MAX_DPR\)/.test(globe))
  /* Changed on purpose: "Not like a swipe carousel ... make it fade out" became, on the owner's phone
     recording, "when I swipe to change the banner ... and the banner autoplay switch to the next
     announcement, it's very bugged, glitchy, not smooth at all": the fade left a blank banner between
     two slides. Every change is now one slide move, the old out and the new in together. */
  check("a change is one move on transform: the old slide out and the next in together, never a fade",
    /export const MOVE_MS = 480/.test(banner) && /export const MOVE_EASE = "cubic-bezier\(0\.22, 1, 0\.36, 1\)"/.test(banner) &&
    /el\.animate\(\[\{ transform: tx\(from\) \}, \{ transform: tx\(to\) \}\], opts\)/.test(banner) &&
    !/@keyframes home-banner-in/.test(banner) && !/transition: opacity 150ms/.test(banner) && !/opacity: 0;/.test(banner.slice(banner.indexOf(".home-banner-slide {"))))
  check("a swipe drags the text one to one on a frame, with no React render per move, and carries on at the throw's speed or settles back",
    /s\.frame = requestAnimationFrame\(\(\) => \{/.test(banner) && /placeDrag\(s\.o\)/.test(banner) && !/setState|useState[^\n]*offset/.test(banner.slice(banner.indexOf("const onPointerMove"), banner.indexOf("const onPointerEnd"))) &&
    /\(4\.5 \* left\) \/ Math\.abs\(v\)/.test(banner) && /moveTo\(mm\.index, dir, false/.test(banner))
  check("the slides share one grid cell, so every button sits at one height under the tallest copy",
    /\.home-banner-stack \{[^}]*display: grid;/.test(banner) && /\.home-banner-slide \{\s*grid-area: 1 \/ 1;/.test(banner) && /\.home-banner-cta-row \{ margin-top: auto; padding-top: 10px; \}/.test(banner))
  check("with reduced motion there is no clock, and a change is simply there", /if \(!fill \|\| latest\.current\.count < 2 \|\| reducedMotion\(\)\) return/.test(banner) && /if \(reducedMotion\(\)\) \{\s*\/\* Reduced motion: the new slide is simply there\. \*\//.test(banner))
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
  /* Changed on purpose: "more depth, and a gradient, a little bit, not so much." */
  check("the bolt is white on the app's violet, #8b5cf6 at its middle", /bg-\[#8b5cf6\]/.test(bolt) && /UPGRADE_FILL = "#8b5cf6"/.test(bolt) && /fill=\{UPGRADE_INK\}/.test(bolt) && /UPGRADE_INK = "#ffffff"/.test(bolt))
  check("  a gentle gradient, lighter on top and deeper at the foot, no glow", /bg-\[linear-gradient\(180deg,#9d74fa_0%,#8b5cf6_52%,#7a48ea_100%\)\]/.test(bolt) && !/radial-gradient|0 0 \d+px rgba\(139/.test(bolt))
  check("  with depth: light on top, a hairline ring, a darker foot, a two-step shadow",
    /shadow-\[inset_0_1px_0_rgba\(255,255,255,0\.38\),inset_0_0_0_1px_rgba\(76,29,149,0\.18\),inset_0_-1\.5px_0_rgba\(76,29,149,0\.34\),0_1px_2px_rgba\(76,29,149,0\.3\),0_4px_10px_-3px_rgba\(76,29,149,0\.34\)\]/.test(bolt))
  check("  a touch deeper under the card's hover", /group-hover\/upgrade:brightness-\[0\.94\]/.test(bolt) && /group-hover\/upgrade:shadow-\[/.test(bolt))
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
