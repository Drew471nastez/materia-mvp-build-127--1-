import { FLAG_CODES } from "@/lib/account/flag-sprite"
import { cn } from "@/lib/utils"

/**
 * One country's flag as a picture, for a line of text that names the
 * country (an order's Country, the admin console's visitors). The flag is
 * its own file in public/flags (country-flag-icons, MIT, 3:2), drawn at the
 * size Analytics draws its countries, with the same hairline edge so a
 * white flag keeps its shape. It was the emoji: two letters on Windows and
 * Linux, and a different picture on every system (round 64). A code with no
 * file draws nothing; the country's name is always in the text beside it.
 */
export function FlagImage({ code, className }: { code: string | null | undefined; className?: string }) {
  const cc = (code || "").toUpperCase()
  if (!FLAG_CODES.has(cc)) return null
  return (
    <span aria-hidden data-flag={cc} className={cn("relative inline-block h-[14px] w-[21px] shrink-0 overflow-hidden rounded-[3px] align-[-2px] shadow-[0_0_0_0.5px_rgba(17,24,39,0.18)]", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/flags/${cc}.svg`} alt="" width={21} height={14} loading="lazy" decoding="async" className="block h-full w-full object-cover" />
    </span>
  )
}
