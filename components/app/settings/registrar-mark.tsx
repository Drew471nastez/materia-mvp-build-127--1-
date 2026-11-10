/**
 * A domain provider's own mark, in its own colour, for the Domains picker and
 * its Open link. The marks are Simple Icons through react-icons/si (the set
 * components/onepage/brand-icons.tsx already uses), so each is the company's
 * published logo and only the ones in use reach the bundle. "Somewhere else"
 * has no company, so it is a plain globe in the page's grey.
 */
import type { ComponentType, SVGProps } from "react"
import { Globe } from "lucide-react"
import { SiAmazonroute53, SiCloudflare, SiGodaddy, SiHetzner, SiHostinger, SiInfomaniak, SiIonos, SiNamecheap, SiNamesilo, SiOvh, SiPorkbun, SiSquarespace, SiWix } from "@/components/icons/brand-icons.generated"
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
  ionos: { Icon: SiIonos, tone: "text-[#003D8F]" },
  wix: { Icon: SiWix, tone: "text-[#0C6EFC]" },
  ovh: { Icon: SiOvh, tone: "text-[#123F6D]" },
  route53: { Icon: SiAmazonroute53, tone: "text-[#8C4FFF]" },
  namesilo: { Icon: SiNamesilo, tone: "text-[#031B4E]" },
  hetzner: { Icon: SiHetzner, tone: "text-[#D50C2D]" },
  infomaniak: { Icon: SiInfomaniak, tone: "text-[#0098FF]" },
}

export function RegistrarMark({ id, className }: { id: RegistrarId; className?: string }) {
  if (id === "other") return <Globe aria-hidden data-registrar-mark="other" className={cn("size-4 shrink-0 text-[#6b7280]", className)} />
  /* IconType is typed against React 18's global JSX; this project is on 19 (see components/social/platform-icons.tsx). */
  const Icon = MARKS[id].Icon as unknown as ComponentType<SVGProps<SVGSVGElement> & { "data-registrar-mark"?: string }>
  const { tone } = MARKS[id]
  return <Icon aria-hidden data-registrar-mark={id} className={cn("size-4 shrink-0", tone, className)} />
}
