/**
 * HOME, LANDING ROUND 14, THE FRAME (track 9).
 *
 * The owner, after round 13:
 *   home      "when I'm on certain pages such as /faq and I try to go Home,
 *             it shows loading and doesn't communicate, sometimes it doesn't
 *             load the page at all; I have to hard refresh". The header's
 *             onCanonicalNav kept the pathname of its first render (it was
 *             not a dependency), so after opening the site on "/" and going
 *             to /faq, Home was taken for "already here": the link was
 *             cancelled, /faq scrolled to its top, and the loading cover
 *             (route-loading-bar) stayed up until its 10 second give up.
 *   sign up   on a computer the bar's Sign up stands next to Log in at the
 *             top of the hero, always; the phone's Start now still waits.
 *   earnings  "See what your work could earn" is not on a phone (below
 *             768px); a computer keeps it.
 *
 * Run: node scripts/run-push-tests.mjs (or the single-suite runner).
 */
import { readFileSync } from "node:fs"
import { LAZY_SECTION_HEIGHTS_CSS, LAZY_SECTION_PHONE_HIDDEN_CSS } from "@/components/marketing/home/lazy-sections"

let failed = 0
let passed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${name}`) } else { failed++; console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`) }
}
const read = (p: string) => readFileSync(p, "utf8")
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")

const header = strip(read("components/platform/platform-header-client.tsx"))
const hero = read("components/marketing/hero.tsx")
const page = read("app/(storelib)/(marketing)/page.tsx")
const lazy = strip(read("components/marketing/home/lazy-section.tsx"))

/** The dependency list of `const <name> = useCallback(`, read up to the callback's closing `)`. */
function depsOf(name: string): string {
  const i = header.indexOf(`const ${name} = useCallback(`)
  if (i < 0) return ""
  const end = header.indexOf("\n  )", i)
  const body = header.slice(i, end)
  return /\[([^\]]*)\],?\s*$/.exec(body)?.[1] ?? ""
}

console.log("\n1. Home from /faq goes home")
const navDeps = depsOf("onCanonicalNav")
check("onCanonicalNav reads the pathname of this render (a dependency), not its first one", /\bpathname\b/.test(navDeps), navDeps)
check("  and it still asks scrollHomeToTop with that pathname", /if \(scrollHomeToTop\(e, targetPath, pathname\)\) return/.test(header))
const reliableDeps = depsOf("navigateReliably")
check("navigateReliably, which compares with the pathname too, has it as a dependency", /\bpathname\b/.test(reliableDeps), reliableDeps)
const scroll = header.slice(header.indexOf("export function scrollHomeToTop("), header.indexOf("\n}\n", header.indexOf("export function scrollHomeToTop(")))
check("scrollHomeToTop scrolls only when the browser's own address is \"/\" as well", /window\.location\.pathname !== "\/"/.test(scroll) && /targetPath !== "\/" \|\| pathname !== "\/"/.test(scroll))
check("the desktop Home link goes through onCanonicalNav (a Link to \"/\")", /\{ href: "\/", label: "Home", active: pathname === '\/', wide: true \}/.test(header) && /onClick=\{\(e\) => onCanonicalNav\(e, item\.href\)\}/.test(header))

console.log("\n2. Sign up beside Log in on a computer, from the top")
check("no rule in the hero hides the bar's Sign up", !/data-guest-signup/.test(hero))
const hidden = /#platform-header-root:not\(\[data-home-cta="shown"\]\) \[data-home-phone-start\] \{([^}]*)\}/.exec(hero)?.[1] ?? ""
check("the phone's Start now still waits for the hero's buttons (opacity, translate, hidden)", /opacity:0/.test(hidden) && /translate:0 4px/.test(hidden) && /visibility:hidden/.test(hidden), hidden)
check("Sign up is drawn only in the computer's row (md and up)", /function GuestHeaderActions/.test(header) && /<div className="hidden md:flex items-center justify-between w-full">/.test(header))

console.log("\n3. No earnings on a phone")
check("the earnings box is display: none below 768px", LAZY_SECTION_PHONE_HIDDEN_CSS === '@media (max-width:767px){[data-lazy-section="earnings"]{display:none}}')
check("  and the rule is not in the measured heights (the measuring script rewrites those)", !/display:none/.test(LAZY_SECTION_HEIGHTS_CSS))
check("the page draws it in a tag of its own beside the heights, from the server's first byte", /<style dangerouslySetInnerHTML=\{\{ __html: LAZY_SECTION_HEIGHTS_CSS \}\} \/>/.test(page) && /<style dangerouslySetInnerHTML=\{\{ __html: LAZY_SECTION_PHONE_HIDDEN_CSS \}\} \/>/.test(page))
check("  never joined with +: they are client references in this server page, and a join prints a function's source", !/LAZY_SECTION_\w+_CSS \+/.test(page))
check("the earnings section is still on the page for a computer", /<LazyEarningsCalculator \/>/.test(page))
check("a box hidden at this width is mounted last by the idle chain, not first", /distance\.set\(e\.target, !r\.width && !r\.height \? Infinity :/.test(lazy))

console.log(`\n${failed ? `${failed} failed` : `all ${passed} passed`}`)
if (failed) process.exit(1)
