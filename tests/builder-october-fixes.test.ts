/**
 * The website builder, October 2026: what the owner found and what holds it.
 * Blank Add a section cards, save errors in words, renaming a section from
 * its title, dragging an open section, the code editor's typing layer,
 * full screen, the scrollbar under a drawer, and two default collections.
 */
import { readFileSync } from "node:fs"
import { explainSaveProblem } from "../lib/website-builder/save-problem"
import { sectionDisplayName } from "../lib/website-builder/section-name"

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
check("a section that draws nothing to see is named in its card", /lastWasEmpty = height < 8 \|\| \(words === 0 && !things\)/.test(lib) && /\{live && empty \? <EmptyPreview title=\{title\} \/> : null\}/.test(lib))
check("what a script would reveal on scroll is shown in a card", /\[data-preview-box\] :is\(\[data-reveal\]/.test(lib) && /opacity:1!important/.test(lib))

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
check("a full screen button beside the size", /data-wb-full-toggle=""/.test(editor) && /requestFullscreen/.test(editor) && /fullscreenchange/.test(editor))
check("the canvas keeps its scrollbar's room while a drawer holds it still", /scroller\.style\.scrollbarGutter = "stable"/.test(read("components/website-builder/drawer-frame.ts")))
check("and an imported theme's frame does too", /html\{scrollbar-gutter:stable\}/.test(read("components/website-builder/compat/compat-canvas.tsx")))

console.log("\nTwo collections for every store\n")
const dc = read("lib/physical/default-collections.ts")
check("All products (smart, every product) and Home page (by hand)", /title: "All products"[\s\S]{0,200}kind: "smart" as const,\s*rules: \[\{ field: "price", op: "greater_than", value: "-1" \}\]/.test(dc) && /title: "Home page"[\s\S]{0,200}kind: "manual" as const/.test(dc))
check("made once, and deleting them is final", /default_collections_given/.test(dc) && /ignoreDuplicates: true/.test(dc))
check("Collections and the builder's pickers both give them", /ensureDefaultCollections\(creatorId\)/.test(read("lib/physical/collections-server.ts")) && /ensureDefaultCollections\(creatorId\)/.test(read("lib/website-builder/storefront-collections-server.ts")))
check("a visitor's read of a site never writes", /if \(opts\.published !== false \|\| opts\.ids \|\| opts\.fresh\) return empty/.test(read("lib/website-builder/storefront-collections-server.ts")))

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
