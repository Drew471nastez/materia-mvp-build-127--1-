/**
 * Round 52: a published website has a document of its own.
 *
 * app/(site)/layout.tsx is a root layout with its own stylesheet
 * (app/site.css, built by scripts/site-css.cjs), Storelib's pages have theirs
 * in app/(storelib)/layout.tsx, and an imported theme's next page is drawn
 * ahead on a capable phone (lib/storelib-theme/compat/touch-prefetch.ts).
 * scripts/check-site-speed-r52.mjs measures the result in a browser, and
 * scripts/check-site-css-r52.mjs proves no website element lost a style.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { createRequire } from "node:module"
import postcss from "postcss"
import { TOUCH_PREFETCH_STARTER, TOUCH_PRERENDER_MAX, TOUCH_PRERENDER_STARTER, withTouchPrefetch } from "../lib/storelib-theme/compat/touch-prefetch"
import { SITE_SHELL_SCRIPT } from "../lib/website-builder/site-shell-script"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail !== undefined ? `: ${JSON.stringify(detail).slice(0, 400)}` : ""}`) }
}
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")
const walk = (dir: string, out: string[] = []): string[] => {
  for (const n of readdirSync(join(root, dir))) {
    const p = `${dir}/${n}`
    if (statSync(join(root, p)).isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

async function main() {
  console.log("\nTwo root layouts\n")
  check("there is no shared root layout", !existsSync(join(root, "app/layout.tsx")))
  const site = read("app/(site)/layout.tsx")
  const app = read("app/(storelib)/layout.tsx")
  check("a website's root draws its own <html> and <body>", /<html lang=\{STORELIB_PAGE_LANG\}/.test(site) && /<body className=\{`\$\{inter\.variable\} font-sans/.test(site))
  check("  with its own stylesheet, not Storelib's", /import "\.\.\/site\.css"/.test(site) && !/globals\.css|theme-dark\.css|website-settings-light\.css/.test(site))
  check("  and none of the app's providers or chrome", !/SWRProvider|LocaleProvider|ExploreMarketplaceRoot|app-only|PrefetchLinks|WarmBehind|PerfBeacon|SiteAppearance/.test(site))
  check("  keeping what a website uses from the app's root", ["<CookieConsentBanner />", "<MissingImageGuard />", "<StuckLayerGuard />", "<ViewportVars />", "<SiteNativeShell />"].every((t) => site.includes(t)))
  check("  and the native class and viewport size before the first paint", /SITE_SHELL_SCRIPT/.test(site) && /classList\.add\('capacitor'\)/.test(SITE_SHELL_SCRIPT) && /--vv-h/.test(SITE_SHELL_SCRIPT) && !/native-start/.test(SITE_SHELL_SCRIPT))
  check("Storelib's root keeps its stylesheets in their order", app.indexOf('"../theme-dark.css"') > 0 && app.indexOf('"../theme-dark.css"') < app.indexOf('"../website-settings-light.css"') && app.indexOf('"../website-settings-light.css"') < app.indexOf('"../globals.css"'))
  const pages = walk("app").filter((p) => /\/(page|layout)\.tsx$/.test(p))
  const loose = pages.filter((p) => !/^app\/\((storelib|site)\)\//.test(p))
  check("every page is under one of the two roots", loose.length === 0, loose)
  check("an address no route matches has its 404", existsSync(join(root, "app/global-not-found.tsx")) && /globalNotFound: true/.test(read("next.config.mjs")) && /<StorelibLayout>\s*<NotFound \/>\s*<\/StorelibLayout>/.test(read("app/global-not-found.tsx")))
  const siteNf = read("app/(site)/not-found.tsx")
  check("a website's missing page is the creator's own 404, reading nothing from the request", /<SiteNotFound fallback=\{<PlainSiteNotFound \/>\} \/>/.test(siteNf) && !/headers\(\)|cookies\(\)/.test(siteNf))
  const shell = read("components/website-builder/site-native-shell.tsx")
  check("the phone app's guards load inside the app only", /if \(!inNativeShell\(\)\) return/.test(shell) && /import\("\.\/site-native-guards"\)/.test(shell))

  console.log("\nA website's stylesheet\n")
  const css = createRequire(join(root, "package.json"))(join(root, "scripts", "site-css.cjs")) as { siteSources: (r?: string) => string[]; siteCssSource: (r?: string, s?: string[]) => string }
  const sources = css.siteSources(root)
  check("the files a website imports are read", sources.includes("app/(site)/layout.tsx") && sources.includes("components/website-builder/site-links.tsx") && sources.includes("components/cookie-consent-banner.tsx") && sources.includes("components/website-builder/site-native-guards.tsx"), sources.length)
  check("  and none of Storelib's own pages or app providers", !sources.some((p) => p.startsWith("app/(storelib)/") || p === "components/platform/app-only.tsx" || p === "lib/swr-config.tsx" || p === "components/locale-provider.tsx"), sources.filter((p) => p.startsWith("app/(storelib)/")).slice(0, 5))
  const source = css.siteCssSource(root, sources)
  const globals = read("app/globals.css")
  check("Storelib's rules, word for word, with Tailwind told what to read", source.startsWith('@import "tailwindcss" source(none);\n@source "../app/(site)/') && source.endsWith(globals.slice('@import "tailwindcss";'.length)))
  check("app/site.css alone imports the whole sheet, so a compile without the plugin is still right", /^@import "\.\/globals\.css";$/m.test(read("app/site.css")))
  check("every compile but the build's runs the plugin before Tailwind", /"site-css\.cjs"\)\]: \{\}, "@tailwindcss\/postcss": \{\}/.test(read("postcss.config.mjs")))
  check("the build compiles it beside Storelib's, and hands both over", /siteCssSource\(root\)/.test(read("scripts/build-css.mjs")) && /\.next-css", "site\.css"/.test(read("scripts/postcss-precompiled.cjs")) && /existsSync\(site\)/.test(read("scripts/build-next.mjs")))
  const plugin = createRequire(join(root, "package.json"))(join(root, "scripts", "site-css.cjs")) as () => postcss.Plugin
  const swapped = await postcss([plugin()]).process('@import "./globals.css";', { from: join(root, "app", "site.css") })
  check("the plugin turns app/site.css into the website's source", swapped.css.startsWith('@import "tailwindcss" source(none);'))
  const other = await postcss([plugin()]).process(".a{color:red}", { from: join(root, "app", "theme-dark.css") })
  check("  and leaves every other sheet alone", other.css === ".a{color:red}")

  console.log("\nAn imported theme's next page on a phone\n")
  check("both starters are valid script", (() => { try { new Function(TOUCH_PREFETCH_STARTER); new Function(TOUCH_PRERENDER_STARTER); return true } catch { return false } })())
  check("a page with somebody else's script is only fetched ahead", !/prerender/.test(TOUCH_PREFETCH_STARTER) && withTouchPrefetch("<body></body>").includes(TOUCH_PREFETCH_STARTER))
  check("otherwise the first page looked at and the link touched are drawn ahead", withTouchPrefetch("<body></body>", { prerender: true }).includes(TOUCH_PRERENDER_STARTER) && /prerender:\[\{source:"list",urls:\[k\]\}\]/.test(TOUCH_PRERENDER_STARTER) && /addEventListener\("touchstart"/.test(TOUCH_PRERENDER_STARTER))
  check(`  at most ${TOUCH_PRERENDER_MAX}, on a phone with 4 GB and 4 cores`, TOUCH_PRERENDER_MAX === 2 && /DRAW=2/.test(TOUCH_PRERENDER_STARTER) && /deviceMemory\|\|4\)>=4&&\(n\.hardwareConcurrency\|\|4\)>=4/.test(TOUCH_PRERENDER_STARTER))
  check("  with the prefetch's care: a touch screen, 4G, no Data Saver, never the cart or checkout", /matchMedia\("\(hover: none\)"\)/.test(TOUCH_PRERENDER_STARTER) && /effectiveType!=="4g"/.test(TOUCH_PRERENDER_STARTER) && /c\.saveData/.test(TOUCH_PRERENDER_STARTER) && /cart\|checkout\|account\|api/.test(TOUCH_PRERENDER_STARTER))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
