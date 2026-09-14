/**
 * ===========================================================================
 *  SIX WORDS, AND WHAT COUNTS AS A WORD
 * ===========================================================================
 * The product page's bar puts one line of the creator's bio under their name
 * on a phone. The cut is made in a string rather than by CSS, because CSS
 * cuts mid-word at whatever width the device happens to be and a long first
 * word can fill the line on its own.
 *
 * The bio comes out of a plain textarea, so the input is not tidy: it can
 * arrive with newlines, double spaces, a trailing space, or be missing
 * entirely. Every one of those has to come out as one clean line or no line
 * at all, and none of them is obvious from reading the function.
 *
 * scripts/check-product-bar.mjs measures the rendered row in a browser.
 */
import { shortBio, BIO_WORD_LIMIT } from "../lib/store-builder/short-bio"

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

console.log("\nSix words of a bio")

check("six is the limit", BIO_WORD_LIMIT === 6, String(BIO_WORD_LIMIT))

{
  const long = "Handmade ceramic tableware fired in small batches outside Lisbon"
  const cut = shortBio(long)
  check(
    "a long bio keeps its first six words",
    cut === "Handmade ceramic tableware fired in small…",
    cut,
  )
  check("and ends in one ellipsis character, not three periods", /[^.]…$/.test(cut), cut)
}

{
  const short = "Ceramics from Lisbon"
  check("a short bio is left exactly as it is", shortBio(short) === short, shortBio(short))
}

check(
  "a bio of exactly six words is not cut",
  shortBio("one two three four five six") === "one two three four five six",
  shortBio("one two three four five six"),
)
check(
  "the seventh word is what triggers the cut",
  shortBio("one two three four five six seven") === "one two three four five six…",
  shortBio("one two three four five six seven"),
)

// ---------------------------------------------------------------------------
// What a textarea actually hands over
// ---------------------------------------------------------------------------
check(
  "a bio written across three lines comes back as one",
  shortBio("Ceramics\nfrom\nLisbon") === "Ceramics from Lisbon",
  JSON.stringify(shortBio("Ceramics\nfrom\nLisbon")),
)
check(
  "runs of spaces collapse instead of counting as words",
  shortBio("Ceramics    from     Lisbon") === "Ceramics from Lisbon",
  JSON.stringify(shortBio("Ceramics    from     Lisbon")),
)
check(
  "a trailing space does not become a seventh word",
  shortBio("one two three four five six   ") === "one two three four five six",
  JSON.stringify(shortBio("one two three four five six   ")),
)

// ---------------------------------------------------------------------------
// No bio at all: the row has to render without a second line
// ---------------------------------------------------------------------------
for (const [label, value] of [
  ["missing", undefined],
  ["null", null],
  ["empty", ""],
  ["only spaces", "   "],
  ["only newlines", "\n\n"],
] as const) {
  check(`${label} gives an empty string, so no second line is drawn`, shortBio(value) === "", JSON.stringify(shortBio(value)))
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failing:", failures.join(", "))
  process.exit(1)
}
