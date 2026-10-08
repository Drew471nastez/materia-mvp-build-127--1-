/**
 * The probe page for scripts/check-canvas-stability.mjs: the builder's canvas
 * as the editor draws it, with nothing standing in for the code under test.
 * StorelibLiveProvider renders each section in the browser exactly as the
 * editor does (components/website-builder/sections/storelib-live.tsx), the
 * real StorelibSection applies every new markup as a change
 * (lib/website-builder/morph-html.ts), the page's picture fade is installed
 * on the root (lib/website-builder/media-fade.ts) under the theme's own
 * stylesheet (lib/website-builder/theme-css.ts), and the cart is the real
 * cart provider with the real hooks.
 *
 * The sections are a product grid an agent might write
 * (scripts/fixtures/ai-product-grid.storelib), a built-in one
 * (themes/default/sections/product_grid.storelib) and a section with its own
 * cart (scripts/fixtures/own-cart.storelib). `window.__canvas` changes what a
 * sidebar would: a setting, the theme, the product list (a refetch), the
 * order, a duplicate, an undo.
 */
import { useEffect, useMemo, useRef, useState } from "react"
import { createRoot } from "react-dom/client"
import { flushSync } from "react-dom"
import { SiteCartProvider } from "@/components/website-builder/site-cart"
import { StorelibLiveProvider } from "@/components/website-builder/sections/storelib-live"
import { StorelibSection } from "@/components/website-builder/sections/StorelibSection"
import { installMediaFade } from "@/lib/website-builder/media-fade"
import { THEME_ROOT_ATTRIBUTE, themeStylesheet } from "@/lib/website-builder/theme-css"
import { toCard } from "@/lib/website-builder/shop-products"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

type Probe = { sources: Record<string, string> }
const { sources } = (window as unknown as { __PROBE__: Probe }).__PROBE__

const row = (i: number, round = 0) => ({
  id: `00000000-0000-4000-8000-00000000000${i}`,
  title: `Product ${i}`,
  slug: `product-${i}`,
  price_cents: 1000 + i * 100,
  compare_at_cents: null,
  thumbnail_url: `https://shop.example/img/p${i}.png`,
  gallery_urls: [],
  status: "published",
  type: i % 2 ? "physical" : "digital",
  _round: round,
})
/* What the editor's product list holds after a load: the same products, a new array each time. */
const loadCards = (round: number) => [1, 2, 3, 4, 5, 6].map((i) => { const { _round, ...r } = row(i, round); void _round; return toCard(r) })

const initial: SectionInstance[] = [
  { id: "ai-grid", type: "ai_product_grid", name: "Product grid", settings: { heading: "New in", limit: 6 }, blocks: [] } as unknown as SectionInstance,
  { id: "built-grid", type: "product_grid", name: "Product Grid", settings: { source: "shop", heading: "The shop" }, blocks: [] } as unknown as SectionInstance,
  { id: "own-cart-1", type: "own_cart", name: "Shop with its own cart", settings: {}, blocks: [] } as unknown as SectionInstance,
]

function Canvas() {
  const [sections, setSections] = useState<SectionInstance[]>(initial)
  const [theme, setTheme] = useState<ThemeSettingsValues>({} as ThemeSettingsValues)
  const [cards, setCards] = useState(() => loadCards(0))
  const history = useRef<SectionInstance[][]>([])
  const current = useRef(sections)
  current.current = sections
  const rootRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => (rootRef.current ? installMediaFade(rootRef.current) : undefined), [])
  const data = useMemo(() => ({ catalog: cards }), [cards])
  const css = useMemo(() => themeStylesheet(theme), [theme])

  useEffect(() => {
    const commit = (next: (s: SectionInstance[]) => SectionInstance[]) => {
      history.current.push(current.current)
      flushSync(() => setSections(next(current.current)))
    }
    ;(window as unknown as { __canvas: unknown }).__canvas = {
      setting(id: string, patch: Record<string, unknown>) {
        commit((s) => s.map((x) => (x.id === id ? { ...x, settings: { ...x.settings, ...patch } } : x)))
      },
      theme(patch: Record<string, unknown>) {
        flushSync(() => setTheme((t) => ({ ...t, ...patch }) as ThemeSettingsValues))
      },
      refetch(round: number) {
        flushSync(() => setCards(loadCards(round)))
      },
      reorder() {
        commit((s) => [s[1], s[0], ...s.slice(2)])
      },
      duplicate(id: string) {
        commit((s) => {
          const at = s.findIndex((x) => x.id === id)
          const copy = { ...s[at], id: `${id}-copy`, settings: { ...s[at].settings } }
          return [...s.slice(0, at + 1), copy, ...s.slice(at + 1)]
        })
      },
      remove(id: string) {
        commit((s) => s.filter((x) => x.id !== id))
      },
      undo() {
        const prev = history.current.pop()
        if (prev) flushSync(() => setSections(prev))
      },
    }
  }, [])

  return (
    <StorelibLiveProvider sources={sources} page={{ template: "index" }} inEditor products={cards} data={data}>
      <style>{css}</style>
      <div ref={rootRef} {...{ [THEME_ROOT_ATTRIBUTE]: "" }} data-probe-root="">
        {sections.map((section) => (
          <StorelibSection key={section.id} section={section} theme={theme} isEditing insideEditor />
        ))}
      </div>
    </StorelibLiveProvider>
  )
}

createRoot(document.getElementById("app")!).render(
  <SiteCartProvider shopId="shop-1">
    <Canvas />
  </SiteCartProvider>,
)
;(window as unknown as { __render: string }).__render = "ok"
