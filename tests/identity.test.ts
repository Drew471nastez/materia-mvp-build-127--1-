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
  "the staff account is addressed by its email, not a pasted uuid",
  (() => {
    const seed = messagingSql.slice(messagingSql.indexOf("set is_verified"))
    return (
      /lower\(u\.email\) = lower\('nastees112@gmail\.com'\)/.test(messagingSql) &&
      /from auth\.users u/.test(messagingSql) &&
      seed.length > 0
    )
  })(),
  "        supabase/sql/RUN_MESSAGING_ALL.sql",
)

check(
  "an admin carries the Storelib mark and NOT the blue check",
  (() => {
    // Two marks after one name reads as decoration, and the check is the one
    // that says "this account is who it claims to be" — a statement worth making
    // about a shop somebody could be mistaken for, and worth nothing beside a
    // mark that already says the person works here.
    //
    // Written as `false` rather than by deleting the grants: the column already
    // holds `true` for both of these in the live database, so a file that merely
    // stopped granting it would leave the badge exactly where it is. Every
    // statement that touches either account must say so.
    const grants = messagingSql.match(/set is_verified\s*=\s*\w+,\s*\n\s*is_staff\s*=\s*\w+/g) ?? []
    return (
      grants.length === 2 &&
      grants.every((g) => /is_verified\s*=\s*false/.test(g) && /is_staff\s*=\s*true/.test(g))
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

check(
  "the seal is filled, not an outline",
  (() => {
    // lucide's BadgeCheck is a stroked scallop with a stroked tick in it, which
    // at sixteen pixels reads as a faint ring rather than as a badge. The thing
    // everybody recognises is a SOLID coloured seal with a white tick knocked
    // out — and recognition is the whole value of using the convention.
    //
    // Both paths are FILLS. A stroked tick has to have its width chosen for one
    // size, and this is drawn at 15, 16 and 20 in three places.
    const seal = badges.slice(badges.indexOf("function VerifiedSeal"))
    return (
      /fill="#1d9bf0"/.test(seal) &&
      /fill="#ffffff"/.test(seal) &&
      !/stroke=/.test(seal.slice(0, seal.indexOf("</svg>"))) &&
      !/BadgeCheck/.test(badges)
    )
  })(),
  "        components/marketplace/profile-badges.tsx",
)

check(
  "the tooltip is sized by its contents, not to a fixed 272px",
  (() => {
    // Every bubble was 272 wide, including the one that says "Storelib Admin" —
    // two words that need about ninety. A box three times the width of its
    // contents reads as a panel that failed to load, and on a narrow phone it
    // was most of the screen for a fourteen-character label.
    const tip = code("components/ui/info-tip.tsx")
    const css = read("app/globals.css")
    return (
      /const MAX_WIDTH = \d+/.test(tip) &&
      !/width: WIDTH/.test(tip) &&
      /maxWidth: `min\(\$\{MAX_WIDTH\}px, calc\(100vw/.test(tip) &&
      /width: max-content;/.test(css.slice(css.indexOf(".info-tip-bubble {"), css.indexOf(".info-tip-arrow")))
    )
  })(),
  "        components/ui/info-tip.tsx, app/globals.css",
)

check(
  "and it is clamped by its REAL width, not by the ceiling",
  (() => {
    // Clamping a ninety-pixel bubble as though it were 272 pushes it left near
    // the right edge, for space it is not using.
    const tip = code("components/ui/info-tip.tsx")
    return /const w = Math\.min\(bubble\.current\?\.offsetWidth/.test(tip) && /vw - w - EDGE/.test(tip)
  })(),
)

console.log("\nChanging a handle")

check(
  "the save closes over the CURRENT handle",
  (() => {
    // useCallback froze `save` on the first render, so the handle it compared
    // was the one the form was born with: the comparison was always equal, the
    // username key was never added to the body, and pressing save after
    // changing the handle sent everything except the handle. The request
    // succeeded and said "Profil salvat".
    return /\}, \[busy, displayName, bio, cover, handle, username, back, router\]\)/.test(form)
  })(),
  "        components/member/profile-edit-form.tsx — a stale closure is\n" +
    "        invisible at the call site and produces a successful save of the\n" +
    "        old value.",
)

check(
  "an address that used to be yours still finds you",
  (() => {
    const page = code("app/(marketing)/member/[username]/page.tsx")
    const patchRoute = code("app/api/profile/route.ts")
    return (
      /profile_username_history/.test(patchRoute) &&
      /profile_username_history/.test(page) &&
      /redirect\(`\/member\//.test(page)
    )
  })(),
  "        A rename that 404s every link to a seller's listings is why most\n" +
    "        products refuse to allow renames at all.",
)

check(
  "the history is consulted only AFTER the live handle fails to resolve",
  (() => {
    // This is what makes it safe for a released handle to be claimed by
    // somebody else: the new owner is found first and the redirect never runs.
    const page = code("app/(marketing)/member/[username]/page.tsx")
    return /if \(!profile\) \{[\s\S]{0,900}?profile_username_history/.test(page)
  })(),
)

check(
  "and the old handle is recorded only when the write actually succeeded",
  (() => {
    // A redirect filed for a rename that failed sends people away from a
    // profile that never moved.
    const patchRoute = code("app/api/profile/route.ts")
    const write = patchRoute.indexOf("const written = await writeProfile")
    return write > 0 && patchRoute.indexOf('from("profile_username_history").upsert') > write
  })(),
)

check(
  "nothing is said when the handle is simply free",
  (() => {
    // "Verificăm…" and "Este liber." were a running commentary on the common
    // path. A tick in the field says it without a sentence.
    return !/Este liber/.test(form) && !/Verificăm/.test(form) && /handleState\.status === "free" \? "opacity-100"/.test(form)
  })(),
  "        components/member/profile-edit-form.tsx",
)

check(
  "and the two marks cross-fade in place rather than appearing",
  (() => {
    // Both mounted, only opacity changing, so the answer arriving on a field
    // somebody is still typing into does not move anything.
    const box = form.slice(form.indexOf("inset-y-0 right-3.5"))
    return /<Check[\s\S]{0,300}?transition-opacity/.test(box) && /<AlertCircle[\s\S]{0,300}?transition-opacity/.test(box)
  })(),
)

check(
  "the second staff account is named too, by the handle it was given as",
  /lower\(username\) = lower\('ZarraBianco'\)/.test(messagingSql),
  "        supabase/sql/RUN_MESSAGING_ALL.sql",
)

check(
  "and the seal itself is still drawn — it is the admins who stop wearing it",
  (() => {
    // The blue check is a capability the product keeps: `profiles.is_verified`
    // is still read, still passed down, and still rendered. Removing the
    // component instead of the two grants would have thrown away the badge for
    // every seller who is ever verified in order to take it off two accounts.
    const profile = code("components/member/member-profile.tsx")
    return (
      /function VerifiedSeal/.test(badges) &&
      /verified && <VerifiedSeal/.test(badges) &&
      /verified=\{member\.verified\}/.test(profile)
    )
  })(),
  "        components/marketplace/profile-badges.tsx",
)

check(
  "nothing writes a handle from the browser",
  (() => {
    /**
     * ═══════════════════════════════════════════════════════════════════════
     *  THE BUG: A SAVE THAT SUCCEEDS AND WRITES NOTHING
     * ═══════════════════════════════════════════════════════════════════════
     *
     * Two settings forms did this:
     *
     *     await supabase.from("profiles").update({ username }).eq("id", userId)
     *     if (error) throw error
     *     setSaveSuccess(true)
     *
     * `update().eq()` MATCHING ZERO ROWS IS NOT AN ERROR. An account whose row
     * RLS will not let the anon key touch — or one with no `profiles` row at
     * all — gets `error === null`, a green tick, and no change. Reload, and the
     * old handle is still there.
     *
     * That is the whole of "I change my username and it doesn't save", and
     * lib/profile/write.ts exists for it: update, notice nothing matched,
     * INSERT — behind the service role, with the id from the session.
     *
     * The browser path also skipped every gate the server applies: slugify,
     * isValidUsername (reserved words), and a CASE-INSENSITIVE uniqueness
     * check. One of the two forms checked uniqueness with `.eq()`, which is
     * case-sensitive, while /member/[username] resolves case-insensitively —
     * so "Andrew" passed a check that "andrew" already held.
     *
     * PATCH /api/profile is the only writer of a handle now. This fails if a
     * second one ever appears.
     */
    const offenders: string[] = []
    for (const f of [
      "app/library/settings/buyer-settings.tsx",
      "components/app/settings-form-new.tsx",
      "components/settings/settings-hub.tsx",
      "components/member/profile-edit-form.tsx",
    ]) {
      const src = code(f)
      // `username` as a KEY of an update object — `username:` or the shorthand
      // `{ …, username }`. The lookbehind excludes `profile?.username`, which
      // is a READ of somebody's handle inside an unrelated update and is fine.
      if (/\.update\(\s*\{[^{}]*(?<![\w.])username\s*[:,}]/s.test(src)) offenders.push(f)
    }
    return offenders.length === 0
  })(),
  "        a handle must be written by PATCH /api/profile, never by the browser",
)

check(
  "and the forms use the handle the server stored, not the one they typed",
  (() => {
    // It has been through slugifyUsername, so "Andrew Rullz" comes back as
    // "andrewrullz". `creators.slug` and the OnePage slug are synced to it —
    // syncing to the typed value is how a profile and a store end up at two
    // different addresses.
    const route = code("app/api/profile/route.ts")
    const seller = code("components/app/settings-form-new.tsx")
    const buyer = code("app/library/settings/buyer-settings.tsx")
    return (
      /username: row\.username \?\? null/.test(route) &&
      /let storedUsername = cleanUsername/.test(seller) &&
      /slug: storedUsername/.test(seller) &&
      /setUsername\(data\.username\)/.test(buyer)
    )
  })(),
  "        components/app/settings-form-new.tsx",
)

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failed:")
  for (const f of failures) console.log(`  · ${f}`)
  process.exit(1)
}
