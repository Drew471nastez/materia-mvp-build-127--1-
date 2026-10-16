"use client"

/**
 * ===========================================================================
 *  ONE PROGRAM'S EDITOR
 * ===========================================================================
 * Laid out like /app/products/new (round 13: "the builder inherits the
 * product editor's UI, but specific to communities"), and since round 33 on
 * the product editor's two columns from 1024px: what the program is on the
 * left, who opens it on the right.
 *
 *   the head    one row: back, the name with its state, View as a member,
 *               and Publish or Unpublish, which saves at once
 *   Details     name, description (the product editor's own rich text
 *               field: pictures, emoji, formatting, cleaned on the server),
 *               cover (a program made here; an attached course's name and
 *               cover are the product's)
 *   Lessons     the product editor's own course card (course-editor.tsx),
 *               handed the program's id: modules and lessons, each with its
 *               cover, added at once and saved behind, videos, captions,
 *               files, free previews (lib/courses/manage.ts knows a
 *               program's id). An attached course's lessons are edited in
 *               its product.
 *   Access      five choices as cards, each with what it needs: Open, Reach
 *               a level (which one), Buy now (the price), Days after joining
 *               (how many), Private (the members picked)
 *
 * Everything but the lessons and Publish waits for Save, in the community
 * admin's save bar (creator/parts EditorFoot), and Save sends only the
 * fields that changed.
 *
 * ROUND 33, THE HEIGHT: no bar of its own in the page's flow any more (the
 * shared save bar floats and comes up only with something to save), no box
 * that scrolls inside the page, and a head of one 40px row, so the editor
 * is the height of the pane.
 */
import { AppAvatar } from "@/components/app/app-avatar"
import * as React from "react"
import Image from "next/image"
import Link from "next/link"
import { ArrowLeft, ImagePlus, Search, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { DirectUploader } from "@/lib/storage/chunked-upload"
import { CourseEditor } from "@/app/app/products/new/course-editor"
import { useConfirm } from "@/app/app/products/new/confirm-sheet"
import { RichTextEditor } from "@/components/app/rich-text-editor"
import { isBlankHtml, toEditorHtml } from "@/lib/rich-text/html"
import { imageFileProblem } from "@/lib/rich-text/upload-image"
import { MAX_DRIP_DAYS, MAX_LEVEL, PROGRAM_DESCRIPTION_MAX, PROGRAM_TITLE_MAX, centsFromTyped, programPrice, typedFromCents, type ProgramMode, type ProgramStatus } from "@/lib/communities/learn"
import type { BuilderMember, BuilderProgram, LearnBuilderData } from "./model"
import { learnRequest } from "./builder-parts"
import { EDITOR_CARD, EDITOR_CARD_HINT, EDITOR_CARD_TITLE, EditorFoot, SelectField, buttonPrimary, buttonSecondary, field } from "@/components/community/creator/parts"
import { tt } from "@/lib/i18n/text"

const LABEL = "mb-1.5 block text-[13px] font-medium text-[#4b5563]"
const HINT = "mt-1.5 text-[13px] leading-[18px] text-[#6b7280]"

export interface Form {
  title: string
  /** The description as the rich text field holds it (HTML). */
  summary: string
  coverUrl: string | null
  mode: ProgramMode
  level: number
  price: string
  drip: string
  members: BuilderMember[]
}

export function formOf(p: BuilderProgram): Form {
  return {
    title: p.title,
    summary: p.summary ? toEditorHtml(p.summary) : "",
    coverUrl: p.coverUrl,
    mode: p.mode,
    level: Math.max(2, Math.min(MAX_LEVEL, p.level || 2)),
    price: typedFromCents(p.priceCents),
    drip: p.dripDays ? String(p.dripDays) : "",
    members: p.members ?? [],
  }
}

const sameText = (a: string, b: string) => (isBlankHtml(a) && isBlankHtml(b)) || a.trim() === b.trim()
const ids = (m: BuilderMember[]) => m.map((x) => x.userId).join(",")

/** What changed since the last save, as the PATCH body: only those fields. */
export function changesOf(saved: Form, now: Form, kind: BuilderProgram["kind"]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (kind === "program" && now.title.trim() !== saved.title.trim()) out.title = now.title
  if (!sameText(now.summary, saved.summary)) out.summary = isBlankHtml(now.summary) ? "" : now.summary
  if (kind === "program" && now.coverUrl !== saved.coverUrl) out.coverUrl = now.coverUrl
  const accessMoved =
    now.mode !== saved.mode ||
    (now.mode === "level" && now.level !== saved.level) ||
    (now.mode === "paid" && centsFromTyped(now.price) !== centsFromTyped(saved.price)) ||
    (now.mode === "time" && (now.drip.trim() || "0") !== (saved.drip.trim() || "0")) ||
    (now.mode === "private" && ids(now.members) !== ids(saved.members))
  if (accessMoved) {
    out.mode = now.mode
    if (now.mode === "level") out.level = now.level
    if (now.mode === "paid") out.priceCents = centsFromTyped(now.price)
    if (now.mode === "time") out.dripDays = now.drip.trim() ? Number(now.drip) : null
    if (now.mode === "private") out.memberIds = now.members.map((m) => m.userId)
  }
  return out
}

/** The five choices, as the cards say them. */
export function accessChoices(): { value: ProgramMode; title: string; detail: string }[] {
  return [
    { value: "free", title: tt("Open"), detail: tt("Every member, from the day they join.") },
    { value: "level", title: tt("Reach a level"), detail: tt("Opens when a member reaches a level.") },
    { value: "paid", title: tt("Buy now"), detail: tt("A one time price, paid inside the community.") },
    { value: "time", title: tt("Days after joining"), detail: tt("Opens a number of days after someone joins.") },
    { value: "private", title: tt("Private"), detail: tt("Only the members you pick. Nobody else sees it.") },
  ]
}

/*
  WHERE THE DESCRIPTION'S TOOLBAR HOLDS STILL: just under the community editor's own bar, which stays at the top of the
  pane while it scrolls (creator/community-shell.tsx data-community-header). Its height is read from the bar itself, once
  and again whenever it changes (the bar is being made more compact elsewhere), never written down twice. Outside the
  shell there is no bar, and the toolbar holds at the top.
*/
function useBarHeight(ref: React.RefObject<HTMLElement | null>): string {
  const [h, setH] = React.useState(0)
  React.useEffect(() => {
    const bar = ref.current?.closest(".orders-pane")?.querySelector<HTMLElement>("[data-community-header]")
    if (!bar) return
    const read = () => setH(Math.round(bar.getBoundingClientRect().height))
    read()
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(read) : null
    ro?.observe(bar)
    return () => ro?.disconnect()
  }, [ref])
  return `${h}px`
}

/** A picture for the description or the cover, through the same upload as the program's cover. */
async function uploadPicture(file: File): Promise<{ url: string }> {
  const problem = imageFileProblem(file)
  if (problem) throw new Error(problem)
  const uploader = new DirectUploader({ file, folder: "product-images" })
  try {
    const result = await uploader.start()
    if (!result.publicUrl) throw new Error(tt("The picture did not upload. Try again."))
    return { url: result.publicUrl }
  } finally {
    uploader.destroy()
  }
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
  const [status, setStatus] = React.useState<ProgramStatus>(program.status)
  const [busy, setBusy] = React.useState(false)
  const [publishing, setPublishing] = React.useState(false)
  const [error, setError] = React.useState<{ field?: string; message: string } | null>(null)
  const [note, setNote] = React.useState<string | null>(null)
  const [uploading, setUploading] = React.useState<number | null>(null)
  const [lessons, setLessons] = React.useState(program.lessons)
  const [ask, confirmSheet] = useConfirm()
  const rootRef = React.useRef<HTMLDivElement>(null)
  const barHeight = useBarHeight(rootRef)
  const native = program.kind === "program"
  const changes = changesOf(saved, form, program.kind)
  const dirty = Object.keys(changes).length > 0
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }))
  const url = `/api/app/community/${communityId}/learn/${program.id}`

  React.useEffect(() => {
    if (!note) return
    const t = window.setTimeout(() => setNote(null), 3200)
    return () => window.clearTimeout(t)
  }, [note])

  const save = React.useCallback(async () => {
    if (!dirty || busy) return
    if (native && !form.title.trim()) return setError({ field: "title", message: tt("Give the program a name.") })
    if (form.mode === "paid" && (centsFromTyped(form.price) ?? 0) < 50) return setError({ field: "price", message: tt("Set a price of at least 0.50.") })
    if (form.mode === "time" && !(Number(form.drip) > 0)) return setError({ field: "dripDays", message: tt("Say how many days after joining it opens.") })
    if (form.mode === "private" && form.members.length === 0) return setError({ field: "members", message: tt("Pick at least one member.") })
    setError(null)
    setBusy(true)
    const res = await learnRequest(url, "PATCH", changes)
    setBusy(false)
    if (!res.ok) {
      setError({ field: res.data.field, message: res.data.error || tt("That did not save. Try again.") })
      return
    }
    setSaved(form)
    onSaved()
  }, [busy, changes, dirty, form, native, onSaved, url])

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

  /* Publish and Unpublish save at once, on their own: the rest of the form waits for Save as before. */
  const publish = async (next: ProgramStatus) => {
    if (publishing) return
    if (next === "published" && native && lessons === 0) return setError({ field: "status", message: tt("Add a lesson before publishing.") })
    setError(null)
    setPublishing(true)
    const res = await learnRequest(url, "PATCH", { status: next })
    setPublishing(false)
    if (!res.ok) return setError({ field: "status", message: res.data.error || tt("That did not save. Try again.") })
    setStatus(next)
    setNote(next === "published" ? tt("Published. Members see it under Learn.") : tt("Back to a draft. Only you and your team see it."))
    onSaved()
  }

  const leave = async () => {
    if (dirty && !(await ask({ title: tt("Discard changes?"), body: tt("Your edits since the last save will be lost. Lessons are saved as you make them."), confirm: tt("Discard"), cancel: tt("Keep editing") }))) return
    onBack()
  }

  const remove = async () => {
    const course = program.kind === "course"
    const yes = await ask({
      title: course ? tt("Take {title} out of Learn?", { title: program.title }) : tt("Delete {title}?", { title: program.title }),
      body: course ? tt("Members stop seeing it here. The course and its buyers are not touched.") : tt("Its modules, lessons and their files are deleted. This cannot be undone."),
      confirm: course ? tt("Take out") : tt("Delete"),
      cancel: tt("Keep it"),
      tone: "critical",
    })
    if (!yes) return
    const res = await learnRequest(url, "DELETE")
    if (!res.ok) return setError({ message: res.data.error || tt("That did not go. Try again.") })
    onDeleted()
  }

  const uploadCover = async (file: File) => {
    if (!/^image\//.test(file.type)) return setError({ field: "cover", message: tt("Pick a picture: JPG, PNG or WebP.") })
    setError(null)
    setUploading(0)
    const uploader = new DirectUploader({ file, folder: "product-images", onProgress: (p) => setUploading(Math.round(p)) })
    try {
      const result = await uploader.start()
      if (result.publicUrl) set("coverUrl", result.publicUrl)
      else setError({ field: "cover", message: tt("The picture did not upload. Try again.") })
    } catch (e) {
      setError({ field: "cover", message: (e as { message?: string })?.message || tt("The picture did not upload. Try again.") })
    } finally {
      uploader.destroy()
      setUploading(null)
    }
  }

  const errorFor = (name: string) => (error?.field === name ? error.message : null)
  const levelName = (n: number) => data.levels.find((l) => l.level === n)?.name
  const price = centsFromTyped(form.price)
  const published = status === "published"
  const viewHref = `/community/${data.slug}/learn/${program.id}`

  const accessInputs: Partial<Record<ProgramMode, React.ReactNode>> = {
    free: <p className="text-[13.5px] leading-5 text-[#4b5563]">{tt("Every member can open it, and it is on everyone's shelf.")}</p>,
    level: (
      <div>
        <label htmlFor="program-level" className={LABEL}>
          {tt("Opens at")}
        </label>
        {/* Round 32: the app's own pick (a dropdown on a computer, the shared sheet on a phone), never the browser's select. */}
        <SelectField
          id="program-level"
          name="program-level"
          title={tt("Opens at")}
          value={String(form.level)}
          onChange={(v) => set("level", Number(v))}
          options={Array.from({ length: MAX_LEVEL - 1 }, (_, i) => i + 2).map((n) => ({ value: String(n), label: `${tt("Level {n}", { n })}${levelName(n) ? `, ${levelName(n)}` : ""}` }))}
        />
        <p className={HINT}>{tt("Members reach levels with points for taking part. Below it, they see the program with the level it opens at.")}</p>
        <FieldError text={errorFor("level")} />
      </div>
    ),
    paid: (
      <div>
        <label htmlFor="program-price" className={LABEL}>
          {tt("Price, one payment")}
        </label>
        <div className="relative max-w-[220px]">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] font-medium uppercase text-[#6b7280]">{data.currency}</span>
          <input
            id="program-price"
            inputMode="decimal"
            className={cn(field, "h-11 pl-12 tabular-nums sm:h-10")}
            value={form.price}
            onChange={(e) => set("price", e.target.value.replace(/[^\d.,]/g, "").slice(0, 10))}
            placeholder="49"
            aria-invalid={!!errorFor("price")}
          />
        </div>
        <p className={HINT}>
          {price && price >= 50 ? tt("Members pay {amount} once, in a checkout inside the community. ", { amount: programPrice(price, data.currency) }) : tt("Members pay once, in a checkout inside the community. ")}
          {tt("It is not a Storelib product and is not listed anywhere else.")}
          {program.buyers ? tt(" {buyers} bought it so far.", { buyers: program.buyers }) : ""}
        </p>
        {!data.canSell ? (
          <p className="mt-2 rounded-lg bg-[#fdf8ea] px-3 py-2 text-[13px] leading-5 text-[#6b4e00]">
            {tt("Payouts are not set up yet, so nobody can buy it.")}{" "}
            <Link href="/app/payouts" className="font-medium underline underline-offset-2">
              {tt("Set up payouts")}
            </Link>
          </p>
        ) : null}
        <FieldError text={errorFor("price")} />
      </div>
    ),
    time: (
      <div>
        <label htmlFor="program-drip" className={LABEL}>
          {tt("Opens after joining")}
        </label>
        <div className="flex items-center gap-2">
          <input
            id="program-drip"
            inputMode="numeric"
            className={cn(field, "h-11 w-[96px] tabular-nums sm:h-10")}
            value={form.drip}
            onChange={(e) => set("drip", e.target.value.replace(/\D/g, "").slice(0, String(MAX_DRIP_DAYS).length))}
            placeholder="7"
            aria-invalid={!!errorFor("dripDays")}
          />
          <span className="text-[14px] text-[#4b5563]">{tt("days")}</span>
        </div>
        <p className={HINT}>{tt("Counted from the day each member joined. Until then they see the date it opens for them.")}</p>
        <FieldError text={errorFor("dripDays")} />
      </div>
    ),
    private: data.accessReady === false ? (
      <p className="rounded-lg bg-[#fdf8ea] px-3 py-2 text-[13px] leading-5 text-[#6b4e00]">{tt("Private programs need the latest database update (part 200).")}</p>
    ) : (
      <div>
        <MemberPicker communityId={communityId} value={form.members} onChange={(m) => set("members", m)} />
        <FieldError text={errorFor("members")} />
      </div>
    ),
  }

  return (
    <div ref={rootRef} className="pb-24 md:pb-20" data-program-editor={program.id}>
      {/* THE HEAD: one row, the height of a button. */}
      <div className="mb-3 flex min-h-10 items-center gap-2.5 sm:mb-4" data-program-head="">
        <button type="button" onClick={() => void leave()} aria-label={tt("Back to programs")} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-[#e5e7eb] bg-white text-[#1a1a2e] hover:bg-[#f8f9fa] sm:h-9 sm:w-9">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[16px] font-semibold leading-5 text-[#1a1a2e] sm:text-[18px] sm:leading-6">{form.title.trim() || tt("Untitled program")}</h2>
          <p className="truncate text-[12.5px] leading-4 text-[#6b7280]" data-program-state={status}>
            <span aria-hidden className={cn("mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-[2px]", published ? "bg-[#22a06b]" : "bg-[#e0a100]")} />
            {published ? tt("Published") : tt("Draft")}
            {native ? "" : tt(" · a course you sell")}
          </p>
        </div>
        <Link href={viewHref} target="_blank" className={cn(buttonSecondary, "max-sm:hidden")}>
          {tt("View as a member")}
        </Link>
        <button type="button" onClick={() => void publish(published ? "draft" : "published")} disabled={publishing} aria-busy={publishing || undefined} className={published ? buttonSecondary : buttonPrimary} data-publish={published ? "unpublish" : "publish"}>
          {published ? tt("Unpublish") : tt("Publish")}
        </button>
      </div>

      {(error && (!error.field || error.field === "status" || error.field === "mode")) || note ? (
        <p role={error ? "alert" : "status"} className={cn("mb-3 rounded-xl px-3.5 py-2.5 text-[13.5px]", error ? "border border-[#fbd5d0] bg-[#fef3f2] text-[#b42318]" : "border border-[#e5e7eb] bg-white text-[#4b5563]")}>
          {error ? error.message : note}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(300px,360px)] lg:items-start">
        <div className="flex min-w-0 flex-col gap-3 sm:gap-4">
          <section className={EDITOR_CARD} aria-labelledby="program-details" data-editor-card="details">
            <h3 id="program-details" className={EDITOR_CARD_TITLE}>
              {tt("Details")}
            </h3>
            {native ? (
              <div>
                <label htmlFor="program-title" className={LABEL}>
                  {tt("Name")}
                </label>
                <input id="program-title" className={cn(field, "h-11 sm:h-10")} value={form.title} maxLength={PROGRAM_TITLE_MAX} onChange={(e) => set("title", e.target.value)} aria-invalid={!!errorFor("title")} />
                <FieldError text={errorFor("title")} />
              </div>
            ) : (
              <p className="text-[14px] leading-6 text-[#4b5563]">
                {tt("Its name and cover are the course's own.")}{" "}
                {program.editHref ? (
                  <Link href={program.editHref} className="font-medium text-[#1a1a2e] underline decoration-[#d1d5db] underline-offset-2 hover:decoration-[#1a1a2e]">
                    {tt("Edit the course")}
                  </Link>
                ) : null}
              </p>
            )}
            <div data-program-description="">
              <p id="program-summary-label" className={LABEL}>
                {tt("Description")}
              </p>
              {/* The product editor's own description field: headings, lists, links, pictures and emoji, cleaned again on the server. */}
              <RichTextEditor
                value={form.summary}
                onChange={(html) => set("summary", html)}
                label={tt("Description")}
                placeholder={tt("What members will be able to do by the end.")}
                uploadImage={data.accessReady === false ? undefined : uploadPicture}
                checkSize={(html) => (html.length > PROGRAM_DESCRIPTION_MAX ? tt("The description is too long. Shorten it, or remove formatting that came with a paste.") : null)}
                minHeight={140}
                grow
                stickyToolbar={barHeight}
              />
              <FieldError text={errorFor("summary")} />
            </div>
            {native ? (
              <div>
                <p className={LABEL}>{tt("Cover")}</p>
                <CoverPick url={form.coverUrl} uploading={uploading} onPick={(f) => void uploadCover(f)} onClear={() => set("coverUrl", null)} />
                <FieldError text={errorFor("cover")} />
              </div>
            ) : null}
          </section>

          <section className={EDITOR_CARD} aria-labelledby="program-lessons" data-editor-card="lessons">
            <div className="flex items-baseline justify-between gap-3">
              <h3 id="program-lessons" className={EDITOR_CARD_TITLE}>
                {tt("Modules and lessons")}
              </h3>
              <span className="text-[13px] tabular-nums text-[#6b7280]">{lessons === 1 ? tt("1 lesson") : tt("{lessons} lessons", { lessons })}</span>
            </div>
            {native ? (
              <CourseEditor productId={program.id} ensureProductId={async () => program.id} onLessonCount={setLessons} notify={(m) => setNote(m)} />
            ) : (
              <p className="text-[14px] leading-6 text-[#4b5563]">
                {tt("This course's modules and lessons are edited in the course itself, and change here too.")}{" "}
                {program.editHref ? (
                  <Link href={program.editHref} className="font-medium text-[#1a1a2e] underline decoration-[#d1d5db] underline-offset-2 hover:decoration-[#1a1a2e]">
                    {tt("Edit lessons")}
                  </Link>
                ) : null}
              </p>
            )}
          </section>
        </div>

        <div className="flex min-w-0 flex-col gap-3 sm:gap-4">
          <section className={EDITOR_CARD} aria-labelledby="program-access" data-editor-card="access">
            <div>
              <h3 id="program-access" className={EDITOR_CARD_TITLE}>
                {tt("Who can open it")}
              </h3>
              <p className={EDITOR_CARD_HINT}>{tt("Only members ever see Learn. This decides which of them open the lessons.")}</p>
            </div>
            <AccessCards value={form.mode} onChange={(v) => set("mode", v)} inputs={accessInputs} privateOff={data.accessReady === false} />
          </section>

          <div className="flex justify-start">
            <button type="button" onClick={() => void remove()} className={cn(buttonSecondary, "text-[#b42318]")}>
              {program.kind === "course" ? tt("Take out of Learn") : tt("Delete program")}
            </button>
          </div>
        </div>
      </div>

      <EditorFoot dirty={dirty} busy={busy} busyText={uploading !== null ? tt("Uploading {uploading}%", { uploading }) : undefined} error={error && error.field !== "status" ? error.message : null} onSave={() => void save()} onCancel={() => { setForm(saved); setError(null) }} />
      {confirmSheet}
    </div>
  )
}

/*
  WHO CAN OPEN IT, AS CARDS: one row per choice with its line, the picked one marked and what it needs right under it
  (the level, the price, the days, the members), so the choice and its setting read as one. Rows with a hairline
  between them inside the card, the way ChoiceCards draws them in a card (no card inside a card).
*/
function AccessCards({ value, onChange, inputs, privateOff }: { value: ProgramMode; onChange: (v: ProgramMode) => void; inputs: Partial<Record<ProgramMode, React.ReactNode>>; privateOff: boolean }) {
  const choices = accessChoices()
  return (
    <div role="radiogroup" aria-label={tt("Who can open it")} className="-mx-2 space-y-1" data-access-cards="">
      {choices.map((o) => {
        const on = value === o.value
        const off = o.value === "private" && privateOff && !on
        return (
          <div key={o.value} className={cn("rounded-xl transition-colors duration-150", on ? "bg-[#f6f7f9] shadow-[inset_0_0_0_1px_#e5e7eb]" : "")} data-access-card={o.value} data-on={on ? "" : undefined}>
            <button type="button" role="radio" aria-checked={on} disabled={off} onClick={() => onChange(o.value)} className="flex min-h-[52px] w-full cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-[#f6f7f9] disabled:cursor-not-allowed disabled:opacity-50">
              <span aria-hidden className={cn("mt-[3px] grid h-4 w-4 shrink-0 place-items-center rounded-full border transition-colors", on ? "border-[#1a1a2e]" : "border-[#b5b5bd]")}>
                {on ? <span className="h-2 w-2 rounded-full bg-[#1a1a2e]" /> : null}
              </span>
              <span className="min-w-0">
                <span className="block text-[14px] font-semibold text-[#1a1a2e]">{o.title}</span>
                <span className="mt-0.5 block text-[12.5px] leading-snug text-[#6b7280]">{o.detail}</span>
              </span>
            </button>
            {on && inputs[o.value] ? (
              <div className="px-3 pb-3 pl-10" data-access-inputs={o.value}>
                {inputs[o.value]}
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

/**
 * THE MEMBERS OF A PRIVATE PROGRAM: a search over this community's active
 * members (app/api/app/community/<id>/learn/members), each one picked
 * becomes a row with their picture and a cross. The list is what is saved;
 * the server keeps only people who are members here.
 */
function MemberPicker({ communityId, value, onChange }: { communityId: string; value: BuilderMember[]; onChange: (m: BuilderMember[]) => void }) {
  const [q, setQ] = React.useState("")
  const [rows, setRows] = React.useState<BuilderMember[]>([])
  const [loading, setLoading] = React.useState(false)
  const [open, setOpen] = React.useState(false)
  const picked = new Set(value.map((m) => m.userId))
  React.useEffect(() => {
    if (!open) return
    let gone = false
    setLoading(true)
    const t = window.setTimeout(async () => {
      const res = await learnRequest<{ rows: BuilderMember[] }>(`/api/app/community/${communityId}/learn/members?q=${encodeURIComponent(q.trim())}`, "GET")
      if (gone) return
      setLoading(false)
      setRows(res.ok ? (res.data.rows ?? []) : [])
    }, q ? 180 : 0)
    return () => {
      gone = true
      window.clearTimeout(t)
    }
  }, [communityId, q, open])
  const choices = rows.filter((r) => !picked.has(r.userId)).slice(0, 8)
  return (
    <div data-member-picker="">
      <label htmlFor="program-member-search" className={LABEL}>
        {tt("Members")}
      </label>
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" />
        <input
          id="program-member-search"
          className={cn(field, "h-11 pl-9 sm:h-10")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          placeholder={tt("Search by name")}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls="program-member-results"
        />
        {open ? (
          <ul id="program-member-results" role="listbox" className="absolute inset-x-0 top-[calc(100%+4px)] z-20 overflow-hidden rounded-xl border border-[#e5e7eb] bg-white py-1 shadow-[0_10px_30px_-12px_rgba(17,24,39,0.25)]">
            {choices.length ? (
              choices.map((m) => (
                <li key={m.userId} role="option" aria-selected={false}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onChange([...value, m])
                      setQ("")
                    }}
                    className="flex min-h-11 w-full items-center gap-2.5 px-3 py-1.5 text-left text-[14px] text-[#1a1a2e] hover:bg-[#f6f7f9]"
                    data-member-choice={m.userId}
                  >
                    <Avatar m={m} />
                    <span className="min-w-0 flex-1 truncate">{m.name}</span>
                  </button>
                </li>
              ))
            ) : (
              <li className="px-3 py-2.5 text-[13px] text-[#6b7280]">{loading ? tt("Searching") : tt("Nobody by that name")}</li>
            )}
          </ul>
        ) : null}
      </div>
      {value.length ? (
        <ul className="mt-2 divide-y divide-[#eef0f2]" data-member-picked="">
          {value.map((m) => (
            <li key={m.userId} className="flex min-h-11 items-center gap-2.5 py-1">
              <Avatar m={m} />
              <span className="min-w-0 flex-1 truncate text-[14px] text-[#1a1a2e]">{m.name}</span>
              <button type="button" onClick={() => onChange(value.filter((x) => x.userId !== m.userId))} aria-label={tt("Take {name} off", { name: m.name })} className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-[#6b7280] hover:bg-[#eceef1] hover:text-[#1a1a2e] sm:h-9 sm:w-9">
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className={HINT}>{tt("Nobody yet. Only the members on this list see the program.")}</p>
      )}
      {value.length ? <p className={HINT}>{tt("{n, plural, one {# member sees it} other {# members see it}}, and your team.", { n: value.length })}</p> : null}
    </div>
  )
}

/* The shared avatar: a picture, or the default face, never a letter guessed from nothing (tests/avatar-one-rule). */
function Avatar({ m }: { m: BuilderMember }) {
  return <AppAvatar src={m.avatarUrl} name={m.name.trim()} alt="" size={28} className="shrink-0" />
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
    <div className="relative aspect-[16/9] w-full max-w-[320px] overflow-hidden rounded-xl border border-[#e5e7eb] bg-[#f6f7f9]" data-cover-pick>
      {url ? <Image src={url} alt="" fill sizes="320px" className="object-cover" /> : null}
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={uploading !== null}
        className={cn("absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-[13.5px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#8b5cf6]/40", url ? "bg-black/0 text-transparent hover:bg-black/30 hover:text-white" : "text-[#4b5563] hover:bg-[#f1f2f4]")}
        aria-label={url ? tt("Change the cover") : tt("Add a cover")}
      >
        <ImagePlus className="h-5 w-5" aria-hidden />
        {uploading !== null ? tt("Uploading {uploading}%", { uploading }) : url ? tt("Change") : tt("Add a cover, 16:9")}
      </button>
      {url && uploading === null ? (
        <button type="button" onClick={onClear} aria-label={tt("Remove the cover")} className="absolute right-2 top-2 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/95 text-[#1a1a2e] shadow-[0_1px_3px_rgba(0,0,0,0.2)] sm:h-8 sm:w-8">
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
