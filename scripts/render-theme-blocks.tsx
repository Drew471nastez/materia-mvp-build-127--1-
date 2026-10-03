/**
 * ===========================================================================
 *  THEME BLOCKS ON A PAGE, AND IN THE SIDEBAR, FOR A BROWSER TO MEASURE
 * ===========================================================================
 * Served by scripts/check-theme-blocks.mjs. The real engine draws the real
 * library sections from their presets, exactly as the canvas and the live
 * site do (renderStorelibSection), and the real sidebar list draws a tree
 * with a static row, a group and the blocks inside it.
 */
import React from "react"
import { createRoot } from "react-dom/client"

import { renderStorelibSection } from "@/lib/website-builder/storelib-runtime"
import { STORELIB_SCHEMAS } from "@/lib/website-builder/storelib-schemas"
import { freshBlocks } from "@/lib/website-builder/block-tree"
import { SectionBlockList } from "@/components/website-builder/editor/section-block-list"
import { AddBlockButton } from "@/components/website-builder/editor/add-block-button"
import type { BlockInstance, SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

declare global {
  interface Window { __ready: boolean }
}

let n = 0
const mint = (t: string) => `${t}-${++n}`
function fromPreset(type: string, name: string): SectionInstance {
  const schema = STORELIB_SCHEMAS[type]
  const preset = schema.presets!.find((p) => p.name === name)!
  return { id: `${type}-1`, type, name: schema.name, settings: preset.settings ?? {}, blocks: freshBlocks(preset.blocks, mint) }
}

const theme = {} as ThemeSettingsValues
const sections = [fromPreset("blocks_section", "Image with text"), fromPreset("image_grid", "Image grid"), fromPreset("blocks_section", "Three columns")]
const drawn = sections.map((s) => renderStorelibSection(s, theme, { template: "index", in_editor: true }))

function Canvas() {
  return (
    <div id="canvas">
      {drawn.map((d, i) => (d.ok ? (
        <div key={i} data-probe-section={sections[i].type + i}>
          <style dangerouslySetInnerHTML={{ __html: d.css }} />
          <div dangerouslySetInnerHTML={{ __html: d.html }} />
        </div>
      ) : <pre key={i}>{JSON.stringify(d.errors)}</pre>))}
    </div>
  )
}

const tree: BlockInstance[] = [
  { id: "title", type: "heading", static: true, settings: { text: "From the studio" } },
  { id: "row", type: "group", settings: {}, blocks: [{ id: "a", type: "text", settings: { text: "<p>Words</p>" } }, { id: "b", type: "image", settings: {} }] },
  { id: "pic", type: "image", settings: {}, hidden: true },
]

function Sidebar() {
  const [selected, setSelected] = React.useState<string | null>("row/b")
  const level = (parent: string[], list: BlockInstance[]): React.ReactNode => (
    <SectionBlockList<BlockInstance>
      blocks={list.filter((b) => !b.static)}
      fixed={list.filter((b) => b.static)}
      rowKey={(b) => [...parent, b.id].join("/")}
      selectedId={selected}
      onSelect={setSelected}
      onReorder={() => {}}
      onDuplicate={() => {}}
      onRemove={() => {}}
      onToggleHidden={() => {}}
      title={(b) => ({ name: b.type[0].toUpperCase() + b.type.slice(1) })}
      fields={(b) => (b.blocks ? <div data-probe-children={b.id}>{level([...parent, b.id], b.blocks)}<AddBlockButton options={[{ type: "text", name: "Text", fields: [] }, { type: "image", name: "Image", fields: [] }]} onAdd={() => {}} /></div> : <p>fields</p>)}
    />
  )
  return <aside id="sidebar" style={{ width: 288, background: "#fff", padding: 14 }}>{level([], tree)}</aside>
}

createRoot(document.getElementById("app")!).render(
  <div>
    <Canvas />
    <Sidebar />
  </div>,
)
requestAnimationFrame(() => requestAnimationFrame(() => { window.__ready = true }))
