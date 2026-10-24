/**
 * ===========================================================================
 *  THE PHONE'S MENUS KNOW WHO IS SIGNED IN, AND ARE NEVER EMPTY (round AC3)
 * ===========================================================================
 * The owner: "when I go to Explore and open the hamburger icon, sometimes it
 * just doesn't display things. Ensure the mobile bottom sheets and the
 * hamburger menus know when I'm logged in or logged out, so there are no
 * issues not showing or fetching information."
 *
 * The navigator's list (lib/nav/places-client.ts) is run here against a
 * stubbed window, storage and fetch: an answer is only shown for the person
 * it was asked for, a sign in or out anywhere asks again, a failed ask falls
 * back to the record of the session and is asked again on its own. The
 * header's own following of the record is pinned in its source.
 * scripts/check-header-auth-menus.mjs opens the real sheets thirty times in
 * a browser.
 */
import { readCode } from "./_source"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail)?.slice(0, 400)}`}`)
  }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const local = new Map<string, string>()
  const session = new Map<string, string>()
  const storage = (m: Map<string, string>) => ({ getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) })
  const g = globalThis as unknown as Record<string, unknown>
  const win = new EventTarget() as EventTarget & Record<string, unknown>
  win.sessionStorage = storage(session)
  g.window = win
  g.localStorage = storage(local)

  /* The route, as the cookie has it: who is signed in now, and whether it answers. */
  let cookie: "guest" | "u1" | "u2" = "guest"
  let mode: "ok" | "fail" | "offline" = "ok"
  let asked = 0
  g.fetch = async () => {
    asked++
    if (mode === "offline") throw new TypeError("Failed to fetch")
    if (mode === "fail") return new Response("{}", { status: 500 })
    const body = cookie === "guest"
      ? { signedIn: false, communitiesOn: true, isCreator: false, hasSellerAccess: false, recent: [] }
      : { signedIn: true, communitiesOn: true, isCreator: false, hasSellerAccess: cookie === "u2", recent: [{ kind: "course", id: `k-${cookie}`, title: `Course of ${cookie}`, imageUrl: null, slug: "" }] }
    return new Response(JSON.stringify(body), { status: 200 })
  }

  const { writeAuthSnapshot, clearAuthSnapshot } = await import("@/lib/auth/auth-snapshot")
  const store = await import("@/lib/nav/places-client")
  const { navigatorModel } = await import("@/lib/nav/places-shared")
  const signIn = (id: "u1" | "u2", isSeller = false) => {
    cookie = id
    writeAuthSnapshot({ signedIn: true, userId: id, avatarUrl: null, displayName: null, username: null, isSeller })
  }
  const signOut = () => {
    cookie = "guest"
    clearAuthSnapshot()
  }
  let heard = 0
  const stop = store.subscribePlaces(() => heard++)
  const actions = () => {
    const v = store.readPlacesView()
    return navigatorModel(v.places ?? v.fallback).actions.map((a) => a.key)
  }

  console.log("\nA visitor")
  {
    let v = store.readPlacesView()
    check("before anything is known, the panel already has its ways in (Log in, Sign up)", actions().join() === "log-in,sign-up", actions())
    await store.refresh()
    v = store.readPlacesView()
    check("the answer arrives and is shown", v.places?.signedIn === false && !v.loading, v)
    check("  and kept for the tab, with who it was for", JSON.parse(session.get(store.STORE_KEY) ?? "{}").who === null)
  }

  console.log("\nSigned in, in this tab or another")
  {
    const before = asked
    signIn("u1")
    await sleep(10)
    let v = store.readPlacesView()
    check("the visitor's answer is not shown to the person who signed in", v.places === null || v.places.signedIn === true, v.places)
    check("  it is asked for again at once, while a navigator is on the page", asked === before + 1, { asked, before })
    check("  meanwhile the panel is theirs (Start creating), never Log in", actions().join() === "start-creating", actions())
    await sleep(20)
    v = store.readPlacesView()
    check("  then their own list", v.places?.signedIn === true && v.places.recent[0]?.id === "k-u1", v.places)
    const was = asked
    writeAuthSnapshot({ signedIn: true, userId: "u1", avatarUrl: "x", displayName: "Ava", username: "ava", isSeller: false })
    await sleep(10)
    check("the header writing the same person again asks nothing", asked === was, { asked, was })
  }

  console.log("\nSomebody else, then signed out")
  {
    signIn("u2", true)
    await sleep(30)
    let v = store.readPlacesView()
    check("another account in another tab: their list, not the last person's", v.places?.recent[0]?.id === "k-u2", v.places)
    check("  and their Dashboard", actions().join() === "dashboard", actions())
    signOut()
    await sleep(30)
    v = store.readPlacesView()
    check("signed out: nobody's courses are left in it", !v.places || v.places.recent.length === 0, v.places)
    check("  the panel offers Log in and Sign up again", actions().join() === "log-in,sign-up", actions())
    check("  with no stand in row (a visitor has no list to wait for)", v.loading === false, v)
  }

  console.log("\nThe list fails")
  {
    mode = "fail"
    signIn("u1")
    await sleep(30)
    let v = store.readPlacesView()
    check("a failed ask: the panel is drawn from the record (Start creating), no stand in row left waiting", v.status === "failed" && !v.loading && actions().join() === "start-creating", { v, a: actions() })
    mode = "ok"
    await sleep(1_200)
    v = store.readPlacesView()
    check("  asked again on its own a moment later, and the list arrives", v.places?.recent[0]?.id === "k-u1" && v.status === "idle", v)
    mode = "offline"
    store.forgetPlaces()
    await store.refresh()
    v = store.readPlacesView()
    check("offline (the request throws): the same, never a throw", v.status === "failed" && actions().join() === "start-creating", v)
    mode = "ok"
  }

  console.log("\nAn answer for somebody who is no longer signed in arrives late")
  {
    store.forgetPlaces()
    signIn("u1")
    /* Each request answers for whoever the cookie named when it was made, when the test lets it. */
    const releases: (() => void)[] = []
    g.fetch = () => {
      const signedIn = cookie !== "guest"
      const body = { signedIn, communitiesOn: false, isCreator: false, hasSellerAccess: false, recent: signedIn ? [{ kind: "course", id: "k-u1", title: "u1", imageUrl: null, slug: "" }] : [] }
      return new Promise<Response>((r) => releases.push(() => r(new Response(JSON.stringify(body), { status: 200 }))))
    }
    const pending = store.refresh(true)
    signOut()
    /* The signed in person's answer lands last. */
    for (const r of releases.slice(1)) r()
    releases[0]()
    await pending
    await sleep(10)
    const v = store.readPlacesView()
    check("the late answer is dropped: nothing of theirs after the sign out", !v.places?.recent.length, v.places)
  }

  stop()
  check("the record is heard through the subscription", heard > 0, heard)

  console.log("\nThe source")
  const nav = readCode("components/nav/place-navigator.tsx")
  const header = readCode("components/platform/platform-header-client.tsx")
  const client = readCode("lib/nav/places-client.ts")
  check("the navigator reads the one store, and draws the record while the list is not here", /useSyncExternalStore\(subscribePlaces, readPlacesView, readPlacesViewOnServer\)/.test(nav) && /navigatorModel\(places \?\? fallback,/.test(nav) && /loading=\{loading\} go=\{go\} phone \/>/.test(nav) && !/SIGNED_OUT_PLACES/.test(nav))
  check("the store follows the header's record, keeps who each answer was for, and gives up on a request after a limit", /subscribeAuthSnapshot\(onAuthChange\)/.test(client) && /held = \{ at: Date\.now\(\), who, places \}/.test(client) && /setTimeout\(\(\) => ctrl\?\.abort\(\), REQUEST_TIMEOUT_MS\)/.test(client) && /RETRY_MS = \[1_000, 3_000, 8_000\]/.test(client))
  check("the header reads again when the record names somebody else", /const stopSnapshot = subscribeAuthSnapshot\(\(\) => \{/.test(header) && /if \(recorded === was\) return was/.test(header) && /stopSnapshot\(\)/.test(header))
  check("the marketing sheet waits in grey only while the session is being read, never shows a visitor's buttons to somebody signed in", /\{!user && loading \? \(/.test(header) && /data-menu-loading=""/.test(header))
  check("an account sheet closes when nobody is signed in any more", /if \(signedIn\) return\s*setMobileProfileOpen\(false\)\s*setCommunityAccountOpen\(false\)/.test(header))

  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
