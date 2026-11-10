/**
 * ===========================================================================
 *  SITE TEMPLATES, P2b's COPY OF THE SHARED SHAPE (round P)
 * ===========================================================================
 * The round P brief fixes `SiteTemplate` for the template library P2a and
 * P2b share (lib/storelib-ai/templates/). P2a owns the framework and the main
 * registry; this file is the same shape, defined here so P2b's six templates
 * compile on their own while P2a's types are not on main yet. The integrator
 * points this file at P2a's (a re-export) when both land.
 *
 *   id, name, industries, styles, directionIds
 *   files      sections/ai_*.storelib with full schemas and FILLED preset blocks
 *   pages      home + product + collection + other pages, section instances with blocks
 *   tokens     the design tokens (lib/ai-builder/types.ts DesignTokens)
 *   imageSlots [{ key, prompt, aspect }] for P1's image generator
 *
 * Extensions beyond the brief are optional fields, so a consumer written for
 * the brief's shape reads these templates unchanged.
 */
import type { DesignTokens } from "@/lib/ai-builder/types"
import type { SectionInstance } from "@/lib/website-builder/types"

/**
 * A picture the template needs. `key` says where it goes:
 * "<page>/<section id>/<setting id>" for a section setting, or
 * "<page>/<section id>/<block id>/<setting id>" for a block's. The setting is
 * an image_picker; the generator's url is written there (templateImageTargets
 * in ./kit-b.ts resolves a key).
 */
export interface TemplateImageSlot {
  key: string
  /** A photographic prompt: subject, light, lens, mood. Never text in the picture, never a logo. */
  prompt: string
  /** "16:9", "4:5", "1:1", "3:4", "21:9"... */
  aspect: string
}

export interface TemplatePage {
  /** "home", "product", "collection", "about", "contact"... (lib/website-builder/site-pages.ts keys). */
  key: string
  title?: string
  /** Header group first, then the page's own, then the footer group, as the page draws them. */
  sections: SectionInstance[]
}

export interface SiteTemplate {
  id: string
  name: string
  industries: string[]
  styles: string[]
  /** lib/storelib-ai/direction/directions.ts ids this template is a strong start for. */
  directionIds: string[]
  /** Path ("sections/ai_x.storelib") to source. */
  files: Record<string, string>
  pages: TemplatePage[]
  tokens: DesignTokens
  imageSlots: TemplateImageSlot[]
  /* ── optional extensions (P2b) ── */
  /** One line: what the template is and its signature move. */
  summary?: string
  /** The menus the header and footer read (link_list defaults), for a site that has none yet. */
  menus?: Record<string, { title: string; links: { title: string; url: string; links?: { title: string; url: string }[] }[] }>
}
