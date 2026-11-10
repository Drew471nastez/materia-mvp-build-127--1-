/**
 * ===========================================================================
 *  SITE TEMPLATES, P2b's COPY OF THE SHARED SHAPE (round P)
 * ===========================================================================
 * P2a owns the template framework (lib/storelib-ai/templates/types.ts,
 * registry.ts, choose.ts, apply.ts) on its own branch. While that is not on
 * main, P2b's six templates are typed against this file: a structural copy
 * of P2a's `SiteTemplate` (its branch p2a-templates, including the
 * `generate` field of an image slot), field for field, so the integrator
 * replaces this file with `export * from "./types"` and lists TEMPLATES_B
 * in P2a's registry with no other change.
 *
 * The round P brief's minimum (id, name, industries, styles, directionIds,
 * files, pages, tokens, imageSlots { key, prompt, aspect }) is a subset.
 *
 * Pure types.
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

/** P1's generate_image shapes, purposes and styles. */
export type GenerateAspect = "landscape" | "portrait" | "square"
export type GeneratePurpose = "hero" | "product" | "portrait" | "people" | "place" | "detail" | "gallery" | "background"
export type GenerateStyle = "photo" | "studio" | "editorial" | "illustration" | "render"
export interface SlotGenerate {
  aspect: GenerateAspect
  purpose: GeneratePurpose
  style: GenerateStyle
}

/** One picture the design calls for, and every setting it is written to. */
export interface TemplateImageSlot {
  key: string
  /** A photographic prompt for the generic version of the business; the agent rewrites it for the creator's. */
  prompt: string
  aspect: ImageAspect
  alt: string
  style: "photo" | "product" | "texture" | "portrait"
  targets: ImageSlotTarget[]
  generate?: SlotGenerate
}

/** A place in the template that wants the creator's real data. */
export interface TemplateBinding {
  page: string
  section: string
  setting: string
  kind: "product" | "products" | "collection" | "form" | "menu"
  why: string
}

export interface TemplatePage {
  key: string
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

export interface TemplateDesign {
  thesis: string
  layout: string[]
  imagery: string
  motion: string
  signature: string[]
  avoid: string[]
}

export interface SiteTemplate {
  id: string
  name: string
  summary: string
  industries: BusinessKind[]
  /** O5 site story ids (lib/storelib-ai/layout/stories.ts). */
  stories: string[]
  styles: string[]
  /** O2 art direction ids (lib/storelib-ai/direction/directions.ts), best first. */
  directionIds: string[]
  keywords: string[]
  motion: MotionTier
  /** Every component of the template is sections/ai_<prefix>_*.storelib. */
  prefix: string
  files: Record<string, string>
  /** Home first. */
  pages: TemplatePage[]
  tokens: DesignTokens
  menus: Record<string, TemplateMenu>
  imageSlots: TemplateImageSlot[]
  bindings: TemplateBinding[]
  design: TemplateDesign
}
