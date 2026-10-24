/**
 * A COLOUR SCHEME'S COLOURS, IN THE GROUPS A PERSON LOOKS FOR THEM IN.
 *
 * Opening an imported theme's scheme showed every colour its definition
 * names in one run: background, button label, input border, variant pill,
 * shadow, in whatever order the theme wrote them. They are drawn here under
 * the same headings Storelib's own schemes use (General colors, Primary
 * button, Secondary button, Inputs & fields, Additional colors).
 *
 * Which group a colour is in:
 *  1. The theme says so. A heading inside the scheme's definition (Horizon
 *     writes "Primary button", "Inputs"...) is kept at import as each
 *     following colour's `category` (lib/storelib-theme/shopify/convert.ts).
 *  2. Otherwise its id and label do: "secondary_button_label" is a secondary
 *     button colour, "input_border_color" an input's, "background" general.
 *  3. Anything else is Additional colors.
 * Only how the colours are listed changes. Ids, values and the order within
 * a group stay as the theme wrote them.
 */

export type SchemeCategory = "general" | "primary_button" | "secondary_button" | "inputs" | "additional"

export const SCHEME_CATEGORY_ORDER: SchemeCategory[] = ["general", "primary_button", "secondary_button", "inputs", "additional"]

/* English names, for tests and the docs; the editor draws its own translated ones. */
export const SCHEME_CATEGORY_LABELS: Record<SchemeCategory, string> = {
  general: "General colors", // i18n-ignore
  primary_button: "Primary button", // i18n-ignore
  secondary_button: "Secondary button", // i18n-ignore
  inputs: "Inputs & fields", // i18n-ignore
  additional: "Additional colors", // i18n-ignore
}

/** A heading the theme wrote, read as one of the five groups. */
export function categoryFromHeading(heading: unknown): SchemeCategory | null {
  if (typeof heading !== "string" || !heading.trim()) return null
  return byWords(heading, true)
}

function byWords(text: string, heading: boolean): SchemeCategory | null {
  const t = text.toLowerCase().replace(/[_\-.]+/g, " ")
  const button = /\bbut+ons?\b|\bbtn\b|\bcta\b/.test(t)
  if (/\b(inputs?|fields?|forms?|text ?box|textarea|select|dropdown|checkbox)\b/.test(t)) return "inputs"
  if (button && /\b(secondary|outline|outlined|ghost|tertiary)\b/.test(t)) return "secondary_button"
  if (button) return "primary_button"
  /* A product's own pieces (variant pills, badges, sale prices) are the theme's extras, even with "background" in the id. */
  if (/\b(variants?|swatch(es)?|badges?|sale|price|ratings?|stars?|pills?|tags?|chips?|sold ?out|discount|notifications?|alerts?|errors?|success|overlay)\b/.test(t)) return heading && /\b(general|essentials?)\b/.test(t) ? "general" : "additional"
  if (heading && /\b(general|essentials?|main|base|core|basics?|surface|text|typography)\b/.test(t)) return "general"
  if (/\b(backgrounds?|bg|foreground|text|heading|headings|titles?|body|accent|primary|links?|borders?|lines?|dividers?|outlines?|shadows?|gradient|surface|muted)\b/.test(t)) return "general"
  return null
}

/** The group a scheme's colour is listed in. */
export function schemeCategoryOf(field: { id: string; label?: string; category?: unknown }): SchemeCategory {
  const explicit = typeof field.category === "string" && field.category.trim() ? (SCHEME_CATEGORY_ORDER as string[]).includes(field.category) ? (field.category as SchemeCategory) : categoryFromHeading(field.category) : null
  if (explicit) return explicit
  /* The setting's own id is the last part of group::scheme::settings::id. */
  const own = field.id.split("::").pop() ?? field.id
  return byWords(own, false) ?? byWords(field.label ?? "", false) ?? "additional"
}

/**
 * The colours in their groups, in the order above, each group's colours in
 * the theme's order. Empty groups are left out.
 */
export function groupSchemeFields<T extends { id: string; label?: string; category?: unknown }>(fields: T[]): { category: SchemeCategory; label: string; fields: T[] }[] {
  const by = new Map<SchemeCategory, T[]>()
  for (const f of fields) {
    const c = schemeCategoryOf(f)
    const list = by.get(c)
    if (list) list.push(f)
    else by.set(c, [f])
  }
  return SCHEME_CATEGORY_ORDER.filter((c) => by.has(c)).map((c) => ({ category: c, label: SCHEME_CATEGORY_LABELS[c], fields: by.get(c)! }))
}
