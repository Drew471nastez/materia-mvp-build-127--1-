import type { ThemeSettingsValues } from "@/lib/website-builder/types"

/**
 * The nine pages of Website Settings, in the order they are listed. The ids
 * are also the `?settings=` values the editor opens on, which is how the
 * tabs above the cover on /app/website-builder land on the right one.
 */
export const SETTINGS_SECTIONS = [
  { id: "general", label: "General" },
  { id: "domains", label: "Domains" },
  { id: "seo", label: "SEO & Social" },
  { id: "pages", label: "Pages & Navigation" },
  { id: "commerce", label: "Commerce" },
  { id: "policies", label: "Policies" },
  { id: "publishing", label: "Publishing" },
  { id: "backups", label: "Backups & Versions" },
  { id: "advanced", label: "Advanced" },
] as const

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]["id"]

const IDS = new Set<string>(SETTINGS_SECTIONS.map((s) => s.id))

/**
 * A `?settings=` value to the page it names. `connections` is what GitHub
 * sends a creator back with, from before Connections moved into Advanced.
 */
export function settingsSectionFrom(value: string | null | undefined): SettingsSection | null {
  if (!value) return null
  if (value === "connections" || value === "agents") return "advanced"
  return IDS.has(value) ? (value as SettingsSection) : null
}

export interface SitePage {
  key: string
  name: string
  path: string
  custom?: boolean
}

/** Everything a page of Website Settings may read or ask the editor to do. */
export interface SettingsContext {
  installId: string
  name: string
  websiteUrl: string
  websiteUrlDisplay: string
  live: boolean
  publishedAt: string | null
  /** The website's draft settings, the editor's own copy. */
  settings: ThemeSettingsValues
  /** Writes one setting through the editor, so autosave and undo see it. */
  onSettingChange: (key: string, value: unknown) => void
  pages: SitePage[]
  productCount: number | null
  githubReturned: string | null
  go: (section: SettingsSection) => void
  onRenamed: (name: string) => void
  onRestored?: () => void
  onEditPage: (pageKey: string) => void
  onAddPage: () => void
  onEditMenu: () => void
  onOpenCode: () => void
  onPublish: () => void
  onUnpublished: () => void
  /** Leaves the builder for another part of Storelib, asking first if a draft is unsaved. */
  onNavigate: (href: string) => void
}
