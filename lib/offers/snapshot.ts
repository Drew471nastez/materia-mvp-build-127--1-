/**
 * An order line's `offers`, as the checkout keeps them in its snapshot
 * (orders.product_snapshot.offers, commerce_checkouts.lines[].offers): each
 * offer that saved on the line, by the name the checkout showed it with, and
 * its part of the line's discount. Written by lib/physical/checkout-server
 * snapshotLine for a cart that ships and by lib/checkout/fulfil-cart-item
 * lineSnapshot for a cart of downloads, read the same way by the receipt,
 * the emails, the admin's order, the exports and the offers page.
 */

/** A snapshot's `offers`, read leniently: each with a name and what it saved, or null for none. */
export function offersOfSnapshot(raw: unknown): { title: string; savedCents: number }[] | null {
  if (!Array.isArray(raw)) return null
  const out = raw
    .map((o) => ({ title: typeof o?.title === "string" ? o.title.slice(0, 120) : "", savedCents: Math.max(0, Math.round(Number(o?.saved_cents ?? o?.savedCents) || 0)) }))
    .filter((o) => o.title && o.savedCents > 0)
    .slice(0, 10)
  return out.length ? out : null
}

/** Each offer over several lines, added up by its name, in the order first seen: the order's saving rows. */
export function savingsOfLines(lines: { offers?: unknown }[] | null | undefined): { label: string; cents: number }[] {
  const out: { label: string; cents: number }[] = []
  for (const l of lines ?? []) {
    for (const o of offersOfSnapshot(l?.offers) ?? []) {
      const same = out.find((x) => x.label === o.title)
      if (same) same.cents += o.savedCents
      else out.push({ label: o.title, cents: o.savedCents })
    }
  }
  return out
}
