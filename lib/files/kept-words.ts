/**
 * ===========================================================================
 *  WHAT FILES SAYS ABOUT A FILE IT TOOK OUT OF THE LIST AND KEPT
 * ===========================================================================
 * Delete in Files never breaks a picture that shows somewhere (lib/files/
 * keep.ts). The creator is told plainly what happened and why, from the
 * places the server found:
 *
 *   "Removed from Files. Still used by 3 products, so the picture stays."
 *   "Removed from Files. Still used by Lamp and your website, so the picture stays."
 *
 * Pure, so the page and the tests share it.
 */

export interface KeptUse {
  kind: string
  label: string
  href?: string
}

function list(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? ""
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`
}

/** "3 products", "Lamp and your website", "a collection": who still shows the file. Null when nothing was named. */
export function usedByPhrase(uses: readonly KeptUse[]): string | null {
  const products = new Map<string, string>()
  const counts = new Map<string, number>()
  const once = new Set<string>()
  for (const u of uses) {
    if (u.kind === "product" || u.kind === "variant") {
      const key = u.href || u.label
      if (!products.has(key)) products.set(key, u.kind === "variant" ? u.label.split(", ")[0] || u.label : u.label)
    } else if (u.kind === "collection" || u.kind === "community" || u.kind === "onepage") {
      counts.set(u.kind, (counts.get(u.kind) ?? 0) + 1)
    } else once.add(u.kind)
  }
  const parts: string[] = []
  if (products.size === 1) parts.push([...products.values()][0])
  else if (products.size > 1) parts.push(`${products.size} products`)
  if (once.has("website")) parts.push("your website")
  const named: Record<string, [string, string]> = { onepage: ["your OnePage", "OnePages"], collection: ["a collection", "collections"], community: ["your community", "communities"] }
  for (const kind of ["onepage", "collection", "community"]) {
    const n = counts.get(kind) ?? 0
    if (n === 1) parts.push(named[kind][0])
    else if (n > 1) parts.push(`${n} ${named[kind][1]}`)
  }
  if (once.has("profile")) parts.push("your profile")
  if (once.has("settings")) parts.push("your store settings")
  if (once.has("other")) parts.push(parts.length ? "more of your store" : "your store")
  return parts.length ? list(parts) : null
}

/** The sentence for one file taken out of Files and kept. */
export function hiddenNote(uses: readonly KeptUse[], what: "picture" | "video" = "picture"): string {
  const by = usedByPhrase(uses)
  return by ? `Removed from Files. Still used by ${by}, so the ${what} stays.` : `Removed from Files. It's still used on your store, so the ${what} stays.`
}

/** The sentence after deleting several: how many went, and how many stay where they show. */
export function manyNote(deleted: number, hidden: number): string {
  const gone = deleted === 1 ? "1 file deleted." : `${deleted} files deleted.`
  if (!hidden) return deleted === 1 ? "Deleted" : `${deleted} files deleted`
  const stays = hidden === 1 ? "1 removed from Files and kept, because it's still used." : `${hidden} removed from Files and kept, because they're still used.`
  return deleted ? `${gone} ${stays}` : stays.charAt(0).toUpperCase() + stays.slice(1)
}
