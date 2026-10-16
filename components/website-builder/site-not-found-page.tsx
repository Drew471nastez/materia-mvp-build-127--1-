"use client"

import { useEffect } from "react"

import { StorelibSourcesProvider, type RenderedSection } from "@/components/website-builder/sections/storelib-sources"
import { ThemePage } from "@/components/website-builder/theme/ThemePage"
import { SiteDocument } from "@/components/website-builder/site-document"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

/** What `/not_found` answers with: lib/website-builder/published-site.ts, NotFoundPage. */
export interface NotFoundPayload {
  template: string
  title: string
  theme: ThemeSettingsValues
  sections: SectionInstance[]
  prerendered: Record<string, RenderedSection>
  storefront: { creatorId: string; installId: string; words?: Record<string, string> }
}

/**
 * The creator's 404 page, drawn the way every page of their site is: the
 * theme page around sections the server already rendered. Loaded only on a
 * creator's site, so Storelib's own 404 never downloads the theme.
 */
export function SiteNotFoundPage({ page }: { page: NotFoundPayload }) {
  useEffect(() => {
    /* The root 404's title is Storelib's; this is the creator's site. */
    if (page.title) document.title = page.title
  }, [page.title])

  return (
    <StorelibSourcesProvider prerendered={page.prerendered} page={{ template: page.template }}>
      <ThemePage theme={page.theme} sections={page.sections} storefront={page.storefront} emptyDetail="" />
      <SiteDocument />
    </StorelibSourcesProvider>
  )
}
