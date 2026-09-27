/**
 * A domain provider's own mark, in its own colour, for the Domains picker and
 * its Open link. The marks are Simple Icons through react-icons/si (the set
 * components/onepage/brand-icons.tsx already uses), so each is the company's
 * published logo and only the six in use reach the bundle. "Somewhere else"
 * has no company, so it is a plain globe in the page's grey.
 */
import { Globe } from "lucide-react"
import { SiCloudflare, SiGodaddy, SiHostinger, SiNamecheap, SiPorkbun, SiSquarespace } from "react-icons/si"
import type { IconType } from "react-icons"

import type { RegistrarId } from "@/lib/custom-domains/dns-help"
import { cn } from "@/lib/utils"

/** Each brand's published colour (Simple Icons), as a class so no parent's grey can override it. */
const MARKS: Record<Exclude<RegistrarId, "other">, { Icon: IconType; tone: string }> = {
  godaddy: { Icon: SiGodaddy, tone: "text-[#1BDBDB]" },
  namecheap: { Icon: SiNamecheap, tone: "text-[#DE3723]" },
  cloudflare: { Icon: SiCloudflare, tone: "text-[#F38020]" },
  squarespace: { Icon: SiSquarespace, tone: "text-[#000000]" },
  porkbun: { Icon: SiPorkbun, tone: "text-[#EF7878]" },
  hostinger: { Icon: SiHostinger, tone: "text-[#673DE6]" },
}

export function RegistrarMark({ id, className }: { id: RegistrarId; className?: string }) {
  if (id === "other") return <Globe aria-hidden data-registrar-mark="other" className={cn("size-4 shrink-0 text-[#6b7280]", className)} />
  const { Icon, tone } = MARKS[id]
  return <Icon aria-hidden data-registrar-mark={id} className={cn("size-4 shrink-0", tone, className)} />
}
