/**
 * Round AJ: what the owner asked for after round AI, checked in one place.
 *
 *   FOCUS       no blue ring round a box the page focused itself, in the canvas and on the live site
 *   SIDEBAR     a deleted row folds away, Add section under Page, an insert line between blocks too
 *   SCHEME      the colour scheme field has Edit inside it, no empty square beside it
 *   LIBRARY     App embeds first; a header's card is the header's height, not a hero's
 *   CANVAS      full screen and the device switch glide by transform, nothing laid out a frame at a time
 *   SETTINGS    Connections lists GitHub first and each tool once; a period picker; favicon from files; dark file chooser; providers with marks
 *   ACTIONS     the phone's Actions offer GitHub and your own AI, nothing else to connect
 *   CHAT        AI memory one tap from the chat
 *   CARRIERS    the carriers each country uses, with their marks
 *   PRODUCTS    no translations card on a digital product; a free community in More from
 *
 * Run with:  npm run test:push
 */
import { readFileSync, existsSync } from "node:fs"
import { CARRIER_LIST, carrierChoices } from "@/lib/physical/carriers"
import { REGISTRARS } from "@/lib/custom-domains/dns-help"
import { FOCUS_RING_FIX } from "@/lib/storelib-theme/compat/theme"

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
    console.log(`  FAIL  ${label}${detail === undefined ? "" : `   ${JSON.stringify(detail).slice(0, 400)}`}`)
  }
}
const src = (p: string) => readFileSync(p, "utf8")
const code = (p: string) => src(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

async function main() {
  console.log("\nNo blue ring round a box the page focused itself")
  {
    check("an imported theme's page carries the fix", /\[tabindex="-1"\]:focus/.test(FOCUS_RING_FIX) && /dialog:focus/.test(FOCUS_RING_FIX) && /outline:none!important/.test(FOCUS_RING_FIX))
    check("and every document it draws gets it", /replace\(\/<\\\/head>\/i, `\$\{FOCUS_RING_FIX\}<\/head>`\)/.test(src("lib/storelib-theme/compat/theme.ts")))
    check("Storelib's own pages too, links and fields untouched", /\[tabindex="-1"\]:focus,\s*dialog:focus/.test(src("app/globals.css")) && !/a:focus\s*\{[^}]*outline:\s*none/.test(src("app/globals.css")))
  }

  console.log("\nThe sidebar")
  {
    const parts = src("components/website-builder/editor/tree-parts.tsx")
    check("a deleted row folds away before it goes", /export function foldAway/.test(parts) && /height 220ms/.test(parts))
    check("and comes back if the delete did not happen", /if \(!el\.isConnected\) return/.test(parts))
    const list = code("components/website-builder/editor/sections-list.tsx")
    check("sections fold away from their bin and their menu", /onRemove=\{\(\) => removeSmooth\(s\.id\)\}/.test(list) && /onRemove: removeSmooth/.test(list))
    check("Add section right under the Page heading", /<TreeAddRow data-add-section-top="" label=\{tt\("Add section"\)\} onClick=\{\(\) => onAdd\(0, "template"\)\} \/>/.test(list))
    check("one insert line for sections and blocks, with a raised plus", /<TreeInsertLine data-insert-section/.test(list) && /data-insert-block/.test(src("components/website-builder/editor/block-tree-rows.tsx")))
    const page = code("app/website-builder/editor/[installId]/page.tsx")
    check("a block added between two lands there", /ops\.add\(choice, parentKey, at < 0 \? undefined : at\)/.test(page) && /insertBlockAt\(s\.blocks, parent, newBlock, parent === asked \? opts\.index : undefined\)/.test(page))
  }

  console.log("\nThe colour scheme field")
  {
    const c = code("components/website-builder/editor/controls/color-scheme-control.tsx")
    /* Changed on purpose (round AK: Edit only in the open list, the closed field a plain selector) */
    check("Edit is offered for the schemes", /data-scheme-edit=""/.test(c))
    check("no separate square beside it", !/grid h-9 w-9 shrink-0 place-items-center/.test(c) && !/Pencil/.test(c))
    check("its list scrolls with a slim bar", /\[scrollbar-width:thin\]/.test(c))
  }

  console.log("\nAdd a section")
  {
    const lib = code("components/website-builder/editor/section-library.tsx")
    /* Changed on purpose (round AK: App embeds is its own button beside the search, not a category) */
    check("App embeds is always there", /data-app-embeds-toggle=""/.test(lib))
    check("it holds every app's sections and the apps themselves", /activeCategory === APP_EMBEDS \? !!e\.app/.test(lib) && /data-app-embeds=""/.test(lib) && /STORELIB_SECTION_APPS\.map/.test(lib))
    const compat = code("components/website-builder/compat/compat-section-preview.tsx")
    check("an imported section's card is its own box, not what spills out of it", /const own = w\.offsetHeight/.test(compat) && /wb-compat-preview-h2:/.test(compat))
  }

  console.log("\nThe canvas glides")
  {
    const page = code("app/website-builder/editor/[installId]/page.tsx")
    /* Y1: not its radius or shadow either (a repaint of the whole card a frame), only opacity for the code pane. */
    /* Changed on purpose (round Z1, the owner: "like how it was before a long time ago"): the card's size is played from where it is on screen (playCardMorph), never a CSS transition on it. */
    check("the card has no CSS transition on its size", /"wb-canvas-frame relative overflow-hidden transition-opacity duration-300"/.test(page) && !/wb-canvas-frame relative overflow-hidden transition-all/.test(page))
    /* Changed on purpose (round AX, the owner: "it flashes, it bumps, it disappears, it fades"): the fold is a picture the browser moves (a view transition), not a width played a frame at a time. */
    check("the sidebar's width has no CSS transition either: its fold is played as a picture", !/transition: `max-width \$\{FULL_SCREEN_MS\}ms/.test(page) && /fold\?\.style\.setProperty\("view-transition-name", "wb-sidebar"\)/.test(page))
    /* Y1: the card is never slid from where it was (the page moved right and then left). */
    check("full screen folds the sidebar; the card is never slid", /"wb-sidebar"/.test(page) && !/translateX\(\$\{fullView \? by : -by\}px\)/.test(page))
  }

  console.log("\nWebsite settings")
  {
    const conn = code("components/website-builder/website-settings/connections.tsx")
    check("GitHub first, recommended, then your own Claude and OpenAI keys", /<GitHubSyncPanel[\s\S]*?recommended[\s\S]*?\/>\s*<OwnAiRows/.test(conn))
    check("AI memory right after", conn.indexOf("<AiMemorySettings") > conn.indexOf("<OwnAiRows"))
    check("Claude Code and Codex folded once, below", /data-local-agents=""/.test(conn) && (conn.match(/tool="claude"/g) ?? []).length === 1)
    check("Performance has a period picker", /<PeriodPicker value=\{range\} onChange=\{setRange\} \/>/.test(code("components/website-builder/website-settings/performance.tsx")))
    check("the favicon can come from your files", !/library=\{false\}/.test(code("components/website-builder/website-settings/general.tsx")) && /data-wb-image-files=""/.test(code("components/website-builder/editor/image-picker.tsx")))
    check("the file chooser is dark when opened from a dark panel", /data-community-theme=\{dark \? "dark" : undefined\}/.test(code("components/files/files-library.tsx")) && /closest\("\.dark, \[data-community-theme='dark'\]"\)/.test(code("components/website-builder/editor/image-picker.tsx")))
    check("more domain providers", ["ionos", "wix", "ovh", "route53", "namesilo", "hetzner", "infomaniak"].every((id) => REGISTRARS.some((r) => r.id === id)))
    check("each with its mark, in the builder's list too", /<RegistrarMark id=\{r\.id\}/.test(code("components/domains/dns-setup.tsx")) && !/<select/.test(code("components/domains/dns-setup.tsx")))
  }

  console.log("\nThe Actions menu")
  {
    const page = code("app/website-builder/editor/[installId]/page.tsx")
    check("GitHub and your own AI, nothing else to connect", /label: githubRepo \? "GitHub" : "Connect GitHub"/.test(page) && /label: "Your own AI"/.test(page) && !/label: "Connect Claude Code or Codex"/.test(page))
  }

  console.log("\nAI memory from the chat")
  {
    check("a small mark in the chat's header", /<AskMemoryButton installId=\{installId\}/.test(code("components/website-builder/theme-chat.tsx")))
    check("reading and writing what the settings page does", /\/api\/ai-memory\?installId=/.test(src("components/website-builder/ask-memory.tsx")))
  }

  console.log("\nCarriers")
  {
    check("the carriers each country uses", CARRIER_LIST.length >= 69 && ["japan-post", "poczta-polska", "correios", "delhivery", "nova-poshta", "packeta"].every((id) => CARRIER_LIST.some((c) => c.id === id)))
    check("Japan's come first in Japan", carrierChoices("JP").popular.some((c) => c.id === "japan-post") && carrierChoices("JP").popular.some((c) => c.id === "yamato"))
    check("every one has its tile in the repository", CARRIER_LIST.every((c) => existsSync(`public${c.logo}`)), CARRIER_LIST.filter((c) => !existsSync(`public${c.logo}`)).map((c) => c.id))
    const picker = code("components/physical/carrier-picker.tsx")
    check("a finger never leaves a grey row behind", /e\.pointerType === "mouse" && active !== i/.test(picker))
    check("its list scrolls with a slim bar", /\[scrollbar-width:thin\]/.test(picker))
  }

  console.log("\nProducts")
  {
    check("the product editor has no translations card (round AR, translated on publish instead)", !/<ProductTranslationsCard/.test(code("app/app/products/new/product-editor.tsx")))
    const cache = code("lib/commerce/product-page-cache.ts")
    check("a free community has its card in More from, to its own page", /href: communityPath\(c\.slug\)/.test(cache) && /kind: "community"/.test(cache))
    check("and the card goes there", /product\.href && product\.href\.startsWith\("\/"\) \? product\.href/.test(code("components/explore/product-card.tsx")))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log("\nFailures:")
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
