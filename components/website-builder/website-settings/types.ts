import type { LinkTarget, SectionLinkSource } from "@/components/website-builder/link-picker"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"
import { tt } from "@/lib/i18n/text"
import type { PreviewLocaleModel } from "@/components/website-builder/preview-locale-switch"

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
  { id: "general", get label() { return tt("General") }, group: "site" },
  { id: "domains", get label() { return tt("Domains") }, group: "site" },
  { id: "seo", get label() { return tt("SEO & Social") }, group: "site" },
  { id: "pages", get label() { return tt("Pages") }, group: "content" },
  { id: "navigation", get label() { return tt("Navigation") }, group: "content" },
  { id: "commerce", get label() { return tt("Commerce") }, group: "content" },
  { id: "policies", get label() { return tt("Policies") }, group: "content" },
  { id: "apps", get label() { return tt("Apps and integrations") }, group: "content" },
  { id: "publishing", get label() { return tt("Publishing") }, group: "live" },
  { id: "performance", get label() { return tt("Performance") }, group: "live" },
  { id: "backups", get label() { return tt("Backups & Versions") }, group: "live" },
  { id: "connections", get label() { return tt("Connections") }, group: "code" },
] as const

/**
 * The headings the list is read under. Ten rows in one column read as one
 * long list where Domains and Backups weigh the same; four short groups say
 * what each is for: the site and its address, what is on it, getting it
 * live, and the code tools.
 */
export const SETTINGS_GROUP_LABELS: Record<(typeof SETTINGS_SECTIONS)[number]["group"], string> = {
  get site() { return tt("Website") },
  get content() { return tt("Content") },
  get live() { return tt("Going live") },
  code: "Code",
}

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
  /** Store details' store name and the person's name, for the store's name where the website gives none (lib/website-builder/tab-title.ts). */
  storeName?: string
  displayName?: string
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
  /** Saves the editor's draft and pauses autosave while a restore runs (true), or lets it go (false); false back means it could not save. */
  onHoldDraft?: (hold: boolean) => Promise<boolean>
  onEditPage: (pageKey: string) => void
  onAddPage: () => void
  /** Opens the builder's Navigation panel, at one menu when a handle is given. */
  onEditMenu: (handle?: string) => void
  /** Closes Website settings on one group of the builder's Theme settings, e.g. "cookies". */
  onOpenThemeGroup: (group: string) => void
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
  /** The open page's address and a reader for other pages' sections, for "Sections on this page". */
  linkSections?: SectionLinkSource
  /**
   * The page open in the builder and its sections. Policies edits that page
   * through `onSectionSetting`, since the builder saves it itself; any other
   * page is saved by the sections route (lib/website-builder/policy-editing.ts).
   */
  currentPageKey?: string
  currentSections?: SectionInstance[]
  /** A page's draft was saved from here: the builder says there is something to publish, and lists a page it did not have. */
  onPageDraftSaved?: (pageKey: string) => void
  /** The language and currency the builder shows (and its sidebar writes), switched from General too. */
  preview?: PreviewLocaleModel
}
