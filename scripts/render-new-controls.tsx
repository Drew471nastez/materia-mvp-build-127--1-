/**
 * ===========================================================================
 *  THE U ROUND'S CONTROLS, FOR A BROWSER TO MEASURE
 * ===========================================================================
 * Served by scripts/check-new-controls.mjs. The real components the sidebar
 * draws, each in a column the sidebar's width (320px less its 12px padding
 * each side), under a label drawn the way FieldEditor draws one, holding
 * its value the way the editor does:
 *
 *   collection-empty, collection-set    collection_picker
 *   collections                         collection_list with two chosen
 *   number                              number with a unit
 *   font                                font_picker
 *   css                                 Theme settings › Custom CSS, with a line it leaves out
 *   collection-off                      the picker while collections are switched off
 *
 * And a themed page, `#page`, carrying the theme's stylesheet for a set of
 * Product cards, Inputs and Badges values, so the probe can read what they
 * do to real markup.
 */
import React from "react"
import { createRoot } from "react-dom/client"

import { EditorFieldProvider, type EditorFieldEnv } from "@/components/website-builder/editor/controls/context"
import { CollectionListControl, CollectionPickerControl } from "@/components/website-builder/editor/controls/collection-controls"
import { NumberControl } from "@/components/website-builder/editor/controls/number-control"
import { FontPickerControl } from "@/components/website-builder/editor/controls/font-picker-control"
import { CssControl } from "@/components/website-builder/editor/controls/css-control"
import { THEME_ROOT_ATTRIBUTE, themeStylesheet, themeVars } from "@/lib/website-builder/theme-css"
import type { ThemeSettingsValues } from "@/lib/website-builder/types"

declare global {
  interface Window {
    __ready: boolean
  }
}

const COLUMN = 320 - 24

const env = (collections: EditorFieldEnv["collections"]): EditorFieldEnv => ({ products: [], menus: {}, template: "index", collections })
const COLLECTIONS: EditorFieldEnv["collections"] = [
  { id: "c1", title: "Kitchen", image: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='4' height='4'><rect width='4' height='4' fill='%23d6c7b0'/></svg>", published: true, products_count: 12 },
  { id: "c2", title: "Under forty, a long collection name that has to truncate", image: "", published: true, products_count: 1 },
  { id: "c3", title: "Drafts", image: "", published: false, products_count: 3 },
]

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div id={id} data-field="" style={{ width: COLUMN }}>
      <label className="text-xs font-medium text-muted-foreground mb-1.5 block" data-label="">{label}</label>
      {children}
    </div>
  )
}

function Stateful<T>({ initial, render }: { initial: T; render: (v: T, set: (v: T) => void) => React.ReactNode }) {
  const [v, set] = React.useState(initial)
  return <div data-value={JSON.stringify(v)}>{render(v, set)}</div>
}

const THEME = {
  product_card_style: "card",
  product_card_radius: 16,
  product_card_border: 1,
  product_card_image_padding: 8,
  product_card_align: "center",
  input_radius: 4,
  input_border_width: 2,
  badge_position: "top_right",
  badge_radius: 4,
  badge_sale_bg: "#dc2626",
  badge_sale_color: "#ffffff",
} as unknown as ThemeSettingsValues

const S = '[data-section-id="s1"]'
const SECTION_CSS = [
  `${S} .card { position: relative; width: 240px; display: flex; flex-direction: column; }`,
  `${S} .card__media { position: relative; aspect-ratio: 1 / 1; overflow: hidden; border-radius: 8px; background: #e5e7eb; }`,
  `${S} .badges { position: absolute; top: 10px; left: 10px; display: flex; gap: 6px; }`,
  `${S} .tag { padding: 4px 9px; border-radius: 999px; font-size: 11px; background: #000; color: #fff; }`,
  `${S} .card__title { margin: 14px 0 0; font-size: 15px; }`,
  `${S} .card__price { margin: 8px 0 0; display: flex; gap: 8px; }`,
  `${S} .field { margin-top: 24px; height: 44px; border-radius: 8px; border: 1px solid #ccc; }`,
].join("\n")

function Harness() {
  React.useEffect(() => {
    window.__ready = true
  }, [])
  return (
    <div style={{ display: "flex", gap: 32, alignItems: "flex-start" }}>
      <aside style={{ width: 320, padding: 12, boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 16, borderRight: "1px solid #e5e7eb" }}>
        <EditorFieldProvider value={env(COLLECTIONS)}>
          <Field id="collection-empty" label="Collection">
            <Stateful initial="" render={(v, set) => <CollectionPickerControl value={v} onChange={set} label="Collection" />} />
          </Field>
          <Field id="collection-set" label="Collection">
            <Stateful initial="c1" render={(v, set) => <CollectionPickerControl value={v} onChange={set} label="Collection" />} />
          </Field>
          <Field id="collections" label="Collections to show">
            <Stateful initial={["c1", "c2"] as string[]} render={(v, set) => <CollectionListControl value={v} onChange={set} label="Collections to show" />} />
          </Field>
          <Field id="number" label="Free shipping threshold">
            <Stateful initial={50} render={(v, set) => <NumberControl value={v} onChange={set} min={0} unit="$" label="Free shipping threshold" />} />
          </Field>
          <Field id="font" label="Heading font">
            <Stateful initial="Lora" render={(v, set) => <FontPickerControl value={v} onChange={set} label="Heading font" />} />
          </Field>
          <Field id="css" label="Custom CSS">
            <Stateful initial={".card__title { letter-spacing: 0.02em; }\n@import url(https://x.test/a.css);"} render={(v, set) => <CssControl value={v} onChange={set} label="Custom CSS" />} />
          </Field>
        </EditorFieldProvider>
        <EditorFieldProvider value={env(null)}>
          <Field id="collection-off" label="Collection">
            <CollectionPickerControl value="" onChange={() => {}} label="Collection" />
          </Field>
        </EditorFieldProvider>
      </aside>

      <div id="page" {...{ [THEME_ROOT_ATTRIBUTE]: "" }} style={{ ...(themeVars(THEME) as React.CSSProperties), width: 600, color: "#1a1a2e", background: "#fff" }}>
        <style dangerouslySetInnerHTML={{ __html: themeStylesheet(THEME) }} />
        {/* The section's own stylesheet, scoped the way the engine scopes one (0,2,0), as product_grid writes it. */}
        <style dangerouslySetInnerHTML={{ __html: SECTION_CSS }} />
        <section data-section="" data-section-id="s1" style={{ padding: 24 }}>
          <article id="card" className="card" data-card="product">
            <div id="media" className="card__media" data-card-media>
              <span id="badges" className="badges" data-badges>
                <span id="sale" className="tag" data-badge="sale">Sale</span>
              </span>
            </div>
            <h3 id="title" className="card__title">Linen apron</h3>
            <p id="price" className="card__price">$48.00</p>
          </article>
          <input id="field" className="field" type="search" placeholder="Search" />
        </section>
      </div>
    </div>
  )
}

createRoot(document.getElementById("app")!).render(<Harness />)
