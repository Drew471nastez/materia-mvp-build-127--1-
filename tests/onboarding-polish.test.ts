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

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main()
