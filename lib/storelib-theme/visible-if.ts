/**
 * ===========================================================================
 *  WHICH SETTINGS THE PANEL SHOWS
 * ===========================================================================
 * A setting that only matters in one mode says so:
 *
 *   { "type": "product_list", "id": "chosen",
 *     "visible_if": "{{ section.settings.source == 'chosen' }}" }
 *
 * and the panel leaves it out until the section is in that mode. Written the
 * way Shopify writes it, read by this language's own expression grammar
 * (lib/storelib-theme/storelib/template.ts, `conditionHolds`), and checked
 * against the schema when the schema is saved (schema/validate.ts).
 *
 * THE PANEL ONLY. A hidden setting keeps its value, and a template still
 * reads it; hiding is about what a creator is asked, not about what a page
 * draws. So nothing here runs on a published page.
 *
 * The condition sees each setting as the page would draw it: the saved
 * value, else the schema's default. Without the defaults, a setting that was
 * never touched would read as empty, and "show this when the button is on"
 * would hide itself under a button that is on by default.
 */
import { conditionHolds } from "./storelib/template"

export interface ConditionalField {
  id: string
  default?: unknown
  visible_if?: unknown
}

/** Saved values over the schema's defaults, which is what a condition reads. */
export function valuesForConditions(fields: readonly ConditionalField[], saved: Record<string, unknown> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const f of fields) if (f.default !== undefined) out[f.id] = f.default
  for (const [k, v] of Object.entries(saved ?? {})) if (v !== undefined) out[k] = v
  return out
}

/**
 * The fields the panel should show, in order. `section` is given for a
 * block's fields, whose conditions may read the section's settings too.
 */
export function visibleFields<F extends ConditionalField>(
  fields: readonly F[],
  saved: Record<string, unknown> | undefined,
  section?: { fields: readonly ConditionalField[]; saved: Record<string, unknown> | undefined },
): F[] {
  if (!fields.some((f) => typeof f.visible_if === "string" && f.visible_if.trim() !== "")) return [...fields]
  const own = valuesForConditions(fields, saved)
  const scope = section
    ? { section: { settings: valuesForConditions(section.fields, section.saved) }, block: { settings: own } }
    : { section: { settings: own }, block: { settings: {} } }
  return fields.filter((f) => typeof f.visible_if !== "string" || f.visible_if.trim() === "" || conditionHolds(f.visible_if, scope))
}
