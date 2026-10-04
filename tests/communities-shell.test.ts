/**
 * ===========================================================================
 *  COMMUNITIES ROUND 2: THE COMMUNITY'S OWN FRAME AND ITS ABOUT PAGE
 * ===========================================================================
 *   NO STORELIB BAR    nothing of Storelib's header under /community/<slug>;
 *                      the community's layout draws its own bar instead, for
 *                      members (with the pills) and for everybody else (alone),
 *                      and never around a draft or suspended community for
 *                      somebody who may not see it.
 *   THE TOP BAR        the logo and name, then the hamburger (Storelib's
 *                      one navigator) right of them (round 4), By <creator>
 *                      to their page, no chevron switcher, Messages wired to
 *                      the existing panel, the bell, my menu (profile,
 *                      library, settings, explore), a hairline and a soft
 *                      shadow under it. Round 4: slimmer, one compact bar
 *                      (the tabs inside it from 1024px), and nothing in it
 *                      pill shaped: plain icon buttons, Log in as a word,
 *                      squared counts.
 *   TABS AND CHIPS     one row of plain text tabs with a line under the
 *                      chosen one (not pills): Community, Classroom, Calendar,
 *                      Members, Leaderboards, About, only those on; spaces as
 *                      chips at the top of the feed.
 *   PEOPLE             every name opens the person's page by one rule:
 *                      /<handle> for a storefront, /@handle otherwise. There
 *                      is no member page inside a community: its old address
 *                      redirects to the person's page.
 *   PERSON CARD        resting on a name opens a card (350ms in, a short
 *                      grace out, keyboard focus too, never on touch) with
 *                      public facts only, from a rate limited member route.
 *   MESSAGE            opens the panel in place; ?dm=<userId> opens that
 *                      conversation once and leaves the address.
 *   ABOUT              the gallery (or the cover), the facts line, real
 *                      reviews with "Still a paying member" only when true,
 *                      Members / Online / Admins with Online from a real
 *                      heartbeat or not shown, the sticky card, the phone bar.
 *   PRESENCE           POST /presence: switch first, a member, rate limited,
 *                      at most one write a minute, nobody else's row.
 *   THE WALL (round 5) three columns from 1280px like the owner's reference:
 *                      the community card and the places on the left, the
 *                      feed, the next event and the top contributors on the
 *                      right, each card only when real rows say something
 *                      (no right column at all when neither does); points
 *                      or posts and comments, said plainly; Settings and
 *                      Event only for who may use them.
 *   ROUND 7 (frame)    the bar taller (64px, 56px on a phone), the picture
 *                      and the bell bigger, the hamburger's three even lines
 *                      in a light grey button with a hairline, LEFT of the
 *                      picture on a phone, By <creator> on a computer only;
 *                      a "..." opening exactly the Storelib account menu
 *                      (Profile is /account); no address line on the card;
 *                      the places on the RIGHT, the contributors on the left;
 *                      a sort menu (Default, New, Top, Unread) instead of
 *                      Latest / Popular, read by the server; spaces and
 *                      sorts switched in place from a client cache; a
 *                      hairline and a one pixel shadow on every chip and
 *                      button.
 *   SEARCH (round 5)   GET /search: switch first, a member, rate limited,
 *                      only what the member may see (spaces by their access
 *                      rule, posts in those spaces, members while the
 *                      directory is on); the field is a keyboard combobox,
 *                      a full screen on a phone.
 *
 * Run with:  npm run test:push
 */
import { existsSync, readFileSync } from "node:fs"

import { fakeDb } from "./_fake-db"
import { memberHref } from "@/components/community/member/person-href"
import { personHref } from "@/lib/profile/person-href"
import { navEntries, rightColumnFor, sectionFromPath, tabFor } from "@/components/community/member/nav"
import { contributorsDetail } from "@/components/community/member/wall"
import { SEARCH_DEBOUNCE_MS, SEARCH_MIN_CHARS, searchOptions, stepOption } from "@/components/community/member/search"
import { ACTIVITY_SCAN, WALL_CONTRIBUTORS, WALL_FACES, eventHrefFor, mostActive, rankRows, recentFaces, settingsHrefFor, topContributors, upcomingEvent } from "@/lib/communities/server/wall"
import { SEARCH_MAX, SEARCH_MIN, SEARCH_POSTS, cleanSearch, likePattern, searchCommunity, snippetAround } from "@/lib/communities/server/search"
import { activeLabel, CARD_GRACE_MS, CARD_OPEN_MS, communitiesLine, hoverPointer, ownerLine } from "@/components/community/member/person-card-facts"
import { personCard } from "@/lib/communities/server/people"
import { GALLERY_MAX, parseGallery, payingTenure, safeImageUrl } from "@/components/community/public/gallery"
import { communityGallery, loadSalesPage, topBarData } from "@/lib/communities/server/public"
import { adminCount, communityStats, HEARTBEAT_MS, onlineCount, ONLINE_WINDOW_MS, touchPresence } from "@/lib/communities/server/presence"
import { RATE_LIMITS, rateBucket } from "@/lib/communities/limits"
import { FEED_SORTS, cursorAfter, decodeCursor, encodeCursor, feedSort, keysetCondition, listFeed, unreadSince } from "@/lib/communities/server/feed"
import { FRESH_MS, addPost, clearViews, dropSaved, firstPage, loadView, patchPost, prefetchView, readView, viewKey, viewUrl, writeView } from "@/components/community/member/feed-cache"

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
const read = (p: string) => readFileSync(p, "utf8")
/* Code without its comments, so a check reads what runs. */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

/*
  A database that answers each query from a function and records how it was
  asked (every method and its arguments), for the reads the shared fakeDb
  does not speak (or, gt, order, rpc).
*/
type Call = { table: string; ops: unknown[][] }
function scriptedDb(answer: (c: Call) => { data?: unknown; error?: unknown }, rpc?: (name: string, args: unknown) => { data?: unknown; error?: unknown }) {
  const calls: Call[] = []
  const db = {
    from(table: string) {
      const c: Call = { table, ops: [] }
      calls.push(c)
      const b: Record<string, unknown> = new Proxy(
        {},
        {
          get(_t, k) {
            if (k === "then")
              return (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
                Promise.resolve()
                  .then(() => {
                    const a = answer(c)
                    return { data: a.data ?? null, error: a.error ?? null }
                  })
                  .then(res, rej)
            return (...args: unknown[]) => (c.ops.push([String(k), ...args]), b)
          },
        },
      )
      return b
    },
    rpc: async (name: string, args: unknown) => {
      const a = rpc ? rpc(name, args) : { data: null }
      return { data: a.data ?? null, error: a.error ?? null }
    },
  }
  return { db, calls }
}
const hasOp = (c: Call, ...want: unknown[]) => c.ops.some((o) => JSON.stringify(o) === JSON.stringify(want))
const orderOf = (c: Call) => c.ops.filter((o) => o[0] === "order").map((o) => o[1])
/* The rows of a table that an eq / in / is / gt / gte / limit read would return. */
function rowsFor(c: Call, tables: Record<string, Record<string, unknown>[]>) {
  let rows = [...(tables[c.table] ?? [])]
  for (const [op, col, val] of c.ops as [string, string, unknown][]) {
    if (op === "eq") rows = rows.filter((r) => r[col] === val)
    else if (op === "in") rows = rows.filter((r) => (val as unknown[]).includes(r[col]))
    else if (op === "is") rows = rows.filter((r) => (val === null ? r[col] == null : r[col] === val))
    else if (op === "gt") rows = rows.filter((r) => String(r[col] ?? "") > String(val))
    else if (op === "gte") rows = rows.filter((r) => String(r[col] ?? "") >= String(val))
  }
  const limit = c.ops.find((o) => o[0] === "limit")?.[1]
  return typeof limit === "number" ? rows.slice(0, limit) : rows
}

const DAY = 86_400_000
const NOW = Date.parse("2026-10-03T12:00:00.000Z")
const iso = (ms: number) => new Date(ms).toISOString()

async function main() {
  /* ── No Storelib bar ─────────────────────────────────────────────────── */
  console.log("\nNo Storelib bar under /community")
  {
    const header = code("components/marketing/conditional-header.tsx")
    check("every page under /community/<slug> is its own screen: the platform header is not drawn", /function isOwnScreen\(p: string\): boolean \{[^}]*p\.startsWith\("\/community\/"\)/.test(header))
    check("and that is decided in the first render, so it never flashes in", /useState\(\s*\(\) => !isOwnScreen\(pathname\)/.test(header))
    check("the old hide-it-after-paint class is gone", !existsSync("components/community/public/plain-chrome.tsx") && !/community-plain/.test(read("app/globals.css")))
    const layout = code("app/(marketing)/community/[slug]/layout.tsx")
    check("the layout draws the member frame for an active member", /page\.state === "member" && page\.community && page\.viewer\)[\s\S]{0,80}<CommunityShell community=\{page\.community\} viewer=\{page\.viewer\}>/.test(layout))
    check("and the bar alone for anybody else who may see the community", /barVisible\(page\)\)[\s\S]{0,80}<CommunityPublicShell community=\{page\.community\} viewer=\{page\.viewer\}>/.test(layout))
    check("never around a missing, switched off or suspended community", /page\.state === "off" \|\| page\.state === "missing" \|\| page\.state === "closed"\) return false/.test(layout))
    check("and a draft only for its staff", /community\.status !== "draft"\) return true[\s\S]{0,40}return !!viewer && \(viewer\.isOwner \|\| viewer\.isCreatorAccount \|\| meetsRole\(viewer\.role, "moderator"\)\)/.test(layout))
    check("community pages are still never indexed by the layout", /robots: \{ index: false, follow: false \}/.test(layout))
  }

  /* ── The top bar ─────────────────────────────────────────────────────── */
  console.log("\nThe community's top bar")
  {
    const bar = code("components/community/member/top-bar.tsx")
    check("logo and name go to the community's home", /<Link href=\{base\} aria-label=\{`\$\{community\.name\}, home`\}/.test(bar) && /<Link href=\{base\} className="block truncate/.test(bar))
    check("By <creator> opens the creator's page", /By\{" "\}[\s\S]{0,80}<Link href=\{creator\.href\}/.test(bar))
    check("no chevron switcher any more", !/ChevronsUpDown|Switch community|data-community-switcher/.test(bar))
    const render = bar.slice(bar.indexOf("<header"))
    check("the hamburger RIGHT of the picture and the name on a computer: Storelib's navigator, marked as this community", /<PlaceNavigator current=\{\{ kind: "community", id: community\.id \}\}/.test(render) && render.indexOf("<CommunityMark") < render.indexOf("<PlaceNavigator") && render.indexOf("data-community-identity") < render.indexOf("<PlaceNavigator") && render.indexOf("<PlaceNavigator") < render.indexOf("data-community-top-actions"))
    /* Round 7, ask 5: on a phone the hamburger moves LEFT of the picture, by order (one navigator, not two). */
    check("round 7: on a phone it sits LEFT of the picture (order-first), from 768px back after the name; one navigator", /<div className="order-first flex shrink-0 md:order-none[^"]*" data-community-hamburger="">\s*<PlaceNavigator /.test(render) && (render.match(/<PlaceNavigator /g) || []).length === 1)
    check("round 7: taller, not fat: a 56px row on a phone and a tablet, 64px from 1024px, the tabs a row of their own under it below 1024px", /data-community-top-lead=""/.test(bar) && /"flex h-14 min-w-0 flex-1 items-center gap-2 md:gap-3 lg:h-16"/.test(bar) && /flex h-14 shrink-0 items-center[^"]*lg:h-16/.test(bar) && /"order-last -mx-4 min-w-0 basis-\[calc\(100%\+2rem\)\] sm:-mx-6 sm:basis-\[calc\(100%\+3rem\)\] lg:-mx-8 lg:basis-\[calc\(100%\+4rem\)\]", !tabsOnDesktop && "lg:hidden"/.test(bar))
    check("round 7: the community's picture a bit bigger (36px on a phone, 40px from 768px), the bell and Messages 24px glyphs", /<CommunityMark community=\{community\} size=\{36\} \/>/.test(bar) && /<CommunityMark community=\{community\} size=\{40\} \/>/.test(bar) && /\[&_svg\.lucide-bell\]:h-6 \[&_svg\.lucide-bell\]:w-6/.test(bar) && /<ChatLine size=\{24\} \/>/.test(bar))
    check("round 7: By <creator> on a computer only", /<p className="hidden truncate[^"]*md:block" data-community-by="">/.test(bar))
    const ui = code("components/community/member/ui.ts")
    const plain = /export const PLAIN_ICON_BTN =\s*"([^"]+)"/.exec(ui)?.[1] ?? ""
    check("nothing pill shaped: the icons are plain 40px icon buttons with no disc, squared at 10px", !!plain && /h-10 w-10/.test(plain) && /rounded-\[10px\] bg-transparent/.test(plain) && /hover:bg-transparent hover:text-\[#1a1a2e\]/.test(plain) && !/rounded-full/.test(plain), plain)
    check("Messages and the bell use it; the counts are squared, not round", /className=\{cn\(PLAIN_ICON_BTN, "relative"/.test(bar) && /const BELL = `\$\{PLAIN_ICON_BTN\} \[&_\[data-bell-badge\]\]:rounded-\[5px\]/.test(bar) && /<NotificationBell className=\{BELL\} \/>/.test(bar) && /const COUNT = "rounded-\[5px\]"/.test(bar) && !/\bICON_BTN\b/.test(bar))
    /* Round 7, ask 5: the hamburger and the "..." carry "extremely little depth": a faint grey ground, a hairline, a one pixel shadow, squared at 10px. */
    const depthIcon = /export const DEPTH_ICON_BTN =\s*"([^"]+)"/.exec(ui)?.[1] ?? ""
    check("round 7: DEPTH_ICON_BTN is a 40px square at 10px with a faint grey ground, a hairline and a one pixel shadow (not a pill)", /h-10 w-10/.test(depthIcon) && /rounded-\[10px\]/.test(depthIcon) && /border border-\[#e6e8eb\] bg-\[#f8f9fa\]/.test(depthIcon) && /shadow-\[0_1px_1px_rgba\(16,24,40,0\.04\)\]/.test(depthIcon) && !/rounded-full/.test(depthIcon), depthIcon)
    check("round 7: the hamburger is that button, its three lines 18px wide and 4px apart", /const HAMBURGER = `\$\{DEPTH_ICON_BTN\} rounded-\[10px\][^`]*\[&_\[data-navigator-lines\]\]:w-\[18px\] \[&_\[data-navigator-lines\]\]:gap-\[4px\]`/.test(bar) && /<PlaceNavigator current=\{\{ kind: "community", id: community\.id \}\} className=\{HAMBURGER\} \/>/.test(bar))
    check("Log in is a word, not an outlined pill", /data-community-login=""/.test(bar) && !/border border-\[#e3e4e8\][^"]*\n?[^"]*data-community-login/.test(bar) && /inline-flex h-10 shrink-0 items-center px-2 text-\[14px\] font-semibold/.test(bar))
    check("the navigator comes from one import, which is Storelib's one navigator", /import \{ PlaceNavigator \} from "\.\/place-navigator"/.test(bar) && /export \{ PlaceNavigator \} from "@\/components\/nav\/place-navigator"/.test(code("components/community/member/place-navigator.tsx")))
    const stand = code("components/nav/place-navigator.tsx")
    check("it has the navigator's props: a community by id or Storelib", /export function PlaceNavigator\(\{ current, className, onNavigate \}: PlaceNavigatorProps\)/.test(stand) && /export type NavigatorCurrent = \{ kind: "community"; id: string \} \| \{ kind: "storelib" \}/.test(code("lib/nav/places-shared.ts")))
    check("the bar reads as a bar over the page: a hairline and a soft shadow", /data-community-top=""[\s\S]{0,40}className="sticky top-0 z-40 border-b border-\[#e6e8ec\] bg-white[^"]*shadow-\[0_1px_2px/.test(bar))
    /*
      Round 7, ask 6: "the avatar is replaced by a subtle ... that opens EXACTLY the same account menu as the Storelib header (reuse
      that component). Bug: my profile from the community menu opens the OnePage/creator editor: Profile must always go to /account."
    */
    const acct = code("components/community/member/account-menu.tsx")
    const header = code("components/platform/platform-header-client.tsx")
    check("round 7: the bar's account control is the \"...\" menu, no picture of me and no menu of its own", /<CommunityAccountMenu me=\{me\}/.test(bar) && !/ResponsiveActionMenu|My profile|me\.profileHref|data-community-me=|AppAvatar src=\{me/.test(bar))
    check("round 7: it IS the Storelib header's menu: DesktopAccountMenu on a computer, AccountSheet on a phone, the header's own log out", /import \{ AccountSheet, DesktopAccountMenu, endStorelibSession, type HeaderLink \} from "@\/components\/platform\/platform-header-client"/.test(acct) && /<DesktopAccountMenu[\s\S]{0,400}trigger="more"/.test(acct) && /<AccountSheet[\s\S]{0,300}onLogout=/.test(acct) && /await endStorelibSession\(router\)/.test(acct) && /<LanguageModal open=\{language\}/.test(acct))
    check("round 7: the header exports those very pieces and draws its own sheet with AccountSheet", /export function DesktopAccountMenu\(/.test(header) && /export function AccountSheet\(/.test(header) && /export async function endStorelibSession\(/.test(header) && /<AccountSheet\s/.test(header) && /trigger === "more"/.test(header))
    check("round 7: Profile is /account in both, never the person's own page (which opened the editor for a creator)", /go\("\/account"\)\} role="menuitem" data-account-item="profile"/.test(header) && /link\("\/account"\)\} onDone=\{onClose\} item="profile"/.test(header) && /const link: HeaderLink = \(path\) => \(\{ href: path/.test(acct))
    check("round 7: the \"...\" has the little depth (DEPTH_ICON_BTN), 40px on a phone too", /triggerClassName=\{cn\(DEPTH_ICON_BTN/.test(acct) && /className=\{cn\(DEPTH_ICON_BTN, "md:hidden"/.test(acct))
    check("a visitor gets Log in, back to this page", /href=\{`\/login\?next=\$\{encodeURIComponent\(pathname \|\| base\)\}`\}/.test(bar))
    check("Messages only when the panel is available, with its unread count", /messages !== null && onMessages \?/.test(bar) && /messages > 0 \? <Badge n=\{messages\} \/>/.test(bar))
    check("the bell is Storelib's own, for anybody signed in", /import \{ NotificationBell \} from "@\/components\/notifications\/notification-bell"/.test(bar) && /\{me \? <NotificationBell /.test(bar) && !existsSync("components/community/member/bell-slot.tsx"))
    check("the bell keeps the two realtime exports it reads from the member area", /export async function realtimeAuth\(/.test(read("components/community/member/realtime.ts")) && /export const INBOX_EVENT = /.test(read("components/community/member/realtime.ts")))
    check("the bar sits below the status bar in the phone app", /pt-\[env\(safe-area-inset-top\)\]/.test(bar))
    check("its height is measured once and shared as --community-top", /frame\.style\.setProperty\("--community-top", h\)/.test(bar) && /html\.style\.setProperty\("--community-top", h\)/.test(bar))
    const frame = code("components/community/member/shell-frame.tsx")
    check("the frame wires Messages to the existing panel and its unread count", /useUnreadMessages\(community\.id, viewer\.userId, unreadMessages\)/.test(frame) && /<MessagesPanel communityId=\{community\.id\}/.test(frame) && /onMessages=\{\(\) => setChat/.test(frame))
    check("Message on a person's card or a member row opens the panel", /window\.addEventListener\(MESSAGES_EVENT, on\)/.test(frame))
    check("?dm=<userId> opens that conversation once and takes ?dm off the address", /const dm = search\?\.get\("dm"\) \?\? null/.test(frame) && /url\.searchParams\.delete\("dm"\)/.test(frame) && /window\.history\.replaceState\(window\.history\.state, "", url\.pathname \+ url\.search \+ url\.hash\)/.test(frame) && /setChat\(\{ userId: dm \}\)/.test(frame))
    check("only when messages are available, never to yourself, only an id", /if \(!canMessage \|\| !DM_TARGET\.test\(dm\) \|\| dm === viewer\.userId\) return/.test(frame) && /const DM_TARGET = \/\^\[0-9a-z-\]\{1,64\}\$\/i/.test(frame))
    check("the person card layer lives in the frame", /<PersonCardLayer communityId=\{community\.id\} canMessage=\{canMessage\} \/>/.test(frame))
    check("the old left column is gone", !/data-community-rail|RailLink|SpaceLink/.test(frame))
  }

  /* ── Pills and chips ─────────────────────────────────────────────────── */
  console.log("\nOne row of section tabs, spaces as chips")
  {
    const all = navEntries({ slug: "s", classroomEnabled: true, eventsEnabled: true, directoryEnabled: true, gamificationEnabled: true }, false)
    check("Community, Classroom, Calendar, Members, Leaderboards, About", all.map((e) => e.label).join() === "Community,Classroom,Calendar,Members,Leaderboards,About", all.map((e) => e.label))
    check("each to its own address", all.map((e) => e.href).join() === "/community/s,/community/s/classroom,/community/s/events,/community/s/members,/community/s/leaderboard,/community/s/about")
    const none = navEntries({ slug: "s", classroomEnabled: false, eventsEnabled: false, directoryEnabled: false, gamificationEnabled: false }, false)
    check("only the places that are on", none.map((e) => e.label).join() === "Community,About")
    check("a space, a post, Saved and the inbox mark Community", ["/community/s/space/x", "/community/s/post/p", "/community/s/saved", "/community/s/notifications", "/community/s"].every((p) => tabFor(sectionFromPath(p, "s")) === "home"))
    check("About marks About; Calendar marks on an event; an old member address marks Members", tabFor(sectionFromPath("/community/s/about", "s")) === "about" && tabFor(sectionFromPath("/community/s/events/e1", "s")) === "events" && tabFor(sectionFromPath("/community/s/members/u1", "s")) === "members")
    const frameCode = code("components/community/member/shell-frame.tsx")
    check("the tabs are plain words, not pills", /<SectionTabs entries=\{entries\} current=\{tab\} wide=\{!about\} onGo=\{goTo\} \/>/.test(frameCode) && /const tab = going\?\.key \?\? tabFor\(current\)/.test(frameCode) && /className=\{`\$\{TAB\} \$\{on \? TAB_ON : TAB_OFF\}`\}/.test(frameCode) && !/PillRow|PILL_ON|PILL_OFF/.test(frameCode))
    const ui = code("components/community/member/ui.ts")
    const tab = /export const TAB =\s*"([^"]+)"/.exec(ui)?.[1] ?? ""
    check("a tab has no box: no border, no fill, no rounding; a 40px row of its own", !!tab && !/(^|\s)(border|bg-\[|rounded)/.test(tab) && /(^|\s)h-10(\s|$)/.test(tab) && !/lg:h-14/.test(tab), tab)
    check("the chosen one has a 2px ink line on the bar's edge that grows in by scale and opacity", /data-tab-line=""[\s\S]{0,80}absolute inset-x-0 bottom-0 h-\[2px\] rounded-full bg-\[#1a1a2e\] transition-\[opacity,scale\]/.test(frameCode) && /on \? "scale-x-100 opacity-100" : "scale-x-50 opacity-0"/.test(frameCode))
    check("from 1024px the row is drawn only on About (no left column there); everywhere else the left column has the places", /tabsOnDesktop=\{about\}/.test(frameCode) && /const about = current === "about"/.test(frameCode) && /data-community-tabs="" className="relative w-full"/.test(frameCode))
    check("round 7: the frame's first guess at the header's height is the new one (97 below 1024px, 65 from 1024px, 105 on About; a visitor 57 and 65)", /\[--community-top:97px\] \$\{about \? "lg:\[--community-top:105px\]" : "lg:\[--community-top:65px\]"\}/.test(frameCode) && /\[--community-top:57px\] lg:\[--community-top:65px\]/.test(code("components/community/public/public-frame.tsx")))
    const chips = code("components/community/member/space-chips.tsx")
    check("chips: All, then every space the member may see, then Saved", /data-space-chip="all"/.test(chips) && /spaces\.map\(\(s\) =>/.test(chips) && /href=\{`\$\{base\}\/space\/\$\{s\.slug\}`\}/.test(chips) && /href=\{`\$\{base\}\/saved`\}/.test(chips))
    /* Round 7: the feed, a feed space and Saved are one feed (CommunityFeed) that draws the chips itself; a chat space keeps its own row of chips. */
    const spacePage = code("app/(marketing)/community/[slug]/(member)/space/[space]/page.tsx")
    check("chips are on the feed, a space and Saved", /<CommunityFeed[\s\S]{0,200}spaces=\{shell\.spaces\}[\s\S]{0,60}start=\{\{ kind: "all" \}\}/.test(code("components/community/member/feed-page.tsx")) && /<CommunityFeed[\s\S]{0,200}spaces=\{shell\.spaces\}[\s\S]{0,60}start=\{\{ kind: "space", id: space\.id \}\}/.test(spacePage) && /<SpaceChips slug=\{community\.slug\} spaces=\{shell\.spaces\} active=\{space\.slug\} \/>/.test(spacePage) && /<CommunityFeed[\s\S]{0,200}spaces=\{shell\.spaces\}[\s\S]{0,60}start=\{\{ kind: "saved" \}\}/.test(code("app/(marketing)/community/[slug]/(member)/saved/page.tsx")) && /<SpaceChips\s/.test(code("components/community/member/feed.tsx")))
  }

  /* ── People ──────────────────────────────────────────────────────────── */
  console.log("\nA name opens the person's page")
  {
    check("a storefront is /<handle>", personHref({ username: "Ana", hasStorefront: true }) === "/ana")
    check("anybody else is /@handle", personHref({ username: "sam", hasStorefront: false }) === "/@sam")
    check("no username, no page", personHref({ username: null, hasStorefront: false }) === "/" && personHref({ username: "  ", hasStorefront: true }) === "/")
    check("inside a community, no handle yet goes through the old address, which only redirects", memberHref("club", { id: "u1", username: null }) === "/community/club/members/u1" && memberHref("club", { id: "u1", username: "sam" }) === "/@sam")
    for (const f of ["post-card.tsx", "post-page.tsx", "chat.tsx", "leaderboard.tsx", "members.tsx"]) {
      const src = code(`components/community/member/${f}`)
      check(`${f}: names link through memberHref and say who they are, for the card`, /memberHref\(/.test(src) && /data-person-id=\{/.test(src) && !/href=\{`\$\{base\}\/members\/\$\{author\.id\}`\}|href=\{`\/community\/\$\{slug\}\/members\/\$\{(c\.author|m\.author|r|m)\.(id|userId)\}`\}/.test(src))
    }
    check("the chat's names open the person too, not only the faces", (code("components/community/member/chat.tsx").match(/data-person-id=\{m\.author\.id\}/g) || []).length === 2)
    check("a conversation's name opens the person's page, not a member page", /<a href=\{memberHref\(slug, \{ id: other\.id, username: other\.username \}\)\}/.test(code("components/community/member/messages.tsx")) && !/members\/\$\{other\.id\}/.test(code("components/community/member/messages.tsx")))
    const dir = code("lib/communities/server/directory.ts")
    check("who has a storefront is read once per page of people (finished onboarding, as /<handle> checks)", /from\("creators"\)\.select\("user_id"\)\.in\("user_id", list\)\.eq\("onboarding_completed", true\)/.test(dir) && (dir.match(/storefrontsOf\(db,/g) || []).length >= 3)
    const M = "app/(marketing)/community/[slug]/(member)/members/[userId]"
    const old = code(`${M}/page.tsx`)
    check("the member page inside a community is gone", !existsSync("components/community/member/member-profile.tsx") && !existsSync(`${M}/loading.tsx`) && !/MemberProfile|memberProfile\(/.test(old))
    check("its old address redirects to the person's own page (a member asking; no handle, the member list)", /page\.state !== "member" \|\| !page\.community \|\| !page\.viewer\) notFound\(\)/.test(old) && /personHref\(\{ username: person\.username, hasStorefront: !!person\.hasStorefront \}\)/.test(old) && /redirect\(href === "\/" \? `\$\{base\}\/members` : href\)/.test(old))
    check("and an old ?message=1 link opens the conversation in the community instead", /query\.message === "1" && userId !== page\.viewer\.userId\) redirect\(`\$\{base\}\?dm=\$\{userId\}`\)/.test(old))
    check("names come with a handle: anybody without one is given one when a page of people is read", /ensureUsernames\(db, unnamed\)/.test(code("lib/communities/server/directory.ts")))
    check("a member row offers Message beside the name when chat is on", /openMessages\(\{ userId: m\.userId \}\)/.test(code("components/community/member/members.tsx")))
  }

  /* ── The gallery ─────────────────────────────────────────────────────── */
  console.log("\nThe gallery")
  {
    const V1 = "a1111111-1111-4111-8111-111111111111"
    const parsed = parseGallery([
      { type: "image", url: "https://cdn.example/a.jpg" },
      { type: "image", url: "javascript:alert(1)" },
      { type: "image", url: "//evil.example/x.jpg" },
      { type: "image", url: "/storage/b.jpg" },
      { type: "video", videoId: V1 },
      { type: "video", videoId: "not-a-uuid" },
      { type: "image", url: "https://cdn.example/a.jpg" },
      { type: "gif", url: "https://cdn.example/c.gif" },
      null,
    ])
    check("only https or site images and real video ids, no repeats", JSON.stringify(parsed) === JSON.stringify([{ type: "image", url: "https://cdn.example/a.jpg" }, { type: "image", url: "/storage/b.jpg" }, { type: "video", videoId: V1 }]), parsed)
    check("at most 12", parseGallery(Array.from({ length: 20 }, (_, i) => ({ type: "image", url: `https://x/${i}.jpg` }))).length === GALLERY_MAX && GALLERY_MAX === 12)
    check("not an array is nothing", parseGallery({ a: 1 }).length === 0 && parseGallery(null).length === 0)
    check("image addresses: https or a path here, nothing else", safeImageUrl("http://x/a.jpg") === null && safeImageUrl("data:image/png;base64,x") === null && safeImageUrl("https://x/a.jpg") === "https://x/a.jpg")
    const C = "c0000000-0000-4000-8000-0000000000c1"
    const V2 = "a2222222-2222-4222-8222-222222222222"
    const before = fakeDb({ communities: [{ id: C }], media_videos: [] }, { failWith: { communities: { code: "42703", message: "column communities.gallery does not exist" } } })
    const cover = await communityGallery(before, { id: C, cover_url: "https://x/cover.jpg", cover_video_id: null })
    check("before part 85: the cover alone", JSON.stringify(cover) === JSON.stringify([{ type: "image", url: "https://x/cover.jpg" }]), cover)
    const chosen = fakeDb({
      communities: [{ id: C, gallery: [{ type: "video", videoId: V1 }, { type: "image", url: "https://x/1.jpg" }, { type: "video", videoId: V2 }] }],
      media_videos: [
        { id: V1, community_id: C, status: "ready", thumbnail_url: "https://x/v1.jpg" },
        { id: V2, community_id: C, status: "processing", thumbnail_url: null },
      ],
    })
    const g = await communityGallery(chosen, { id: C, cover_url: "https://x/cover.jpg", cover_video_id: null })
    check("the creator's order, ready videos only, with their posters, and no cover added", JSON.stringify(g) === JSON.stringify([{ type: "video", videoId: V1, posterUrl: "https://x/v1.jpg" }, { type: "image", url: "https://x/1.jpg" }]), g)
    const route = code("app/api/community/[communityId]/videos/[videoId]/play/route.ts")
    check("a gallery video plays for whoever can see the about page, after the switch and a rate limit", /const off = await requireCommunitiesOn\(\)[\s\S]*rateLimit\([\s\S]*inPublicGallery\(db, community, video\.id\)/.test(route))
    check("and only while the community is published and open", /if \(community\.status !== "published" \|\| !communityOpen\(community\)\) return false/.test(code("lib/communities/server/public.ts")))
  }

  /* ── Reviews ─────────────────────────────────────────────────────────── */
  console.log("\nStill a paying member, only when true")
  {
    const joined = (days: number) => iso(NOW - days * DAY)
    check("a subscriber for 95 days: 3 months", payingTenure({ status: "active", source: "subscription", joinedAt: joined(95) }, NOW) === "3 months")
    check("four days in: 4 days", payingTenure({ status: "active", source: "purchase", joinedAt: joined(4) }, NOW) === "4 days")
    check("joined today: 1 day", payingTenure({ status: "active", source: "product", joinedAt: joined(0.2) }, NOW) === "1 day")
    check("over a year: years", payingTenure({ status: "active", source: "subscription", joinedAt: joined(800) }, NOW) === "2 years")
    check("a free member: nothing", payingTenure({ status: "active", source: "free", joinedAt: joined(95) }, NOW) === null)
    check("somebody who left or expired: nothing", payingTenure({ status: "expired", source: "subscription", joinedAt: joined(95) }, NOW) === null && payingTenure({ status: "cancelled", source: "subscription", joinedAt: joined(95) }, NOW) === null)
    check("no member row, or no date: nothing", payingTenure(null, NOW) === null && payingTenure({ status: "active", source: "subscription", joinedAt: null }, NOW) === null)
  }

  /* ── The about page against a database ───────────────────────────────── */
  console.log("\nThe about page, read")
  const C = "c0000000-0000-4000-8000-000000000001"
  const U = "a0000000-0000-4000-8000-000000000001"
  const OWNER = "a0000000-0000-4000-8000-0000000000aa"
  const PAYER = "a0000000-0000-4000-8000-0000000000b1"
  const FREEBIE = "a0000000-0000-4000-8000-0000000000b2"
  const ADMIN = "a0000000-0000-4000-8000-0000000000b3"
  const TIER = "b0000000-0000-4000-8000-000000000001"
  const PRODUCT = "d0000000-0000-4000-8000-000000000001"
  const CREATOR = "e0000000-0000-4000-8000-000000000001"
  const OTHER = "c0000000-0000-4000-8000-000000000002"
  const DRAFT = "c0000000-0000-4000-8000-000000000003"
  const now = Date.now()
  const world = (o: { onboarded?: boolean; lastSeen?: boolean } = {}) =>
    fakeDb({
      communities: [
        { id: C, slug: "makers", name: "Makers", tagline: "People who make things", description: "We build.", creator_id: CREATOR, owner_user_id: OWNER, access: "paid", visibility: "private", status: "published", approval_required: false, member_count: 4, benefits: [], rules: [], faq: [], cover_url: "https://x/cover.jpg", logo_url: null, deleted_at: null, suspended_at: null, archived_at: null, platform_hidden: false },
        { id: OTHER, slug: "potters", name: "Potters", logo_url: null, status: "published", suspended_at: null, deleted_at: null },
        { id: DRAFT, slug: "secret", name: "Secret", logo_url: null, status: "draft", suspended_at: null, deleted_at: null },
      ],
      community_tiers: [{ id: TIER, community_id: C, name: "Pro", kind: "paid", billing: "recurring", product_id: PRODUCT, position: 0, is_default: true, archived_at: null, benefits: [] }],
      community_access_products: [],
      community_members: [
        { id: "m1", community_id: C, user_id: OWNER, role: "owner", source: "owner", status: "active", joined_at: iso(now - 400 * DAY), ...(o.lastSeen ? { last_seen_at: iso(now - 60_000) } : {}) },
        { id: "m2", community_id: C, user_id: PAYER, role: "member", source: "subscription", status: "active", joined_at: iso(now - 95 * DAY), ...(o.lastSeen ? { last_seen_at: iso(now - 2 * 60_000) } : {}) },
        { id: "m3", community_id: C, user_id: FREEBIE, role: "member", source: "free", status: "active", joined_at: iso(now - 95 * DAY), ...(o.lastSeen ? { last_seen_at: iso(now - 20 * 60_000) } : {}) },
        { id: "m4", community_id: C, user_id: ADMIN, role: "admin", source: "manual", status: "active", joined_at: iso(now - 30 * DAY) },
        { id: "m5", community_id: OTHER, user_id: U, role: "member", source: "free", status: "active", last_active_at: iso(now - DAY) },
        { id: "m6", community_id: DRAFT, user_id: U, role: "member", source: "free", status: "active", last_active_at: iso(now) },
      ],
      community_invites: [],
      products: [{ id: PRODUCT, title: "Makers Pro", slug: "makers-pro", type: "membership", status: "published", price_cents: 900, creator_id: CREATOR, community_id: C, reviews_count: 2, reviews_average: 4.5 }],
      membership_plans: [{ product_id: PRODUCT, monthly_price_cents: 900, yearly_price_cents: null, currency: "usd" }],
      creators: [{ id: CREATOR, user_id: OWNER, slug: "ana", display_name: "Ana", avatar_url: null, stripe_account_id: "acct_1", stripe_onboarding_status: "connected", charges_enabled: true, onboarding_completed: o.onboarded ?? true }],
      profiles: [
        { id: OWNER, username: "ana", display_name: "Ana Maker", avatar_url: null },
        { id: PAYER, username: "pat", display_name: "Pat Payer", avatar_url: null },
        { id: FREEBIE, username: null, display_name: "Fran", avatar_url: null },
        { id: U, username: "uma", display_name: "Uma", avatar_url: "https://x/uma.jpg" },
      ],
      reviews: [
        { id: "r1", product_id: PRODUCT, rating: 5, content: "Worth it.", created_at: iso(now - 5 * 3600_000), status: "published", buyer_id: PAYER, reviewer_name: null },
        { id: "r2", product_id: PRODUCT, rating: 4, content: "Good calls.", created_at: iso(now - 2 * DAY), status: "published", buyer_id: FREEBIE, reviewer_name: null },
      ],
      entitlements: [],
      memberships: [],
      community_audit_log: [],
      community_activity: [],
      community_courses: [],
      community_spaces: [],
      media_videos: [],
    })
  {
    const page = await loadSalesPage("makers", null, world())
    const c = page?.data.community
    check("the reviews, newest first", c?.reviews?.items.map((r) => r.id).join() === "r1,r2", c?.reviews?.items.map((r) => r.id))
    check("the subscriber's review says Still a paying member after 3 months", c?.reviews?.items[0].payingFor === "3 months", c?.reviews?.items[0])
    check("the free member's review says nothing about paying", c?.reviews?.items[1].payingFor === null)
    check("a reviewer's name opens their page; no username, no link", c?.reviews?.items[0].href === "/@pat" && c?.reviews?.items[1].href === null)
    check("the gallery falls back to the cover", JSON.stringify(c?.gallery) === JSON.stringify([{ type: "image", url: "https://x/cover.jpg" }]))
    check("Members from the trigger count, admins counted (owner and admins)", c?.stats.members === 4 && c?.stats.admins === 2, c?.stats)
    check("no heartbeat yet: online is 0 from real rows, never invented", c?.stats.online === 0, c?.stats)
    check("the card prints the address", c?.address === "storelib.com/community/makers")
    check("By the creator, to their storefront", c?.creator?.href === "/ana")
    const notYet = await loadSalesPage("makers", null, world({ onboarded: false }))
    check("a creator who has not finished onboarding opens at /@handle", notYet?.data.community.creator?.href === "/@ana")
    const live = await loadSalesPage("makers", null, world({ lastSeen: true }))
    check("online is active members seen in the last five minutes", live?.data.community.stats.online === 2, live?.data.community.stats)
  }
  {
    const missingColumn = fakeDb({ community_members: [] }, { failWith: { community_members: { code: "42703", message: "column community_members.last_seen_at does not exist" } } })
    check("before part 85 the online figure is null (hidden), not zero", (await onlineCount(missingColumn, C)) === null)
    check("and the admins figure too when it cannot be read", (await adminCount(missingColumn, C)) === null)
    const stats = await communityStats(missingColumn, { id: C, member_count: 7 })
    check("members still come from the community row", stats.members === 7 && stats.online === null)
    check("the window is five minutes and the heartbeat a minute", ONLINE_WINDOW_MS === 300_000 && HEARTBEAT_MS === 60_000)
    const row = code("components/community/public/stats-row.tsx")
    check("the stats row leaves Online out when it is null", /if \(stats\.online !== null\) cells\.push/.test(row))
  }

  /* ── The top bar's facts ─────────────────────────────────────────────── */
  console.log("\nThe top bar's facts")
  {
    const db = world()
    const community = db.tables.communities[0] as never
    const visitor = await topBarData(community, null, db)
    check("a visitor: the community, By Ana to her page, no me, no communities", visitor.community.slug === "makers" && visitor.creator?.name === "Ana Maker" && visitor.creator?.href === "/ana" && visitor.me === null && visitor.communities.length === 0 && visitor.manageHref === null)
    const viewer = { userId: U, active: false, role: null, isOwner: false, isCreatorAccount: false } as never
    const signedIn = await topBarData(community, viewer, db)
    check("signed in: their name, picture and page", signedIn.me?.name === "Uma" && signedIn.me?.avatarUrl === "https://x/uma.jpg" && signedIn.me?.profileHref === "/@uma", signedIn.me)
    check("the switcher lists their communities, not a draft they are only a member of", signedIn.communities.map((c) => c.slug).join() === "potters", signedIn.communities)
    const owner = await topBarData(community, { userId: OWNER, active: true, role: "owner", isOwner: true, isCreatorAccount: true } as never, db)
    check("its owner gets Manage community, and their own page is their storefront", owner.manageHref === `/app/community/${C}` && owner.me?.profileHref === "/ana")
    const member = await topBarData(community, { userId: PAYER, active: true, role: "member", isOwner: false, isCreatorAccount: false } as never, db)
    check("a member does not", member.manageHref === null)
    check("round 7: the account menu's facts: the handle, and seller access from the creators row (Dashboard for the owner, Start creating for Uma)", signedIn.me?.username === "uma" && signedIn.me?.seller === false && owner.me?.seller === true, { uma: signedIn.me, owner: owner.me })
  }

  /* ── Presence ────────────────────────────────────────────────────────── */
  console.log("\nThe presence heartbeat")
  {
    const route = code("app/api/community/[communityId]/presence/route.ts")
    check("the switch first", /export async function POST\([^)]*\)[^{]*\{\s*const off = await requireCommunitiesOn\(\)\s*if \(off\) return off/.test(route))
    check("an active member (requireMember view) from the session, never a user id from the body", /requireMember\(db, communityId, await sessionUserId\(\), "view"\)/.test(route) && !/request\.json|readJson/.test(route))
    check("rate limited on its own bucket", /rateLimit\(\{ bucket: rateBucket\("presence"\), subjects: \[memberSubject\(/.test(route) && rateBucket("presence") === "community-presence" && RATE_LIMITS.presence.length > 0)
    check("no store", /headers: NO_STORE/.test(route))
    /* touchPresence's write, recorded. */
    const calls: [string, ...unknown[]][] = []
    const builder: Record<string, (...a: unknown[]) => unknown> = {}
    for (const m of ["update", "eq", "or", "select"]) builder[m] = (...a: unknown[]) => (calls.push([m, ...a]), builder)
    ;(builder as { then?: unknown }).then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [{ id: "m" }], error: null }).then(resolve)
    const db = { from: (t: string) => (calls.push(["from", t]), builder) }
    const done = await touchPresence(db, C, U, NOW)
    const or = calls.find((c) => c[0] === "or")?.[1]
    check("it writes last_seen_at on the member's own active row", JSON.stringify(calls.find((c) => c[0] === "update")?.[1]) === JSON.stringify({ last_seen_at: iso(NOW) }) && calls.some((c) => c[0] === "eq" && c[1] === "user_id" && c[2] === U) && calls.some((c) => c[0] === "eq" && c[1] === "status" && c[2] === "active"))
    check("at most once a minute: only when it was last written over a minute ago", or === `last_seen_at.is.null,last_seen_at.lt."${iso(NOW - 60_000)}"`, or)
    check("and says it wrote", done.ready && done.written)
    const missing = { from: () => ({ update: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ or: () => ({ select: () => Promise.resolve({ data: null, error: { code: "42703" } }) }) }) }) }) }) }) }
    check("before part 85 it answers not ready, so the page stops asking", JSON.stringify(await touchPresence(missing, C, U, NOW)) === JSON.stringify({ ready: false, written: false }))
    const frame = code("components/community/member/shell-frame.tsx")
    check("the page stops when the server says not ready or the member is not one", /data\.ready === false\) stopped = true/.test(frame) && /res\.status === 401 \|\| res\.status === 403 \|\| res\.status === 404\) stopped = true/.test(frame))
  }

  /* ── The about page's shape ──────────────────────────────────────────── */
  console.log("\nThe about page's shape")
  {
    const page = code("components/community/public/sales-page.tsx")
    check("title, then rating, then the gallery, then the facts line and the description", page.indexOf("<h1") < page.indexOf("data-community-rating") && page.indexOf("data-community-rating") < page.indexOf("<CommunityGallery") && page.indexOf("<CommunityGallery") < page.indexOf("<InfoRow") && page.indexOf("<InfoRow") < page.indexOf("data-community-description"))
    check("the facts line: visibility, members, price, By creator", /data-info="visibility"/.test(page) && /data-info="members"/.test(page) && /data-info="price"/.test(page) && /data-info="creator"/.test(page))
    check("Still a paying member is drawn only when the server says so", /\{r\.payingFor \? <span data-review-paying=""> · Still a paying member after \{r\.payingFor\}<\/span> : null\}/.test(page))
    check("the card's content flows under the media on a phone, and the bar sticks at the bottom", page.indexOf("<JoinSummaryPhone") > page.indexOf("<CommunityGallery") && /<JoinBarPhone \/>/.test(page))
    const controls = code("components/community/public/join-controls.tsx")
    check("the card sticks under the community's bar, with Members / Online / Admins and the button", /sticky top-\[calc\(var\(--community-top,65px\)\+24px\)\]/.test(controls) && /<StatsRow stats=\{community\.stats\}/.test(controls) && /<PrimaryAction className="mt-4 w-full" \/>/.test(controls))
    check("the sales page calls no client function on the server", !/from "\.\/join-controls"[\s\S]*intervalPrice/.test(page))
  }

  /* ── The person card ─────────────────────────────────────────────────── */
  console.log("\nThe card on a person")
  {
    check("it opens after 350ms of rest and waits a short grace after the pointer leaves", CARD_OPEN_MS === 350 && CARD_GRACE_MS > 0 && CARD_GRACE_MS <= 250)
    check("a mouse or a pen hovers; a finger never opens it", hoverPointer("mouse") && hoverPointer("pen") && !hoverPointer("touch") && !hoverPointer(""))
    const N = Date.parse("2026-10-03T12:00:00.000Z")
    check("Online now within the heartbeat's five minutes", activeLabel(iso(N - 2 * 60_000), N) === "Online now")
    check("Active 2h ago, Active 3d ago, then the date", activeLabel(iso(N - 2 * 3600_000), N) === "Active 2h ago" && activeLabel(iso(N - 3 * DAY), N) === "Active 3d ago" && activeLabel(iso(N - 40 * DAY), N) === "Active Aug 24")
    check("nothing when it is not known", activeLabel(null, N) === "" && activeLabel("nope", N) === "")
    check("4 communities (1 in common); 1 community; none says nothing", communitiesLine({ count: 4, inCommon: 1 }) === "4 communities (1 in common)" && communitiesLine({ count: 1, inCommon: 0 }) === "1 community" && communitiesLine({ count: 0, inCommon: 0 }) === "" && communitiesLine(null) === "")
    check("Owner of 2 communities; Owner of 1 community; none says nothing", ownerLine(2) === "Owner of 2 communities" && ownerLine(1) === "Owner of 1 community" && ownerLine(0) === "")

    const C = "c0000000-0000-4000-8000-0000000000c1"
    const PUB = "c0000000-0000-4000-8000-0000000000c2"
    const PUB2 = "c0000000-0000-4000-8000-0000000000c3"
    const PRIV = "c0000000-0000-4000-8000-0000000000c4"
    const HIDDEN = "c0000000-0000-4000-8000-0000000000c5"
    const ME = "a0000000-0000-4000-8000-0000000000e1"
    const LEO = "a0000000-0000-4000-8000-0000000000e2"
    const GONE = "a0000000-0000-4000-8000-0000000000e3"
    const BANNED = "a0000000-0000-4000-8000-0000000000e4"
    const pub = { status: "published", visibility: "public", platform_hidden: false, deleted_at: null, suspended_at: null }
    const people = (o: { show?: boolean; gamification?: boolean; chat?: boolean; seen?: boolean; follows?: boolean } = {}) =>
      fakeDb({
        communities: [
          { id: C, slug: "studio", name: "Studio", visibility: "private", status: "published", gamification_enabled: o.gamification ?? true, chat_enabled: o.chat ?? true, platform_hidden: false, deleted_at: null, suspended_at: null },
          { id: PUB, slug: "pub", name: "Pub", owner_user_id: LEO, ...pub },
          { id: PUB2, slug: "pub2", name: "Pub2", ...pub },
          { id: PRIV, slug: "priv", name: "Priv", owner_user_id: LEO, ...pub, visibility: "private" },
          { id: HIDDEN, slug: "hid", name: "Hid", ...pub, platform_hidden: true },
        ],
        community_members: [
          { community_id: C, user_id: LEO, role: "admin", status: "active", level: 4, bio: "Here for the glaze talk.", banned_at: null, last_active_at: iso(Date.now() - 3 * DAY), ...(o.seen ? { last_seen_at: iso(Date.now() - 2 * 3600_000) } : {}) },
          { community_id: C, user_id: ME, role: "member", status: "active", level: 1, banned_at: null },
          { community_id: C, user_id: GONE, role: "member", status: "cancelled", level: 1, banned_at: null },
          { community_id: C, user_id: BANNED, role: "member", status: "active", level: 1, banned_at: iso(Date.now()) },
          { community_id: PUB, user_id: LEO, role: "owner", status: "active", level: 1 },
          { community_id: PUB2, user_id: LEO, role: "member", status: "active", level: 1 },
          { community_id: PRIV, user_id: LEO, role: "owner", status: "active", level: 1 },
          { community_id: HIDDEN, user_id: LEO, role: "member", status: "active", level: 1 },
          { community_id: PUB2, user_id: ME, role: "member", status: "active", level: 1 },
          { community_id: PRIV, user_id: ME, role: "member", status: "active", level: 1 },
        ],
        community_levels: [{ community_id: C, level: 4, name: "Insider" }],
        profiles: [
          { id: LEO, username: "leo", display_name: "Leo Martins", avatar_url: null, bio: o.show === undefined ? "Potter in Lisbon." : null, email: "leo@example.com", ...(o.show === undefined ? {} : { show_communities: o.show }) },
          { id: ME, username: "me", display_name: "Me", avatar_url: null },
        ],
        creators: [],
        follows: o.follows ? [{ follower_id: ME, following_id: LEO }] : [],
        community_conversations: [],
      })
    const viewer = { userId: ME }
    const community = (db: ReturnType<typeof people>) => db.tables.communities[0] as never
    const db1 = people({ seen: true, follows: true })
    const card = await personCard(db1, community(db1), viewer, LEO)
    check("an active member's card: name, handle, their page, role", card?.name === "Leo Martins" && card?.username === "leo" && card?.href === "/@leo" && card?.role === "admin", card)
    check("their Storelib bio first", card?.bio === "Potter in Lisbon.")
    check("their level here, with its name, while the community counts points", card?.level === 4 && card?.levelName === "Insider")
    check("Active is the later of the heartbeat and their last activity", card?.activeAt === db1.tables.community_members[0].last_seen_at, card?.activeAt)
    check("public communities only: not the private one, not one Storelib hid", card?.communities?.count === 2, card?.communities)
    check("in common: the public ones the viewer is in too", card?.communities?.inCommon === 1, card?.communities)
    check("owns: public ones only", card?.owns === 1, card?.owns)
    check("following and Message from real rows", card?.following === true && card?.canMessage === true && card?.isSelf === false)
    check("never an email", !JSON.stringify(card).includes("leo@example.com"))
    const hiding = people({ show: false })
    const hid = await personCard(hiding, community(hiding), viewer, LEO)
    check("somebody who hides their memberships: no communities line, owned still counted, the community bio instead", hid?.communities === null && hid?.owns === 1 && hid?.bio === "Here for the glaze talk.", hid)
    const quiet = people({ gamification: false, chat: false })
    const q = await personCard(quiet, community(quiet), viewer, LEO)
    check("no level while points are off; no Message while chat is off", q?.level === null && q?.levelName === null && q?.canMessage === false)
    check("before part 85 Active falls back to their last activity", q?.activeAt === quiet.tables.community_members[0].last_active_at)
    const self = await personCard(db1, community(db1), viewer, ME)
    check("my own card: no Message, no following", self?.isSelf === true && self?.canMessage === false && self?.following === false)
    check("nobody who left or was banned, and nothing for a bad id", (await personCard(db1, community(db1), viewer, GONE)) === null && (await personCard(db1, community(db1), viewer, BANNED)) === null && (await personCard(db1, community(db1), viewer, "x")) === null)

    const route = code("app/api/community/[communityId]/people/[userId]/card/route.ts")
    check("the card route: the switch first, a member asking (from the session), rate limited, no store", /export async function GET\([^)]*\)[^{]*\{\s*const off = await requireCommunitiesOn\(\)\s*if \(off\) return off/.test(route) && /requireMember\(db, communityId, await sessionUserId\(\), "view"\)/.test(route) && /rateLimit\(\{ bucket: rateBucket\("card"\)/.test(route) && /headers: NO_STORE/.test(route) && RATE_LIMITS.card.length > 0)
    const server = code("lib/communities/server/people.ts")
    check("the server reads no email and lists only published, public, open communities", !/email/.test(server) && /eq\("status", "published"\)\.eq\("visibility", "public"\)\.eq\("platform_hidden", false\)/.test(server))
    const layer = code("components/community/member/person-card.tsx")
    check("the card opens from a name's data-person-id, by pointer type, and from keyboard focus-visible", /closest<HTMLElement>\("\[data-person-id\]"\)/.test(layer) && /if \(!hoverPointer\(e\.pointerType\)\) return/.test(layer) && /anchor\.matches\(":focus-visible"\)/.test(layer))
    check("Escape closes it and hands focus back; scrolling closes it", /e\.key === "Escape"[\s\S]{0,200}back\.focus\(\)/.test(layer) && /addEventListener\("scroll", onScroll/.test(layer))
    check("Message opens the panel in place", /openMessages\(\{ userId: person\.id \}\)/.test(layer) && !/router\.push/.test(layer))
    /* Round 7: the card's Follow was disabled while its request was out, so a quick second press did nothing for seconds. It shares the profile's hook now. */
    check("Follow goes through the one follow route, through the profile's never blocking hook", /useFollow\(\{\s*targetUserId: person\.id,/.test(layer) && /onClick=\{follow\.toggle\}/.test(layer) && !/disabled=\{busy\}/.test(layer) && /fetch\("\/api\/follow"/.test(code("components/profile/follow-button.tsx")))
  }

  /* ── Round 5: the wall ───────────────────────────────────────────────── */
  console.log("\nThe wall: three columns, the right one fully dynamic")
  {
    check("the right column is the feed's: the community feed, a space, a post and Saved", ["home", "saved", "space:general"].every((x) => rightColumnFor(x as never)) && ["classroom", "events", "members", "leaderboard", "notifications", "about"].every((x) => !rightColumnFor(x as never)))
    check("ranks are shared on a tie", rankRows([{ value: 40 }, { value: 40 }, { value: 12 }]).map((r) => r.rank).join() === "1,1,3")
    check("the contributors say what they count: points, or posts and comments, and over what", contributorsDetail({ basis: "points", since: null }) === "Points, last 30 days" && contributorsDetail({ basis: "activity", since: null }) === "Posts and comments, last 30 days" && contributorsDetail({ basis: "activity", since: "2026-09-28T10:00:00.000Z" }) === "Posts and comments since Sep 28")

    const frame = code("components/community/member/shell-frame.tsx")
    /* Round 7, ask 8: the sides swapped. The places (and the next event under them) on the RIGHT; the top contributors on the LEFT under the card. */
    check("the frame draws three columns from 1280px on every page: 280px left, the page, 300px right (the middle never moves between places)", /xl:grid-cols-\[280px_minmax\(0,1fr\)_300px\]/.test(frame) && /data-community-columns="three"/.test(frame) && !/hasRight/.test(frame))
    check("round 7: the right column is the places, then the next event (on the feed), sticking under the bar", /data-community-right=""[\s\S]{0,300}<WallPlaces entries=\{entries\} current=\{tab\} onGo=\{goTo\} \/>\s*\{upcoming \? <WallUpcoming /.test(frame) && /xl:sticky xl:top-\[calc\(var\(--community-top,65px\)\+24px\)\]/.test(frame))
    check("round 7: the left column is the community card, then the top contributors (on the feed) right under it", frame.indexOf("<WallCommunityCard") < frame.indexOf("<WallContributorsCard") && /data-community-left=""/.test(frame) && /data-community-left-more=""/.test(frame) && /lg:col-start-1 lg:row-start-3 lg:mt-3 lg:block xl:row-start-2/.test(frame))
    check("each card only when it has something, and only on the feed's pages", /const upcoming = wall && feedish \? wall\.upcoming : null/.test(frame) && /const contributors = wall && feedish \? wall\.contributors : null/.test(frame) && /const feedish = rightColumnFor\(current\)/.test(frame) && /\{contributors \? \(/.test(frame))
    check("from 1024px to 1279px everything stacks in the left column: the card, the places and the event, then the contributors", /lg:col-start-1 lg:row-start-2 lg:mt-3 lg:block xl:col-start-3 xl:row-span-2 xl:row-start-1/.test(frame) && /lg:grid-rows-\[auto_auto_1fr\]/.test(frame) && /lg:row-span-3 lg:row-start-1 xl:row-span-2/.test(frame))
    check("About keeps its own sheet, without the columns", /\{about \? \(\s*<div key=\{pageKey\}/.test(frame))
    check("round 7: a page fades in when the PLACE changes, not the address, so a space switched in place never remounts the feed", /const pageKey = about \? "about" : tabFor\(current\)/.test(frame) && !/key=\{pathname\}/.test(frame))
    check("round 7: a click on a place marks it at once, and its page is read in full on hover (Next's dynamic prefetch on intent)", /setGoing\(\{ key, from: pathname \}\)/.test(frame) && /if \(going && going\.from !== pathname\) setGoing\(null\)/.test(frame) && /\{\.\.\.FULL_ON_HOVER\}/.test(frame) && /\{\.\.\.FULL_ON_HOVER\}/.test(code("components/community/member/wall.tsx")) && /unstable_dynamicOnHover: true/.test(code("components/community/member/nav.ts")))
    check("the frame still keeps DMs, ?dm=, the card layer, presence and toasts", /<MessagesPanel /.test(frame) && /searchParams|search\?\.get\("dm"\)/.test(frame) && /<PersonCardLayer /.test(frame) && /usePresenceHeartbeat\(community\.id, viewer\.userId\)/.test(frame) && /<Toasts \/>/.test(frame))

    const wall = code("components/community/member/wall.tsx")
    check("the card: Members always, Online and Admins only when known, the green dot only when somebody is online", /if \(stats\.online !== null\) cells\.push/.test(wall) && /if \(stats\.admins !== null\) cells\.push/.test(wall) && /dot=\{stats\.online > 0\}/.test(wall))
    check("up to the faces it is handed, +N only when there are more, Settings only when handed a link", /faces\.length \?/.test(wall) && /\{more > 0 \?/.test(wall) && /\{card\.settingsHref \?/.test(wall))
    check("a face and a contributor open the person and their card", (wall.match(/data-person-id=\{/g) || []).length >= 2 && /memberHref\(community\.slug, f\)/.test(wall))
    check("the places: soft tiles of their own tint, a Solar line glyph and the bold one for the open place, a Solar chevron each (one family, no lucide)", /const PLACE_LOOK: Record<TabKey/.test(wall) && /const Icon = on \? look\.bold : look\.line/.test(wall) && /<ChevronLine size=\{16\} \/>/.test(wall) && /from "@solar-icons\/react\/linear\/alt-arrow-right"/.test(wall) && !/ChevronRight/.test(wall) && /aria-current=\{on \? "page" : undefined\}/.test(wall))
    check("round 7, ask 7: the card has no storelib.com/community/<slug> line", !/data-wall-address|storelib\.com\{base\}/.test(wall))
    check("round 7, ask 11: Settings and View event carry the little depth", /\$\{DEPTH\} \$\{DEPTH_PRESS\}[^`]*`\} data-wall-settings=""/.test(wall) && /\$\{DEPTH\} \$\{DEPTH_PRESS\}[^`]*`\} data-wall-view-event=""/.test(wall))
    check("Upcoming event: the date tile and time in the viewer's zone, N going only when somebody is, View event and View all", /<DateTile startsAt=\{event\.startsAt\} \/>/.test(wall) && /<EventWhen /.test(wall) && /\{event\.going > 0 \?/.test(wall) && /View event/.test(wall) && /href=\{`\$\{base\}\/events`\}/.test(wall))
    check("no violet in the wall", !/8b5cf6|7c3aed|violet|purple/i.test(code("components/community/member/wall.tsx")))

    /* The server: real rows, bounded reads. */
    const C = "c0000000-0000-4000-8000-0000000000d1"
    const A = "a0000000-0000-4000-8000-0000000000d1"
    const B = "a0000000-0000-4000-8000-0000000000d2"
    const X = "a0000000-0000-4000-8000-0000000000d3"
    const people = [
      { id: A, username: "ana", display_name: "Ana", avatar_url: null },
      { id: B, username: "ben", display_name: "Ben", avatar_url: null },
      { id: X, username: "xan", display_name: "Xan", avatar_url: null },
    ]
    const members = [
      { community_id: C, user_id: A, status: "active", role: "member", level: 2 },
      { community_id: C, user_id: B, status: "active", role: "admin", level: 3 },
      { community_id: C, user_id: X, status: "banned", role: "member", level: 1 },
    ]
    /* Faces: the heartbeat first; before part 85, the last activity. */
    {
      const s = scriptedDb((c) => {
        if (c.table === "community_members" && orderOf(c)[0] === "last_seen_at") return { error: { code: "42703" } }
        if (c.table === "community_members" && c.ops.some((o) => o[0] === "limit")) return { data: [{ user_id: B }, { user_id: A }] }
        if (c.table === "profiles") return { data: people }
        return { data: rowsFor(c, { community_members: members, creators: [] }) }
      })
      const faces = await recentFaces(s.db, C)
      const reads = s.calls.filter((c) => c.table === "community_members" && c.ops.some((o) => o[0] === "limit"))
      check("faces: active members only, by last_seen_at, falling back to last_active_at before part 85", reads.length === 2 && orderOf(reads[0])[0] === "last_seen_at" && orderOf(reads[1])[0] === "last_active_at" && reads.every((r) => hasOp(r, "eq", "status", "active") && hasOp(r, "eq", "community_id", C) && hasOp(r, "limit", WALL_FACES)), reads.map((r) => r.ops))
      check("faces keep that order, with names and handles", faces.map((f) => f.name).join() === "Ben,Ana" && faces[0].username === "ben")
    }
    /* Contributors with points on: the leaderboard over 30 days, three at most. */
    {
      let asked: unknown = null
      const s = scriptedDb((c) => (c.table === "profiles" ? { data: people } : { data: rowsFor(c, { community_members: members, creators: [] }) }), (name, args) => ((asked = { name, args }), { data: [{ user_id: B, points: "420" }, { user_id: A, points: 312 }] }))
      const top = await topContributors(s.db, { id: C, gamification_enabled: true }, NOW)
      check("points on: the 30 day leaderboard (active members only, in SQL), three at most", JSON.stringify(asked).includes('"name":"community_leaderboard"') && JSON.stringify(asked).includes(`"p_limit":${WALL_CONTRIBUTORS}`) && JSON.stringify(asked).includes(iso(NOW - 30 * DAY)), asked)
      check("with ranks, names and points", top?.basis === "points" && top.rows.map((r) => `${r.rank}:${r.name}:${r.value}`).join() === "1:Ben:420,2:Ana:312", top)
      const none = scriptedDb(() => ({ data: [] }), () => ({ data: [] }))
      check("nobody earned points: no card", (await topContributors(none.db, { id: C, gamification_enabled: true }, NOW)) === null)
    }
    /* Contributors with points off: posts and comments, bounded, honest about the window. */
    {
      const activity = [
        ...Array.from({ length: 5 }, (_, i) => ({ community_id: C, user_id: X, kind: "post", created_at: iso(NOW - i * 3600_000) })),
        ...Array.from({ length: 3 }, (_, i) => ({ community_id: C, user_id: A, kind: "comment", created_at: iso(NOW - (10 + i) * 3600_000) })),
        { community_id: C, user_id: B, kind: "post", created_at: iso(NOW - 20 * 3600_000) },
      ]
      const s = scriptedDb((c) => (c.table === "profiles" ? { data: people } : { data: rowsFor(c, { community_activity: activity, community_members: members, creators: [] }) }))
      const top = await topContributors(s.db, { id: C, gamification_enabled: false }, NOW)
      const read = s.calls.find((c) => c.table === "community_activity")
      check("points off: posts and comments in community_activity, 30 days back, at most ACTIVITY_SCAN rows", !!read && hasOp(read, "in", "kind", ["post", "comment"]) && hasOp(read, "gte", "created_at", iso(NOW - 30 * DAY)) && hasOp(read, "limit", ACTIVITY_SCAN), read?.ops)
      check("the most active, never somebody banned or gone", top?.basis === "activity" && top.since === null && top.rows.map((r) => `${r.rank}:${r.name}:${r.value}`).join() === "1:Ana:3,2:Ben:1", top)
      const many = Array.from({ length: ACTIVITY_SCAN }, (_, i) => ({ community_id: C, user_id: A, kind: "post", created_at: iso(NOW - i * 60_000) }))
      const capped = await mostActive(scriptedDb((c) => ({ data: rowsFor(c, { community_activity: many, community_members: members }) })).db, C, NOW)
      check("when the scan is full, the window is cut short and says from when", capped.since === many[many.length - 1].created_at && capped.rows[0]?.value === ACTIVITY_SCAN, capped.since)
    }
    /* The next event: scheduled, after now, the viewer's access rule checked. */
    {
      const events = [
        { id: "e-locked", community_id: C, title: "Pro call", starts_at: iso(NOW + DAY), ends_at: null, access: { tierIds: ["t-pro"] }, status: "scheduled", going_count: 9 },
        { id: "e-open", community_id: C, title: "Open Q&A", starts_at: iso(NOW + 2 * DAY), ends_at: null, access: {}, status: "scheduled", going_count: 128 },
      ]
      const s = scriptedDb((c) => ({ data: rowsFor(c, { community_events: events }) }))
      const viewer = { userId: A, role: "member", active: true, tierId: null, ownedProductIds: [], level: 1 } as never
      const next = await upcomingEvent(s.db, { id: C, events_enabled: true }, viewer, NOW)
      const read = s.calls[0]
      check("the next event the viewer may see, with how many are going", next?.id === "e-open" && next.going === 128, next)
      check("scheduled and still to come, in order, a few looked at", hasOp(read, "eq", "status", "scheduled") && hasOp(read, "gt", "starts_at", iso(NOW)) && orderOf(read)[0] === "starts_at" && hasOp(read, "limit", 5))
      check("events off: no card and no read", (await upcomingEvent(scriptedDb(() => ({ data: events })).db, { id: C, events_enabled: false }, viewer, NOW)) === null)
    }
    /* Settings and Event go to the creator side, only for who may use them. */
    {
      const v = (o: Record<string, unknown>) => ({ isOwner: false, isCreatorAccount: false, active: true, role: "member", ...o }) as never
      const c = { id: C, events_enabled: true }
      check("the owner: Settings and Event", settingsHrefFor(c, v({ isOwner: true, role: "owner" })) === `/app/community/${C}/settings` && eventHrefFor(c, v({ isOwner: true, role: "owner" })) === `/app/community/${C}/events?new=1`)
      check("an admin with a creator account: both; without one: neither (/app is a creator's)", !!settingsHrefFor(c, v({ isCreatorAccount: true, role: "admin" })) && !!eventHrefFor(c, v({ isCreatorAccount: true, role: "admin" })) && !settingsHrefFor(c, v({ role: "admin" })) && !eventHrefFor(c, v({ role: "admin" })))
      check("a moderator or a member: neither; events off: no Event", !settingsHrefFor(c, v({ isCreatorAccount: true, role: "moderator" })) && !eventHrefFor(c, v({ isCreatorAccount: true, role: "moderator" })) && !settingsHrefFor(c, v({})) && !eventHrefFor({ id: C, events_enabled: false }, v({ isOwner: true, role: "owner" })))
    }
    const shell = code("components/community/member/shell.tsx")
    check("the shell reads the wall once per page load, with the bar", /Promise\.all\(\[shellData\(community\.id, viewer, community\), topBarData\(community, viewer\), wallData\(admin\(\), community, viewer\)\]\)/.test(shell) && /wall=\{wall\}/.test(shell))
  }

  /* ── Round 5: the bar, the composer, a post ──────────────────────────── */
  console.log("\nThe bar, the composer and a post")
  {
    const bar = code("components/community/member/top-bar.tsx")
    check("the search: a field from 768px, an icon on a phone, only for a member", /\{search \? \(\s*<CommunitySearchField communityId=\{search\.communityId\}[^>]*className="hidden md:block/.test(bar) && /\{search \? <CommunitySearchButton communityId=\{search\.communityId\}[^>]*className="md:hidden" \/> : null\}/.test(bar))
    check("from 1024px the name takes the left column's width, so the search lines up with the feed", /wide && "lg:w-\[260px\] lg:max-w-none xl:w-\[280px\]"/.test(bar) && /wide \? "max-w-\[1360px\]" : "max-w-\[1080px\]"/.test(bar))
    check("round 7: no picture with a chevron any more; the \"...\" opens the menu", !/ChevronDown|data-community-me=/.test(bar) && /<CommunityAccountMenu /.test(bar))
    check("the frame hands the bar the search; the visitor's frame does not", /search=\{\{ communityId: community\.id \}\}/.test(code("components/community/member/shell-frame.tsx")) && !/search=/.test(code("components/community/public/public-frame.tsx")))
    const composer = code("components/community/member/composer.tsx")
    check("the composer: Photo, Video, Poll, Event for staff only, and More", /data-composer-action="photo"/.test(composer) && /data-composer-action="video"/.test(composer) && /data-composer-action="poll"/.test(composer) && /\{eventHref \? \(\s*<Link href=\{eventHref\}[^>]*data-composer-action="event"/.test(composer) && /data-composer-action="more"/.test(composer))
    check("Photo and Video open the file picker inside the same press, from pickers that stay mounted", /imageInput\.current\?\.click\(\)/.test(composer) && /videoInput\.current\?\.click\(\)/.test(composer) && (composer.match(/\{pickers\}/g) || []).length === 2)
    check("More: post in a chosen space, a file for the creator; nothing to offer, no button", /label: `Post in \$\{s\.name\}`/.test(composer) && /label: "Attach a file"/.test(composer) && /\{more\.length \?/.test(composer))
    check("the pages hand the composer the event form only through the server's rule", /eventHref: eventHrefFor\(community, viewer\)/.test(code("components/community/member/feed-page.tsx")) && /eventHref: eventHrefFor\(community, viewer\)/.test(code("app/(marketing)/community/[slug]/(member)/space/[space]/page.tsx")))
    const post = code("components/community/member/post-card.tsx")
    check("a post: its space as a chip, Like and Comment, Save as a word at the far end", /data-post-space=""/.test(post) && /\{post\.bookmarked \? "Saved" : "Save"\}/.test(post) && /data-like=""/.test(post) && /data-comment-button=""/.test(post))
    const chips = code("components/community/member/space-chips.tsx")
    check("the chips are one row that scrolls, Saved outside it at the right end", /data-space-chips-track=""/.test(chips) && chips.indexOf("data-space-chips-track") < chips.indexOf('data-space-chip="saved"') && /mask-image:linear-gradient/.test(chips))
  }

  /* ── Round 5: search ─────────────────────────────────────────────────── */
  console.log("\nSearch inside a community")
  {
    check("what may be searched: letters, digits and a few marks; no filter syntax", cleanSearch('gla,ze (x) "y" %_ \\\\ *') === "gla ze x y" && cleanSearch("  Café  au lait ") === "Café au lait" && cleanSearch("x".repeat(90)).length === SEARCH_MAX && cleanSearch(5) === "")
    check("the pattern is quoted for the filter", likePattern("glaze tip") === '"%glaze tip%"')
    check("a snippet around the match, or the start when it is near", snippetAround("short text about glaze", "glaze") === "short text about glaze" && snippetAround(`${"word ".repeat(60)}glaze here`, "glaze").startsWith("...") && snippetAround(`${"word ".repeat(60)}glaze here`, "glaze").includes("glaze"))
    check("the client steps through results and wraps", stepOption(-1, 3, "ArrowDown") === 0 && stepOption(2, 3, "ArrowDown") === 0 && stepOption(0, 3, "ArrowUp") === 2 && stepOption(-1, 0, "ArrowDown") === -1 && stepOption(1, 3, "End") === 2)
    check("results in drawn order: posts, members, spaces, each to its page", searchOptions({ q: "x", posts: [{ id: "p1" } as never], members: [{ id: "m1", href: "/@m" } as never], spaces: [{ id: "s1", slug: "gen" } as never] }, "club").map((o) => o.href).join() === "/community/club/post/p1,/@m,/community/club/space/gen")

    const C = "c0000000-0000-4000-8000-0000000000e1"
    const OPEN = "b0000000-0000-4000-8000-0000000000e1"
    const LOCKED = "b0000000-0000-4000-8000-0000000000e2"
    const CHAT = "b0000000-0000-4000-8000-0000000000e3"
    const spaces = [
      { id: OPEN, community_id: C, slug: "glaze-lab", name: "Glaze lab", description: null, kind: "feed", view_access: {}, archived_at: null },
      { id: LOCKED, community_id: C, slug: "pro-glaze", name: "Pro glaze", description: null, kind: "feed", view_access: { tierIds: ["t-pro"] }, archived_at: null },
      { id: CHAT, community_id: C, slug: "glaze-chat", name: "Glaze chat", description: null, kind: "chat", view_access: {}, archived_at: null },
    ]
    const posts = [{ id: "p1", community_id: C, space_id: OPEN, author_id: null, title: "Glaze tip", body_text: "Test tiles first.", created_at: iso(NOW), status: "published" }]
    const member = { userId: "u1", role: "member", active: true, tierId: null, ownedProductIds: [], level: 1 } as never
    const run = async (community: Record<string, unknown>, viewer: never, q: unknown) => {
      const s = scriptedDb((c) => (c.table === "community_feed_posts" ? { data: posts } : { data: rowsFor(c, { community_spaces: spaces, profiles: [], community_members: [], creators: [] }) }))
      const r = await searchCommunity(s.db, { id: C, slug: "club", chat_enabled: false, directory_enabled: true, ...community } as never, viewer, q)
      return { r, calls: s.calls }
    }
    const short = await run({}, member, "g")
    check("one letter: nothing read", short.calls.length === 0 && short.r.posts.length === 0)
    const { r, calls } = await run({}, member, "gla")
    const postRead = calls.find((c) => c.table === "community_feed_posts")
    const or = String(postRead?.ops.find((o) => o[0] === "or")?.[1] ?? "")
    check("spaces: only the ones this member may see, and no chat space while chat is off", r.spaces.map((x) => x.slug).join() === "glaze-lab", r.spaces)
    check("posts: published, in this community, only in spaces the member may see (or none), by title or text", !!postRead && hasOp(postRead, "eq", "community_id", C) && hasOp(postRead, "eq", "status", "published") && or.includes(`space_id.in.(${OPEN})`) && !or.includes(LOCKED) && !or.includes(CHAT) && or.includes('title.ilike."%gla%"') && or.includes('body_text.ilike."%gla%"') && hasOp(postRead, "limit", SEARCH_POSTS), or)
    check("a post comes back with its space and a snippet", r.posts[0]?.space?.slug === "glaze-lab" && r.posts[0].snippet === "Test tiles first.")
    check("members through the directory's own search while it is on", calls.some((c) => c.table === "profiles"))
    const closed = await run({ directory_enabled: false }, member, "gla")
    check("directory off: no member search for a member", !closed.calls.some((c) => c.table === "profiles") && closed.r.members.length === 0)
    const staffView = { ...(member as object), role: "admin" } as never
    const staffRun = await run({ directory_enabled: false, chat_enabled: true }, staffView, "gla")
    check("its staff still search members; with chat on a chat space can be found (never its messages)", staffRun.calls.some((c) => c.table === "profiles") && staffRun.r.spaces.map((x) => x.slug).join() === "glaze-lab,pro-glaze,glaze-chat" && !String(staffRun.calls.find((c) => c.table === "community_feed_posts")?.ops.find((o) => o[0] === "or")?.[1]).includes(CHAT))

    const route = code("app/api/community/[communityId]/search/route.ts")
    check("the route: the switch first, a member from the session, rate limited on its own bucket, no store", /export async function GET\([^)]*\)[^{]*\{\s*const off = await requireCommunitiesOn\(\)\s*if \(off\) return off/.test(route) && /requireMember\(db, communityId, await sessionUserId\(\), "view"\)/.test(route) && /rateLimit\(\{ bucket: rateBucket\("search"\), subjects: \[memberSubject\(/.test(route) && /headers: NO_STORE/.test(route) && rateBucket("search") === "community-search" && RATE_LIMITS.search.length > 0)
    check("the server reads no email", !/email/.test(code("lib/communities/server/search.ts")))
    const client = code("components/community/member/search.tsx")
    check("a combobox: the field says which result is chosen, the list is a listbox of options", /role="combobox"/.test(client) && /aria-activedescendant=/.test(client) && /role="listbox"/.test(client) && /role: "option" as const/.test(client))
    check("the arrows, Enter, Escape, and / to focus", /e\.key === "ArrowDown" \|\| e\.key === "ArrowUp"/.test(client) && /e\.key === "Enter" && active >= 0/.test(client) && /e\.key === "Escape"/.test(client) && /e\.key !== "\/"/.test(client))
    check("it asks once typing pauses, never under two letters, and drops a stale answer", SEARCH_DEBOUNCE_MS === 180 && SEARCH_MIN_CHARS === SEARCH_MIN && /if \(ctrl\.signal\.aborted \|\| latest\.current !== term\) return/.test(client))
    check("on a phone: the whole screen, drawn inside the tap so the keyboard comes up, 16px so iOS does not zoom", /flushSync\(\(\) => setOpen\(true\)\)\s*input\.current\?\.focus\(\)/.test(client) && /fixed inset-0 z-\[80\]/.test(client) && /text-\[16px\]/.test(client) && /createPortal\(/.test(client))
  }

  /* ── Copy and boundaries ─────────────────────────────────────────────── */
  console.log("\nCopy, and no server code in the browser")
  {
    const mine = [
      "components/community/member/top-bar.tsx",
      "components/community/member/shell-frame.tsx",
      "components/community/member/space-chips.tsx",
      "components/community/member/person-href.ts",
      "components/community/member/nav.ts",
      "components/community/member/place-navigator.tsx",
      "components/community/member/person-card.tsx",
      "components/community/member/person-card-facts.ts",
      "components/community/member/messages.tsx",
      "lib/communities/server/people.ts",
      "app/api/community/[communityId]/people/[userId]/card/route.ts",
      "app/(marketing)/community/[slug]/(member)/members/[userId]/page.tsx",
      "components/community/public/gallery.ts",
      "components/community/public/gallery-view.tsx",
      "components/community/public/stats-row.tsx",
      "components/community/public/public-frame.tsx",
      "components/community/public/sales-page.tsx",
      "components/community/public/join-controls.tsx",
      "lib/communities/server/presence.ts",
      "app/api/community/[communityId]/presence/route.ts",
      "app/(marketing)/community/[slug]/layout.tsx",
      "components/community/member/wall.tsx",
      "components/community/member/search.tsx",
      "components/community/member/composer.tsx",
      "components/community/member/post-card.tsx",
      "components/community/member/columns.tsx",
      "components/community/member/view-types.ts",
      "lib/communities/server/wall.ts",
      "lib/communities/server/search.ts",
      "app/api/community/[communityId]/search/route.ts",
      "components/community/member/account-menu.tsx",
      "components/community/member/community-mark.tsx",
      "components/community/member/feed.tsx",
      "components/community/member/feed-cache.ts",
      "components/community/member/sort-menu.tsx",
      "components/community/member/space-chips.tsx",
      "components/community/member/feed-page.tsx",
      "components/community/member/ui.ts",
      "components/community/member/nav.ts",
      "app/(marketing)/community/[slug]/(member)/space/[space]/page.tsx",
      "app/(marketing)/community/[slug]/(member)/saved/page.tsx",
    ]
    const offenders = mine.filter((f) => /—/.test(read(f)) || /\b(unlock\w*|elevate|seamless|powerful|effortless(ly)?|supercharge|transform\w*)\b/i.test(read(f)))
    check("no em dash and no banned word", offenders.length === 0, offenders)
    const clients = mine.filter((f) => /^"use client"/.test(read(f)))
    const leaks = clients.filter((f) => /server-only|next\/headers|lib\/communities\/server|lib\/supabase\/(server|admin)|lib\/admin-blog-auth|\.\/(data|shell|feed-page)"/.test(code(f)))
    check("client parts import nothing from the server", clients.length >= 5 && leaks.length === 0, { clients: clients.length, leaks })
    check("the presence, people, wall and search modules say server-only", ["presence", "people", "wall", "search"].every((m) => /^import "server-only"/m.test(read(`lib/communities/server/${m}.ts`))))
    check("no violet fills on the community's frame", !mine.some((f) => /bg-\[#8b5cf6\]|bg-violet|bg-purple/.test(code(f))))
  }

  /* ── Round 7: the sort menu, read by the server ──────────────────────── */
  console.log("\nRound 7: Default, New, Top and Unread")
  {
    check("four orders, Default first; the old names still mean New and Top; anything else is Default", FEED_SORTS.join() === "default,new,top,unread" && feedSort("latest") === "new" && feedSort("popular") === "top" && feedSort("top") === "top" && feedSort("unread") === "unread" && feedSort("drop table") === "default" && feedSort(null) === "default")
    const at = "2026-10-01T10:00:00.000Z"
    const id = "00000000-0000-4000-8000-0000000000aa"
    check("Default and Unread walk the last activity, New the creation time, Top the likes", keysetCondition("default", { c: at, i: id }).startsWith("last_activity_at.lt.") && keysetCondition("unread", { c: at, i: id }).startsWith("last_activity_at.lt.") && keysetCondition("new", { c: at, i: id }).startsWith("created_at.lt.") && keysetCondition("latest", { c: at, i: id }).startsWith("created_at.lt.") && keysetCondition("top", { c: at, i: id, r: 3 }).startsWith("reaction_count.lt.3,"))
    const row = { created_at: "2026-09-01T10:00:00.000Z", last_activity_at: at, id, reaction_count: 7 }
    check("a page's cursor carries the key its order walks", decodeCursor(cursorAfter("default", row), "default")?.c === at && decodeCursor(cursorAfter("new", row), "new")?.c === row.created_at && decodeCursor(cursorAfter("top", row), "top")?.r === 7 && decodeCursor(encodeCursor({ c: at, i: id }), "top") === null)
    check("Unread starts at the member's last activity here, else when they joined; nothing known, everything", unreadSince({ member: { last_active_at: at, joined_at: "2026-01-01T00:00:00Z" } } as never) === at && unreadSince({ member: { last_active_at: null, joined_at: "2026-01-01T00:00:00Z" } } as never) === "2026-01-01T00:00:00.000Z" && unreadSince({ member: null } as never) === null)

    /* What each order asks the database, recorded. */
    const C = "c0000000-0000-4000-8000-0000000000f1"
    const community = { id: C, chat_enabled: true } as never
    const viewer = { userId: "u1", role: "member", active: true, tierId: null, ownedProductIds: [], level: 1, member: { last_active_at: at, joined_at: null } } as never
    const asked = async (sort: string) => {
      const s2 = scriptedDb(() => ({ data: [] }))
      await listFeed(s2.db as never, community, viewer, { sort: sort as never })
      const posts = s2.calls.filter((c) => c.table === "community_feed_posts")
      return { pinnedRead: posts.some((c) => c.ops.some((o) => o[0] === "eq" && o[1] === "pinned" && o[2] === true)), main: posts.find((c) => !c.ops.some((o) => o[0] === "eq" && o[1] === "pinned" && o[2] === true)) }
    }
    const d = await asked("default")
    check("Default: the pinned posts read on their own, then the rest by last activity", d.pinnedRead && !!d.main && d.main.ops.some((o) => o[0] === "eq" && o[1] === "pinned" && o[2] === false) && orderOf(d.main)[0] === "last_activity_at", d.main?.ops)
    const n = await asked("new")
    check("New: no pinned block, every post by when it was written", !n.pinnedRead && !!n.main && !n.main.ops.some((o) => o[0] === "eq" && o[1] === "pinned") && orderOf(n.main)[0] === "created_at", n.main?.ops)
    const t = await asked("top")
    check("Top: most liked first, then newest", !t.pinnedRead && !!t.main && orderOf(t.main).join() === "reaction_count,created_at,id", orderOf(t.main!))
    const u = await asked("unread")
    check("Unread: only posts with activity after the member was last active, newest activity first", !u.pinnedRead && !!u.main && u.main.ops.some((o) => o[0] === "gt" && o[1] === "last_activity_at" && o[2] === at) && orderOf(u.main)[0] === "last_activity_at", u.main?.ops)
    const route = code("app/api/community/[communityId]/posts/route.ts")
    check("the posts route reads ?sort= through feedSort, so the menu's four reach the server", /sort: feedSort\(url\.searchParams\.get\("sort"\)\)/.test(route))
    check("the first page on the server is Default, on the feed and on a space", /listFeed\(admin\(\), community, viewer, \{ sort: "default" \}\)/.test(code("components/community/member/feed-page.tsx")) && /listFeed\(admin\(\), community, viewer, \{ sort: "default", spaceId: space\.id \}\)/.test(code("app/(marketing)/community/[slug]/(member)/space/[space]/page.tsx")))
  }

  /* ── Round 7: the sort menu and switching in place, in the browser ───── */
  console.log("\nRound 7: no Latest / Popular pills; spaces and sorts switch in place from a cache")
  {
    const feed = code("components/community/member/feed.tsx")
    const menu = code("components/community/member/sort-menu.tsx")
    const chips = code("components/community/member/space-chips.tsx")
    check("no Latest / Popular pills: no tab list of sorts in the feed", !/"latest", "popular"|role="tablist"|data-feed-sort=""/.test(feed))
    check("the sort is a sliders button at the end of the chips row, left of Saved, opening a menu of four", /sort=\{target\.kind === "saved" \? null : <SortMenu value=\{sort\} onChange=\{setSort\} \/>\}/.test(feed) && chips.indexOf("{sort}") > chips.indexOf("data-space-chips-track") && chips.indexOf("{sort}") < chips.indexOf('data-space-chip="saved"') && /Tuning2Icon/.test(menu) && /role="menuitemradio"/.test(menu) && /aria-checked=\{on\}/.test(menu))
    check("the choice shows in the menu (a soft fill, a check) and as a dot on the button, never as a pill", /\{on \? <Check /.test(menu) && /value !== "default" \? <span[^>]*data-feed-sort-dot=""/.test(menu))
    check("the menu: arrows, Escape (focus back to the button), a click outside", /e\.key !== "Escape"/.test(menu) && /buttonRef\.current\?\.focus/.test(menu) && /document\.addEventListener\("pointerdown", away, true\)/.test(menu) && /ArrowDown/.test(menu))
    check("one family of glyphs: Solar line icons for the four sorts and the button", ["history", "stars", "sort-from-bottom-to-top", "eye", "tuning-2"].every((n) => menu.includes(`@solar-icons/react/linear/${n}"`)))
    check("a chip switches in place: a plain click is kept from loading a page, a new tab is not", /if \(!inPlace\(e\)\) return\s*e\.preventDefault\(\)\s*onPick\(pick\)/.test(chips) && /e\.button === 0 && !e\.metaKey && !e\.ctrlKey && !e\.shiftKey && !e\.altKey/.test(chips))
    check("a chat space stays a page of its own", /s\.kind === "chat" \? \{\} : switching\(/.test(chips))
    check("and the switching chips are not prefetched as pages (the list comes from the API, once)", /prefetch: false/.test(chips))
    check("the address follows with pushState (Next's router keeps up), and Back is read from it", /window\.history\.pushState\(null, "", href\)/.test(feed) && /window\.addEventListener\("popstate", on\)/.test(feed) && /targetFromPath\(livePath \|\| pathname, slug, spaces, start\)/.test(feed))
    check("a cached list on the very next render (read during render, not after an effect)", /const cached = shown\.key === key \? shown\.view : \(readView\(key\) \?\? null\)/.test(feed))
    check("otherwise the list on screen stays until the new one arrives, dimmed only after 200ms", /const view = cached \?\? shown\.view/.test(feed) && /DIM_AFTER_MS = 200/.test(feed) && /dim \? "opacity-60" : "opacity-100"/.test(feed) && !/Skeleton/.test(feed))
    check("asked for ahead: a pointer resting on a chip, a finger landing, the keyboard", /onPointerEnter: onIntent \? \(e: React\.PointerEvent\) => e\.pointerType === "mouse" && onIntent\(pick\)/.test(chips) && /onPointerDown: onIntent \? \(\) => onIntent\(pick\)/.test(chips) && /onFocus: onIntent/.test(chips) && /prefetchView\(communityId, next/.test(feed))
    check("a stale list (over a minute) is shown at once and read again quietly", /Date\.now\(\) - have\.at > FRESH_MS && have\.pages <= 1/.test(feed) && FRESH_MS === 60_000)
    check("pinned posts lead only in Default", /const lead = sort === "default" && target\.kind !== "saved"/.test(feed))
    check("the post card's props are unchanged (post, slug, viewer, update, readOnly)", /<PostCard key=\{p\.id\} post=\{p\} slug=\{slug\} viewer=\{viewer\} update=\{update\} readOnly=\{readOnly\} \/>/.test(feed))
    check("the composer follows the list: every space it may post in on All, the space itself on a space, none on Saved", /fixedSpaceId: space\.id/.test(feed) && /target\.kind === "saved"\) return null/.test(feed) && /<Composer key=\{target\.kind === "space" \? target\.id : target\.kind\}/.test(feed))

    /* The cache itself. */
    clearViews()
    const P = (id: string, extra: Record<string, unknown> = {}) => ({ id, pinned: false, bookmarked: false, reacted: false, reactionCount: 0, space: { id: "s1", slug: "g", name: "G" }, ...extra }) as never
    check("a key per community, list and sort; Saved has one order", viewKey("c", { kind: "all" }, "top") === "c|all|top" && viewKey("c", { kind: "space", id: "s1" }, "new") === "c|space:s1|new" && viewKey("c", { kind: "saved" }, "top") === "c|saved|-")
    check("the addresses the feed already used", viewUrl("c", { kind: "space", id: "s1" }, "unread") === "/api/community/c/posts?sort=unread&space=s1" && viewUrl("c", { kind: "saved" }, "default", "x") === "/api/community/c/bookmarks?cursor=x")
    const fp = firstPage({ pinned: [P("a", { pinned: true })], posts: [P("a"), P("b")], nextCursor: "n" }, 5)
    check("a first page: pinned first, each post once", fp.posts.map((p) => (p as { id: string }).id).join() === "a,b" && fp.cursor === "n" && fp.at === 5 && fp.pages === 1)
    writeView("c|all|default", firstPage({ pinned: [P("p", { pinned: true })], posts: [P("a"), P("b")], nextCursor: null }))
    writeView("c|space:s1|default", firstPage({ pinned: [], posts: [P("a")], nextCursor: null }))
    writeView("c|all|top", firstPage({ pinned: [], posts: [P("b")], nextCursor: null }))
    writeView("c|saved|-", firstPage({ pinned: [], posts: [P("a", { bookmarked: true })], nextCursor: null }))
    patchPost("c", "a", (p) => ({ ...(p as object), reacted: true, reactionCount: 1 }) as never, "c|all|default")
    check("a like in one list reaches every other cached list holding the post", (readView("c|space:s1|default")!.posts[0] as { reacted: boolean }).reacted && !(readView("c|all|default")!.posts[1] as { reacted: boolean }).reacted)
    patchPost("c", "a", (p) => ({ ...(p as object), bookmarked: false }) as never)
    check("an unsave takes it off the cached Saved list", readView("c|saved|-")!.posts.length === 0)
    addPost("c", P("new"))
    check("a new post goes to the top of All and its space in Default (under the pinned) and New; Top is read again", (readView("c|all|default")!.posts.map((p) => (p as { id: string }).id).join() === "p,new,a,b") && (readView("c|space:s1|default")!.posts[0] as { id: string }).id === "new" && !readView("c|all|top"))
    dropSaved("c")
    check("Saved can be dropped to be read again", !readView("c|saved|-"))
    /* One ask per list at a time, however many hovers and clicks. */
    const g = globalThis as { fetch?: typeof fetch }
    const realFetch = g.fetch
    let asks = 0
    g.fetch = (async () => {
      asks++
      await new Promise((r) => setTimeout(r, 5))
      return new Response(JSON.stringify({ pinned: [], posts: [{ id: "z" }], nextCursor: null }), { status: 200, headers: { "Content-Type": "application/json" } })
    }) as typeof fetch
    try {
      prefetchView("c", { kind: "space", id: "s9" }, "default")
      prefetchView("c", { kind: "space", id: "s9" }, "default")
      const v = await loadView("c", { kind: "space", id: "s9" }, "default")
      prefetchView("c", { kind: "space", id: "s9" }, "default")
      check("a hover, a press and the click share one ask; a fresh list is not asked for again", asks === 1 && (v?.posts[0] as { id: string } | undefined)?.id === "z" && !!readView("c|space:s9|default"), asks)
    } finally {
      g.fetch = realFetch
      clearViews()
    }

    /* Ask 11: extremely little depth on every pill, chip and button. */
    const ui = code("components/community/member/ui.ts")
    check("the depth tokens: a hairline and a one pixel soft shadow, never more", /export const DEPTH = "border border-\[#e3e5e9\] bg-white shadow-\[0_1px_1px_rgba\(16,24,40,0\.05\)\]"/.test(ui) && /export const DEPTH_INK = "border border-\[#1a1a2e\] bg-\[#1a1a2e\] shadow-\[0_1px_1\.5px_rgba\(16,24,40,0\.18\)\]"/.test(ui))
    check("the buttons, the chips and the sort button wear them", /BTN_PRIMARY = `\$\{BTN\} h-10 \$\{DEPTH_INK\}/.test(ui) && /BTN_SECONDARY = `\$\{BTN\} h-10 \$\{DEPTH\} \$\{DEPTH_PRESS\}/.test(ui) && /const CHIP_ON = `\$\{DEPTH_INK\} text-white`/.test(chips) && /const CHIP_OFF = `\$\{DEPTH\} \$\{DEPTH_PRESS\}/.test(chips) && /DEPTH,\s*DEPTH_PRESS,/.test(menu))
  }

  /* ── Round 7: the account menu's facts from the server ───────────────── */
  console.log("\nRound 7: the account menu's facts")
  {
    const pub = code("lib/communities/server/public.ts")
    check("the bar is told the handle and whether the account sells (Dashboard or Start creating), from the creators row", /username: profile\?\.username \?\? null/.test(pub) && /seller: sellerRows\[0\]\?\.onboarding_completed === true/.test(pub) && /db\.from\("creators"\)\.select\("onboarding_completed"\)\.eq\("user_id", userId\)/.test(pub))
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
