/**
 * ===========================================================================
 *  WHICH SECTIONS THE ASSISTANT CAN SEE, FOR ONE REQUEST
 * ===========================================================================
 * The assistant read `SECTION_SCHEMAS`, a map built when the site is built
 * out of the theme that ships with it. A section somebody wrote in their own
 * install can never be in that map, so the assistant could move, hide,
 * duplicate and remove those sections but could not name a single one of
 * their settings — it did not know they had any.
 *
 * A LOOKUP IS PASSED IN INSTEAD, built per request out of the install's own
 * saved files on top of the built-in map. Passed, not held: a module-level
 * variable would be shared by every request the server is handling, and one
 * creator's sections reaching another creator's assistant is precisely the
 * thing the rest of this codebase is careful about. Every function that needs
 * it takes it, and the compiler finds the ones that forget.
 *
 * With no lookup given, it is the built-in map, which is what the assistant
 * saw before. Worse, not broken.
 */
import { schemasFromSources, themeBlockCatalog } from "../storelib-schemas"
import { SECTION_SCHEMAS } from "../section-schemas"
import type { BlockSchema, SectionSchema } from "../types"
import { isCompatSource } from "@/lib/storelib-theme/compat/theme"
import { COMPAT_PANEL_PATH, declaredIds, readPanel } from "@/lib/storelib-theme/platform-settings"
import { THEME_SCHEMA_FILE } from "@/lib/storelib-theme/theme-config"

export type SchemaMap = Record<string, SectionSchema>

/**
 * WHAT ELSE ONE INSTALL'S FILES SAY, beside its sections: its theme blocks
 * (blocks/*.storelib, the ones Add block offers in the builder), whether it
 * is an imported theme, and its Theme settings files. Kept beside the map it
 * was read with, never on it, so listing the map still lists sections only,
 * and never in a module variable, for the reason above.
 */
export interface InstallContext {
  blocks: Record<string, BlockSchema>
  compat: boolean
  /** A Storelib theme's own config/settings_schema.json, laid over Storelib's groups. */
  themeSchemaText: string | null
  /** An imported theme's Theme settings panel ids: what it places itself. */
  declared: Set<string>
}
const contexts = new WeakMap<SchemaMap, InstallContext>()

/** An imported theme: its shell or any section in the theme's own format. */
function compatSources(sources: Record<string, string>): boolean {
  if (isCompatSource(sources["layout/theme.storelib"] ?? "")) return true
  return Object.entries(sources).some(([p, t]) => /^sections\//.test(p) && typeof t === "string" && isCompatSource(t))
}

/**
 * The theme's sections, then this install's own on top — a creator's file
 * shadows the theme's of the same type, the same way it does everywhere else.
 */
export function schemaMapFor(sources?: Record<string, string>): SchemaMap {
  if (!sources || Object.keys(sources).length === 0) return SECTION_SCHEMAS
  /**
   * `schemasFromSources`, not `customSectionSchemas`: this takes a file that
   * REPLACES one of the theme's as well as one that adds a type of its own. A
   * creator who deleted a setting from their copy of the FAQ has a section
   * without it, and an assistant still describing the shipped version would
   * be writing to a setting that is not there.
   */
  const map: SchemaMap = { ...SECTION_SCHEMAS, ...schemasFromSources(sources) }
  const compat = compatSources(sources)
  contexts.set(map, {
    /* The blocks the builder's Add block lists: an imported theme draws its own and no others. */
    blocks: themeBlockCatalog(sources, { builtIn: !compat }),
    compat,
    themeSchemaText: compat ? null : (sources[THEME_SCHEMA_FILE] ?? null),
    declared: compat ? declaredIds(readPanel(sources[COMPAT_PANEL_PATH])) : new Set(),
  })
  return map
}

/** The theme blocks this install can add, as the builder's Add block has them; Storelib's own with no install's files. */
export function blockCatalogFor(schemas: SchemaMap | undefined): Record<string, BlockSchema> {
  return (schemas && contexts.get(schemas)?.blocks) || themeBlockCatalog()
}

/** What the install's files say besides its sections, or a Storelib theme with nothing of its own. */
export function installContextFor(schemas: SchemaMap | undefined): InstallContext {
  return (schemas && contexts.get(schemas)) || { blocks: themeBlockCatalog(), compat: false, themeSchemaText: null, declared: new Set() }
}

/** One type, from a lookup that may not have been passed. */
export function schemaOf(schemas: SchemaMap | undefined, type: string): SectionSchema | undefined {
  return (schemas ?? SECTION_SCHEMAS)[type]
}

/** Its name, or the type itself, which is what a person would call it anyway. */
export function nameOf(schemas: SchemaMap | undefined, type: string): string {
  return schemaOf(schemas, type)?.name ?? type
}
