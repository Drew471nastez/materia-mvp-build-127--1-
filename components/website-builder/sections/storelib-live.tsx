"use client"

/**
 * THE COMPILER, WHERE IT IS ACTUALLY NEEDED.
 *
 * The editor re-renders a section whenever a setting moves, so it compiles
 * in the browser. This file is the only place in the component tree that
 * imports the engine, which is what keeps it out of every published site's
 * bundle — see storelib-sources.tsx.
 */
import { useCallback, type ReactNode } from "react"
import { renderStorelibSection } from "@/lib/website-builder/storelib-runtime"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"
import type { RenderContext } from "@/lib/storelib-theme/types"
import { StorelibRenderProvider, type SectionRenderFn } from "./storelib-sources"

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
  const render = useCallback<SectionRenderFn>(
    (section: SectionInstance, theme: ThemeSettingsValues) =>
      renderStorelibSection(section, theme, { template, in_editor: inEditor === true }, sources, products),
    [sources, template, inEditor, products],
  )
  return (
    <StorelibRenderProvider render={render} page={{ template }}>
      {children}
    </StorelibRenderProvider>
  )
}
