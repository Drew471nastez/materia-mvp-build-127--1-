/**
 * ===========================================================================
 *  A PLACE WITH NOTHING IN IT YET
 * ===========================================================================
 * Round 11: the classroom said "No courses yet." in a dashed box, as if the
 * page were a placeholder for a list. A place in a community that has
 * nothing in it is a normal state, not an error, so it reads as one: a white
 * card like every card in the community (a hairline, a one pixel shadow),
 * the place's own icon in a quiet tile, one line that says what will be
 * here, one that says when, and for the people who run the community the
 * one thing that fills it (Add a course, Schedule an event), in ink.
 *
 * No illustration, no dashes, no exclamation marks. Server safe.
 */
import Link from "next/link"
import { PlaceIcon } from "./place-icons"
import type { TabKey } from "./nav"
import { BTN_PRIMARY, CARD } from "./ui"

export function PlaceEmpty({ place, title, line, action = null, compact = false, ...data }: { place: TabKey; title: string; line: string; action?: { href: string; label: string } | null; compact?: boolean } & Record<`data-${string}`, string>) {
  return (
    <div className={`${CARD} flex flex-col items-center px-6 text-center shadow-[0_1px_2px_rgba(16,24,40,0.04)] ${compact ? "py-10" : "py-12 sm:py-16"}`} {...data}>
      <span className="flex h-12 w-12 items-center justify-center rounded-[14px] border border-[#e8eaee] bg-[#f6f7f9] text-[#4b5563]" data-place-empty-icon="">
        <PlaceIcon place={place} size={24} />
      </span>
      <p className="mt-4 text-[16px] font-semibold tracking-[-0.005em] text-[#1a1a2e]">{title}</p>
      <p className="mt-1 max-w-[340px] text-[14px] leading-relaxed text-[#6b7280]">{line}</p>
      {action ? (
        <Link href={action.href} className={`${BTN_PRIMARY} mt-5`} data-place-empty-action="">
          {action.label}
        </Link>
      ) : null}
    </div>
  )
}
