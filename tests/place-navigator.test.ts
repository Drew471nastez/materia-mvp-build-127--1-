/**
 * ===========================================================================
 *  THE NAVIGATOR, AND THE HEADER AROUND IT (round 3, asks 8, 9 and 10)
 * ===========================================================================
 * The owner's words:
 *
 *   10. "The hamburger left of the Storelib logo stops opening category
 *       browsing. It opens the navigator: my communities (most recently
 *       visited first, the one I'm in highlighted / greyed as current),
 *       Discover communities, Explore, and Start creating (non creators) or
 *       Dashboard (creators). The icon is a little bigger. The SAME component
 *       is used in the community header. Categories stay reachable from
 *       Explore itself."
 *    8. "Storelib header: a little whiter; the search field has NO harsh
 *       rectangle overlay when focused ... and keeps a soft focus state;
 *       clicking my avatar on desktop opens an inline dropdown."
 *
 * The rules that are data (the order, the rows) are run directly; the rest
 * is read off the source. The rendered panel, the dropdown, the focused
 * search field and the bell are measured frame by frame in
 * scripts/check-place-navigator.mjs.
 */
import { readSource, readCode } from "./_source"
import {
  navigatorModel,
  orderByLastVisit,
  parsePlaces,
  PLACES_URL,
  SIGNED_OUT_PLACES,
  type PlacesResponse,
} from "@/lib/nav/places-shared"

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
    console.log(`  FAIL  ${label}${detail === undefined ? "" : `   (${typeof detail === "string" ? detail : JSON.stringify(detail)})`}`)
  }
}

const NAV = "components/nav/place-navigator.tsx"
const nav = readCode(NAV)
const navSrc = readSource(NAV)
const shared = readCode("lib/nav/places-shared.ts")
const server = readCode("lib/nav/places-server.ts")
const route = readCode("app/api/me/places/route.ts")
const header = readCode("components/platform/platform-header-client.tsx")
const chrome = readCode("lib/platform/header-chrome.ts")
const conditional = readCode("components/marketing/conditional-header.tsx")

const community = (id: string, slug = id) => ({ id, slug, name: `Club ${id}`, logoUrl: null })
const me = (over: Partial<PlacesResponse> = {}): PlacesResponse => ({
  signedIn: true,
  communitiesOn: true,
  isCreator: false,
  hasSellerAccess: false,
  communities: [community("a"), community("b"), community("c")],
  ...over,
})
const keys = (m: ReturnType<typeof navigatorModel>) => [
  ...m.communities.map((r) => (r.kind === "community" ? `c:${r.community.id}${r.current ? "*" : ""}` : "")),
  ...m.links.map((r) => (r.kind === "link" ? r.key : "")),
  ...m.actions.map((a) => `${a.key}:${a.href}`),
]

console.log("\n1. Most recently visited first")
{
  const rows = [
    { community_id: "never", last_seen_at: null, last_active_at: null, joined_at: null },
    { community_id: "old-visit", last_seen_at: "2026-09-01T00:00:00Z", last_active_at: "2026-10-01T00:00:00Z", joined_at: "2026-01-01T00:00:00Z" },
    { community_id: "new-visit", last_seen_at: "2026-10-03T00:00:00Z", last_active_at: null, joined_at: "2026-01-01T00:00:00Z" },
    { community_id: "no-heartbeat-active", last_seen_at: null, last_active_at: "2026-10-02T00:00:00Z", joined_at: "2025-01-01T00:00:00Z" },
    { community_id: "no-heartbeat-joined", last_seen_at: null, last_active_at: null, joined_at: "2026-10-02T00:00:00Z" },
  ]
  const order = orderByLastVisit(rows).map((r) => r.community_id).join(",")
  check("the heartbeat decides, then the last thing done there, then the join, and never-seen goes last", order === "new-visit,old-visit,no-heartbeat-active,no-heartbeat-joined,never", order)
  const before85 = orderByLastVisit([{ community_id: "x", last_active_at: "2026-01-01T00:00:00Z" }, { community_id: "y", last_active_at: "2026-02-01T00:00:00Z" }]).map((r) => r.community_id).join("")
  check("before part 85 (no last_seen_at at all) the last activity still orders them", before85 === "yx", before85)
  const ties = orderByLastVisit([{ community_id: "p" }, { community_id: "q" }, { community_id: "r" }]).map((r) => r.community_id).join("")
  check("ties keep the order they came in", ties === "pqr", ties)
}

console.log("\n2. What the panel lists")
{
  const buyer = keys(navigatorModel(me(), { kind: "community", id: "b" }))
  check("signed in: my communities, Discover communities, Explore, Start creating (/sell)", buyer.join(" ") === "c:a c:b* c:c discover-communities explore start-creating:/sell", buyer)
  const seller = keys(navigatorModel(me({ hasSellerAccess: true, isCreator: true }), { kind: "storelib" }))
  check("a seller gets Dashboard (/app) instead, and nothing is current on Storelib's own pages", seller.join(" ") === "c:a c:b c:c discover-communities explore dashboard:/app", seller)
  const started = keys(navigatorModel(me({ isCreator: true, hasSellerAccess: false })))
  check("a creator who has not finished the setup is still sent to /sell", started.at(-1) === "start-creating:/sell", started)
  const guest = keys(navigatorModel(SIGNED_OUT_PLACES))
  check("signed out with communities off: Explore, then Log in and Start creating", guest.join(" ") === "explore log-in:/login start-creating:/sell", guest)
  const guestOn = keys(navigatorModel({ ...SIGNED_OUT_PLACES, communitiesOn: true, communities: [community("leak")] }))
  check("signed out with communities on: Explore, Discover communities, Log in, Start creating, and never a community row", guestOn.join(" ") === "explore discover-communities log-in:/login start-creating:/sell", guestOn)
  const off = keys(navigatorModel(me({ communitiesOn: false })))
  check("communities switched off: no community rows and no Discover communities", off.join(" ") === "explore start-creating:/sell", off)
  const unsafe = keys(navigatorModel(me({ communities: [community("ok", "good-club"), community("bad", "../admin"), community("caps", "Club")] })))
  check("a slug that would not make a safe path is left out", unsafe[0] === "c:ok" && !unsafe.includes("c:bad") && !unsafe.includes("c:caps"), unsafe)
  const m = navigatorModel(me(), { kind: "community", id: "a" })
  check("rows link to /community/<slug>, Discover communities to /explore/communities, Explore to /explore",
    m.communities[0].kind === "community" && m.communities[0].href === "/community/a" &&
    m.links.some((r) => r.kind === "link" && r.key === "discover-communities" && r.href === "/explore/communities") &&
    m.links.some((r) => r.kind === "link" && r.key === "explore" && r.href === "/explore"))
  check("only the signed out foot has two buttons; the primary is Start creating or Dashboard", navigatorModel(SIGNED_OUT_PLACES).actions.filter((a) => a.primary).map((a) => a.key).join() === "start-creating" && m.actions.length === 1 && m.actions[0].primary)
}

console.log("\n3. The answer is read defensively")
{
  check("anything that is not an object is the signed out answer", JSON.stringify(parsePlaces(null)) === JSON.stringify(SIGNED_OUT_PLACES) && JSON.stringify(parsePlaces("x")) === JSON.stringify(SIGNED_OUT_PLACES))
  const p = parsePlaces({ signedIn: true, communitiesOn: "yes", hasSellerAccess: 1, communities: [{ id: "a", slug: "a", name: "A", logoUrl: 5 }, { id: 1 }, null, "x"] })
  check("only true is true, and only whole rows are kept", p.signedIn && !p.communitiesOn && !p.hasSellerAccess && p.communities.length === 1 && p.communities[0].logoUrl === null, p)
  check("at most twenty", parsePlaces({ signedIn: true, communities: Array.from({ length: 40 }, (_, i) => community(`c${i}`)) }).communities.length === 20)
  check("one address for the list", PLACES_URL === "/api/me/places")
}

console.log("\n4. GET /api/me/places")
{
  check("a GET only, never cached beyond the tab", /export async function GET\(\)/.test(route) && !/export async function (POST|PATCH|PUT|DELETE)/.test(route) && /"Cache-Control": "private, no-store"/.test(route))
  check("the person is the session's, never a parameter", /const userId = await sessionUserId\(\)/.test(route) && !/searchParams|request\.json|params\./.test(route))
  check("signed out is an ordinary answer with every list empty", /if \(!userId\) return NextResponse\.json\(SIGNED_OUT_PLACES/.test(route))
  check("the reads are server only", /^import "server-only"/.test(readSource("lib/nav/places-server.ts")))
  check("active memberships only, most recently visited first", /\.eq\("user_id", userId\)\.eq\("status", "active"\)/.test(server) && /order\("last_seen_at", \{ ascending: false, nullsFirst: false \}\)/.test(server) && /orderByLastVisit\(/.test(server))
  check("before part 85 it asks again without last_seen_at", /if \(res\.error && missing\(res\.error\)\) res = await read\(false\)/.test(server))
  check("no deleted or suspended community, and a draft only for its staff", /\.is\("deleted_at", null\)/.test(server) && /c\.suspended_at \|\| c\.status === "suspended"/.test(server) && /c\.status === "draft" && !meetsRole\(m\.role, "moderator"\)/.test(server))
  check("the switch decides whether communities are listed at all", /communitiesEnabled\(\)/.test(server) && /if \(on\) \{/.test(server))
  check("Dashboard follows the shared seller check", /readSellerAccess\(db, userId\)/.test(server) && /hasSellerAccess: access\.state === "seller"/.test(server))
}

console.log("\n5. The component")
{
  check("a client component exporting PlaceNavigator({ current, className })", navSrc.startsWith('"use client"') && /export function PlaceNavigator\(\{ current, className, onNavigate \}: PlaceNavigatorProps\)/.test(nav) && /current\?: NavigatorCurrent/.test(nav) && /className\?: string/.test(nav))
  check("the current kinds are a community by id or Storelib", /export type NavigatorCurrent = \{ kind: "community"; id: string \} \| \{ kind: "storelib" \}/.test(shared))
  check("it imports nothing from the server", !/server-only|next\/headers|lib\/communities\/server|places-server|lib\/supabase\/(server|admin)|lib\/admin-blog-auth/.test(nav))
  check("a popover on a computer and the app's sheet on a phone, kept so a tap only slides it", /data-place-navigator-panel="popover"/.test(nav) && /<BottomSheet[\s\S]{0,200}hideFrom="md"[\s\S]{0,60}keepMounted=\{phone\}/.test(nav))
  check("in and out on the compositor (visibility flips at the end), still under reduced motion", /origin-top-left motion-reduce:transition-none"/.test(nav) && /PANEL_OPEN =\s*"transition-\[opacity,scale,translate\] /.test(nav) && /PANEL_CLOSED = "transition-\[opacity,scale,translate,visibility\] /.test(nav) && /starting:opacity-0 starting:scale-\[0\.97\] starting:-translate-y-1/.test(nav))
  check("built once the page is idle and kept, so the click that opens it builds nothing", /if \(open && !built\) setBuilt\(true\)/.test(nav) && /const idle = \(\) => \{\s*void refresh\(\)\s*setBuilt\(true\)/.test(nav) && /\{!phone && built \? \(/.test(nav))
  check("closed, it is invisible, untouchable and unfocusable", /inert=\{open \? undefined : true\}/.test(nav) && /PANEL_CLOSED = "[^"]*invisible pointer-events-none opacity-0/.test(nav))
  check("a second click, a click outside, Escape and a new page close it", /if \(open\) return close\(\)/.test(nav) && /document\.addEventListener\("pointerdown", away, true\)/.test(nav) && /e\.key === "Escape"/.test(nav) && /useEffect\(\(\) => \{\s*setOpen\(false\)\s*\}, \[pathname\]\)/.test(nav))
  check("the button says what it does and whether it is open", /aria-label=\{open \? "Close menu" : "Open menu"\}/.test(nav) && /aria-expanded=\{open\}/.test(nav) && /aria-haspopup="dialog"/.test(nav))
  check("the three lines are a little bigger: 25px on a phone, 22px on a computer", /w-\[25px\] flex-col gap-\[5px\] md:w-\[22px\]/.test(nav))
  check("the current community is marked, for sight and for a screen reader", /aria-current=\{r\.current \? "page" : undefined\}/.test(nav) && /r\.current && "bg-\[#f4f5f7\] text-\[#6b7280\]"/.test(nav))
  check("the list is asked for while the page is idle and kept for the tab", /requestIdleCallback/.test(nav) && /sessionStorage\.setItem\(STORE_KEY/.test(nav) && /FRESH_MS = 15_000/.test(nav))
  check("no violet fill: it sits in a community too", !/bg-violet|#8b5cf6/.test(nav))
  check("the header forgets the list on log out", /forgetPlaces\(\)/.test(header))
}

console.log("\n6. The Storelib header")
{
  const left = header.slice(header.indexOf('data-header-left=""') - 200, header.indexOf('data-header-left=""') + 1400)
  check("the navigator sits left of the logo, at every width", /<PlaceNavigator\s+current=\{\{ kind: "storelib" \}\}/.test(left) && left.indexOf("<PlaceNavigator") < left.indexOf("<StorelibLogo"))
  check("it navigates the way the header does (canonical host, the phone app)", /onNavigate=\{\(e, href\) => onCanonicalNav\(e, href\)\}/.test(header))
  check("the bar's colours, from the chrome", /chrome\.navigator/.test(header) && /navigator: "text-\[#1a1a2e\] hover:bg-\[rgba\(16,18,27,0\.05\)\]/.test(chrome))
  check("the hamburger no longer browses categories", !/<CategoryBrowser\b|categoriesDropdownOpen|Open categories|data-categories-dropdown/.test(header))
  check("the phone row has no second hamburger of its own", !/aria-label=\{mobileMenuOpen \? "Close categories"/.test(header) && (header.match(/<PlaceNavigator\b/g) ?? []).length === 1)
  check("a little whiter: #fcfcfd, not #f7f8f9, in the bar and in its stand in", /bg-\[#fcfcfd\] backdrop-blur supports-\[backdrop-filter\]:bg-\[#fcfcfd\]\/98/.test(chrome) && !/f7f8f9/.test(chrome) && /bg-\[#fcfcfd\]/.test(conditional) && !/f7f8f9/.test(conditional))
  check("the search scrim is portalled to the body, so it covers the window and not the field", /createPortal\(\s*<div\s+aria-hidden\s+data-header-search-scrim=""/.test(header) && /from "react-dom"/.test(header))
  check("the field keeps a soft focus state: a darker hairline and a 4px halo, no ring", /focus:shadow-\[0_0_0_4px_rgba\(16,18,27,0\.05\)/.test(chrome) && /focus:shadow-\[0_0_0_4px_rgba\(255,255,255,0\.08\)\]/.test(chrome) && /focus-visible:ring-0 focus-visible:ring-offset-0/.test(header))
  check("Explore keeps its whole category list (its pills and More)", /<ExploreCategoryPicker\b/.test(readCode("components/explore/explore-page-client.tsx")))
}

console.log("\n7. Copy")
{
  /* Spelled in pieces, so this file does not carry the words it looks for. */
  const DASH = new RegExp("\\u2014")
  const BANNED = new RegExp(`\\b(${["un" + "lock", "ele" + "vate", "seam" + "less", "power" + "ful", "effort" + "less(ly)?", "super" + "charge", "trans" + "form"].join("|")})\\b`, "i")
  const files = [NAV, "lib/nav/places-shared.ts", "lib/nav/places-server.ts", "app/api/me/places/route.ts", "components/notifications/notification-bell.tsx"]
  for (const f of files) {
    const src = readSource(f)
    check(`${f}: no em dash and none of the banned words`, !DASH.test(src) && !BANNED.test(src.replace(/backface-visibility/g, "")))
  }
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
