/**
 * "Something went wrong while loading the explore page."
 *
 * There are two language contexts in this codebase and only one of them is
 * mounted globally:
 *
 *   LocaleProvider   app/(storelib)/layout.tsx           above everything
 *   LanguageProvider components/app/app-layout-wrapper.tsx   /app only
 *
 * Both export a hook that THROWS when its provider is missing, so calling
 * lib/i18n/context's useLanguage from anywhere outside /app does not degrade,
 * it replaces the page with an error boundary. That is exactly what happened
 * to /explore: one import, a green build, a green suite, and a marketing page
 * that rendered nothing but "Try again".
 *
 * A build cannot catch it because the call is legal everywhere. This can, by
 * asking which files reach the hook and where those files are used.
 *
 * Run with:  npm run test:push
 */

import { readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join } from "node:path"

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
    console.log(`  FAIL  ${name}${detail ? `\n          ${detail}` : ""}`)
  }
}

const SKIP = new Set(["node_modules", ".next", ".git", "ios", "android", "public"])

function sources(dir: string, out: string[] = []): string[] {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const entry of entries) {
    if (SKIP.has(entry)) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) sources(full, out)
    else if (/\.tsx?$/.test(full)) out.push(full)
  }
  return out
}

const FILES = ["app", "components", "lib", "hooks"].flatMap((d) => sources(d))
const read = new Map<string, string>()
for (const f of FILES) read.set(f, readFileSync(f, "utf8"))

/** Files that call the hook whose provider only wraps /app. */
const callers = FILES.filter(
  (f) =>
    f !== "lib/i18n/context.tsx" &&
    /\buseLanguage\s*\(/.test(read.get(f) || "") &&
    /from ["']@\/lib\/i18n(\/context)?["']/.test(read.get(f) || ""),
)

/**
 * A REAL IMPORT GRAPH, because guessing with regexes found nothing at all
 * and said so only because this file checks its own instrument.
 *
 * Every `from "…"` in every file, resolved the way the bundler resolves it:
 * `@/` against the repository root, `./` against the importing file, then the
 * four endings tsc would try.
 */
function specifiers(src: string): string[] {
  return [...src.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1])
}

function resolveSpecifier(fromFile: string, spec: string): string | null {
  let base: string
  if (spec.startsWith("@/")) base = spec.slice(2)
  else if (spec.startsWith(".")) base = join(dirname(fromFile), spec)
  else return null
  base = base.split("\\").join("/")
  for (const candidate of [`${base}.tsx`, `${base}.ts`, `${base}/index.tsx`, `${base}/index.ts`]) {
    if (read.has(candidate)) return candidate
  }
  return null
}

const importedBy = new Map<string, string[]>()
for (const f of FILES) {
  for (const spec of specifiers(read.get(f) || "")) {
    const target = resolveSpecifier(f, spec)
    if (!target) continue
    const list = importedBy.get(target) || []
    list.push(f)
    importedBy.set(target, list)
  }
}

/** Everything that imports `file`, followed all the way up. */
function importersOf(file: string): Set<string> {
  const seen = new Set<string>()
  const queue = [file]
  while (queue.length) {
    for (const importer of importedBy.get(queue.shift()!) || []) {
      if (seen.has(importer)) continue
      seen.add(importer)
      queue.push(importer)
    }
  }
  return seen
}

console.log("\nThe hook whose provider only wraps /app is only reached from /app\n")

check(
  "lib/i18n/context still throws without its provider, which is why this matters",
  /useLanguage must be used within a LanguageProvider/.test(readFileSync("lib/i18n/context.tsx", "utf8")),
)
check(
  "and LanguageProvider is still mounted in exactly one place",
  FILES.filter((f) => /<LanguageProvider[\s>]/.test(read.get(f) || "")).length === 1,
  FILES.filter((f) => /<LanguageProvider[\s>]/.test(read.get(f) || "")).join(", "),
)

/*
  AND THE SECOND HALF OF THE RULE: this provider renders NOTHING until a
  client effect has run, so putting it above a server-rendered tree does not
  merely add a context, it empties the HTML. That is how the first fix for the
  outage went wrong in the other direction.
*/
const contextSrc = readFileSync("lib/i18n/context.tsx", "utf8")
check(
  "LanguageProvider still renders none of its children before hydration (its fallback at most, null by default), which is why placement matters",
  /* The fallback is returned in a fragment since f5291baa (a component must return an element); still only the fallback, never the children. */
  /if \(!isHydrated\) \{[\s\S]{0,160}?return (fallback|<>\{fallback\}<\/>)\s*\n/.test(contextSrc) && /fallback = null,/.test(contextSrc),
  "if this stops being true, the rule below can be relaxed",
)
/* In /app it stands on the shell's frame and spinner until then, so a document load is never a white page. */
check(
  "and in /app its fallback is the shell's frame with the slow page's spinner, not nothing",
  /<LanguageProvider fallback=\{<AppColdStart \/>\}>/.test(read.get("components/app/app-layout-wrapper.tsx") || ""),
)
const serverRenderedMounts = FILES.filter(
  (f) => /<LanguageProvider[\s>]/.test(read.get(f) || "") && f.startsWith("app/"),
)
check(
  "and it is not mounted in any route layout, whose HTML has to exist without JavaScript",
  serverRenderedMounts.length === 0,
  serverRenderedMounts.join(", "),
)

const outsiders: string[] = []
for (const caller of callers) {
  const reach = importersOf(caller)
  reach.add(caller)
  for (const f of reach) {
    if (!f.startsWith("app/")) continue
    if (f.startsWith("app/(storelib)/app/")) continue
    outsiders.push(`${f} reaches useLanguage via ${caller}`)
  }
}

check(
  "no route outside /app reaches useLanguage",
  outsiders.length === 0,
  outsiders.slice(0, 6).join("\n          ") ||
    "use useLocale from components/locale-provider instead: LocaleProvider is in the root layout",
)

const explore = read.get("components/explore/explore-page-client.tsx") || ""
check(
  "and the explore page in particular uses the root-level one",
  /useLocale\s*\(/.test(explore) && !/useLanguage\s*\(/.test(explore) && !/import[^\n]*useLanguage/.test(explore),
)

/*
  AND THE INSTRUMENT WORKS. The check above passes trivially while nothing
  calls the hook, which is also how it would read if the walk were broken.
  So it is pointed at a pair that is known to exist: explore-hero is rendered
  by explore-page-client, which is rendered by the explore route.
*/
const proof = importersOf("components/explore/explore-hero.tsx")
check(
  "the reachability walk finds a known importer",
  proof.has("components/explore/explore-page-client.tsx"),
  `walking up from explore-hero found ${proof.size} file(s)`,
)
check(
  "and follows it up to the route that renders it",
  [...proof].some((f) => f.startsWith("app/") && f.includes("explore")),
  [...proof].filter((f) => f.startsWith("app/")).join(", ") || "no app/ route reached",
)

/*
  THE ROOT LAYOUT'S OWN CHILDREN. Whatever app/(storelib)/layout.tsx draws beside the
  providers instead of inside them gets no locale. The /account community
  bar was mounted there and its account menu calls useLocale, so /account
  in a community read "Something went wrong". It renders inside them.
*/
const root = read.get("app/(storelib)/layout.tsx") || ""
const localeOpen = root.indexOf("<LocaleProvider>")
const localeClose = root.indexOf("</LocaleProvider>")
const chrome = root.indexOf("<AccountCommunityChrome")
check(
  "the /account community bar is mounted inside LocaleProvider",
  chrome === -1 || (localeOpen !== -1 && chrome > localeOpen && chrome < localeClose),
  `LocaleProvider ${localeOpen}..${localeClose}, AccountCommunityChrome at ${chrome}`,
)

console.log(`\n  ${passed} passed, ${failed} failed`)
if (failed) {
  console.log(`  failing: ${failures.join(", ")}`)
  process.exit(1)
}
