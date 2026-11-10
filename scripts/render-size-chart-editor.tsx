/**
 * WAVE 10: THE PRODUCT EDITOR'S SIZE CHART DIALOG, ALONE.
 *
 * The real SizeChartEditor (components/physical/size-chart-editor) over a
 * stand-in of the product editor, opened by the "Edit" button the Size
 * chart card has. ?new=1 opens a new chart. Saving is answered by a fetch
 * that returns the chart, after 300ms. window.__open() and __close() drive
 * it, so a probe can film the opening and the closing.
 */
import { createRoot } from "react-dom/client"
import { createElement as h, useState } from "react"
import { SizeChartEditor, type SavedSizeChart } from "@/components/physical/size-chart-editor"

const q = new URLSearchParams(location.search)
const CHART: SavedSizeChart = {
  id: "c1",
  name: "Tees",
  unit: "cm",
  columns: [{ name: "Size", measure: false }, { name: "Chest", measure: true }, { name: "Length", measure: true }, { name: "Sleeve", measure: true }],
  rows: [["S", "92", "68", "20"], ["M", "98", "70", "21"], ["L", "104", "72", "22"], ["XL", "110", "74", "23"]],
  notes: "Measured flat. Runs small, so size up if you are between sizes.",
  imageUrl: null,
  productCount: 3,
  collectionIds: [],
  categories: [],
}
const w = window as unknown as { fetch: typeof fetch; __open: () => void; __close: () => void; __saved: number }
w.__saved = 0
w.fetch = (async () => {
  await new Promise((r) => setTimeout(r, 300))
  w.__saved++
  return new Response(JSON.stringify({ id: "c1", charts: [CHART] }), { headers: { "content-type": "application/json" } })
}) as typeof fetch

function Page() {
  const [open, setOpen] = useState(true)
  const [mounted, setMounted] = useState(true)
  w.__open = () => {
    setMounted(true)
    setOpen(true)
  }
  w.__close = () => {
    setOpen(false)
    setTimeout(() => setMounted(false), 420)
  }
  return h(
    "div",
    { style: { minHeight: "100vh", background: "#f8f9fa", padding: 24, fontFamily: "Inter, system-ui, sans-serif" } },
    h("div", { style: { maxWidth: 720, margin: "0 auto", background: "#fff", borderRadius: 16, border: "1px solid #eceef1", padding: 20 } },
      h("p", { style: { fontWeight: 600, fontSize: 16, color: "#1a1a2e" } }, "Size chart"),
      h("p", { style: { fontSize: 13, color: "#6b7280" } }, "Tees · 4 sizes · Chest, Length, Sleeve"),
      h("button", { onClick: () => w.__open(), "data-open-editor": "" }, "Edit"),
    ),
    mounted ? h(SizeChartEditor, { open, chart: q.get("new") ? null : CHART, onClose: () => w.__close(), onSaved: () => w.__close(), uploadImage: async () => "", targets: { collections: [{ id: "k1", title: "Summer" }], categories: ["Tees"] }, rules: true }) : null,
  )
}
createRoot(document.getElementById("root")!).render(h(Page))
