/**
 * ===========================================================================
 *  THE CONTROLS' NAMES, WITHOUT THEIR CHECKS
 * ===========================================================================
 * Which setting types exist and what an older or a Shopify name means: all
 * a schema needs to be read (../schema/normalise.ts). Kept apart from
 * ./registry.ts, which adds each control's zod check, because reading a
 * schema is something the published website does too: through section
 * groups it put zod and every control's check into every visitor's
 * JavaScript (docs/audits/website-builder-engine-2026-10.md, S1).
 * ./registry.ts re-exports all of this, so nothing that imports it changes.
 */
export const CONTROL_TYPES = [
  // ── values a person types or picks ──
  "text",
  "textarea",
  "richtext",
  "number",
  "toggle",
  "checkbox",
  "select",
  "radio",
  "range",
  "color",
  "color_scheme",
  "color_background",
  "font_picker",
  "alignment",
  "inline_richtext",
  "html",
  "datetime",
  "focal_point",
  // ── values that are references ──
  "image_picker",
  "image_gallery",
  "video_picker",
  "file_picker",
  "icon_picker",
  "url",
  "video_url",
  "page_picker",
  "product_picker",
  "product_list",
  "link_list",
  "community_picker",
  "collection_picker",
  "collection_list",
  "form_picker",
  // ── presentational: draw something, hold nothing ──
  "header",
  "paragraph",
  "divider",
] as const

export type ControlType = (typeof CONTROL_TYPES)[number]

/**
 * The names the existing theme JSON uses, mapped to the registry. These are
 * read on the way in and written back on the way out unchanged, so a
 * `.json` section that says `"type": "link"` still validates and still means
 * what it meant. New files should use the registry's names.
 */
export const LEGACY_TYPE_ALIASES: Record<string, ControlType> = {
  link: "url",
  image: "image_picker",
  video: "video_picker",
  icon: "icon_picker",
  font: "font_picker",
  spacing: "range",
}

/**
 * SHOPIFY'S NAMES, FOR THE SAME THINGS.
 *
 * Somebody bringing a section across from a Shopify theme writes the types
 * they know. Where Storelib has the same control under another name, the
 * name is accepted and means the Storelib control, so the schema validates
 * and the panel draws the right thing. Written back unchanged, like the
 * older names above.
 */
export const SHOPIFY_TYPE_ALIASES: Record<string, ControlType> = {
  text_alignment: "alignment",
  product: "product_picker",
  page: "page_picker",
  collection: "collection_picker",
  /*
    Shopify's `liquid` is markup with Liquid in it. Here the section's own
    template is where logic lives, so a `liquid` setting is an `html` one:
    the markup is kept, cleaned against the custom HTML allow list, and
    any Liquid tag in it is printed as the text it is, never run.
  */
  liquid: "html",
}

export function resolveControlType(type: string): ControlType | null {
  if ((CONTROL_TYPES as readonly string[]).includes(type)) return type as ControlType
  return LEGACY_TYPE_ALIASES[type] ?? SHOPIFY_TYPE_ALIASES[type] ?? null
}
