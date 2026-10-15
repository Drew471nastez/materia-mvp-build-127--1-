/**
 * Writes lib/markets/checkout-words.generated.ts: every sentence the website
 * checkout draws through ct("…") (app/checkout/parts/words.tsx) or marks with
 * checkoutMsg("…"), in the order they are met. Those are the texts listed in
 * Translate › Checkout, translated like the rest of the website.
 *
 *   node scripts/i18n/checkout-sentences.mjs           write it
 *   node scripts/i18n/checkout-sentences.mjs --check   exit 1 when it is out of date
 *
 * tests/checkout-words.test.ts runs the check on every push.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import { join, relative } from "node:path"

const ROOT = join(new URL(".", import.meta.url).pathname, "..", "..")
/* Folders, and single files the checkout's pages draw from elsewhere. */
const DIRS = ["app/checkout", "lib/checkout", "app/receipt", "components/physical/tracking-timeline.tsx", "components/support/order-help.tsx", "components/support/case-photos.tsx"]
const OUT = join(ROOT, "lib/markets/checkout-words.generated.ts")

const walk = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(f) ? [p] : []
  })
const filesOf = (p) => (statSync(p).isDirectory() ? walk(p) : [p])

/* Server code whose answers the checkout shows as they are: its error and message sentences are listed too, and ct() translates them there. */
const SERVER_FILES = ["app/api/checkout/site/route.ts", "lib/checkout/site-quote-server.ts", "lib/checkout/access-link.ts", "lib/physical/rates.ts", "lib/checkout/coupons.ts", "app/api/order-help/route.ts", "lib/support/cases-server.ts"]
const SAID = /\b(?:error|message|couponError)\s*:\s*("(?:[^"\\\n]|\\.)*")|\bexport const [A-Z_]+\s*=\s*("(?:[^"\\\n]|\\.)*")/g

const CALL = /\b(?:ct|checkoutMsg)\(\s*("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\$]|\\.)*`)/g

export function scan() {
  const seen = new Set()
  const out = []
  for (const dir of DIRS) {
    for (const file of filesOf(join(ROOT, dir)).sort()) {
      /* Comments are not the checkout: a block comment, or a line that is only a comment. */
      const src = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
      for (const m of src.matchAll(CALL)) {
        const lit = m[1]
        const text = lit[0] === "`" ? lit.slice(1, -1).replace(/\\(.)/g, "$1") : JSON.parse(lit[0] === "'" ? `"${lit.slice(1, -1).replace(/"/g, '\\"').replace(/\\'/g, "'")}"` : lit)
        if (!text.trim() || seen.has(text)) continue
        seen.add(text)
        out.push([text, relative(ROOT, file)])
      }
    }
  }
  for (const rel of SERVER_FILES) {
    let src = ""
    try {
      src = readFileSync(join(ROOT, rel), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
    } catch {
      continue
    }
    for (const m of src.matchAll(SAID)) {
      const text = JSON.parse(m[1] ?? m[2])
      /* A sentence (not a code like STORELIB100); from the coupon rules, only what a buyer is told about a code they typed. */
      if (!/^[A-Z]/.test(text) || !/\s/.test(text) || seen.has(text)) continue
      if (rel === "lib/checkout/coupons.ts" && !/^(That|This) code/.test(text)) continue
      seen.add(text)
      out.push([text, rel])
    }
  }
  return out
}

/* A buyer's emails (lib/emails/words.ts): every et("…") in the files that build them. */
const EMAIL_FILES = ["lib/physical/email-templates.ts", "lib/emails/layout.ts", "lib/receipts/email.ts", "lib/email.tsx", "lib/physical/jobs-server.ts"]
const EMAIL_CALL = /\bet\(\s*("(?:[^"\\\n]|\\.)*"|`(?:[^`\\$]|\\.)*`)/g

export function scanEmails() {
  const seen = new Set()
  const out = []
  for (const rel of EMAIL_FILES) {
    let src = ""
    try {
      src = readFileSync(join(ROOT, rel), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
    } catch {
      continue
    }
    for (const m of src.matchAll(EMAIL_CALL)) {
      const lit = m[1]
      const text = lit[0] === "`" ? lit.slice(1, -1).replace(/\\(.)/g, "$1") : JSON.parse(lit)
      if (!text.trim() || seen.has(text)) continue
      seen.add(text)
      out.push(text)
    }
  }
  return out
}

function render(list, emails) {
  return `/* Written by scripts/i18n/checkout-sentences.mjs from the ct("…") calls under ${DIRS.join(" and ")} and the answers of the checkout's server code, and the et("…") calls of a buyer's emails. Do not edit: run it again. */\nexport const CHECKOUT_SENTENCES: readonly string[] = [\n${list.map(([t]) => `  ${JSON.stringify(t)},`).join("\n")}\n]\n\nexport const EMAIL_SENTENCES: readonly string[] = [\n${emails.map((t) => `  ${JSON.stringify(t)},`).join("\n")}\n]\n`
}

const want = render(scan(), scanEmails())
if (process.argv.includes("--check")) {
  let have = ""
  try {
    have = readFileSync(OUT, "utf8")
  } catch {
    /* missing: out of date */
  }
  if (have !== want) {
    console.error("lib/markets/checkout-words.generated.ts is out of date: run node scripts/i18n/checkout-sentences.mjs")
    process.exit(1)
  }
  console.log("checkout sentences up to date")
} else {
  writeFileSync(OUT, want)
  console.log(`checkout sentences: ${scan().length}, email sentences: ${scanEmails().length}`)
}
