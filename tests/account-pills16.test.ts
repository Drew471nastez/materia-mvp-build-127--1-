/**
 * ===========================================================================
 *  ROUND 16: THE ACCOUNT PAGE IS THE PROFILE TAB AGAIN, AND THE PILLS ARE QUIET
 * ===========================================================================
 * The owner, after round 15 on the iPhone: "I didn't mean for the profile
 * account user page to be changed from how it was before, and the Edit
 * profile page as well should be the full screen one ... The account user
 * profile page should be how it was before, but optimized for our things."
 * And of the space pills: "too exaggerated: make it more smooth, subtle,
 * simple, clean."
 *
 *   PROFILE   the Profile tab is /account inside a community and out; its
 *             press is a page like any other, never the community's place
 *   ME        ?profile=me (and my own handle) goes to the account page;
 *             ?profile=<handle> is somebody else's place, unchanged
 *   EDIT      Edit profile is the account page's own door: the full screen
 *             layer on a phone, Settings' address on a computer; round 15's
 *             card and its link under the community header are gone
 *   POSTS     my posts from every community are a Posts pill of /account
 *   PILLS     the chosen pill's ink fades in where it is and the old one
 *             fades out, PILL_FADE_MS, nothing moves across the row; the
 *             press is a light tint; round 15's tap fixes are kept
 *
 *   The pictures and frames: scripts/check-account-pills16.mjs and
 *   scripts/check-space-pills16.mjs.
 *
 * Run with:  pnpm run test:push
 */
import { existsSync } from "node:fs"
import { readCode, readSource } from "./_source"
import { buyerTabFor, buyerTabsAt } from "@/lib/nav/buyer-tabs"
import { placeFromUrl } from "@/lib/communities/client/places"
import { ACCOUNT_POSTS, EDIT_PROFILE_HREF, ownerPillFor, ownerPillLinks, showsProfileHeader } from "@/lib/profile/owner-pills"
import { ACCOUNT_COMMUNITY_HEADER_BOOT } from "@/lib/nav/account-community-header-boot"
import { CLICK_AFTER_MS, HIT_X, HIT_Y, LIST_AFTER_MS, PILL_FADE_EASE, PILL_FADE_MS, PRESS_FROM, PRESS_IN_MS, PRESS_OUT_MS, PULL_TAP_SLOP, TOUCH_H, WORD_TURN_MS, fadeAt } from "@/components/community/member/chip-hit"

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

console.log("\nPROFILE: the tab is the account page, inside a community and out")
{
  const inside = buyerTabsAt("/community/clay-studio/learn")
  const home = buyerTabsAt("/community/clay-studio")
  const outside = buyerTabsAt("/explore")
  const kept = buyerTabsAt("/account", true, "clay-studio")
  const profile = (tabs: { key: string; href: string }[]) => tabs.find((t) => t.key === "profile")?.href
  check("inside a community (its home and its pages) Profile is /account", profile(inside) === "/account" && profile(home) === "/account", [profile(inside), profile(home)])
  check("outside, and with a community kept as Home, Profile is /account", profile(outside) === "/account" && profile(kept) === "/account")
  check("inside, the rest of round 15's bar stays: Home the community's, Search, Create post", inside.map((t) => t.key).join() === "home,search,compose,profile" && inside[0].href === "/community/clay-studio")
  check("/account lights Profile; a community's pages light Home", buyerTabFor("/account") === 3 && buyerTabFor("/community/clay-studio/learn") === 0)
  const bar = code("components/nav/buyer-tab-bar.tsx")
  check("the press: only Home goes through the community's navigator; Profile is never the ?profile=me place", /if \(navHere && signedIn && tab\.key === "home"\) \{\s*navHere\.go\(\{ kind: "feed" \}\)/.test(bar) && !/kind: "profile", ref: "me"/.test(bar))
  check("  so Profile goes as a page, with the community's bar held for /account (as before round 15)", /if \(tab\.key === "profile" && href\.startsWith\("\/account"\) && communityContext\(\)\) \{\s*document\.documentElement\.setAttribute\("data-account-community-pending", ""\)/.test(bar))
  check("  and in the app it changes page in one piece, community to account", /const crosses = !!communityOf\(href\) !== !!communityOf\(pathname\)/.test(bar))
  check("  and /account is read ahead from inside the community (only the feed is the navigator's)", /\(navHere && tab\.key === "home"\) \? \[\] : \[hrefOf\(i\)\]/.test(bar) && /key !== "compose" && !\(navHere && key === "home"\)\) prefetchHref/.test(bar))
  check("the other session's community bar over the account page is still mounted and still decides by the profile's pages", /<AccountCommunityChrome \/>/.test(code("app/layout.tsx")) && /const active = !!ctx\.slug && showsProfileHeader\(pathname\)/.test(code("components/account/account-community-chrome.tsx")))
}

console.log("\nME: ?profile=me is the account page; somebody else's profile is unchanged")
{
  const page = code("app/(marketing)/community/[slug]/page.tsx")
  check("a fresh load of ?profile=me redirects to /account before anything is drawn", /if \(typeof query\.profile === "string" && query\.profile\.trim\(\)\.toLowerCase\(\) === "me"\) redirect\("\/account"\)/.test(page))
  check("  and only that: ?profile=<handle> still seeds the shell's place", /for \(const k of \["profile", "space"\]\)/.test(page) && JSON.stringify(placeFromUrl("/community/clay", "profile=maria")) === JSON.stringify({ kind: "profile", ref: "maria" }))
  const view = code("components/community/member/member-profile.tsx")
  check("inside the shell, my own profile (me, or my own handle) puts the account page in its place", /const self = profileRef\.toLowerCase\(\) === "me" \|\| !!data\?\.self/.test(view) && /if \(self\) return <AccountRedirect slug=\{community\.slug\} onScreen=\{onScreen\} \/>/.test(view))
  check("  replacing the address (back is the place before), with the community kept as the context and its bar held", /const go = \(\) => router\.replace\(OWN_PROFILE_HREF, \{ scroll: false \}\)/.test(view) && /export const OWN_PROFILE_HREF = "\/account"/.test(view) && /enterCommunityContext\(slug\)/.test(view) && /setAttribute\("data-account-community-pending", ""\)/.test(view))
  check("  only while that place is on screen, so a kept screen never sends anybody anywhere", /if \(!onScreen \|\| sent\.current\) return/.test(view) && /nav\.place\.kind === "profile" && nav\.place\.ref\.toLowerCase\(\) === profileRef\.toLowerCase\(\)/.test(view))
  check("  and it draws no card of its own meanwhile", !/SelfTabs|Your posts|data-profile-self-tabs/.test(view))
  check("somebody else's profile keeps its head, Follow, the door to their page and their posts here", /<FollowButton following=\{follow\.following\}/.test(view) && /fullPageHref\(person\.pageHref, community\.slug, profileRef\)/.test(view) && /Posts in \{community\.name\}/.test(view))
}

console.log("\nEDIT: Edit profile is the account page's own, full screen")
{
  const view = code("components/community/member/member-profile.tsx")
  check("no Edit profile link under the community header any more", !/\/account\/settings/.test(view) && !/data-member-profile-edit/.test(view))
  check("the account page's Edit profile goes to Settings' profile fields", EDIT_PROFILE_HREF === "/account/settings")
  const door = code("components/account/edit-profile-door.tsx")
  check("  on a phone and in the apps as the full screen layer over the page; on a computer by address", /if \(settingsStaysHere\(\) \|\| !window\.matchMedia\?\.\("\(min-width: 768px\)"\)\.matches\) \{\s*openSettingsSubpage\("profile"\)/.test(door) && /router\.push\(SETTINGS_PROFILE\)/.test(door) && /const SETTINGS_PROFILE = "\/account\/settings\?section=profile"/.test(door))
  check("  the layer is the whole screen above the tab bar (a screen layer), mounted inside the providers", /useLayer\("screen", true, panel\)/.test(code("components/account/settings-subpage.tsx")) && /<SettingsSubpageHost \/>/.test(code("app/layout.tsx")))
  check("Settings has no community bar over it (the bar is for the profile's own pages only)", !showsProfileHeader("/account/settings") && !showsProfileHeader("/account/settings?section=profile"))
}

console.log("\nPOSTS: my posts from every community, a pill of the account page")
{
  check("a Posts pill after Activity, to /account/posts, while communities are on", ACCOUNT_POSTS === "/account/posts" && ownerPillLinks(true).map((p) => p.key).join() === "activity,posts,communities,library,settings" && !ownerPillLinks(false).some((p) => p.key === "posts"))
  check("  a creator has it too", ownerPillLinks(true, true).map((p) => p.key).join() === "posts,communities,library,settings")
  check("/account/posts lights it, and the person's header and the community's bar stand over it", ownerPillFor("/account/posts") === "posts" && showsProfileHeader("/account/posts") && ACCOUNT_COMMUNITY_HEADER_BOOT.includes('p!=="/account/posts"'))
  const page = code("app/account/posts/page.tsx")
  check("the page: 404 with communities off, sign in with its own address, the first page from round 15's loader", /if \(!\(await communitiesEnabled\(\)\)\) notFound\(\)/.test(page) && /pageUser\(accountLoginPath\("\/account\/posts"\)\)/.test(page) && /myPostsPage\(admin\(\), user\.id, null\)/.test(page))
  const route = code("app/api/account/posts/route.ts")
  check("the next pages: the switch first, the session's own person only, a bounded cursor", route.indexOf("requireCommunitiesOn()") < route.indexOf("sessionUserId()") && /if \(!userId\) return NextResponse\.json\(\{ error: "unauthorized" \}, \{ status: 401/.test(route) && /myPostsPage\(admin\(\), userId, raw && raw\.length <= 400 \? raw : null\)/.test(route) && !/searchParams\.get\("(user|userId|id)"\)/.test(route))
  const list = code("components/account/account-posts.tsx")
  check("drawn in the Activity list's own look (white card on a hairline, 44px picture, Show more)", /const LIST = "divide-y divide-\[#f0f1f3\] rounded-2xl border border-\[#e5e7eb\]\/60 bg-white shadow-\[0_1px_3px_rgba\(0,0,0,0\.04\)\]"/.test(list) && /h-11 w-11/.test(list) && /Show more/.test(list) && /divide-y divide-\[#f0f1f3\] rounded-2xl border border-\[#e5e7eb\]\/60 bg-white shadow-\[0_1px_3px_rgba\(0,0,0,0\.04\)\]/.test(code("components/profile/profile-activity.tsx")))
  check("Edit and Delete only where the row allows, Edit opening the post's editor", /if \(post\.canEdit\)\s*items\.push\(\{\s*label: "Edit post"[\s\S]{0,400}router\.push\(postEditHref\(post\.href\)\)/.test(list) && /if \(post\.canDelete\) items\.push\(\{ label: "Delete post"/.test(list))
  check("Delete asks first, goes through the post's own route, and the row folds only after a yes", /setConfirm\(\{\s*title: "Delete this post\?"/.test(list) && /api\(`\$\{apiBase\(post\.community\.id\)\}\/posts\/\$\{post\.id\}`, \{ method: "DELETE" \}\)[\s\S]{0,120}if \(!r\.ok\) \{[\s\S]{0,60}return false[\s\S]{0,500}row\.animate/.test(list))
  check("a pull at the top reads the first page again", /detail\.scope !== ACCOUNT_REFRESH_SCOPE/.test(list) && /detail\.done = first\.current\(\)/.test(list))
}

console.log("\nPILLS: the fill appears where it is; nothing slides")
{
  const chips = code("components/community/member/space-chips.tsx")
  check("the fade is short and soft: PILL_FADE_MS between 120 and 160ms", PILL_FADE_MS >= 120 && PILL_FADE_MS <= 160, PILL_FADE_MS)
  const fill = /const FILL =\s*"([^"]*)"/.exec(chips)?.[1] ?? ""
  const curve = PILL_FADE_EASE.replace(/\s+/g, "")
  check("every pill's ink fades by opacity on that time and curve, in and out alike", fill.includes("transition-opacity") && fill.includes(`duration-[${PILL_FADE_MS}ms]`) && fill.includes(`ease-[${curve}]`) && /className=\{`\$\{FILL\} \$\{on \? "opacity-100" : "opacity-0"\}`\}/.test(chips))
  check("  every pill carries its own ink, always there (no ink that mounts on the chosen one only)", /function Fill\(\{ on \}: \{ on: boolean \}\) \{\s*return <span/.test(chips) && /<Fill on=\{allOn\} \/>/.test(chips) && /<Fill on=\{on\} \/>/.test(chips))
  check("nothing translates across the row: no gliding ink, no translate, scale or position in the pills' motion", !existsSync("components/community/member/chip-ink.tsx") && !/ChipInk|ink-gliding|chip-ink/.test(chips) && !/translate|scale-|\bscale:|\.style\./.test(chips) && !/left:/.test(chips.replace(/export function followChosenChip[\s\S]*?\n\}\n/, "")))
  check("no pill changes size: the words are two stacked copies, the unread dot kept", /col-start-1 row-start-1/.test(chips) && /h-1\.5 w-1\.5 rounded-full bg-\[#1a1a2e\] \$\{on \? "opacity-0" : ""\}/.test(chips))
  const word = /const WORD = "([^"]*)"/.exec(chips)?.[1] ?? ""
  check("the words turn in one step as the ink reaches half way, so they never vanish into a half drawn ink", word.includes(`duration-[${WORD_TURN_MS}ms]`) && word.includes("ease-[steps(1,end)]") && fadeAt(WORD_TURN_MS) > 0.3 && fadeAt(WORD_TURN_MS) < 0.5, fadeAt(WORD_TURN_MS))
  check("the chip's own shadow changes on the same time and curve", chips.includes(`transition-[background-color,box-shadow] duration-[${PILL_FADE_MS}ms] ease-[${curve}]`))
  check("reduced motion: the ink and the words are simply there", fill.includes("motion-reduce:transition-none") && word.includes("motion-reduce:transition-none"))
  const press = /const PRESS = "([^"]*)"/.exec(chips)?.[1] ?? ""
  check("the press is a light tint (#f1f2f4, no inset shadow), part of the way on the first frame, quick in and a little slower out", press.includes("bg-[#f1f2f4]") && !/shadow/.test(press) && PRESS_FROM > 0.2 && PRESS_FROM < 0.5 && PRESS_IN_MS <= 120 && PRESS_OUT_MS > PRESS_IN_MS && PRESS_OUT_MS <= 200)
  check("the new list comes once the fade is nearly whole, never after it has long ended", LIST_AFTER_MS <= PILL_FADE_MS && fadeAt(LIST_AFTER_MS) > 0.9, fadeAt(LIST_AFTER_MS))
  check("round 15's fixes kept: the hit area reaches into the gaps, 44px tall, the tap taken on the lift, the click after it not a second switch, the pull's slop", chips.includes(`after:-inset-x-[${HIT_X}px]`) && chips.includes(`after:-inset-y-[${HIT_Y}px]`) && TOUCH_H >= 44 && /isTap\(started, \{ x: e\.clientX, y: e\.clientY, t: performance\.now\(\) \}\)/.test(chips) && /if \(performance\.now\(\) - tookAt < CLICK_AFTER_MS\) return/.test(chips) && CLICK_AFTER_MS >= 500 && PULL_TAP_SLOP >= 6)
}

console.log("\nHOUSE RULES")
{
  const files = [
    "lib/nav/buyer-tabs.ts",
    "components/community/member/member-profile.tsx",
    "components/community/member/space-chips.tsx",
    "components/community/member/chip-hit.ts",
    "components/account/account-posts.tsx",
    "app/account/posts/page.tsx",
    "app/api/account/posts/route.ts",
    "lib/profile/owner-pills.ts",
    "scripts/check-account-pills16.mjs",
    "scripts/render-account-pills16.tsx",
    "scripts/check-space-pills16.mjs",
    "scripts/render-space-pills16.tsx",
  ]
  /* The words are spelled out in pieces here so this file does not hold them itself. */
  const banned = new RegExp(["\\u2014", "unlock", "elevate", "seamless", "powerful", "effortless", "supercharge", "trans" + "form"].map((w) => (w.startsWith("\\") ? w : `\\b${w}`)).join("|"), "i")
  const bad = files.filter((f) => banned.test(readSource(f)))
  check("no em dash and no banned word in this round's files", bad.length === 0, bad)
  const client = ["components/account/account-posts.tsx", "components/community/member/member-profile.tsx", "components/community/member/space-chips.tsx"]
  check("client modules import no server code", client.every((f) => !/from "(@\/lib\/communities\/server|next\/headers|server-only)/.test(readSource(f))))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  console.log(failures.map((f) => `  - ${f}`).join("\n"))
  process.exit(1)
}
