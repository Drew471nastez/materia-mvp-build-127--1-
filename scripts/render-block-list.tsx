/**
 * A section's block list, mounted for scripts/check-block-list.mjs: an FAQ's
 * questions, drawn by the same component the editor page uses, inside a
 * scroller shaped like the phone sheet's. What it last saved is on `window`,
 * so the probe can read the order a drag committed and count the saves.
 */
import { createRoot } from "react-dom/client"
import { createElement as h, useState } from "react"

import { SectionBlockList, type ListBlock } from "@/components/website-builder/editor/section-block-list"

declare global {
  interface Window {
    __blocks: ListBlock[]
    __saves: number
  }
}

const many = new URLSearchParams(location.search).has("many")
const START: ListBlock[] = Array.from({ length: many ? 14 : 5 }, (_, i) => ({
  id: `q${i + 1}`,
  type: "question",
  settings: { question: `Question ${i + 1}`, answer: "An answer." },
}))
window.__blocks = START
window.__saves = 0

function App() {
  const [blocks, setBlocks] = useState(START)
  const [selected, setSelected] = useState<string | null>(null)
  const save = (next: ListBlock[]) => {
    window.__blocks = next
    window.__saves++
    setBlocks(next)
  }
  let n = 0
  const list = h(SectionBlockList<ListBlock>, {
    blocks,
    selectedId: selected,
    onSelect: setSelected,
    onReorder: save,
    onDuplicate: (id) => {
      const at = blocks.findIndex((b) => b.id === id)
      const copy = { ...blocks[at], id: `copy${Date.now()}${n++}` }
      save([...blocks.slice(0, at + 1), copy, ...blocks.slice(at + 1)])
      setSelected(copy.id)
    },
    onRemove: (id) => save(blocks.filter((b) => b.id !== id)),
    title: () => ({ name: "Question" }),
    fields: (b) =>
      h(
        "label",
        { className: "block" },
        h("span", { className: "mb-1.5 block text-xs font-medium text-muted-foreground" }, "Question"),
        h("input", { className: "w-full h-9 px-3 text-sm border border-border rounded-lg", defaultValue: String(b.settings.question) }),
      ),
  })
  return h(
    "div",
    { "data-sheet-scroll": "", id: "scroller", style: { height: many ? "420px" : "auto", overflowY: "auto" }, className: "p-4" },
    h("p", { className: "text-xs font-semibold mb-3" }, "Questions"),
    list,
  )
}

createRoot(document.getElementById("app")!).render(h(App))
