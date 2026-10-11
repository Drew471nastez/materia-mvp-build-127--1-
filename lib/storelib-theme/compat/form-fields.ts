/**
 * A theme's form, as fields, read the way Shopify reads them: `updates[]` and
 * `properties[]` repeated become a list, `items[0][id]` becomes items[0].id,
 * anything else is kept by its name (`updates[<key>]` included, which the
 * cart reads by key). The site route reads every posted form with this, and
 * scripts/check-shopify-theme.ts does too, so the probe sees what ships.
 */
export function formFields(entries: Iterable<[string, unknown]>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of entries) {
    if (typeof v !== "string") continue
    const list = k.match(/^(\w+)\[\]$/)
    if (list) {
      const arr = (out[list[1]] as unknown[] | undefined) ?? []
      arr.push(v)
      out[list[1]] = arr
      continue
    }
    const item = k.match(/^items\[(\d+)\]\[(\w+)\]$/)
    if (item) {
      const arr = (out.items as Record<string, unknown>[] | undefined) ?? []
      const i = Number(item[1])
      arr[i] = { ...(arr[i] ?? {}), [item[2]]: v }
      out.items = arr
      continue
    }
    out[k] = v
  }
  return out
}
