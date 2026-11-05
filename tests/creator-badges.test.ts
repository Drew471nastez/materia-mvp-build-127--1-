/**
 * ===========================================================================
 *  BADGES STORELIB GRANTS A CREATOR
 * ===========================================================================
 * lib/creators/badges.ts decides which marks go beside a creator's name, from
 * `profiles.badges` once the migration has run and from a grant keyed by the
 * handle before it has. Evaluated, not pattern-matched: the rule is which
 * inputs produce which badges.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { creatorBadges, CREATOR_BADGES } from "@/lib/creators/badges"

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
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

console.log("\nWhich badges a creator has\n")

check("Luca Dragoste is a Veteran before the column exists", same(creatorBadges({ username: "lucadragoste" }), ["veteran"]))
check("whatever case the handle is stored in", same(creatorBadges({ username: "LucaDragoste" }), ["veteran"]))
check("and once the column holds it, once, not twice", same(creatorBadges({ username: "lucadragoste", badges: ["veteran"] }), ["veteran"]))
check("anybody else has none", same(creatorBadges({ username: "someone-else" }), []))
check("unless the column grants one", same(creatorBadges({ username: "someone-else", badges: ["veteran"] }), ["veteran"]))
check("an id the site does not know is dropped", same(creatorBadges({ username: "someone-else", badges: ["legend", 3, null] }), []))
check("a column that is not a list is ignored", same(creatorBadges({ username: "someone-else", badges: "veteran" }), []))
check("no profile, no badges", same(creatorBadges(null), []) && same(creatorBadges(undefined), []))
check("the Veteran badge says Veteran", CREATOR_BADGES.veteran.label === "Veteran")

console.log("\nWhere they are drawn, and how they are stored\n")

const header = read("components/store-builder/unified-section-renderer.tsx")
const creatorPage = read("app/(storelib)/(marketing)/u/[username]/page.tsx")
const productPage = read("app/(storelib)/(marketing)/p/[slug]/page.tsx")
check("the creator page hands both header branches the badges", (creatorPage.match(/badges=\{creatorBadges\(profile\)\}/g) ?? []).length === 2)
check("the header draws them after the name", /<CreatorBadges badges=\{badges\}/.test(header))
check("both creator rows on a product page draw them", (productPage.match(/<CreatorBadges badges=\{creatorBadgeIds\}/g) ?? []).length === 2)
const migration = read("supabase/migrations/20261001_creator_badges.sql")
check("the column is a list", /add column if not exists badges text\[\] not null default '\{\}'/.test(migration))
check("a creator cannot write their own through the API", /current_user in \('authenticated', 'anon'\)/.test(migration) && /before insert or update on public\.profiles/.test(migration))
check("and the grant is the same one the code makes", /lower\(username\) = lower\('lucadragoste'\)/.test(migration))
const badge = read("components/storefront/creator-badges.tsx")
check("the name shows on hover and on a tap", /onPointerEnter/.test(badge) && /touched\.current/.test(badge))
check("and a tap inside a link does not follow it", /e\.preventDefault\(\)\s*\n\s*e\.stopPropagation\(\)/.test(badge))

/* The paste-ready part: one whole statement per line, listed, and checked after. */
{
  const part = read("supabase/sql/run-now/27_creator_badges.sql")
  const body = part.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => l.trim())
  check("run-now part 27 is one whole statement per line", body.length > 0 && body.every((l) => /;\s*$/.test(l)))
  check("and keeps the trigger that stops self-granted badges", /CREATE TRIGGER profiles_keep_badges BEFORE INSERT OR UPDATE ON public\.profiles/.test(part))
  check("and is listed in the run-now README", /27_creator_badges\.sql/.test(read("supabase/sql/run-now/README.md")))
  check("and the after check reads it", /p27_creator_badges/.test(read("supabase/sql/run-now/99_check_after.sql")))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
