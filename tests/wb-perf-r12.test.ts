/**
 * ===========================================================================
 *  ROUND 12: THE WEBSITE BUILDER EDITOR ON A LARGE THEME, NEVER SIGNED OUT
 *  BY A BLIP, NEVER WAITING ON A DATABASE THAT IS RELOADING
 * ===========================================================================
 * Driven with the real code where it is pure, read from the source where it
 * is wiring:
 *
 *   MENUS     a link typed in a menu draws again only the sections that may
 *             show a menu (menu-readers.ts); the live provider's render does
 *             not change with the menus; the canvas's menus, its dynamic data
 *             and the header's logo are kept by value; a menu's rows are
 *             memoised, keep their objects, and skip off screen
 *   STILL     a theme change no variable reads marks no section still
 *   LIBRARY   a closed library's previews wait for a quiet moment again
 *   SIGN IN   a 401 is asked about: renewed and sent again, a real sign out
 *             handed back, a blip a 503; the routes say 503 for a blip
 *   RETRY     a page's sections are read again quietly before anything is
 *             said (PostgREST's schema cache 503 is lib/storage/media-url.ts's)
 *
 * The same in a real browser, on 120 sections and a menu of 266 links:
 * scripts/check-wb-perf-r12.mjs.
 *
 * Run with:  npm run test:push
 */
import { readFileSync } from "node:fs"
import { menuReaders, sameExceptMenus } from "@/lib/website-builder/menu-readers"
import { decideSession, fetchSignedIn, renewSession } from "@/lib/website-builder/session-keep"
import type { SectionInstance } from "@/lib/website-builder/types"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail)}`}`) }
}
const read = (p: string) => readFileSync(p, "utf8")
const EDITOR = read("app/website-builder/editor/[installId]/page.tsx")

;(async () => {
  console.log("\nA link typed in a menu\n")
  {
    const base = { primary_color: "#111", radius: 4, menus: { "main-menu": { title: "Main", links: [] } } }
    check("a theme that changed in its menus only is the same theme for a section without one", sameExceptMenus(base, { ...base, menus: { "main-menu": { title: "Main", links: [{ title: "A", url: "/" }] } } }))
    check("a theme with any other value changed is not", !sameExceptMenus(base, { ...base, radius: 6 }))
    check("nor one with a key more", !sameExceptMenus(base, { ...base, extra: 1 }))
    const s = (id: string, type: string, settings: Record<string, unknown> = {}, blocks: unknown[] = []): SectionInstance => ({ id, type, name: type, settings, blocks } as unknown as SectionInstance)
    const page = [
      s("h", "header"),
      s("hero", "hero_centered", { heading: "Hi" }),
      s("faq", "faq_accordion"),
      s("own", "custom_links", { menu: "footer-links" }),
      s("nested", "text_rich", {}, [{ id: "b", type: "text", settings: { menu: "shop" } }]),
      s("f", "footer"),
    ]
    const readers = menuReaders(page, { "sections/custom_links.storelib": "{% schema %}{}{% endschema %}" }, { "footer-links": {}, shop: {} })
    check("the header and the footer show a menu", readers.has("h") && readers.has("f"))
    check("a section naming a menu shows it, in its own settings or a block's", readers.has("own") && readers.has("nested"), [...readers])
    check("a hero and an FAQ do not", !readers.has("hero") && !readers.has("faq"), [...readers])
    const listed = menuReaders([s("x", "promo_x")], { "sections/promo_x.storelib": `{% schema %}{"settings":[{"type":"link_list","id":"m","default":"main-menu"}]}{% endschema %}` }, {})
    check("a section whose template has a menu setting shows one, set or not", listed.has("x"))

    check("the canvas gives a section that shows no menu the theme it had", /readers\.has\(id\) \? readerTheme : menuless\.current/.test(EDITOR) && /sameExceptMenus\(menuless\.current/.test(EDITOR))
    check("and one that does a theme of its own per menus drawn", /const readerTheme = useMemo\(\(\) => \(\{ \.\.\.committedTheme \}\), \[committedTheme, drawnMenus\]\)/.test(EDITOR))
    const live = read("components/website-builder/sections/storelib-live.tsx")
    check("the live provider's render reads the data as it runs and is keyed without the menus", /dataNow\.current, globals/.test(live) && /\[template, inEditor, products, dataKey, globals, extras, headerLogo, canvas\]/.test(live))
    check("the canvas's menus are keyed on the menus, not every theme value", /siteMenus\(\{ menus: activeMenus \}/.test(EDITOR) && /\[activeMenus, menuHeader\]/.test(EDITOR))
    check("the menus' autosave is keyed on the menus", /useMemo\(\(\) => JSON\.stringify\(cleanMenus\(draftMenus\)\), \[draftMenus\]\)/.test(EDITOR))
    check("the dynamic data and the header's logo are kept while they say the same", /keepSame\(dynamicKept, dynamicContext\(/.test(EDITOR) && /logoKept\.current = next/.test(EDITOR))
    const rows = read("components/website-builder/editor/controls/link-list-editor.tsx")
    check("a menu's rows are memoised on their own link and the list's state", /const LinkRow = React\.memo\(function LinkRow/.test(rows) && /\}, sameRow\)/.test(rows) && /new Proxy\(\{\} as Ctx/.test(rows))
    check("the open row is each row's own, not every row's", /openHere=\{open !== null/.test(rows) && !/const rev = \[open/.test(rows))
    check("a top-level row off screen is skipped", /depth === 0 && "\[content-visibility:auto\]"/.test(rows) && /containIntrinsicSize/.test(rows))
    const menus = read("components/website-builder/editor/controls/menus-editor.tsx")
    check("a link that did not change keeps its row object", /const itemOf = new WeakMap<MenuLink, LinkItem>\(\)/.test(menus))
  }

  console.log("\nA long menu, opened\n")
  {
    const menu = read("components/ui/responsive-action-menu.tsx")
    check("a row's menu surface is mounted the first time it opens, and kept for its exit", /\{menuWanted \|\| menuOpen \? <ActionDropdownContent/.test(menu) && /if \(menuOpen && !menuWanted\) setMenuWanted\(true\)/.test(menu))
    check("its phone sheet is mounted, closed, as a finger or the keys land, so the tap's click opens it", /\{sheetArmed \|\| sheetOpen \? <BottomSheet/.test(menu) && /onPointerDown: \(e: React\.PointerEvent\) => \{/.test(menu) && /setSheetArmed\(true\)\n\s+requestAnimationFrame\(\(\) => setSheetOpen\(true\)\)/.test(menu))
    check("one listener for the phone line, shared by every menu", /useSyncExternalStore\(subscribePhone, phoneNow, phoneOnServer\)/.test(menu) && !/useState\(false\)\n\s+const \[sheetOpen/.test(menu))
    const rows = read("components/website-builder/editor/controls/link-list-editor.tsx")
    check("a long menu draws a screenful first and the rest while idle; Add link waits for the last", /const FIRST_ROWS = 24/.test(rows) && /requestIdleCallback\(more/.test(rows) && /\{room && all && \(/.test(rows))
  }

  console.log("\nThe editor's first frames\n")
  {
    const layout = read("app/layout.tsx")
    check("the document's ground is the editor's surround from the first frame, and nothing is drawn before its frame", layout.includes("website-builder") && layout.includes("_wb.style.backgroundColor='#eef1f5'") && layout.includes("_wl.href='#wb-frame'"))
    const frame = read("components/website-builder/editor-frame.tsx")
    check("the frame is what the first paint waits for, and the ground is handed back on the way out", /id="wb-frame"/.test(frame) && /<EditorGround \/>/.test(frame))
    /* Round 16, the owner: no skeleton behind the loading animation. The card is never blank: the loader is there from the first frame of the opening. */
    check("the canvas's loader is the loader alone, from the first frame of the opening, never a blank white card or a skeleton", !/data-canvas-outline=""/.test(EDITOR) && !/<PageOutline \/>/.test(EDITOR) && /const showCanvasLoader = useDelayedFlag\(canvasLoaderUp, SPINNER_WAIT_MS\) \|\| loading/.test(EDITOR))
  }

  console.log("\nA theme change no variable reads\n")
  check("marks no section still", /if \(!changed\.length\) \{ if \(keys\) letGo\(el, keys\); continue \}/.test(EDITOR))

  console.log("\nThe section library, closed\n")
  {
    const lib = read("components/website-builder/editor/section-library.tsx")
    check("its previews wait for a quiet moment again once it closes", /export function calmPreviews\(\)/.test(lib) && /window\.clearTimeout\(settle\)\n\s+calmPreviews\(\)/.test(lib))
  }

  console.log("\nA 401 in the editor\n")
  {
    const session = (token: string | null) => ({ data: { session: token ? { access_token: token } : null } })
    const client = (o: { now: () => string | null; refresh: () => Promise<{ data: { session: unknown | null }; error: unknown }>; user?: () => Promise<{ data: { user: unknown | null }; error: unknown }> }) => ({
      auth: { getSession: async () => session(o.now()), refreshSession: o.refresh, getUser: o.user ?? (async () => ({ data: { user: null }, error: { name: "AuthSessionMissingError" } })) },
    })
    check("renewed when Auth renews the session", (await decideSession(client({ now: () => "a", refresh: async () => ({ data: { session: { access_token: "b" } }, error: null }) }))) === "renewed")
    let tok = "a"
    check("renewed when another tab renewed it first (the refresh token already used)", (await decideSession(client({ now: () => tok, refresh: async () => { tok = "b"; return { data: { session: null }, error: { code: "refresh_token_already_used", status: 400 } } } }))) === "renewed")
    check("signed out when the browser holds no session", (await decideSession(client({ now: () => null, refresh: async () => ({ data: { session: null }, error: null }) }))) === "signed-out")
    check("signed out when Auth refuses the renewal and the user", (await decideSession(client({ now: () => "a", refresh: async () => ({ data: { session: null }, error: { code: "session_not_found", status: 400 } }) }))) === "signed-out")
    check("unsure when Auth does not answer", (await decideSession(client({ now: () => "a", refresh: async () => ({ data: { session: null }, error: { name: "AuthRetryableFetchError", status: 0 } }) }))) === "unsure")

    let sent = 0
    let renewals = 0
    const renewing = client({ now: () => "a", refresh: async () => { renewals++; await new Promise((r) => setTimeout(r, 20)); return { data: { session: { access_token: "b" } }, error: null } } })
    const run = async () => new Response("{}", { status: ++sent === 1 ? 401 : 200 })
    const r = await fetchSignedIn(run, renewing)
    check("a request answered 401 is sent again once the session is renewed", r.status === 200 && sent === 2, { status: r.status, sent })
    const both = await Promise.all([renewSession(renewing), renewSession(renewing)])
    check("two 401s at once wait on one renewal", both[0] === "renewed" && both[1] === "renewed" && renewals === 2, { renewals })
    const out = await fetchSignedIn(async () => new Response("{}", { status: 401 }), client({ now: () => null, refresh: async () => ({ data: { session: null }, error: null }) }))
    check("a real sign out is still the 401", out.status === 401)
    const blip = await fetchSignedIn(async () => new Response("{}", { status: 401 }), client({ now: () => "a", refresh: () => new Promise(() => {}) as never }))
    check("a blip is a 503, which the editor tries again and never calls a sign out", blip.status === 503)

    const save = read("lib/website-builder/save-request.ts")
    check("every editor save asks about a 401 first", /fetchSignedIn\(\(\) => fetchWithin\(url, \{ method: "PUT"/.test(save))
    check("and the menus' save goes through it too", /putJsonWithRetry\("\/api\/website-builder\/menus"/.test(EDITOR))
    check("the page's reads, the install's and the header and footer's go through it", /fetchSignedIn\(\(\) => fetchWithin\(url, \{\}, SECTIONS_WAIT_MS\)\)/.test(EDITOR) && /fetchSignedIn\(\(\) => fetchWithin\(`\/api\/website-builder\/themes\/\$\{installId\}`/.test(EDITOR) && /fetchSignedIn\(\(\) => fetchWithin\(`\/api\/website-builder\/themes\/\$\{installId\}\/sections\/sync-global`/.test(EDITOR))
    for (const f of ["themes/[installId]/route.ts", "themes/[installId]/settings/route.ts", "themes/[installId]/sections/route.ts", "themes/[installId]/files/route.ts", "themes/[installId]/sections/sync-global/route.ts", "menus/route.ts", "products/route.ts"]) {
      const src = read(`app/api/website-builder/${f}`)
      /* Changed on purpose (round 42 team): the routes ask lib/team/website, which asks editorUser. */
      check(`${f}: a blip reading the sign in is a 503, not a 401`, (/await editorUser\(supabase\)/.test(src) || (/website(Install)?Caller/.test(src) && /await editorUser\(own(?:, opts)?\)/.test(read("lib/team/website.ts")))) && !/auth\.getUser\(\)/.test(src))
    }
    const owned = read("lib/website-builder/owned-install.ts")
    check("editorUser answers 401 only for Auth's nobody", /current\.state === "indeterminate"\) return \{ user: null, status: 503/.test(owned))
  }

  console.log("\nA page read while the server blinks\n")
  {
    check("a page's sections are read again quietly before anything is said", /async function readSections\(url: string\)/.test(EDITOR) && /const SECTIONS_RETRY_MS = \[600, 1500\]/.test(EDITOR) && /const res = await readSections\(`\/api\/website-builder\/themes\/\$\{installId\}\/sections\?page=home`\)/.test(EDITOR))
  }

  console.log(`\n${passed} passed, ${failed} failed\n`)
  process.exit(failed ? 1 : 0)
})()
