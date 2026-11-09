/**
 * WHICH TOOL SCHEMAS MAY BE SENT AS STRICT
 *
 * A strict tool's schema must close every object: `additionalProperties:
 * false` on each one, at every depth. A schema that leaves one open (a free
 * form settings map, say) is a 400 for the WHOLE request: "tools.2.custom:
 * For 'object' type, 'additionalProperties' must be explicitly set to false".
 * That stopped every AI website build at its first call (November 2026).
 *
 * So a tool is sent strict only when its schema is ready for it; any other
 * tool is sent as is and its arguments are checked by the executor, as they
 * always were. OpenAI's strict mode also wants every property listed in
 * `required` (`allRequired`).
 *
 * Anthropic's strict mode also refuses numeric and length limits and complex
 * array rules (minimum, maxLength, maxItems...): the SDK's parse helper strips
 * them, but these schemas are sent raw, so a schema using one is not strict.
 */
type Schema = Record<string, unknown>

const NESTED_LISTS = ["anyOf", "oneOf", "allOf", "prefixItems"] as const
const NESTED_MAPS = ["$defs", "definitions"] as const
const UNSUPPORTED = ["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "minLength", "maxLength", "pattern", "maxItems", "uniqueItems", "minProperties", "maxProperties", "patternProperties", "not", "if", "then", "else", "contains"] as const

export function strictReady(schema: unknown, opts: { allRequired?: boolean } = {}): boolean {
  const ok = (node: unknown, depth: number): boolean => {
    if (depth > 32) return false
    if (node === true || node === false || node === undefined) return true
    if (!node || typeof node !== "object" || Array.isArray(node)) return false
    const s = node as Schema
    if (UNSUPPORTED.some((k) => s[k] !== undefined)) return false
    if (typeof s.minItems === "number" && s.minItems > 1) return false
    const types = Array.isArray(s.type) ? s.type : [s.type]
    const isObject = types.includes("object") || (s.properties !== undefined && s.type === undefined)
    if (isObject) {
      if (s.additionalProperties !== false) return false
      const props = (s.properties ?? {}) as Record<string, unknown>
      if (opts.allRequired) {
        const req = new Set(Array.isArray(s.required) ? (s.required as string[]) : [])
        if (Object.keys(props).some((k) => !req.has(k))) return false
      }
      for (const v of Object.values(props)) if (!ok(v, depth + 1)) return false
    }
    if (s.items !== undefined && !ok(s.items, depth + 1)) return false
    for (const k of NESTED_LISTS) if (Array.isArray(s[k]) && !(s[k] as unknown[]).every((v) => ok(v, depth + 1))) return false
    for (const k of NESTED_MAPS) if (s[k] && typeof s[k] === "object" && !Object.values(s[k] as Record<string, unknown>).every((v) => ok(v, depth + 1))) return false
    return true
  }
  return ok(schema, 0)
}
