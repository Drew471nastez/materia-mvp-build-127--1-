"use client"

/**
 * ===========================================================================
 *  LEARN, AS ITS CREATOR BUILDS IT
 * ===========================================================================
 * The community editor's Learn section mounts this (worker A's /app/
 * community editor: `<LearnBuilder communityId={id} />`, optionally with the
 * data already read by lib/communities/server/learn.ts learnBuilderFor).
 *
 * One card holds the programs, in the order members see them: each row its
 * cover, its name, and in a line what a member needs to know (draft or
 * published, how many lessons, free, from a level, or its price and how
 * many bought it). A row opens the program's editor (./program-editor.tsx),
 * which is laid out like /app/products/new: cards under their own headings
 * and the Save bar at the foot.
 *
 * New program asks for a name first and makes it as a draft, so its lessons
 * have somewhere to go from the first module. A course the creator already
 * sells can be added too: its lessons stay the course's own.
 *
 * Nothing here is a Storelib product: a program made here is not one.
 */
import * as React from "react"
import Image from "next/image"
import { ArrowDown, ArrowUp, ChevronRight, MoreHorizontal, Plus, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { ResponsiveActionMenu, type ActionMenuItem } from "@/components/ui/responsive-action-menu"
import { SheetDialog, SheetDialogTitle } from "@/components/ui/sheet-dialog"
import { accentDepth, primaryDepth, secondaryDepth } from "@/components/ui/depth-button"
import { useConfirm } from "@/app/app/products/new/confirm-sheet"
import { PlaceIcon } from "@/components/community/member/place-icons"
import { programPrice } from "@/lib/communities/learn"
import { lessonsLabel, type BuilderProgram, type LearnBuilderData } from "./model"
import { ProgramEditor } from "./program-editor"
import { learnRequest, usePhone } from "./builder-parts"
import { tt } from "@/lib/i18n/text"

const CARD = "rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
const BTN = "h-10 rounded-[10px] px-3.5 text-[14px] sm:h-9 sm:rounded-lg sm:px-3 sm:text-[13.5px]"
const FIELD =
  "h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-[16px] text-[#1a1a2e] outline-none transition-shadow placeholder:text-[#9ca3af] focus:border-[#8b5cf6] focus:ring-2 focus:ring-[#8b5cf6]/15 sm:h-10 sm:text-sm"

/** What a member needs to know about a program, in one line. */
export function accessLine(p: Pick<BuilderProgram, "mode" | "level" | "priceCents" | "currency" | "buyers">, levelName?: string): string {
  if (p.mode === "paid" && p.priceCents) return `${programPrice(p.priceCents, p.currency)}${p.buyers ? tt(" · {buyers} bought", { buyers: p.buyers }) : ""}`
  if (p.mode === "level") return tt("From level {level}{value}", { level: p.level, value: levelName ? ` (${levelName})` : "" })
  return tt("Free for members")
}

export function LearnBuilder({ communityId, initial = null, initialOpenId = null }: { communityId: string; initial?: LearnBuilderData | null; /** A program to open straight away (the probe). */ initialOpenId?: string | null }) {
  const [data, setData] = React.useState<LearnBuilderData | null>(initial)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [openId, setOpenId] = React.useState<string | null>(initialOpenId)
  const [naming, setNaming] = React.useState(false)
  const [attaching, setAttaching] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [note, setNote] = React.useState<string | null>(null)
  const [ask, confirmSheet] = useConfirm()
  const base = `/api/app/community/${communityId}/learn`

  const reload = React.useCallback(async () => {
    const res = await learnRequest<LearnBuilderData>(base, "GET")
    if (res.ok) {
      setData(res.data)
      setLoadError(null)
    } else setLoadError(res.data.error || tt("Learn did not load. Try again."))
    return res.ok ? res.data : null
  }, [base])

  React.useEffect(() => {
    if (!initial) void reload()
  }, [initial, reload])

  React.useEffect(() => {
    if (!note) return
    const t = window.setTimeout(() => setNote(null), 3200)
    return () => window.clearTimeout(t)
  }, [note])

  if (!data) {
    return (
      <div className={cn(CARD, "px-5 py-10 text-center")} data-learn-builder="loading">
        <p className="text-[14px] text-[#6b7280]">{loadError ?? tt("Loading Learn")}</p>
        {loadError ? (
          <button type="button" className={cn(secondaryDepth, BTN, "mt-3")} onClick={() => void reload()}>
            {tt("Try again")}
          </button>
        ) : null}
      </div>
    )
  }

  const open = openId ? data.programs.find((p) => p.id === openId) : null
  if (open) {
    return (
      <>
        <ProgramEditor
          key={open.id}
          communityId={communityId}
          program={open}
          data={data}
          onBack={() => setOpenId(null)}
          onSaved={() => void reload()}
          onDeleted={async () => {
            setOpenId(null)
            await reload()
            setNote(tt("Program deleted"))
          }}
        />
        {confirmSheet}
      </>
    )
  }

  const levelName = (n: number) => data.levels.find((l) => l.level === n)?.name
  const move = async (id: string, by: -1 | 1) => {
    const ids = data.programs.map((p) => p.id)
    const at = ids.indexOf(id)
    const to = at + by
    if (at < 0 || to < 0 || to >= ids.length) return
    ;[ids[at], ids[to]] = [ids[to], ids[at]]
    setData({ ...data, programs: ids.map((x) => data.programs.find((p) => p.id === x) as BuilderProgram) })
    const res = await learnRequest(base, "PUT", { ids })
    if (!res.ok) {
      setNote(res.data.error || tt("The order did not save."))
      void reload()
    }
  }
  const remove = async (p: BuilderProgram) => {
    const course = p.kind === "course"
    const yes = await ask({
      title: course ? tt("Take {title} out of Learn?", { title: p.title }) : tt("Delete {title}?", { title: p.title }),
      body: course ? tt("Members stop seeing it here. The course and its buyers are not touched.") : tt("Its modules, lessons and their files are deleted. This cannot be undone."),
      confirm: course ? tt("Take out") : tt("Delete"),
      cancel: tt("Keep it"),
      tone: "critical",
    })
    if (!yes) return
    const res = await learnRequest(`${base}/${p.id}`, "DELETE")
    if (!res.ok) setNote(res.data.error || tt("That did not go. Try again."))
    else setNote(course ? tt("Taken out of Learn") : tt("Program deleted"))
    void reload()
  }

  return (
    <div className="space-y-4" data-learn-builder="list">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[18px] font-semibold leading-6 text-[#1a1a2e]">{tt("Programs")}</h2>
          <p className="mt-0.5 text-[13.5px] text-[#6b7280]">{tt("Modules and lessons for your members, free, from a level, or sold on their own.")}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {data.courses.length ? (
            <button type="button" className={cn(secondaryDepth, BTN)} onClick={() => setAttaching(true)}>
              {tt("Add a course")}
            </button>
          ) : null}
          <button type="button" className={cn(accentDepth, BTN, "gap-1.5")} onClick={() => setNaming(true)} disabled={!data.ready} data-new-program>
            <Plus className="h-4 w-4" strokeWidth={2.25} aria-hidden />
            {tt("New program")}
          </button>
        </div>
      </div>

      {!data.ready ? <Banner>{tt("Programs need the latest database update (part 102). Courses you add keep working meanwhile.")}</Banner> : null}
      {!data.enabled ? <Banner>{tt("Learn is switched off, so members do not see it. Switch it on in Settings.")}</Banner> : null}

      {data.programs.length === 0 ? (
        <div className={cn(CARD, "flex flex-col items-center px-6 py-12 text-center")} data-learn-builder-empty>
          <span className="flex h-12 w-12 items-center justify-center rounded-[14px] border border-[#e8eaee] bg-[#f6f7f9] text-[#4b5563]">
            <PlaceIcon place="classroom" size={24} />
          </span>
          <p className="mt-4 text-[16px] font-semibold text-[#1a1a2e]">{tt("Make the first program")}</p>
          <p className="mt-1 max-w-[360px] text-[14px] leading-relaxed text-[#6b7280]">{tt("A program is modules of lessons: videos, notes and files. Members find it under Learn.")}</p>
          <button type="button" className={cn(primaryDepth, BTN, "mt-5")} onClick={() => setNaming(true)} disabled={!data.ready}>
            {tt("New program")}
          </button>
        </div>
      ) : (
        <ul className={cn(CARD, "divide-y divide-[#f0f1f3] overflow-hidden")} data-program-list>
          {data.programs.map((p, i) => {
            const items: ActionMenuItem[] = [
              { label: tt("Edit"), onClick: () => setOpenId(p.id) },
              { label: tt("View as a member"), href: `/community/${data.slug}/learn/${p.id}`, target: "_blank" },
              ...(i > 0 ? [{ label: tt("Move up"), icon: <ArrowUp className="h-4 w-4" />, onClick: () => void move(p.id, -1), separatorBefore: true }] : []),
              ...(i < data.programs.length - 1 ? [{ label: tt("Move down"), icon: <ArrowDown className="h-4 w-4" />, onClick: () => void move(p.id, 1), separatorBefore: i === 0 }] : []),
              { label: p.kind === "course" ? tt("Take out of Learn") : tt("Delete"), icon: <Trash2 className="h-4 w-4" />, variant: "destructive", onClick: () => void remove(p), separatorBefore: true },
            ]
            return (
              <li key={p.id} className="flex items-center gap-1 pr-2 sm:pr-3" data-program-row={p.id}>
                <button type="button" onClick={() => setOpenId(p.id)} className="flex min-h-[72px] min-w-0 flex-1 items-center gap-3 px-3 py-3 text-left outline-none transition-colors hover:bg-[#fafafb] focus-visible:bg-[#f6f7f9] sm:px-4">
                  <span className="relative aspect-[16/9] w-[76px] shrink-0 overflow-hidden rounded-lg border border-black/[0.04] bg-[#f1f2f4] sm:w-[88px]">
                    {p.coverUrl ? (
                      <Image src={p.coverUrl} alt="" fill sizes="88px" className="object-cover" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-[#b0b4bb]">
                        <PlaceIcon place="classroom" size={18} />
                      </span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-[15px] font-semibold leading-5 text-[#1a1a2e] sm:line-clamp-1">{p.title}</span>
                    <span className="mt-1 line-clamp-2 text-[13px] leading-[18px] tabular-nums text-[#6b7280] sm:line-clamp-1">
                      <StatusDot status={p.status} />
                      <span data-program-line>
                        {lessonsLabel(p.lessons)} · {accessLine(p, levelName(p.level))}
                        {p.kind === "course" ? tt(" · a course you sell") : ""}
                      </span>
                    </span>
                  </span>
                  <ChevronRight className="hidden h-4 w-4 shrink-0 text-[#9ca3af] sm:block" aria-hidden />
                </button>
                <ResponsiveActionMenu
                  title={p.title}
                  items={items}
                  trigger={
                    <button type="button" aria-label={tt("More for {title}", { title: p.title })} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] text-[#4b5563] outline-none hover:bg-[#f1f2f4] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 sm:h-9 sm:w-9">
                      <MoreHorizontal className="h-[18px] w-[18px]" />
                    </button>
                  }
                />
              </li>
            )
          })}
        </ul>
      )}

      <p className="min-h-[20px] text-[13px] text-[#4b5563]" role="status" aria-live="polite">
        {note}
      </p>

      <NameSheet
        open={naming}
        busy={busy}
        onClose={() => setNaming(false)}
        onCreate={async (title) => {
          setBusy(true)
          const res = await learnRequest<{ id: string }>(base, "POST", { title })
          setBusy(false)
          if (!res.ok) return res.data.error || tt("The program could not be made. Try again.")
          setNaming(false)
          const next = await reload()
          if (next?.programs.some((p) => p.id === res.data.id)) setOpenId(res.data.id)
          return null
        }}
      />
      <AttachSheet
        open={attaching}
        courses={data.courses}
        onClose={() => setAttaching(false)}
        onPick={async (productId) => {
          const res = await learnRequest<{ id: string }>(base, "POST", { productId })
          if (!res.ok) return res.data.error || tt("The course could not be added. Try again.")
          setAttaching(false)
          await reload()
          setNote(tt("Course added to Learn"))
          return null
        }}
      />
      {confirmSheet}
    </div>
  )
}

/* The state, quietly, at the start of the row's line: a dot and the word, not another pill. */
function StatusDot({ status }: { status: "draft" | "published" }) {
  return (
    <span className={cn("font-medium", status === "published" ? "text-[#1d6b45]" : "text-[#8a5a00]")} data-status={status}>
      <span aria-hidden className={cn("mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-[2px]", status === "published" ? "bg-[#22a06b]" : "bg-[#e0a100]")} />
      {status === "published" ? tt("Published") : tt("Draft")}
      <span aria-hidden className="font-normal text-[#6b7280]"> · </span>
    </span>
  )
}

function Banner({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-[#f1e3bd] bg-[#fdf8ea] px-3.5 py-2.5 text-[13.5px] leading-5 text-[#6b4e00]">{children}</p>
}

function NameSheet({ open, busy, onClose, onCreate }: { open: boolean; busy: boolean; onClose: () => void; onCreate: (title: string) => Promise<string | null> }) {
  const phone = usePhone()
  const [title, setTitle] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  React.useEffect(() => {
    if (open) {
      setTitle("")
      setError(null)
    }
  }, [open])
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return setError(tt("Give the program a name."))
    setError(await onCreate(title))
  }
  return (
    <SheetDialog open={open} onClose={onClose} phone={phone} label={tt("New program")} className="max-w-[440px] gap-0 rounded-2xl p-6" sheet={{ fill: false }}>
      <form onSubmit={submit} className="px-5 pb-5 sm:px-0 sm:pb-0" data-name-sheet>
        <SheetDialogTitle className="text-[18px] font-semibold leading-6 text-[#1a1a2e]">{tt("New program")}</SheetDialogTitle>
        <p className="mt-1 text-[14px] text-[#6b7280]">{tt("It starts as a draft. Add its lessons, then publish it.")}</p>
        <label htmlFor="program-name" className="mt-4 block text-[13px] font-medium text-[#4b5563]">
          {tt("Name")}
        </label>
        <input id="program-name" className={cn(FIELD, "mt-1.5")} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder={tt("Wheel throwing, from clay to cup")} autoFocus={!phone} aria-invalid={!!error} />
        {error ? (
          <p className="mt-2 text-[13px] text-[#b42318]" role="alert">
            {error}
          </p>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className={cn(secondaryDepth, BTN, "max-sm:flex-1")} onClick={onClose}>
            {tt("Cancel")}
          </button>
          <button type="submit" className={cn(primaryDepth, BTN, "max-sm:flex-1")} disabled={busy} aria-busy={busy || undefined}>
            {tt("Make program")}
          </button>
        </div>
      </form>
    </SheetDialog>
  )
}

function AttachSheet({ open, courses, onClose, onPick }: { open: boolean; courses: LearnBuilderData["courses"]; onClose: () => void; onPick: (productId: string) => Promise<string | null> }) {
  const phone = usePhone()
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState<string | null>(null)
  React.useEffect(() => {
    if (open) setError(null)
  }, [open])
  return (
    <SheetDialog open={open} onClose={onClose} phone={phone} label={tt("Add a course")} className="max-w-[480px] gap-0 rounded-2xl p-0">
      <div className="flex h-full min-h-0 flex-col">
        <div className="shrink-0 px-5 pb-3 pt-1 sm:px-6 sm:pt-6">
          <SheetDialogTitle className="text-[18px] font-semibold leading-6 text-[#1a1a2e]">{tt("Add a course")}</SheetDialogTitle>
          <p className="mt-1 text-[14px] text-[#6b7280]">{tt("A course you sell, inside Learn. Its lessons stay the course's own.")}</p>
          {error ? (
            <p className="mt-2 text-[13px] text-[#b42318]" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 sm:px-3 sm:pb-4">
          {courses.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                disabled={!!busy}
                onClick={async () => {
                  setBusy(c.id)
                  setError(await onPick(c.id))
                  setBusy(null)
                }}
                className="flex min-h-[56px] w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-[#f6f7f8] disabled:opacity-60"
              >
                <span className="relative aspect-[16/9] w-16 shrink-0 overflow-hidden rounded-md bg-[#f1f2f4]">{c.coverUrl ? <Image src={c.coverUrl} alt="" fill sizes="64px" className="object-cover" /> : null}</span>
                <span className="min-w-0 flex-1 truncate text-[14.5px] font-medium text-[#1a1a2e]">{c.title}</span>
                {busy === c.id ? <span className="text-[13px] text-[#6b7280]">{tt("Adding")}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </SheetDialog>
  )
}
