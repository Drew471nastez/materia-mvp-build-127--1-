/**
 * ===========================================================================
 *  NO EM-DASH BETWEEN WORDS IN THE COPY PEOPLE READ
 * ===========================================================================
 *
 * A user pointed at the official welcome note — "Scrie-ne direct aici — îți
 * răspundem" — and said the sentences this product shows should not carry a
 * dash between words. The em-dash (—) and en-dash (–) are marks Storelib's UI
 * copy does not use; a sentence that wants a pause takes a full stop, a label
 * and its value take a middle dot (·), which the app already uses everywhere
 * from "Rochii · Femei" to the domain-setup rows.
 *
 * This suite is the sweep that keeps it that way. It reads every value in the
 * i18n dictionaries — which is where the overwhelming majority of user-facing
 * strings live — and fails if any of them contains an em- or en-dash.
 *
 * ---------------------------------------------------------------------------
 * WHY THE DICTIONARIES AND NOT EVERY .tsx STRING
 * ---------------------------------------------------------------------------
 * Two reasons. The dictionaries are where the copy is SUPPOSED to live, so a
 * new string that reaches a person should be added there and is caught here by
 * construction. And a blanket scan of every quoted string in the codebase
 * cannot tell a sentence from a CSS `calc(70vh - 80px)`, a price range
 * "$10 - $50", a code identifier, or the em-dashes this repo writes by the
 * hundred in its own comments — so it would either drown in false positives or
 * need an ignore-list longer than the rule. The dictionary values are
 * unambiguously prose; the rule can be absolute there.
 *
 * Hyphens WITHIN words are not touched and must not be — "Scrie-ne", "l-ai",
 * "second-hand", "link-in-bio" are correct spellings, and the character in them
 * is the plain hyphen-minus, not an em- or en-dash. This checks only for — and
 * –, which never appear inside a word.
 *
 * Run with:  npm run test:push
 */

import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

import { stripComments } from "./_source"

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
    console.log(`  FAIL  ${name}${detail ? `\n${detail}` : ""}`)
  }
}

const root = process.cwd()

/** Every .ts file under lib/i18n, recursively. */
function dictFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...dictFiles(p))
    else if (name.endsWith(".ts")) out.push(p)
  }
  return out
}

console.log("\nThe copy people read carries no em-dash\n")

const files = dictFiles(join(root, "lib/i18n"))

/**
 * A dictionary line is `"key": "value"` or `"key": "value",`. The value is the
 * second quoted run. Comment lines are skipped — the prose here writes its own
 * em-dashes and is not shipped.
 */
const VALUE = /:\s*"((?:[^"\\]|\\.)*)"/

const offenders: string[] = []
for (const file of files) {
  const rel = file.slice(root.length + 1)
  const lines = readFileSync(file, "utf8").split("\n")
  lines.forEach((line, i) => {
    const trimmed = line.trim()
    if (trimmed.startsWith("*") || trimmed.startsWith("//")) return
    const m = VALUE.exec(line)
    if (m && /[—–]/.test(m[1])) offenders.push(`${rel}:${i + 1}: ${m[1]}`)
  })
}

check(
  "no i18n value contains an em-dash or en-dash",
  offenders.length === 0,
  offenders.length ? "        " + offenders.join("\n        ") : undefined,
)

/**
 * The two consumer strings that live outside the dictionaries — the messages
 * empty state and the official welcome copy — pinned by hand, because they are
 * exactly the surfaces the report came from and a dictionary-only sweep would
 * miss them.
 */
check(
  "the two hand-written consumer notes are clean too",
  (() => {
    // stripComments so the em-dashes these files carry in their prose — and the
    // system-account comment that QUOTES the old line to explain why it went —
    // are not mistaken for shipped copy.
    const inbox = stripComments(readFileSync(join(root, "components/messages/inbox.tsx"), "utf8"))
    const sysFull = stripComments(readFileSync(join(root, "lib/system-account.ts"), "utf8"))
    // OFFICIAL_COPY_FIXES holds the old em-dash sentence on purpose — it is the
    // key the render-time corrector matches. That is not shipped copy; the
    // shipped copy is WELCOME_RO above it, which must be clean.
    const welcome = sysFull.slice(sysFull.indexOf("const WELCOME_RO"), sysFull.indexOf("OFFICIAL_COPY_FIXES"))
    return !/[—–]/.test(inbox) && !/[—–]/.test(welcome)
  })(),
  "        components/messages/inbox.tsx, lib/system-account.ts",
)

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failed:")
  for (const f of failures) console.log(`  · ${f}`)
  process.exit(1)
}
