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
 * No state, so it renders on the server.
 */
import Image from "next/image"
import Link from "next/link"
import { Check, Lock } from "lucide-react"
import { lengthInWords } from "@/lib/courses/progress"
import { PlaceEmpty } from "@/components/community/member/place-empty"
import { PlaceIcon } from "@/components/community/member/place-icons"
import { lessonsLabel, lockHint, opensOnLabel, type ProgramCard } from "./model"

export function LearnLibrary({ programs, timeZone, manageHref = null }: { programs: ProgramCard[]; timeZone?: string; /** The builder, for somebody who may change it; null for everybody else. */ manageHref?: string | null }) {
  return (
    <section data-learn aria-labelledby="learn-title">
      <header className="mb-4 flex items-baseline justify-between gap-3 sm:mb-5">
        <h1 id="learn-title" className="text-[22px] font-bold tracking-[-0.01em] text-[#1a1a2e] sm:text-[24px]">
          Learn
        </h1>
        {programs.length ? (
          <p className="text-[13px] tabular-nums text-[#6b7280]">
            {programs.length} {programs.length === 1 ? "program" : "programs"}
          </p>
        ) : null}
      </header>

      {programs.length === 0 ? (
        <PlaceEmpty
          data-learn-empty=""
          place="classroom"
          title="Nothing to learn here yet"
          line={manageHref ? "Programs you make show up here for your members, lesson by lesson." : "Programs and their lessons show up here as soon as they are added."}
          action={manageHref ? { href: manageHref, label: "Make a program" } : null}
        />
      ) : (
        <ul className="grid grid-cols-1 gap-3 min-[520px]:grid-cols-2 sm:gap-4 xl:grid-cols-3" data-program-grid>
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
      data-program-card={p.id}
      data-locked={lock ? (p.locked?.reason ?? "yes") : "no"}
      className="group/card flex h-full flex-row gap-3 overflow-hidden rounded-2xl border border-[#e4e7ec]/80 bg-white p-3 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_3px_8px_-2px_rgba(16,24,40,0.05)] transition-[border-color,box-shadow] duration-150 hover:border-[#d5d9e0] hover:shadow-[0_1px_2px_rgba(16,24,40,0.05),0_8px_20px_-6px_rgba(16,24,40,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 min-[520px]:flex-col min-[520px]:gap-0 min-[520px]:p-0"
    >
      <div className="relative aspect-[16/9] w-[116px] shrink-0 self-start overflow-hidden rounded-lg bg-[#f1f2f4] min-[520px]:w-full min-[520px]:rounded-none">
        {p.coverUrl ? (
          <Image src={p.coverUrl} alt="" fill sizes="(min-width: 1280px) 320px, (min-width: 520px) 50vw, 116px" className={`object-cover ${lock && !paid ? "saturate-[0.6]" : ""}`} />
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
            Done
          </span>
        ) : null}
        {p.draft ? (
          <span className="absolute left-2.5 top-2.5 hidden rounded-md bg-[#1a1a2e]/80 px-1.5 py-0.5 text-[11px] font-semibold text-white min-[520px]:inline-flex" data-draft>
            Draft
          </span>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-1 flex-col min-[520px]:px-3.5 min-[520px]:pb-3.5 min-[520px]:pt-3">
        <h2 className="line-clamp-2 text-[15px] font-semibold leading-5 text-[#1a1a2e]">
          {p.draft ? <span className="mr-1.5 inline-block rounded bg-[#eef0f3] px-1 align-[1px] text-[11px] font-semibold text-[#4b5563] min-[520px]:hidden">Draft</span> : null}
          {p.title}
        </h2>
        <p className="mt-1 text-[13px] tabular-nums text-[#6b7280]">
          {lessonsLabel(p.lessons)}
          {length ? ` · ${length}` : ""}
        </p>
        <div className="mt-auto pt-2 min-[520px]:pt-3">
          {lock && p.locked ? (
            <p className="flex min-w-0 items-center gap-1.5 text-[13px] text-[#6b7280]">
              <span className="sr-only">Locked: </span>
              <span className="inline-flex min-w-0 items-center gap-1 font-semibold text-[#1a1a2e] min-[520px]:hidden" data-lock-line>
                <Lock className="h-3 w-3 shrink-0" aria-hidden />
                <span className="truncate tabular-nums">{lock}</span>
              </span>
              <span className="hidden min-[520px]:inline">{lockHint(p.locked)}</span>
            </p>
          ) : (
            <div className="flex items-center gap-2.5" data-progress={p.percent}>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#eceef1]" role="progressbar" aria-valuenow={p.percent} aria-valuemin={0} aria-valuemax={100} aria-label={`${p.title} progress`}>
                <div className="h-full rounded-full bg-[#1a1a2e]" style={{ width: `${p.percent}%` }} />
              </div>
              <span className="w-9 shrink-0 text-right text-[12px] font-semibold tabular-nums text-[#1a1a2e]">{p.percent}%</span>
            </div>
          )}
        </div>
      </div>
    </Link>
  )
}
