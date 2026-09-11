"use client"

/**
 * THE FILES A PERSON SAVED, ON THEIR WAY TO THE CANVAS.
 *
 * A section renders from its .storelib source. The default theme's sources
 * are in the bundle; the ones a person edited in the code editor are rows
 * in store_theme_custom_files. This context carries those rows — path to
 * source — from whoever loaded them (the editor page, the published page)
 * to every StorelibSection under it, which asks the runtime to render with
 * them as overrides. No override, and the bundled source renders, which is
 * why the default is an empty map and never undefined.
 */
import { createContext, useContext, type ReactNode } from "react"

const StorelibSourcesContext = createContext<Record<string, string>>({})

export function StorelibSourcesProvider({ sources, children }: { sources: Record<string, string>; children: ReactNode }) {
  return <StorelibSourcesContext.Provider value={sources}>{children}</StorelibSourcesContext.Provider>
}

export function useStorelibSources(): Record<string, string> {
  return useContext(StorelibSourcesContext)
}
