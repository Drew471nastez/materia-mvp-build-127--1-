/**
 * ===========================================================================
 *  WHO SOMEBODY IS: THE MARKS AFTER THE NAME, AND THE NAME ITSELF
 * ===========================================================================
 *
 * Two features, one subject. Both fail quietly:
 *
 *   A BADGE says "this account speaks for Storelib". If it can be granted by
 *   anything other than a column in the database, it is worth nothing. If it
 *   renders without a label, it is a logo beside a stranger's name, which reads
 *   as an advertisement rather than as a statement about who is talking to you.
 *
 *   A USERNAME is an address. Every listing somebody has published is linked
 *   from it. Deriving it from the display name without asking would change that
 *   address the first time anybody edits their own name — silently, and for
 *   everything they have ever posted.
 *
 * The pure parts — slugifying, suggesting — are RUN here rather than read,
 * because they are arithmetic on strings and need no browser. The rest is read,
 * because the failures those have are structural.
 *
 * Run with:  npm run test:push
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"

import { stripComments } from "./_source"

import { baseUsernameFor, slugifyUsername, usernameSuggestions } from "../lib/profile/username"
import { isValidUsername } from "../lib/reserved-words"

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
const read = (p: string) => readFileSync(join(root, p), "utf8")
const code = (p: string) => stripComments(read(p))

console.log("\nA name becomes a handle")

check(
  "spaces close up rather than becoming anything",
  // "the username should not have spaces basically" — and a handle with a dash
  // where the space was reads as two words, where a closed-up one reads as a
  // name.
  slugifyUsername("Andrew Rullz") === "andrewrullz" &&
    slugifyUsername("  Andrew   Rullz  ") === "andrewrullz",
)

check(
  "diacritics are folded, not deleted",
  (() => {
    // On a Romanian marketplace, dropping them would mangle most accounts:
    // "Ștefan Mureșan" would become "tefanmurean" and nobody would keep the
    // suggestion. NFD splits the letter from its mark; the range strips marks.
    return slugifyUsername("Ștefan Mureșan") === "stefanmuresan" && slugifyUsername("Ana-Maria Ioniță") === "ana-mariaionita"
  })(),
)

check(
  "everything a handle cannot hold is removed",
  slugifyUsername("A!!n@d#r$e%w^ 2024") === "andrew2024" &&
    slugifyUsername("--andrew--rullz--") === "andrew-rullz" &&
    slugifyUsername("陳大文") === "",
)

check(
  "and it never produces something the validator would then refuse for length",
  (() => {
    const long = slugifyUsername("a".repeat(80))
    return long.length === 30 && isValidUsername(long).valid
  })(),
)

check(
  "a name that slugifies to nothing still gets a usable handle",
  (() => {
    // Two characters, or a script this strips entirely. An empty handle is not
    // something the caller can do anything with.
    const a = baseUsernameFor("陳大文", "0f2c9a11-4444-4a11-9999-000000000042")
    const b = baseUsernameFor("Jo")
    return isValidUsername(a).valid && isValidUsername(b).valid
  })(),
)

check(
  "the fallback is deterministic, so it does not change while you look at it",
  baseUsernameFor("Jo") === baseUsernameFor("Jo"),
  "        Math.random() here would re-roll the suggestion on every render.",
)

console.log("\nWhen the handle is taken")

check(
  "every suggestion is itself a legal handle",
  (() => {
    // Offering something the validator will refuse is worse than offering
    // nothing: it looks like a way out and is a second error.
    const all = [
      ...usernameSuggestions("andrewrullz", "Andrew Rullz"),
      ...usernameSuggestions("ana", "Ana"),
      ...usernameSuggestions("a".repeat(30), "Long Name"),
    ]
    return all.length > 0 && all.every((s) => isValidUsername(s).valid)
  })(),
)

check(
  "and none of them exceeds the limit after the suffix is added",
  usernameSuggestions("a".repeat(30), "Long").every((s) => s.length <= 30),
  "        The base is trimmed BEFORE the number goes on, or a suggestion is\n" +
    "        offered and then refused for the length the suggestion created.",
)

check(
  "they are distinct",
  (() => {
    const s = usernameSuggestions("andrewrullz", "Andrew Rullz")
    return new Set(s).size === s.length
  })(),
)

check(
  "and none of them IS the handle that was taken",
  (() => {
    // The failure this catches is quiet and specific: a 30-character root with
    // "1" appended is 31, gets sliced back to 30, and is byte-for-byte the
    // handle somebody was just told they could not have — offered to them as
    // the fix. The base is trimmed BEFORE the suffix for exactly this.
    const root = "a".repeat(30)
    return usernameSuggestions(root, "Long Name").every((s) => s !== root)
  })(),
)

check(
  "the server never offers one it has not just checked is free",
  (() => {
    // A taken handle offered as the fix for a taken handle is the one thing
    // this must not do.
    const route = code("app/api/profile/username/route.ts")
    return /async function freeOnly/.test(route) && /suggestions: available \? \[\] : await freeOnly\(/.test(route)
  })(),
)

console.log("\nSaving a handle")

const patch = code("app/api/profile/route.ts")

check(
  "the value checked is the value stored",
  (() => {
    // Validating the raw input and storing the slug would let "Andrew Rullz"
    // pass a check that "andrewrullz" never had.
    const block = patch.slice(patch.indexOf('if ("username" in payload'))
    return (
      /const wanted = slugifyUsername\(payload\.username\)/.test(block) &&
      /isValidUsername\(wanted\)/.test(block) &&
      /patch\.username = wanted/.test(block)
    )
  })(),
  "        app/api/profile/route.ts",
)

check(
  "uniqueness is case-insensitive and excludes the caller",
  (() => {
    // /member/[username] resolves with ilike, so treating "Andrew" and "andrew"
    // as different here hands out a handle that opens somebody else's profile.
    // And without excluding the caller, saving a form without touching the
    // handle is refused for the value it already holds.
    const block = patch.slice(patch.indexOf('if ("username" in payload'))
    return /\.ilike\("username", wanted\)/.test(block) && /\.neq\("id", user\.id\)/.test(block)
  })(),
  "        app/api/profile/route.ts",
)

check(
  "the reserved handles are refused by the same function signup uses",
  (() => {
    // "storelib" is in RESERVED_WORDS, which is what stops anybody claiming the
    // official account's address — and lib/system-account.ts leans on exactly
    // that when it resolves the system account by handle.
    return !isValidUsername("storelib").valid && !isValidUsername("admin").valid
  })(),
)

console.log("\nThe form does not change an address by itself")

const form = code("components/member/profile-edit-form.tsx")

check(
  "an account that already has a handle keeps it while the name changes",
  (() => {
    // Deriving over an existing username the first time somebody edits their
    // display name would silently change the address every one of their
    // listings is linked from.
    return /const \[handleTouched, setHandleTouched\] = useState\(true\)/.test(form)
  })(),
  "        components/member/profile-edit-form.tsx",
)

check(
  "the handle follows the name only while it has never been edited",
  /if \(handleTouched\) return\s*\n\s*setHandle\(slugifyUsername\(displayName\)\)/.test(form),
  "        components/member/profile-edit-form.tsx",
)

check(
  "it is slugified as you type, not on save",
  (() => {
    // A field that accepts a space and removes it later tells you one thing and
    // stores another — and the availability check would be asking about a
    // string that is not what would be written.
    return /setHandle\(slugifyUsername\(e\.target\.value\)\)/.test(form)
  })(),
)

check(
  "and it is only sent when it actually differs",
  /handle\.trim\(\)\.toLowerCase\(\) !== username\.toLowerCase\(\)/.test(form),
  "        Otherwise every save is a uniqueness check and a write for a value\n" +
    "        nobody touched.",
)

check(
  "a failed availability check is not treated as a verdict",
  (() => {
    // Refusing on a network blip would be the form inventing a rule. The server
    // decides at the write.
    const block = form.slice(form.indexOf("/api/profile/username"))
    return /\.catch\(\(\) => \{[\s\S]{0,200}?setHandleState\(\{ status: "idle" \}\)/.test(block)
  })(),
)

console.log("\nThe marks after a name")

const badges = code("components/marketplace/profile-badges.tsx")
const messagingSql = read("supabase/sql/RUN_MESSAGING_ALL.sql")

check(
  "verified and staff are separate columns, defaulting to nobody",
  (() => {
    // They are genuinely independent: a verified seller who does not work here
    // has the first and not the second. One column would force a hierarchy that
    // does not exist. Both default false, so running the file grants nothing.
    return (
      /add column if not exists is_verified boolean not null default false/.test(messagingSql) &&
      /add column if not exists is_staff boolean not null default false/.test(messagingSql)
    )
  })(),
  "        supabase/sql/RUN_MESSAGING_ALL.sql",
)

check(
  "and is_official still means only 'this is the system account'",
  (() => {
    // A flag that grows a second meaning is a flag nobody can reason about.
    // The Storelib thread's check keys on is_official; a person's badge does
    // not touch it.
    return !/is_official/.test(badges) && /is_verified/.test(read("lib/profile/read.ts"))
  })(),
)

check(
  "the one account with both is addressed by its email, not a pasted uuid",
  (() => {
    const seed = messagingSql.slice(messagingSql.indexOf("set is_verified = true"))
    return (
      /lower\(u\.email\) = lower\('nastees112@gmail\.com'\)/.test(messagingSql) &&
      /from auth\.users u/.test(messagingSql) &&
      seed.length > 0
    )
  })(),
  "        supabase/sql/RUN_MESSAGING_ALL.sql",
)

check(
  "the staff mark says what it means when you press it",
  (() => {
    // A logo beside a stranger's name is ambiguous in the worst direction: it
    // reads as an advertisement, or as a badge you could buy.
    // As the tooltip's CONTENT, not merely as an aria-label. The label alone
    // satisfies a screen reader and leaves a sighted person looking at an
    // unexplained logo, which is the case this exists for.
    return /<InfoTip[\s\S]{0,900}?>\s*Storelib Admin\s*<\/InfoTip>/.test(badges)
  })(),
  "        components/marketplace/profile-badges.tsx",
)

check(
  "and it does not fall into a drag or a long-press by accident",
  (() => {
    // Not security — anything on screen can be screenshotted. It is the
    // difference between "you have to mean it" and "it happens by accident",
    // and the badge is granted by a column rather than by markup, so a copied
    // PNG is a picture and not a badge.
    return (
      /draggable=\{false\}/.test(badges) &&
      /onDragStart=/.test(badges) &&
      /onContextMenu=/.test(badges) &&
      /select-none/.test(badges) &&
      /-webkit-touch-callout:none/.test(badges)
    )
  })(),
  "        components/marketplace/profile-badges.tsx",
)

check(
  "the mark and the official account's face are one URL",
  (() => {
    // Two copies of the asset path is a badge that can drift from the avatar on
    // the thread it belongs to. system-account.ts is server-only, so the string
    // lives where both sides can reach it.
    const shared = code("lib/marketplace/storelib-mark.ts")
    const sys = code("lib/system-account.ts")
    return (
      /export const STORELIB_MARK_URL =/.test(shared) &&
      /export \{ STORELIB_MARK_URL as STORELIB_AVATAR_URL \}/.test(sys) &&
      !/supabase\.co\/storage/.test(sys)
    )
  })(),
)

check(
  "the profile page and the bar it turns into both carry them",
  (() => {
    // A name that is verified up the page and unmarked in the pinned bar is the
    // bar disagreeing with the page it replaced.
    const profile = code("components/member/member-profile.tsx")
    const pinned = code("components/member/profile-pinned-header.tsx")
    return /<ProfileBadges/.test(profile) && /<ProfileBadges/.test(pinned)
  })(),
)

check(
  "and a long name truncates around them rather than pushing them off",
  (() => {
    // A verified mark that disappears on long names disappears exactly where
    // impersonation is easiest.
    const profile = code("components/member/member-profile.tsx")
    return /<span className="min-w-0 truncate">\{name\}<\/span>\s*\n\s*<ProfileBadges/.test(profile)
  })(),
  "        components/member/member-profile.tsx",
)

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failed:")
  for (const f of failures) console.log(`  · ${f}`)
  process.exit(1)
}
