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
import { schemasFromSources } from "../storelib-schemas"
import { SECTION_SCHEMAS } from "../section-schemas"
import type { SectionSchema } from "../types"

export type SchemaMap = Record<string, SectionSchema>

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
  return { ...SECTION_SCHEMAS, ...schemasFromSources(sources) }
}

/** One type, from a lookup that may not have been passed. */
export function schemaOf(schemas: SchemaMap | undefined, type: string): SectionSchema | undefined {
  return (schemas ?? SECTION_SCHEMAS)[type]
}

/** Its name, or the type itself, which is what a person would call it anyway. */
export function nameOf(schemas: SchemaMap | undefined, type: string): string {
  return schemaOf(schemas, type)?.name ?? type
}
