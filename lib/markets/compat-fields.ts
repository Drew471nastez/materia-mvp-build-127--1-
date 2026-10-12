/**
 * Which settings of an imported Shopify theme's sections and blocks are
 * text a translation is laid over: read from the theme's own schemas. Kept
 * apart from ./compat.ts (server only) because the builder's canvas reads
 * them too, to preview the website in another language.
 */
import type { CompatTheme } from "@/lib/storelib-theme/compat/theme"
import type { SchemaField } from "@/lib/website-builder/types"

type O = Record<string, unknown>

/** The theme's own schema settings, as the translation reader takes them ({ id, type }). */
function settingsOf(schema: O | undefined): SchemaField[] | undefined {
  const list = schema?.settings
  return Array.isArray(list) ? (list as SchemaField[]).filter((f) => f && typeof f === "object" && typeof (f as { id?: unknown }).id === "string") : undefined
}

/** Which of a section's and a block's settings are text, for an imported theme: its section files' and theme blocks' schemas. */
export function compatFields(theme: CompatTheme): { fieldsOf: (t: string) => SchemaField[] | undefined; blockFieldsOf: (st: string, bt: string) => SchemaField[] | undefined } {
  /* Labels in the theme's own words ("Heading", not "t:sections.hero.settings.heading.label"), for the Translate sheet. */
  const named = (list: SchemaField[] | undefined) => list?.map((f) => ({ ...f, label: theme.schemaLabel((f as { label?: unknown }).label) || f.id }))
  return {
    fieldsOf: (t) => named(settingsOf(theme.schemaOf("sections", t))),
    blockFieldsOf: (st, bt) => {
      const own = (Array.isArray(theme.schemaOf("sections", st).blocks) ? (theme.schemaOf("sections", st).blocks as O[]) : []).find((b) => b.type === bt)
      return named(settingsOf(own) ?? settingsOf(theme.schemaOf("blocks", bt)))
    },
  }
}
