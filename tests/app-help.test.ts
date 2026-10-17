/**
 * ===========================================================================
 *  HELP FROM THE ACCOUNT MENU, AS A PAGE IN THE APP (round K)
 * ===========================================================================
 * "I want Help to be accessible from this modal as well in /app, and it
 * redirects as a new page; and on mobile, mobile devices and iOS Capacitor,
 * to be optimized." So:
 *
 *   both account menus have a Help row (after Language, above Sign Out)
 *   that opens /app/help, the Help Center inside the app's shell
 *   the same articles as the public /help, from the same data and parts,
 *   with every link moved to its /app/help address
 *   the public /help keeps working exactly as it did
 *   back returns to where you were; with nothing behind, the level above
 *   it scrolls in its own pane on the app's grey (no white), with room for
 *   the phone's pill, and the search keeps its results above the keyboard
 *   a team member can open it, the app's search and Settings open it too
 *
 * Run with:  npx tsx tests/app-help.test.ts
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { ArticleBody } from "@/components/help/help-parts"
import { ALL_HELP_ARTICLES, HELP_MOVED, helpArticlePath } from "@/lib/help/articles"
import { HELP_TOPICS } from "@/lib/help/questions"
import { APP_HELP_BASE, HELP_BASE, helpHref } from "@/lib/help/paths"
import { areaOfPath } from "@/lib/team/roles"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}${detail !== undefined ? ` (${JSON.stringify(detail)})` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

console.log("\nOne Help Center, two addresses (lib/help/paths)")
check("the public center keeps every link as written", helpHref("/help/products/add-a-product") === "/help/products/add-a-product" && helpHref("/app/settings") === "/app/settings")
check("in the app a help address moves under /app/help", helpHref("/help", APP_HELP_BASE) === "/app/help" && helpHref("/help/products/add-a-product", APP_HELP_BASE) === "/app/help/products/add-a-product" && helpHref("/help/questions#lost-parcel", APP_HELP_BASE) === "/app/help/questions#lost-parcel" && helpHref("/help?q=x", APP_HELP_BASE) === "/app/help?q=x")
check("  and nothing else does: files, other pages, look-alikes and outside links stay", helpHref("/help/physical/x.webp", APP_HELP_BASE) === "/help/physical/x.webp" && helpHref("/helpful", APP_HELP_BASE) === "/helpful" && helpHref("/app/settings/billing", APP_HELP_BASE) === "/app/settings/billing" && helpHref("https://storelib.com/help", APP_HELP_BASE) === "https://storelib.com/help" && helpHref("mailto:support@storelib.com", APP_HELP_BASE) === "mailto:support@storelib.com")
check("the two bases", HELP_BASE === "/help" && APP_HELP_BASE === "/app/help")

console.log("\nAn article read in the app links inside the app")
{
  const linked = ALL_HELP_ARTICLES.filter((a) => JSON.stringify(a.body).includes("](/help"))
  check("some articles link to other articles (so this is tested on real ones)", linked.length > 3, linked.length)
  const inApp = linked.map((a) => renderToStaticMarkup(createElement(ArticleBody, { blocks: a.body, base: APP_HELP_BASE }))).join("\n")
  const publicHtml = linked.map((a) => renderToStaticMarkup(createElement(ArticleBody, { blocks: a.body }))).join("\n")
  /* Screenshots are files under public/help/ and stay where they are served. */
  const pageLinks = (html: string) => [...html.matchAll(/href="(\/[^"]*)"/g)].map((m) => m[1]).filter((h) => !/\.(webp|png|jpe?g|svg|gif)$/.test(h))
  check("drawn in the app, no link goes back to the public /help", !pageLinks(inApp).some((h) => /^\/help([/?#]|$)/.test(h)) && pageLinks(inApp).some((h) => h.startsWith("/app/help/")), pageLinks(inApp).filter((h) => h.startsWith("/help")).slice(0, 3))
  check("  its screenshots still load from /help/... files", /href="\/help\/physical\/[^"]+\.webp"/.test(inApp))
  check("drawn on the public site, they go to /help as before", /href="\/help\//.test(publicHtml) && !/href="\/app\/help/.test(publicHtml))
  const qText = JSON.stringify(HELP_TOPICS)
  check("the order problems' answers link to articles too, and the browser is handed the base", qText.includes("](/help") && /<RichText text=\{q\.a\} base=\{base\} \/>/.test(read("components/help/questions-browser.tsx")) && /<RichText text=\{s\} base=\{base\} \/>/.test(read("components/help/questions-browser.tsx")))
  check("every RichText in the article body carries it", !/<RichText text=\{[^}]+\} \/>/.test(read("components/help/help-parts.tsx")))
}

console.log("\nThe pages under /app/help")
const pages = ["app/app/help/page.tsx", "app/app/help/[category]/page.tsx", "app/app/help/[category]/[article]/page.tsx", "app/app/help/search/page.tsx", "app/app/help/questions/page.tsx"]
check("home, topic, article, search and order problems, inside the /app layout", pages.every((p) => existsSync(join(process.cwd(), p))))
const views = read("components/help/app-help-views.tsx")
const frame = read("components/help/app-help-frame.tsx")
const pageSrc = pages.map(read).join("\n")
check("each is drawn in the app's frame with a back", pages.every((p) => /<AppHelpFrame[\s\S]*?back=\{\{ fallback: [^,]+, label: tt\("Back"\) \}\}/.test(read(p))))
check("the same data and parts as the public center: no article copied", /from "@\/lib\/help\/articles"/.test(views) && /ArticleBody blocks=\{article\.body\} base=\{BASE\}/.test(views) && /<HelpSearch base=\{BASE\}/.test(views) && /<QuestionsBrowser topics=\{topics\} base=\{BASE\}/.test(views) && /<OnThisPage items=\{toc\} variant="side" \/>/.test(views) && /<TocSpy \/>/.test(views))
check("every row links to the /app/help address", /const appArticlePath = \(a: HelpArticle\) => helpHref\(helpArticlePath\(a\), BASE\)/.test(views) && !/href=\{helpArticlePath\(/.test(views) && !/href="\/help/.test(views + pageSrc))
check("a moved article sends on within the app, an unknown or hidden one 404s", /if \(moved\) permanentRedirect\(`\$\{APP_HELP_BASE\}\/\$\{moved\}`\)/.test(read(pages[2])) && /if \(!article \|\| !category \|\| !helpVisible\(category, physical\)\) notFound\(\)/.test(read(pages[2])) && /if \(!category \|\| !helpVisible\(category, physical\)\) notFound\(\)/.test(read(pages[1])) && Object.keys(HELP_MOVED).length > 0)
check("the title is the app's word for Help, in the creator's language", /title: tt\("Help"\)/.test(read(pages[0])) && /\{tt\("Help"\)\}<\/h1>/.test(read(pages[0])))
check("backs go up a level when there is nothing to return to: home, Help, the topic", /fallback: "\/app"/.test(read(pages[0])) && /fallback: APP_HELP_BASE/.test(read(pages[1])) && /fallback: appTopicPath\(category\.slug\)/.test(read(pages[2])))

console.log("\nThe public /help is untouched")
for (const p of ["app/help/page.tsx", "app/help/[category]/page.tsx", "app/help/[category]/[article]/page.tsx", "app/help/search/page.tsx", "app/help/questions/page.tsx"]) {
  check(`  ${p} is still there, on its own layout`, existsSync(join(process.cwd(), p)) && !/APP_HELP_BASE|app-help/.test(read(p)))
}
check("an article path is still /help/<topic>/<slug>", helpArticlePath({ category: "products", slug: "x" }) === "/help/products/x")

console.log("\nBack returns where you were (components/help/app-help-frame)")
check("a real link to the level above, so a new tab, a long press and no history all work", /<Link\s+href=\{fallback\}/.test(frame) && /data-help-back=""/.test(frame))
check("a plain press with somewhere of ours behind goes back through history, and lands above if that back does nothing", /if \(!isPlainClick\(e\) \|\| !canReturnInApp\(\)\) return\s*e\.preventDefault\(\)[\s\S]{0,200}backThen\(\(\) => router\.replace\(fallback\)\)/.test(frame))

console.log("\nOn a phone and in the iOS and Android apps")
check("its own pane on the app's grey from the first frame (no white), with the phone pill's room (page-scroll)", /className="orders-pane page-scroll h-full overflow-y-auto overflow-x-hidden bg-\[#f8f9fa\] app-page-enter" data-help-scroll=""/.test(frame))
check("the bar sticks to the top of the pane with its hairline once scrolled (PaneBar), under the shell's safe-area header", /<PaneBar width=\{APP_HELP_WIDTH\}/.test(frame) && /pt-\[calc\(68px_\+_env\(safe-area-inset-top,_0px\)\)\]/.test(read("app/app/layout.tsx")))
check("the contents list follows the pane's scroll, not only the window's", /closest<HTMLElement>\("\[data-help-scroll\]"\) \?\? window/.test(read("components/help/toc-spy.tsx")))
const search = read("components/help/help-search.tsx")
check("the search: 16px type (no zoom on focus), Search on the keyboard, the field moved up to make room on a phone", /enterKeyHint="search"/.test(search) && /h-14 pl-12 pr-4 text-\[16px\]/.test(search) && /matchMedia\("\(max-width: 767px\)"\)[\s\S]{0,1200}closest<HTMLElement>\("\[data-help-scroll\]"\)[\s\S]{0,400}pane\.scrollBy\(\{ top: by, behavior: "smooth" \}\)/.test(search))
check("  and its results fit in what the keyboard leaves (--vv-h)", /calc\(var\(--vv-h,100dvh\)\*0\.4\)/.test(search) && /overscroll-contain/.test(search))
check("  the results page and the results stay in the app", /action=\{`\$\{base\}\/search`\}/.test(search) && /router\.push\(pathOf\(/.test(search) && /href=\{pathOf\(r\.article\)\}/.test(search))
check("an article reads edge to edge on a phone and as a sheet at a desk", /app-gutter-bleed rounded-none border-x-0 px-5 py-6 sm:mx-0 sm:rounded-2xl/.test(views) && /text-\[16px\] leading-\[1\.7\]/.test(read("components/help/help-parts.tsx")))
check("Open a request is a link the router follows, not a reload", /<Link\s+href="\/app\/support"/.test(read("components/help/help-parts.tsx")))

console.log("\nEveryone in the dashboard can open it")
check("Help belongs to nobody's store: a team member opens it like the home page", areaOfPath("/app/help") === null && areaOfPath("/app/help/products/add-a-product") === null && areaOfPath("/app/helpful") === "store")
check("  so the team bar (components/app/team-bar) lets every member in: it opens what has no area", /const allowed = area === null \|\| memberCan\(role, area\)/.test(read("components/app/team-bar.tsx")))
check("the app's search opens /app/help, by the router, not Safari", /href: "\/app\/help", group: "Pages"/.test(read("lib/search/app-pages.ts")) && !/"\/help": `https:/.test(read("components/app/app-search.tsx")))
check("Settings' Help Center row opens it too", /<SmartLink\s+href="\/app\/help"[\s\S]{0,200}data-settings-help=""/.test(read("components/app/settings-form-new.tsx")) && !/openExternal\(`https:\/\/\$\{process\.env\.NEXT_PUBLIC_MAIN_DOMAIN \|\| "storelib\.com"\}\/help`\)/.test(read("components/app/settings-form-new.tsx")))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  console.log(failures.map((f) => `  - ${f}`).join("\n"))
  process.exit(1)
}
