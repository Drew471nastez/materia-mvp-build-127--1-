"use client"

/**
 * ===========================================================================
 *  ONE PROGRAM'S EDITOR
 * ===========================================================================
 * Laid out like /app/products/new (round 13: "the builder inherits the
 * product editor's UI, but specific to communities"): cards under their own
 * headings, then the Save bar at the foot with the state in words on the
 * left and Cancel or Back and Save on the right, the product editor's own
 * buttons (editor-buttons.tsx).
 *
 *   Details     name, description, cover (a program made here; an attached
 *               course's name and cover are the product's)
 *   Lessons     the product editor's own course card (course-editor.tsx),
 *               handed the program's id: modules, lessons, videos,
 *               captions, files, free previews, saved as they are made
 *               (lib/courses/manage.ts knows a program's id). An attached
 *               course's lessons are edited in its product.
 *   Access      Free for members, from a level, or sold on its own, with
 *               the price
 *   Release     drip days after joining, and Published
 *
 * Everything but the lessons waits for Save, and Save sends only the
 * fields that changed.
 */
import * as React from "react"
import Image from "next/image"
import Link from "next/link"
import { ArrowLeft, ImagePlus, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { DirectUploader } from "@/lib/storage/chunked-upload"
import { CourseEditor } from "@/app/app/products/new/course-editor"
import { LeaveButton, SaveButton, SAVED_CHECK_MS, type SavePhase } from "@/app/app/products/new/editor-buttons"
import { SWITCH_GROUP, Segmented, SwitchRow } from "@/app/app/products/new/editor-controls"
import { useConfirm } from "@/app/app/products/new/confirm-sheet"
import { criticalDepth } from "@/components/ui/depth-button"
import { MAX_LEVEL, PROGRAM_SUMMARY_MAX, PROGRAM_TITLE_MAX, centsFromTyped, programPrice, typedFromCents, type ProgramMode, type ProgramStatus } from "@/lib/communities/learn"
import type { BuilderProgram, LearnBuilderData } from "./model"
import { StatusPill, learnRequest } from "./builder-parts"

const CARD = "space-y-4 rounded-2xl border border-[#e5e7eb]/60 bg-white app-card-x py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:space-y-5 sm:py-6"
const CARD_TITLE = "text-[16px] font-semibold leading-6 text-[#1a1a2e] sm:text-[17px]"
const LABEL = "mb-1.5 block text-[13px] font-medium text-[#4b5563]"
const FIELD =
  "w-full rounded-xl border border-gray-200 bg-white px-3 text-[16px] text-[#1a1a2e] outline-none transition-shadow placeholder:text-[#9ca3af] focus:border-[#8b5cf6] focus:ring-2 focus:ring-[#8b5cf6]/15 sm:text-sm"
const HINT = "mt-1.5 text-[13px] leading-[18px] text-[#6b7280]"

interface Form {
  title: string
  summary: string
  coverUrl: string | null
  status: ProgramStatus
  mode: ProgramMode
  level: number
  price: string
  drip: string
}

function formOf(p: BuilderProgram): Form {
  return {
    title: p.title,
    summary: p.summary,
    coverUrl: p.coverUrl,
    status: p.status,
    mode: p.mode,
    level: Math.max(2, Math.min(MAX_LEVEL, p.level || 2)),
    price: typedFromCents(p.priceCents),
    drip: p.dripDays ? String(p.dripDays) : "",
  }
}

/** What changed since the last save, as the PATCH body: only those fields. */
export function changesOf(saved: Form, now: Form, kind: BuilderProgram["kind"]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (kind === "program" && now.title.trim() !== saved.title.trim()) out.title = now.title
  if (now.summary.trim() !== saved.summary.trim()) out.summary = now.summary
  if (kind === "program" && now.coverUrl !== saved.coverUrl) out.coverUrl = now.coverUrl
  if (now.status !== saved.status) out.status = now.status
  const accessMoved = now.mode !== saved.mode || (now.mode === "level" && now.level !== saved.level) || (now.mode === "paid" && centsFromTyped(now.price) !== centsFromTyped(saved.price))
  if (accessMoved) {
    out.mode = now.mode
    if (now.mode === "level") out.level = now.level
    if (now.mode === "paid") out.priceCents = centsFromTyped(now.price)
  }
  if ((now.drip.trim() || "0") !== (saved.drip.trim() || "0")) out.dripDays = now.drip.trim() ? Number(now.drip) : null
  return out
}

export function ProgramEditor({
  communityId,
  program,
  data,
  onBack,
  onSaved,
  onDeleted,
}: {
  communityId: string
  program: BuilderProgram
  data: LearnBuilderData
  onBack: () => void
  onSaved: () => void
  onDeleted: () => void
}) {
  const [saved, setSaved] = React.useState<Form>(() => formOf(program))
  const [form, setForm] = React.useState<Form>(saved)
  const [phase, setPhase] = React.useState<SavePhase>("idle")
  const [savedThisVisit, setSavedThisVisit] = React.useState(false)
  const [error, setError] = React.useState<{ field?: string; message: string } | null>(null)
  const [note, setNote] = React.useState<string | null>(null)
  const [uploading, setUploading] = React.useState<number | null>(null)
  const [lessons, setLessons] = React.useState(program.lessons)
  const [ask, confirmSheet] = useConfirm()
  const native = program.kind === "program"
  const changes = changesOf(saved, form, program.kind)
  const dirty = Object.keys(changes).length > 0
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }))
  const url = `/api/app/community/${communityId}/learn/${program.id}`

  const save = React.useCallback(async () => {
    if (!dirty || phase !== "idle") return
    if (native && !form.title.trim()) return setError({ field: "title", message: "Give the program a name." })
    if (form.mode === "paid" && (centsFromTyped(form.price) ?? 0) < 50) return setError({ field: "price", message: "Set a price of at least 0.50." })
    if (form.status === "published" && native && lessons === 0) return setError({ field: "status", message: "Add a lesson before publishing." })
    setError(null)
    setPhase("saving")
    const res = await learnRequest(url, "PATCH", changes)
    if (!res.ok) {
      setPhase("idle")
      setError({ field: res.data.field, message: res.data.error || "That did not save. Try again." })
      return
    }
    setSaved(form)
    setSavedThisVisit(true)
    setPhase("saved")
    onSaved()
    window.setTimeout(() => setPhase("idle"), SAVED_CHECK_MS)
  }, [changes, dirty, form, lessons, native, onSaved, phase, url])

  /* Cmd or Ctrl and S, as in the product editor. */
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault()
        void save()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [save])

  const leave = async () => {
    if (dirty && !(await ask({ title: "Discard changes?", body: "Your edits since the last save will be lost. Lessons are saved as you make them.", confirm: "Discard", cancel: "Keep editing" }))) return
    onBack()
  }

  const remove = async () => {
    const course = program.kind === "course"
    const yes = await ask({
      title: course ? `Take ${program.title} out of Learn?` : `Delete ${program.title}?`,
      body: course ? "Members stop seeing it here. The course and its buyers are not touched." : "Its modules, lessons and their files are deleted. This cannot be undone.",
      confirm: course ? "Take out" : "Delete",
      cancel: "Keep it",
      tone: "critical",
    })
    if (!yes) return
    const res = await learnRequest(url, "DELETE")
    if (!res.ok) return setError({ message: res.data.error || "That did not go. Try again." })
    onDeleted()
  }

  const uploadCover = async (file: File) => {
    if (!/^image\//.test(file.type)) return setError({ field: "cover", message: "Pick a picture: JPG, PNG or WebP." })
    setError(null)
    setUploading(0)
    const uploader = new DirectUploader({ file, folder: "product-images", onProgress: (p) => setUploading(Math.round(p)) })
    try {
      const result = await uploader.start()
      if (result.publicUrl) set("coverUrl", result.publicUrl)
      else setError({ field: "cover", message: "The picture did not upload. Try again." })
    } catch (e) {
      setError({ field: "cover", message: (e as { message?: string })?.message || "The picture did not upload. Try again." })
    } finally {
      uploader.destroy()
      setUploading(null)
    }
  }

  const stateWord = dirty ? "Unsaved changes" : saved.status === "published" ? "Published" : "Draft"
  const errorFor = (field: string) => (error?.field === field ? error.message : null)
  const levelName = (n: number) => data.levels.find((l) => l.level === n)?.name
  const price = centsFromTyped(form.price)

  return (
    <div className="flex min-h-full flex-col" data-program-editor={program.id}>
      <div className="mx-auto w-full max-w-[880px] flex-1 space-y-4 pb-6 sm:space-y-5">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => void leave()} aria-label="Back to programs" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-[#e5e7eb] bg-white text-[#1a1a2e] hover:bg-[#f8f9fa] sm:h-9 sm:w-9">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] text-[#6b7280]">{native ? "Program" : "A course you sell"}</p>
            <h2 className="flex min-w-0 items-center gap-2 text-[19px] font-bold leading-6 text-[#1a1a2e] sm:text-[22px]">
              <span className="truncate">{form.title.trim() || "Untitled program"}</span>
              <StatusPill status={saved.status} />
            </h2>
          </div>
        </div>

        {error && !error.field ? (
          <p className="rounded-xl border border-[#fbd5d0] bg-[#fef3f2] px-3.5 py-2.5 text-[13.5px] text-[#b42318]" role="alert">
            {error.message}
          </p>
        ) : null}

        <section className={CARD} aria-labelledby="program-details">
          <h3 id="program-details" className={CARD_TITLE}>
            Details
          </h3>
          {native ? (
            <div>
              <label htmlFor="program-title" className={LABEL}>
                Name
              </label>
              <input id="program-title" className={cn(FIELD, "h-11 sm:h-10")} value={form.title} maxLength={PROGRAM_TITLE_MAX} onChange={(e) => set("title", e.target.value)} aria-invalid={!!errorFor("title")} />
              <FieldError text={errorFor("title")} />
            </div>
          ) : (
            <p className="text-[14px] leading-6 text-[#4b5563]">
              Its name and cover are the course&apos;s own.{" "}
              {program.editHref ? (
                <Link href={program.editHref} className="font-medium text-[#1a1a2e] underline decoration-[#d1d5db] underline-offset-2 hover:decoration-[#1a1a2e]">
                  Edit the course
                </Link>
              ) : null}
            </p>
          )}
          <div>
            <label htmlFor="program-summary" className={LABEL}>
              Description
            </label>
            <textarea id="program-summary" rows={4} className={cn(FIELD, "min-h-[104px] resize-y py-2.5 leading-6")} value={form.summary} maxLength={PROGRAM_SUMMARY_MAX} onChange={(e) => set("summary", e.target.value)} placeholder="What members will be able to do by the end." />
            <FieldError text={errorFor("summary")} />
          </div>
          {native ? (
            <div>
              <p className={LABEL}>Cover</p>
              <CoverPick url={form.coverUrl} uploading={uploading} onPick={(f) => void uploadCover(f)} onClear={() => set("coverUrl", null)} />
              <FieldError text={errorFor("cover")} />
            </div>
          ) : null}
        </section>

        <section className={CARD} aria-labelledby="program-lessons">
          <div className="flex items-baseline justify-between gap-3">
            <h3 id="program-lessons" className={CARD_TITLE}>
              Lessons
            </h3>
            <span className="text-[13px] tabular-nums text-[#6b7280]">{lessons === 1 ? "1 lesson" : `${lessons} lessons`}</span>
          </div>
          {native ? (
            <CourseEditor productId={program.id} ensureProductId={async () => program.id} onLessonCount={setLessons} notify={(m) => setNote(m)} />
          ) : (
            <p className="text-[14px] leading-6 text-[#4b5563]">
              This course&apos;s modules and lessons are edited in the course itself, and change here too.{" "}
              {program.editHref ? (
                <Link href={program.editHref} className="font-medium text-[#1a1a2e] underline decoration-[#d1d5db] underline-offset-2 hover:decoration-[#1a1a2e]">
                  Edit lessons
                </Link>
              ) : null}
            </p>
          )}
        </section>

        <section className={CARD} aria-labelledby="program-access">
          <div>
            <h3 id="program-access" className={CARD_TITLE}>
              Who can open it
            </h3>
            <p className={HINT}>Only members ever see Learn. This decides which of them can open the lessons.</p>
          </div>
          <Segmented<ProgramMode>
            label="Who can open it"
            value={form.mode}
            onChange={(v) => set("mode", v)}
            options={[
              { value: "free", label: "Free" },
              { value: "level", label: "A level" },
              { value: "paid", label: "Paid" },
            ]}
          />
          {form.mode === "free" ? <p className="text-[14px] leading-6 text-[#4b5563]">Every member can open it.</p> : null}
          {form.mode === "level" ? (
            <div>
              <label htmlFor="program-level" className={LABEL}>
                Opens at
              </label>
              <div className="relative">
                <select id="program-level" className={cn(FIELD, "h-11 appearance-none pr-9 sm:h-10")} value={form.level} onChange={(e) => set("level", Number(e.target.value))}>
                  {Array.from({ length: MAX_LEVEL - 1 }, (_, i) => i + 2).map((n) => (
                    <option key={n} value={n}>
                      Level {n}
                      {levelName(n) ? `, ${levelName(n)}` : ""}
                    </option>
                  ))}
                </select>
                <svg aria-hidden viewBox="0 0 20 20" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6b7280]">
                  <path d="M5.5 8l4.5 4.5L14.5 8" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <p className={HINT}>Members reach levels by taking part. Below it, they see the program with the level it opens at.</p>
              <FieldError text={errorFor("level")} />
            </div>
          ) : null}
          {form.mode === "paid" ? (
            <div>
              <label htmlFor="program-price" className={LABEL}>
                Price, one payment
              </label>
              <div className="relative max-w-[240px]">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[14px] font-medium uppercase text-[#6b7280]">{data.currency}</span>
                <input
                  id="program-price"
                  inputMode="decimal"
                  className={cn(FIELD, "h-11 pl-12 tabular-nums sm:h-10")}
                  value={form.price}
                  onChange={(e) => set("price", e.target.value.replace(/[^\d.,]/g, "").slice(0, 10))}
                  placeholder="49"
                  aria-invalid={!!errorFor("price")}
                />
              </div>
              <p className={HINT}>
                {price && price >= 50 ? `Members pay ${programPrice(price, data.currency)} once, in a checkout inside the community. ` : "Members pay once, in a checkout inside the community. "}
                It is not a Storelib product and is not listed anywhere else.
                {program.buyers ? ` ${program.buyers} bought it so far.` : ""}
              </p>
              {!data.canSell ? (
                <p className="mt-2 rounded-xl border border-[#f1e3bd] bg-[#fdf8ea] px-3.5 py-2.5 text-[13.5px] leading-5 text-[#6b4e00]">
                  Payouts are not set up yet, so nobody can buy it.{" "}
                  <Link href="/app/payouts" className="font-medium underline underline-offset-2">
                    Set up payouts
                  </Link>
                </p>
              ) : null}
              <FieldError text={errorFor("price")} />
            </div>
          ) : null}
        </section>

        <section className={CARD} aria-labelledby="program-release">
          <h3 id="program-release" className={CARD_TITLE}>
            Release
          </h3>
          <div className={SWITCH_GROUP}>
            <SwitchRow title="Published" hint={form.status === "published" ? "Members see it under Learn." : "Only you and your team see it."} checked={form.status === "published"} onChange={(v) => set("status", v ? "published" : "draft")} />
          </div>
          <FieldError text={errorFor("status")} />
          {form.mode !== "paid" ? (
            <div>
              <label htmlFor="program-drip" className={LABEL}>
                Opens after joining
              </label>
              <div className="flex items-center gap-2">
                <input id="program-drip" inputMode="numeric" className={cn(FIELD, "h-11 w-[96px] tabular-nums sm:h-10")} value={form.drip} onChange={(e) => set("drip", e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="0" />
                <span className="text-[14px] text-[#4b5563]">days</span>
              </div>
              <p className={HINT}>Leave it empty to open it from the day someone joins.</p>
              <FieldError text={errorFor("dripDays")} />
            </div>
          ) : null}
        </section>

        <div className="flex justify-start pt-1">
          <button type="button" onClick={() => void remove()} className={cn(criticalDepth, "h-10 rounded-[10px] px-3.5 text-[14px] sm:h-9 sm:rounded-lg sm:text-[13.5px]")}>
            {program.kind === "course" ? "Take out of Learn" : "Delete program"}
          </button>
        </div>
      </div>

      {/* THE FOOT BAR: sticky at the bottom of whatever scrolls, as in the product editor. */}
      <div data-editor-foot="" className="sticky bottom-0 z-30 -mx-4 mt-auto border-t border-[#e5e7eb] bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_-8px_rgba(17,24,39,0.10)] sm:mx-0 sm:rounded-t-xl">
        <div className="mx-auto flex h-16 max-w-[880px] items-center justify-between gap-3 px-4 sm:px-5">
          <p data-editor-state={stateWord} className="flex min-w-0 items-center gap-2 text-[14px] leading-5">
            <span aria-hidden className={cn("h-1.5 w-1.5 shrink-0 rounded-full", stateWord === "Published" ? "bg-[#22a06b]" : stateWord === "Draft" ? "bg-[#e0a100]" : "bg-[#8b5cf6]")} />
            <span className={cn("truncate", dirty ? "font-medium text-[#1a1a2e]" : "text-[#6b7280]")}>{note ?? stateWord}</span>
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <LeaveButton mode={dirty ? "cancel" : "back"} asks={dirty} label="Going back to programs" onLeave={() => void leave()} />
            <SaveButton phase={phase} disabled={!dirty} saved={savedThisVisit} onSave={() => void save()} />
          </div>
        </div>
      </div>
      {confirmSheet}
    </div>
  )
}

function FieldError({ text }: { text: string | null }) {
  if (!text) return null
  return (
    <p className="mt-1.5 text-[13px] text-[#b42318]" role="alert">
      {text}
    </p>
  )
}

function CoverPick({ url, uploading, onPick, onClear }: { url: string | null; uploading: number | null; onPick: (f: File) => void; onClear: () => void }) {
  const input = React.useRef<HTMLInputElement>(null)
  return (
    <div className="relative aspect-[16/9] w-full max-w-[360px] overflow-hidden rounded-xl border border-[#e5e7eb] bg-[#f6f7f9]" data-cover-pick>
      {url ? <Image src={url} alt="" fill sizes="360px" className="object-cover" /> : null}
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={uploading !== null}
        className={cn("absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-[13.5px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#8b5cf6]/40", url ? "bg-black/0 text-transparent hover:bg-black/30 hover:text-white" : "text-[#4b5563] hover:bg-[#f1f2f4]")}
        aria-label={url ? "Change the cover" : "Add a cover"}
      >
        <ImagePlus className="h-5 w-5" aria-hidden />
        {uploading !== null ? `Uploading ${uploading}%` : url ? "Change" : "Add a cover, 16:9"}
      </button>
      {url && uploading === null ? (
        <button type="button" onClick={onClear} aria-label="Remove the cover" className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-[#1a1a2e] shadow-[0_1px_3px_rgba(0,0,0,0.2)]">
          <X className="h-4 w-4" />
        </button>
      ) : null}
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ""
          if (f) onPick(f)
        }}
      />
    </div>
  )
}
