/**
 * ===========================================================================
 *  SITE TEMPLATES: WHOLE, ORIGINAL STARTING SITES THE AGENT ADAPTS (round P)
 * ===========================================================================
 * Lovable and Webild get their quality from excellent starting points: the
 * model adapts a complete, considered site instead of writing every
 * component from zero. A `SiteTemplate` is that starting point for
 * Storelib's agent:
 *
 *   files       every component as a `.storelib` section (sections/ai_*):
 *               full editable schemas, FILLED preset blocks, motion through
 *               the round O5 primitives and the round P3 islands' data
 *               attributes, mobile art-directed
 *   pages       home (10 to 14 sections), product, collection, shop, search,
 *               about, contact: section instances WITH their blocks, so the
 *               editor shows a finished page, never an empty list
 *   tokens      the template's own design tokens (Theme settings)
 *   menus       the header's and footer's menus, linking every page
 *   imageSlots  each picture the design needs: a prompt and an aspect for
 *               P1's generate_image, and where the result goes
 *   bindings    where the creator's real data belongs (products, forms)
 *
 * The agent never ships a template as it is: applyTemplate (./apply.ts)
 * writes it, then the agent rebrands every word to the creator's business,
 * takes palette and type from the creative direction, generates the images
 * and recomposes. untouchedTemplateParts tells the finish gate what is
 * still the template's own copy.
 *
 * P2a owns this framework and six templates; P2b adds six more on the same
 * types (register them in ./registry.ts).
 *
 * Pure types. Browser safe.
 */
import type { BusinessKind } from "@/lib/storelib-ai/direction/brief"
import type { MotionTier } from "@/lib/storelib-ai/motion"
import type { DesignTokens } from "@/lib/ai-builder/types"
import type { SectionInstance } from "@/lib/website-builder/types"

/** The picture shapes a slot asks P1's generate_image for (width:height). */
export type ImageAspect = "1:1" | "4:5" | "3:4" | "2:3" | "4:3" | "3:2" | "16:9" | "21:9" | "9:16"

/** Where a generated picture is written: an image setting of a placed section, or of one of its blocks. */
export interface ImageSlotTarget {
  page: string
  /** The placed section's id (TemplatePage.sections[].id). */
  section: string
  /** A block's id, when the picture is a block's. */
  block?: string
  /** The image_picker setting id. */
  setting: string
}

/**
 * One picture the design calls for. `prompt` describes a photograph or a
 * render for the generic version of the business; the agent rewrites it for
 * the creator's real business before generating (their product, their place).
 */
export interface TemplateImageSlot {
  key: string
  prompt: string
  aspect: ImageAspect
  /** Alt text for the generated picture (the agent rewrites it with the prompt). */
  alt: string
  /** What kind of picture: a photograph, a product shot on a plain ground (cut out for type-through-product heroes), a texture. */
  style: "photo" | "product" | "texture" | "portrait"
  targets: ImageSlotTarget[]
  /**
   * The call P1's generate_image / find_photo takes (lib/ai-builder/agent tool specs): its shape
   * (landscape 3:2, portrait 2:3, square), what the picture is for and its style. Filled from
   * `aspect`, `style` and `key` by assemble (kit/build.ts) unless the slot says otherwise.
   */
  generate?: SlotGenerate
}

/** P1's generate_image shapes, purposes and styles. */
export type GenerateAspect = "landscape" | "portrait" | "square"
export type GeneratePurpose = "hero" | "product" | "portrait" | "people" | "place" | "detail" | "gallery" | "background"
export type GenerateStyle = "photo" | "studio" | "editorial" | "illustration" | "render"
export interface SlotGenerate {
  aspect: GenerateAspect
  purpose: GeneratePurpose
  style: GenerateStyle
}

/** A place in the template that wants the creator's real data. */
export interface TemplateBinding {
  page: string
  section: string
  /** The binding setting id. */
  setting: string
  kind: "product" | "products" | "collection" | "form" | "menu"
  /** What it is for, in one line, for the agent. */
  why: string
}

/** A page of the template, as the editor stores it: section instances, blocks included. */
export interface TemplatePage {
  key: string
  /** The menu's and the tab's title. */
  title: string
  sections: SectionInstance[]
  seo?: { title: string; description?: string }
}

export interface TemplateMenuLink {
  title: string
  url: string
  links?: TemplateMenuLink[]
}

export interface TemplateMenu {
  title: string
  links: TemplateMenuLink[]
}

/** The template's design intent, for its DESIGN.md and for the agent's adaptation. */
export interface TemplateDesign {
  /** One sentence: what the first screen is. */
  thesis: string
  layout: string[]
  imagery: string
  motion: string
  /** The moves that make it this template (type cut by product, collage cards...). */
  signature: string[]
  avoid: string[]
}

export interface SiteTemplate {
  /** Stable, lowercase with dashes. */
  id: string
  /** A short original name. */
  name: string
  /** One line for the gallery. */
  summary: string
  /** Business kinds it is made for (O2's BusinessKind), best first. */
  industries: BusinessKind[]
  /** O5 site story ids (lib/storelib-ai/layout/stories.ts) it tells. */
  stories: string[]
  /** Library style ids. */
  styles: string[]
  /** O2 art direction ids (lib/storelib-ai/direction/directions.ts) it embodies, best first. */
  directionIds: string[]
  /** Extra words people use for this kind of site. */
  keywords: string[]
  motion: MotionTier
  /** The type prefix every component of this template carries: ai_<prefix>_*. */
  prefix: string
  /** Section files by path (sections/ai_<prefix>_*.storelib). */
  files: Record<string, string>
  /** Home first. Pages and templates (product, collection, products, search, contact...). */
  pages: TemplatePage[]
  tokens: DesignTokens
  menus: Record<string, TemplateMenu>
  imageSlots: TemplateImageSlot[]
  bindings: TemplateBinding[]
  design: TemplateDesign
}

/** What the gallery shows of a template: everything but the files and pages. */
export interface TemplateSummary {
  id: string
  name: string
  summary: string
  industries: BusinessKind[]
  stories: string[]
  styles: string[]
  directionIds: string[]
  keywords: string[]
  motion: MotionTier
  signature: string[]
  pages: { key: string; title: string; sections: string[] }[]
  imageSlots: number
  fonts: { heading: string; body: string; accent?: string }
  palette: { mode: "light" | "dark"; background: string; text: string; accent: string }
}
