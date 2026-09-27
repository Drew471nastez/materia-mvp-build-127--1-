"use client"

/**
 * ===========================================================================
 *  DELETE, FROM ANY SCREEN, AND A LIST THAT REMEMBERS IT
 * ===========================================================================
 * `deleteProduct` asks app/api/products/delete, which deletes on the server
 * by the session's own creator and answers with what the database did
 * (lib/products/delete-product.ts). It resolves with `deleted` or
 * `archived` and throws with a short message on anything else, so a screen
 * cannot report a delete that did not happen.
 *
 * THE LIST CAME BACK WITH IT. /app pages are kept by the router for five
 * minutes (next.config staleTimes), and the Products list draws the products
 * it was rendered with. A delete changed the list on the screen, not the
 * copy the router kept, so going back to Products within five minutes (from
 * a product, from another page) drew the product again, and its editor,
 * fetched ahead in full, opened with it still in it. The same for a delete
 * from the editor, whose way back is that kept list.
 *
 * So every change is also noted here, for this tab: the list applies the
 * notes to whatever copy it is drawn from (`withChanges`), and tells the
 * router to drop its kept pages when that copy was out of date
 * (`isStale`). A deleted id stays deleted for good; an archive is noted for
 * as long as a kept page can be older than it.
 */

export type DeleteOutcome =
  | { outcome: "deleted"; status: string; slug: string | null }
  | { outcome: "archived"; message: string; status: string; archived: boolean; slug: string | null }

export async function deleteProduct(productId: string): Promise<DeleteOutcome> {
  let res: Response
  try {
    res = await fetch("/api/products/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId }),
    })
  } catch {
    throw new Error("No connection. Nothing was deleted")
  }
  const body = (await res.json().catch(() => null)) as
    | { ok?: boolean; outcome?: string; error?: string; message?: string; status?: string; archived?: boolean; slug?: string | null }
    | null
  if (!res.ok || !body?.ok) throw new Error(body?.error || "Could not delete the product")
  if (body.outcome === "deleted") return { outcome: "deleted", status: String(body.status ?? ""), slug: body.slug ?? null }
  if (body.outcome === "archived") {
    return {
      outcome: "archived",
      message: body.message || "It was archived instead",
      status: String(body.status ?? "archived"),
      archived: body.archived !== false,
      slug: body.slug ?? null,
    }
  }
  throw new Error("Could not delete the product")
}

/* ── What this tab has changed, for the list's kept copy ─────────────────── */

/** As long as the router keeps a page (next.config staleTimes, five minutes), and a little more. */
const KEPT_MS = 6 * 60_000

const deleted = new Set<string>()
const patched = new Map<string, { status: string; archived: boolean; at: number }>()
let notice: string | null = null

/** A product this tab deleted. */
export function rememberDeleted(id: string): void {
  deleted.add(id)
  patched.delete(id)
}

/** A product this tab archived, or restored: the row as the database answered. */
export function rememberStatus(id: string, row: { status: string; archived: boolean }): void {
  patched.set(id, { status: row.status, archived: row.archived, at: Date.now() })
}

type Listed = { id: string; status: string; archived?: boolean | null }

function livePatch(id: string) {
  const p = patched.get(id)
  if (!p) return null
  if (Date.now() - p.at > KEPT_MS) {
    patched.delete(id)
    return null
  }
  return p
}

/** The products as this tab last left them: deleted ones out, archived ones archived. */
export function withChanges<T extends Listed>(products: readonly T[]): T[] {
  return products
    .filter((p) => !deleted.has(p.id))
    .map((p) => {
      const patch = livePatch(p.id)
      return patch && (patch.status !== p.status || patch.archived !== !!p.archived) ? { ...p, status: patch.status, archived: patch.archived } : p
    })
}

/** Was this copy of the list drawn before a change this tab made? Then the router's kept pages are out of date too. */
export function isStale(products: readonly Listed[]): boolean {
  return products.some((p) => {
    if (deleted.has(p.id)) return true
    const patch = livePatch(p.id)
    return !!patch && (patch.status !== p.status || patch.archived !== !!p.archived)
  })
}

/** One line for the list to show when it comes back (the editor has gone by then). */
export function leaveNotice(message: string): void {
  notice = message
}

export function takeNotice(): string | null {
  const n = notice
  notice = null
  return n
}
