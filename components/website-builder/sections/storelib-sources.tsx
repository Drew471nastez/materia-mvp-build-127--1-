"use client"

/**
 * ===========================================================================
 *  WHAT A .storelib SECTION NEEDS, AND WHERE IT COMES FROM
 * ===========================================================================
 * A section in this format is markup and scoped CSS produced from its source
 * file. Two surfaces need that, and they need it differently:
 *
 *   THE PUBLISHED SITE renders once, on the server, and never again. The
 *   visitor's browser has the finished HTML and the finished CSS in the page
 *   it was sent; recompiling them there would produce the same two strings
 *   at the cost of shipping the compiler — postcss included, measured at
 *   160 KB — to every visitor of every creator's site.
 *
 *   THE EDITOR renders on every keystroke. It must have the compiler, and it
 *   does: the editor wraps its canvas in StorelibLiveProvider, which is the
 *   only thing in the tree that imports the engine.
 *
 * So this file carries no engine at all. It carries what a section was
 * rendered as (`prerendered`), or a function that can render one (`render`),
 * and StorelibSection asks for whichever is there. The published page
 * supplies the first from the server; the editor supplies the second.
 */
import { createContext, useContext, useMemo, type ReactNode } from "react"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

/** What a section was rendered as: its markup and its stylesheet. */
export interface RenderedSection {
  html: string
  css: string
  /** The checked script, for the sandbox frame. Absent when there is none. */
  script?: string | null
  capabilities?: string[]
}

export type SectionRenderFn = (
  section: SectionInstance,
  theme: ThemeSettingsValues,
) =>
  | { ok: true; html: string; css: string; script?: string | null; capabilities?: string[] }
  | { ok: false; errors: { file?: string; line?: number; message: string }[] }

interface StorelibContextValue {
  /** Already rendered, by section id. The published page's whole answer. */
  prerendered: Record<string, RenderedSection>
  /** An imported theme's stylesheet for the whole page (layout/theme.storelib), compiled. Empty for every other theme. */
  layoutCss?: string
  /** Renders one now. Present in the editor, absent on a published page. */
  render?: SectionRenderFn
  /**
   * Which template these sections are on: "index", "product", "page.about".
   * A section reads it as `page.template`, and `allowed_templates` is
   * written against it, so a hardcoded "index" is not a default — it is a
   * wrong answer everywhere but the home page.
   */
  page: { template: string; [key: string]: unknown }
}

const EMPTY: StorelibContextValue = { prerendered: {}, page: { template: "index" } }
const StorelibContext = createContext<StorelibContextValue>(EMPTY)

/**
 * The published page's provider: sections already rendered on the server.
 * No engine reaches the browser through this.
 */
export function StorelibSourcesProvider({
  prerendered,
  page,
  children,
}: {
  prerendered: Record<string, RenderedSection>
  page?: { template: string; [key: string]: unknown }
  children: ReactNode
}) {
  const value = useMemo(
    () => ({ prerendered, page: page ?? EMPTY.page, layoutCss: prerendered["@layout"]?.css ?? "" }),
    [prerendered, page],
  )
  return <StorelibContext.Provider value={value}>{children}</StorelibContext.Provider>
}

/** For StorelibLiveProvider, which is the only caller that has a renderer. */
export function StorelibRenderProvider({
  render,
  page,
  layoutCss,
  children,
}: {
  render: SectionRenderFn
  page?: { template: string; [key: string]: unknown }
  layoutCss?: string
  children: ReactNode
}) {
  const value = useMemo(
    () => ({ prerendered: EMPTY.prerendered, render, page: page ?? EMPTY.page, layoutCss: layoutCss ?? "" }),
    [render, page, layoutCss],
  )
  return <StorelibContext.Provider value={value}>{children}</StorelibContext.Provider>
}

export function useStorelibContext(): StorelibContextValue {
  return useContext(StorelibContext)
}

export function useStorelibPage(): { template: string } {
  return useContext(StorelibContext).page
}
