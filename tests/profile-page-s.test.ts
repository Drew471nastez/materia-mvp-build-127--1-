/**
 * ===========================================================================
 *  THE PROFILE PAGE, ROUND 13: REAL ACTIVITY, A PROPER ABOUT, A BUTTON THAT
 *  STAYS PUT, A PHOTO WITH DEPTH, AND A PULL THAT ASKS AGAIN
 * ===========================================================================
 * The owner, looking at /account and at /@handle:
 *
 *   ACTIVITY    "make sure there cannot be things such as 'Joined Storelib'.
 *               Eliminate that kind of shit." The row is gone, and with it
 *               every place that handed the list a join date for it.
 *               "Joined <community>" stays: that is a real thing somebody
 *               did. A page with nothing public on it says so in one line.
 *   ABOUT       "You can add for the user profile more things there on the
 *               page, such as when it joined, and more information, such as
 *               like the creator page has." The day, where they are from and
 *               how many communities, with their own line beside them, in
 *               the creator page's own About block, on /@handle and now on
 *               /account too. One row per value that exists and nothing
 *               invented.
 *   EDIT        the button on the cover never slides under the sticky bar:
 *               it is pinned 12px below the bar's measured height and holds
 *               that place for as long as the photo it belongs to is on
 *               screen. Measured in a browser by
 *               scripts/check-profile-band.mjs; held from the source here.
 *   PHOTO       a touch more depth and a crisper ring, the same string on
 *               /account's live copy and on /@handle's.
 *   PULL        iOS style pull to refresh on both profiles, the engine every
 *               other Storelib page already pulls with.
 *
 * Run with:  npx tsx tests/profile-page-s.test.ts   (or npm run test:push)
 */
import { existsSync } from "node:fs"
import { join } from "node:path"

import { readCode, readSource } from "./_source"
import { joinedDay, personFacts } from "../lib/profile/person-facts"
import { locationLine } from "../lib/profile/location"
import { ACCOUNT_REFRESH_SCOPE, MEMBER_REFRESH_SCOPE } from "../lib/profile/refresh-scope"
import { EDIT_PIN_TOP, PROFILE_AVATAR_CLASS } from "../components/profile/profile-hero"
import { PROFILE_CHROME_VAR, stickyChromeHeight } from "../components/profile/profile-chrome-var"

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
const here = (p: string) => existsSync(join(process.cwd(), p))

async function main() {
  /* ── 1. Activity is activity ──────────────────────────────────────────── */
  console.log("\nActivity carries only things somebody did")
  const activity = readCode("components/profile/profile-activity.tsx")
  check("there is no Joined Storelib row left in the list", !/JoinedRow/.test(activity) && !/Joined <span[^>]*>\s*Storelib/.test(activity))
  check("and nothing in it says Storelib at all", !/Storelib/.test(activity))
  check("the list takes no join date any more", !/joinedAt/.test(activity))
  /** What is handed to <ProfileActivity>, with the rest of the file left out. */
  const activityCall = (path: string) => (readCode(path).match(/<ProfileActivity[\s\S]*?\/>/) ?? [""])[0]
  check("a profile hands the list no join date", !!activityCall("components/profile/member-profile-page.tsx") && !/joinedAt/.test(activityCall("components/profile/member-profile-page.tsx")))
  check("and neither does /account", !!activityCall("app/(storelib)/account/page.tsx") && !/joinedAt/.test(activityCall("app/(storelib)/account/page.tsx")))
  check("the day they joined is handed to About instead, on both", /<PersonAbout[\s\S]*?joinedAt=\{profile\.joinedAt\}/.test(readCode("components/profile/member-profile-page.tsx")) && /AccountAbout\(\{ userId: user\.id, name, joinedAt: user\.created_at \|\| null \}\)/.test(readCode("app/(storelib)/account/page.tsx")))
  check("'Joined <community>' is still a kind the list draws", /joined: "Joined"/.test(activity))
  check("nothing with the list open still imports the sparkle the row used", !/Sparkles/.test(activity))

  console.log("\nNothing public yet reads as a sentence, not a broken box")
  check("the empty state is the list's own card, one line in it", /data-profile-activity-empty/.test(activity) && /look\.list, "px-6 py-12 text-center"/.test(activity))
  const member = readSource("components/profile/member-profile-page.tsx")
  check("a visitor is told whose page is empty, by name", /\$\{first\} has nothing public here yet\./.test(member))
  check("the owner is told what puts something in it", /Join a community or review something you bought and it shows up here\./.test(member))

  /* ── 2. The facts a profile knows ─────────────────────────────────────── */
  console.log("\nThe day somebody joined, written out")
  check("a timestamp becomes a day", joinedDay("2025-01-04T10:00:00Z") === "4 January 2025", joinedDay("2025-01-04T10:00:00Z"))
  check("the day does not move with the reader's clock", joinedDay("2025-01-01T23:30:00Z") === "1 January 2025", joinedDay("2025-01-01T23:30:00Z"))
  check("no date, no row", joinedDay(null) === null && joinedDay("") === null && joinedDay("not a date") === null)

  console.log("\nOnly the facts there are")
  const full = personFacts({ joinedAt: "2025-01-04T10:00:00Z", location: locationLine({ city: "Lisbon", country: "PT" }), communities: 3 })
  check("joined, from, communities, in that order", full.map((f) => f.label).join(",") === "Joined,From,Communities", full)
  check("the values are the real ones", full[0].value === "4 January 2025" && full[1].value === "Lisbon, Portugal" && full[2].value === "3", full)
  check("somebody who never said where they are from has no From row", personFacts({ joinedAt: "2025-01-04T10:00:00Z", location: null, communities: 2 }).every((f) => f.label !== "From"))
  check("no communities is no row, never a zero", personFacts({ joinedAt: "2025-01-04T10:00:00Z", communities: 0 }).every((f) => f.label !== "Communities"))
  check("communities switched off is no row either", personFacts({ joinedAt: "2025-01-04T10:00:00Z", communities: null }).length === 1)
  check("an account with nothing known shows no facts at all", personFacts({}).length === 0)
  check("a blank location is not a location", personFacts({ location: "   " }).length === 0)

  console.log("\nAbout <name> is on both profiles")
  const about = readSource("components/profile/person-about.tsx")
  check("it reads its rows from the one place that decides them", /personFacts\(\{ joinedAt, location, communities \}\)/.test(about))
  check("their own line sits beside the facts", /data-person-about-bio/.test(about))
  check("it never repeats the follower counts the header already shows", !/followers|following/i.test(readCode("components/profile/person-about.tsx")))
  check("/@handle hands it the bio and where they are from", /bio=\{profile\.bio\}/.test(member) && /location=\{extras\.location \?\? null\}/.test(member))
  check("/account streams its own About inside Suspense", here("components/profile/account-about.tsx") && /<Suspense fallback=\{null\}>\s*\{AccountAbout\(/.test(readCode("app/(storelib)/account/page.tsx")))
  const accountAbout = readCode("components/profile/account-about.tsx")
  check("  which reads the day, the place, the line and the count", /joinedAt=\{joinedAt\}/.test(accountAbout) && /readProfileLocation/.test(accountAbout) && /readBio/.test(accountAbout) && /profileCommunities/.test(accountAbout))
  check("  and drops a row it could not read rather than failing the page", /\.catch\(\(\) => null\)/.test(accountAbout) && /\.catch\(\(\) => \(\{ owned: \[\], member: \[\] \}\)\)/.test(accountAbout))
  check("  inside /account's own column, so the rules keep the page's left edge", /inset=\{false\}/.test(accountAbout))

  /* ── 3. Edit profile stays put ────────────────────────────────────────── */
  console.log("\nEdit profile is pinned under the bar, never under it")
  const hero = readCode("components/profile/profile-hero.tsx")
  check("the bar's height is measured, not guessed", PROFILE_CHROME_VAR === "--profile-chrome" && typeof stickyChromeHeight === "function")
  check("a bar that scrolls away with the page is measured as nothing", (() => {
    /* Changed on purpose: the height also reads a community's own top bar on /account (components/profile/profile-chrome-var.ts), found with querySelector. */
    const fake = { getElementById: () => null, querySelector: () => null, defaultView: null } as unknown as Document
    return stickyChromeHeight(fake) === 0
  })())
  check("the pin is that height plus twelve", EDIT_PIN_TOP === "calc(max(64.6px, var(--profile-chrome, 0px)) + 12px)", EDIT_PIN_TOP)
  check("  with the phone bar's own height as the floor before it is measured", /64\.6px/.test(EDIT_PIN_TOP))
  check("the row is sticky at that top", /className="sticky" style=\{\{ top: EDIT_PIN_TOP \}\}/.test(hero))
  check("it is no longer pinned 12px inside the band and left there", !/absolute inset-x-0 top-3 sm:bottom-4/.test(hero))
  check("its track runs from the band's top to its foot, so it holds while the cover does", /absolute inset-x-0 bottom-1 top-3/.test(hero))
  /* Changed on purpose (arrived with ddcbaf919): the cover is 264px tall on a computer, and the button moved into components/account/edit-profile-door.tsx, a 44px touch with its own labels. */
  const door = readCode("components/account/edit-profile-door.tsx")
  check("the clipping moved to the picture's own box, so the sticky row can stick", /h-\[157px\] sm:h-\[233px\] lg:h-\[264px\] overflow-hidden/.test(hero) && !/relative w-full overflow-hidden bg-\[#eceef1\]/.test(hero))
  check("the track takes no touches, the button does", /pointer-events-none absolute inset-x-0 bottom-1/.test(hero) && /<EditProfileDoor/.test(hero) && /pointer-events-auto relative min-h-\[44px\]/.test(door))
  check("the full label wherever it fits, a short one only on a narrow phone", /<span className="min-\[390px\]:hidden">Edit<\/span>/.test(door) && /<span className="hidden min-\[390px\]:inline">Edit profile<\/span>/.test(door) && /aria-label="Edit profile"/.test(door))
  check("and it is still called Edit profile to a screen reader", /aria-label="Edit profile"/.test(door))
  check("the page it sits in clips sideways without becoming a scroll box", /overflow-x-clip/.test(readCode("app/(storelib)/account/layout.tsx")) && !/overflow-x-hidden/.test(readCode("app/(storelib)/account/layout.tsx")))

  /* ── 4. The photo ─────────────────────────────────────────────────────── */
  console.log("\nThe photo sits on the cover rather than lying flat on it")
  check("a deeper, still soft shadow", /0_10px_22px_-12px_rgba\(16,24,40,0\.34\)/.test(PROFILE_AVATAR_CLASS), PROFILE_AVATAR_CLASS)
  check("  and no blob: the near shadow is still one pixel", /0_1px_2px_rgba\(16,24,40,0\.08\)/.test(PROFILE_AVATAR_CLASS))
  check("the ring is the page's own ground, still 2px", /ring-2 ring-\[#f8f9fa\]/.test(PROFILE_AVATAR_CLASS))
  check("  crisper, by a hairline at the ring's outer edge", /outline-1 outline-offset-2 outline-\[rgba\(16,24,40,0\.09\)\]/.test(PROFILE_AVATAR_CLASS))
  check("the size is untouched: 125 on a phone, 142 wider up", /h-\[125px\] w-\[125px\]/.test(PROFILE_AVATAR_CLASS) && /sm:h-\[142px\] sm:w-\[142px\]/.test(PROFILE_AVATAR_CLASS))
  check("/account's live copy wears the same string, not a copy of it", /className=\{PROFILE_AVATAR_CLASS\}/.test(readCode("components/account/account-hub.tsx")))

  /* ── 5. A pull at the top ─────────────────────────────────────────────── */
  console.log("\nA pull at the top of a profile asks the server again")
  check("there was already one engine, and this uses it", here("components/ui/pull-to-refresh.tsx") && here("hooks/use-pull-to-refresh.ts"))
  check("/account pulls", /<RouterPullToRefresh scope=\{ACCOUNT_REFRESH_SCOPE\}>/.test(readCode("components/account/account-hub.tsx")))
  check("/@handle pulls", /<RouterPullToRefresh scope=\{MEMBER_REFRESH_SCOPE\}>/.test(readCode("components/profile/member-profile-page.tsx")))
  check("the two scopes are named once, away from both sides", ACCOUNT_REFRESH_SCOPE === "account-profile" && MEMBER_REFRESH_SCOPE === "member-profile")
  check("the activity list answers its page's scope", /refreshScope\?: string/.test(activity) && /detail\.scope !== refreshScope/.test(activity))
  check("  by reading its first page again, with no cursor", /new URLSearchParams\(\{ userId \}\)/.test(activity))
  check("  and the ring waits for it", /detail\.done = first\.current\(\)/.test(activity))
  check("  an answer that is not a page leaves the list alone", /if \(!Array\.isArray\(data\.items\)\) return/.test(activity))
  check("both pages name the scope they dispatch", /refreshScope=\{ACCOUNT_REFRESH_SCOPE\}/.test(readCode("app/(storelib)/account/page.tsx")) && /refreshScope=\{MEMBER_REFRESH_SCOPE\}/.test(readCode("components/profile/member-profile-page.tsx")))
  check("reduced motion, a sideways swipe and a scrolled page are the engine's own business", /prefers-reduced-motion/.test(readSource("hooks/use-pull-to-refresh.ts")) && /axisFirst/.test(readSource("components/ui/pull-to-refresh.tsx")))

  /* ── 6. Copy ──────────────────────────────────────────────────────────── */
  console.log("\nNothing here sounds like a machine wrote it")
  const banned = /\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform)\b/i
  for (const f of [
    "components/profile/profile-activity.tsx",
    "components/profile/person-about.tsx",
    "components/profile/account-about.tsx",
    "components/profile/profile-hero.tsx",
    "components/profile/profile-chrome-var.tsx",
    "components/profile/member-profile-page.tsx",
    "components/account/account-hub.tsx",
    "lib/profile/person-facts.ts",
    "lib/profile/refresh-scope.ts",
    "app/(storelib)/account/page.tsx",
    "app/(storelib)/account/layout.tsx",
  ].filter(here)) {
    const src = readSource(f)
    check(`${f}: no em dash, no banned word`, !src.includes("—") && !banned.test(src), src.match(banned)?.[0])
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
