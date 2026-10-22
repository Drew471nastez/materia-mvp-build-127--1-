"use client"

/**
 * ===========================================================================
 *  ONE LIBRARY ITEM'S EDITOR (round 39)
 * ===========================================================================
 * Laid out like Learn's program editor (components/community/learn/
 * program-editor.tsx), which is laid out like the product editor: the head
 * of one row (back, the name with its state, View as a member, Publish or
 * Unpublish, which saves at once), then from 1024px two columns, what the
 * item is on the left and who opens it on the right.
 *
 *   Details     name, the product editor's own rich text field for the
 *               description, a cover
 *   Inside      a resource's files (uploaded straight into the community's
 *               own storage, each checked where it lands) and links; an
 *               attached product's files are the product's, edited there
 *   Who opens   five choices as rows, each with what it needs under it:
 *               Free for members, Members of a tier (which), From a level
 *               (which), Buy (a price; a product sells at its own unless one
 *               is set here), Private (the members picked)
 *   Section     where it sits on the member's shelf
 *   Numbers     views, downloads, sales, and what the sales brought in
 *
 * Everything but Publish waits for Save in the shared save bar, and Save
 * sends only what changed.
 */
import * as React from "react"
import Image from "next/image"
import Link from "next/link"
import { ArrowLeft, Plus, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { DirectUploader } from "@/lib/storage/chunked-upload"
import { RichTextEditor } from "@/components/app/rich-text-editor"
import { isBlankHtml } from "@/lib/rich-text/html"
import { imageFileProblem } from "@/lib/rich-text/upload-image"
import { useConfirm } from "@/app/app/products/new/confirm-sheet"
import { uploadCommunityFile } from "@/components/community/member/media-upload"
import { fileSizeLabel } from "@/lib/communities/post-media"
import { centsFromTyped, programPrice, typedFromCents } from "@/lib/communities/learn"
import { LIBRARY_DESCRIPTION_MAX, LIBRARY_FILES_MAX, LIBRARY_LINKS_MAX, LIBRARY_MAX_LEVEL, LIBRARY_TITLE_MAX, cleanLinkUrl, type LibraryMode, type LibraryStatus } from "@/lib/communities/library"
import { CoverPick, MemberPicker } from "@/components/community/learn/program-editor"
import type { BuilderMember } from "@/components/community/learn/model"
import { EDITOR_CARD, EDITOR_CARD_HINT, EDITOR_CARD_TITLE, EditorFoot, SelectField, buttonPrimary, buttonSecondary, field, send } from "@/components/community/creator/parts"
import { tt } from "@/lib/i18n/text"
import type { AdminLibraryData, AdminLibraryItem } from "./model"

const LABEL = "mb-1.5 block text-[13px] font-medium text-[#4b5563]"
const HINT = "mt-1.5 text-[13px] leading-[18px] text-[#6b7280]"

export interface Form {
  title: string
  summary: string
  coverUrl: string | null
  sectionId: string | null
  mode: LibraryMode
  tierIds: string[]
  level: number
  /** The item's own price as typed; empty for a product sold at its own price. */
  price: string
  members: BuilderMember[]
  files: { fileId: string; name: string; size: number }[]
  links: { url: string; label: string }[]
}

export function formOf(i: AdminLibraryItem): Form {
  return {
    title: i.title,
    summary: i.descriptionHtml,
    coverUrl: i.coverUrl,
    sectionId: i.sectionId,
    mode: i.mode,
    tierIds: i.tierIds,
    level: Math.max(2, Math.min(LIBRARY_MAX_LEVEL, i.minLevel || 2)),
    price: typedFromCents(i.priceCents),
    members: i.members,
    files: i.files,
    links: i.links.map((l) => ({ url: l.url, label: l.label })),
  }
}

const sameText = (a: string, b: string) => (isBlankHtml(a) && isBlankHtml(b)) || a.trim() === b.trim()
const join = (a: string[]) => [...a].sort().join(",")

/** What changed since the last save, as the PATCH body: only those fields. */
export function changesOf(saved: Form, now: Form): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (now.title.trim() !== saved.title.trim()) out.title = now.title
  if (!sameText(now.summary, saved.summary)) out.summary = isBlankHtml(now.summary) ? "" : now.summary
  if (now.coverUrl !== saved.coverUrl) out.coverUrl = now.coverUrl
  if (now.sectionId !== saved.sectionId) out.sectionId = now.sectionId
  const accessMoved =
    now.mode !== saved.mode ||
    (now.mode === "tier" && join(now.tierIds) !== join(saved.tierIds)) ||
    (now.mode === "level" && now.level !== saved.level) ||
    (now.mode === "paid" && centsFromTyped(now.price) !== centsFromTyped(saved.price)) ||
    (now.mode === "private" && join(now.members.map((m) => m.userId)) !== join(saved.members.map((m) => m.userId)))
  if (accessMoved) {
    out.mode = now.mode
    if (now.mode === "tier") out.tierIds = now.tierIds
    if (now.mode === "level") out.level = now.level
    if (now.mode === "paid") out.priceCents = now.price.trim() ? centsFromTyped(now.price) : null
    if (now.mode === "private") out.memberIds = now.members.map((m) => m.userId)
  }
  if (now.files.map((f) => f.fileId).join() !== saved.files.map((f) => f.fileId).join()) out.files = now.files.map((f) => ({ fileId: f.fileId, name: f.name }))
  if (JSON.stringify(now.links) !== JSON.stringify(saved.links)) out.links = now.links.filter((l) => l.url.trim())
  return out
}

/** The five choices, as the rows say them. */
export function accessChoices(kind: AdminLibraryItem["kind"]): { value: LibraryMode; title: string; detail: string }[] {
  return [
    { value: "free", title: tt("Free for members"), detail: tt("Every member opens it.") },
    { value: "tier", title: tt("Members of a tier"), detail: tt("Only members on the tiers you pick.") },
    { value: "level", title: tt("From a level"), detail: tt("Opens when a member reaches a points level.") },
    { value: "paid", title: tt("Buy"), detail: kind === "product" ? tt("Sold at the product's price, or one you set here.") : tt("A one time price, paid inside the community.") },
    { value: "private", title: tt("Private"), detail: tt("Only the members you pick. Nobody else sees it.") },
  ]
}

/* Where the description's toolbar holds still: under the community editor's own bar, read from the bar itself. */
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

export function LibraryEditor({ item, data, onBack, onSaved, onDeleted }: { item: AdminLibraryItem; data: AdminLibraryData; onBack: () => void; onSaved: () => void; onDeleted: () => void }) {
  const [saved, setSaved] = React.useState<Form>(() => formOf(item))
  const [form, setForm] = React.useState<Form>(saved)
  const [status, setStatus] = React.useState<LibraryStatus>(item.status)
  const [busy, setBusy] = React.useState(false)
  const [publishing, setPublishing] = React.useState(false)
  const [error, setError] = React.useState<{ field?: string; message: string } | null>(null)
  const [note, setNote] = React.useState<string | null>(null)
  const [coverUploading, setCoverUploading] = React.useState<number | null>(null)
  const [fileUploading, setFileUploading] = React.useState<{ name: string; percent: number } | null>(null)
  const [ask, confirmSheet] = useConfirm()
  const rootRef = React.useRef<HTMLDivElement>(null)
  const fileInput = React.useRef<HTMLInputElement>(null)
  const barHeight = useBarHeight(rootRef)
  const resource = item.kind === "resource"
  const changes = changesOf(saved, form)
  const dirty = Object.keys(changes).length > 0
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }))
  const url = `/api/app/community/${data.communityId}/library/${item.id}`

  React.useEffect(() => {
    if (!note) return
    const t = window.setTimeout(() => setNote(null), 3200)
    return () => window.clearTimeout(t)
  }, [note])

  const save = React.useCallback(async () => {
    if (!dirty || busy) return
    if (!form.title.trim()) return setError({ field: "title", message: tt("Give it a name.") })
    if (form.mode === "paid" && (resource || form.price.trim()) && (centsFromTyped(form.price) ?? 0) < 50) return setError({ field: "price", message: tt("Set a price of at least 0.50.") })
    if (form.mode === "tier" && form.tierIds.length === 0) return setError({ field: "tiers", message: tt("Pick at least one tier.") })
    if (form.mode === "private" && form.members.length === 0) return setError({ field: "members", message: tt("Pick at least one member.") })
    if (form.links.some((l) => l.url.trim() && !cleanLinkUrl(l.url))) return setError({ field: "links", message: tt("A link needs a full web address, like https://example.com/guide.") })
    setError(null)
    setBusy(true)
    const res = await send(url, "PATCH", changes)
    setBusy(false)
    if (!res.ok) return setError({ field: res.data.field, message: res.data.error || tt("That did not save. Try again.") })
    setSaved(form)
    onSaved()
  }, [busy, changes, dirty, form, onSaved, resource, url])

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

  const publish = async (next: LibraryStatus) => {
    if (publishing) return
    if (dirty) return setError({ field: "status", message: tt("Save your changes first.") })
    setError(null)
    setPublishing(true)
    const res = await send(url, "PATCH", { status: next })
    setPublishing(false)
    if (!res.ok) return setError({ field: "status", message: res.data.error || tt("That did not save. Try again.") })
    setStatus(next)
    setNote(next === "published" ? tt("Published. Members see it in the Library.") : tt("Back to a draft. Only you and your team see it."))
    onSaved()
  }

  const leave = async () => {
    if (dirty && !(await ask({ title: tt("Discard changes?"), body: tt("Your edits since the last save will be lost."), confirm: tt("Discard"), cancel: tt("Keep editing") }))) return
    onBack()
  }

  const remove = async () => {
    const yes = await ask({
      title: tt("Take {title} out of the library?", { title: item.title }),
      body: item.kind === "product" ? tt("Members stop seeing it here. The product and its buyers are not touched.") : item.madeProduct ? tt("Members stop seeing it here. Everybody who bought it keeps it in their Storelib library.") : tt("Its files and links go with it. This cannot be undone."),
      confirm: tt("Take out"),
      cancel: tt("Keep it"),
      tone: "critical",
    })
    if (!yes) return
    const res = await send(url, "DELETE")
    if (!res.ok) return setError({ message: res.data.error || tt("That did not go. Try again.") })
    onDeleted()
  }

  const uploadCover = async (file: File) => {
    if (!/^image\//.test(file.type)) return setError({ field: "cover", message: tt("Pick a picture: JPG, PNG or WebP.") })
    setError(null)
    setCoverUploading(0)
    const uploader = new DirectUploader({ file, folder: "product-images", onProgress: (p) => setCoverUploading(Math.round(p)) })
    try {
      const result = await uploader.start()
      if (result.publicUrl) set("coverUrl", result.publicUrl)
      else setError({ field: "cover", message: tt("The picture did not upload. Try again.") })
    } catch (e) {
      setError({ field: "cover", message: (e as { message?: string })?.message || tt("The picture did not upload. Try again.") })
    } finally {
      uploader.destroy()
      setCoverUploading(null)
    }
  }

  const addFiles = async (list: FileList | null) => {
    const files = Array.from(list ?? [])
    if (!files.length) return
    if (form.files.length + files.length > LIBRARY_FILES_MAX) return setError({ field: "files", message: tt("Up to {n} files in one item.", { n: LIBRARY_FILES_MAX }) })
    setError(null)
    for (const file of files) {
      setFileUploading({ name: file.name, percent: 0 })
      try {
        const done = await uploadCommunityFile({ communityId: data.communityId, file, onProgress: (percent) => setFileUploading({ name: file.name, percent }) })
        setForm((f) => ({ ...f, files: [...f.files, { fileId: done.assetId, name: done.name ?? file.name, size: done.size ?? file.size }] }))
      } catch (e) {
        setError({ field: "files", message: (e as { message?: string })?.message || tt("The file did not upload. Try again.") })
        break
      }
    }
    setFileUploading(null)
  }

  const errorFor = (name: string) => (error?.field === name ? error.message : null)
  const levelName = (n: number) => data.levels.find((l) => l.level === n)?.name
  const typed = centsFromTyped(form.price)
  const published = status === "published"
  const viewHref = `/community/${data.slug}/library/${item.id}`
  const productPrice = item.product?.priceLabel ?? null

  const accessInputs: Partial<Record<LibraryMode, React.ReactNode>> = {
    free: <p className="text-[13.5px] leading-5 text-[#4b5563]">{tt("Every member can open it, and it is on everyone's shelf.")}</p>,
    tier: data.tiers.length ? (
      <div data-library-tiers="">
        <p className={LABEL}>{tt("Tiers")}</p>
        <div className="flex flex-wrap gap-1.5">
          {data.tiers.map((t) => {
            const on = form.tierIds.includes(t.id)
            return (
              <button
                key={t.id}
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => set("tierIds", on ? form.tierIds.filter((x) => x !== t.id) : [...form.tierIds, t.id])}
                className={cn("inline-flex h-10 items-center rounded-full border px-3.5 text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/25 sm:h-8", on ? "border-[#1a1a2e] bg-[#1a1a2e] text-white" : "border-[#e5e7eb] bg-white text-[#374151] hover:bg-[#f8f9fa]")}
              >
                {t.name}
              </button>
            )
          })}
        </div>
        <p className={HINT}>{tt("Everybody else sees it with the tiers it is for, and a way to change their membership.")}</p>
        <FieldError text={errorFor("tiers")} />
      </div>
    ) : (
      <p className="rounded-lg bg-[#fdf8ea] px-3 py-2 text-[13px] leading-5 text-[#6b4e00]">{tt("This community has no tiers yet. Add them in Settings, under who can join.")}</p>
    ),
    level: (
      <div>
        <label htmlFor="library-level" className={LABEL}>
          {tt("Opens at")}
        </label>
        <SelectField
          id="library-level"
          name="library-level"
          title={tt("Opens at")}
          value={String(form.level)}
          onChange={(v) => set("level", Number(v))}
          options={Array.from({ length: LIBRARY_MAX_LEVEL - 1 }, (_, i) => i + 2).map((n) => ({ value: String(n), label: `${tt("Level {n}", { n })}${levelName(n) ? `, ${levelName(n)}` : ""}` }))}
        />
        <p className={HINT}>{tt("Members reach levels with points for taking part. Below it, they see the level it opens at.")}</p>
      </div>
    ),
    paid: (
      <div>
        <label htmlFor="library-price" className={LABEL}>
          {resource ? tt("Price, one payment") : tt("Price here, one payment")}
        </label>
        <div className="relative max-w-[220px]">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] font-medium uppercase text-[#6b7280]">{item.currency}</span>
          <input
            id="library-price"
            inputMode="decimal"
            className={cn(field, "h-11 pl-12 tabular-nums sm:h-10")}
            value={form.price}
            onChange={(e) => set("price", e.target.value.replace(/[^\d.,]/g, "").slice(0, 10))}
            placeholder={resource ? "12" : typedFromCents(item.product?.priceCents ?? null) || "12"}
            aria-invalid={!!errorFor("price")}
          />
        </div>
        <p className={HINT}>
          {resource
            ? typed && typed >= 50
              ? tt("Members pay {amount} once, inside the community. It becomes a product of the community, so each sale is an order with a receipt and a place in the buyer's Storelib library. It is not listed in your store.", { amount: programPrice(typed, item.currency) })
              : tt("Members pay once, inside the community. Each sale is an order with a receipt and a place in the buyer's Storelib library. It is not listed in your store.")
            : form.price.trim() && typed
              ? tt("Members pay {amount} here. Your store keeps its own price.", { amount: programPrice(typed, item.currency) })
              : productPrice
                ? tt("Left empty, members pay the product's price, {price}.", { price: productPrice })
                : tt("Left empty, members pay the product's price.")}
          {item.stats.sales ? tt(" {n, plural, one {# sale} other {# sales}} so far.", { n: item.stats.sales }) : ""}
        </p>
        {!data.canSell ? (
          <p className="mt-2 rounded-lg bg-[#fdf8ea] px-3 py-2 text-[13px] leading-5 text-[#6b4e00]">
            {tt("Payouts are not set up yet, so nobody can buy it.")}{" "}
            <Link href="/app/payouts" className="font-medium underline underline-offset-2">
              {tt("Set up payouts")}
            </Link>
          </p>
        ) : null}
        {!resource && item.product?.hasOptions ? <p className="mt-2 rounded-lg bg-[#fdf8ea] px-3 py-2 text-[13px] leading-5 text-[#6b4e00]">{tt("This product has options, so it sells from its own page. Pick another way to open it.")}</p> : null}
        <FieldError text={errorFor("price")} />
      </div>
    ),
    private: (
      <div>
        <MemberPicker communityId={data.communityId} value={form.members} onChange={(m) => set("members", m)} emptyHint={tt("Nobody yet. Only the members on this list see it.")} />
        <FieldError text={errorFor("members")} />
      </div>
    ),
  }

  return (
    <div ref={rootRef} className="pb-24 md:pb-20" data-library-editor={item.id}>
      <div className="mb-3 flex min-h-10 items-center gap-2.5 sm:mb-4" data-library-head="">
        <button type="button" onClick={() => void leave()} aria-label={tt("Back to the library")} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-[#e5e7eb] bg-white text-[#1a1a2e] hover:bg-[#f8f9fa] sm:h-9 sm:w-9">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[16px] font-semibold leading-5 text-[#1a1a2e] sm:text-[18px] sm:leading-6">{form.title.trim() || tt("Untitled")}</h2>
          <p className="truncate text-[12.5px] leading-4 text-[#6b7280]" data-library-state={status}>
            <span aria-hidden className={cn("mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-[2px]", published ? "bg-[#22a06b]" : "bg-[#e0a100]")} />
            {published ? tt("Published") : tt("Draft")}
            {resource ? "" : tt(" · a product you sell")}
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
          <section className={EDITOR_CARD} aria-labelledby="library-details" data-editor-card="details">
            <h3 id="library-details" className={EDITOR_CARD_TITLE}>
              {tt("Details")}
            </h3>
            <div>
              <label htmlFor="library-title" className={LABEL}>
                {tt("Name")}
              </label>
              <input id="library-title" className={cn(field, "h-11 sm:h-10")} value={form.title} maxLength={LIBRARY_TITLE_MAX} onChange={(e) => set("title", e.target.value)} aria-invalid={!!errorFor("title")} />
              <FieldError text={errorFor("title")} />
            </div>
            <div data-library-description="">
              <p className={LABEL}>{tt("Description")}</p>
              <RichTextEditor
                value={form.summary}
                onChange={(html) => set("summary", html)}
                label={tt("Description")}
                placeholder={tt("What it is and who it helps.")}
                uploadImage={uploadPicture}
                checkSize={(html) => (html.length > LIBRARY_DESCRIPTION_MAX ? tt("The description is too long. Shorten it, or remove formatting that came with a paste.") : null)}
                minHeight={120}
                grow
                stickyToolbar={barHeight}
              />
              <FieldError text={errorFor("summary")} />
            </div>
            <div>
              <p className={LABEL}>{tt("Cover")}</p>
              <CoverPick url={form.coverUrl} uploading={coverUploading} onPick={(f) => void uploadCover(f)} onClear={() => set("coverUrl", null)} />
              <FieldError text={errorFor("cover")} />
            </div>
          </section>

          <section className={EDITOR_CARD} aria-labelledby="library-inside" data-editor-card="inside">
            <div className="flex items-baseline justify-between gap-3">
              <h3 id="library-inside" className={EDITOR_CARD_TITLE}>
                {resource ? tt("Files and links") : tt("The product")}
              </h3>
              {resource ? <span className="text-[13px] tabular-nums text-[#6b7280]">{tt("{n, plural, one {# file} other {# files}}", { n: form.files.length })}</span> : null}
            </div>
            {resource ? (
              <>
                {form.files.length ? (
                  <ul className="-my-1 divide-y divide-[#f0f1f3]" data-library-file-list="">
                    {form.files.map((f) => (
                      <li key={f.fileId} className="flex min-h-12 items-center gap-3 py-1.5" data-library-edit-file={f.fileId}>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] font-medium text-[#1a1a2e]">{f.name}</span>
                          <span className="block text-[12.5px] tabular-nums text-[#6b7280]">{fileSizeLabel(f.size)}</span>
                        </span>
                        <button type="button" onClick={() => set("files", form.files.filter((x) => x.fileId !== f.fileId))} aria-label={tt("Remove {name}", { name: f.name })} className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-[#6b7280] hover:bg-[#eceef1] hover:text-[#1a1a2e] sm:h-9 sm:w-9">
                          <X className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[13.5px] leading-5 text-[#6b7280]">{tt("PDFs, templates, audio, zips: anything your members download. Up to 500 MB each.")}</p>
                )}
                {fileUploading ? (
                  <p className="text-[13px] tabular-nums text-[#4b5563]" aria-live="polite" data-library-uploading="">
                    {tt("Uploading {name}, {percent}%", { name: fileUploading.name, percent: fileUploading.percent })}
                  </p>
                ) : null}
                <div>
                  <button type="button" className={buttonSecondary} onClick={() => fileInput.current?.click()} disabled={!!fileUploading || form.files.length >= LIBRARY_FILES_MAX} data-library-add-files="">
                    <Plus className="h-4 w-4" aria-hidden />
                    {tt("Add files")}
                  </button>
                  <input
                    ref={fileInput}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      const list = e.target.files
                      void addFiles(list).finally(() => {
                        if (fileInput.current) fileInput.current.value = ""
                      })
                    }}
                  />
                  <FieldError text={errorFor("files")} />
                </div>
                <div className="border-t border-[#f0f1f3] pt-4" data-library-links-edit="">
                  <p className={LABEL}>{tt("Links")}</p>
                  {form.links.length ? (
                    <ul className="space-y-2">
                      {form.links.map((l, i) => (
                        <li key={i} className="grid grid-cols-[minmax(0,1fr)_40px] gap-2 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_36px]">
                          <input aria-label={tt("Link name")} className={cn(field, "h-11 max-sm:col-span-2 sm:h-10")} value={l.label} maxLength={80} placeholder={tt("Name, like Notion template")} onChange={(e) => set("links", form.links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                          <input aria-label={tt("Web address")} className={cn(field, "h-11 sm:h-10")} value={l.url} inputMode="url" placeholder="https://" onChange={(e) => set("links", form.links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
                          <button type="button" onClick={() => set("links", form.links.filter((_, j) => j !== i))} aria-label={tt("Remove this link")} className="inline-flex h-11 w-10 items-center justify-center rounded-lg text-[#6b7280] hover:bg-[#eceef1] hover:text-[#1a1a2e] sm:h-10 sm:w-9">
                            <X className="h-4 w-4" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[13.5px] leading-5 text-[#6b7280]">{tt("A shared folder, a template, a recording. Only members who open the item are sent to it.")}</p>
                  )}
                  <button type="button" className={cn(buttonSecondary, "mt-2.5")} onClick={() => set("links", [...form.links, { url: "", label: "" }])} disabled={form.links.length >= LIBRARY_LINKS_MAX} data-library-add-link="">
                    <Plus className="h-4 w-4" aria-hidden />
                    {tt("Add a link")}
                  </button>
                  <FieldError text={errorFor("links")} />
                </div>
              </>
            ) : item.product ? (
              <div className="flex items-center gap-3" data-library-product="">
                <span className="relative aspect-[16/9] w-[84px] shrink-0 overflow-hidden rounded-lg border border-black/[0.04] bg-[#f1f2f4]">{item.product.coverUrl ? <Image src={item.product.coverUrl} alt="" fill sizes="84px" className="object-cover" /> : null}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14.5px] font-medium text-[#1a1a2e]">{item.product.title}</span>
                  <span className="block text-[13px] tabular-nums text-[#6b7280]">
                    {[item.product.priceLabel ?? tt("Free"), tt("{n, plural, one {# file} other {# files}}", { n: item.product.files }), item.product.status === "published" ? null : tt("Not published")].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <Link href={`/app/products/${item.product.id}/edit`} className={cn(buttonSecondary, "shrink-0")}>
                  {tt("Edit product")}
                </Link>
              </div>
            ) : (
              <p className="text-[13.5px] text-[#b42318]">{tt("Its product is no longer in your store. Take it out of the library.")}</p>
            )}
          </section>
        </div>

        <div className="flex min-w-0 flex-col gap-3 sm:gap-4">
          <section className={EDITOR_CARD} aria-labelledby="library-access" data-editor-card="access">
            <div>
              <h3 id="library-access" className={EDITOR_CARD_TITLE}>
                {tt("Who can open it")}
              </h3>
              <p className={EDITOR_CARD_HINT}>{tt("Only members ever see the Library. This decides which of them open it.")}</p>
            </div>
            <AccessRows choices={accessChoices(item.kind)} value={form.mode} onChange={(v) => set("mode", v)} inputs={accessInputs} />
          </section>

          <section className={EDITOR_CARD} aria-labelledby="library-place" data-editor-card="section">
            <h3 id="library-place" className={EDITOR_CARD_TITLE}>
              {tt("Section")}
            </h3>
            {data.sections.length ? (
              <SelectField id="library-section" name="library-section" title={tt("Section")} value={form.sectionId ?? ""} onChange={(v) => set("sectionId", v || null)} options={[{ value: "", label: tt("No section") }, ...data.sections.map((s) => ({ value: s.id, label: s.name }))]} />
            ) : (
              <p className="text-[13.5px] leading-5 text-[#6b7280]">{tt("Sections group the shelf, like Templates or Recordings. Make them from the list with Sections.")}</p>
            )}
          </section>

          <section className={EDITOR_CARD} aria-labelledby="library-numbers" data-editor-card="numbers">
            <h3 id="library-numbers" className={EDITOR_CARD_TITLE}>
              {tt("So far")}
            </h3>
            <dl className="grid grid-cols-3 gap-2" data-library-stats="">
              {[
                { k: tt("Views"), v: item.stats.views },
                { k: tt("Downloads"), v: item.stats.downloads },
                { k: tt("Sales"), v: item.stats.sales },
              ].map((s) => (
                <div key={s.k}>
                  <dt className="text-[12.5px] text-[#6b7280]">{s.k}</dt>
                  <dd className="text-[18px] font-semibold tabular-nums text-[#1a1a2e]">{s.v.toLocaleString()}</dd>
                </div>
              ))}
            </dl>
            {item.stats.revenueLabel ? <p className="text-[13px] text-[#4b5563]">{tt("{amount} from sales here, before fees.", { amount: item.stats.revenueLabel })}</p> : null}
          </section>

          <div className="flex justify-start">
            <button type="button" onClick={() => void remove()} className={cn(buttonSecondary, "text-[#b42318]")} data-library-remove="">
              {tt("Take out of the library")}
            </button>
          </div>
        </div>
      </div>

      <EditorFoot dirty={dirty} busy={busy} busyText={coverUploading !== null ? tt("Uploading {uploading}%", { uploading: coverUploading }) : undefined} error={error && error.field !== "status" ? error.message : null} onSave={() => void save()} onCancel={() => { setForm(saved); setError(null) }} />
      {confirmSheet}
    </div>
  )
}

/* Who can open it, as rows: the picked one marked, what it needs right under it, a hairline between them (no card in a card). */
function AccessRows({ choices, value, onChange, inputs }: { choices: { value: LibraryMode; title: string; detail: string }[]; value: LibraryMode; onChange: (v: LibraryMode) => void; inputs: Partial<Record<LibraryMode, React.ReactNode>> }) {
  return (
    <div role="radiogroup" aria-label={tt("Who can open it")} className="-mx-2 space-y-1" data-access-cards="">
      {choices.map((o) => {
        const on = value === o.value
        return (
          <div key={o.value} className={cn("rounded-xl transition-colors duration-150", on ? "bg-[#f6f7f9] shadow-[inset_0_0_0_1px_#e5e7eb]" : "")} data-access-card={o.value} data-on={on ? "" : undefined}>
            <button type="button" role="radio" aria-checked={on} onClick={() => onChange(o.value)} className="flex min-h-[52px] w-full cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-[#f6f7f9]">
              <span aria-hidden className={cn("mt-[3px] grid h-4 w-4 shrink-0 place-items-center rounded-full border transition-colors", on ? "border-[#1a1a2e]" : "border-[#b5b5bd]")}>{on ? <span className="h-2 w-2 rounded-full bg-[#1a1a2e]" /> : null}</span>
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

function FieldError({ text }: { text: string | null }) {
  if (!text) return null
  return (
    <p className="mt-1.5 text-[13px] text-[#b42318]" role="alert">
      {text}
    </p>
  )
}
