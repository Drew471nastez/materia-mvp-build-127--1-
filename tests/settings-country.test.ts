/**
 * ===========================================================================
 *  SETTINGS: THE COUNTRY FIELD, AND THE HEADER ON A PHONE
 * ===========================================================================
 * "The select country modal in the settings tab should be updated with all
 * the latest UI, like all the other tabs and mobile bottom sheets in
 * settings."  The field is now the Language and Time zone field
 * (components/ui/choice-list) with every country and its flag
 * (components/app/settings/country-picker, lib/account/country).
 *
 * And the header: on a phone "Manage your account and preferences" wrapped
 * into three short lines beside the share pill; the subtitle has the whole
 * width under the title row now.
 *
 * Measured in a browser by scripts/check-settings-header-country.mjs.
 *
 * Run with:  npm run test:push
 */
import { existsSync } from "node:fs"
import { join } from "node:path"
import { readCode } from "./_source"
import { countryChoices, countryLabel, countryOf, countryToSave } from "../lib/account/country"
import { matches } from "../lib/ui/choice-match"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail !== undefined ? `\n          ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`)
  }
}

console.log("\n1. What a profile holds, read back to its country")
check("a code, either case", countryOf("SE") === "SE" && countryOf("se") === "SE")
check("the platform's own name", countryOf("Sweden") === "SE" && countryOf("United States") === "US" && countryOf("united kingdom") === "GB")
check("the names the older list saved", countryOf("Czech Republic") === "CZ" && countryOf("Turkey") === "TR" && countryOf("South Korea") === "KR" && countryOf("Russia") === "RU")
check("a browser's newer or older spelling", countryOf("Türkiye") === "TR" && countryOf("Czechia") === "CZ" && countryOf("Ivory Coast") === "CI")
check("nothing, junk and a made up place are no country", countryOf("") === null && countryOf("   ") === null && countryOf(null) === null && countryOf("Atlantis") === null && countryOf("XX") === null)

console.log("\n2. What the field shows")
check("the name as it is held, so the server and the browser draw the same words", countryLabel("Czech Republic") === "Czech Republic" && countryLabel("Sweden") === "Sweden")
check("a held code as its country's name", countryLabel("SE") === "Sweden" && countryLabel("us") === "United States")
check("nothing for nothing (the field then says Select country)", countryLabel("") === "" && countryLabel(null) === "")
check("a pick saves the English name, as before (the emails print it)", countryToSave("SE") === "Sweden" && countryToSave("US") === "United States")

console.log("\n3. The list")
const list = countryChoices()
check("every country, not the old seventy two", list.length > 240, list.length)
check("by name", list.every((c, i) => i === 0 || list[i - 1].label.localeCompare(c.label) <= 0))
check("each by its ISO code, once", new Set(list.map((c) => c.value)).size === list.length && list.every((c) => /^[A-Z]{2}$/.test(c.value)))
check("and each has its flag in public/flags", list.every((c) => existsSync(join(process.cwd(), "public/flags", `${c.value}.svg`))), list.filter((c) => !existsSync(join(process.cwd(), "public/flags", `${c.value}.svg`))).map((c) => c.value))
const find = (q: string) => list.filter((c) => matches(c, q)).map((c) => c.value)
check('"swe" finds Sweden', find("swe").includes("SE"))
check('"usa", "america" and "us" find the United States', find("usa").includes("US") && find("america").includes("US") && find("us").includes("US"))
check('"uk" and "england" find the United Kingdom', find("uk").includes("GB") && find("england").includes("GB"))
check('"holland" finds the Netherlands and nothing else', find("holland").join() === "NL")
check("accents do not matter", find("cote").includes("CI") && find("sao tome").includes("ST"))
check("built once", countryChoices() === list)

console.log("\n4. The field in Settings")
const form = readCode("components/app/settings-form-new.tsx")
const picker = readCode("components/app/settings/country-picker.tsx")
check("Settings draws the country field, and the old modal and its list are gone",
  /<CountryPicker id="country" value=\{country\} onChange=\{setCountry\} \/>/.test(form) && !/CountrySelectorModal|showCountryModal|const COUNTRIES = \[/.test(form))
check("it is the shared field: a popover on a computer, the shared sheet on a phone", /<ChoicePicker/.test(picker) && /uniform/.test(picker))
check("with the flag in the field and before each name", /fieldLeading=\{code \? <CountryFlag code=\{code\} \/> : null\}/.test(picker) && /leading=\{\(choice, near\) => <CountryFlag code=\{choice\.value\} near=\{near\} \/>\}/.test(picker))
/* Round 12, ask 35: "country flags load fast (an optimized sprite or inline SVG set, lazy below the fold, no layout shift)". */
const spriteFile = readCode("public/flags/sprite.svg")
const spriteTs = readCode("lib/account/flag-sprite.ts")
check("a flag is a <use> of its symbol in one sprite of every flag, drawn only when its row is near the screen",
  /<use href=\{`\$\{FLAG_SPRITE\}#\$\{cc\}`\}/.test(picker) && /new IntersectionObserver\(/.test(picker) && /whenNear\(ref\.current/.test(picker) && !/src=\{`\/flags\//.test(picker))
check("the sprite has a symbol for every country in the list, and its address carries its hash",
  countryChoices().every((c) => spriteFile.includes(`<symbol id="${c.value}"`)) && /export const FLAG_SPRITE = "\/flags\/sprite\.svg\?v=[0-9a-f]{10}"/.test(spriteTs) && !/\sid="(?![A-Z]{2}")/.test(spriteFile))
check("it is fetched while the field is on screen, not when the list opens", /function warmSprite\(\)/.test(picker) && /React\.useEffect\(\(\) => \{\s*warmSprite\(\)\s*\}, \[\]\)/.test(picker))
check("and the box is the same size with or without its flag, so nothing in a row moves", /relative block h-\[14px\] w-\[21px\] shrink-0/.test(picker))
check("the flags are kept a week in the cache", /source: '\/flags\/:path\*'[\s\S]{0,120}max-age=604800/.test(readCode("next.config.mjs")))
check("what a pick saves is lib/account/country's", /onChange=\{\(next\) => onChange\(countryToSave\(next\)\)\}/.test(picker))

console.log("\n5. The shared list the field is")
const choice = readCode("components/ui/choice-list.tsx")
check("ArrowDown from the search lands on the first row, not the second", /if \(e\.defaultPrevented\) return/.test(choice))
check("Home and End on a row go to the first and the last", /e\.key === "Home" \|\| e\.key === "End"/.test(choice))
check("the chosen row is centred in its own scroller, never with scrollIntoView (it moves the page)", /function centerChecked/.test(choice) && !/scrollIntoView\(/.test(choice))
check("the sheet centres it in the commit that opens it, before it is painted", /React\.useLayoutEffect\(\(\) => \{\s*if \(open\) centerChecked\(listRef\.current\)/.test(choice))
check("a uniform list opens with the rows around the chosen one, between spacers of the rows' own height",
  /const OPEN_WITH = 12/.test(choice) && /height: windowed \? from \* rowPx : 0/.test(choice) && /height: windowed \? \(shown\.length - to\) \* rowPx : 0/.test(choice))
check("and the rest arrive after the first frame, in a transition", /requestAnimationFrame\(\(\) => \{\s*timer = window\.setTimeout\(\(\) => React\.startTransition\(\(\) => setWhole\(true\)\), 0\)/.test(choice))
check("in one keyed list, so the first rows are kept when the rest arrive", /<div key="__above"/.test(choice) && /<div key="__below"/.test(choice))
check("the rows are the heights the spacers stand for", /const ROW_PX = \{ compact: 48, regular: 40 \} as const/.test(choice) && /min-h-\[48px\]/.test(choice) && /min-h-\[40px\]/.test(choice))

console.log("\n5b. The sheet and the keyboard (round 12)")
check("the country sheet is a little shorter than the other lists", /sheetHeight="min\(72dvh, 580px\)"/.test(picker) && /export const CHOICE_SHEET_HEIGHT = "min\(80dvh, 640px\)"/.test(choice))
check("focusing the search keeps the sheet's top where it opened: it is given its height less the keyboard, which the shared sheet adds back",
  /return `max\(calc\(\$\{height\} - var\(--kb-inset, 0px\)\), \$\{KEYBOARD_ROOM_PX\}px\)`/.test(choice) && /height=\{sheetAboveKeyboardHeight\(sheetHeight\)\}/.test(choice))
check("and it never reaches under the clock's safe area", /export const SHEET_UNDER_CLOCK = "calc\(100dvh - env\(safe-area-inset-top, 0px\) - 12px - var\(--kb-inset, 0px\)\)"/.test(choice) && /maxHeight=\{SHEET_UNDER_CLOCK\}/.test(choice))

console.log("\n6. The header on a phone")
const header = form.slice(form.indexOf('data-settings-header=""'), form.indexOf("data-settings-list"))
check("nothing in the header is cut: the title and its line wrap, the pill has a row of its own on a phone",
  /flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-start sm:justify-between/.test(header) && /font-bold[^"]*\[overflow-wrap:anywhere\]/.test(header) && !/truncate/.test(header) && /md:hidden max-w-full/.test(header))
check("from 640px the pill is at the top right beside both, as wide as its address up to 360px", /sm:max-w-\[360px\] sm:justify-end/.test(header))
check("the pill no longer takes a share of the row it cannot give back", !/max-w-\[58%\]/.test(header))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
