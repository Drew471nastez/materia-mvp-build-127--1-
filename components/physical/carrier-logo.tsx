/**
 * PLACEHOLDER until K27's shared carrier module lands (components/physical/carrier-logo.tsx
 * with its optimized marks under public/carriers/). Same name and props, so callers do not
 * change when it is replaced: a carrier's colours and short mark, drawn locally, never a
 * remote image; a neutral parcel mark for a carrier we do not know.
 */
import { Truck } from "lucide-react"
import { carrierOf } from "@/lib/physical/carriers"
import { cn } from "@/lib/utils"

const MARKS: Record<string, { bg: string; fg: string; mark: string }> = {
  USPS: { bg: "#333366", fg: "#ffffff", mark: "USPS" },
  UPS: { bg: "#351c15", fg: "#ffb500", mark: "UPS" },
  FedEx: { bg: "#ffffff", fg: "#4d148c", mark: "FedEx" },
  "DHL Express": { bg: "#ffcc00", fg: "#d40511", mark: "DHL" },
  "DHL Paket": { bg: "#ffcc00", fg: "#d40511", mark: "DHL" },
  "Royal Mail": { bg: "#e60000", fg: "#ffdd00", mark: "RM" },
  Evri: { bg: "#007bc4", fg: "#ffffff", mark: "evri" },
  Hermes: { bg: "#0091cd", fg: "#ffffff", mark: "H" },
  DPD: { bg: "#dc0032", fg: "#ffffff", mark: "dpd" },
  GLS: { bg: "#061ab1", fg: "#ffd100", mark: "GLS" },
  "FAN Courier": { bg: "#0b4ea2", fg: "#ffd200", mark: "FAN" },
  Sameday: { bg: "#f7a600", fg: "#1d1d1b", mark: "SD" },
  Cargus: { bg: "#f26522", fg: "#ffffff", mark: "C" },
  "Posta Romana": { bg: "#003b7a", fg: "#ffd200", mark: "PR" },
  "Canada Post": { bg: "#da291c", fg: "#ffffff", mark: "CP" },
  "Australia Post": { bg: "#dc1928", fg: "#ffffff", mark: "AP" },
  PostNL: { bg: "#ff6200", fg: "#ffffff", mark: "PNL" },
  "La Poste / Colissimo": { bg: "#ffcd00", fg: "#003da5", mark: "LP" },
  Aramex: { bg: "#e31837", fg: "#ffffff", mark: "A" },
  InPost: { bg: "#ffcb04", fg: "#1d1d1b", mark: "IP" },
  PostNord: { bg: "#00a0d6", fg: "#ffffff", mark: "PN" },
  Correos: { bg: "#ffcd00", fg: "#002e6d", mark: "C" },
  "Poste Italiane": { bg: "#ffe600", fg: "#0047bb", mark: "PI" },
  "An Post": { bg: "#00754a", fg: "#ffffff", mark: "AP" },
  Purolator: { bg: "#cb0a21", fg: "#ffffff", mark: "P" },
}

export function CarrierLogo({ carrier, size = 40, className }: { carrier: string | null | undefined; size?: number; className?: string }) {
  const known = carrierOf(carrier)
  const m = known ? MARKS[known.name] : null
  const radius = Math.round(size * 0.24)
  if (!m) {
    return (
      <span aria-hidden className={cn("grid shrink-0 place-items-center bg-[#f3f4f6] text-[#1a1a2e]", className)} style={{ width: size, height: size, borderRadius: radius }} data-carrier-logo="">
        <Truck style={{ width: size * 0.48, height: size * 0.48 }} strokeWidth={1.75} />
      </span>
    )
  }
  return (
    <span
      role="img"
      aria-label={known!.name}
      className={cn("grid shrink-0 place-items-center overflow-hidden font-bold tracking-[-0.02em] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]", className)}
      style={{ width: size, height: size, borderRadius: radius, background: m.bg, color: m.fg, fontSize: Math.max(9, Math.round(size * (m.mark.length > 3 ? 0.26 : 0.32))) }}
      data-carrier-logo={known!.name}
    >
      {m.mark}
    </span>
  )
}
