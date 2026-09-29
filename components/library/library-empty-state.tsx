import Link from "next/link"
import { CARD, VIOLET } from "./library-ui"

/** One empty library tab: same card, type and CTA as Products / Courses. */
export function LibraryEmptyState({
  title,
  description,
  ctaLabel,
  ctaHref,
}: {
  title: string
  description: string
  ctaLabel: string
  ctaHref: string
}) {
  return (
    <div data-library-empty="" className={`${CARD} px-5 py-10 text-center sm:px-10 sm:py-14`}>
      <p className="text-[16px] font-semibold text-[#1a1a2e]">{title}</p>
      <p className="mx-auto mt-1.5 max-w-[360px] text-[14px] leading-relaxed text-[#6b7280]">{description}</p>
      <Link href={ctaHref} className={`${VIOLET} mt-5`}>
        {ctaLabel}
      </Link>
    </div>
  )
}
