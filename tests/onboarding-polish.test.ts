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
import { untt } from "./i18n-source"

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
const read = (p: string) => untt(readFileSync(join(process.cwd(), p), "utf8"), p)

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
      (/nativeFullScreen\s*\?\s*\/\/[^\n]*\n\s*"fixed inset-0 top-0 left-0 w-screen h-\[100dvh\] max-w-none translate-x-0 translate-y-0 rounded-none"/.test(source)
        || /"fixed inset-0 left-0 top-0 h-\[100dvh\] w-screen max-w-none sm:max-w-none translate-x-0 translate-y-0/.test(source)))
    check("  with the safe areas kept clear", /"max-h-\[100dvh\] pt-\[env\(safe-area-inset-top\)\] pb-\[env\(safe-area-inset-bottom\)\]"/.test(source)
      || (/pt-\[max\(12px,env\(safe-area-inset-top\)\)\]/.test(source) && /pb-\[max\(24px,env\(safe-area-inset-bottom\)\)\]/.test(source)))
    check("  read after mount, never during render", /useEffect\(\(\) => \{\s*setNativeFullScreen\(isNativeApp\(\)\)\s*\}, \[\]\)/.test(source))
    check("no emoji in what it says", !/\p{Extended_Pictographic}/u.test(text), text.match(/\p{Extended_Pictographic}/u)?.[0])
    check("no em dashes in what it says", !/—/.test(text), text.split("\n").find((l) => l.includes("—")))
    check("no borrowed quote on the loading screen", !/Einstein|Imagination will take you/.test(text))
    check("none of the words the house rules ban", !/\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform)\b/i.test(text))
  }

  const onepage = read("components/onepage/onboarding-modal.tsx")
  console.log("\nthe OnePage onboarding's own words")
  check("it starts with the name, and says everything can change", /Let('|&apos;)s get started\s*<\/h1>/.test(onepage) && /Start with your name\. You can change everything later\./.test(onepage))
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
    /aria-label=\{`Back to \$\{switchBack\.name\}`\}/.test(creator) && /data-onboarding-switch-back=""[\s\S]{0,400}h-11/.test(creator))
  check("what went wrong is a row of its own under the top row, never over the heading",
    /\{switchBackError && \(\s*<p role="alert" className="shrink-0 px-4 pt-1/.test(creator))
  /* "Increase the whole modal a bit so it expands a little more on the screen, but without touching the edges." 930 by 540 became 1040 by 610. */
  /* Changed on purpose: 71769f95 (join card matches OnePage size) made the card 930 by 540, clamped to the window, and its column's limit follows it. */
  /* Changed on purpose (the full screen redesign): the setup is the whole window at every width, on the home page's film, so the app and the browser are the same screen. */
  check("no fixed card: the steps sit in one page scroll on the film, scrolled when they do not fit, so nothing is cut off at any zoom",
    /data-onboarding-scroller=""\s*className="min-h-0 flex-1 overflow-y-auto overscroll-contain/.test(creator) && /data-onboarding-steps="" className="relative w-full min-w-0"/.test(creator)
      && /<OnboardingBackdrop \/>/.test(creator) && /heroVideoSource\(\)/.test(readFileSync(join(process.cwd(), "components/onboarding/film-backdrop.tsx"), "utf8")) && !/sm:(w|h|max-h)-\[(930|540)px\]/.test(creator) && !/sm:w-\[min\(930px/.test(creator))
  /* Changed on purpose: 0be8bd1a (two slide first run) lets Next drop its minimum width and set smaller type under 384px, instead of keeping 88px. */
  check("Back and Continue share the row by flex, so the narrowest phone fits them: Continue takes what Back leaves",
    /const NAV_NEXT = "inline-flex h-12 min-w-0 flex-1/.test(creator) && /const NAV_BACK = "inline-flex h-12 shrink-0/.test(creator))
  check("every step has the same bottom padding, so a step change cannot resize the panel it happens in",
    !/currentStep === 2 && "sm:pb-7"/.test(creator))
  /*
    "Make all the state changes and animations smoother and cleaner." A step change is a crossfade: the new
    step arrives while the old one leaves, overlapping in one grid cell (no blank beat between them), on
    opacity and translate alone, inside a scroller that is not itself animated. scripts/check-onboarding.mjs
    samples it frame by frame with the CPU slowed four times.
  */
  check("a step change crossfades the leaving and the arriving step from the same top, on opacity and translate alone",
    /\[\{ opacity: 0, translate: `\$\{dx\}px 0` \}, \{ opacity: 1, translate: "0 0" \}\]/.test(creator)
      && /\[\{ opacity: 1, translate: "0 0" \}, \{ opacity: 0, translate: `\$\{-dx\}px 0` \}\]/.test(creator)
      && /data-onboarding-leaving=\{leavingStep\.step\}/.test(creator) && /data-onboarding-steps=""/.test(creator) && /absolute inset-x-0 top-0/.test(creator)
      && !/flex-1 min-h-0 overflow-y-auto transition-all/.test(creator) && !/isAnimating|slideDirection|STEP_SWAP_MS/.test(creator))
  /* Changed on purpose: 783f7748 (smoother morph) gives a join slide its own named arrival time, JOIN_STEP_IN_MS, on the same curve. */
  /* Changed on purpose (the full screen redesign): "polished 200ms transitions". */
  check("one clock for every move: the step's times and curve are named once, about 200ms",
    /const STEP_IN_MS = 220/.test(creator) && /const STEP_OUT_MS = 160/.test(creator) && /const MOTION_EASE = "cubic-bezier\(0\.22, 1, 0\.36, 1\)"/.test(creator)
      && /const JOIN_STEP_IN_MS = 220/.test(creator) && /const inMs = joinSlide \? JOIN_STEP_IN_MS : STEP_IN_MS/.test(creator)
      && /duration: inMs, easing: MOTION_EASE/.test(creator) && /duration: STEP_OUT_MS, easing: MOTION_EASE/.test(creator))
  check("a second press while a step is arriving is ignored, the next step starts at its top, and the old one is held where it was scrolled",
    /const goToStep = \(next: number, direction: "left" \| "right"\) => \{\s*if \(leavingStep\) return/.test(creator)
      && /stepScrollRef\.current\?\.scrollTo\(\{ top: 0, behavior: "instant" as ScrollBehavior \}\)/.test(creator)
      && /style=\{\{ marginTop: -leavingStep\.offset \}\}/.test(creator))
  check("with less motion asked for, or back from Stripe, the step simply changes; setup crossfades in from the plans like any other step",
    /const calm = !animate \|\| reducedMotion\(\)/.test(creator) && /showStep\(5, "right", !overrideData\)/.test(creator) && !/setCurrentStep\(5\)/.test(creator))
  check("and its timer is cleared when the onboarding goes",
    /useEffect\(\(\) => \(\) => \{\s*if \(stepTimerRef\.current\) clearTimeout\(stepTimerRef\.current\)\s*\}, \[\]\)/.test(creator))
  check("the bar grows on translate alone (a full fill slid in and clipped, so its round end is never squashed), and stops for less motion",
    /style=\{\{ translate: `\$\{progressWidth - 100\}% 0`, transition: `translate 420ms \$\{MOTION_EASE\}` \}\}/.test(creator) && /data-onboarding-progress-fill=""\s*className="[^"]*motion-reduce:!transition-none"/.test(creator)
      && !/transition-\[width\]/.test(creator) && /role="progressbar"/.test(creator))
  check("one row of buttons, Back and Continue, drawn by one function for every step, at the foot of its card",
    (creator.match(/data-onboarding-footer=""/g) ?? []).length === 1 && /const renderNav = \(step: number\) =>/.test(creator)
      && (creator.match(/\{renderNav\(step\)\}/g) ?? []).length === 1 && !/<div className="h-16" \/>/.test(creator))

  /* "in the store category step, make sure the Other button is next to See more, not in the bar at the bottom with Back, Skip, Next." */
  /* Changed on purpose (the full screen redesign): "Remove Skip buttons. Keep consistent Back/Continue navigation." The category step became what they came to do. */
  check("no Skip anywhere: the row is Back and Continue (Not now only declines notifications)",
    !/data-onboarding-skip/.test(creator) && !/tt\("Skip"\)/.test(creator) && creator.indexOf('data-onboarding-back=""') < creator.indexOf('data-onboarding-next=""'))
  check("a chosen goal changes colour and its mark, not its size: several can be chosen",
    /const GOAL_ON = "bg-\[#1a1a2e\] text-white/.test(creator) && /aria-pressed=\{on\}/.test(creator) && /cur\.includes\(id\) \? cur\.filter/.test(creator)
      && ["Sell online", "Digital products", "Courses", "Communities", "Services", "Link in bio"].every((g) => creator.includes(g)))
  /* "text font size better, the heading, subheading ... cohesive." */
  /* Changed on purpose (the full screen redesign): the words sit on the film, white, from one table, and the cards hold only what is filled in. */
  check("one heading and one line under it on every step, from one table, in one type scale",
    /const viewHead = \(step: number\)/.test(creator) && /<h1 className=\{VIEW_TITLE\}>\{head\.title\}<\/h1>/.test(creator) && /<p className=\{VIEW_SUB\}>\{head\.sub\}<\/p>/.test(creator)
      && (creator.match(/<h1 className=\{VIEW_TITLE\}>/g) ?? []).length === 1 && !/These will appear on your OnePage/.test(creator))
  /* "cutted there, up": the plans ran into the top row and the Back button in a hard line. */
  /* Changed on purpose (the full screen redesign): "Reduce aggressive bottom white fades." Nothing fades over a step; the page scrolls. */
  check("nothing fades over the edges of a step",
    !/maskImage: SCROLL_EDGE_MASK/.test(creator) && !/data-onboarding-veil|VEIL_BLURS|veilRef/.test(creator))
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
  /* "can't select a plan ... that fade there is too aggressive": the plans scroll on a computer too, under a 12px edge fade and no white veil. */
  /* Changed on purpose (round 2 of the redesign): no modal round the plans; they sit on the film like every step, and Back is a round arrow beside the heading. */
  check("the plans sit on the film with every plan whole, Back a round arrow beside the heading at the left and Monthly / Yearly at the right",
    /data-onboarding-view="plans" className="mx-auto w-full max-w-\[1056px\]"/.test(creator) && /compactHeading=\{/.test(creator) && /aria-label="Back"/.test(creator))
  check("the top row has no way out: no Not now", !/data-onboarding-leave/.test(creator))
  check("the steps sit from the top and the leaving one takes no room, so nothing jumps when the next is taller or shorter",
    /data-onboarding-steps="" className="relative w-full min-w-0"/.test(creator) && /className="pointer-events-none absolute inset-x-0 top-0"/.test(creator) && !/my-auto grid/.test(creator))
  check("the page comes first and starts the setup: Let's get started", creator.indexOf("data-onboarding-identity") > -1 && /\{step === 1 && \(\s*<div data-onboarding-identity/.test(creator) && /Let's get started/.test(creator))
  check("what brings them here is two pills to a row", /className="grid grid-cols-2 gap-2 sm:gap-3">/.test(creator) && /What brings you here\?/.test(creator))
  const cards = read("components/billing/plan-cards.tsx")
  /* Changed on purpose (wave 13): three plans now (Scale re-opened), so the onboarding row is 920px for the three, still with 6px more air on a phone. */
  /* Changed on purpose (pricing round 5): the compact cards sit on their grey ground, a 980px row with 8px of ground round them on a phone. */
  check("in the onboarding the plans row takes the card's width with the heading at its left and the switch at its right",
    /split != null \? "max-w-\[1056px\]" : "max-w-\[980px\]"/.test(cards) && /data-plan-split="" className="mb-6 flex flex-col items-start gap-4 sm:mb-8 md:flex-row md:items-center md:justify-between/.test(cards)
      && /data-plan-interval-row="" className="flex justify-center mb-5 sm:mb-6"/.test(cards))
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
