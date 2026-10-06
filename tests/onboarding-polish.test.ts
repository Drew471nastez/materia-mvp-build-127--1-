/**
 * ===========================================================================
 *  BOTH ONBOARDINGS: THE WHOLE SCREEN IN THE APP, AND PLAIN WORDS
 * ===========================================================================
 * The creator onboarding (components/app/creator-onboarding-modal.tsx) and
 * the OnePage one (components/onepage/onboarding-modal.tsx) were asked to
 * read less like a template and to fill the screen in the iOS and Android
 * apps, without being rebuilt. So what this holds is small:
 *
 *   APP       at every width in the app, iPad included, the onboarding is the
 *             whole screen with the safe areas kept clear; read after mount,
 *             so the server's HTML and the first render agree
 *   WORDS     no emoji in a heading, no em dash, no borrowed quote on the
 *             loading screen, and none of the words the house rules ban
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

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
    console.log(`  FAIL  ${label}${detail === undefined ? "" : `   ${JSON.stringify(detail)}`}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

/** What a person reads: the JSX text between tags, and string literals in the markup. Comments are left out. */
function visibleText(source: string): string {
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
  const text = [...withoutComments.matchAll(/>([^<>{}]+)</g)].map((m) => m[1].trim()).filter(Boolean)
  return text.join("\n")
}

function main() {
  const onboardings = [
    ["the creator onboarding", "components/app/creator-onboarding-modal.tsx"],
    ["the OnePage onboarding", "components/onepage/onboarding-modal.tsx"],
  ] as const

  for (const [name, file] of onboardings) {
    const source = read(file)
    const text = visibleText(source)
    console.log(`\n${name}`)
    check("the whole screen in the app, at every width", /setNativeFullScreen\(isNativeApp\(\)\)/.test(source) &&
      /nativeFullScreen\s*\?\s*\/\/[^\n]*\n\s*"fixed inset-0 top-0 left-0 w-screen h-\[100dvh\] max-w-none translate-x-0 translate-y-0 rounded-none"/.test(source))
    check("  with the safe areas kept clear", /"max-h-\[100dvh\] pt-\[env\(safe-area-inset-top\)\] pb-\[env\(safe-area-inset-bottom\)\]"/.test(source))
    check("  read after mount, never during render", /useEffect\(\(\) => \{\s*setNativeFullScreen\(isNativeApp\(\)\)\s*\}, \[\]\)/.test(source))
    check("no emoji in what it says", !/\p{Extended_Pictographic}/u.test(text), text.match(/\p{Extended_Pictographic}/u)?.[0])
    check("no em dashes in what it says", !/—/.test(text), text.split("\n").find((l) => l.includes("—")))
    check("no borrowed quote on the loading screen", !/Einstein|Imagination will take you/.test(text))
    check("none of the words the house rules ban", !/\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform)\b/i.test(text))
  }

  const onepage = read("components/onepage/onboarding-modal.tsx")
  console.log("\nthe OnePage onboarding's own words")
  check("it starts with the name, and says everything can change", /Let's get started\s*<\/h1>/.test(onepage) && /Start with your name\. You can change everything later\./.test(onepage))
  check("the goals say what they are for, without sales talk", /Bring customers to my business\./.test(onepage) && !/convert customers/.test(onepage))
  check("the loading screen says what it is doing", /Setting up your OnePage/.test(onepage) && /Almost there/.test(onepage) && /Your OnePage is ready\./.test(onepage))

  /*
    "the back and the name, you can see how bad it is, and it overlaps with
    the content there, misaligned css ... fix it on desktop and mobile very
    small devices ... and improve the smoothness of the onboarding."
    scripts/check-onboarding.mjs measures all of this in a browser at eight
    widths; what is here is what must not be written back by hand.
  */
  const creator = read("components/app/creator-onboarding-modal.tsx")
  console.log("\nthe creator onboarding's top row, its smallest phone and its step change")
  check("the way back and the progress bar are one row of three columns, not a bar with something placed over it",
    /grid shrink-0 grid-cols-\[1fr_auto_1fr\] items-center/.test(creator) && !/absolute left-3 top-2 sm:left-6 sm:top-5/.test(creator))
  check("the way back cannot leave its column, so a long name truncates instead of reaching the bar",
    /min-w-0 max-w-full/.test(creator) && /<span className="hidden truncate sm:inline">\{switchBack\.name\}<\/span>/.test(creator))
  check("on a phone it is the arrow alone, a 44px press, with the name as its label",
    /aria-label=\{`Back to \$\{switchBack\.name\}`\}/.test(creator) && /max-sm:w-11/.test(creator) && /h-11/.test(creator))
  check("what went wrong is a row of its own under the top row, never over the heading",
    /\{switchBackError && \(\s*<p role="alert" className="shrink-0 px-3 pt-1\.5/.test(creator))
  /* "Increase the whole modal a bit so it expands a little more on the screen, but without touching the edges." 930 by 540 became 1040 by 610. */
  check("the card is 1040 by 610 on a computer and never closer than 24px to the window's edges (a 768px tablet once had it 81px off each side)",
    /sm:w-\[min\(930px,calc\(100vw-48px\)\)\] sm:max-w-\[min\(930px,calc\(100vw-48px\)\)\] sm:h-\[min\(540px,calc\(100dvh-48px\)\)\]/.test(creator)
      && /sm:max-h-\[min\(610px,calc\(100dvh-48px\)\)\]/.test(creator) && !/sm:(w|h|max-h)-\[(930|540)px\]/.test(creator))
  check("the row of buttons gives up padding under 384px, where the roomy one stops fitting",
    (creator.match(/max-\[384px\]:/g) ?? []).length >= 6 && /max-\[384px\]:min-w-\[88px\]/.test(creator))
  check("every step has the same bottom padding, so a step change cannot resize the panel it happens in",
    !/currentStep === 2 && "sm:pb-7"/.test(creator))
  /*
    "Make all the state changes and animations smoother and cleaner." A step change is a crossfade: the new
    step arrives while the old one leaves, overlapping in one grid cell (no blank beat between them), on
    opacity and translate alone, inside a scroller that is not itself animated. scripts/check-onboarding.mjs
    samples it frame by frame with the CPU slowed four times.
  */
  check("a step change crossfades the leaving and the arriving step in one cell, on opacity and translate alone",
    /\[\{ opacity: 0, translate: `\$\{dx\}px 0` \}, \{ opacity: 1, translate: "0 0" \}\]/.test(creator)
      && /\[\{ opacity: 1, translate: "0 0" \}, \{ opacity: 0, translate: `\$\{-dx\}px 0` \}\]/.test(creator)
      && /data-onboarding-leaving=\{leavingStep\.step\}/.test(creator) && /data-onboarding-steps="" className="grid min-h-full"/.test(creator)
      && !/flex-1 min-h-0 overflow-y-auto transition-all/.test(creator) && !/isAnimating|slideDirection|STEP_SWAP_MS/.test(creator))
  check("one clock for every move: the step's times and curve are named once",
    /const STEP_IN_MS = 280/.test(creator) && /const STEP_OUT_MS = 160/.test(creator) && /const MOTION_EASE = "cubic-bezier\(0\.22, 1, 0\.36, 1\)"/.test(creator)
      && /duration: STEP_IN_MS, easing: MOTION_EASE/.test(creator) && /duration: STEP_OUT_MS, easing: MOTION_EASE/.test(creator))
  check("a second press while a step is arriving is ignored, the next step starts at its top, and the old one is held where it was scrolled",
    /const goToStep = \(next: number, direction: "left" \| "right"\) => \{\s*if \(leavingStep\) return/.test(creator)
      && /stepScrollRef\.current\?\.scrollTo\(\{ top: 0, behavior: "instant" as ScrollBehavior \}\)/.test(creator)
      && /style=\{\{ marginTop: -leavingStep\.offset \}\}/.test(creator))
  check("with less motion asked for, or back from Stripe, the step simply changes; setup crossfades in from the plans like any other step",
    /const calm = !animate \|\| reducedMotion\(\)/.test(creator) && /showStep\(5, "right", !overrideData\)/.test(creator) && !/setCurrentStep\(5\)/.test(creator))
  check("and its timer is cleared when the onboarding goes",
    /useEffect\(\(\) => \(\) => \{\s*if \(stepTimerRef\.current\) clearTimeout\(stepTimerRef\.current\)\s*\}, \[\]\)/.test(creator))
  check("the bar grows on translate alone (a full fill slid in and clipped, so its round end is never squashed), and stops for less motion",
    /style=\{\{ translate: `\$\{progressWidth - 100\}% 0`, transition: `translate 480ms \$\{MOTION_EASE\}` \}\}/.test(creator) && /data-onboarding-progress-fill=""\s*className="[^"]*motion-reduce:!transition-none"/.test(creator)
      && !/transition-\[width\]/.test(creator))
  check("one row of buttons on every step, each fading with its step, so nothing pops in and the panel never resizes as setup begins",
    (creator.match(/data-onboarding-footer=""/g) ?? []).length === 1
      /* Round 13: Back wherever there is a step to go back to (the store's 2 to 4, and the new account's question and join branch), Skip and Next on the store's first three and the join steps. */
      && /style=\{fadeWith\(backFrom\(currentStep\) !== null/.test(creator) && /style=\{fadeWith\(\(currentStep >= 1 && currentStep <= 3\) \|\| \(isJoinStep\(currentStep\) && currentStep !== JOIN_DONE\)\)\}/.test(creator)
      && !/<div className="h-16" \/>/.test(creator))

  /* "in the store category step, make sure the Other button is next to See more, not in the bar at the bottom with Back, Skip, Next." */
  check("Other sits beside See more among the categories, and the row at the bottom is Back, Skip and Next",
    /data-onboarding-other=""/.test(creator) && creator.indexOf("See more") < creator.indexOf("data-onboarding-other") && creator.indexOf("data-onboarding-other") < creator.indexOf("{/* Back, on the left */}")
      && !/See more\.{2,}/.test(creator))
  check("a chosen category changes colour, not size: the ring is a shadow",
    /const CATEGORY_ON = "bg-\[#1a1a2e\] text-white shadow-\[0_0_0_1px_#1a1a2e/.test(creator) && /aria-pressed=\{selectedCategory === category\}/.test(creator))
  /* "text font size better, the heading, subheading ... cohesive." */
  check("one heading and one line under it on every step, in the app's own ink",
    /* The store's four steps, and round 13's question, name, photo and notifications steps. */
    (creator.match(/<h1 className=\{HEADING\}>/g) ?? []).length === 8 && (creator.match(/<p className=\{SUBHEADING\}>/g) ?? []).length === 8
      && /const HEADING = "text-\[26px\] font-bold leading-\[1\.15\] tracking-\[-0\.02em\] text-\[#1a1a2e\] sm:text-\[36px\]"/.test(creator)
      && /const SUBHEADING = "mt-2 text-\[15px\]/.test(creator) && !/text-gray-500 text-xs sm:text-base/.test(creator))
  /* "cutted there, up": the plans ran into the top row and the Back button in a hard line. */
  check("the step panel's edges fade where more is behind them, set from the scroll and not from state",
    /onScroll=\{updateScrollEdges\}/.test(creator) && /el\.style\.setProperty\("--fade-top", above \? "20px" : "0px"\)/.test(creator) && /maskImage: SCROLL_EDGE_MASK, WebkitMaskImage: SCROLL_EDGE_MASK/.test(creator))
  /* "the last step, it's the old Storelib logo, and it's cut badly in the corners." */
  check("the setup screen draws the one Storelib mark, whole, with no copy of it in this file",
    /import \{ StorelibLogo \} from "@\/components\/brand\/storelib-logo"/.test(creator) && /<StorelibLogo size=\{62\} fluid className="block h-\[54px\] w-\[54px\] sm:h-\[62px\] sm:w-\[62px\]" \/>/.test(creator)
      && !/const StorelibLogo/.test(creator) && !/animate-ping/.test(creator))
  /* Round 12, ask 34: "the Storelib icon on that step a little smaller with a little depth (phones especially)". */
  check("the setup mark is 54px on a phone and 62 from 640, on a box with a soft shadow under its own 7px corner",
    /data-onboarding-setup-mark-box="" className="block rounded-\[7px\] shadow-\[0_10px_22px_-10px_rgba\(26,26,46,0\.30\)/.test(creator))
  /* "after Start free / choosing a plan, the Applying your settings phase transitions smoothly and modern". */
  check("setup arrives by rising into place a piece at a time (the mark, its line, the marks), on opacity, translate and scale, not by sliding sideways",
    /if \(currentStep === 5\) \{/.test(creator) && /\[\{ opacity: 0, translate: "0 12px", scale: "0\.94" \}, \{ opacity: 1, translate: "0 0", scale: "1" \}\]/.test(creator)
      && /delay: 80 \+ i \* 70/.test(creator) && (creator.match(/data-setup-rise=""/g) ?? []).length === 3
      && /\[\{ opacity: 1, scale: "1" \}, \{ opacity: 0, scale: "0\.97" \}\]/.test(creator))
  check("the setup line rolls half a line as it changes, so the two lines pass rather than overlap", /value=\{state\}\s*\/\*[^*]*\*\/\s*lift="0\.55em"/.test(creator))
  /* "the bottom white bar: a softer, more subtle white fade with a light blur". */
  check("the foot of the panel is a soft white over four lightly blurred bands, taking no room and no taps, shown only with more below",
    /const VEIL_BLURS = \[0\.5, 1, 1\.5, 2\]/.test(creator) && /data-onboarding-veil=""\s*className="pointer-events-none relative z-10 -mt-16 h-16 shrink-0"/.test(creator)
      && /backdropFilter: `blur\(\$\{blur\}px\)`/.test(creator) && /veilRef\.current\?\.style\.setProperty\("--veil", below \? "1" : "0"\)/.test(creator))
  const cards = read("components/billing/plan-cards.tsx")
  check("in the onboarding the plans are a hair narrower (668px for the pair, 6px more air on a phone) with 20 to 24px under the pill",
    /compact \? "mx-auto max-w-\[668px\] max-md:px-1\.5"/.test(cards) && /data-plan-interval-row="" className="flex justify-center mb-5 sm:mb-6"/.test(cards))
  /* The line used to be remounted per phase and faded in from nothing, so each change had a blank beat; now it is the shared swap. */
  check("its line crossfades from phase to phase (the shared TextSwap, no blank beat) over marks that fill on translate, and says plainly when it failed",
    /import \{ TextSwap \} from "@\/components\/ui\/text-swap"/.test(creator) && /<TextSwap\s+as="div"\s+align="center"\s+value=\{state\}/.test(creator)
      && !/key=\{state\}/.test(creator) && !/scaleX\(/.test(creator) && /data-onboarding-setup-mark=""/.test(creator)
      && /Creating your store/.test(creator) && /Applying your settings/.test(creator) && /Your store was not saved/.test(creator))
  check("a failed way back clears itself: on the next step, and after six seconds",
    /setSwitchBackError\(null\)\n\s*if \(next === currentStep\) return/.test(creator) && /setTimeout\(\(\) => setSwitchBackError\(null\), 6000\)/.test(creator))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main()
