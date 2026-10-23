/**
 * The sidebar's sections list and a section's block tree, for
 * scripts/check-sidebar-dnd.mjs: the real SectionsList and BlockTreeLevel,
 * in a scroller shaped like the sidebar's, beside a "canvas" that draws the
 * page's sections and blocks from the same state the list commits to, as
 * the editor's canvas does. What was last saved, and how many times, is on
 * `window`, so the check reads what a drop committed.
 *
 *   ?many   thirty sections in a short scroller, for the edge scroll
 */
import { createRoot } from "react-dom/client"
import { createElement as h, useState } from "react"

import { SectionsList } from "@/components/website-builder/editor/sections-list"
import { BlockTreeLevel, type TreeBlock } from "@/components/website-builder/editor/block-tree-rows"
import type { SectionInstance } from "@/lib/website-builder/types"

declare global {
  interface Window {
    __order: string[]
    __blocks: string[]
    __nested: string[]
    __saves: { sections: number; blocks: number; nested: number }
  }
}

const many = new URLSearchParams(location.search).has("many")
const NAMES = ["Hero", "Featured products", "Image with text", "Testimonials", "FAQ", "Newsletter", "Gallery", "Video", "Logos", "Contact"]
const COUNT = many ? 30 : 10
const START: SectionInstance[] = [
  { id: "hdr", type: "header", name: "Header", settings: {} },
  ...Array.from({ length: COUNT }, (_, i) => ({ id: `s${i}`, type: "rich_text", name: NAMES[i % NAMES.length] + (i >= NAMES.length ? ` ${i + 1}` : ""), settings: {} })),
  { id: "ftr", type: "footer", name: "Footer", settings: {} },
]
type B = TreeBlock & { name: string }
const BLOCKS: B[] = ["Heading", "Text", "Button", "Image", "Quote"].map((name, i) => ({ id: `b${i}`, type: "item", settings: {}, name }))
const STATIC: B[] = [{ id: "static", type: "title", settings: {}, static: true, name: "Title (placed by the section)" }]
const NESTED: B[] = ["One", "Two", "Three"].map((name, i) => ({ id: `c${i}`, type: "item", settings: {}, name }))

window.__order = START.filter((s) => s.id.startsWith("s")).map((s) => s.id)
window.__blocks = BLOCKS.map((b) => b.id)
window.__nested = NESTED.map((b) => b.id)
window.__saves = { sections: 0, blocks: 0, nested: 0 }

function App() {
  const [sections, setSections] = useState(START)
  const [blocks, setBlocks] = useState(BLOCKS)
  const [nested, setNested] = useState(NESTED)
  const [selected, setSelected] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set(["s1"]))

  const reorder = (fromId: string, toId: string) => {
    setSections((prev) => {
      const body = prev.filter((s) => s.id.startsWith("s"))
      const from = body.findIndex((s) => s.id === fromId)
      const to = body.findIndex((s) => s.id === toId)
      if (from < 0 || to < 0 || from === to) return prev
      const next = [...body]
      const [m] = next.splice(from, 1)
      next.splice(to, 0, m)
      window.__order = next.map((s) => s.id)
      window.__saves.sections++
      return [prev[0], ...next, prev[prev.length - 1]]
    })
  }

  const nestedLevel = h(BlockTreeLevel<B>, {
    blocks: nested,
    depth: 3,
    rowKey: (b: B) => `s1/b0/${b.id}`,
    title: (b: B) => ({ name: b.name }),
    selectedKey: null,
    onSelect: () => {},
    onReorder: (next: B[]) => {
      window.__nested = next.map((b) => b.id)
      window.__saves.nested++
      setNested(next)
    },
  })

  const blocksOf = (s: SectionInstance) =>
    s.id === "s1"
      ? h(BlockTreeLevel<B>, {
          blocks,
          fixed: STATIC,
          depth: 2,
          rowKey: (b: B) => `s1/${b.id}`,
          title: (b: B) => ({ name: b.name }),
          selectedKey: null,
          onSelect: () => {},
          onReorder: (next: B[]) => {
            window.__blocks = next.map((b) => b.id)
            window.__saves.blocks++
            setBlocks(next)
          },
          hasChildren: (b: B) => b.id === "b0",
          children: () => nestedLevel,
        })
      : null

  const list = h(SectionsList, {
    sections,
    nameOf: (s: SectionInstance) => s.name,
    selectedId: selected,
    onSelect: setSelected,
    onToggleHide: () => {},
    onDuplicate: () => {},
    onRemove: () => {},
    onMove: () => {},
    onAdd: () => {},
    dnd: { onReorder: reorder },
    blocksOf,
    expanded,
    onToggleExpand: (id: string) =>
      setExpanded((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      }),
  })

  const canvas = h(
    "div",
    { id: "canvas", style: { flex: 1, padding: 16, minWidth: 0 } },
    ...sections
      .filter((s) => s.id.startsWith("s"))
      .map((s) =>
        h(
          "section",
          { key: s.id, "data-canvas-section": s.id, style: { padding: 8, borderBottom: "1px solid #eee" } },
          s.name,
          s.id === "s1" ? h("div", { "data-canvas-blocks": "" }, ...blocks.map((b) => h("span", { key: b.id, "data-canvas-block": b.id }, b.name + " "))) : null,
        ),
      ),
  )

  return h(
    "div",
    /* On a phone the canvas sits under the sheet, as the editor's does; side by side on a computer. */
    { style: { display: "flex", flexDirection: innerWidth < 600 ? "column" : "row", height: innerWidth < 600 ? "auto" : "100vh" } },
    h("div", { "data-wb-sidebar-scroll": "", id: "scroller", style: { height: many ? "420px" : "100vh", overflowY: "auto", width: innerWidth < 600 ? "100%" : "320px", flex: "none" }, className: "bg-white px-2 py-3" }, list),
    canvas,
  )
}

createRoot(document.getElementById("app")!).render(h(App))
