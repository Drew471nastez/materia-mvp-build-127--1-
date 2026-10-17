/**
 * ===========================================================================
 *  THE SECTION MENUS, COPY AND PASTE, EDIT CODE AND THE APPS CATEGORY (V5)
 * ===========================================================================
 *   the row menu      right click, a long press and Shift+F10 open the same
 *                     menu the dots do; its rows, Edit code among them
 *   copy and paste    a section with nested blocks and pictures goes through
 *                     the clipboard's text and comes back whole, under new
 *                     ids; settings only onto what can take them, with the
 *                     reason when not; blocks within max_blocks and depth;
 *                     each paste one Undo step; across pages and themes of
 *                     one account, and never another account's
 *   edit code         the file, a copy of a built-in, or why there is none
 *   apps              the registry Add section's Apps category reads
 *
 *   npx tsx tests/section-actions-v.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

import {
  CLIP_MARK,
  blockFromClip,
  clipNoun,
  copyBlock,
  copySection,
  copySettings,
  decodeClip,
  encodeClip,
  pasteBlockCheck,
  pasteSectionCheck,
  pasteSettingsPlan,
  sectionFromClip,
  type Clip,
  type SectionClip,
} from "@/lib/website-builder/section-clipboard"
import { sectionCodeTarget } from "@/lib/website-builder/section-code-target"
import { makeCodedCopy } from "@/lib/website-builder/agent/coded-copy"
import { blockRoom } from "@/lib/website-builder/block-room"
import { appById, appForBlock, appForSection, appIsOn, appSectionEntries, registerAppSections, STORELIB_SECTION_APPS } from "@/lib/website-builder/app-sections"
import { backToEditorHref } from "@/lib/website-builder/code-return"
import { countAll, depthOf } from "@/lib/website-builder/block-tree"
import { placeSection, sectionGroupsFor, splitGroups } from "@/lib/storelib-theme/section-groups"
import { MAX_BLOCK_DEPTH } from "@/lib/storelib-theme/types"
import { SECTION_SCHEMAS, ADDABLE_SECTIONS } from "@/lib/website-builder/section-schemas"
import { DEFAULT_THEME_SOURCES } from "@/themes/default/sources.generated"
import { SectionsList, sectionRowMenu } from "@/components/website-builder/editor/sections-list"
import type { BlockInstance, SectionInstance } from "@/lib/website-builder/types"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}${detail !== undefined ? ` (${JSON.stringify(detail).slice(0, 400)})` : ""}`) }
}
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")
const section = (name: string) => console.log(`\n${name}`)

let seq = 0
const mint = { section: (t: string) => `${t}-new-${++seq}`, block: (t: string) => `${t}-b${++seq}` }
const canon = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(canon) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, canon((v as Record<string, unknown>)[k])])) : v
const ids = (list: readonly BlockInstance[] | undefined): string[] => (list ?? []).flatMap((b) => [b.id, ...ids(b.blocks)])

/* A hero with pictures, styling and blocks three deep, as the editor holds it. */
const HERO: SectionInstance = {
  id: "hero-1",
  type: "hero",
  name: "Hero",
  label: "Spring launch",
  settings: { heading: "Spring", image: "https://cdn.example.com/a.jpg", color_scheme: "scheme-2", custom_heading: { size: 64 }, padding_top: 40 },
  blocks: [
    { id: "b1", type: "button", settings: { label: "Shop" } },
    {
      id: "g1",
      type: "group",
      settings: { gap: 12 },
      blocks: [
        { id: "g1i", type: "image", settings: { image: "https://cdn.example.com/b.jpg" } },
        { id: "g1g", type: "group", settings: {}, blocks: [{ id: "deep", type: "text", settings: { text: "<p>Hi</p>" }, hidden: true }] },
      ],
    },
    { id: "st", type: "heading", settings: { heading: "Static" }, static: true },
  ],
}
const FROM = { installId: "inst-a", page: "home" }

async function main() {
  // ═══════════════════════════════════════════════════════════════════════
  section("The row menu: one menu, every way of opening it")
  // ═══════════════════════════════════════════════════════════════════════
  const page: SectionInstance[] = [
    { id: "h", type: "header", name: "Header", settings: {} },
    HERO,
    { id: "faq-1", type: "faq", name: "FAQ", settings: {}, hidden: true },
    { id: "f", type: "footer", name: "Footer", settings: {} },
  ]
  const calls: string[] = []
  const ctx = {
    onDuplicate: (id: string) => calls.push(`dup:${id}`),
    onMove: (id: string, step: -1 | 1) => calls.push(`move:${id}:${step}`),
    onToggleHide: (id: string) => calls.push(`hide:${id}`),
    onRemove: (id: string) => calls.push(`del:${id}`),
    codeItem: (s: SectionInstance) => (s.type === "hero" ? { label: "Edit code", run: () => calls.push(`code:${s.id}`) } : { label: "Edit code", hint: "Drawn by Storelib, no code to edit" }),
  }
  const heroMenu = sectionRowMenu(HERO, page, ctx)
  check("a page section's menu: Duplicate, Move down, Hide, Edit code, Delete", heroMenu.map((i) => i.id).join(",") === "duplicate,move-down,toggle-hidden,edit-code,delete", heroMenu.map((i) => i.id))
  check("Delete is last, red, after a line", heroMenu.at(-1)?.variant === "destructive" && heroMenu.at(-1)?.separatorBefore === true)
  heroMenu.forEach((i) => i.onClick?.())
  check("each row runs its action on that section", calls.join(" ") === "dup:hero-1 move:hero-1:1 hide:hero-1 code:hero-1 del:hero-1", calls)
  const faqMenu = sectionRowMenu(page[2], page, ctx)
  check("the last one moves up, not down, and a hidden one says Show", faqMenu.some((i) => i.id === "move-up") && !faqMenu.some((i) => i.id === "move-down") && faqMenu.find((i) => i.id === "toggle-hidden")?.label === "Show")
  const noCode = faqMenu.find((i) => i.id === "edit-code")
  check("Edit code with no code to edit is shown, disabled, with the reason", noCode?.disabled === true && noCode?.hint === "Drawn by Storelib, no code to edit")
  const headerMenu = sectionRowMenu(page[0], page, ctx)
  check("the header is not duplicated, and can be deleted", !headerMenu.some((i) => i.id === "duplicate") && headerMenu.some((i) => i.id === "delete"))

  const list = read("components/website-builder/editor/sections-list.tsx")
  check("a right click opens it at the pointer", /onContextMenu=\{\(e\) => \{[\s\S]{0,320}openAt\(e\.clientX, e\.clientY, e\.currentTarget\)/.test(list) && /box: \{ left: x, top: y, width: 1, height: 1 \}, phone: isPhone\(\), align: "start"/.test(list))
  check("a long press opens it too, and a moving finger is a scroll", /LONG_PRESS_MS = 480/.test(list) && /e\.pointerType === "mouse"/.test(list) && /> LONG_PRESS_SLOP\) endPress\(\)/.test(list))
  check("and the lift after a long press does not open the section", /onClickCapture=\{\(e\) => \{[\s\S]{0,200}press\.current\?\.fired/.test(list))
  check("Shift+F10 and the context menu key open it from the keyboard", /e\.key === "ContextMenu" \|\| \(e\.shiftKey && e\.key === "F10"\)/.test(list))
  check("one menu for the whole list, a sheet on a phone", /<ActionMenuAt at=\{menu\?\.place \?\? null\}/.test(list) && /\(max-width: 767px\)/.test(list) && !/<DropdownMenu /.test(list))
  const html = renderToStaticMarkup(createElement(SectionsList, {
    sections: page,
    nameOf: (s: SectionInstance) => s.name,
    selectedId: null,
    onSelect: () => {}, onToggleHide: () => {}, onDuplicate: () => {}, onRemove: () => {}, onMove: () => {}, onAdd: () => {},
    dnd: { onReorder: () => {} },
  }))
  check("every row still has its dots", (html.match(/data-section-more=/g) ?? []).length === 4, (html.match(/data-section-more=/g) ?? []).length)

  // ═══════════════════════════════════════════════════════════════════════
  section("Copy section: the whole section, through the clipboard's text")
  // ═══════════════════════════════════════════════════════════════════════
  const clip = copySection(HERO, { owner: "creator-1", from: FROM, typeName: "Hero", fields: SECTION_SCHEMAS.hero?.fields ?? [{ id: "heading", type: "text" }], now: 1 })
  const text = encodeClip(clip)
  check("the text carries a marker", text.includes(CLIP_MARK) && JSON.parse(text).kind === "section")
  const back = decodeClip(text) as SectionClip
  check("and comes back as the same copy", JSON.stringify(canon(back)) === JSON.stringify(canon(clip)))
  check("type, name, the given name, settings, pictures and styling kept", back.section.type === "hero" && back.section.name === "Hero" && back.section.label === "Spring launch" && back.section.settings.image === "https://cdn.example.com/a.jpg" && back.section.settings.color_scheme === "scheme-2" && JSON.stringify(back.section.settings.custom_heading) === '{"size":64}')
  check("blocks at every depth, in their order, hidden kept", ids(back.section.blocks).join(",") === "b1,g1,g1i,g1g,deep,st" && back.section.blocks[1].blocks?.[1].blocks?.[0].hidden === true)
  HERO.settings.heading = "Changed after"
  check("a change after copying does not reach the copy", back.section.settings.heading === "Spring")
  HERO.settings.heading = "Spring"

  const pasted = sectionFromClip(back, mint)
  const oldIds = new Set(ids(HERO.blocks))
  check("pasted under a new id", pasted.id !== HERO.id && pasted.id.startsWith("hero-"))
  check("every block a new id but the static one, which its template finds by id", ids(pasted.blocks).filter((id) => oldIds.has(id)).join(",") === "st" && countAll(pasted.blocks) === countAll(HERO.blocks))
  check("the pasted tree is the copied tree", depthOf(pasted.blocks) === 3 && pasted.blocks?.[1].blocks?.[0].settings.image === "https://cdn.example.com/b.jpg")
  const twice = sectionFromClip(back, mint)
  check("two pastes are two sections, sharing no ids", twice.id !== pasted.id && ids(twice.blocks).filter((id) => id !== "st" && ids(pasted.blocks).includes(id)).length === 0)

  section("What the clipboard will not take")
  check("plain text is not a copy", decodeClip("hello") === null && decodeClip("") === null && decodeClip(null) === null)
  check("another app's JSON is not a copy", decodeClip('{"kind":"section"}') === null)
  check("a section type that climbs out of sections/ is refused", decodeClip(text.replace('"type":"hero"', '"type":"../x"')) === null)
  const tooDeep = JSON.parse(text)
  let node = tooDeep.section.blocks[0]
  for (let i = 0; i < MAX_BLOCK_DEPTH + 2; i++) { node.blocks = [{ id: `d${i}`, type: "group", settings: {} }]; node = node.blocks[0] }
  check("blocks nested past the limit are refused", decodeClip(JSON.stringify(tooDeep)) === null)
  const bigCode = JSON.parse(text)
  bigCode.code = { path: "../../etc/passwd", source: "x" }
  check("a file path outside sections/ is dropped", (decodeClip(JSON.stringify(bigCode)) as SectionClip).code === undefined)

  // ═══════════════════════════════════════════════════════════════════════
  section("Paste section: where it goes, and when it cannot")
  // ═══════════════════════════════════════════════════════════════════════
  const has = (types: string[]) => ({ hasType: (t: string) => types.includes(t) })
  check("nothing copied: the reason says so", (pasteSectionCheck(null, has([])) as { reason: string }).reason === "Copy a section first")
  check("a type the theme has pastes as it is", JSON.stringify(pasteSectionCheck(back, has(["hero"]))) === '{"ok":true,"needsCode":false}')
  check("a type it lacks, with no file in the copy, is refused by name", (pasteSectionCheck(back, has([])) as { reason: string }).reason === "Hero isn't in this theme")
  const coded = copySection({ ...HERO, type: "my_banner" }, { owner: "creator-1", from: FROM, typeName: "My banner", code: { path: "sections/my_banner.storelib", source: "<div></div>\n<schema>{}</schema>" } })
  check("a section of the creator's own file carries the file", coded.code?.path === "sections/my_banner.storelib")
  check("and a theme without it is offered the file", JSON.stringify(pasteSectionCheck(coded, has(["hero"]))) === '{"ok":true,"needsCode":true}')
  const settingsClip = copySettings(HERO, { owner: "creator-1", from: FROM, typeName: "Hero" })
  check("copied settings are not a section", (pasteSectionCheck(settingsClip, has(["hero"])) as { reason: string }).reason === "Settings are copied, not a section")
  check("a header is never pasted as a second one", pasteSectionCheck(copySection({ ...HERO, type: "header" }, { owner: null, from: FROM, typeName: "Header" }), has(["header"])).ok === false)
  /* After the open section, as Shopify's Paste section does (placeSection, as the editor calls it). */
  const body = page.filter((s) => s.type !== "header" && s.type !== "footer")
  const atAfter = body.findIndex((s) => s.id === "hero-1") + 1
  const placed = placeSection(page, pasted, { groups: sectionGroupsFor(SECTION_SCHEMAS.hero as never, { type: "hero", kind: null }), kind: null, group: "template", at: atAfter })
  check("pasted in right after the open section, chrome where it was", placed.sections.map((s) => s.id).join(",") === `h,hero-1,${pasted.id},faq-1,f`, placed.sections.map((s) => s.id))

  // ═══════════════════════════════════════════════════════════════════════
  section("Paste settings: the same type, shared ids, or the reason")
  // ═══════════════════════════════════════════════════════════════════════
  const other: SectionInstance = { id: "hero-2", type: "hero", name: "Hero", settings: { heading: "Old", padding_top: 0 } }
  const same = pasteSettingsPlan(back, { type: "hero", settings: other.settings, fields: [{ id: "heading", label: "Heading", type: "text" }, { id: "padding_top", label: "Top padding", type: "range" }] })
  check("onto the same type every setting is replaced", same.ok === true && (same as { same: boolean }).same === true && JSON.stringify((same as { next: Record<string, unknown> }).next) === JSON.stringify(HERO.settings))
  const rich: SectionInstance = { id: "rt", type: "rich_text", name: "Rich text", settings: { heading: "Keep?", body: "x" } }
  const cross = pasteSettingsPlan(clip, { type: "rich_text", settings: rich.settings, fields: [{ id: "heading", label: "Heading", type: "text" }, { id: "body", label: "Text", type: "richtext" }] })
  const fieldType = clip.fieldTypes.heading
  check("onto another type only shared ids of the same kind, and the styling", cross.ok === true && (cross as { changes: { id: string }[] }).changes.map((c) => c.id).sort().join(",") === (fieldType === "text" || !fieldType ? "color_scheme,custom_heading,heading" : "color_scheme,custom_heading"), cross)
  check("and what is not shared is left alone", cross.ok === true && (cross as { next: Record<string, unknown> }).next.body === "x" && !("image" in (cross as { next: Record<string, unknown> }).next))
  const none = pasteSettingsPlan(copySettings({ id: "x", type: "faq", name: "FAQ", settings: { questions_title: "Q" } }, { owner: null, from: FROM, typeName: "FAQ", fields: [{ id: "questions_title", type: "text" }] }), { type: "hero", settings: {}, fields: [{ id: "heading", label: "Heading", type: "text" }] })
  check("nothing shared: disabled, with what the copy is for", none.ok === false && (none as { reason: string }).reason === "Copied settings are for a FAQ", none)
  const typed = pasteSettingsPlan(copySettings({ id: "x", type: "a", name: "A", settings: { size: "big" } }, { owner: null, from: FROM, typeName: "Image banner", fields: [{ id: "size", type: "select" }] }), { type: "b", settings: {}, fields: [{ id: "size", label: "Size", type: "range" }] })
  check("the same id as another kind of field is not shared", typed.ok === false && (typed as { reason: string }).reason === "Copied settings are for an Image banner", typed)
  check("a block copy does not paste as settings", (pasteSettingsPlan(copyBlock("hero", HERO.blocks![0], { owner: null, from: FROM, blockName: "Button" }), { type: "hero", settings: {}, fields: [] }) as { reason: string }).reason === "A block is copied, not settings")

  // ═══════════════════════════════════════════════════════════════════════
  section("Copy and paste a block: what the level takes, and room for it")
  // ═══════════════════════════════════════════════════════════════════════
  const groupClip = copyBlock("hero", HERO.blocks![1], { owner: "creator-1", from: FROM, blockName: "Group" })
  const groupBack = decodeClip(encodeClip(groupClip)) as Extract<Clip, { kind: "block" }>
  check("a block and everything inside it goes through the text", groupBack.kind === "block" && ids([groupBack.block]).join(",") === "g1,g1i,g1g,deep")
  const pastedBlock = blockFromClip(groupBack, mint)
  check("pasted with new ids all the way down", ids([pastedBlock]).every((id) => !["g1", "g1i", "g1g", "deep"].includes(id)) && countAll([pastedBlock]) === 4)
  check("a static block copied arrives as a block of its own", copyBlock("hero", HERO.blocks![2], { owner: null, from: FROM, blockName: "Heading" }).block.static === undefined)
  const target = (siblings: BlockInstance[], max?: number, takes = (t: string) => t === "group") => ({
    sectionName: "Slideshow",
    section: { blocks: siblings },
    takes,
    owner: { name: "Slideshow", max_blocks: max },
    siblings,
    def: { name: "Group" },
    depth: 1,
  })
  const two = [{ id: "s1", type: "group", settings: {} }, { id: "s2", type: "group", settings: {} }]
  check("into a level that takes it, with room", pasteBlockCheck(groupBack, target(two, 3)).ok === true)
  check("past max_blocks: the reason is the section's own", (pasteBlockCheck(groupBack, target(two, 2)) as { reason: string }).reason === "Slideshow holds 2 blocks.")
  check("a type the level does not take: said by name", (pasteBlockCheck(groupBack, target(two, 5, () => false)) as { reason: string }).reason === "Slideshow doesn't take a Group block")
  check("too deep for where it lands", (pasteBlockCheck(groupBack, { ...target(two, 9), depth: MAX_BLOCK_DEPTH }) as { reason: string }).reason === `Blocks nest ${MAX_BLOCK_DEPTH} deep at most.`)
  check("the same rules Add block keeps", blockRoom({ name: "S", max_blocks: 1 }, [{ id: "x", type: "a", settings: {} }], undefined, "a", { blocks: [] }, { depth: 1, size: 1, height: 1 }).ok === false)
  check("a section copy is not a block", (pasteBlockCheck(back, target(two, 3)) as { reason: string }).reason === "A section is copied, not a block")
  check("the menu's words for a copy", clipNoun(back) === "a Hero" && clipNoun(groupBack) === "a Group block")

  // ═══════════════════════════════════════════════════════════════════════
  section("Kept for the account: across pages and themes, never another account's")
  // ═══════════════════════════════════════════════════════════════════════
  const store = new Map<string, string>()
  const g = globalThis as unknown as Record<string, unknown>
  g.window = {
    localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  const { readClip, writeClip } = await import("@/components/website-builder/editor/use-section-clipboard")
  await writeClip("creator-1", clip)
  check("kept under the account", store.has("storelib:clipboard:creator-1") && readClip("creator-1")?.kind === "section")
  const onAbout = readClip("creator-1") as SectionClip
  check("read on another page of another theme, it is the same copy", onAbout.from.page === "home" && onAbout.from.installId === "inst-a" && onAbout.section.settings.image === "https://cdn.example.com/a.jpg")
  const aboutPage: SectionInstance[] = [{ id: "h2", type: "header", name: "Header", settings: {} }, { id: "about-1", type: "rich_text", name: "Rich text", settings: {} }]
  const onAboutPasted = sectionFromClip(onAbout, mint)
  const aboutPlaced = placeSection(aboutPage, onAboutPasted, { groups: ["template"], kind: null, group: "template", at: 1 })
  check("and pastes there after the open section", splitGroups(aboutPlaced.sections).template.map((s) => s.id).join(",") === `about-1,${onAboutPasted.id}`)
  check("another account holds nothing of it", readClip("creator-2") === null)
  store.set("storelib:clipboard:creator-3", encodeClip(clip))
  check("a copy stored under one account but written by another is not read", readClip("creator-3") === null)

  // ═══════════════════════════════════════════════════════════════════════
  section("Each paste is one Undo step, and the canvas draws it from the page's state")
  // ═══════════════════════════════════════════════════════════════════════
  const editor = read("app/website-builder/editor/[installId]/page.tsx")
  const body_ = (name: string) => {
    const at = editor.indexOf(`const ${name} = `)
    return at === -1 ? "" : editor.slice(at, editor.indexOf("\n  }\n", at))
  }
  for (const name of ["placePastedSection", "insertPastedBlock", "applySettings"]) {
    const b = body_(name)
    check(`${name}: one pushUndo, then one setSections`, (b.match(/pushUndo\(\)/g) ?? []).length === 1 && (b.match(/setSections\(/g) ?? []).length === 1 && b.indexOf("pushUndo()") < b.indexOf("setSections("), name)
  }
  check("Edit a copy switches the type in one step, keeping settings and blocks", /pushUndo\(\)\s*\n\s*setSections\(\(prev\) => prev\.map\(\(x\) => \(x\.id === sectionId \? \{ \.\.\.x, type: made\.type \} : x\)\)\)/.test(body_("editCopyNow")))
  check("Cmd/Ctrl+V reads the system clipboard, only a Storelib copy, never in a field", /document\.addEventListener\("paste", onPaste\)/.test(editor) && /decodeClip\(text\)/.test(editor) && /isTypingTarget\(el\)/.test(editor) && /if \(text\.trim\(\) !== "" \|\| /.test(editor))
  check("a copy from another account is refused", /fromSystem\.owner !== null && fromSystem\.owner !== clipOwner/.test(editor))
  check("the section panel's title row has the menu", /action=\{<PanelMenuButton label=\{`More for \$\{sectionDisplayName\(section, librarySchemas\)\}`\}/.test(editor) && /items=\{\(\) => sectionPanelItems\(section\)\}/.test(editor))
  check("and an open block's has Copy block and Paste block", /items=\{\(\) => blockPanelItems\(section, key, blockHit\.block, canHide, blockHit\.virtual\)\}/.test(editor) && /id: "copy-block"/.test(editor) && /id: "paste-block"/.test(editor))
  const panelItems = editor.slice(editor.indexOf("const sectionPanelItems"), editor.indexOf("const blockPanelItems"))
  check("the section menu's rows, in order", ["copy-section", "paste-section", "copy-settings", "paste-settings", "edit-code", "duplicate", "toggle-hidden", "delete"].every((id, i, all) => i === 0 || panelItems.indexOf(`id: "${all[i - 1]}"`) < panelItems.indexOf(`id: "${id}"`)))
  check("a disabled row carries its reason", /disabled: !pasteS\.ok, hint: pasteS\.ok \? undefined : \(pasteS as \{ reason: string \}\)\.reason/.test(panelItems))

  // ═══════════════════════════════════════════════════════════════════════
  section("Edit code: the file, a copy of a built-in, or why not")
  // ═══════════════════════════════════════════════════════════════════════
  const defaults = DEFAULT_THEME_SOURCES as Record<string, string>
  const builtin = Object.keys(defaults).find((p) => /^sections\/[a-z_]+\.storelib$/.test(p) && p !== "sections/header.storelib" && defaults[p].includes("<schema>"))!
  const builtinType = builtin.replace(/^sections\//, "").replace(/\.storelib$/, "")
  check("the creator's own file opens", JSON.stringify(sectionCodeTarget("my_banner", { sources: { "sections/my_banner.storelib": "x" }, defaults })) === '{"kind":"file","path":"sections/my_banner.storelib"}')
  const copyT = sectionCodeTarget(builtinType, { sources: {}, defaults })
  check("Storelib's own file is edited as a copy", copyT.kind === "copy" && (copyT as { path: string }).path === builtin)
  check("a built-in this site already keeps its own copy of opens that", sectionCodeTarget(builtinType, { sources: { [builtin]: "mine" }, defaults }).kind === "file")
  check("a section drawn by Storelib has no code, and says so", JSON.stringify(sectionCodeTarget("faq", { sources: {}, defaults })) === '{"kind":"none","reason":"Drawn by Storelib, no code to edit"}')
  check("the header and footer are changed with their settings", (sectionCodeTarget("footer", { sources: {}, defaults }) as { reason: string }).reason === "The footer is changed with its settings")
  const made = makeCodedCopy({ type: builtinType, source: (copyT as { source: string }).source, takenTypes: new Set(Object.keys(SECTION_SCHEMAS)), takenNames: new Set() })
  check("the copy is T6's coded copy: a new type and file", made.ok === true && (made as { path: string }).path === `sections/${builtinType}_custom.storelib`)
  check("Edit code opens the code editor at that file and section", /openCode\(target\.path, \{ at, sectionId: s\.id \}\)/.test(editor) && /q\.set\("section", opts\.sectionId\)/.test(editor))
  const pane = read("components/website-builder/preview-mode-switch.tsx")
  check("a loaded pane opens a new file in place, not by reloading", /type: "storelib:open-file", path: ask\.path, at: ask\.at, n: ask\.n/.test(pane) && /srcRef\.current === null/.test(pane))
  const code = read("app/website-builder/code/[installId]/page.tsx")
  check("the code editor opens it there, at the schema when asked", /d\.type !== "storelib:open-file"/.test(code) && /l\.includes\("<schema"\)/.test(code))
  check("back from the code on a phone comes back to the section on its page", backToEditorHref("i1", "?back=editor&path=sections%2Fx.storelib&section=hero-1&previewPath=%2Fabout") === "/website-builder/editor/i1?previewPath=%2Fabout&section=hero-1")
  check("and carries nothing that is not a path on this site", backToEditorHref("i1", "?previewPath=%2F%2Fevil.com&section=%3Cx%3E") === "/website-builder/editor/i1")
  check("the editor opens that section once it has loaded", /url\.searchParams\.get\("section"\)/.test(editor) && /wantedSection\.current = null/.test(editor))

  // ═══════════════════════════════════════════════════════════════════════
  section("Apps: the registry Add section reads")
  // ═══════════════════════════════════════════════════════════════════════
  const reviews = appForSection("reviews_product")
  check("the review sections belong to Storelib Reviews", reviews?.app.name === "Storelib Reviews" && ["reviews_all", "reviews_carousel", "reviews_badge"].every((t) => appForSection(t)?.app.id === "reviews"))
  check("every registered section exists in the theme", appSectionEntries().filter((e) => e.kind === "section").every((e) => !!SECTION_SCHEMAS[e.type]), appSectionEntries().filter((e) => e.kind === "section" && !SECTION_SCHEMAS[e.type]).map((e) => e.type))
  check("and some of them are offered in Add section", appSectionEntries().some((e) => e.kind === "section" && ADDABLE_SECTIONS.includes(e.type)))
  check("blocks are registered by the section types they go in", appForBlock("rating", "product")?.app.id === "reviews" && appForBlock("rating", "hero") === null)
  check("a plain section is no app's", appForSection("hero") === null && appForSection("promo_countdown") === null)
  check("on, off, or not known yet", appIsOn(appById("reviews")!, { "storelib-reviews": "on" }) === true && appIsOn(appById("reviews")!, { "storelib-reviews": "off" }) === false && appIsOn(appById("reviews")!, null) === null && appIsOn(appById("email")!, null) === true)
  check("each app says where it is turned on", STORELIB_SECTION_APPS.every((a) => a.href.startsWith("/app/")))
  registerAppSections([{ app: "offers", kind: "section", type: "bundle_offer", description: "Buy together" }])
  registerAppSections([{ app: "offers", kind: "section", type: "bundle_offer", description: "Buy together, again" }])
  check("another track registers its section once, replacing on a second call", appForSection("bundle_offer")?.app.id === "offers" && appSectionEntries().filter((e) => e.type === "bundle_offer").length === 1 && appForSection("bundle_offer")?.entry.description === "Buy together, again")
  const lib = read("components/website-builder/editor/section-library.tsx")
  check("Add section has an Apps category, second after All", /\.\.\.\(apps > 0 \? \[\{ key: APPS_CATEGORY, label: tt\("Apps"\), count: apps \}\] : \[\]\)/.test(lib) && lib.indexOf('key: "all"') < lib.indexOf("key: APPS_CATEGORY"))
  check("which shows the app sections, a filter like any category", /activeCategory === APPS_CATEGORY \? !!e\.app : e\.category === activeCategory/.test(lib))
  check("and says when an app is off, with the way to turn it on", /appIsOn\(e\.app, appStates\) === false/.test(lib) && /href=\{app\.href\}/.test(lib))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}

void main()
