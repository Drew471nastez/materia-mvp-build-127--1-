/**
 * ===========================================================================
 *  A COLOUR A CREATOR PICKED IS A COLOUR A CREATOR PICKED
 * ===========================================================================
 * "The button colour, or the text, or the colour of the bar, of anything,
 * doesn't save. I refresh the page and it didn't save what I set."
 *
 * It did save. `resolveStorefrontChrome` then threw it away on the way out.
 *
 * The resolver has to answer a real question — did anybody CHOOSE this, or is
 * it the builder writing its whole settings object out again — and it was
 * answering it by looking at the colour itself. A stored white background
 * means nobody chose. A stored black text means nobody chose. A stored
 * #2563eb button means nobody chose.
 *
 * That rule is right for the thousands of configs written before a creator
 * could pick these at all, and it is wrong the moment one of them picks a
 * colour that happens to sit on the list. White button text on a coloured
 * button is not an exotic choice; it is the ordinary one. Choosing it did
 * nothing, every time, with no way to tell it from a save that failed.
 *
 * So the choice is now RECORDED rather than inferred, which is the same shape
 * as `stickyBarChoiceMade` a few fields above it. These cases are the ones a
 * value-sniffing rule cannot get right, and they run against the real
 * resolver rather than against a description of it.
 */
import { resolveStorefrontChrome } from "../lib/store-builder/storefront-chrome"
import { themePresets } from "../lib/store-builder/defaults"

let passed = 0
let failed = 0
const failures: string[] = []

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`)
  }
}

console.log("\nThe bar's colours\n")

/**
 * The four cases the old rule could not tell from a default. Each one is a
 * colour a creator can reach in two clicks from the picker.
 */
const COLLISIONS = [
  { key: "backgroundColor", value: "#ffffff", why: "white bar" },
  { key: "textColor", value: "#000000", why: "black text" },
  { key: "buttonColor", value: "#2563eb", why: "the picker's own blue" },
  { key: "buttonTextColor", value: "#ffffff", why: "white on a coloured button" },
] as const

/** Every scheme, because a scheme is exactly what overwrote the choice. */
const PRESETS = Object.keys(themePresets)

for (const { key, value, why } of COLLISIONS) {
  for (const preset of PRESETS) {
    const chrome = resolveStorefrontChrome(preset, {
      bar: { [key]: value, chosen: [key] },
    })
    check(
      `${preset}: a chosen ${key} of ${value} survives (${why})`,
      chrome.bar[key].toLowerCase() === value,
      `got ${chrome.bar[key]}`,
    )
  }
}

/**
 * THE OTHER HALF, and the reason this cannot be "stored always wins".
 *
 * A config with no record of a choice is a config the builder wrote, and
 * essentially all of them carry white and black. Those still have to give way
 * to the scheme, or picking a dark scheme puts a white strip back across the
 * top of a black page — which is the bug this resolver exists to fix.
 */
for (const preset of PRESETS) {
  const theme = themePresets[preset as keyof typeof themePresets]
  const chrome = resolveStorefrontChrome(preset, {
    bar: {
      backgroundColor: "#ffffff",
      textColor: "#000000",
      buttonColor: "#2563eb",
      buttonTextColor: "#ffffff",
    },
  })
  check(
    `${preset}: with no record of a choice, the scheme still paints the bar`,
    chrome.bar.backgroundColor === theme.subscribeBar.backgroundColor &&
      chrome.bar.textColor === theme.subscribeBar.textColor &&
      chrome.bar.buttonColor === theme.subscribeBar.buttonColor &&
      chrome.bar.buttonTextColor === theme.subscribeBar.buttonTextColor,
    `got ${JSON.stringify(chrome.bar)}`,
  )
}

/**
 * A RECORD OF A CHOICE IS PER FIELD. Choosing a background must not freeze
 * the other three, or the first colour a creator picks pins the whole bar and
 * the scheme can never paint it again. That was the bug behind the `touched`
 * set in the editor, and this is the same bug one layer down.
 */
{
  const theme = themePresets.astrid
  const chrome = resolveStorefrontChrome("astrid", {
    bar: {
      backgroundColor: "#ffffff",
      textColor: "#000000",
      buttonColor: "#2563eb",
      buttonTextColor: "#ffffff",
      chosen: ["backgroundColor"],
    },
  })
  check(
    "one chosen field does not freeze the other three",
    chrome.bar.backgroundColor === "#ffffff" &&
      chrome.bar.textColor === theme.subscribeBar.textColor &&
      chrome.bar.buttonColor === theme.subscribeBar.buttonColor &&
      chrome.bar.buttonTextColor === theme.subscribeBar.buttonTextColor,
    `got ${JSON.stringify(chrome.bar)}`,
  )
}

/**
 * A recorded choice with nothing stored under it is not a colour. This would
 * otherwise reach a `style` attribute as `undefined` and paint the bar's text
 * in whatever it inherits.
 */
{
  const theme = themePresets.default
  const chrome = resolveStorefrontChrome("default", {
    bar: { chosen: ["textColor", "buttonColor"] },
  })
  check(
    "a recorded choice with no colour behind it falls back to the scheme",
    chrome.bar.textColor === theme.subscribeBar.textColor &&
      chrome.bar.buttonColor === theme.subscribeBar.buttonColor,
    `got ${JSON.stringify(chrome.bar)}`,
  )
}

/** Junk in `chosen` is stored data, so it is handled rather than trusted. */
{
  const chrome = resolveStorefrontChrome("default", {
    bar: { buttonColor: "#2563eb", chosen: ["buttonColor", "nonsense", ""] as string[] },
  })
  check("an unknown name in the record is ignored", chrome.bar.buttonColor === "#2563eb")
}

/**
 * ===========================================================================
 *  THE WRITE SIDE
 * ===========================================================================
 * The record is only worth anything if saving a colour writes it, so this
 * reads the route for the three things that have to be true. A resolver that
 * honours `chosen` and an API that never sets it is the same bug with an
 * extra file in it.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

const route = readFileSync(join(process.cwd(), "app/api/creator-profile/route.ts"), "utf8")

check(
  "the route records which colours were chosen",
  /chosen/.test(route),
  "nothing writes the record, so the resolver can never read one",
)
check(
  "the record is merged with what was already recorded",
  /new Set\(\s*\[[^\]]*existingChosen/s.test(route) || /existingChosen[^\n]*\.\.\./s.test(route),
  "a second save that touches one colour would forget the first",
)

/**
 * The editor sends only what was touched, which is what makes a per-field
 * record possible at all. If that ever becomes "send everything", the first
 * save freezes all four.
 */
const editor = readFileSync(join(process.cwd(), "components/storefront/edit-cta-button.tsx"), "utf8")
check(
  "the editor still sends only the fields that were touched",
  /touched\.has\(key\)/.test(editor),
  "sending every field would record every field as chosen",
)

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log("\nFailures:")
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
