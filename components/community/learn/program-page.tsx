"use client"

/**
 * ===========================================================================
 *  ONE PROGRAM, INSIDE THE COMMUNITY
 * ===========================================================================
 * /community/<slug>/learn/<programId>. An open program is the course
 * player itself (components/courses/course-player.tsx): the same lessons,
 * signed videos and progress a buyer of a course gets, its arrow going back
 * to Learn. A program the member cannot open yet says why in a sentence and
 * shows what is inside it; one sold on its own has the price on its button,
 * and paying happens right here, in a sheet (./program-checkout.tsx).
 *
 * Round 33: every lock says what opens it and offers the one step there is:
 * Buy for a price, the leaderboard for a level (with the level the member
 * is at), the date for one that opens after joining. A private program never gets here for
 * somebody not on its list: the server does not list it or open its page.
 * The description is drawn as it was written in the rich text field.
 */
import { useCallback } from "react"
import Image from "next/image"
import Link from "next/link"
import { ArrowLeft, Lock } from "lucide-react"
import { CoursePlayer } from "@/components/courses/course-player"
import { useCommunityNavigator } from "@/lib/communities/client/navigator-context"
import { PlaceIcon } from "@/components/community/member/place-icons"
import { BTN_PRIMARY, BTN_SECONDARY } from "@/components/community/member/ui"
import type { PlayerData } from "@/lib/courses/types"
import { lessonsLabel, opensOnLabel, type ProgramCard } from "./model"
import { BuyProgram } from "./program-checkout"
import { cameFromLearn } from "./learn-history"
import { tt } from "@/lib/i18n/text"
import { cleanStoredHtml } from "@/lib/rich-text/html"

export function ProgramPlayer({ data, learnHref }: { data: PlayerData; learnHref: string }) {
  const nav = useCommunityNavigator()
  /*
    THE ARROW GOES BACK THE WAY THE MEMBER CAME (round 18, ./learn-history.ts): the browser's Back when the step before is
    Learn, so the shelf returns as it was left; otherwise Learn, through the community's navigator, never a page load.
    Outside a community (a probe, a page with no frame) the link does what a link does.
  */
  const onBack = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      if (!nav.inCommunity || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      e.preventDefault()
      if (cameFromLearn()) window.history.back()
      else nav.go({ kind: "learn" })
    },
    [nav],
  )
  return <CoursePlayer data={data} backHref={learnHref} backLabel={tt("Learn")} embedded onBack={onBack} />
}

/** What is inside, for a program the member cannot open yet: each module with its lesson titles. */
export interface ProgramOutline {
  modules: { id: string; title: string; coverUrl?: string | null; lessons: string[] }[]
}

/** The description: as written in the rich text field (cleaned on the server and again here), or the plain text from before. */
export function ProgramDescription({ program }: { program: Pick<ProgramCard, "summary" | "descriptionHtml"> }) {
  if (program.descriptionHtml)
    return <div data-program-description="" className="storelib-prose mt-2 break-words text-[15px] leading-6 text-[#374151] [&_a]:font-medium [&_a]:underline [&_a]:underline-offset-2 [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-lg" dangerouslySetInnerHTML={{ __html: cleanStoredHtml(program.descriptionHtml) }} />
  if (program.summary) return <p className="mt-2 whitespace-pre-line text-[15px] leading-6 text-[#374151]">{program.summary}</p>
  return null
}

function sentence(p: ProgramCard, timeZone?: string): string {
  const l = p.locked
  if (!l) return ""
  switch (l.reason) {
    case "paid":
      return tt("This program is sold on its own. Buy it once and it stays in your Learn for as long as you are a member.")
    case "drip":
      return tt("{value}. Programs like this open a set number of days after you join.", { value: l.opensAt ? opensOnLabel(l.opensAt, timeZone) : tt("It opens soon") })
    case "level":
      return typeof l.viewerLevel === "number"
        ? tt("This program opens at {value}. You are at level {current}. Levels come from points for taking part in the community.", { value: l.label.toLowerCase(), current: l.viewerLevel })
        : tt("This program opens at {value}. Levels come from taking part in the community.", { value: l.label.toLowerCase() })
    case "private":
      return tt("This program is for members the owner picked.")
    case "tier":
      return tt("This program is for {label}.", { label: l.label })
    case "product":
      return tt("This program is for {value}{value2}.", { value: l.label.charAt(0).toLowerCase(), value2: l.label.slice(1) })
    case "role":
      return tt("This program is for {value} of the community.", { value: l.label.toLowerCase() })
    default:
      return tt("This program is for members.")
  }
}

function Back({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="mb-4 inline-flex h-10 items-center gap-1.5 rounded-[10px] pr-2 text-[14px] font-medium text-[#4b5563] transition-[color,translate] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-x-0.5 hover:text-[#1a1a2e] motion-reduce:transition-none motion-reduce:hover:translate-x-0"
    >
      <ArrowLeft className="h-4 w-4" />
      {tt("Learn")}
    </Link>
  )
}

function Cover({ url, dim }: { url: string | null; dim: boolean }) {
  return (
    <div className="relative aspect-[16/9] w-full bg-[#f1f2f4]">
      {url ? (
        <Image src={url} alt="" fill sizes="(min-width: 640px) 600px, 100vw" className={`object-cover ${dim ? "saturate-[0.6]" : ""}`} priority />
      ) : (
        <span className="flex h-full w-full items-center justify-center">
          <PlaceIcon place="classroom" size={32} className="text-[#c4c6cc]" />
        </span>
      )}
    </div>
  )
}

export function LockedProgram({
  program,
  outline,
  learnHref,
  aboutHref,
  communityId,
  communityName,
  timeZone,
  levelsHref = null,
}: {
  program: ProgramCard
  outline: ProgramOutline | null
  learnHref: string
  aboutHref: string
  communityId: string
  communityName: string
  timeZone?: string
  /** The leaderboard, where a member sees their points and level; null when the community has no points. */
  levelsHref?: string | null
}) {
  const reason = program.locked?.reason
  const paid = reason === "paid"
  const upgrade = reason === "tier" || reason === "product"
  const level = reason === "level" && !!levelsHref
  return (
    <div data-locked-program={reason ?? ""} className="mx-auto w-full max-w-[600px]">
      <Back href={learnHref} />
      <article className="overflow-hidden rounded-2xl border border-[#e4e7ec]/80 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_3px_8px_-2px_rgba(16,24,40,0.05)]">
        <Cover url={program.coverUrl} dim={!paid} />
        <div className="px-4 pb-5 pt-4 sm:px-6 sm:pb-6">
          <p className="flex items-center gap-1.5 text-[13px] tabular-nums text-[#6b7280]">
            <Lock className="h-3.5 w-3.5" aria-hidden />
            {lessonsLabel(program.lessons)}
            {paid && program.priceLabel ? <span aria-hidden>·</span> : null}
            {paid && program.priceLabel ? <span className="font-semibold text-[#1a1a2e]">{program.priceLabel}</span> : null}
          </p>
          <h1 className="mt-1 text-[21px] font-bold leading-snug tracking-[-0.01em] text-[#1a1a2e] sm:text-[24px]">{program.title}</h1>
          <ProgramDescription program={program} />
          <p className="mt-3 text-[14px] leading-6 text-[#6b7280]" data-lock-sentence>
            {sentence(program, timeZone)}
          </p>
          <div className="mt-5 flex flex-col gap-2 min-[420px]:flex-row">
            {paid && program.locked?.priceCents ? (
              <BuyProgram
                communityId={communityId}
                communityName={communityName}
                programId={program.id}
                title={program.title}
                priceLabel={program.priceLabel ?? program.locked.label}
                coverUrl={program.coverUrl}
                className={`${BTN_PRIMARY} h-11 min-[420px]:flex-1 sm:h-10`}
              />
            ) : null}
            {upgrade ? (
              <Link href={aboutHref} className={`${BTN_PRIMARY} h-11 min-[420px]:flex-1 sm:h-10`}>
                {tt("See membership options")}
              </Link>
            ) : null}
            {level ? (
              <Link href={levelsHref as string} className={`${BTN_PRIMARY} h-11 min-[420px]:flex-1 sm:h-10`} data-open-action="level">
                {tt("See your points")}
              </Link>
            ) : null}
            <Link href={learnHref} className={`${BTN_SECONDARY} h-11 min-[420px]:flex-1 sm:h-10`}>
              {tt("Back to Learn")}
            </Link>
          </div>
        </div>
        {outline && outline.modules.length ? <Outline outline={outline} /> : null}
      </article>
    </div>
  )
}

/** The modules and their lesson titles: what a member would get. Titles only, nothing to open. */
function Outline({ outline }: { outline: ProgramOutline }) {
  return (
    <section aria-label={tt("What is inside")} className="border-t border-[#eef0f2] px-4 pb-4 pt-4 sm:px-6 sm:pb-5" data-program-outline>
      <h2 className="text-[13px] font-semibold uppercase tracking-[0.04em] text-[#6b7280]">{tt("Inside")}</h2>
      <ol className="mt-2 divide-y divide-[#f0f1f3]">
        {outline.modules.map((m, i) => (
          <li key={m.id} className="py-2.5">
            <p className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2.5 text-[14.5px] font-semibold text-[#1a1a2e]">
                {m.coverUrl ? (
                  <span className="relative aspect-[16/9] w-12 shrink-0 overflow-hidden rounded-md bg-[#f1f2f4]" data-module-cover="">
                    <Image src={m.coverUrl} alt="" fill sizes="48px" className="object-cover" />
                  </span>
                ) : null}
                <span className="min-w-0 truncate">
                  <span className="mr-2 tabular-nums text-[#9ca3af]">{i + 1}</span>
                  {m.title}
                </span>
              </span>
              <span className="shrink-0 text-[12.5px] tabular-nums text-[#6b7280]">{lessonsLabel(m.lessons.length)}</span>
            </p>
            {m.lessons.length ? (
              <ul className="mt-1 space-y-0.5 pl-[22px]">
                {m.lessons.slice(0, 4).map((t, j) => (
                  <li key={j} className="truncate text-[13.5px] leading-6 text-[#4b5563]">
                    {t}
                  </li>
                ))}
                {m.lessons.length > 4 ? <li className="text-[13px] leading-6 text-[#9ca3af]">{tt("and {value} more", { value: m.lessons.length - 4 })}</li> : null}
              </ul>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  )
}

/** An open program with no lessons yet: the people who run Learn get the way to add them. */
export function EmptyProgram({ program, learnHref, manageHref }: { program: ProgramCard; learnHref: string; manageHref: string | null }) {
  return (
    <div data-empty-program className="mx-auto w-full max-w-[600px]">
      <Back href={learnHref} />
      <article className="overflow-hidden rounded-2xl border border-[#e4e7ec]/80 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_3px_8px_-2px_rgba(16,24,40,0.05)]">
        <Cover url={program.coverUrl} dim={false} />
        <div className="px-4 pb-5 pt-4 sm:px-6 sm:pb-6">
          <h1 className="text-[21px] font-bold leading-snug tracking-[-0.01em] text-[#1a1a2e] sm:text-[24px]">{program.title}</h1>
          <ProgramDescription program={program} />
          <p className="mt-3 text-[14px] leading-6 text-[#6b7280]">{manageHref ? tt("Add the first module and its lessons, and they show up here.") : tt("The lessons show up here as soon as they are added.")}</p>
          {manageHref ? (
            <Link href={manageHref} className={`${BTN_PRIMARY} mt-5 h-11 sm:h-10`}>
              {tt("Add lessons")}
            </Link>
          ) : null}
        </div>
      </article>
    </div>
  )
}
