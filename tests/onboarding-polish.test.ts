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
  check("the card is never wider than the window it is in (a 768px tablet had it 81px off each side)",
    /sm:w-\[930px\] sm:max-w-\[calc\(100vw-40px\)\] sm:h-\[540px\] sm:max-h-\[calc\(100dvh-40px\)\]/.test(creator))
  check("the row of buttons gives up padding under 384px, where the roomy one stops fitting",
    (creator.match(/max-\[384px\]:/g) ?? []).length >= 6 && /max-\[384px\]:min-w-\[88px\]/.test(creator))
  check("every step has the same bottom padding, so a step change cannot resize the panel it happens in",
    !/currentStep === 2 && "sm:pb-7"/.test(creator))
  /* translate, not transform: Tailwind 4's translate-x-3 sets the translate property, so naming transform left the slide jumping. */
  check("a step changes on opacity and translate alone, inside a scroller that is not itself animated",
    /"transition-\[opacity,translate\] ease-out motion-reduce:transition-none motion-reduce:translate-x-0"/.test(creator)
      && !/flex-1 min-h-0 overflow-y-auto transition-all/.test(creator))
  check("the CSS duration and the timer that swaps the step are one number",
    /const STEP_SWAP_MS = 180/.test(creator) && /transitionDuration: `\$\{STEP_SWAP_MS\}ms`/.test(creator) && /\}, STEP_SWAP_MS\)/.test(creator))
  check("a second press while a step is leaving is ignored, and the next step starts at its top",
    /const goToStep = \(next: number, direction: "left" \| "right"\) => \{\s*if \(isAnimating\) return/.test(creator)
      && /stepScrollRef\.current\?\.scrollTo\(\{ top: 0, behavior: "instant" as ScrollBehavior \}\)/.test(creator))
  check("and its timer is cleared when the onboarding goes",
    /useEffect\(\(\) => \(\) => \{\s*if \(stepTimerRef\.current\) clearTimeout\(stepTimerRef\.current\)\s*\}, \[\]\)/.test(creator))
  check("the bar's growth is the width alone, and stops for a person who asked for less motion",
    /transition-\[width\] duration-500 ease-out motion-reduce:transition-none/.test(creator))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main()
