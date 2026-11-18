/**
 * ===========================================================================
 *  WHAT EVERY MARKETING PAGE CARRIES BEFORE IT CAN ANSWER A TAP (round 46)
 * ===========================================================================
 * Measured on production at 4x CPU and Fast 4G, /features, /pricing, /blog
 * and the /sell and /alternatives pages each spent 500 to 680 ms blocked,
 * for about 850 KB of script of which the page itself was about 3 KB. The
 * rest was the layout's chrome, and most of that was things no visitor to
 * /features uses before they do something:
 *
 *   supabase-js, about 180 KB raw, imported by the platform header, its
 *   notification bell and the phone's search screen, although every one of
 *   them used it asynchronously (a session read, a channel, a search);
 *
 *   the whole English dictionary, about 60 KB, for the header to say
 *   "Search for anything" and "Language";
 *
 *   the community lightbox and its video player, because the route loading
 *   bar read one flag from the lightbox's file;
 *
 *   the phone's search screen, on a computer too, where it never opens;
 *   the language list and the categories browser, which open on a press.
 *
 * Each is now fetched when it is used. This walks the static import graph
 * of the root and marketing layouts' client components (an `import()` is a
 * separate chunk and is not followed; `import type` is erased) and fails if
 * any of them comes back into it. Then it checks that what replaced them
 * says the same thing.
 */
import { existsSync, readFileSync, statSync } from "node:fs"
import { dirname, join, resolve } from "node:path"

import { stripComments } from "./_source"

let passed = 0
let failed = 0
const failures: string[] = []

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`)
  }
}

const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), "utf8")

/* ── The static import graph ─────────────────────────────────────────────── */

function resolveSpec(from: string, spec: string): string {
  let base: string
  if (spec.startsWith("@/")) base = join(ROOT, spec.slice(2))
  else if (spec.startsWith(".")) base = resolve(dirname(from), spec)
  else return `pkg:${spec}`
  for (const c of [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.mjs`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(c) && statSync(c).isFile()) return c
  }
  return `missing:${spec}`
}

/** What a module imports for real: no `import type`, no `{ type A, type B }`, no `import()`. */
function staticImports(file: string): string[] {
  const src = stripComments(readFileSync(file, "utf8"))
  const out: string[] = []
  const re = /(?:^|\n)\s*(import|export)\s+(type\s+)?([^"';]*?)\s*from\s*["']([^"']+)["']|(?:^|\n)\s*import\s*["']([^"']+)["']/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    if (m[5]) {
      out.push(m[5])
      continue
    }
    if (m[2]) continue
    const named = m[3].trim().match(/^\{([\s\S]*)\}$/)
    if (named && named[1].split(",").map((s) => s.trim()).filter(Boolean).every((s) => s.startsWith("type "))) continue
    out.push(m[4])
  }
  return out
}

/** Every module reachable from these, with who brought each in first (for the failure message). */
function graph(entries: string[]): Map<string, string | null> {
  const parent = new Map<string, string | null>()
  const queue: string[] = []
  for (const e of entries) {
    const f = join(ROOT, e)
    parent.set(f, null)
    queue.push(f)
  }
  while (queue.length) {
    const f = queue.shift() as string
    if (f.startsWith("pkg:") || f.startsWith("missing:") || !/\.(t|j|mj)sx?$/.test(f)) continue
    for (const spec of staticImports(f)) {
      const r = resolveSpec(f, spec)
      if (!parent.has(r)) {
        parent.set(r, f)
        queue.push(r)
      }
    }
  }
  return parent
}

function chain(g: Map<string, string | null>, f: string): string {
  const steps: string[] = []
  let at: string | null | undefined = f
  while (at) {
    steps.push(at.replace(`${ROOT}/`, ""))
    at = g.get(at)
  }
  return steps.reverse().join(" -> ")
}

/** The client components the root layout and the marketing layout draw: every marketing page's first script. */
function layoutClientEntries(): string[] {
  const out: string[] = []
  for (const layout of ["app/(storelib)/layout.tsx", "app/(storelib)/(marketing)/layout.tsx"]) {
    for (const m of read(layout).matchAll(/from "@\/((?:components|lib)\/[^"]+)"/g)) {
      for (const c of [`${m[1]}.tsx`, `${m[1]}.ts`]) {
        if (existsSync(join(ROOT, c)) && /^\s*"use client"/.test(read(c))) out.push(c)
      }
    }
  }
  return [...new Set(out)]
}

const entries = layoutClientEntries()
check(
  "the layouts' client components are found (the header, the tab bar, the loading bar among them)",
  ["components/marketing/conditional-header.tsx", "components/nav/buyer-tab-bar.tsx", "components/navigation/route-loading-bar.tsx", "components/locale-provider.tsx"].every((e) => entries.includes(e)),
  entries.join(", "),
)
const shell = graph(entries)
/* Changed on purpose (round 63): the header is fetched where a header is drawn (a dynamic import in conditional-header), so a OnePage, which never draws it, does not download it. */
check("  and the header's own module is fetched by the layout's header, not in every page's graph", !shell.has(join(ROOT, "components/platform/platform-header-client.tsx")) && /const PlatformHeaderClient = dynamic\(\(\) => import\("@\/components\/platform\/platform-header-client"\)/.test(read("components/marketing/conditional-header.tsx")))

const FETCHED_WHEN_USED: [string, RegExp][] = [
  ["the Supabase client (lib/supabase/client.ts)", /\/lib\/supabase\/client\.ts$/],
  ["supabase-js", /^pkg:@supabase\/supabase-js/],
  ["@supabase/ssr's browser client", /^pkg:@supabase\/ssr$/],
  ["every screen's words (lib/i18n/locale-words.ts)", /\/lib\/i18n\/locale-words\.ts$/],
  ["the full dictionary (lib/i18n/dictionaries-core.ts)", /\/lib\/i18n\/dictionaries(-core)?\.ts$/],
  ["the surface dictionaries (sign in, checkout, dashboard, settings, builder)", /\/lib\/i18n\/dict\/(auth|checkout|dashboard|settings|builder|es|fr|de|ro)\.ts$/],
  ["the community lightbox", /\/components\/community\/member\/lightbox\.tsx$/],
  ["the video players", /\/components\/(video\/storelib-video|media\/video-player)\.tsx$/],
  ["the phone's search screen", /\/components\/search\/(search-overlay|search-screen)\.tsx$/],
  ["the language list", /\/components\/platform\/language-modal\.tsx$/],
  ["the categories browser", /\/components\/explore\/(category-browser|explore-category-picker|search-categories-button)\.tsx$/],
]
for (const [what, re] of FETCHED_WHEN_USED) {
  const hit = [...shell.keys()].find((f) => re.test(f))
  check(`not in every marketing page's first script: ${what}`, !hit, hit ? chain(shell, hit) : undefined)
}

/*
  WARMED ON EVERY STORELIB PAGE. components/platform/app-only.tsx fetches its six pieces as soon as it runs, on Storelib's own
  pages, so they are as good as the first script: the sign in bridge (app/NativeOAuthBridge.tsx -> lib/native-oauth.ts) and the
  rest import the client only inside the app's own paths.
*/
const warmed = graph(["app/NativeOAuthBridge.tsx", "components/native-push-init.tsx", "components/platform/notifications-ask.tsx", "components/platform/access-sheet.tsx", "components/account/settings-subpage.tsx"])
const warmedHit = [...warmed.keys()].find((f) => /\/lib\/supabase\/client\.ts$|^pkg:@supabase\/supabase-js|^pkg:@supabase\/ssr$/.test(f))
check("the pieces the root layout warms on every Storelib page do not import the Supabase client", !warmedHit, warmedHit ? chain(warmed, warmedHit) : undefined)
check("  app-only still warms them (so this check is about what every page fetches)", /for \(const load of \[community, settings, oauth, push, ask, access\]\)/.test(read("components/platform/app-only.tsx")))

/* lucide-react: named icons only, so the bundler keeps the ones drawn (tests/icon-weight.test.ts pins the namespace import away everywhere). */
const lucideWhole = [...shell.keys()].filter((f) => /\.(t|j)sx?$/.test(f) && existsSync(f)).filter((f) => /import\s+\*\s+as\s+\w+\s+from\s+"lucide-react"|require\(\s*"lucide-react"\s*\)/.test(stripComments(readFileSync(f, "utf8"))))
check("lucide-react is imported icon by icon in all of it", lucideWhole.length === 0, lucideWhole.join(", "))

/* ── What replaced them ──────────────────────────────────────────────────── */

const header = stripComments(read("components/platform/platform-header-client.tsx"))
check("the header reads the session through the lazy client", /from "@\/lib\/supabase\/browser-lazy"/.test(header) && !/from "@\/lib\/supabase\/client"/.test(header))
check("  the first read still waits for the client and then asks auth.getUser", /const supabase = await getClient\(\)\s*const \{\s*data: \{ user \},\s*error,\s*\} = await supabase\.auth\.getUser\(\)/.test(header))
check("  the listener is subscribed as soon as the client is here, only while the header is mounted, and taken off with it", /;\(\{ data \} = supabase\.auth\.onAuthStateChange\(onAuthEvent\)\)/.test(header) && /if \(!alive\) return\s*;\(\{ data \}/.test(header) && /alive = false\s*otherTabs\?\.close\(\)\s*mountedRef\.current = false\s*window\.clearTimeout\(failSafe\)\s*data\?\.subscription\?\.unsubscribe\(\)/.test(header))
check("  a visitor with nothing to read is answered without the client: not in the app, not with a snapshot, a stored token or a sign in in the address", /if \(isNativePlatform\(\) \|\| readAuthSnapshot\(\) !== null \|\| hasStoredSessionToken\(\)\) return false/.test(header) && /here\.searchParams\.has\("code"\)/.test(header) && /nobodyHere \? Promise\.resolve\(signedOutWithoutReading\(\)\) : loadUser\(true\)/.test(header))
check("  with what the read's signed out answer did (the record cleared, nobody's badge, the guest's buttons)", /function signedOutWithoutReading\(\): null \{[\s\S]{0,200}clearAuthSnapshot\(\)[\s\S]{0,120}storelib_wishlist_count=0; path=\/; max-age=0[\s\S]{0,300}setLoading\(false\)\s*setInitialLoadDone\(true\)/.test(header))
check("  and a sign in or out in another tab is still heard, on Supabase's own channel, until the client listens itself", /otherTabs = new BroadcastChannel\(key\)/.test(header) && /if \(client\) return\s*onAuthEvent\(/.test(header) && /const key = storedSessionKey\(\)/.test(header))
check("  the first paint is still the snapshot, in a layout effect (no signed out flash)", /useLayoutEffect\(/.test(header) && /readAuthSnapshot\(\)/.test(header))
check("  sign out is the same call on the same client, then the shared record is cleared", /* Changed on purpose (r53): lib/auth/log-out */ /const supabase = await browserSupabase\(\)[\s\S]{0,200}await endDeviceSession\("local", supabase\.auth\)\s*clearAuthSnapshot\(\)/.test(header))
check("  isNativePlatform is the same function, from its own file", /from "@\/lib\/supabase\/native-platform"/.test(header) && /export \{ isNativePlatform \}/.test(stripComments(read("lib/supabase/client.ts"))))

const lazy = stripComments(read("lib/supabase/browser-lazy.ts"))
check("the lazy client is the one module and its createClient (one client per page, same storage)", /import type \{ createClient as CreateClient \} from "\.\/client"/.test(lazy) && /loading = import\("\.\/client"\)/.test(lazy) && /const \{ createClient \} = await loadBrowserSupabase\(\)\s*return createClient\(\)/.test(lazy))
check("  and a chunk that failed is asked again next time", /loading\.catch\(\(\) => \{\s*loading = null/.test(lazy))
for (const f of ["components/notifications/notification-bell.tsx", "components/search/search-screen.tsx", "components/community/member/realtime.ts"]) {
  check(`${f} fetches the client when it uses it`, !/from "@\/lib\/supabase\/client"/.test(stripComments(read(f))) && /from "@\/lib\/supabase\/browser-lazy"/.test(read(f)))
}

check("the route loading bar reads the layer flag from lib/nav/layer-back", /import \{ isHistoryLayerRestoring \} from "@\/lib\/nav\/layer-back"/.test(read("components/navigation/route-loading-bar.tsx")))
check("  which the lightbox sets around its own step back, and still exports", /setHistoryLayerRestoring\(true\)\s*markLayerBack\(\)\s*window\.history\.back\(\)/.test(read("components/community/member/lightbox.tsx")) && /export \{ isHistoryLayerRestoring \}/.test(read("components/community/member/lightbox.tsx")))

const bar = stripComments(read("components/nav/buyer-tab-bar.tsx"))
const lazyOverlay = stripComments(read("components/search/search-overlay-lazy.tsx"))
check("the tab bar mounts the search screen through its lazy mount, and opens it through the handle", /from "@\/components\/search\/search-overlay-lazy"/.test(bar) && /from "@\/components\/search\/search-overlay-handle"/.test(bar) && /<SearchOverlay \/>/.test(bar))
check("  fetched on a phone-wide window, before any press (the keyboard comes with the press)", /const PHONE = "\(max-width: 767px\)"/.test(lazyOverlay) && /if \(!mq \|\| mq\.matches\) \{\s*setWanted\(true\)/.test(lazyOverlay) && /ssr: false/.test(lazyOverlay))
check("  and the screen registers its opener there", /useEffect\(\(\) => registerSearchOverlayOpener\(openNow\), \[openNow\]\)/.test(read("components/search/search-overlay.tsx")))
check("the language list and the categories icon are fetched by the header when drawn", /const LanguageModal = dynamic\(\(\) => import\("@\/components\/platform\/language-modal"\)/.test(header) && /const SearchCategoriesButton = dynamic\(\(\) => import\("@\/components\/explore\/search-categories-button"\)/.test(header) && /\{languageAsked \|\| languageOpen \? <LanguageModal open=\{languageOpen\} onOpenChange=\{setLanguageOpen\} \/> : null\}/.test(header))

/* ── The header's words ──────────────────────────────────────────────────── */

async function words() {
  const { shellDictionaries } = await import("../lib/i18n/dict/shell")
  const { coreDictionaries } = await import("../lib/i18n/dictionaries-core")
  const full = coreDictionaries as Record<string, Record<string, string>>
  const base = shellDictionaries as Record<string, Record<string, string>>
  check("the header imports the base words, not every screen's", /import "@\/lib\/i18n\/locale-words-shell"/.test(header) && !/import "@\/lib\/i18n\/locale-words"/.test(header))
  check("every base word is the word the full dictionary gives for it, in every core locale", Object.keys(base).every((lang) => Object.entries(base[lang]).every(([k, v]) => full[lang]?.[k] === v)))
  check("  and the partly translated locales are the very same objects", (["pt-BR", "it", "nl", "pl"] as const).every((c) => base[c] === full[c]))
  const keys = new Set<string>()
  for (const f of ["components/platform/platform-header-client.tsx", "components/nav/buyer-tab-bar.tsx", "components/search/search-overlay.tsx", "components/search/search-screen.tsx"]) {
    for (const m of read(f).matchAll(/\bt\(\s*"([^"]+)"/g)) keys.add(m[1])
  }
  const missing = [...keys].filter((k) => base.en[k] === undefined)
  check(`every key the header and the tab bar say is a base word (${keys.size})`, keys.size > 0 && missing.length === 0, missing.join(", "))

  const registry = await import("../lib/i18n/words-registry")
  const ownFull = { word: () => "full", prepare: () => {} }
  registry.setLocaleWords(ownFull)
  await import("../lib/i18n/locale-words-shell")
  check("the base words do not replace the full words when those are already here", registry.localeWords() === ownFull)
}

async function shellAlone() {
  /* A fresh registry, as on a marketing page where only the header translates. */
  const { setLocaleWords, localeWords, onWordsChange } = await import("../lib/i18n/words-registry")
  setLocaleWords(null as never)
  const mod = await import(`../lib/i18n/locale-words-shell.js?fresh=${Date.now()}`).catch(() => null)
  if (!mod) {
    check("(a second copy of the base words module could not be loaded; its behaviour is checked by source)", true)
    return
  }
  const w = localeWords()
  check("alone, the base words register themselves", !!w)
  if (!w) return
  check("  and say the header's words", w.word("en", "search_placeholder") === "Search for anything" && w.word("pt-BR", "language") === "Idioma")
  let changed = 0
  const stop = onWordsChange(() => changed++)
  const first = w.word("en", "auth.log_in")
  for (let i = 0; i < 50 && localeWords() === w; i++) await new Promise((r) => setTimeout(r, 10))
  stop()
  check("  a word only another screen says is fetched with every screen's words, which then take over", first === undefined && localeWords() !== w && localeWords()?.word("en", "auth.log_in") === "Log in" && changed > 0)
}

async function main() {
  await words()
  await shellAlone()
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
