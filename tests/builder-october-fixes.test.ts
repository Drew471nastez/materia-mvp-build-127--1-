/**
 * The website builder, October 2026: what the owner found and what holds it.
 * Blank Add a section cards, save errors in words, renaming a section from
 * its title, dragging an open section, the code editor's typing layer,
 * full screen, the scrollbar under a drawer, and two default collections.
 */
import { readFileSync } from "node:fs"
import { explainSaveProblem } from "../lib/website-builder/save-problem"
import { sectionDisplayName } from "../lib/website-builder/section-name"
import { signedOutForSure } from "../lib/auth/session-read"
import { withValueChips, withoutValueChips } from "../components/website-builder/rich-text-field"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail !== undefined ? `\n        ${JSON.stringify(detail)}` : ""}`) }
}
const read = (p: string) => readFileSync(p, "utf8")
const editor = read("app/website-builder/editor/[installId]/page.tsx")

console.log("\nAdd a section never shows a blank white card\n")
const lib = read("components/website-builder/editor/section-library.tsx")
check("a section that draws nothing to see is named in its card", /const empty = height < 8 \|\| \(words === 0 && !things\)/.test(lib) && /\{live && empty \? <EmptyPreview title=\{title\} \/> : null\}/.test(lib))
/* Changed on purpose (round 44): found once in a copy of the drawn preview and marked with a class (stillMarkup), not by attribute selectors in the document. */
check("what a script would reveal on scroll is shown in a card", /const REVEALED = `\[data-reveal\]/.test(lib) && /el\.classList\.add\("wb-pv-reveal"\)/.test(lib) && /\.wb-pv \.wb-pv-reveal\{opacity:1!important/.test(lib))

console.log("\nA save that fails says what happened and what to do\n")
const bad = explainSaveProblem(400, { error: "Invalid body", issues: [{ path: ["sections", 1, "name"] }] }, [{ type: "hero", name: "Hero" }, { type: "quick_add_to_cart", name: "" }])
check("Invalid body names the section and offers Undo", bad.title.includes("quick add to cart") && bad.action === "undo" && !/invalid body/i.test(bad.title + bad.fix), bad)
check("signed out offers Sign in", explainSaveProblem(401, null).action === "signin")
check("a server that did not answer offers Try again", explainSaveProblem(503, null).action === "retry")
check("offline is offline", explainSaveProblem(null, null).title === "You're offline")
check("too big says what to remove", explainSaveProblem(413, { error: "A page holds 60 sections. This one has 61." }).fix.includes("60 sections"))
check("the editor shows the banner and clears it on the next good save", /setSaveProblem\(null\)\s*\n\s*snapshotAfterSave\(\)/.test(editor) && /<SaveProblemBanner/.test(editor))

console.log("\nA section renamed from its title\n")
check("a name of the creator's own comes first", sectionDisplayName({ type: "hero_product_3", name: "Hero Product 3", label: "Summer hero" }, { hero_product_3: { name: "Hero Product 3" } }) === "Summer hero")
check("and without one it is what the code says", sectionDisplayName({ type: "hero_product_3", name: "x" }, { hero_product_3: { name: "Hero Product 3" } }) === "Hero Product 3")
check("the title is the rename field", /<SectionTitleRename name=\{sectionDisplayName\(section, librarySchemas\)\} onRename=\{\(next\) => renameSection\(section\.id, next\)\} \/>/.test(editor))
for (const f of ["sections/route.ts", "sections/sync-global/route.ts", "agent/route.ts"]) {
  check(`${f} keeps the name when it saves`, read(`app/api/website-builder/themes/[installId]/${f}`).includes("label: z.string().max(80).optional(),"))
}

console.log("\nDragging an open section carries the row, not its blocks\n")
check("its blocks fold while it is carried", /\{lifted \? null : t\.under\}/.test(read("components/website-builder/editor/sections-list.tsx")))

console.log("\nFull screen, and nothing moves when a drawer opens\n")
check("a full screen button beside the size, for the canvas only (never the browser)", /data-wb-full-toggle=""/.test(editor) && !/requestFullscreen/.test(editor))
check("the canvas keeps its scrollbar's room while a drawer holds it still", /scroller\.style\.scrollbarGutter = "stable"/.test(read("components/website-builder/drawer-frame.ts")))
check("and an imported theme's frame does too", /html\{scrollbar-gutter:stable\}/.test(read("components/website-builder/compat/compat-canvas.tsx")))

console.log("\nTwo collections for every store\n")
const dc = read("lib/physical/default-collections.ts")
check("All products (smart, every product) and Home page (by hand)", /title: "All products"[\s\S]{0,200}kind: "smart" as const,\s*rules: \[\{ field: "price", op: "greater_than", value: "-1" \}\]/.test(dc) && /title: "Home page"[\s\S]{0,200}kind: "manual" as const/.test(dc))
check("made once, and deleting them is final", /default_collections_given/.test(dc) && /ignoreDuplicates: true/.test(dc))
check("Collections and the builder's pickers both give them", /ensureDefaultCollections\(creatorId\)/.test(read("lib/physical/collections-server.ts")) && /ensureDefaultCollections\(creatorId\)/.test(read("lib/website-builder/storefront-collections-server.ts")))
check("a visitor's read of a site never writes", /if \(opts\.published !== false \|\| opts\.ids \|\| opts\.fresh\) return empty/.test(read("lib/website-builder/storefront-collections-server.ts")))

console.log("\nA failed read of the user never shows a signed-in person as signed out\n")
{
  check("a 504 from Auth's gateway is not a sign-out", signedOutForSure({ name: "AuthRetryableFetchError", status: 504 }, null) === false)
  check("a dropped connection is not either", signedOutForSure({ message: "fetch failed" }, null) === false)
  check("no session, or a refused token, is", signedOutForSure({ name: "AuthSessionMissingError" }, null) && signedOutForSure({ status: 401 }, null) && signedOutForSure(null, null))
  const header = read("components/platform/platform-header-client.tsx")
  check("the site header keeps what it drew and asks again", /if \(!user && !signedOutForSure\(error, user\)\) \{/.test(header) && /if \(readAuthSnapshot\(\)\?\.signedIn\) return/.test(header))
}

console.log("\nRound 3: the canvas, the apps, imported products, the sidebar\n")
{
  check("full screen folds the editor and never takes the browser full screen", !/requestFullscreen/.test(editor) && /const toggleCanvasFullScreen = useCallback\(\(on: boolean\) => \{\s*if \(on\) setPreviewMode\("preview"\)\s*setFullScreen\(on\)\s*\}/.test(editor))
  const bridge = read("lib/storelib-theme/compat/canvas-bridge.ts")
  check("an imported theme's selection is Storelib's solid blue, never dashed purple", /* Drawn as boxes over the page so nothing in a section cuts them: a border, in the same blue. */
    /\[data-sl-box=section\]\{border:2px solid #3b82f6\}/.test(bridge) && !/(outline|border):[^;"]*dashed/.test(bridge) && !/139,92,246|8b5cf6/.test(bridge))
  const guard = read("components/platform/native-link-guard.tsx")
  const bridgeNative = read("lib/native-bridge.ts")
  check("in the apps, the creator's View live, Preview and View page open in the phone's browser", /export function openInBrowser/.test(bridgeNative) && /if \(onCreatorTools\(\) && isCreatorSite\(nativeLinkFor\(url\)\)\) return openInBrowser\(url\)/.test(bridgeNative) && /\(newWindow && inCreatorTools\(\) && isCreatorSite\(link\)\) \|\| a\.hasAttribute\("data-open-browser"\)/.test(guard))
  check("a picked product is found in the whole catalogue (memberships too), in the builder and on the live site", /r\.catalog\?\.find\(matches\)/.test(read("lib/storelib-theme/compat/objects.ts")) && /catalog=\{catalogCardsForCanvas\}/.test(editor) && /pickable: (?:withSoldCounts\()?catalog\b/.test(read("lib/website-builder/compat-site.ts")))
  check("a block added to a product section goes into its Details block", /PRODUCT_DETAILS_BLOCK\.test\(b\.type\)/.test(editor))
  check("an empty product or collection picker offers to add one", /<EmptyPicker kind="product" \/>/.test(read("components/website-builder/editor/controls/product-list-control.tsx")) && /<EmptyPicker kind="collection" \/>/.test(read("components/website-builder/editor/controls/collection-controls.tsx")))
  const html = '<p>Shop {{ closest.collection.title }} <a href="/x?{{ keep }}">x</a></p>'
  const chips = withValueChips(html)
  check("a dynamic value in the text editor is a chip named in words", /data-value="closest\.collection\.title"[^>]*>Collection title<\/span>/.test(chips) && chips.includes('href="/x?{{ keep }}"'))
  check("and it is saved exactly as it was", withoutValueChips(chips) === html)
  check("the sidebar never goes blank when its section is gone", /const shownPanel: Panel = panelSectionGone && sidebarMode !== "settings" \? \{ type: "pages" \} : selectedPanel/.test(editor))
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
