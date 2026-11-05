/**
 * ===========================================================================
 *  COMMUNITIES ROUND 15: THE COMMUNITY SHELL
 * ===========================================================================
 *   ADDRESSES   placeHref and placeFromUrl both ways for every place, the
 *               owner's ?profile=, the phone's ?space=, the old /members/<id>
 *               and /classroom, and what is not a place
 *   SLOTS       All, every feed space and Saved are one slot; a chat space
 *               its own; the keep-alive limit counts slots
 *   WAIT        a waiting screen only for a place not in hand, past 250ms
 *   AHEAD       reading ahead: never on Save-Data or 2G, two at a time,
 *               nothing held and fresh asked again
 *   LOADER      one loader per place, used by the place's page and by the
 *               JSON place route
 *   RESUME      a failed read is tried once more, never a page load; a
 *               router refresh only once the network answers; code that
 *               failed to load is asked again, then the same address once in
 *               full, never in a loop
 *
 *   The frame by frame proof is scripts/check-community-shell15.mjs.
 *
 * Run with:  npm run test:push
 */
import { readCode } from "./_source"
import { placeFromKey, placeFromUrl, placeHref, placeKey, placeTab, slotKeyOf, slugFromPath, type Place } from "@/lib/communities/client/places"
import { AHEAD_AT_ONCE, forgetPlaces, keepAlive, KEEP_ALIVE, loadPlaceData, placeMissing, readAheadAllowed, readPlace, readPlacesAhead, retryable, seedPlace, waitScreenDue, WAIT_SCREEN_MS } from "@/lib/communities/client/place-cache"
import { chunkRecovery, hardNavigationAllowed, HARD_AGAIN_MS, loadingFailure, quietRouterRefresh } from "@/lib/communities/client/resume"
import { fullLoadFor, SKEW_SAFE_MS } from "@/lib/ui/new-deploy"

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
const same = (a: Place | null, b: Place | null) => JSON.stringify(a) === JSON.stringify(b)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function main() {
  console.log("ADDRESSES: every place, both ways")
  const S = "clay-studio"
  const every: [Place, string][] = [
    [{ kind: "feed" }, "/community/clay-studio"],
    [{ kind: "space", slug: "general" }, "/community/clay-studio/space/general"],
    [{ kind: "learn" }, "/community/clay-studio/learn"],
    [{ kind: "program", id: "trimming-feet" }, "/community/clay-studio/learn/trimming-feet"],
    [{ kind: "calendar" }, "/community/clay-studio/events"],
    [{ kind: "event", id: "0f9d2c1e-1111-4111-8111-111111111111" }, "/community/clay-studio/events/0f9d2c1e-1111-4111-8111-111111111111"],
    [{ kind: "members" }, "/community/clay-studio/members"],
    [{ kind: "leaderboard" }, "/community/clay-studio/leaderboard"],
    [{ kind: "about" }, "/community/clay-studio/about"],
    [{ kind: "profile", ref: "priya" }, "/community/clay-studio?profile=priya"],
    [{ kind: "profile", ref: "me" }, "/community/clay-studio?profile=me"],
    [{ kind: "saved" }, "/community/clay-studio/saved"],
    [{ kind: "notifications" }, "/community/clay-studio/notifications"],
    [{ kind: "membership" }, "/community/clay-studio/membership"],
  ]
  check("every kind of place is covered here", new Set(every.map(([p]) => p.kind)).size === 13)
  for (const [place, href] of every) {
    check(`${placeKey(place)}: placeHref is ${href}`, placeHref(S, place) === href, placeHref(S, place))
    const url = new URL(href, "https://storelib.com")
    check(`${placeKey(place)}: placeFromUrl reads it back`, same(placeFromUrl(url.pathname, url.search), place), placeFromUrl(url.pathname, url.search))
    check(`${placeKey(place)}: its key reads back too (the JSON route's ?p=)`, same(placeFromKey(placeKey(place)), place))
  }
  check("the owner's address: ?profile= on the home address", same(placeFromUrl("/community/clay-studio", "?profile=Priya"), { kind: "profile", ref: "priya" }))
  check("?profile=me is the member's own", same(placeFromUrl("/community/clay-studio", "profile=me"), { kind: "profile", ref: "me" }))
  check("the old /members/<id> still opens the profile", same(placeFromUrl("/community/clay-studio/members/0f9d2c1e-1111-4111-8111-111111111111", ""), { kind: "profile", ref: "0f9d2c1e-1111-4111-8111-111111111111" }))
  check("the phone's ?space= is the space", same(placeFromUrl("/community/clay-studio", "?space=General"), { kind: "space", slug: "general" }))
  check("Learn's old /classroom is Learn", same(placeFromUrl("/community/clay-studio/classroom", ""), { kind: "learn" }))
  check("a trailing slash changes nothing", same(placeFromUrl("/community/clay-studio/members/", ""), { kind: "members" }))
  check("?dm= on the home address is still the feed", same(placeFromUrl("/community/clay-studio", "?dm=abc"), { kind: "feed" }))
  check("a post is not a place (it opens itself)", placeFromUrl("/community/clay-studio/post/p1", "") === null)
  check("the join page, a share picture, deeper paths are not places", placeFromUrl("/community/clay-studio/join", "") === null && placeFromUrl("/community/clay-studio/events/e1/share.png", "") === null && placeFromUrl("/community/clay-studio/leaderboard/x", "") === null)
  check("another address is not a community place", placeFromUrl("/explore", "") === null && placeFromUrl("/u/priya", "") === null)
  check("a broken query never throws", same(placeFromUrl("/community/clay-studio", "?profile=%E0%A4%A"), { kind: "feed" }))
  check("anything but a slug in a space or a handle is refused", placeFromKey("space:../x") === null && placeFromKey("profile:a b") === null && placeFromKey("learn:x") === null && placeFromKey("nope") === null)
  check("slugFromPath reads the community", slugFromPath("/community/clay-studio/members") === "clay-studio" && slugFromPath("/explore") === null)
  check("the row's tab for a place", placeTab({ kind: "program", id: "x" }) === "classroom" && placeTab({ kind: "event", id: "x" }) === "events" && placeTab({ kind: "profile", ref: "me" }) === "home" && placeTab({ kind: "space", slug: "a" }) === "home")

  console.log("\nSLOTS")
  const chat = new Set(["lounge"])
  check("All, a feed space and Saved share the feed's slot", slotKeyOf({ kind: "feed" }) === "feed" && slotKeyOf({ kind: "space", slug: "general" }, chat) === "feed" && slotKeyOf({ kind: "saved" }) === "feed")
  check("a chat space is a slot of its own", slotKeyOf({ kind: "space", slug: "Lounge" }, chat) === "chat:lounge")
  check("without the chat list a space is the feed's (slotKeyOf(place) alone)", slotKeyOf({ kind: "space", slug: "lounge" }) === "feed")
  check("everything else by its kind and id", slotKeyOf({ kind: "program", id: "p1" }) === "program:p1" && slotKeyOf({ kind: "profile", ref: "Me" }) === "profile:me" && slotKeyOf({ kind: "members" }) === "members")
  check("four slots are kept", KEEP_ALIVE === 4)
  let order: string[] = []
  for (const k of ["feed", "members", "leaderboard", "calendar"]) order = keepAlive(order, k)
  check("four places visited: all four kept", order.join() === "feed,members,leaderboard,calendar", order)
  order = keepAlive(order, "about")
  check("a fifth lets the oldest go", order.join() === "members,leaderboard,calendar,about", order)
  order = keepAlive(order, "members")
  check("coming back to a kept one makes it the most recent, and lets nothing go", order.join() === "leaderboard,calendar,about,members", order)
  const host = code("components/community/member/place-host.tsx")
  check("the host keeps them under React's Activity, hidden, not unmounted", /<Activity key=\{key\} mode=\{visible \? "visible" : "hidden"\}>/.test(host))
  check("the routed page never takes a kept slot", /keepAlive\(o\.filter\(\(k\) => !routedOwns\(k\)\), activeKey\)/.test(host))
  check("which place the router drew is read from its DOM, not the address", /querySelector<HTMLElement>\("\[data-place-seed\]"\)/.test(host))

  console.log("\nWAIT: the waiting screen")
  check("not before 250ms", WAIT_SCREEN_MS === 250 && !waitScreenDue(false, 249) && waitScreenDue(false, 250))
  check("never for a place in hand, however long", !waitScreenDue(true, 0) && !waitScreenDue(true, 10_000))
  check("the host keeps the place being left until then", /setTimeout\(\(\) => setWaitedFor\(activeKey\), WAIT_SCREEN_MS\)/.test(host))
  check("and its spinner does not wait a second time", /<PlaceWaiting place=\{k\.place\} \/>/.test(host) && /delay = 0/.test(code("components/community/member/place-views.tsx")))

  console.log("\nAHEAD: reading places ahead")
  check("not on Save-Data", !readAheadAllowed({ saveData: true, effectiveType: "4g" }))
  check("not on 2G or slow 2G", !readAheadAllowed({ effectiveType: "2g" }) && !readAheadAllowed({ effectiveType: "slow-2g" }))
  check("on 3G, 4G, and where the browser says nothing", readAheadAllowed({ effectiveType: "3g" }) && readAheadAllowed({ effectiveType: "4g" }) && readAheadAllowed(null))
  check("two at a time", AHEAD_AT_ONCE === 2)
  const g = globalThis as unknown as { fetch: typeof fetch }
  const realFetch = g.fetch
  let inFlight = 0
  let most = 0
  const asked: string[] = []
  g.fetch = (async (input: string) => {
    const u = new URL(String(input), "https://storelib.com")
    const p = u.searchParams.get("p") || ""
    asked.push(p)
    inFlight++
    most = Math.max(most, inFlight)
    await sleep(15)
    inFlight--
    if (p === "leaderboard") return new Response(JSON.stringify({ ok: false, error: "off" }), { status: 404 })
    return new Response(JSON.stringify({ ok: true, key: p, data: { kind: p } }), { status: 200 })
  }) as typeof fetch
  forgetPlaces()
  seedPlace("c1", { kind: "feed" }, { kind: "feed" } as never)
  const read = await readPlacesAhead("c1", [{ kind: "feed" }, { kind: "learn" }, { kind: "calendar" }, { kind: "members" }, { kind: "leaderboard" }, { kind: "about" }], () => false, { effectiveType: "4g" })
  check("the held, fresh feed is not asked again", !asked.includes("feed"), asked)
  check("the others are, never more than two at once", asked.length === 5 && most === 2, { asked, most })
  check("what arrived is held", read === 4 && !!readPlace("c1", { kind: "members" }) && !!readPlace("c1", "about"))
  check("a place the server says is not there is remembered as such", placeMissing("c1", { kind: "leaderboard" }))
  asked.length = 0
  await readPlacesAhead("c1", [{ kind: "members" }], () => false, { saveData: true })
  check("Save-Data asks for nothing", asked.length === 0)

  console.log("\nLOADER: one per place, for the page and the route")
  const places = code("lib/communities/server/places.ts")
  const route = code("app/api/community/[communityId]/place/route.ts")
  const page = code("components/community/member/place-page.tsx")
  check("the JSON place route reads the one loader, members only", /requireMember\(db, communityId, await sessionUserId\(\), "view"\)/.test(route) && /await loadPlace\(db, gate\.community, gate\.viewer, place,/.test(route))
  check("a place's page reads the same loader and only seeds the shell", /await loadPlace\(admin\(\), page\.community, page\.viewer, place, \{ lesson \}\)/.test(page) && /<PlaceSeed /.test(page))
  for (const [file, kind] of [
    ["app/(storelib)/(marketing)/community/[slug]/(member)/learn/page.tsx", "learn"],
    ["app/(storelib)/(marketing)/community/[slug]/(member)/events/page.tsx", "calendar"],
    ["app/(storelib)/(marketing)/community/[slug]/(member)/members/page.tsx", "members"],
    ["app/(storelib)/(marketing)/community/[slug]/(member)/leaderboard/page.tsx", "leaderboard"],
    ["app/(storelib)/(marketing)/community/[slug]/(member)/notifications/page.tsx", "notifications"],
    ["app/(storelib)/(marketing)/community/[slug]/(member)/saved/page.tsx", "saved"],
    ["app/(storelib)/(marketing)/community/[slug]/(member)/membership/page.tsx", "membership"],
  ] as const) {
    check(`${kind}'s page is PlacePage and nothing else`, new RegExp(`<PlacePage slug=\\{slug\\} place=\\{\\{ kind: "${kind}" \\}\\} />`).test(code(file)))
  }
  check("a space's page, a program's and an event's seed the shell too", /place=\{\{ kind: "space"/.test(code("app/(storelib)/(marketing)/community/[slug]/(member)/space/[space]/page.tsx")) && /place=\{\{ kind: "program"/.test(code("app/(storelib)/(marketing)/community/[slug]/(member)/learn/[programId]/page.tsx")) && /place=\{\{ kind: "event"/.test(code("app/(storelib)/(marketing)/community/[slug]/(member)/events/[eventId]/page.tsx")))
  /* Changed on purpose (round 39): in memberHome, whichever way the member was found. */
  check("the home address seeds the place it names (feed, ?profile=, ?space=)", /placeFromUrl\(home, search\.toString\(\)\)/.test(code("app/(storelib)/(marketing)/community/[slug]/page.tsx")) && /const home = `\/community\/\$\{communitySlug\}`/.test(code("app/(storelib)/(marketing)/community/[slug]/page.tsx")))
  check("About, for a member, is a place in the shell", /<PlacePage slug=\{load\.community\.slug\} place=\{\{ kind: "about" \}\} \/>/.test(code("app/(storelib)/(marketing)/community/[slug]/about/page.tsx")))
  check("the old /members/<id> goes to ?profile=<handle>, inside the community", /redirect\(ref \? placeHref\(page\.community\.slug, \{ kind: "profile", ref \}\)/.test(code("app/(storelib)/(marketing)/community/[slug]/(member)/members/[userId]/page.tsx")))
  check("the loader covers every kind of place", ["feed", "saved", "space", "learn", "program", "calendar", "event", "members", "leaderboard", "about", "notifications", "membership", "profile"].every((k) => places.includes(`case "${k}":`)))
  check("a switched off place is a 404, never another community's row", /if \(!community\.classroom_enabled\) return off/.test(places) && /if \(!community\.events_enabled\) return off/.test(places) && /if \(!community\.gamification_enabled\) return off/.test(places))
  check("a phone opening /space/<x> takes ?space=<x> in place, never a page load", /window\.history\.replaceState\(window\.history\.state, "", href\)/.test(host) && !/location\.replace/.test(host))

  console.log("\nRESUME: never a page load to fix a moment without network")
  check("a network failure is worth one more try", retryable(new TypeError("Failed to fetch")) && retryable({ message: "Load failed" }) && !retryable(new Error("Bad JSON")))
  let calls = 0
  g.fetch = (async () => {
    calls++
    if (calls === 1) throw new TypeError("Load failed")
    return new Response(JSON.stringify({ ok: true, key: "about", data: { kind: "about" } }), { status: 200 })
  }) as typeof fetch
  forgetPlaces()
  const got = await loadPlaceData("c2", { kind: "about" })
  check("a read that fails as the phone wakes is tried once more, and arrives", calls === 2 && !!got, calls)
  calls = 0
  g.fetch = (async () => {
    calls++
    throw new TypeError("Load failed")
  }) as typeof fetch
  const none = await loadPlaceData("c2", { kind: "members" })
  check("twice failed: the place says so (null), and nothing else happens", none === null && calls === 2)
  /* A refresh only once the network answers. */
  const listeners: Record<string, (() => void)[]> = {}
  ;(globalThis as unknown as { window: unknown }).window = { addEventListener: (t: string, f: () => void) => (listeners[t] ||= []).push(f), removeEventListener: () => {} }
  let refreshed = 0
  g.fetch = (async () => {
    throw new TypeError("Failed to fetch")
  }) as typeof fetch
  quietRouterRefresh({ refresh: () => refreshed++ })
  await sleep(30)
  check("no network: no router refresh (a failed one is a whole page load)", refreshed === 0)
  check("it waits for the browser to say it is online", (listeners.online || []).length === 1)
  g.fetch = (async () => new Response("{}", { status: 200 })) as typeof fetch
  listeners.online[0]()
  await sleep(30)
  check("and refreshes once the network answers", refreshed === 1)
  delete (globalThis as unknown as { window?: unknown }).window
  g.fetch = realFetch
  const frame = code("components/community/member/shell-frame.tsx")
  check("the frame never calls router.refresh() directly any more", !/router\.refresh\(\)/.test(frame) && /quietRouterRefresh\(router\)/.test(frame))
  check("code that failed to load: once more", chunkRecovery({ name: "ChunkLoadError", message: "Loading chunk 12 failed" }, 0) === "retry")
  check("then the same address once in full", chunkRecovery({ message: "Failed to load chunk /_next/static/chunks/x.js" }, 1) === "hard")
  check("any other error is not hidden", chunkRecovery(new Error("x is undefined"), 0) === "throw" && !loadingFailure(new Error("x")))
  const store = new Map<string, string>()
  const s = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) }
  check("the hard navigation runs once", hardNavigationAllowed(s, 1_000_000) && !hardNavigationAllowed(s, 1_000_000 + HARD_AGAIN_MS - 1))
  check("never in a loop, and again after a while", hardNavigationAllowed(s, 1_000_000 + HARD_AGAIN_MS + 1))
  check("no storage: no hard navigation (it could not know it already tried)", !hardNavigationAllowed(null))
  check("a failure inside a place stays inside the frame (an error boundary per kept screen, an error.tsx for the community)", /class PlaceBoundary extends Component/.test(host) && /export default function CommunityPlaceError/.test(code("app/(storelib)/(marketing)/community/[slug]/error.tsx")))
  const behind = { from: "https://storelib.com/community/clay", href: "/explore", type: "push" as const, newDeploy: true, holdsWork: false }
  check("a tab that knows of a newer deploy does not throw itself away while skew protection serves it", fullLoadFor({ ...behind, tabAgeMs: 30 * 60_000 }) === null)
  check("past the window it still loads the new code at a route change", fullLoadFor({ ...behind, tabAgeMs: SKEW_SAFE_MS + 1 }) === "assign")
  check("the browser passes the tab's age", /tabAgeMs: typeof performance !== "undefined" && performance\.timeOrigin \? Date\.now\(\) - performance\.timeOrigin : undefined/.test(code("lib/ui/new-deploy.ts")))
  const nav = code("lib/communities/client/navigator-context.tsx")
  check("back() is the app's watched back", /backThen\(\(\) => go\(\{ kind: "feed" \}, \{ replace: true \}\)\)/.test(nav))
  check("go() moves with pushState and never asks the router", /window\.history\.pushState\(/.test(nav) && !/router\.(push|replace)\(/.test(nav))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
