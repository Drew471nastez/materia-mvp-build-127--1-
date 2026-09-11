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
import { StorelibRenderProvider, type SectionRenderFn } from "./storelib-sources"

export function StorelibLiveProvider({
  sources,
  page,
  children,
}: {
  /** Saved `.storelib` files, path to source. The bundled theme is the fallback. */
  sources: Record<string, string>
  page?: { template: string }
  children: ReactNode
}) {
  const template = page?.template ?? "index"
  const render = useCallback<SectionRenderFn>(
    (section: SectionInstance, theme: ThemeSettingsValues) =>
      renderStorelibSection(section, theme, { template }, sources),
    [sources, template],
  )
  return (
    <StorelibRenderProvider render={render} page={{ template }}>
      {children}
    </StorelibRenderProvider>
  )
}
