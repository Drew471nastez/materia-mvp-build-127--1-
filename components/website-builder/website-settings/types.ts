import type { LinkTarget } from "@/components/website-builder/link-picker"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

/**
 * The pages of Website Settings, in the order they are listed. The ids are
 * also the `?settings=` values the editor opens on, which is how the tabs
 * above the cover on /app/website-builder land on the right one.
 *
 * Two groups. The website's own settings, then Connections on its own: it is
 * not a setting of the site but how Claude Code, Codex, ChatGPT or a GitHub
 * repository write its code, and filed as "Advanced" under the site's
 * settings it was a page nobody went looking for.
 */
export const SETTINGS_SECTIONS = [
  { id: "general", label: "General", group: "site" },
  { id: "domains", label: "Domains", group: "site" },
  { id: "seo", label: "SEO & Social", group: "site" },
  { id: "pages", label: "Pages", group: "site" },
  { id: "navigation", label: "Navigation", group: "site" },
  { id: "commerce", label: "Commerce", group: "site" },
  { id: "policies", label: "Policies", group: "site" },
  { id: "publishing", label: "Publishing", group: "site" },
  { id: "backups", label: "Backups & Versions", group: "site" },
  { id: "connections", label: "Connections", group: "code" },
] as const

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]["id"]

const IDS = new Set<string>(SETTINGS_SECTIONS.map((s) => s.id))

/**
 * A `?settings=` value to the page it names. `connections` is what GitHub
 * sends a creator back with; `advanced` and `agents` are older links to the
 * same page.
 */
export function settingsSectionFrom(value: string | null | undefined): SettingsSection | null {
  if (!value) return null
  if (value === "advanced" || value === "agents") return "connections"
  return IDS.has(value) ? (value as SettingsSection) : null
}

/** The two ways an AI coding tool reaches a site, on Connections. */
export type ConnectVia = "direct" | "github"

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
  /** The path Connections opens on, when something asked for one. */
  connectVia: ConnectVia | null
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
  /** The website's name on Storelib was changed (Domains), so its address is new. */
  onAddressChanged: (handle: string) => void
  /** The site's header and footer as the editor holds them, for Navigation. */
  header?: SectionInstance
  footer?: SectionInstance
  /** The editor's own writers for a section's settings and blocks, so a change here is saved and undone like any other. */
  onSectionSetting?: (sectionId: string, key: string, value: unknown) => void
  onBlockSetting?: (sectionId: string, blockId: string, key: string, value: unknown) => void
  onAddBlock?: (sectionId: string, type: string, initial?: Record<string, unknown>) => void
  onRemoveBlock?: (sectionId: string, blockId: string) => void
  onReorderBlocks?: (sectionId: string, blocks: { id: string; type: string; settings: Record<string, unknown> }[]) => void
  /** The site's pages and products, for the link picker. */
  linkTargets?: LinkTarget[]
}
