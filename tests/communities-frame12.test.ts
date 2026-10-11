/**
 * ===========================================================================
 *  COMMUNITIES ROUND 12: THE FRAME, ABOUT, JOINING AND LEAVING
 * ===========================================================================
 *   SEARCH     the phone's search is opaque white, lower, its field with depth;
 *              a post result carries no dot
 *   PLACES     a place lands with a fade and a 6px rise, from the first move on;
 *              the join bar is on the body so nothing fixed rides the page
 *   CONTEXT    the tab bar's Home stays the community's from Profile, Library and
 *              Search until the navigator's Explore, Discover or Dashboard
 *   NAVIGATOR  the current row is a white card with depth, its name in ink
 *   SPINNER    every community loader is the app's ActivitySpinner
 *   MENU       the "..." menu shows the real picture beside the name
 *   BACK       back to the community lands where it was left
 *   TAB        the community's mark as the tab icon, its name in the title
 *   BADGE      the notification bubble is red again
 *   ABOUT      the visitor's and the member's About share the frame's columns
 *   GALLERY    depth, sensible sizes, the first picture first
 *   LEAVE      six reasons and a note, kept for the owner and admins after part 98
 *   JOIN       the check draws itself; the member's frame says welcome
 *   ICONS      a space shows the icon its admin sees, everywhere
 *   LOCATION   "City, Country" on member rows and the card; a country filter
 *   LIBRARY    the library is not taller than the screen on a phone
 *
 *   The frame by frame proof is scripts/check-community-frame12.mjs (and
 *   scripts/check-buyer-library.mjs ONLY=height for the library).
 *
 * Run with:  npm run test:push
 */
import { existsSync } from "node:fs"
import { readCode, readSource } from "./_source"
import { buyerTabFor, buyerTabsAt, communityOf } from "@/lib/nav/buyer-tabs"
import { ENDS_COMMUNITY_CONTEXT, communityContext, endCommunityContext, enterCommunityContext } from "@/lib/nav/community-context"
import { LEAVE_NOTE_MAX, LEAVE_REASONS, isLeaveReason, parseLeaveReason } from "@/lib/communities/leave-reasons"
import { isCountryCode, placeLine } from "@/lib/communities/location"
import { KIND_GLYPH, chosenEmoji, spaceGlyph } from "@/components/community/member/space-glyph"
import { communityTitle, tabIconInitial, tabIconUrl } from "@/components/community/public/seo"
import { SPIN_MS, SPINNER_SPOKES } from "@/components/community/member/place-spinner"
import { NOTIFICATION_BADGE } from "@/components/notifications/badge-tone"
import { JOINED_KEY } from "@/components/community/public/paths"

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

console.log("\nSEARCH: the phone's community search")
{
  const s = code("components/community/member/search.tsx")
  /* Round R8: its stacking moved from z-[80] to SEARCH_SCREEN_Z (136), over an opened post (tests/community-mobile-r8.test.ts). */
  check("the screen's white never fades in (no fade-in on the surface), it sits 10px lower under the clock", /fixed inset-0 flex flex-col bg-white pt-\[calc\(env\(safe-area-inset-top\)\+10px\)\]/.test(s) && /style=\{\{ zIndex: SEARCH_SCREEN_Z \}\}/.test(s) && !/animate-in fade-in-0 slide-in-from-bottom-2/.test(s))
  check("what is on it rises in, a beat apart; Cancel sinks and fades over 180ms", /community-search-rise\{from\{opacity:0;translate:0 8px\}/.test(s) && /animate-\[community-search-out_180ms/.test(s) && /SCREEN_OUT_MS = 180/.test(s))
  check("the field is white on a hairline with a soft shadow", /data-community-search-field=""/.test(s) && /border border-\[#e3e5e9\] bg-white shadow-\[0_1px_2px_rgba\(16,24,40,0\.06\)/.test(s))
  check("a post result has no unread dot", !/data-unread-dot|isUnread|rounded-full bg-\[#1a1a2e\]/.test(s))
  check("a space result shows the space's own icon", /\{spaceGlyph\(s\.icon, s\.kind\)\}/.test(s))
}

console.log("\nPLACES: a fade and a rise, and nothing fixed rides it")
{
  const f = code("components/community/member/shell-frame.tsx")
  /* On the page inside the pull to refresh wrapper, which stays mounted for the visit (community-pull-refresh.tsx). */
  check("ARRIVE is the 260ms fade and 6px rise, none for reduced motion", /export const ARRIVE = "\[&>\[data-pull-to-refresh\]>\[data-pull-content\]>\*\]:animate-\[community-place-in_260ms_cubic-bezier\(0\.22,1,0\.36,1\)\] motion-reduce:\[&>\[data-pull-to-refresh\]>\[data-pull-content\]>\*\]:animate-none"/.test(f) && /@keyframes community-place-in\{from\{opacity:0;translate:0 6px\}to\{opacity:1;translate:0 0\}\}/.test(f))
  /* Round 15: places are the place host's (place-host.tsx): a place lands when the member moves to it, never on the first page, never on a space switched in place (the feed's one slot), never on Back. */
  const host = code("components/community/member/place-host.tsx")
  check("only once the member has moved to another place (the first page and a space switch do not land again)", /if \(!painted\.current\) \{\s*painted\.current = true/.test(host) && /if \(shownRef\.current === shown\.key\) return/.test(host) && /if \(how\.history\) return/.test(host) && /translate: "0 6px"/.test(host))
  const j = code("components/community/public/join-controls.tsx")
  check("the phone's join bar is portalled to the body once the page is in the browser", /const onClient = React\.useSyncExternalStore\(noSubscribe, \(\) => true, \(\) => false\)/.test(j) && /return onClient \? createPortal\(bar, document\.body\) : bar/.test(j) && /\}, \[onClient\]\)/.test(j))
}

console.log("\nCONTEXT: the community stays Home")
{
  check("inside a community the tabs are its own", buyerTabsAt("/community/clay-studio/members")[0].href === "/community/clay-studio" && buyerTabFor("/community/clay-studio/members") === 0)
  check("outside, with a context, Home is still the community's", buyerTabsAt("/account", true, "clay-studio")[0].href === "/community/clay-studio" && buyerTabsAt("/account/library", true, "clay-studio")[0].href === "/community/clay-studio")
  check("with Discover off the bar outside a community stays Library and Profile", JSON.stringify(buyerTabsAt("/account", false, "clay-studio").map((t) => t.key)) === JSON.stringify(["library", "profile"]))
  check("and Profile and Library light their own tabs", buyerTabFor("/account", { homeCommunity: "clay-studio" }) === 3 && buyerTabFor("/account/library", { homeCommunity: "clay-studio" }) === 2)
  check("Explore is not Home while Home is a community's; Search's results still are Search", buyerTabFor("/explore", { homeCommunity: "clay-studio" }) === -1 && buyerTabFor("/explore", { homeCommunity: "clay-studio", query: true }) === 1 && buyerTabFor("/explore/search", { homeCommunity: "clay-studio" }) === 1)
  check("without a context nothing changed", buyerTabsAt("/account")[0].href === "/explore" && buyerTabFor("/explore") === 0)
  check("a context that is not a slug is ignored", buyerTabsAt("/account", true, "../evil")[0].href === "/explore")
  enterCommunityContext("clay-studio")
  const inside = communityContext()
  enterCommunityContext("night-runners")
  const other = communityContext()
  enterCommunityContext("Not A Slug!")
  const kept = communityContext()
  endCommunityContext()
  check("entering one sets it, another replaces it, nonsense never does, the navigator ends it", inside === "clay-studio" && other === "night-runners" && kept === "night-runners" && communityContext() === null)
  check("the navigator's Explore, Discover communities and Dashboard end it", ["explore", "discover-communities", "dashboard"].every((k) => ENDS_COMMUNITY_CONTEXT.has(k)) && !ENDS_COMMUNITY_CONTEXT.has("start-creating"))
  const bar = code("components/nav/buyer-tab-bar.tsx")
  check("the tab bar enters the context inside a community and reads it outside", /useEffect\(\(\) => enterCommunityContext\(community\), \[community\]\)/.test(bar) && /const homeCommunity = community \? null : context/.test(bar) && /buyerTabsAt\(pathname, exploreMarketplaceEnabled, homeCommunity\)/.test(bar))
  const nav = code("components/nav/place-navigator.tsx")
  check("the navigator's rows end it as they are pressed", /if \(key && ENDS_COMMUNITY_CONTEXT\.has\(key\)\) endCommunityContext\(\)/.test(nav) && /onClick=\{go\(r\.href, r\.key\)\}/.test(nav) && /onClick=\{go\(a\.href, a\.key\)\}/.test(nav))
  check("kept for the tab (and mirrored on the native app)", /tabStorageSet\(COMMUNITY_CONTEXT_KEY, next\)/.test(code("lib/nav/community-context.ts")) && communityOf("/community/clay-studio") === "clay-studio")
}

console.log("\nNAVIGATOR: the current row")
{
  const nav = code("components/nav/place-navigator.tsx")
  check("a white card with a hairline and a soft shadow", /const CURRENT_ROW =\s*"bg-white shadow-\[0_0_0_1px_rgba\(16,24,40,0\.08\),0_1px_2px/.test(nav) && /r\.current && CURRENT_ROW/.test(nav))
  check("its name in ink like every other row (no grey veil), the check in ink", /<span className="block truncate font-medium leading-\[1\.3\] text-\[#1a1a2e\]" data-navigator-title="">/.test(nav) && !/r\.current \? "text-\[#6b7280\]" : "text-\[#1a1a2e\]"/.test(nav) && /You are here" className="h-4 w-4 shrink-0 text-\[#1a1a2e\]"/.test(nav))
}

console.log("\nSPINNER: the app's own")
{
  const p = code("components/community/member/place-spinner.tsx")
  check("Spinner is ActivitySpinner at its own 26px, one turn a second", /<ActivitySpinner size=\{size\}/.test(p) && /size = SPINNER_SIZE/.test(p) && SPIN_MS === 1000)
  check("the pull's spokes follow the same tail (0.28) and run round from twelve", SPINNER_SPOKES.length === 8 && SPINNER_SPOKES[0].opacity === 1 && SPINNER_SPOKES[7].opacity === 0.28 && SPINNER_SPOKES[0].x1 === 12)
  check("the About gallery's play spinner is it too", /<ActivitySpinner size=\{22\} label="Loading" className="text-white" \/>/.test(code("components/community/public/gallery-view.tsx")))
}

console.log("\nMENU: the picture beside the name")
{
  const h = code("components/platform/platform-header-client.tsx")
  check("the dropdown opened by a community's \"...\" shows the real picture, 36px, in a hairline ring", /\{trigger === "more" \? \(\s*<span className="flex shrink-0" data-account-who-avatar="">\s*<AppAvatar src=\{avatarUrl\} name=\{name\.trim\(\)\} alt="" size=\{36\}/.test(h))
  const a = code("components/community/member/account-menu.tsx")
  check("from the shell's avatar store, so a new picture shows at once", /const avatarUrl = useShellAvatar\(me\.avatarUrl\) \|\| undefined/.test(a) && (a.match(/avatarUrl=\{avatarUrl\}/g) ?? []).length === 2)
  check("still the community's short list on both", (a.match(/rows="community"/g) ?? []).length === 2)
}

console.log("\nBACK: where it was left")
{
  const r = code("components/community/member/return-scroll.ts")
  check("each page's scroll is noted per address, and a page reached by Back is put back there before it is painted", /window\.addEventListener\("popstate", \(\) => \(poppedAt = performance\.now\(\)\)\)/.test(r) && /useLayoutEffect\(\(\) => \{\s*if \(performance\.now\(\) - poppedAt > BACK_WINDOW_MS\) return/.test(r) && /return restoreTabScroll\(y, 60\)/.test(r))
  check("the frame uses it; the creator's page is read whole on intent", /useReturnScroll\(scrollKeyFor\(pathname \|\| "", searchNow\?\.toString\(\) \?\? ""\), \{ onlyOnArrival: true \}\)/.test(code("components/community/member/shell-frame.tsx")) && /<Link href=\{creator\.href\} \{\.\.\.FULL_ON_HOVER\}/.test(code("components/community/member/top-bar.tsx")))
}

console.log("\nTAB: the community's icon and name")
{
  check("the icon's address changes with the logo and the name", tabIconUrl("clay", "https://x/a.png", "Clay") !== tabIconUrl("clay", "https://x/b.png", "Clay") && tabIconUrl("clay", "https://x/a.png", "Clay") === tabIconUrl("clay", "https://x/a.png", "Clay") && tabIconUrl("clay", null, "Clay").startsWith("/community/clay/tab-icon.png?v="))
  check("a community without a logo is its first letter", tabIconInitial("  clay studio") === "C" && tabIconInitial("42 club") === "4" && tabIconInitial("!!") === "S")
  check("the title: the page's word, then the community", JSON.stringify(communityTitle("Clay Studio")) === JSON.stringify({ default: "Clay Studio", template: "%s · Clay Studio" }))
  const layout = code("app/(marketing)/community/[slug]/layout.tsx")
  check("the layout names both, for a community the viewer may see", /icons: \{ icon: \[\{ url: icon, type: "image\/png", sizes: "64x64" \}\]/.test(layout) && /title: communityTitle\(c\.name\)/.test(layout))
  const route = readSource("app/(marketing)/community/[slug]/tab-icon.png/route.tsx")
  check("the icon route draws the logo at 64px with the mark's corner, the same gates as the share picture", /sharePicture\(community\.logo_url, SIZE, SIZE, "png"\)/.test(route) && /if \(!community \|\| !sharePreviewable\(community\)\) return notFound\(\)/.test(route) && /requireCommunitiesOn|communitiesEnabled/.test(route) && !/export (function|const) (?!GET|runtime|dynamic)/.test(route))
  check("the pages that say the name themselves are absolute", /title: \{ absolute: opts\.about \? `About \$\{title\}` : title \}/.test(code("components/community/public/seo.ts")) && !/title: page\.community\?\.name/.test(code("app/(marketing)/community/[slug]/(member)/layout.tsx")))
}

console.log("\nBADGE: red again")
{
  check("the bubble is red with white figures, round", /rounded-full bg-\[#ef4444\] text-white/.test(NOTIFICATION_BADGE))
  check("on the bell and on a community's Messages", /NOTIFICATION_BADGE\)\}/.test(code("components/notifications/notification-bell.tsx")) && /\$\{NOTIFICATION_BADGE\}/.test(code("components/community/member/top-bar.tsx")))
}

console.log("\nABOUT: the same columns")
{
  const pub = code("components/community/public/public-frame.tsx")
  check("the visitor's frame is the member frame's grid, the bar wide, the card on the left until 1280px (round 15: About's own card carries it from there)", /<CommunityTopBar data=\{topBar\} wide \/>/.test(pub) && /lg:grid-cols-\[260px_minmax\(0,1fr\)\][^"]*xl:grid-cols-\[280px_minmax\(0,1fr\)_300px\]/.test(pub) && /<WallCommunityCard community=\{card\.community\} card=\{card\.card\} membersHref=\{null\} \/>/.test(pub) && /lg:block xl:hidden/.test(pub) && /xl:col-span-full xl:col-start-1/.test(pub))
  const sales = code("components/community/public/sales-page.tsx")
  check("round 15: from 1280px About is one centred page of 1120px, the sheet and its 320px card", /xl:mx-auto xl:grid xl:max-w-\[1120px\] xl:grid-cols-\[minmax\(0,1fr\)_320px\] xl:gap-7/.test(sales))
  const shell = readSource("components/community/member/shell.tsx")
  check("a visitor's card says nothing a member alone may see (no faces, no online, no admins)", /stats: \{ members: community\.member_count \?\? 0, online: null, admins: null \}, faces: \[\], more: 0, settingsHref: null/.test(shell))
  check("round 15: the side card from 1280px carries the cover, the picture and the address (the left card steps aside there)", /<aside data-join-card="" className="hidden xl:block">/.test(code("components/community/public/join-controls.tsx")) && /data-join-card-cover=""/.test(code("components/community/public/join-controls.tsx")))
}

console.log("\nGALLERY: depth and sizes")
{
  const g = code("components/community/public/gallery-view.tsx")
  check("the frame has a soft shadow and an inset hairline; each thumb a shadow and a hairline", /const FRAME_DEPTH = "shadow-\[0_1px_2px_rgba\(16,24,40,0\.06\)/.test(g) && /shadow-\[inset_0_0_0_1px_rgba\(16,24,40,0\.08\)\]/.test(g) && (g.match(/className=\{HAIRLINE\}/g) ?? []).length === 2)
  check("pictures come at the frame's widths, the first first, the far ones lazy, the thumbs at their own size", /const FRAME_WIDTHS = \[640, 750, 828, 1080, 1200, 1920\]/.test(g) && /const priority = i === 0 \? "high" : i === at \? "auto" : "low"/.test(g) && /optimizedImageUrl\(src, 112\)/.test(g) && !/optimizedImageUrl\(g\.url, 1200\)/.test(g))
}

console.log("\nLEAVE: asking why")
{
  check("the six reasons are the table's own, in order", JSON.stringify(LEAVE_REASONS.map((r) => r.key)) === JSON.stringify(["not_for_me", "too_busy", "too_expensive", "content", "people", "other"]) && isLeaveReason("people") && !isLeaveReason("rude"))
  check("a reason and a cleaned note are read", JSON.stringify(parseLeaveReason({ reason: "too_busy", note: "  Back\u0000 in   spring.  " })) === JSON.stringify({ reason: "too_busy", note: "Back in spring." }))
  check("a note alone is Something else; nothing, or an unknown reason without a note, is no answer", parseLeaveReason({ note: "Moving on" })?.reason === "other" && parseLeaveReason({}) === null && parseLeaveReason({ reason: "rude" }) === null && parseLeaveReason(null) === null)
  check("a note is cut at 500", (parseLeaveReason({ reason: "other", note: "x".repeat(900) })?.note ?? "").length === LEAVE_NOTE_MAX && LEAVE_NOTE_MAX === 500)
  const route = code("app/api/community/[communityId]/leave/route.ts")
  check("the route keeps it only once the member has really left", /const why = parseLeaveReason\(await request\.json\(\)\.catch\(\(\) => null\)\)/.test(route) && /if \(why && answer\.state === "left"\) await saveLeaveReason\(admin\(\), communityId, user\.id, why\)/.test(route))
  const srv = code("lib/communities/server/leave-reasons.ts")
  check("before part 98 nothing is asked or saved: the table is looked for and remembered", /export async function leaveReasonsReady\(db: Db\)/.test(srv) && /if \(!\(await leaveReasonsReady\(db\)\)\) return false/.test(srv) && /if \(!\(await leaveReasonsReady\(db\)\)\) return null/.test(srv))
  check("the dashboard reads counts per reason and the latest notes, bounded", /select\("id", \{ head: true, count: "exact" \}\)\.eq\("community_id", communityId\)\.eq\("reason", r\.key\)/.test(srv) && /\.limit\(LEAVE_NOTES_SHOWN\)/.test(srv))
  const page = code("app/app/community/[id]/page.tsx")
  check("only the owner and admins see why people left", /meetsRole\(ctx\.role, "admin"\) \? leaveReasonsSummary\(ctx\.db, ctx\.community\.id\) : Promise\.resolve\(null\)/.test(page) && /<LeaveReasonsCard summary=\{left\} \/>/.test(page))
  const j = code("components/community/public/join-controls.tsx")
  check("the dialog asks only when part 98 is in, every answer optional", /\{askWhy \? \(/.test(j) && /role="radiogroup"/.test(j) && /onClick=\{\(\) => setReason\(on \? null : r\.key\)\}/.test(j) && /leave\(askWhy \? \{ reason, note \} : undefined\)/.test(j))
}

console.log("\nJOIN: the moment")
{
  const j = code("components/community/public/join-controls.tsx")
  check("You're in: the check draws itself, the button keeps its size", /function DrawnCheck\(\)/.test(j) && /join-check-draw\{from\{stroke-dashoffset:20\}to\{stroke-dashoffset:0\}\}/.test(j) && /<DrawnCheck \/>\s*You&apos;re in/.test(j))
  check("the member's frame says welcome, once", /window\.sessionStorage\.setItem\(JOINED_KEY, slug\)/.test(j) && JOINED_KEY === "storelib:community-joined" && /toast\(`Welcome to \$\{community\.name\}`\)/.test(code("components/community/member/shell-frame.tsx")))
}

console.log("\nICONS: the icon the admin sees")
{
  check("an emoji the admin typed, else the kind's", spaceGlyph("🏺", "feed") === "🏺" && spaceGlyph("megaphone", "announcements") === "📣" && spaceGlyph("messages-square", "feed") === "💬" && spaceGlyph(null, "chat") === "⚡" && spaceGlyph("", "resources") === "📚")
  check("the same four as the dashboard's", JSON.stringify(KIND_GLYPH) === JSON.stringify({ feed: "💬", chat: "⚡", announcements: "📣", resources: "📚" }) && /const KIND_ICON: Record<SpaceKind, string> = \{ feed: "💬", chat: "⚡", announcements: "📣", resources: "📚" \}/.test(code("components/community/creator/spaces-section.tsx")))
  check("a word name is not an emoji", chosenEmoji("hand") === null && chosenEmoji("👋") === "👋")
  check("every chip draws it; the chat's head too", /<span aria-hidden className="(?:relative z-\[2\] )?text-\[14px\] leading-none" data-space-glyph="">\{glyph\}<\/span>/.test(code("components/community/member/space-chips.tsx")) && /spaceGlyph\(icon, kind\)/.test(code("components/community/member/space-icon.tsx")))
  check("a post's space carries its icon and kind for the card", /space: space \? \{ id: space\.id, slug: space\.slug, name: space\.name, icon: space\.icon, kind: space\.kind \} : null/.test(code("lib/communities/server/feed.ts")))
}

console.log("\nLOCATION: where people are from")
{
  check("City, Country by the country's name, either alone, nothing for nothing", placeLine("Lisbon", "PT") === "Lisbon, Portugal" && placeLine(null, "IN") === "India" && placeLine("  Porto  ", null) === "Porto" && placeLine("", "") === null && placeLine("Atlantis", "ZZ") === "Atlantis")
  check("a country code is two capitals that name a country", isCountryCode("PT") && !isCountryCode("pt") && !isCountryCode("ZZ") && !isCountryCode("PRT"))
  const dir = code("lib/communities/server/directory.ts")
  check("the directory reads it with the names, and quietly without it before part 98", /const PROFILE_WITH_PLACE = `\$\{PROFILE_BASE\}, location_city, location_country`/.test(dir) && /if \(error && columnMissing\(error\)\) \{\s*placeColumns = false/.test(dir) && /location: placeLine\(p\?\.location_city, p\?\.location_country\)/.test(dir))
  check("the country filter walks the members' keyset in bounded chunks", /export const COUNTRY_SCAN_CHUNK = 200/.test(dir) && /export const COUNTRY_SCAN_MAX = 2000/.test(dir) && /\.in\("id", rows\.map\(\(r\) => r\.user_id\)\)\.eq\("location_country", country\)/.test(dir))
  check("the card reads it too", /read\("bio, show_communities, location_city, location_country"\)/.test(code("lib/communities/server/people.ts")) && /data-person-card-location=""/.test(code("components/community/member/person-card.tsx")))
  const m = code("components/community/member/members.tsx")
  check("rows say it in quiet text; the filter is offered once profiles can say it", /data-member-location=""/.test(m) && /\{countryFilter \? <CountrySelect value=\{country\} onChange=\{setCountry\} \/> : null\}/.test(m) && /if \(country\) p\.set\("country", country\)/.test(m))
}

console.log("\nLIBRARY: no height that is not there")
{
  const bar = code("components/nav/buyer-tab-bar.tsx")
  check("where the tab bar is drawn the body does not pad for the home indicator a second time", /export const TAB_BAR_BODY = "@media \(max-width: 767px\)\{body\{padding-bottom:0\}\}"/.test(bar) && /<style>\{TAB_BAR_BODY\}<\/style>/.test(bar) && /padding-bottom: env\(safe-area-inset-bottom\);/.test(readSource("app/globals.css")))
}

console.log("\nPROBES")
check("the round 12 probes exist", existsSync("scripts/check-community-frame12.mjs") && /part\("height"\)/.test(readSource("scripts/check-buyer-library.mjs")))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  console.log(failures.map((f) => `  - ${f}`).join("\n"))
  process.exit(1)
}
