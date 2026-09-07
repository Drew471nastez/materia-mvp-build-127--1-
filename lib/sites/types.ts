/**
 * Storelib Sites — the types the rest of the feature is written against.
 *
 * A Site is a `store_theme_installs` row with `kind = 'site'`. It is the same
 * row a storefront theme uses, and that is deliberate: the section schemas, the
 * 51 renderers, the registry, the theme settings and the draft/published split
 * are all already built against it. See docs/storelib-sites.md.
 *
 * Nothing here redefines a section or a section schema. `SectionInstance` and
 * `ThemeSettingsValues` come from lib/website-builder/types, unchanged — a
 * second definition of either is how two renderers start.
 */

import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

export type SiteKind = "storefront" | "site"
export type SiteStatus = "draft" | "published" | "unpublished"

/**
 * Free-text settings that belong to the SITE rather than to its theme.
 *
 * Theme settings — colours, fonts, radius, container width — already have a
 * schema in lib/website-builder/theme-settings-schema.ts and live in
 * `store_theme_settings`. These are the things that are true of the site
 * whatever theme it wears.
 */
export interface SiteSettings {
  faviconUrl?: string
  language?: string
  seo?: {
    title?: string
    description?: string
    socialImageUrl?: string
  }
  /**
   * Pro only, and sandboxed at render. Never interpolated into the page shell:
   * anything a creator can type here is something an attacker can type into
   * a bought template, so it renders inside a constrained island or not at all.
   */
  customHeadScripts?: string
  /** Free plan shows "Built with Storelib"; Pro may turn it off. */
  hideBranding?: boolean
}

export interface Site {
  id: string
  creatorId: string
  themeId: string
  kind: SiteKind
  name: string
  /** `{slug}.storelib.site`. Null for storefronts, which live at /w/{username}. */
  slug: string | null
  status: SiteStatus
  settings: SiteSettings
  publishedVersionId: string | null
  publishedAt: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface SitePageSeo {
  title?: string
  description?: string
  socialImageUrl?: string
  noindex?: boolean
}

/**
 * A page. `key` is the URL slug and the storage key at once — it is already
 * `UNIQUE(install_id, page_key)`, which is exactly the constraint a slug needs,
 * so there is no second column to keep in step with it.
 */
export interface SitePage {
  id: string
  installId: string
  /** URL slug. The homepage's key is conventionally "home" but nothing reads that. */
  key: string
  title: string
  seo: SitePageSeo
  sortOrder: number
  isHomepage: boolean
  /** Published sections. What a visitor gets. */
  sections: SectionInstance[]
  /** Unsaved editor state. Null once published. */
  draftSections: SectionInstance[] | null
}

/** What a published site needs to render, in one object. */
export interface PublishedSite {
  site: Site
  theme: ThemeSettingsValues
  page: SitePage
  /** Every page, for navigation. Sections omitted — this is for menus. */
  pages: Array<Pick<SitePage, "key" | "title" | "sortOrder" | "isHomepage">>
}

export interface SiteVersion {
  id: string
  installId: string
  label: string | null
  createdBy: string | null
  createdAt: string
}

export interface SiteFormSubmission {
  id: string
  installId: string
  pageKey: string | null
  sectionId: string | null
  fields: Record<string, string>
  createdAt: string
}
