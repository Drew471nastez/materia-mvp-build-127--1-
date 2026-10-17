/**
 * ===========================================================================
 *  A CARRIER'S LOGO, AT ANY SIZE
 * ===========================================================================
 * <CarrierLogo carrier="FAN Courier" size={24} />: the carrier's own mark as a
 * small rounded tile, from the shared list (lib/physical/carriers.ts), which
 * takes an id, a name or the way a seller typed it ("fan courier", "Hermes
 * UK"). The tiles are local 96px WebP files (public/carriers), about 1.5 KB
 * each, so nothing is fetched from a carrier at runtime.
 *
 * A carrier we don't know gets a neutral tile with its first letters; no
 * carrier at all (local delivery, no tracking) gets a neutral truck.
 *
 * No hooks and no "use client": it draws the same in a server component (the
 * buyer's order page) and a client one (the seller's order).
 */

import { Truck } from "lucide-react"
import { carrierOf } from "@/lib/physical/carriers"
import { cn } from "@/lib/utils"

/** A carrier's letters: its first two words' first letters ("FAN Courier" is FC, "Speedy Bob" is SB). */
export function initialsOf(name: string): string {
  return name
    .split(/[\s/.-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("")
}

export function CarrierLogo({
  carrier,
  size = 24,
  className,
  decorative = false,
}: {
  /** An id ("dpd"), a name ("DHL Express") or what the seller typed under Other. */
  carrier: string | null | undefined
  /** The tile's side in CSS pixels. */
  size?: number
  className?: string
  /** True when the carrier's name is written right beside it, so a screen reader doesn't read it twice. */
  decorative?: boolean
}) {
  const known = carrierOf(carrier)
  const radius = Math.max(4, Math.round(size * 0.24))
  const box = { width: size, height: size, borderRadius: radius }
  if (known) {
    /*
      THE TILE OVER ITS OWN LETTERS. The carrier's initials are drawn first and the logo over them, as a background
      image: one that fails to load (a deploy that dropped a file, a blocked request) paints nothing, so the letters
      stay, where an <img> leaves a broken picture or an empty framed box (measured, scripts/check-carrier-select.mjs).
      Every tile in public/carriers is opaque, so a logo that loads hides the letters completely. The name is on the
      tile itself (role="img"), read once whether or not the file arrived.
    */
    return (
      <span
        role={decorative ? undefined : "img"}
        aria-label={decorative ? undefined : known.name}
        aria-hidden={decorative ? true : undefined}
        data-carrier-logo={known.id}
        style={{ ...box, fontSize: Math.max(9, Math.round(size * 0.38)) }}
        className={cn("relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden bg-[#f1f2f4] font-semibold leading-none text-[#4b5563] outline outline-1 -outline-offset-1 outline-black/[0.07]", className)}
      >
        <span aria-hidden="true" data-carrier-logo-letters="">
          {initialsOf(known.name)}
        </span>
        <span aria-hidden="true" data-carrier-logo-image={known.logo} className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${known.logo})` }} />
      </span>
    )
  }
  const name = (carrier ?? "").trim()
  const initials = initialsOf(name)
  return (
    <span
      role={decorative || !name ? undefined : "img"}
      aria-label={decorative || !name ? undefined : name}
      aria-hidden={decorative || !name ? true : undefined}
      data-carrier-logo={name ? "other" : "none"}
      style={{ ...box, fontSize: Math.max(9, Math.round(size * 0.38)) }}
      className={cn("inline-flex shrink-0 select-none items-center justify-center bg-[#f1f2f4] font-semibold leading-none text-[#4b5563] outline outline-1 -outline-offset-1 outline-black/[0.05]", className)}
    >
      {initials || <Truck style={{ width: Math.round(size * 0.55), height: Math.round(size * 0.55) }} strokeWidth={1.75} />}
    </span>
  )
}
