"use client"

/**
 * The blog's categories: each one a row (its name, its address and how many
 * posts it has) that opens in place to be edited, as a page's search result
 * does in Pages. A category has its own page on the website
 * (/blogs/<blog>/category/<slug>), so it has its own search title and
 * description too. Deleting one keeps its posts: they are left with none.
 */
import * as React from "react"
import { ChevronDown, Plus } from "lucide-react"
import { Reveal } from "@/components/ui/reveal"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { postSlugFrom } from "@/lib/site-blog/slug"
import { categoryPath } from "@/lib/site-blog/urls"
import type { SiteBlogCategory } from "@/lib/site-blog/types"
import { Counter, ErrorNote, buttonClass, inputClass, primaryButtonClass, textAreaClass } from "../parts"
import { createCategory, deleteCategory, updateCategory, type CategoryInput } from "./api"
import { cleanSlugInput } from "./model"
import { BlogDialog } from "./ui"

type Draft = { name: string; slug: string; description: string; seoTitle: string; seoDescription: string }
const draftOf = (c?: SiteBlogCategory): Draft => ({ name: c?.name ?? "", slug: c?.slug ?? "", description: c?.description ?? "", seoTitle: c?.seoTitle ?? "", seoDescription: c?.seoDescription ?? "" })

export function CategoriesEditor({
  installId,
  categories,
  handle,
  liveBase,
  onChanged,
}: {
  installId: string
  categories: SiteBlogCategory[]
  handle: string
  liveBase: string
  onChanged: () => void
}) {
  const [open, setOpen] = React.useState<string | null>(null)
  const sorted = [...categories].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
  return (
    <div data-blog-categories="">
      <div className="flex items-center justify-between gap-3 px-4 py-3 md:px-6">
        <p className="text-[13px] leading-snug text-white/50">{tt("Each category has its own page on your blog, listing its posts.")}</p>
        <button type="button" onClick={() => setOpen((o) => (o === "new" ? null : "new"))} className={buttonClass} aria-expanded={open === "new"}>
          <Plus className="h-4 w-4" />
          {tt("Add category")}
        </button>
      </div>
      <Reveal open={open === "new"} className="border-t border-white/[0.06] bg-white/[0.02]">
        <CategoryForm installId={installId} handle={handle} liveBase={liveBase} onDone={() => { setOpen(null); onChanged() }} onCancel={() => setOpen(null)} />
      </Reveal>
      {sorted.length === 0 ? (
        <p className="border-t border-white/[0.07] px-4 py-4 text-[14px] text-white/50 md:px-6">{tt("No categories yet.")}</p>
      ) : (
        <ul>
          {sorted.map((c) => (
            <li key={c.id} className="border-t border-white/[0.07]">
              <button
                type="button"
                onClick={() => setOpen((o) => (o === c.id ? null : c.id))}
                aria-expanded={open === c.id}
                className="group flex min-h-[56px] w-full items-center gap-3 px-4 py-2.5 text-left md:px-6 [-webkit-tap-highlight-color:transparent]"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14.5px] font-medium text-white">{c.name}</span>
                  <span className="block truncate text-[13px] text-white/50">{categoryPath(handle, c.slug)}</span>
                </span>
                <span className="shrink-0 text-[13px] tabular-nums text-white/50">{tt("{count, plural, one {# post} other {# posts}}", { count: c.postCount ?? 0 })}</span>
                <ChevronDown aria-hidden className={cn("h-4 w-4 shrink-0 text-white/50 transition-[rotate] duration-200 motion-reduce:transition-none", open === c.id && "rotate-180")} />
              </button>
              <Reveal open={open === c.id} className="border-t border-white/[0.06] bg-white/[0.02]">
                <CategoryForm installId={installId} category={c} handle={handle} liveBase={liveBase} onDone={() => { setOpen(null); onChanged() }} onCancel={() => setOpen(null)} />
              </Reveal>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function CategoryForm({
  installId,
  category,
  handle,
  liveBase,
  onDone,
  onCancel,
}: {
  installId: string
  category?: SiteBlogCategory
  handle: string
  liveBase: string
  onDone: () => void
  onCancel: () => void
}) {
  const [d, setD] = React.useState<Draft>(() => draftOf(category))
  const [slugTouched, setSlugTouched] = React.useState(Boolean(category))
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [confirming, setConfirming] = React.useState(false)
  const id = React.useId()
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }))
  const slug = d.slug || postSlugFrom(d.name)

  async function save() {
    if (!d.name.trim()) return setError(tt("Give the category a name."))
    setBusy(true)
    setError(null)
    const input: CategoryInput = { name: d.name.trim(), slug, description: d.description.trim(), seoTitle: d.seoTitle.trim(), seoDescription: d.seoDescription.trim() }
    try {
      if (category) await updateCategory(installId, category.id, input)
      else await createCategory(installId, input)
      if (!category) {
        setD(draftOf())
        setSlugTouched(false)
      }
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : tt("Something went wrong. Try again."))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!category) return
    setBusy(true)
    setError(null)
    try {
      await deleteCategory(installId, category.id)
      setConfirming(false)
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : tt("Something went wrong. Try again."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="space-y-4 px-4 py-4 md:px-6"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block" htmlFor={`${id}-name`}>
          <span className="text-[14px] font-medium text-white">{tt("Name")}</span>
          <input
            id={`${id}-name`}
            value={d.name}
            maxLength={80}
            onChange={(e) => set(slugTouched ? { name: e.target.value } : { name: e.target.value, slug: "" })}
            placeholder={tt("Guides")}
            className={cn(inputClass, "mt-1.5 md:w-full")}
          />
        </label>
        <label className="block" htmlFor={`${id}-slug`}>
          <span className="text-[14px] font-medium text-white">{tt("Address")}</span>
          <input
            id={`${id}-slug`}
            value={slug}
            maxLength={80}
            onChange={(e) => {
              setSlugTouched(true)
              set({ slug: cleanSlugInput(e.target.value) })
            }}
            className={cn(inputClass, "mt-1.5 md:w-full")}
          />
          <span className="mt-1 block truncate text-[12.5px] text-white/50">
            {liveBase}
            {categoryPath(handle, slug || "…")}
          </span>
        </label>
      </div>
      <label className="block" htmlFor={`${id}-desc`}>
        <span className="text-[14px] font-medium text-white">{tt("Description")}</span>
        <textarea id={`${id}-desc`} value={d.description} rows={2} maxLength={1000} onChange={(e) => set({ description: e.target.value })} placeholder={tt("Shown at the top of the category's page, when the theme shows one.")} className={cn(textAreaClass, "mt-1.5")} />
      </label>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block" htmlFor={`${id}-st`}>
          <span className="flex items-baseline justify-between gap-3 text-[14px] font-medium text-white">
            {tt("Search title")}
            <Counter value={d.seoTitle} max={60} />
          </span>
          <input id={`${id}-st`} value={d.seoTitle} maxLength={120} placeholder={d.name || tt("The category's name")} onChange={(e) => set({ seoTitle: e.target.value })} className={cn(inputClass, "mt-1.5 md:w-full")} />
        </label>
        <label className="block" htmlFor={`${id}-sd`}>
          <span className="flex items-baseline justify-between gap-3 text-[14px] font-medium text-white">
            {tt("Search description")}
            <Counter value={d.seoDescription} max={160} />
          </span>
          <input id={`${id}-sd`} value={d.seoDescription} maxLength={320} placeholder={d.description || tt("The category's description")} onChange={(e) => set({ seoDescription: e.target.value })} className={cn(inputClass, "mt-1.5 md:w-full")} />
        </label>
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={busy} className={primaryButtonClass + " px-4"}>
          {busy ? tt("Saving") : category ? tt("Save") : tt("Add category")}
        </button>
        <button type="button" onClick={onCancel} disabled={busy} className={buttonClass}>
          {tt("Cancel")}
        </button>
        {category && (
          <button type="button" onClick={() => setConfirming(true)} disabled={busy} className={cn(buttonClass, "ml-auto text-red-300")}>
            {tt("Delete")}
          </button>
        )}
      </div>
      {confirming && category && (
        <BlogDialog
          destructive
          title={tt("Delete this category?")}
          lead={tt("{name} is deleted. Its posts stay, with no category, and its page stops working.", { name: category.name })}
          confirmLabel={tt("Delete")}
          busyLabel={tt("Deleting")}
          busy={busy}
          error={error}
          onCancel={() => setConfirming(false)}
          onConfirm={() => void remove()}
        />
      )}
    </form>
  )
}
