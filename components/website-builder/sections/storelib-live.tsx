"use client"

/**
 * THE COMPILER, WHERE IT IS ACTUALLY NEEDED.
 *
 * The editor re-renders a section whenever a setting moves, so it compiles
 * in the browser. This file is the only place in the component tree that
 * imports the engine, which is what keeps it out of every published site's
 * bundle — see storelib-sources.tsx.
 */
import { useCallback, useMemo, type ReactNode } from "react"
import { renderStorelibSection } from "@/lib/website-builder/storelib-runtime"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"
import type { RenderContext } from "@/lib/storelib-theme/types"
import { StorelibRenderProvider, type SectionRenderFn } from "./storelib-sources"
import { wishlistObject, type StorefrontGlobals } from "@/lib/storelib-theme/globals"

type Card = NonNullable<RenderContext["products"]>[number]

/** Two made up products, for a store that has none published yet. */
const PLACEHOLDER_CARDS: Card[] = [
  { id: "00000000-0000-4000-8000-000000000001", type: "product", settings: { title: "Your product", price: "$24.00", compare_price: "", image: "", url: "", tag: "" } },
  { id: "00000000-0000-4000-8000-000000000002", type: "product", settings: { title: "Another product", price: "$12.00", compare_price: "", image: "", url: "", tag: "" } },
]

/** What the canvas draws the account and wishlist templates with. Nothing on any other page. */
export function editorGlobals(template: string, products: Card[]): StorefrontGlobals | undefined {
  if (template !== "page.account" && template !== "page.wishlist") return undefined
  const cards = products.length > 0 ? products.slice(0, 4) : PLACEHOLDER_CARDS
  const wishlist = wishlistObject(cards, template === "page.account")
  if (template === "page.wishlist") return { wishlist }
  const orders = cards.slice(0, 2).map((c, i) => ({
    id: c.id,
    title: String(c.settings.title ?? ""),
    image: String(c.settings.image ?? ""),
    url: String(c.settings.url ?? ""),
    date: i === 0 ? "Sep 21, 2026" : "Aug 30, 2026",
    action_label: "Download",
    action_url: "#",
    price: String(c.settings.price ?? ""),
  }))
  return {
    customer: { name: "Alex Morgan", first_name: "Alex", email: "alex@example.com", orders, orders_count: orders.length },
    wishlist,
  }
}

export function StorelibLiveProvider({
  sources,
  page,
  inEditor,
  products,
  children,
}: {
  /** Saved `.storelib` files, path to source. The bundled theme is the fallback. */
  sources: Record<string, string>
  page?: { template: string }
  /**
   * Whether this is the builder drawing. A section with no blocks yet has to
   * say so to the person adding them and nothing at all to a visitor, and
   * `page.in_editor` is the only way a template can tell the two apart. It is
   * false unless something sets it, so a surface that forgets shows a visitor
   * the visitor's version, which is the safe way round.
   */
  inEditor?: boolean
  /**
   * The creator's published products, block-shaped, for the sections that
   * draw the catalogue. The canvas has to be given the same list the
   * published page is given, or the two surfaces disagree about what the
   * site says — which is the one thing tests/storelib-parity.test.ts is for.
   * Absent means none, and a section that asks for products draws none,
   * which is what the section library's thumbnails want.
   */
  products?: RenderContext["products"]
  children: ReactNode
}) {
  const template = page?.template ?? "index"
  /*
    THE ACCOUNT PAGES, DRAWN WITH SOMEBODY ON THEM. A creator designing the
    account page or the wishlist is nobody's visitor, and an account page with
    no customer is a page that only ever shows its signed out line. So the
    canvas draws them for a made up customer whose orders and saved items are
    the creator's own products, on those two pages only, which is where the
    live site has a visitor to draw them for.
  */
  const globals = useMemo(() => (inEditor === true ? editorGlobals(template, products ?? []) : undefined), [inEditor, template, products])
  const render = useCallback<SectionRenderFn>(
    (section: SectionInstance, theme: ThemeSettingsValues) =>
      renderStorelibSection(section, theme, { template, in_editor: inEditor === true }, sources, products, globals),
    [sources, template, inEditor, products, globals],
  )
  /* The same object while the template is the same. Inline, it was a new
     context value on every render of the canvas, and every section that reads
     the context rendered again with it, past SectionRenderer's memo. */
  const pageValue = useMemo(() => ({ template }), [template])
  return (
    <StorelibRenderProvider render={render} page={pageValue}>
      {children}
    </StorelibRenderProvider>
  )
}
