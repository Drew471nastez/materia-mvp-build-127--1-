/**
 * ===========================================================================
 *  ROUND 17: EVERY ROW OF PILLS SWITCHES LIKE THE SPACE PILLS, THE POSTS
 *  PILL WORKS, AND EXPLORE'S CATALOGUE IS NEVER REFUSED
 * ===========================================================================
 * The owner, on the iPhone after round 16: "Paid communities, library,
 * settings: switching in between pill shapes is not smooth there, fully fix
 * it all complete. And the posts don't work, fix it."
 *
 *   SHARED     lib/ui/pill-switch.ts: the space pills' numbers (chip-hit.ts),
 *              the fill, the press tint and the words as layers, the landing
 *   LIBRARY    a pill's screen in place of the last on its frame, no copy of
 *              the old one dissolving over it (it showed both for ~130ms)
 *   ACCOUNT    every pill's page read ahead (Posts never was), the panel
 *              lands in place, its height held while it does
 *   SETTINGS   the pill lights first, its section follows in a transition,
 *              every section kept once opened, Notifications read ahead, the
 *              phone layer keeps the section across its full read
 *   POSTS      Edit post opens the editor (?edit=1 on the shared post), a
 *              post opened from the account closes back to it
 *   EXPLORE    no embed of profiles on creators (there is no such key)
 *
 *   The frames: scripts/check-library-switch.mjs and scripts/check-pills17.mjs
 *   (SURFACES=account,settings,posts).
 *
 * Run with:  pnpm run test:push
 */
import { existsSync } from "node:fs"
import { join } from "node:path"
import { readCode, readSource } from "./_source"
import * as chip from "@/components/community/member/chip-hit"
import {
  CONTENT_IN_FROM,
  CONTENT_IN_MS,
  HOLD_MS,
  PILL_FADE_EASE,
  PILL_FADE_MS,
  PILL_FILL,
  PILL_PRESS,
  PILL_WORDS,
  PRESS_FROM,
  PRESS_IN_MS,
  PRESS_OUT_MS,
  WORD_TURN_MS,
  pillFadeAt,
} from "@/lib/ui/pill-switch"
import { markAccountPostsStale, markPostFromAccount, takeAccountPostsStale, takePostFromAccount } from "@/lib/profile/post-return"
import { ownerPillLinks } from "@/lib/profile/owner-pills"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label)
    console.log(`  FAIL  ${label}${detail === undefined ? "" : `   ${JSON.stringify(detail)}`}`)
  }
}
const code = (p: string) => readCode(p)

console.log("\nSHARED: one way for a row of pills to switch, the space pills' own")
{
  check("the fill's time and curve are the space pills'", PILL_FADE_MS === chip.PILL_FADE_MS && PILL_FADE_EASE === chip.PILL_FADE_EASE, [PILL_FADE_MS, chip.PILL_FADE_MS])
  check("the words turn in one step at the same moment", WORD_TURN_MS === chip.WORD_TURN_MS)
  check("the press tint: the same first frame, ease in and let go", PRESS_FROM === chip.PRESS_FROM && PRESS_IN_MS === chip.PRESS_IN_MS && PRESS_OUT_MS === chip.PRESS_OUT_MS)
  check("the fill's curve is the space pills' curve, frame by frame", [0, 17, 34, 50, 70, 100, 140].every((ms) => Math.abs(pillFadeAt(ms) - chip.fadeAt(ms)) < 1e-9))
  check("the fill moves opacity only, 140ms, and never scales", /transition-opacity duration-\[140ms\]/.test(PILL_FILL) && !/scale/.test(PILL_FILL))
  check("the press is its own layer under the fill, the words over both and never take the finger", /z-0/.test(PILL_PRESS) && /opacity-0/.test(PILL_PRESS) && /z-\[1\]/.test(PILL_FILL) && /pointer-events-none relative z-\[2\]/.test(PILL_WORDS) && /steps\(1,end\)/.test(PILL_WORDS))
  check("content lands from most of the way there (never a blank frame), quickly", CONTENT_IN_FROM >= 0.5 && CONTENT_IN_MS <= 160 && HOLD_MS > CONTENT_IN_MS)
  const lib = code("lib/ui/pill-switch.ts")
  check("the landing does nothing under reduced motion, and keeps no fill behind", /prefers-reduced-motion: reduce/.test(lib) && /\[\{ opacity: CONTENT_IN_FROM \}, \{ opacity: 1 \}\], \{ duration: CONTENT_IN_MS, easing: CONTENT_IN_EASE \}\)/.test(lib))
  check("the height is let go only as far as the scroll allows", /window\.scrollY \+ window\.innerHeight - below - top/.test(lib))
}

console.log("\nLIBRARY: a pill's screen in place of the last, never the two at once")
{
  const panel = code("components/library/library-panel.tsx")
  const tabs = code("components/library/library-tabs.tsx")
  check("no copy of the old screen is laid over a pill's new one", !/leaveCopy\(live, CROSS_MS/.test(panel) && !/stillCopy\(skeleton, true\)/.test(panel))
  check("the new screen lands on its frame (the commit's layout effect)", /if \(tabLanding\.current\) \{\s*tabLanding\.current = false\s*landContent\(liveRef\.current\)/.test(panel))
  check("a cold pill: the route's shape lands, then the screen in its place", /skeletonUp\.current = false\s*landContent\(live\)/.test(panel))
  check("the panel holds its height from the commit to the landing", /tabLanding\.current = true/.test(panel) && /panel\.style\.minHeight = `\$\{Math\.ceil\(panel\.getBoundingClientRect\(\)\.height\)\}px`/.test(panel))
  check("the pills: the shared fill, press and words, nothing scaling", /PILL_FILL/.test(tabs) && /data-pill-press/.test(tabs) && /pressPill\(e\.currentTarget\)/.test(tabs) && /releasePill\(e\.currentTarget\)/.test(tabs) && !/active:scale|scale-\[0\.9/.test(tabs))
  check("one tap: decided on the lift", /useFirstTap<HTMLAnchorElement>/.test(tabs))
  const probe = readSource("scripts/check-library-switch.mjs")
  check("its probe now pins the new intent: no copy, a short soft landing, the fill only rising, a tap on the phone", /never two screens at once/.test(probe) && /lands in place with a short soft fade/.test(probe) && /await page\.tap\(selector\)/.test(probe) && !/a cross fade, not a cut/.test(probe))
}

console.log("\nACCOUNT: Activity, Posts, Communities")
{
  const pills = code("components/profile/profile-owner-pills.tsx")
  const hub = code("components/account/account-hub.tsx")
  check("every pill's page is read ahead on idle, Posts and Communities included", /const order: OwnerPillKey\[\] = \["settings", "posts", "communities", "activity", "library"\]/.test(pills) && /prefetchOnIdle\(router, ahead\.split\(" "\)\)/.test(pills))
  check("and Posts is read whole as soon as its pill is on screen, as Communities and Library are", /prefetch=\{p\.key === "library" \|\| p\.key === "communities" \|\| p\.key === "posts" \? true : false\}/.test(pills))
  check("the pills: the shared fill, press and words", /cn\(PILL_FILL, on \? "opacity-100" : "opacity-0"\)/.test(pills) && /data-pill-press/.test(pills) && /PILL_WORDS/.test(pills))
  check("the panel lands in place (no fade from nothing)", /landContent\(contentRef\.current\)/.test(hub) && !/\[\{ opacity: 0 \}, \{ opacity: 1 \}\]/.test(hub))
  check("its height is held from the commit (before the old panel changes) until it has landed", /<BeforeChange value=\{pathname\} onBefore=\{\(\) => holdHeight\(panelRef\.current\)\} \/>/.test(hub) && /letGoHeight\(panelRef\.current, contentRef\.current\)/.test(hub))
  const links = ownerPillLinks(true).map((p) => p.key).join()
  check("the Posts pill shows while communities are on, and not when they are off", links === "activity,posts,communities,library,settings" && !ownerPillLinks(false).some((p) => p.key === "posts"), links)
}

console.log("\nSETTINGS: Profile, Account, Privacy, Notifications, Preferences")
{
  const settings = code("components/account/account-settings.tsx")
  check("the pill lights on the press, its section follows in a transition", /setPill\(key\)\s*startTransition\(\(\) => setShown\(key\)\)/.test(settings) && /<SectionPills active=\{pill\}/.test(settings) && /<SectionList active=\{pill\}/.test(settings))
  check("each section pill answers the first tap", /function SectionPill\(/.test(settings) && /useFirstTap<HTMLButtonElement>/.test(settings))
  check("every section is kept once opened, the others hidden, none built twice", /function KeptSections/.test(settings) && /if \(!opened\.includes\(section\)\) setOpened\(\[\.\.\.opened, section\]\)/.test(settings) && /hidden=\{s\.key !== section\}/.test(settings))
  check("the section lands in place, its box held while it does", /landContent\(panes\.current\.get\(section\)/.test(settings) && /<BeforeChange value=\{section\} onBefore=\{\(\) => holdHeight\(box\.current\)\} \/>/.test(settings))
  check("no fade out then in any more", !/SWAP_OUT_MS|SWAP_IN_MS|function SectionSwap/.test(settings))
  const notify = code("components/account/notification-settings.tsx")
  check("Notifications is read ahead while another section is up, and drawn at once from it", /export function warmNotifications\(\)/.test(notify) && /took\?\.done \? \(took\.value \?\? "none"\) : "loading"/.test(notify) && /window\.setTimeout\(warmNotifications, 700\)/.test(settings))
  check("a warm read is used by one screen, while fresh", /warm = null\s*return w/.test(notify) && /const WARM_MS = 60_000/.test(notify))
  const layer = code("components/account/settings-subpage.tsx")
  check("the phone's layer keeps the section you are on when its full read lands", /initialSection=\{sectionNow\.current\} onSection=\{\(key\) => \(sectionNow\.current = key\)\}/.test(layer))
}

console.log("\nPOSTS: the Posts pill end to end")
{
  const store = new Map<string, string>()
  ;(globalThis as unknown as { window: unknown }).window = { sessionStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) } }
  markPostFromAccount("p1")
  check("a post the account opened is known as such, once", takePostFromAccount("p1") && !takePostFromAccount("p1"))
  markPostFromAccount("p1")
  check("and only that post", !takePostFromAccount("p2"))
  markAccountPostsStale()
  check("the account's list is read again once after a post closes back to it", takeAccountPostsStale() && !takeAccountPostsStale())
  ;(globalThis as unknown as { window: unknown }).window = { get sessionStorage(): Storage { throw new Error("blocked") } }
  check("no storage: nothing throws, the post simply closes into its feed", (() => { markPostFromAccount("p1"); return !takePostFromAccount("p1") && !takeAccountPostsStale() })())
  delete (globalThis as unknown as { window?: unknown }).window

  const shared = code("components/community/member/shared-post.tsx")
  check("?edit=1 on a post's address opens its editor: read on the first render, as the overlay draws its card once", /useState\(\(\) => typeof window !== "undefined" && new URLSearchParams\(window\.location\.search\)\.get\("edit"\) === "1"\)/.test(shared) && /autoEdit=\{autoEdit\}/.test(shared))
  check("  and leaves the address, so a reload or Back does not open it again", /url\.searchParams\.delete\("edit"\)\s*window\.history\.replaceState/.test(shared))
  check("a post opened from the account goes back to it, past a step an editor left at the same address", /if \(fromAccount\.current && window\.history\.length > 1\) \{\s*markAccountPostsStale\(\)\s*backPastThisPost\(\)/.test(shared) && /window\.location\.pathname === here && left-- > 0/.test(shared))
  check("  otherwise it still gives the feed's address back in place, as round 16 made it", /window\.history\.replaceState\(window\.history\.state, "", home\)/.test(shared))
  const list = code("components/account/account-posts.tsx")
  check("the account marks the post it opens (its row and Edit post) and reads its list again on the way back", /onClick=\{\(\) => markPostFromAccount\(post\.id\)\}/.test(list) && /markPostFromAccount\(post\.id\)\s*router\.push\(postEditHref\(post\.href\)\)/.test(list) && /if \(takeAccountPostsStale\(\)\) void first\.current\(\)/.test(list))
  check("Delete still asks first and folds the row only after the server's yes", /setConfirm\(\{/.test(list) && /method: "DELETE"/.test(list) && /if \(!r\.ok\) \{\s*setSaid\(r\.error\)\s*return false/.test(list))
}

console.log("\nEXPLORE AND THE LIBRARY: no embed on a key that does not exist")
{
  const explore = code("app/(storelib)/(marketing)/explore/page.tsx")
  const extras = code("lib/library/library-extras.ts")
  check("Explore embeds its creators on products.creator_id and nothing on creators to profiles", /const CREATOR_EMBED = "creator:creators\(id, user_id, slug, niche_tags\)"/.test(explore) && !/profiles!creators_user_id_fkey/.test(explore))
  check("the faces are one read by user id, beside the sales channels and the intervals", /from\("profiles"\)\.select\(PROFILE_FIELDS\)\.in\("id", userIds\)/.test(explore) && /const together = Promise\.all\(\[/.test(explore))
  check("the library's orders read no longer names that key, so its orders and receipts come back", !/profiles!creators_user_id_fkey/.test(extras) && /admin\.from\("profiles"\)\.select\("id, display_name, avatar_url"\)\.in\("id", sellerUserIds\)/.test(extras))
}

console.log("\nPROOF AND COPY")
{
  const root = process.cwd()
  const probes = ["scripts/check-pills17.mjs", "scripts/render-pills17.tsx", "scripts/check-library-switch.mjs"]
  check("the probes are here", probes.every((f) => existsSync(join(root, f))))
  const mine = ["lib/ui/pill-switch.ts", "components/ui/before-change.tsx", "lib/profile/post-return.ts", "scripts/check-pills17.mjs", "scripts/render-pills17.tsx"]
  /* The words are spelled out in pieces here so this file does not hold them itself. */
  const banned = new RegExp(["\\u2014", "unlock", "elevate", "seamless", "powerful", "effortless", "supercharge", "trans" + "form"].map((w) => (w.startsWith("\\") ? w : `\\b${w}`)).join("|"), "i")
  const bad = mine.filter((f) => banned.test(readSource(f)))
  check("no em dash and no banned word in this round's new files", bad.length === 0, bad)
  const client = ["lib/ui/pill-switch.ts", "components/ui/before-change.tsx", "lib/profile/post-return.ts", "components/account/account-posts.tsx", "components/community/member/shared-post.tsx", "components/account/account-settings.tsx", "components/account/notification-settings.tsx"]
  check("client modules import no server code", client.every((f) => !/from "(@\/lib\/communities\/server|next\/headers|server-only)/.test(readSource(f))))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  console.log(failures.map((f) => `  - ${f}`).join("\n"))
  process.exit(1)
}
