/**
 * ===========================================================================
 *  ROUND 39: FILES KEEPS WHAT IS USED, A MISSING PICTURE IS A GREY BOX, AND
 *  CONNECT OPENS IN THE APP'S IN-APP BROWSER SHEET
 * ===========================================================================
 * 1. Files (lib/files/keep.ts): deleting a file a product, a page or anything
 *    else still shows takes it out of Files and keeps it in storage; only a
 *    file nothing uses is removed; on a doubt, kept; before part 280, kept
 *    in Files and said so. Part 280's SQL conventions.
 * 2. Missing pictures (lib/media/missing-image.ts): the guard swaps a failed
 *    or empty <img> for the camera in place and gives it back when a working
 *    address comes; every imported theme's page gets it in its head; the
 *    app mounts it once; Storelib's own rows use the box. The probe
 *    (scripts/check-missing-image.mjs) measures it in Chromium.
 * 3. Connect in the app (lib/native-connect.ts, lib/connect/app-return.ts):
 *    the connect routes answer the app with JSON and a state that says so,
 *    the callbacks hand themselves back to the app from the sheet and finish
 *    in the web view with every check, only those two callbacks are ever
 *    handed back, and the web is unchanged.
 *
 * Run with:  npx tsx --conditions=react-server tests/round39.test.ts
 */
import { readFileSync } from "node:fs"
import { removeFromFiles, keptMessage } from "@/lib/files/keep"
import { fileDetails, fileUsage, usesIn, type UseSources } from "@/lib/files/usage-server"
import { FALLBACK_SRC, MISSING_IMAGE_CSS, MISSING_IMAGE_HEAD, installMissingImageGuard } from "@/lib/media/missing-image"
import { CONNECT_RETURN_PATHS, connectReturnPath, safeReturnPath } from "@/lib/native-connect"
import { CONNECT_RETURN_PAGE, androidIntentFor, appLinkFor, handBackToApp } from "@/lib/connect/app-return"
import { signState, verifyState } from "@/lib/github-sync/core"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail)}`}`)
  }
}
const raw = (p: string) => readFileSync(p, "utf8")

/* ── A small database: the query builder the code uses, storage and rpc ── */
type Row = Record<string, unknown>
type Err = { code?: string; message?: string } | null
function memoryDb(tables: Record<string, Row[]>, opts: { rpc?: (fn: string, args: Row) => { data: unknown; error: Err }; fail?: Record<string, Err>; failColumn?: string } = {}) {
  const writes: { table: string; op: string; payload?: unknown; filters: [string, unknown][] }[] = []
  const removed: { bucket: string; paths: string[] }[] = []
  const rpcCalls: Row[] = []
  const from = (table: string) => {
    const filters: [string, string, unknown][] = []
    let op = "select"
    let cols = "*"
    let payload: unknown = null
    let limit: number | null = null
    const run = async () => {
      if (opts.fail?.[table]) return { data: null, error: opts.fail[table] }
      if (op === "select" && opts.failColumn && cols.includes(opts.failColumn)) return { data: null, error: { code: "42703" } }
      const rows = tables[table] ?? []
      if (op === "upsert" || op === "delete") {
        writes.push({ table, op, payload, filters: filters.map(([, c, v]) => [c, v]) })
        return { data: null, error: null }
      }
      let out = rows.filter((r) =>
        filters.every(([kind, c, v]) => (kind === "eq" ? String(r[c]) === String(v) : kind === "in" ? (v as unknown[]).map(String).includes(String(r[c])) : kind === "notnull" ? r[c] !== null && r[c] !== undefined : true)),
      )
      if (limit !== null) out = out.slice(0, limit)
      return { data: out, error: null }
    }
    const q: Row = {
      select: (c?: string) => ((cols = c ?? "*"), q),
      eq: (c: string, v: unknown) => (filters.push(["eq", c, v]), q),
      in: (c: string, v: unknown[]) => (filters.push(["in", c, v]), q),
      not: (c: string) => (filters.push(["notnull", c, null]), q),
      limit: (n: number) => ((limit = n), q),
      upsert: (p: unknown) => ((op = "upsert"), (payload = p), q),
      delete: () => ((op = "delete"), q),
      then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => run().then(res, rej),
    }
    return q
  }
  const storage = { from: (bucket: string) => ({ remove: async (paths: string[]) => (removed.push({ bucket, paths }), { error: null }) }) }
  const rpc = async (fn: string, args: Row) => {
    rpcCalls.push({ fn, ...args })
    return opts.rpc ? opts.rpc(fn, args) : { data: false, error: null }
  }
  return { from, storage, rpc, writes, removed, rpcCalls }
}

const SHOP = "c0000000-0000-4000-8000-000000000039"
const USER = "u0000000-0000-4000-8000-000000000039"
const owner = { userId: USER, creatorId: SHOP }
const PHOTO = `${USER}/files/1-photo.jpg`
const UNUSED = `${USER}/files/2-unused.jpg`
const HERO = `${USER}/hero/3-hero.jpg`
const media = (path: string) => `https://storelib.com/media/store-builder-images/${path}`

function shop(extra: Record<string, Row[]> = {}): Record<string, Row[]> {
  return {
    products: [{ id: "p1", creator_id: SHOP, title: "Black Sleeves", thumbnail_url: media(PHOTO), gallery_urls: [] }],
    store_theme_installs: [{ id: "i1", creator_id: SHOP, name: "Dawn" }],
    store_theme_pages: [{ install_id: "i1", page_key: "about-us", sections: [{ image: media(HERO) }], draft_sections: null }],
    file_details: [],
    ...extra,
  }
}

async function files() {
  console.log("\n1. Files keeps what is used")
  {
    const db = memoryDb(shop())
    const out = await removeFromFiles(db, owner, [
      { bucket: "store-builder-images", path: PHOTO },
      { bucket: "store-builder-images", path: UNUSED },
      { bucket: "store-builder-images", path: HERO },
    ])
    check("a request of three: answered", out.ok === true, out)
    if (out.ok !== true) return
    check("the product's photo is hidden, not removed, and says where it shows", out.hidden.some((h) => h.id === `store-builder-images:${PHOTO}` && h.uses[0]?.label === "Black Sleeves"), out.hidden)
    check("the website page's picture is hidden too, named by its page", out.hidden.some((h) => h.id === `store-builder-images:${HERO}` && h.uses.some((u) => u.label === "Website: About us" && u.href === "/website-builder/editor/i1")), out.hidden)
    check("the one nothing uses is removed from storage", out.deleted.length === 1 && out.deleted[0] === `store-builder-images:${UNUSED}`)
    check("  storage was asked to remove only that one", db.removed.length === 1 && JSON.stringify(db.removed[0].paths) === JSON.stringify([UNUSED]), db.removed)
    const upsert = db.writes.find((w) => w.table === "file_details" && w.op === "upsert")
    const rows = (upsert?.payload ?? []) as Row[]
    check("  the kept ones get hidden_at in file_details, with the shop's id", rows.length === 2 && rows.every((r) => typeof r.hidden_at === "string" && r.creator_id === SHOP), rows)
    check("  the removed one's file_details row goes with it", db.writes.some((w) => w.table === "file_details" && w.op === "delete" && JSON.stringify(w.filters).includes(UNUSED)))
    check("  the catch-all was asked about the one nothing named, only", db.rpcCalls.length === 1 && db.rpcCalls[0].p_name === UNUSED && db.rpcCalls[0].fn === "storage_object_referenced", db.rpcCalls)
    check("nothing to say when all were handled", keptMessage(out.kept) === null)
  }
  {
    const db = memoryDb(shop(), { rpc: () => ({ data: true, error: null }) })
    const out = await removeFromFiles(db, owner, [{ bucket: "store-builder-images", path: UNUSED }])
    check("used somewhere the rows do not name (a lesson, a post): hidden, not removed", out.ok === true && out.hidden.length === 1 && out.hidden[0].uses[0].kind === "other" && db.removed.length === 0, out)
  }
  {
    const db = memoryDb(shop(), { rpc: () => ({ data: null, error: { code: "57014", message: "timeout" } }) })
    const out = await removeFromFiles(db, owner, [{ bucket: "store-builder-images", path: UNUSED }])
    check("the catch-all failing keeps the file", out.ok === true && out.hidden.length === 1 && db.removed.length === 0, out)
  }
  {
    const db = memoryDb(shop(), { fail: { products: { code: "57014" } } })
    const out = await removeFromFiles(db, owner, [{ bucket: "store-builder-images", path: UNUSED }])
    check("products could not be read: nothing is removed on that word", out.ok === true && db.removed.length === 0 && out.hidden.length === 1, out)
  }
  {
    const db = memoryDb(shop(), { fail: { onepages: { code: "42P01" } } })
    const out = await removeFromFiles(db, owner, [{ bucket: "store-builder-images", path: UNUSED }])
    check("a table this database does not have yet is no doubt", out.ok === true && out.deleted.length === 1, out)
  }
  {
    const db = memoryDb(shop(), { failColumn: "hidden_at", rpc: () => ({ data: true, error: null }) })
    const out = await removeFromFiles(db, owner, [
      { bucket: "store-builder-images", path: PHOTO },
      { bucket: "store-builder-images", path: UNUSED },
    ])
    check("before part 280: the used one stays in Files and in storage", out.ok === true && out.kept.some((k) => k.id === `store-builder-images:${PHOTO}` && k.uses[0]?.label === "Black Sleeves") && !db.removed.some((r) => r.paths.includes(PHOTO)), out)
    /* Changed on purpose (AA3): the catch-all is asked before part 280 too, so a picture only a lesson or an email shows is never removed; its yes keeps the file. */
    check("  the one no row names is asked about too, and the catch-all's yes keeps it", out.ok === true && out.deleted.length === 0 && out.kept.length === 2 && db.rpcCalls.length === 1 && !db.removed.length, { out, rpc: db.rpcCalls })
    check("  nothing is written to a column that is not there", !db.writes.some((w) => w.op === "upsert"))
    const note = out.ok === true ? keptMessage(out.kept) : null
    check("  the note names the place and part 280", !!note && /Black Sleeves/.test(note) && /part 280/.test(note) && !note.includes("—"), note)
  }
  {
    const db = memoryDb(shop())
    const theirs = await removeFromFiles(db, owner, [{ bucket: "store-builder-images", path: UNUSED }, { bucket: "store-builder-images", path: "someone-else/files/x.jpg" }])
    check("one that is not theirs refuses the whole request, nothing removed", theirs.ok === false && theirs.status === 404 && db.removed.length === 0)
    check("an empty or huge list is refused", (await removeFromFiles(db, owner, [])).ok === false && (await removeFromFiles(db, owner, Array.from({ length: 101 }, () => ({ bucket: "store-builder-images", path: UNUSED })))).ok === false)
  }
  {
    const db = memoryDb(shop({ file_details: [{ bucket: "store-builder-images", path: PHOTO, creator_id: SHOP, alt_text: "Sleeves", hidden_at: "2026-10-22T10:00:00Z" }, { bucket: "product-images", path: `${SHOP}/p1/a.jpg`, creator_id: SHOP, alt_text: "A", hidden_at: null }] }))
    const d = await fileDetails(db, SHOP)
    check("Files' list leaves out the hidden ones and keeps alt text", d.hidden.has(`store-builder-images:${PHOTO}`) && d.hidden.size === 1 && d.alts.get(`product-images:${SHOP}/p1/a.jpg`) === "A")
    const before = await fileDetails(memoryDb(shop({ file_details: [{ bucket: "product-images", path: "x", creator_id: SHOP, alt_text: "A" }] }), { failColumn: "hidden_at" }), SHOP)
    check("  before part 280: alt text alone, nothing hidden", before.hidden.size === 0 && before.alts.size === 1)
  }
  {
    const src: UseSources = {
      products: [], variants: [], pages: [], onepages: [], themeInstalls: [], themeSettings: [{ install_id: "i1", settings: { logo: media(PHOTO) }, draft_settings: null }], themePages: [],
      collections: [{ id: "c1", title: "Summer", image_url: media(PHOTO) }], profile: [{ id: SHOP, avatar_url: media(PHOTO) }], communities: [{ id: "k1", name: "Clay", cover_url: media(PHOTO) }], settings: [{ creator_id: SHOP, logo: media(PHOTO) }], doubt: false,
    }
    const labels = usesIn(src, "store-builder-images", PHOTO).map((u) => u.label)
    check("where it shows: theme settings, a collection, the profile, a community, store settings", JSON.stringify(labels) === JSON.stringify(["Website: theme settings", "Collection: Summer", "Your profile", "Community: Clay", "Store settings"]), labels)
    const db = memoryDb(shop())
    const u = await fileUsage(db, owner, "store-builder-images", PHOTO)
    check("Files' detail view reads the same rows", u.ok === true && u.uses[0].label === "Black Sleeves")
  }
  {
    const route = raw("app/api/files/route.ts")
    check("the route deletes through removeFromFiles, one or several, and lists without the hidden", /* Changed on purpose (round 41 team): the folders are the store owner's account, for the owner and a team member alike */
/removeFromFiles\(c\.db, \{ userId: c\.ownerUserId \?\? c\.userId, creatorId: c\.creatorId \}, list\)/.test(route) && /details\.hidden\.has\(f\.id\)/.test(route) && !/deleteLibraryFiles?\(/.test(route))
    const lib = raw("components/files/files-library.tsx")
    check("Files says what stays: in use, Remove from Files, kept where it shows", /tt\("Remove from Files"\)/.test(lib) && /hiddenNote\(keptThere\.uses,/.test(lib) && /tt\("It leaves Files and stays in those places\."\)/.test(lib))
    check("  and no longer that those places will show nothing", !/will show nothing/.test(lib))
  }

  console.log("\n   Part 280")
  {
    const part = raw("supabase/sql/run-now/280_files_keep_what_is_used.sql")
    const lines = part.trimEnd().split("\n")
    check("the migration is the same text", raw("supabase/migrations/20270212_files_keep_what_is_used.sql") === part)
    check("one statement a line, a comment first, notify last", lines[0].startsWith("/*") && lines[0].endsWith("*/") && lines[lines.length - 1] === "notify pgrst, 'reload schema';")
    check("hidden_at only where file_details is there", /IF to_regclass\('public\.file_details'\) IS NOT NULL THEN ALTER TABLE public\.file_details ADD COLUMN IF NOT EXISTS hidden_at timestamptz;/.test(part))
    const fn = lines.find((l) => l.startsWith("create or replace function public.storage_object_referenced(")) ?? ""
    const before = raw("supabase/sql/run-now/18_storage_cleanup_functions.sql").split("\n")[1]
    check("storage_object_referenced is part 18's, with file_details skipped and nothing else changed", fn === before.replace("'admin_moderation_log']", "'admin_moderation_log', 'file_details']") && fn !== before)
    check("  still the server's only", /revoke all on function public\.storage_object_referenced\(text, text\) from public, anon, authenticated;/.test(part) && /grant execute on function public\.storage_object_referenced\(text, text\) to service_role;/.test(part))
    check("listed in the README and checked after", /`280_files_keep_what_is_used\.sql`/.test(raw("supabase/sql/run-now/README.md")) && /as p280_files_keep_what_is_used[,;]/.test(raw("supabase/sql/run-now/99_check_after.sql")))
    check("carried into the four files", raw("supabase/sql/run-four/3_of_4_latest.sql").includes("-- part 280_files_keep_what_is_used.sql"))
    check("the daily cleanup still only removes what its own rules allow", /"removed-image": \{ buckets: \["product-images"\]/.test(raw("lib/storage/cleanup.ts")))
  }
}

/* ── 2. A picture that is not there ── */
type Listener = (e: { target: unknown }) => void
function fakeImg(attrs: Record<string, string>, parent: Row | null = null) {
  const a = new Map(Object.entries(attrs))
  return {
    nodeType: 1,
    tagName: "IMG",
    complete: false,
    naturalWidth: 0,
    currentSrc: "",
    parentElement: parent,
    getAttribute: (k: string) => (a.has(k) ? a.get(k)! : null),
    setAttribute: (k: string, v: string) => void a.set(k, v),
    removeAttribute: (k: string) => void a.delete(k),
    hasAttribute: (k: string) => a.has(k),
    closest: (sel: string) => (sel === "[data-keep-broken-images]" && attrs["data-in-files"] ? {} : null),
  }
}
function images() {
  console.log("\n2. A missing picture is a grey box with a camera")
  const listeners: Record<string, Listener> = {}
  const broken = fakeImg({ src: "/gone.jpg", srcset: "/gone-400.jpg 400w", alt: "Black Sleeves" })
  const empty = fakeImg({ alt: "Wool Cap" })
  const lazy = fakeImg({ alt: "Lazy", "data-src": "/later.jpg" })
  const files = fakeImg({ src: "/x.jpg", "data-in-files": "1" })
  const all = [broken, empty, lazy, files]
  const doc = {
    readyState: "complete",
    body: { querySelectorAll: () => all },
    defaultView: null,
    addEventListener: (t: string, f: Listener) => void (listeners[t] = f),
    removeEventListener: (t: string) => void delete listeners[t],
  }
  const stop = installMissingImageGuard(doc as unknown as Document, FALLBACK_SRC)
  check("an <img> with no address and none coming is the camera from the start", empty.getAttribute("src") === FALLBACK_SRC && empty.hasAttribute("data-sl-missing"))
  check("  one waiting for a script (data-src) is left alone", lazy.getAttribute("src") === null && !lazy.hasAttribute("data-sl-missing"))
  listeners.error({ target: broken })
  check("a failed picture points at the camera, its srcset set aside, its alt kept", broken.getAttribute("src") === FALLBACK_SRC && broken.getAttribute("srcset") === null && broken.getAttribute("data-sl-srcset") === "/gone-400.jpg 400w" && broken.getAttribute("alt") === "Black Sleeves")
  listeners.error({ target: broken })
  check("  the camera failing (never) is not swapped again", broken.getAttribute("src") === FALLBACK_SRC)
  listeners.error({ target: files })
  check("Files keeps its own placeholder ([data-keep-broken-images])", files.getAttribute("src") === "/x.jpg" && !files.hasAttribute("data-sl-missing"))
  broken.setAttribute("src", "/back.jpg")
  listeners.load({ target: broken })
  check("a working address later: a photo again", !broken.hasAttribute("data-sl-missing"))
  stop()
  check("stopping takes the listeners off", !listeners.error && !listeners.load)

  check("the camera is a data address: nothing to fetch, nothing to fail", FALLBACK_SRC.startsWith("data:image/svg+xml,") && decodeURIComponent(FALLBACK_SRC).includes('viewBox="0 0 100 100"'))
  check("the grey: #f3f4f6, the dark #26282c on Storelib's dark pages, the box's size and opacity untouched", /background-color:#f3f4f6!important/.test(MISSING_IMAGE_CSS) && /html\[data-sl-dark\] img\[data-sl-missing\][^{]*\{background-color:#26282c/.test(MISSING_IMAGE_CSS) && !/width|height|opacity/.test(MISSING_IMAGE_CSS))
  const script = /<script data-sl-missing-image>([\s\S]*)<\/script>/.exec(MISSING_IMAGE_HEAD)?.[1] ?? ""
  let parses = false
  try {
    new Function(script)
    parses = true
  } catch {
    parses = false
  }
  check("an imported theme's head carries the guard as a script of its own that parses", parses && script.includes(JSON.stringify(FALLBACK_SRC)) && !/require\(|import\(/.test(script))
  check("  no word naming another platform in it (withoutVendorTraces leaves it whole)", !/shopify|liquid/i.test(MISSING_IMAGE_HEAD))
  const theme = raw("lib/storelib-theme/compat/theme.ts")
  check("renderDocument puts it in every imported theme's page, live and on the canvas", /html\.replace\(\/<\\\/head>\/i, `\$\{MISSING_IMAGE_HEAD\}<\/head>`\)/.test(theme) && /<head><meta charset="utf-8">\$\{MISSING_IMAGE_HEAD\}/.test(theme))
  check("the app mounts the guard once, in the root layout", /<MissingImageGuard \/>/.test(raw("app/layout.tsx")))
  for (const [file, what] of [
    ["components/website-builder/sections/renderers/HeaderSection.tsx", "the mini cart and search"],
    ["components/website-builder/cart-page-body.tsx", "the cart page"],
    ["components/website-builder/theme/cart-notice.tsx", "added to cart"],
    ["components/website-builder/header-search-modal.tsx", "search"],
    ["app/checkout/site/site-checkout.tsx", "checkout"],
    ["app/checkout/physical/physical-checkout.tsx", "checkout for shipped goods"],
    ["app/checkout/site/thanks/[token]/thanks-view.tsx", "the thank you page"],
  ] as const) {
    check(`${what}: a product's picture is ProductImg`, /<ProductImg src=/.test(raw(file)))
  }
  check("Files opts out", /data-keep-broken-images=""/.test(raw("components/files/files-library.tsx")))
}

/* ── 3. Connect in the app ── */
function connect() {
  console.log("\n3. Connect opens in the in-app browser sheet and comes back")
  const SECRET = "s3cret"
  const state = signState({ installId: "i1", creatorId: SHOP, app: "ios" }, SECRET)
  check("the state carries that the app started it, signed", verifyState(state, SECRET)?.app === "ios")
  const plain = signState({ installId: "i1", creatorId: SHOP }, SECRET)
  check("  and the web's state does not", verifyState(plain, SECRET)?.app === undefined)

  const req = new Request(`https://storelib.com/api/github/setup?installation_id=7&code=abc&state=${encodeURIComponent(state)}`)
  const back = handBackToApp(req, verifyState(state, SECRET))
  const to = back ? new URL(back.headers.get("location") ?? "") : null
  check("in the sheet, the callback sends it to the hand back page", !!to && to.pathname === CONNECT_RETURN_PAGE && to.searchParams.get("app") === "ios", back?.headers.get("location"))
  const carried = to?.searchParams.get("to") ?? ""
  check("  with its own address and in_app=1, code and state intact", carried.startsWith("/api/github/setup?") && new URL(carried, "https://storelib.com").searchParams.get("in_app") === "1" && carried.includes("code=abc"))
  check("  no referrer leaves with it", back?.headers.get("referrer-policy") === "no-referrer")
  check("in the app's web view (in_app=1) it finishes as before", handBackToApp(new Request(`https://storelib.com${carried}`), verifyState(state, SECRET)) === null)
  check("a sign in the web started is never handed back", handBackToApp(req, verifyState(plain, SECRET)) === null)

  check("iOS link: the scheme Info.plist registers", appLinkFor("ios", carried) === `com.storelib.app://open?path=${encodeURIComponent(carried)}`)
  check("Android link: the sign in filter every build has, and an intent for a tap", appLinkFor("android", carried).startsWith("storelib://auth/callback?connect=") && /^intent:\/\/auth\/callback\?connect=.*#Intent;scheme=storelib;package=com\.storelib\.app;end$/.test(androidIntentFor(carried)))
  check("the app reads the address back from either", connectReturnPath(appLinkFor("ios", carried)) === carried && connectReturnPath(appLinkFor("android", carried)) === carried)
  check("only the two callbacks, on our host, marked in_app", safeReturnPath("/api/github/setup?x=1") === null && safeReturnPath("//evil.com/api/github/setup?in_app=1") === null && safeReturnPath("/app/settings?in_app=1") === null && safeReturnPath("https://evil.com/api/github/setup?in_app=1") === null && safeReturnPath("/api/website-builder/supabase/callback?code=1&in_app=1") !== null)
  check("  a sign in's own link is not a connect", connectReturnPath("storelib://auth/callback?code=abc") === null)
  check("the callbacks are the two connect flows", JSON.stringify(CONNECT_RETURN_PATHS) === JSON.stringify(["/api/github/setup", "/api/website-builder/supabase/callback"]))

  const gh = raw("app/api/github/connect/route.ts")
  check("GitHub's connect route: JSON for the app, the redirect for the web", /return app \? appStart\(url\) : NextResponse\.redirect\(url\)/.test(gh) && /\.\.\.\(app \? \{ app \} : \{\}\)/.test(gh) && /ownInstall\(installId\)/.test(gh))
  const setup = raw("app/api/github/setup/route.ts")
  check("GitHub's setup hands back before anything is stored, and still checks the owner and GitHub after", setup.indexOf("handBackToApp(req, state)") > 0 && setup.indexOf("handBackToApp(req, state)") < setup.indexOf("ownInstall(state.installId)") && /userCanReachInstallation/.test(setup))
  const sb = raw("app/api/website-builder/supabase/connect/route.ts")
  check("Supabase's connect sets its verifier cookie on the app's answer too", /const res = app \? appStart\(to\) : NextResponse\.redirect\(to\)/.test(sb) && /res\.cookies\.set\(VERIFIER_COOKIE/.test(sb))
  const cb = raw("app/api/website-builder/supabase/callback/route.ts")
  check("Supabase's callback hands back before reading the verifier", cb.indexOf("handBackToApp(req, state)") > 0 && cb.indexOf("handBackToApp(req, state)") < cb.indexOf("VERIFIER_COOKIE}=("))
  const nc = raw("lib/native-connect.ts")
  check("the app is told by its bridge, never its user agent", !/userAgent/.test(nc) && /isNativePlatform/.test(nc) && /isPluginAvailable\("Browser"\)/.test(nc))
  check("the sheet: presentationStyle popover, closed on the way back", /Browser\.open\(\{ url, presentationStyle: "popover"/.test(nc) && /Browser\.close\(\)/.test(nc))
  check("closed without coming back: the panel reads its state again", /browserFinished/.test(nc) && /CONNECT_CLOSED_EVENT/.test(raw("components/website-builder/github-sync-panel.tsx")))
  check("a shell without the plugin: the phone's browser, with the same way back", /if \(!sheetAvailable\(\)\) \{[\s\S]{0,200}openInBrowser\(url\)/.test(nc))
  check("off the app, followed as before", /if \(!inNativeApp\(\) \|\| !platform\) \{\s*navigate\(startPath\)/.test(nc))
  const panel = raw("components/website-builder/github-sync-panel.tsx")
  check("Continue to GitHub is still a link to the connect route, taken over only in the app", /href=\{`\/api\/github\/connect\?installId=/.test(panel) && /if \(!inNativeApp\(\)\) return\s*e\.preventDefault\(\)/.test(panel))
  /* Changed on purpose (r51): Your own database is "Coming soon" with nothing to press, so it starts no connect at all. */
  check("Your own database starts no connect while it is Coming soon", !/startConnect/.test(raw("components/website-builder/website-settings/own-database.tsx")))
  check("both app link listeners finish a connect first", /if \(url && finishConnect\(url\)\) return/.test(raw("components/platform/app-link-opener.tsx")) && /if \(finishConnect\(url\)\) return/.test(raw("lib/native-oauth.ts")))
  check("  and a connect is never taken for a sign in", /if \(!isOAuthCallback\(rawUrl\) \|\| connectReturnPath\(rawUrl\)\)/.test(raw("lib/native-oauth.ts")))
  const page = raw("app/auth/connect-return/page.tsx")
  check("the hand back page: only a safe address, a button a person can tap, not indexed", /safeReturnPath\(/.test(page) && /data-connect-return-go/.test(page) && /index: false/.test(page))
}

function copy() {
  console.log("\nCopy")
  for (const f of ["lib/files/keep.ts", "components/files/files-library.tsx", "lib/media/missing-image.ts", "components/media/missing-image.tsx", "lib/native-connect.ts", "lib/connect/app-return.ts", "app/auth/connect-return/page.tsx", "supabase/sql/run-now/280_files_keep_what_is_used.sql"]) {
    const text = raw(f)
    check(`${f}: no em dash`, !text.includes("—"))
    check(`${f}: no banned word`, !/\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform)\b/i.test(text))
  }
}

async function main() {
  await files()
  images()
  connect()
  copy()
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
