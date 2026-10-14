"use client"

/**
 * ===========================================================================
 *  LEARN
 * ===========================================================================
 * /community/<slug>/learn, inside the member shell (round 13: the Classroom
 * renamed, and what it holds called programs). One card per program, in the
 * creator's order: the cover, how many lessons and how long, and the
 * member's own progress. A program the member cannot open yet stays on the
 * shelf with what opens it on the cover: "Level 3", "Opens on Mar 4", or the
 * price of one sold on its own. A draft shows only to the people who run
 * Learn, marked Draft.
 *
 * EMPTY IS A NORMAL STATE (round 11): the community's own empty card says
 * what will be here, and the people who run it get the one button that
 * fills it.
 *
 * No state. A press on a card is noted (./learn-history.ts), so the
 * program's arrow can go back to this shelf as it was left.
 */
import Image from "next/image"
import Link from "next/link"
import { Check, Lock } from "lucide-react"
import { lengthInWords } from "@/lib/courses/progress"
import { PlaceEmpty } from "@/components/community/member/place-empty"
import { PlaceIcon } from "@/components/community/member/place-icons"
import { CARD_RAISED } from "@/components/community/member/ui"
import { cn } from "@/lib/utils"
import { noteProgramOpened } from "./learn-history"
import { lessonsLabel, lockHint, opensOnLabel, type ProgramCard } from "./model"
import { tt } from "@/lib/i18n/text"

export function LearnLibrary({ programs, timeZone, manageHref = null }: { programs: ProgramCard[]; timeZone?: string; /** The builder, for somebody who may change it; null for everybody else. */ manageHref?: string | null }) {
  return (
    <section data-learn aria-labelledby="learn-title">
      <header className="mb-3 flex items-baseline justify-between gap-3 sm:mb-4">
        <h1 id="learn-title" className="text-[19px] font-bold tracking-[-0.01em] text-[#1a1a2e] sm:text-[21px]">
          {tt("Learn")}
        </h1>
        {programs.length ? (
          <p className="text-[12.5px] tabular-nums text-[#6b7280]">
            {tt("{n, plural, one {# program} other {# programs}}", { n: programs.length })}
          </p>
        ) : null}
      </header>

      {programs.length === 0 ? (
        <PlaceEmpty
          data-learn-empty=""
          place="classroom"
          title={tt("Nothing to learn here yet")}
          line={manageHref ? tt("Programs you make show up here for your members, lesson by lesson.") : tt("Programs and their lessons show up here as soon as they are added.")}
          action={manageHref ? { href: manageHref, label: tt("Make a program") } : null}
        />
      ) : (
        <ul
          className={cn(
            "grid gap-3 sm:gap-4",
            /* Round 27, the owner: the cards a little smaller on a computer: three to a row from 1280px. */
            programs.length === 1
              ? "grid-cols-1 min-[520px]:max-w-[270px]"
              : "grid-cols-1 max-w-[min(100%,900px)] min-[520px]:grid-cols-2 xl:grid-cols-3",
          )}
          data-program-grid
        >
          {programs.map((p) => (
            <li key={p.id}>
              <ProgramTile program={p} timeZone={timeZone} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** What sits on a locked cover: the date in the viewer's zone for a drip, otherwise the lock's own words. */
function lockWords(p: ProgramCard, timeZone?: string): string | null {
  const l = p.locked
  if (!l) return null
  if (l.reason === "drip" && l.opensAt) return opensOnLabel(l.opensAt, timeZone)
  return l.label
}

function ProgramTile({ program: p, timeZone }: { program: ProgramCard; timeZone?: string }) {
  const length = lengthInWords(p.totalSeconds)
  const lock = lockWords(p, timeZone)
  const paid = p.locked?.reason === "paid"
  return (
    <Link
      href={p.href}
      prefetch
      onClick={noteProgramOpened}
      data-program-card={p.id}
      data-locked={lock ? (p.locked?.reason ?? "yes") : "no"}
      className={cn(
        CARD_RAISED,
        "group/card relative flex h-full flex-row gap-3 p-3 transition-[border-color] duration-[400ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-[#d9dce1] motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 min-[520px]:flex-col min-[520px]:gap-0 min-[520px]:p-0 touch-manipulation [-webkit-tap-highlight-color:transparent]",
        /*
          THE LIFT IS ITS OWN LAYER (round 15). The card's resting shadow has an inset line and a lifted shadow cannot, and the
          browser cannot blend two shadows of different kinds: the hover jumped from one to the other halfway through. The lift
          is a layer of its own now that only fades, in and out over the same 400ms, so the hover is the same smooth both ways.
        */
        "after:pointer-events-none after:absolute after:-inset-px after:rounded-[inherit] after:opacity-0 after:shadow-[0_2px_6px_rgba(16,24,40,0.06),0_12px_28px_-12px_rgba(16,24,40,0.16)] after:transition-opacity after:duration-[400ms] after:ease-[cubic-bezier(0.22,1,0.36,1)] hover:after:opacity-100 motion-reduce:after:transition-none",
      )}
    >
      <div className="relative aspect-[16/9] w-[116px] shrink-0 self-start overflow-hidden rounded-lg bg-[#f1f2f4] isolate min-[520px]:w-full min-[520px]:rounded-b-none min-[520px]:rounded-t-[15px]">
        {p.coverUrl ? (
          <Image src={p.coverUrl} alt="" fill sizes="(min-width: 1280px) 400px, (min-width: 520px) 45vw, 116px" className={`object-cover transition-[scale] duration-[600ms] ease-[cubic-bezier(0.22,1,0.36,1)] [will-change:scale] group-hover/card:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover/card:scale-100 ${lock && !paid ? "saturate-[0.6]" : ""}`} />
        ) : (
          <span className="flex h-full w-full items-center justify-center">
            <PlaceIcon place="classroom" className="h-5 w-5 text-[#b0b4bb] min-[520px]:h-7 min-[520px]:w-7" />
          </span>
        )}
        {lock && !paid && p.coverUrl ? <span className="absolute inset-0 bg-[#1a1a2e]/35" aria-hidden /> : null}
        {lock ? (
          <span className="absolute bottom-2.5 left-2.5 hidden max-w-[calc(100%-20px)] items-center gap-1.5 rounded-full bg-white/95 py-1 pl-2 pr-2.5 text-[12px] font-semibold text-[#1a1a2e] shadow-[0_1px_3px_rgba(0,0,0,0.18)] min-[520px]:inline-flex" data-lock-label>
            <Lock className="h-3 w-3 shrink-0" aria-hidden />
            <span className="truncate tabular-nums">{lock}</span>
          </span>
        ) : p.status === "completed" ? (
          <span className="absolute right-2.5 top-2.5 hidden items-center gap-1 rounded-full bg-white/95 py-1 pl-1.5 pr-2.5 text-[12px] font-semibold text-[#1a1a2e] shadow-[0_1px_3px_rgba(0,0,0,0.18)] min-[520px]:inline-flex">
            <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
            {tt("Done")}
          </span>
        ) : null}
        {p.draft ? (
          <span className="absolute left-2.5 top-2.5 hidden rounded-md bg-[#1a1a2e]/80 px-1.5 py-0.5 text-[11px] font-semibold text-white min-[520px]:inline-flex" data-draft>
            {tt("Draft")}
          </span>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-1 flex-col min-[520px]:px-3 min-[520px]:pb-3 min-[520px]:pt-2.5">
        <h2 className="line-clamp-2 text-[14.5px] font-semibold leading-5 text-[#1a1a2e]">
          {p.draft ? <span className="mr-1.5 inline-block rounded bg-[#eef0f3] px-1 align-[1px] text-[11px] font-semibold text-[#4b5563] min-[520px]:hidden">{tt("Draft")}</span> : null}
          {p.title}
        </h2>
        <p className="mt-1 text-[13px] tabular-nums text-[#6b7280]">
          {lessonsLabel(p.lessons)}
          {length ? ` · ${length}` : ""}
        </p>
        <div className="mt-auto pt-2 min-[520px]:pt-3">
          {lock && p.locked ? (
            <p className="flex min-w-0 items-center gap-1.5 text-[13px] text-[#6b7280]">
              <span className="sr-only">{tt("Locked:")} </span>
              <span className="inline-flex min-w-0 items-center gap-1 font-semibold text-[#1a1a2e] min-[520px]:hidden" data-lock-line>
                <Lock className="h-3 w-3 shrink-0" aria-hidden />
                <span className="truncate tabular-nums">{lock}</span>
              </span>
              <span className="hidden min-[520px]:inline">{lockHint(p.locked)}</span>
            </p>
          ) : (
            <div className="flex items-center gap-2.5" data-progress={p.percent}>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#eceef1]" role="progressbar" aria-valuenow={p.percent} aria-valuemin={0} aria-valuemax={100} aria-label={tt("{title} progress", { title: p.title })}>
                <div className="h-full origin-left rounded-full bg-[#1a1a2e]" style={{ scale: `${Math.max(0, Math.min(100, p.percent)) / 100} 1` }} />
              </div>
              <span className="w-9 shrink-0 text-right text-[12px] font-semibold tabular-nums text-[#1a1a2e]">{p.percent}%</span>
            </div>
          )}
        </div>
      </div>
    </Link>
  )
}
