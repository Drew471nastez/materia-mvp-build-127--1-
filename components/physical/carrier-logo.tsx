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
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={known.logo}
        alt={decorative ? "" : known.name}
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        draggable={false}
        data-carrier-logo={known.id}
        style={box}
        className={cn("inline-block shrink-0 select-none bg-white object-cover outline outline-1 -outline-offset-1 outline-black/[0.07]", className)}
      />
    )
  }
  const name = (carrier ?? "").trim()
  const initials = name
    .split(/[\s/.-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("")
  return (
    <span
      role={decorative || !name ? undefined : "img"}
      aria-label={decorative || !name ? undefined : name}
      aria-hidden={decorative || !name ? true : undefined}
      data-carrier-logo={name ? "other" : "none"}
      style={{ ...box, fontSize: Math.max(9, Math.round(size * 0.38)) }}
      className={cn("inline-flex shrink-0 select-none items-center justify-center bg-[#f1f2f4] font-semibold leading-none text-[#6b7280] outline outline-1 -outline-offset-1 outline-black/[0.05]", className)}
    >
      {initials || <Truck style={{ width: Math.round(size * 0.55), height: Math.round(size * 0.55) }} strokeWidth={1.75} />}
    </span>
  )
}
