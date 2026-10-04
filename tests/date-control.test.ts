/**
 * The date and time setting reads like a sentence and sets in a tap
 * (components/website-builder/editor/controls/datetime-control.tsx); the
 * built-in Countdown timer uses it instead of a text box; Social proof
 * bar's trust logos are blocks.
 *
 *   npx tsx tests/date-control.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { datetimeFromNow, datetimeInWords, normaliseDatetime } from "@/components/website-builder/editor/controls/datetime-control"
import { SECTION_SCHEMAS } from "@/lib/website-builder/section-schemas"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

check("a date as it was typed into the old text box still reads", normaliseDatetime("2026-05-01 18:00") === "2026-05-01T18:00", normaliseDatetime("2026-05-01 18:00"))
check("  as does the stored form, a zone kept", normaliseDatetime("2026-05-01T18:00+02:00") === "2026-05-01T18:00+02:00")
check("  and nonsense is nothing", normaliseDatetime("next tuesday") === "" && normaliseDatetime(undefined) === "")
check("said in words, weekday first, no zone moving it", datetimeInWords("2026-03-14", "23:00") === "Sat, 14 Mar 2026 · 23:00", datetimeInWords("2026-03-14", "23:00"))
const base = new Date("2026-03-09T18:00").getTime()
check("how far away: days and hours inside a week", datetimeFromNow("2026-03-14", "23:00", base) === "in 5 days, 5 hours", datetimeFromNow("2026-03-14", "23:00", base))
check("  days alone past a week", datetimeFromNow("2026-03-30", "18:00", base) === "in 21 days")
check("  minutes when it is close, and 'ago' once it has passed", datetimeFromNow("2026-03-09", "18:40", base) === "in 40 minutes" && datetimeFromNow("2026-03-07", "18:00", base) === "2 days ago")

const control = read("components/website-builder/editor/controls/datetime-control.tsx")
check("a date picker and a time picker, side by side", /type="date"/.test(control) && /type="time"/.test(control) && !/type="datetime-local"/.test(control))
check("shortcuts from now, keeping the time or ending the day", /label: "1 day"/.test(control) && /label: "Month end"/.test(control) && /const keepTime = time \|\| "23:59"/.test(control))
check("no em dash in what it prints", !/>[^<]*—[^<]*</.test(control))

const countdown = SECTION_SCHEMAS.countdown_timer
const ends = countdown?.fields?.find((f) => f.id === "end_date")
check("the Countdown timer's end is a date setting, not a text box", ends?.type === "datetime", ends)
const renderer = read("components/website-builder/sections/renderers/CountdownTimerSection.tsx")
check("its words and digits are made to read on their ground", /readableOn\(bg, \[c\.image_overlay_text, c\.heading, c\.text\]\)/.test(renderer) && /color: digit/.test(renderer))

const proof = SECTION_SCHEMAS.social_proof_bar
check("Social proof bar: trust logos are blocks, up to eight", proof?.blocks?.[0]?.type === "trust_logo" && proof?.max_blocks === 8 && !proof.fields?.some((f) => /^trust_logo_\d$/.test(f.id)))
check("  a bar saved with the four numbered logos still shows them", /legacyLogo\(own, s\.trust_logo_1\)[\s\S]{0,200}legacyLogo\(own, s\.trust_logo_4\)/.test(read("components/website-builder/sections/renderers/SocialProofBarSection.tsx")))

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed) process.exit(1)
