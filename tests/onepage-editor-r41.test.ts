/**
 * ===========================================================================
 *  ROUND 41: THE ONEPAGE EDITOR'S BLOCKS
 * ===========================================================================
 * The owner's list, one section each: Add block's grey tiles and plain
 * chips again, a block's settings that glide shut, groups that take any
 * block, delete one and offer the page's own blocks, and every block of the
 * Add block catalogue checked for an editor, a live renderer and the page's
 * look (button style, corners, hover, size, title font).
 *
 * Run: npx tsx tests/onepage-editor-r41.test.ts
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { PICKER_ENTRIES } from "@/components/onepage/add-block-picker"
import { ExtraBlock } from "@/components/onepage/extra-blocks"
import { GROUP_CHILD_TYPES, GROUP_NEVER, canGoInGroup, deleteFromGroup, groupCandidates, moveIntoGroup, moveOutOfGroup } from "@/lib/onepage/group"
import { boxRadius, buttonPadScale, pressableProps, tintOf } from "@/lib/onepage/block-look"
import { isExtraBlock } from "@/lib/onepage/extra-blocks"
import { createDefaultBlock, defaultTheme, type GroupBlockData, type OnePageBlock, type OnePageBlockType, type OnePageTheme } from "@/lib/onepage/types"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`) }
}
function section(t: string) { console.log(`\n${t}`) }
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")
/** The code without its comments, so a rule about code is not met by a sentence about it. */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, "")

const b = (id: string, type: OnePageBlockType, data: Record<string, unknown> = {}, sort = 0): OnePageBlock => ({ id, type, enabled: true, sort_order: sort, data: data as OnePageBlock["data"] })
const kids = (blocks: OnePageBlock[], id: string) => ((blocks.find((x) => x.id === id)?.data as GroupBlockData)?.children ?? []).map((c) => c.id).join()

function main() {
  const tab = read("components/onepage/tabs/links-tab.tsx")
  const picker = read("components/onepage/add-block-picker.tsx")
  const icons = read("components/onepage/block-icons.tsx")
  const pills = read("components/onepage/pill-tabs.tsx")
  const reveal = read("components/onepage/reveal.tsx")
  const foot = read("components/onepage/block-remove.tsx")
  const existing = read("components/onepage/group-add-existing.tsx")
  const live = read("components/onepage/public-onepage.tsx")

  // ═══════════════════════════════════════════════════════════════════════
  section("1. Add block: the light grey tiles, no colours, no dots")
  // ═══════════════════════════════════════════════════════════════════════
  {
    check("the round 40 tints are gone", !existsSync(join(root, "components/onepage/block-tints.ts")) && !/block-tints|tintOf\(|tint=/.test(code(picker)) && !/tint/.test(code(icons)))
    check("every block's tile is the one grey tile, icon in near black", /bg-\[#f2f2f4\] text-\[#1a1a2e\]/.test(icons) && /return <BlockTile icon=\{entry\.icon \?\? GlyphLink\} \/>/.test(picker) && /<B size=\{18\} color="#1a1a2e" \/>/.test(picker))
    check("the section headings are the quiet grey again", /text-\[#9ca3af\]" data-picker-heading=\{id\}>\{title\}<\/h3>/.test(picker))
    check("the category chips are words only", !/dot/.test(code(pills)) && /categories\.map\(\(c\) => \(\{ id: c\.id, label: c\.label \}\)\)/.test(picker))
    check("brands keep their own colours on white", /tone="brand"/.test(picker) && /<IntegrationMark id=\{entry\.mark\}/.test(picker))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("2. A block's settings open and close by their measured height")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const c = code(tab)
    check("the settings sit in the measured box, let go once shut", /<Reveal open=\{isSelected\} id=\{settingsId\} returnFocus=\{titleRef\} unmountWhenShut className="rounded-b-2xl">/.test(c) && !/\{isSelected && \(\s*<div className="space-y-4 rounded-b-2xl/.test(c))
    check("the row's title is a key: Enter and Space, aria-expanded, aria-controls", /role="button"\s*tabIndex=\{0\}\s*aria-expanded=\{isSelected\}\s*aria-controls=\{settingsId\}/.test(c) && /e\.key === "Enter" \|\| e\.key === " "/.test(c))
    check("focus inside a closing panel goes back to the row, not the page's top", /returnFocus\.current\.focus\(\{ preventScroll: true \}\)/.test(reveal) && /ref=\{titleRef\}/.test(c))
    check("the next card's scroll aims where it will be once the one above has shut", /revealSettledTop\(el\)/.test(c) && /data-reveal-closing/.test(reveal) && /if \(unmountWhenShut\) setBuilt\(false\)/.test(reveal))
    check("height and opacity only, on a Web Animation, never transform", /box\.animate\(\[\{ height:/.test(reveal) && !/transition-transform|transition-all|transform/.test(code(reveal)))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("3. Groups: any block, delete, and the page's own blocks")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const catalogTypes = [...new Set(PICKER_ENTRIES.map((e) => e.type))]
    const shut = catalogTypes.filter((t) => !canGoInGroup(t))
    check("every catalogue block goes in a group but the header, a group and the social icons", shut.sort().join() === "group,social_row" && GROUP_NEVER.join() === "header,group,social_row" && GROUP_NEVER.every((t) => !GROUP_CHILD_TYPES.includes(t)), shut.join())

    const page = [b("h", "header", {}, 0), b("g", "group", { layout: "stack", children: [] }, 1), b("a", "link_button", { url: "https://a.co", label: "A" }, 2), b("e", "email_capture", { headline: "Join" }, 3), b("s", "storelib_shelf", { source: "all" }, 4), b("r", "social_row", {}, 5)]
    check("Add to group offers the page's blocks that may go in, in order", groupCandidates(page, "g").map((x) => x.id).join() === "a,e,s")
    const one = moveIntoGroup(page, "e", "g")!
    const two = moveIntoGroup(one, "s", "g")!
    const three = moveIntoGroup(two, "a", "g")!
    check("moving one in is one list: off the page, at the group's end", kids(three, "g") === "e,s,a" && three.map((x) => x.id).join() === "h,g,r" && three.every((x, i) => x.sort_order === i))
    const gone = deleteFromGroup(three, "g", "s")!
    const left = (gone.find((x) => x.id === "g")!.data as GroupBlockData).children
    check("delete takes a child off for good, the rest renumbered, nothing else touched", kids(gone, "g") === "e,a" && left.every((c, i) => c.sort_order === i) && gone.map((x) => x.id).join() === "h,g,r" && kids(three, "g") === "e,s,a")
    check("deleting what is not there changes nothing", deleteFromGroup(three, "g", "zz") === null && deleteFromGroup(three, "h", "e") === null)
    const out = moveOutOfGroup(gone, "g", "e")!
    check("move out still puts it right under the group", out.map((x) => x.id).join() === "h,g,e,r" && kids(out, "g") === "a")
    check("a saved page keeps the group as data: it survives JSON", JSON.stringify(JSON.parse(JSON.stringify(gone))) === JSON.stringify(gone))

    const c = code(tab)
    check("the editor deletes a child in one edit", /const next = deleteFromGroup\(blocksInOrder\(\), groupId, childId\)\s*if \(next\) reorderBlocks\(next\)/.test(c) && /onDeleteChild=\{handleDeleteChild\}/.test(c) && /onDeleteChild=\{onDeleteChild\}/.test(c))
    check("a child's settings end with the block foot: move, then Move out or Delete", /<BlockFootActions\s*key=\{selectedChild\.id\}/.test(c) && /onRemove=\{\(\) => deleteChild\(selectedChild\.id\)\}/.test(c) && /keep=\{\{ label: tt\("Move out"\)/.test(c) && /keep\.onPick\(\)/.test(foot) && /data-block-keep=""/.test(foot))
    check("Add to group leads with the page's own blocks, then the whole catalogue", /lead=\{addToGroupId \? \(\s*<GroupExistingBlocks/.test(c) && /groupCandidates\(onepage\.draft_blocks, addToGroupId\)/.test(c) && /onMove=\{moveExistingIntoGroup\}/.test(c) && /\{lead && !searching && category === "all" \? lead : null\}/.test(picker))
    check("moving an existing block in is the same one edit a drop makes", /const next = moveIntoGroup\(blocksInOrder\(\), id, groupId\)\s*if \(next\) reorderBlocks\(next\)\s*closeAddSheet\(\)/.test(c))
    check("a new block in a group starts with its catalogue entry's data", /const newBlock: OnePageBlock = data && !preset \? \{ \.\.\.created, data: \{ \.\.\.created\.data, \.\.\.data \}/.test(c))
    check("a child edit reads the group as it is now", /getLatestOnePage\(\)\?\.draft_blocks\.find\(\(b\) => b\.id === block\.id\)/.test(c))
    check("the rows are the picker's own rows", /data-group-candidate=\{row\.id\}/.test(existing) && /<BlockTile icon=\{Icon\} \/>/.test(existing))
    check("the live page draws a child with the renderer it uses anywhere (any type)", /<PublicBlockRenderer\s*block=\{child\}/.test(live) && /return isExtraBlock\(block\) \? <ExtraBlock/.test(live))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("4. Every block in the catalogue: settings, live renderer, the page's look")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const editorPart = code(tab.slice(tab.indexOf("function BlockEditor(")))
    const types = [...new Set(PICKER_ENTRIES.map((e) => e.type))]
    const rows: string[] = []
    for (const t of types) {
      const fresh = createDefaultBlock(t)
      const made = fresh.type === t && !!fresh.data && typeof fresh.id === "string"
      const editor = isExtraBlock({ type: t }) || new RegExp(`case "${t}"`).test(editorPart) || (t === "group" && /if \(block\.type === "group"\)/.test(editorPart))
      const renderer = isExtraBlock({ type: t }) || new RegExp(`case "${t}": \\{`).test(live)
      rows.push(`${t.padEnd(16)} made:${made ? "y" : "N"} editor:${editor ? "y" : "N"} live:${renderer ? "y" : "N"}`)
      check(`${t}: a new block, its settings and its live renderer`, made && editor && renderer)
    }
    console.log(rows.map((r) => `        ${r}`).join("\n"))

    /* The page's look on the blocks that are not links. A Pill, Large, Glow page with its own title font. */
    const theme = { ...defaultTheme, button_border_radius: 999, button_size: "large", button_hover_animation: "glow", button_style: "soft", button_color: "#0e7c66", title_font: "Playfair Display" } as OnePageTheme
    const html = (block: OnePageBlock, still = false) => renderToStaticMarkup(React.createElement(ExtraBlock, { block, look: { theme, scale: "live", still } }))
    const map = html(b("m", "map", { address: "1 Main St", show_button: true }))
    check("Open in Maps is the page's button and answers with its hover", /class="op-btn[^"]*"/.test(map) && /data-hover="glow"/.test(map) && /--op-accent:#0e7c66/.test(map.replace(/\s/g, "")))
    check("and stays still inside a group, as a link does", /data-hover="none"/.test(html(b("m", "map", { address: "1 Main St", show_button: true }), true)))
    check("Large makes its padding larger", buttonPadScale(theme) > 1 && /padding:16\.8px 16px/.test(map), map.match(/padding:[^;"]+/g)?.join(" | "))
    check("the map frame stops at 22px on a Pill page (was an oval)", /border-radius:22px/.test(map.replace(/\s/g, "")) && boxRadius(theme) === 22)
    const faq = html(b("f", "faq", { items: [{ id: "q", question: "Shipping?", answer: "Yes" }] }))
    check("the FAQ boxes stop at 22px, and ring under a pointer as a card does", /border-radius:22px/.test(faq.replace(/\s/g, "")) && /class="op-card/.test(faq))
    check("the FAQ wears the Soft fill of the page's colour", /color-mix\(in srgb, #0e7c66 14%, transparent\)/.test(faq))
    const heading = html(b("t", "heading", { text: "Shop", size: "medium", alignment: "center" }))
    check("the Heading block takes Typography's title font", /font-family:.{0,12}Playfair Display/.test(heading), heading)
    const video = html(b("v", "video", { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }))
    check("the video frame stops at 22px", /border-radius:22px/.test(video.replace(/\s/g, "")))
    const contact = html(b("c", "contact_form", { title: "Write", offer_signup: false }))
    check("the contact form's Send is the page's button with its hover, its wash a colour mix", /data-hover="glow"/.test(contact) && /class="op-btn/.test(contact) && /color-mix\(in srgb, #0e7c66 6%, transparent\)/.test(contact))
    const magnet = html(b("l", "lead_magnet", { kind: "waitlist", title: "Join the waitlist", button_text: "Join" }))
    check("a lead magnet is the page's button with its hover", /data-onepage-magnet="waitlist"/.test(magnet) && /data-hover="glow"/.test(magnet))
    check("a colour saved as rgb() or #abc still makes a wash", tintOf("rgb(1,2,3)", 6).includes("rgb(1,2,3) 6%") && tintOf("#abc", 6).includes("#abc 6%"))
    check("pressableProps is the link's own hover pair", pressableProps(theme).className === "op-btn" && pressableProps(theme)["data-hover"] === "glow" && pressableProps(theme, true)["data-hover"] === "none")

    const pdf = live.slice(live.indexOf('    case "pdf_document": {'), live.indexOf('    case "course":'))
    check("PDF, Menu and Booking answer with the page's hover (they had a fixed fade)", (pdf.match(/const hoverEffect = "op-btn"/g) ?? []).length === 3 && (pdf.match(/\{\.\.\.pageHover\}/g) ?? []).length === 6 && (pdf.match(/\.\.\.buttonHoverVars\(theme\),/g) ?? []).length === 3 && !/hover:opacity-90/.test(pdf))
    check("and none of them transitions everything", !/transition-all/.test(pdf))
    check("one rule for the button's look: extra-blocks reads lib/onepage/button-style", /return pageButtonStyle\(theme\)/.test(read("components/onepage/extra-blocks.tsx")))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("5. The preview is the live page")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const preview = read("components/onepage/live-preview.tsx")
    check("the preview draws the page from the draft with the live page's shape", /publicOnePageFromDraft/.test(preview))
    check("the blocks get one look on both, with no editor-only colours", /ExtraBlockPreviewContext/.test(live) && /scale: "live"/.test(live))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("Motion and words")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const fresh = ["components/onepage/group-add-existing.tsx", "lib/onepage/block-look.ts", "components/onepage/reveal.tsx", "components/onepage/block-remove.tsx", "lib/onepage/group.ts", "components/onepage/extra-blocks.tsx", "components/onepage/creator-blocks.tsx", "components/onepage/storelib-blocks.tsx"]
    const sources = fresh.map((f) => [f, read(f)] as const)
    const moving = sources.filter(([, s]) => /transition-transform|transition-all|transition:\s*transform/.test(code(s)))
    check("no file here transitions transform or everything", moving.length === 0, moving.map(([f]) => f).join(", "))
    const banned = /\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform your)\b/i
    const words = sources.filter(([, s]) => banned.test(s) || /—/.test(s))
    check("no AI words and no em dashes", words.length === 0, words.map(([f]) => f).join(", "))
    check("the group child's switch moves by translate, not transform", /shadow transition-\[translate\]/.test(tab))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}

main()
