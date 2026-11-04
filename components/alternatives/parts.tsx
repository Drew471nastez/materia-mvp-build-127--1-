/**
 * The pieces a comparison page is built from, rendered on the server. The
 * only script on these pages is the calculator, the sign up buttons' tag
 * carrying, and the analytics events.
 */
import Image from "next/image"
import type { ReactNode } from "react"
import type { CellValue, Claim, Competitor, CompetitorCell, FeatureRow, Source, StorelibCell, StorelibPoint, VisualId } from "@/lib/alternatives/types"
import type { Flags } from "@/lib/alternatives/seo"
import { HERO_SLIDES } from "@/lib/marketing/hero-media"

/** Source id to its number on the page, in the order the page lists them. */
export type SourceNumbers = Map<string, number>

export function numberSources(sources: Source[]): SourceNumbers {
  return new Map(sources.map((s, i) => [s.id, i + 1]))
}

export const H2 = "scroll-mt-28 text-[22px] font-bold leading-[1.25] tracking-[-0.01em] text-[#1a1a2e] sm:text-[26px]"
export const BODY = "text-[15px] leading-[1.65] text-[#374151]"
export const MUTED = "text-[13px] leading-[1.5] text-[#6b7280]"

export function Section({ id, title, children, lead }: { id: string; title: string; children: ReactNode; lead?: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="border-t border-[#eef0f2] py-10 sm:py-14">
      <h2 id={`${id}-h`} className={H2}>
        {title}
      </h2>
      {lead ? <div className={`mt-3 max-w-[720px] ${BODY}`}>{lead}</div> : null}
      <div className="mt-6">{children}</div>
    </section>
  )
}

/** The superscript numbers after a claim, each a link to its source in the list at the foot of the page. */
export function SourceMarks({ ids, numbers }: { ids: string[]; numbers: SourceNumbers }) {
  const ns = ids.map((id) => ({ id, n: numbers.get(id) })).filter((x): x is { id: string; n: number } => typeof x.n === "number")
  if (ns.length === 0) return null
  return (
    <sup className="ml-0.5 whitespace-nowrap text-[11px] font-medium">
      {ns.map(({ id, n }, i) => (
        <span key={id}>
          {i > 0 ? <span aria-hidden>,</span> : null}
          <a href={`#source-${id}`} className="text-[#4b5563] underline decoration-[#c7cbd1] underline-offset-2 hover:text-[#1a1a2e]" aria-label={`Source ${n}`}>
            {n}
          </a>
        </span>
      ))}
    </sup>
  )
}

const STATUS_WORDS: Record<Claim["status"], string | null> = {
  verified: null,
  conflicting: "Sources disagree",
  unverified: "Not verified",
}

/** A claim's status and note, printed where the claim is, when it is anything but verified. */
export function StatusNote({ status, note }: { status: Claim["status"]; note?: string }) {
  const words = STATUS_WORDS[status]
  if (!words && !note) return null
  return (
    <span className="mt-0.5 block text-[12.5px] leading-[1.45] text-[#8a5a00]">
      {words ? <span className="font-semibold">{words}. </span> : null}
      {note}
    </span>
  )
}

export function ClaimItem({ claim, numbers, className = "" }: { claim: Claim; numbers: SourceNumbers; className?: string }) {
  return (
    <li className={`${BODY} ${className}`}>
      {claim.text}
      <SourceMarks ids={claim.sources} numbers={numbers} />
      <StatusNote status={claim.status} note={claim.note} />
    </li>
  )
}

/** A Storelib point as the page reads it: its "off" wording while its switch is off. */
export function pointText(p: StorelibPoint, flags: Flags): string {
  return p.flag && !flags[p.flag] ? p.textOff ?? p.text : p.text
}

export function PointList({ points, flags }: { points: StorelibPoint[]; flags: Flags }) {
  return (
    <ul className="space-y-2.5">
      {points.map((p) => (
        <li key={p.text} className={`${BODY} relative pl-4 before:absolute before:left-0 before:top-[0.7em] before:h-[5px] before:w-[5px] before:rounded-full before:bg-[#1a1a2e]`}>
          {pointText(p, flags)}
        </li>
      ))}
    </ul>
  )
}

export function ClaimList({ claims, numbers }: { claims: Claim[]; numbers: SourceNumbers }) {
  return (
    <ul className="space-y-2.5">
      {claims.map((c) => (
        <ClaimItem key={c.text} claim={c} numbers={numbers} className="relative pl-4 before:absolute before:left-0 before:top-[0.7em] before:h-[5px] before:w-[5px] before:rounded-full before:bg-[#9ca3af]" />
      ))}
    </ul>
  )
}

const VALUE_WORDS: Record<CellValue, string> = { yes: "Yes", no: "No", partial: "Partly", unknown: "Not confirmed" }

function CellBody({ value, text, wordless }: { value: CellValue; text?: string; wordless: boolean }) {
  const strong = value === "yes" ? "text-[#1a1a2e]" : value === "no" ? "text-[#6b7280]" : "text-[#374151]"
  /* A row that is all detail ("$29 a month") reads better without a bare Yes before it. */
  const showWord = !(wordless && value === "yes" && text)
  return (
    <>
      {showWord ? <span className={`font-semibold ${strong}`}>{VALUE_WORDS[value]}</span> : null}
      {text ? <span className={`${showWord ? "block" : ""} text-[13px] leading-[1.45] text-[#4b5563]`}>{text}</span> : null}
    </>
  )
}

export function storelibCellFor(cell: StorelibCell, flags: Flags): { value: CellValue; text?: string; wordless: boolean } {
  if (cell.flag && !flags[cell.flag]) return { value: "no", text: "Not offered today", wordless: false }
  return { value: cell.value, text: cell.text, wordless: !!cell.wordless }
}

export function FeatureTable({ name, rows, numbers, flags }: { name: string; rows: FeatureRow[]; numbers: SourceNumbers; flags: Flags }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <table className="w-full table-fixed border-collapse text-left">
        <caption className="sr-only">Features of Storelib and {name}</caption>
        <colgroup>
          <col className="w-[34%] sm:w-[30%]" />
          <col />
          <col />
        </colgroup>
        <thead>
          <tr className="border-b border-[#eef0f2] bg-[#f8f9fa] text-[13px]">
            <th scope="col" className="px-3 py-3 font-medium text-[#6b7280] sm:px-5">Feature</th>
            <th scope="col" className="px-3 py-3 font-semibold text-[#1a1a2e] sm:px-5">Storelib</th>
            <th scope="col" className="px-3 py-3 font-semibold text-[#1a1a2e] sm:px-5">{name}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const sl = storelibCellFor(r.storelib, flags)
            return (
              <tr key={r.id} className="border-b border-[#f1f2f4] align-top last:border-0">
                <th scope="row" className="px-3 py-3 text-[14px] font-medium leading-[1.4] text-[#1a1a2e] sm:px-5">{r.label}</th>
                <td className="break-words px-3 py-3 text-[14px] sm:px-5">
                  <CellBody value={sl.value} text={sl.text} wordless={sl.wordless} />
                </td>
                <td className="break-words px-3 py-3 text-[14px] sm:px-5">
                  <CompetitorCellBody cell={r.competitor} numbers={numbers} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function CompetitorCellBody({ cell, numbers }: { cell: CompetitorCell; numbers: SourceNumbers }) {
  return (
    <>
      <CellBody value={cell.value} text={cell.text} wordless />
      <SourceMarks ids={cell.sources} numbers={numbers} />
      {/* "Not confirmed" already says it: the note alone, quietly, rather than "Not verified" a second time. */}
      {cell.value === "unknown" ? (cell.note ? <span className="mt-0.5 block text-[12.5px] leading-[1.45] text-[#6b7280]">{cell.note}</span> : null) : cell.status !== "verified" ? <StatusNote status={cell.status} note={cell.note} /> : null}
    </>
  )
}

/* ── Real Storelib screens ─────────────────────────────────────────────── */

const VISUAL_SRC: Record<VisualId, string> = {
  dashboard: "/marketing/hero/slide-dashboard.webp",
  onepage: "/marketing/hero/slide-onepage.webp",
  creator: "/marketing/hero/slide-creator.webp",
  course: "/marketing/hero/slide-course.webp",
  community: "/marketing/hero/slide-community.webp",
  editor: "/marketing/hero/slide-editor.webp",
  presets: "/marketing/hero/slide-presets.webp",
}

const VISUAL_FLAG: Partial<Record<VisualId, keyof Flags>> = { community: "communities" }

/** The screens a page shows, from the front page's own screenshots (lib/marketing/hero-media), alt text and all. */
export function visualsFor(ids: VisualId[], flags: Flags): { id: VisualId; src: string; alt: string }[] {
  return ids
    .filter((id) => {
      const flag = VISUAL_FLAG[id]
      return !flag || flags[flag]
    })
    .map((id) => {
      const src = VISUAL_SRC[id]
      const alt = HERO_SLIDES.find((s) => s.src === src)?.alt ?? ""
      return { id, src, alt }
    })
}

export function Screens({ shots }: { shots: { id: VisualId; src: string; alt: string }[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {shots.map((s, i) => (
        <figure key={s.id} className={i === 0 ? "md:col-span-2" : ""}>
          <div className="overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-[#16161a] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <Image
              src={s.src}
              alt={s.alt}
              width={1200}
              height={750}
              sizes={i === 0 ? "(min-width: 1200px) 1136px, 100vw" : "(min-width: 768px) 560px, 100vw"}
              className="h-auto w-full"
            />
          </div>
          <figcaption className={`mt-2 ${MUTED}`}>{s.alt}.</figcaption>
        </figure>
      ))}
    </div>
  )
}

/** Every claim on a page that is not verified, for the summary above the sources. */
export function unsettledClaims(c: Competitor): number {
  const claims: { status: Claim["status"] }[] = [...c.strengths, ...c.limits, ...c.whenToStay, ...c.pricingNotes, ...c.plans.map((p) => p.claim), ...c.features.map((f) => f.competitor)]
  return claims.filter((x) => x.status !== "verified").length
}
