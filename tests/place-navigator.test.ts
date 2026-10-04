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
 * Round 4 (asks 7 and 9):
 *
 *    7. "The hamburger sits to the RIGHT of the Storelib logo (not left) in
 *       the Storelib header, and to the RIGHT of the community avatar + title
 *       in the community header."
 *    9. "The navigator panel is not only communities: also 'Recently opened'
 *       digital products and courses I own (from my library: last opened /
 *       recently bought, max ~5 with cover and title, linking to their
 *       library page or course player), then my communities, then Discover
 *       communities, Explore, Start creating / Dashboard. GET /api/me/places
 *       adds `products`."
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
  PRODUCTS_LIMIT,
  productHref,
  rankRecentProducts,
  SIGNED_OUT_PLACES,
  type PlaceProduct,
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
  products: [],
  ...over,
})
const product = (id: string, kind: PlaceProduct["kind"] = "product"): PlaceProduct => ({ id, kind, title: `Thing ${id}`, coverUrl: null })
const keys = (m: ReturnType<typeof navigatorModel>) => [
  ...m.products.map((r) => (r.kind === "product" ? `p:${r.product.id}` : "")),
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
  check("rows link to /community/<slug>, Discover communities to /explore?type=communities (Explore in communities mode), Explore to /explore",
    m.communities[0].kind === "community" && m.communities[0].href === "/community/a" &&
    m.links.some((r) => r.kind === "link" && r.key === "discover-communities" && r.href === "/explore?type=communities") &&
    m.links.some((r) => r.kind === "link" && r.key === "explore" && r.href === "/explore"))
  check("only the signed out foot has two buttons; the primary is Start creating or Dashboard", navigatorModel(SIGNED_OUT_PLACES).actions.filter((a) => a.primary).map((a) => a.key).join() === "start-creating" && m.actions.length === 1 && m.actions[0].primary)
}

console.log("\n2b. Recently opened: my own digital products and courses, first")
{
  const withThings = me({ products: [product("p1"), product("k1", "course")] })
  const order = keys(navigatorModel(withThings, { kind: "storelib" }))
  check("Recently opened comes before my communities, then the links and the action", order.join(" ") === "p:p1 p:k1 c:a c:b c:c discover-communities explore start-creating:/sell", order)
  const m = navigatorModel(withThings)
  check("a product opens its page in the library, a course its player",
    m.products[0].kind === "product" && m.products[0].href === "/account/library/products/p1" &&
    m.products[1].kind === "product" && m.products[1].href === "/account/library/courses/k1", m.products.map((r) => (r.kind === "product" ? r.href : "")))
  check("productHref is the one rule for both", productHref({ kind: "product", id: "x" }) === "/account/library/products/x" && productHref({ kind: "course", id: "y" }) === "/account/library/courses/y")
  check("none: the section is not drawn at all (an empty list, not an empty heading)", navigatorModel(me()).products.length === 0)
  const many = navigatorModel(me({ products: Array.from({ length: 9 }, (_, i) => product(`p${i}`)) }))
  check(`at most ${PRODUCTS_LIMIT}`, PRODUCTS_LIMIT === 5 && many.products.length === 5, many.products.length)
  check("not behind the communities switch: off, my things are still there", navigatorModel(me({ communitiesOn: false, products: [product("p1")] })).products.length === 1)
  check("signed out: never a product row, whatever the answer says", navigatorModel({ ...SIGNED_OUT_PLACES, products: [product("leak")] }).products.length === 0)
  check("an id that would not make a safe path is left out", keys(navigatorModel(me({ products: [product("ok-1"), product("../admin"), product("a/b")] }))).filter((k) => k.startsWith("p:")).join() === "p:ok-1")

  const owned = [
    { product_id: "old-buy", created_at: "2026-01-01T00:00:00Z" },
    { product_id: "new-buy", created_at: "2026-09-20T00:00:00Z" },
    { product_id: "course-a", created_at: "2026-02-01T00:00:00Z" },
    { product_id: "course-a", created_at: "2026-03-01T00:00:00Z" },
    { product_id: null, created_at: "2026-10-01T00:00:00Z" },
  ]
  const opened = [
    { product_id: "course-a", last_opened_at: "2026-10-03T00:00:00Z" },
    { product_id: "preview-only", last_opened_at: "2026-10-04T00:00:00Z" },
  ]
  const ranked = rankRecentProducts(owned, opened).map((r) => r.productId).join(",")
  check("newest first: a course by when its player was last opened, anything else by when it was bought", ranked === "course-a,new-buy,old-buy", ranked)
  check("a course opened but not owned (a free preview, the creator's own) never counts", !ranked.includes("preview-only"))
  check("each product once, at its latest moment", rankRecentProducts([{ product_id: "x", created_at: "2026-01-01T00:00:00Z" }, { product_id: "x", created_at: "2026-05-01T00:00:00Z" }, { product_id: "y", created_at: "2026-03-01T00:00:00Z" }], []).map((r) => r.productId).join() === "x,y")
  check("nothing bought: nothing listed", rankRecentProducts([], opened).length === 0)
}

console.log("\n3. The answer is read defensively")
{
  check("anything that is not an object is the signed out answer", JSON.stringify(parsePlaces(null)) === JSON.stringify(SIGNED_OUT_PLACES) && JSON.stringify(parsePlaces("x")) === JSON.stringify(SIGNED_OUT_PLACES))
  const p = parsePlaces({ signedIn: true, communitiesOn: "yes", hasSellerAccess: 1, communities: [{ id: "a", slug: "a", name: "A", logoUrl: 5 }, { id: 1 }, null, "x"] })
  check("only true is true, and only whole rows are kept", p.signedIn && !p.communitiesOn && !p.hasSellerAccess && p.communities.length === 1 && p.communities[0].logoUrl === null, p)
  check("at most twenty", parsePlaces({ signedIn: true, communities: Array.from({ length: 40 }, (_, i) => community(`c${i}`)) }).communities.length === 20)
  const things = parsePlaces({ signedIn: true, products: [{ id: "p", kind: "course", title: "T", coverUrl: "https://x/c.jpg" }, { id: "q", kind: "membership", title: "M" }, { id: "r", kind: "product", title: 4 }, { id: "s", kind: "product", title: "S", coverUrl: 9 }, null] })
  check("products: only whole rows of a known kind, a cover only when it is a string", things.products.map((p) => `${p.id}:${p.kind}:${p.coverUrl ? "cover" : "none"}`).join() === "p:course:cover,s:product:none", things.products)
  check("products: an answer without them is an empty list, and at most five", parsePlaces({ signedIn: true }).products.length === 0 && parsePlaces({ signedIn: true, products: Array.from({ length: 12 }, (_, i) => product(`p${i}`)) }).products.length === 5)
  check("signed out has an empty products list too", Array.isArray(SIGNED_OUT_PLACES.products) && SIGNED_OUT_PLACES.products.length === 0)
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
  check("products are read beside the rest, not after it", /const \[on, access, products\] = await Promise\.all\(\[communitiesEnabled\(\), readSellerAccess\(db, userId\), readRecentProducts\(db, userId\)\]\)/.test(server) && /communities,\s*products,\s*\}/.test(server))
  const recent = server.slice(server.indexOf("export async function readRecentProducts"), server.indexOf("export async function readPlaces"))
  check("recently opened: only this person's own rows (entitlements, completed orders, course_enrollments), by the session's user id",
    /from\("entitlements"\)\.select\("product_id, created_at"\)\.eq\("buyer_id", userId\)/.test(recent) &&
    /from\("orders"\)\.select\("product_id, created_at"\)\.eq\("buyer_id", userId\)\.eq\("status", "completed"\)/.test(recent) &&
    /from\("course_enrollments"\)\.select\("product_id, last_opened_at"\)\.eq\("buyer_id", userId\)\.order\("last_opened_at", \{ ascending: false \}\)/.test(recent))
  check("only digital products and courses, with their cover and title", /from\("products"\)\.select\("id, title, thumbnail_url, type"\)\.in\("id", candidates\)\.in\("type", \["digital", "course"\]\)/.test(recent) && /coverUrl: p\.thumbnail_url \|\| null/.test(recent))
  check("a course opened but not among the purchases read is checked against their purchases before it counts", /\.eq\("buyer_id", userId\)\.in\("product_id", unknown\)/.test(recent) && /rankRecentProducts\(\[\.\.\.owned, \.\.\.entAgain, \.\.\.orderAgain\], opened\)/.test(recent))
  check("a table not there yet is an empty list, never an error", /async function rowsOf<T>/.test(server) && /if \(!missing\(error\)\) console\.error/.test(server) && /return \[\]/.test(server))
  check("the server only reads: nothing is written for the navigator", !/\.(insert|update|upsert|delete)\(|\.rpc\(/.test(server) && !/\.(insert|update|upsert|delete)\(|\.rpc\(/.test(route))
  check("bounded reads: a few dozen rows at most, five kept", /const RECENT_SCAN = 40/.test(server) && /\.limit\(RECENT_SCAN\)/.test(recent) && /if \(out\.length >= PRODUCTS_LIMIT\) break/.test(recent))
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
  check("Recently opened is drawn first, then Your communities, in one scrolling part", /data-navigator-lists=""/.test(nav) && nav.indexOf("Recently opened") > 0 && nav.indexOf("Recently opened") < nav.indexOf("Your communities") && nav.indexOf("data-navigator-products") < nav.indexOf("data-navigator-communities"))
  check("each thing: its cover and its title, linking where productHref says", /data-navigator-product=\{r\.product\.kind\}/.test(nav) && /<AppAvatar src=\{r\.product\.coverUrl\} name=\{r\.product\.title\}/.test(nav) && /\{r\.product\.title\}<\/span>/.test(nav))
  check("no things, no section: neither a heading nor an empty box", /\{model\.products\.length \? \(\s*<div data-navigator-products="">/.test(nav))
  check("the header forgets the list on log out", /forgetPlaces\(\)/.test(header))
}

console.log("\n6. The Storelib header")
{
  const left = header.slice(header.indexOf('data-header-left=""') - 200, header.indexOf('data-header-left=""') + 2000)
  check("the navigator sits RIGHT of the logo, at every width (the phone's logo and the computer's are both before it)", /<PlaceNavigator\s+current=\{\{ kind: "storelib" \}\}/.test(left) && left.indexOf("<StorelibLogo size={HEADER_LOGO.phone}") > 0 && left.indexOf("<StorelibLogo size={HEADER_LOGO.desktop}") > 0 && left.lastIndexOf("<StorelibLogo") < left.indexOf("<PlaceNavigator"))
  check("its touch slack runs right, away from the logo", /before:-right-3 before:-top-2 before:-bottom-2 before:left-0/.test(left))
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
