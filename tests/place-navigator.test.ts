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
 * Round 6 (asks 1 and 3):
 *
 *    1. "On phones the hamburger goes back to the LEFT of the Storelib logo
 *       (as it was before). Desktop keeps it right of the logo."
 *    3. "Instead of a 'Your communities' heading, one recent list mixing the
 *       digital products/courses I interacted with and the communities I'm
 *       in, ordered by my last interaction (courses: last opened; products:
 *       last download or purchase; communities: last_seen_at /
 *       last_active_at), each with its cover/logo and a small kind hint;
 *       then a very light, small, subtle light-grey divider; then Discover
 *       communities, Explore, and Dashboard / Start creating at the bottom."
 *
 * The rules that are data (the order, the rows) are run directly; the rest
 * is read off the source. The rendered panel, the dropdown, the focused
 * search field and the bell are measured frame by frame in
 * scripts/check-place-navigator.mjs.
 */
import { readSource, readCode } from "./_source"
import { communityAppearance, withAppearance } from "@/lib/communities/appearance"
import {
  KIND_HINT,
  lastTouched,
  mergeRecent,
  navigatorModel,
  orderByLastVisit,
  parsePlaces,
  PLACES_URL,
  productHref,
  rankRecentProducts,
  RECENT_LIMIT,
  SIGNED_OUT_PLACES,
  type PlaceKind,
  type PlaceRecent,
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

const community = (id: string, slug = id): PlaceRecent => ({ kind: "community", id, slug, title: `Club ${id}`, imageUrl: null })
const thing = (id: string, kind: Exclude<PlaceKind, "community"> = "product"): PlaceRecent => ({ kind, id, slug: "", title: `Thing ${id}`, imageUrl: null })
const me = (over: Partial<PlacesResponse> = {}): PlacesResponse => ({
  signedIn: true,
  communitiesOn: true,
  isCreator: false,
  hasSellerAccess: false,
  recent: [community("a"), community("b"), community("c")],
  ...over,
})
const keys = (m: ReturnType<typeof navigatorModel>) => [
  ...m.recent.map((r) => `${r.item.kind === "community" ? "c" : r.item.kind === "course" ? "k" : "p"}:${r.item.id}${r.current ? "*" : ""}`),
  ...m.links.map((r) => r.key),
  ...m.actions.map((a) => `${a.key}:${a.href}`),
]

console.log("\n0. A community's look")
{
  check("missing is white", communityAppearance(null) === "light" && communityAppearance({}) === "light" && communityAppearance({ appearance: "nope" }) === "light")
  check("only dark is dark", communityAppearance({ appearance: "dark" }) === "dark")
  check("setting the look keeps the rest of the settings", withAppearance({ enabled: true, safety: { slowModeSeconds: 30 } }, "dark").appearance === "dark" && (withAppearance({ enabled: true, appearance: "dark" }, "light") as { appearance?: string }).appearance === undefined && (withAppearance({ enabled: true, appearance: "dark" }, "light") as { enabled?: boolean }).enabled === true)
}

console.log("\n1. Communities: the last touched first")
{
  const rows = [
    { community_id: "never", last_seen_at: null, last_active_at: null, joined_at: null },
    { community_id: "old-visit-new-post", last_seen_at: "2026-09-01T00:00:00Z", last_active_at: "2026-10-01T00:00:00Z", joined_at: "2026-01-01T00:00:00Z" },
    { community_id: "new-visit", last_seen_at: "2026-10-03T00:00:00Z", last_active_at: null, joined_at: "2026-01-01T00:00:00Z" },
    { community_id: "no-heartbeat-active", last_seen_at: null, last_active_at: "2026-10-02T00:00:00Z", joined_at: "2025-01-01T00:00:00Z" },
    { community_id: "no-heartbeat-joined", last_seen_at: null, last_active_at: null, joined_at: "2026-09-15T00:00:00Z" },
  ]
  const order = orderByLastVisit(rows).map((r) => r.community_id).join(",")
  check("the later of the last visit (last_seen_at) and the last activity (last_active_at) decides; with neither, the join; never-seen goes last", order === "new-visit,no-heartbeat-active,old-visit-new-post,no-heartbeat-joined,never", order)
  check("a community visited long ago but posted in yesterday counts from the post", lastTouched(rows[1]) === Date.parse("2026-10-01T00:00:00Z"))
  const before85 = orderByLastVisit([{ community_id: "x", last_active_at: "2026-01-01T00:00:00Z" }, { community_id: "y", last_active_at: "2026-02-01T00:00:00Z" }]).map((r) => r.community_id).join("")
  check("before part 85 (no last_seen_at at all) the last activity still orders them", before85 === "yx", before85)
  const ties = orderByLastVisit([{ community_id: "p" }, { community_id: "q" }, { community_id: "r" }]).map((r) => r.community_id).join("")
  check("ties keep the order they came in", ties === "pqr", ties)
}

console.log("\n2. What the panel lists")
{
  const buyer = keys(navigatorModel(me(), { kind: "community", id: "b" }))
  check("signed in: the recent list, Discover communities, Explore, Start creating (/sell)", buyer.join(" ") === "c:a c:b* c:c discover-communities explore start-creating:/sell", buyer)
  const seller = keys(navigatorModel(me({ hasSellerAccess: true, isCreator: true }), { kind: "storelib" }))
  check("a seller gets Dashboard (/app) instead, and nothing is current on Storelib's own pages", seller.join(" ") === "c:a c:b c:c discover-communities explore dashboard:/app", seller)
  const started = keys(navigatorModel(me({ isCreator: true, hasSellerAccess: false })))
  check("a creator who has not finished the setup is still sent to /sell", started.at(-1) === "start-creating:/sell", started)
  const guest = keys(navigatorModel(SIGNED_OUT_PLACES))
  /* Changed on purpose (round 33): signed out, the menu offers Log in and Sign up (/signup), not Start creating. */
  check("signed out with communities off: Explore, then Log in and Sign up", guest.join(" ") === "explore log-in:/login sign-up:/signup", guest)
  const guestOn = keys(navigatorModel({ ...SIGNED_OUT_PLACES, communitiesOn: true, recent: [community("leak"), thing("leak2")] }))
  check("signed out with communities on: Explore, Discover communities, Log in, Sign up, and never a recent row", guestOn.join(" ") === "explore discover-communities log-in:/login sign-up:/signup", guestOn)
  const off = keys(navigatorModel(me({ communitiesOn: false, recent: [thing("p1"), community("a")] })))
  check("communities switched off: no community rows and no Discover communities, my things stay", off.join(" ") === "p:p1 explore start-creating:/sell", off)
  const unsafe = keys(navigatorModel(me({ recent: [community("ok", "good-club"), community("bad", "../admin"), community("caps", "Club"), thing("ok-1"), thing("../admin"), thing("a/b")] })))
  check("a slug or an id that would not make a safe path is left out", unsafe.slice(0, 2).join() === "c:ok,p:ok-1" && !unsafe.some((k) => /bad|caps|admin|a\/b/.test(k)), unsafe)
  const m = navigatorModel(me(), { kind: "community", id: "a" })
  check("a community links to /community/<slug>, Discover communities to /explore?type=communities, Explore to /explore",
    m.recent[0].href === "/community/a" &&
    m.links.some((r) => r.key === "discover-communities" && r.href === "/explore?type=communities") &&
    m.links.some((r) => r.key === "explore" && r.href === "/explore"))
  /*
    CHANGED (nav feel round): a signed in person who does not sell no longer
    gets a solid black button for Start creating. "If the user is not a
    seller, add a button, very subtle... it should not look very AI. If the
    user is a creator and has joined, show Dashboard as it currently is." So
    theirs is `quiet` (drawn as a grey row), a seller's Dashboard is still
    the one primary button, and the signed out foot is untouched.
  */
  /* Changed on purpose (round 33): the signed out foot's primary is Sign up. */
  check("only the signed out foot has two buttons; the primary is Sign up or Dashboard", navigatorModel(SIGNED_OUT_PLACES).actions.filter((a) => a.primary).map((a) => a.key).join() === "sign-up" && m.actions.length === 1)
  check("a seller's Dashboard is the primary button; somebody who does not sell gets Start creating quietly instead",
    navigatorModel(me({ hasSellerAccess: true, isCreator: true })).actions.every((a) => a.key === "dashboard" && a.primary && !a.quiet)
      && m.actions.every((a) => a.key === "start-creating" && !a.primary && a.quiet === true)
      && navigatorModel(SIGNED_OUT_PLACES).actions.every((a) => !a.quiet))
}

console.log("\n2b. One recent list: courses, digital products and communities, the last touched first")
{
  const m = navigatorModel(me({ recent: [thing("k1", "course"), community("a"), thing("p1"), community("b")] }), { kind: "community", id: "b" })
  check("the answer's order is kept, kinds mixed, no section per kind", keys(m).slice(0, 4).join(" ") === "k:k1 c:a p:p1 c:b*", keys(m))
  check("a course opens its player, a digital product its page in the library, a community its page",
    m.recent[0].href === "/account/library/courses/k1" && m.recent[2].href === "/account/library/products/p1" && m.recent[1].href === "/community/a", m.recent.map((r) => r.href))
  check("each row carries a small word for what it is", m.recent.map((r) => r.hint).join() === "Course,Community,Digital product,Community" && KIND_HINT.course === "Course" && KIND_HINT.product === "Digital product" && KIND_HINT.community === "Community")
  check("productHref is the one rule for both kinds of thing", productHref({ kind: "product", id: "x" }) === "/account/library/products/x" && productHref({ kind: "course", id: "y" }) === "/account/library/courses/y")
  check("nothing: the list is empty (not drawn, nor the rule under it)", navigatorModel(me({ recent: [] })).recent.length === 0)
  const many = navigatorModel(me({ recent: Array.from({ length: 30 }, (_, i) => (i % 2 ? community(`c${i}`) : thing(`p${i}`))) }))
  check(`at most ${RECENT_LIMIT} rows, communities and things together`, RECENT_LIMIT === 5 && many.recent.length === 5, many.recent.length)

  const merged = mergeRecent(
    [{ item: thing("course-opened-today", "course"), at: Date.parse("2026-10-04T09:00:00Z") }, { item: thing("downloaded-tuesday"), at: Date.parse("2026-09-29T00:00:00Z") }],
    [{ item: community("visited-yesterday"), at: Date.parse("2026-10-03T00:00:00Z") }, { item: community("posted-last-month"), at: Date.parse("2026-09-01T00:00:00Z") }],
  ).map((r) => r.id).join(",")
  check("merged by the last touch, the newest first, whatever the kind", merged === "course-opened-today,visited-yesterday,downloaded-tuesday,posted-last-month", merged)
  const tie = mergeRecent([{ item: thing("t"), at: 5 }], [{ item: community("c"), at: 5 }]).map((r) => r.id).join()
  check("on a tie a thing from the library comes first, and the limit holds", tie === "t,c" && mergeRecent(Array.from({ length: 20 }, (_, i) => ({ item: thing(`p${i}`), at: i })), [], 4).length === 4)

  const owned = [
    { product_id: "old-buy", created_at: "2026-01-01T00:00:00Z" },
    { product_id: "new-buy", created_at: "2026-09-20T00:00:00Z" },
    { product_id: "course-a", created_at: "2026-02-01T00:00:00Z" },
    { product_id: "course-a", created_at: "2026-03-01T00:00:00Z" },
    { product_id: "file-b", created_at: "2026-04-01T00:00:00Z" },
    { product_id: null, created_at: "2026-10-01T00:00:00Z" },
  ]
  const used = [
    { product_id: "course-a", last_opened_at: "2026-10-03T00:00:00Z" },
    { product_id: "preview-only", last_opened_at: "2026-10-04T00:00:00Z" },
    /* A download of file-b, from download_events. */
    { product_id: "file-b", last_opened_at: "2026-09-25T00:00:00Z" },
  ]
  const ranked = rankRecentProducts(owned, used).map((r) => r.productId).join(",")
  check("a course by when its player was last opened, a digital product by its last download, either by its purchase when that is later", ranked === "course-a,file-b,new-buy,old-buy", ranked)
  check("a course opened but not owned (a free preview, the creator's own) never counts", !ranked.includes("preview-only"))
  check("each product once, at its latest moment", rankRecentProducts([{ product_id: "x", created_at: "2026-01-01T00:00:00Z" }, { product_id: "x", created_at: "2026-05-01T00:00:00Z" }, { product_id: "y", created_at: "2026-03-01T00:00:00Z" }], []).map((r) => r.productId).join() === "x,y")
  check("nothing bought: nothing listed", rankRecentProducts([], used).length === 0)
}

console.log("\n3. The answer is read defensively")
{
  check("anything that is not an object is the signed out answer", JSON.stringify(parsePlaces(null)) === JSON.stringify(SIGNED_OUT_PLACES) && JSON.stringify(parsePlaces("x")) === JSON.stringify(SIGNED_OUT_PLACES))
  const p = parsePlaces({ signedIn: true, communitiesOn: "yes", hasSellerAccess: 1, recent: [{ kind: "community", id: "a", slug: "a", title: "A", imageUrl: 5 }, { kind: "community", id: "b", title: "B" }, { kind: "membership", id: "m", title: "M" }, { kind: "course", id: "k", title: "K", imageUrl: "https://x/c.jpg" }, { kind: "product", id: "r", title: 4 }, { id: 1 }, null, "x"] })
  check("only true is true, and only whole rows of a known kind are kept (a community needs its slug)", p.signedIn && !p.communitiesOn && !p.hasSellerAccess && p.recent.map((r) => `${r.kind}:${r.id}:${r.imageUrl ? "pic" : "none"}`).join() === "community:a:none,course:k:pic", p)
  check(`at most ${RECENT_LIMIT}`, parsePlaces({ signedIn: true, recent: Array.from({ length: 40 }, (_, i) => community(`c${i}`)) }).recent.length === RECENT_LIMIT)
  const old = parsePlaces({ signedIn: true, communitiesOn: true, communities: [{ id: "c1", slug: "club", name: "Club", logoUrl: "https://x/l.png" }], products: [{ id: "p1", kind: "course", title: "T", coverUrl: null }] })
  check("an answer from before the one list (products, communities) still opens a full panel: things first", old.recent.map((r) => `${r.kind}:${r.id}:${r.title}`).join() === "course:p1:T,community:c1:Club" && old.recent[1].slug === "club" && old.recent[1].imageUrl === "https://x/l.png", old.recent)
  check("an answer without a list is an empty list; signed out has one too", parsePlaces({ signedIn: true }).recent.length === 0 && Array.isArray(SIGNED_OUT_PLACES.recent) && SIGNED_OUT_PLACES.recent.length === 0)
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
  check("the switch decides whether communities are listed at all", /communitiesEnabled\(\)/.test(server) && /switchOn\.then\(\(yes\) => \(yes \? readRecentCommunities\(db, userId\) : \[\]\)\)/.test(server))
  check("Dashboard follows the shared seller check", /readSellerAccess\(db, userId\)/.test(server) && /hasSellerAccess: access\.state === "seller"/.test(server))
  check("all four reads at once: the switch, the seller check, the library, and the communities as soon as the switch allows", /const switchOn = communitiesEnabled\(\)/.test(server) && /readRecentProducts\(db, userId\),\s*switchOn\.then\(\(yes\) => \(yes \? readRecentCommunities\(db, userId\) : \[\]\)\)/.test(server))
  check("one list, merged by the last touch", /recent: mergeRecent\(products, communities\)/.test(server) && /at: lastTouched\(m\)/.test(server))
  const recent = server.slice(server.indexOf("export async function readRecentProducts"), server.indexOf("export async function readPlaces"))
  check("the library side: only this person's own rows (entitlements, completed orders, course_enrollments), by the session's user id",
    /from\("entitlements"\)\.select\("id, product_id, created_at"\)\.eq\("buyer_id", userId\)/.test(recent) &&
    /from\("orders"\)\.select\("id, product_id, created_at"\)\.eq\("buyer_id", userId\)\.eq\("status", "completed"\)/.test(recent) &&
    /from\("course_enrollments"\)\.select\("product_id, last_opened_at"\)\.eq\("buyer_id", userId\)\.order\("last_opened_at", \{ ascending: false \}\)/.test(recent))
  check("a digital product's last download: only download_events of the entitlements and orders just read for this person, ids checked as uuids, newest first, bounded",
    /from\("download_events"\)\.select\("entitlement_id, order_id, created_at"\)\.or\(or\)\.order\("created_at", \{ ascending: false \}\)\.limit\(RECENT_SCAN\)/.test(recent) &&
    /`entitlement_id\.in\.\(\$\{\[\.\.\.byEnt\.keys\(\)\]\.join\(","\)\}\)`/.test(recent) && /`order_id\.in\.\(\$\{\[\.\.\.byOrder\.keys\(\)\]\.join\(","\)\}\)`/.test(recent) &&
    /filter\(\(e\) => UUID\.test\(e\.id\)/.test(recent) && /if \(!or\) return \[\]/.test(recent))
  check("and an index for that read (partial, newest first)", /CREATE INDEX IF NOT EXISTS idx_download_events_entitlement_recent ON public\.download_events \(entitlement_id, created_at DESC\) WHERE entitlement_id IS NOT NULL;/.test(readSource("supabase/sql/run-now/88_download_events_buyer_lookup.sql")) && /CREATE INDEX IF NOT EXISTS idx_download_events_order_recent ON public\.download_events \(order_id, created_at DESC\) WHERE order_id IS NOT NULL;/.test(readSource("supabase/sql/run-now/88_download_events_buyer_lookup.sql")) && readSource("supabase/sql/run-now/88_download_events_buyer_lookup.sql") === readSource("supabase/migrations/20261108_download_events_buyer_lookup.sql"))
  check("only digital products and courses, with their cover and title", /from\("products"\)\.select\("id, title, thumbnail_url, type"\)\.in\("id", candidates\)\.in\("type", \["digital", "course"\]\)/.test(recent) && /imageUrl: p\.thumbnail_url \|\| null/.test(recent))
  check("a course opened but not among the purchases read is checked against their purchases before it counts", /\.eq\("buyer_id", userId\)\.in\("product_id", unknown\)/.test(recent) && /rankRecentProducts\(\[\.\.\.owned, \.\.\.entAgain, \.\.\.orderAgain\], used\)/.test(recent))
  check("a table not there yet is an empty list, never an error", /async function rowsOf<T>/.test(server) && /if \(!missing\(error\)\) console\.error/.test(server) && /return \[\]/.test(server))
  check("the server only reads: nothing is written for the navigator", !/\.(insert|update|upsert|delete)\(|\.rpc\(/.test(server) && !/\.(insert|update|upsert|delete)\(|\.rpc\(/.test(route))
  check("bounded reads: a few dozen rows at most, eight things and twenty communities considered", /const RECENT_SCAN = 40/.test(server) && /\.limit\(RECENT_SCAN\)/.test(recent) && /if \(out\.length >= PRODUCTS_LIMIT\) break/.test(recent) && /if \(out\.length >= PLACES_LIMIT\) break/.test(server))
}

console.log("\n5. The component")
{
  check("a client component exporting PlaceNavigator({ current, className })", navSrc.startsWith('"use client"') && /export function PlaceNavigator\(\{ current, className, onNavigate \}: PlaceNavigatorProps\)/.test(nav) && /current\?: NavigatorCurrent/.test(nav) && /className\?: string/.test(nav))
  check("the current kinds are a community by id or Storelib", /export type NavigatorCurrent = \{ kind: "community"; id: string \} \| \{ kind: "storelib" \}/.test(shared))
  check("it imports nothing from the server", !/server-only|next\/headers|lib\/communities\/server|places-server|lib\/supabase\/(server|admin)|lib\/admin-blog-auth/.test(nav))
  check("a popover on a computer and the app's sheet on a phone, kept so a tap only slides it", /data-place-navigator-panel="popover"/.test(nav) && /<BottomSheet[\s\S]{0,200}hideFrom="md"[\s\S]{0,60}keepMounted=\{phone\}/.test(nav))
  /* Round 8: smoother. Nothing inherited (visibility, pointer-events) flips on the press, so the press restyles the panel alone; it keeps its layer. */
  check("in and out on the compositor, nothing inherited flipped on the press, still under reduced motion", /origin-top-left will-change-\[opacity,scale,translate\] motion-reduce:transition-none"/.test(nav) && /PANEL_OPEN =\s*"transition-\[opacity,scale,translate\] /.test(nav) && /PANEL_CLOSED = "transition-\[opacity,scale,translate\] opacity-0 /.test(nav) && !/PANEL_CLOSED = "[^"]*(invisible|pointer-events-none)/.test(nav) && /starting:opacity-0 starting:scale-\[0\.97\] starting:-translate-y-1/.test(nav))
  check("built once the page is idle and kept, so the click that opens it builds nothing", /if \(open && !built\) setBuilt\(true\)/.test(nav) && /const idle = \(\) => \{\s*void refresh\(\)\s*setBuilt\(true\)/.test(nav) && /\{!phone && built \? \(/.test(nav))
  check("closed, it is transparent, untouchable and unfocusable (inert), and inert changes after the first frame in and after the fade out", /inert=\{live \? undefined : true\}/.test(nav) && /PANEL_CLOSED = "[^"]*opacity-0/.test(nav) && /if \(open\) frame = requestAnimationFrame\(\(\) => \{ timer = window\.setTimeout\(\(\) => setLive\(true\), 0\) \}\)/.test(nav) && /else timer = window\.setTimeout\(\(\) => setLive\(false\), CLOSE_MS \+ 20\)/.test(nav) && /if \(open && live && !phone\) panelRef\.current\?\.focus\(\{ preventScroll: true \}\)/.test(nav))
  check("the body is not drawn again by an open or a close (memo, a stable model and handler)", /const NavigatorBody = memo\(function NavigatorBody/.test(nav) && /const model = useMemo\(/.test(nav) && /const go = useCallback\(/.test(nav))
  check("Explore and Discover communities carry Solar line icons, the nav's own family", /import \{ CompassIcon \} from "@solar-icons\/react\/linear\/compass"/.test(nav) && /import \{ UsersGroupRoundedIcon \} from "@solar-icons\/react\/linear\/users-group-rounded"/.test(nav) && /const LINK_ICON = \{ explore: CompassIcon, "discover-communities": UsersGroupRoundedIcon \}/.test(nav))
  check("a second click, a click outside, Escape and a new page close it", /if \(open\) return close\(\)/.test(nav) && /document\.addEventListener\("pointerdown", away, true\)/.test(nav) && /e\.key === "Escape"/.test(nav) && /useEffect\(\(\) => \{\s*setOpen\(false\)\s*\}, \[pathname\]\)/.test(nav))
  check("the button says what it does and whether it is open", /aria-label=\{open \? "Close menu" : "Open menu"\}/.test(nav) && /aria-expanded=\{open\}/.test(nav) && /aria-haspopup="dialog"/.test(nav))
  check("the three lines are a little bigger: 25px on a phone, 22px on a computer", /w-\[25px\] flex-col gap-\[5px\] md:w-\[22px\]/.test(nav))
  check("the current community is marked, for sight and for a screen reader", /aria-current=\{r\.current \? "page" : undefined\}/.test(nav) && /r\.current && CURRENT_ROW/.test(nav) && /const CURRENT_ROW =/.test(nav) && /aria-label="You are here"/.test(nav))
  check("the list is asked for while the page is idle and kept for the tab", /requestIdleCallback/.test(nav) && /sessionStorage\.setItem\(STORE_KEY/.test(nav) && /FRESH_MS = 15_000/.test(nav))
  check("no violet fill: it sits in a community too", !/bg-violet|#8b5cf6/.test(nav))
  check("one recent list with no heading: no Recently opened, no Your communities", /data-navigator-recent=""/.test(nav) && !/Recently opened|Your communities/.test(nav) && !/<p className=\{heading\}/.test(nav))
  check("each row: its cover or logo, its name, and a small grey word for its kind", /<AppAvatar src=\{r\.item\.imageUrl\} name=\{r\.item\.title\}/.test(nav) && /data-navigator-title="">\{r\.item\.title\}<\/span>/.test(nav) && /text-\[#9ca3af\]", phone \? "text-\[13px\]" : "text-\[12px\]"\)\} data-navigator-hint="">\{r\.hint\}<\/span>/.test(nav) && /data-navigator-kind=\{r\.item\.kind\}/.test(nav))
  check("then a faint, short, inset rule, only under a list", /\{loading \|\| hasRecent \? <div aria-hidden data-navigator-divider="" className=\{cn\("h-px shrink-0 bg-\[#f0f1f3\]", phone \? "mx-6 my-2" : "mx-4 my-1\.5"\)\} \/> : null\}/.test(nav))
  check("then Discover communities, Explore, and the action at the foot", nav.indexOf("data-navigator-divider") < nav.indexOf('data-navigator-links=""') && nav.indexOf('data-navigator-links=""') < nav.indexOf('data-navigator-quiet=""') && nav.indexOf('data-navigator-quiet=""') < nav.indexOf('data-navigator-actions=""'))
  check("a quiet action is a row under the ways out, in grey, with a Solar shop; the loud one is still the button", /data-navigator-quiet=""/.test(nav) && /className=\{cn\(row, "text-\[#6b7280\] hover:text-\[#1a1a2e\]"\)\}/.test(nav) && /<ShopIcon size=\{phone \? 21 : 19\} strokeWidth=\{1\.5\} \/>/.test(nav) && /from "@solar-icons\/react\/linear\/shop"/.test(nav) && /\{loud\.map\(\(a\) =>/.test(nav))
  check("nothing recent: neither a list nor a rule", /\) : hasRecent \? \(/.test(nav))
  check("the header forgets the list on log out", /forgetPlaces\(\)/.test(header))
}

console.log("\n6. The Storelib header")
{
  const left = header.slice(header.indexOf('data-header-left=""') - 200, header.indexOf('data-header-left=""') + 2400)
  const desk = left.indexOf("<StorelibLogo size={HEADER_LOGO.desktop}")
  const lines = left.indexOf("<PlaceNavigator")
  const phoneLogo = left.indexOf("<StorelibLogo size={HEADER_LOGO.phone}")
  /* Changed on purpose: 89c6f3ba (community header on account) hands the navigator the community a person came from, and Storelib otherwise. */
  check("a computer: the lines RIGHT of the logo; a phone: LEFT of it (the page's order, so focus follows the eye at both widths)", /<PlaceNavigator\s+current=\{navCurrent\}/.test(left) && /const navCurrent = ctx\.id \? \{ kind: "community" as const, id: ctx\.id \} : \{ kind: "storelib" as const \}/.test(header) && desk > 0 && phoneLogo > 0 && desk < lines && lines < phoneLogo && /className="shrink-0 hidden md:flex items-center gap-2" data-header-logo="desk"/.test(left) && /className="shrink-0 flex items-center gap-1\.5 md:hidden" data-header-logo="phone"/.test(left))
  /* Changed on purpose: 9e79d636 (profile bar hamburger) gave the profile bar the lines too, so every bar pulls the group into its padding. */
  check("on a phone the group is pulled into the bar's padding so the lines start at the edge, the profile bar too, which has the lines now", /cn\("flex shrink-0 items-center gap-1", "max-md:-ml-2 max-md:gap-0\.5"\)\} data-header-left=""/.test(left) && !/profileBar \? "max-md:gap-0"/.test(left))
  check("its touch slack runs left to the screen's edge on a phone, away from the logo", /before:-left-3 before:-top-2 before:-bottom-2 before:right-0 before:content-\[''\] md:before:content-none/.test(left))
  check("it navigates the way the header does (canonical host, the phone app)", /onNavigate=\{\(e, href\) => onCanonicalNav\(e, href\)\}/.test(header))
  check("the bar's colours, from the chrome", /chrome\.navigator/.test(header) && /navigator: "text-\[#1a1a2e\] hover:bg-\[rgba\(16,18,27,0\.05\)\]/.test(chrome))
  check("the hamburger no longer browses categories", !/<CategoryBrowser\b|categoriesDropdownOpen|Open categories|data-categories-dropdown/.test(header))
  check("the phone row has no second hamburger of its own", !/aria-label=\{mobileMenuOpen \? "Close categories"/.test(header) && (header.match(/<PlaceNavigator\b/g) ?? []).length === 1)
  /* ROUND 9: one surface with the status bar band: opaque white, no blur, no tint (the band is white too, app/globals.css --native-band). */
  check("the light bar is opaque white, not a translucent #fcfcfd over a blur, in the bar and in its stand in", /root: "platform-header-light z-40 w-full bg-white"/.test(chrome) && !/fcfcfd|f7f8f9/.test(chrome.replace(/\/\*[\s\S]*?\*\//g, "")) && /"sticky top-0 z-40 w-full bg-white"/.test(conditional) && !/f7f8f9|fcfcfd/.test(conditional))
  check("the search scrim is portalled to the body, so it covers the window and not the field", /createPortal\(\s*<div\s+aria-hidden\s+data-header-search-scrim=""/.test(header) && /from "react-dom"/.test(header))
  /* ROUND 6: the field is Explore's hero field now (lib/explore/search-field-look), on any bar; tests/explore-communities.test.ts holds the rest. */
  check("the field keeps a soft focus state: a darker hairline and a deeper shadow, no ring", /focus:border-neutral-300 focus:shadow-\[0_1px_3px_rgba\(15,23,42,0\.054\),0_11px_27px_-16px_rgba\(15,23,42,0\.36\)\]/.test(readCode("lib/explore/search-field-look.ts")) && /SEARCH_FIELD_FOCUS,/.test(header) && /focus-visible:ring-0 focus-visible:ring-offset-0/.test(header))
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
