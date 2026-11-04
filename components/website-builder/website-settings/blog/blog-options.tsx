"use client"

/**
 * The blog itself: its address, its name and description, how many posts a
 * page lists, and what its page says to a search engine and on a shared
 * link. These are the blog's, not the website draft's: Save writes them at
 * once and the live blog follows. A new address keeps the old one working,
 * answered with a permanent redirect.
 */
import * as React from "react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { isBlogHandle } from "@/lib/site-blog/slug"
import { blogPath } from "@/lib/site-blog/urls"
import type { SiteBlogSettings } from "@/lib/site-blog/types"
import { WbImagePicker } from "@/components/website-builder/editor/image-picker"
import { Counter, DarkScope, ErrorNote, SearchResultPreview, primaryButtonClass, inputClass, textAreaClass, buttonClass } from "../parts"
import { saveBlogSettings } from "./api"
import { cleanSlugInput } from "./model"

export function BlogOptions({
  installId,
  settings,
  liveBase,
  siteName,
  onSaved,
}: {
  installId: string
  settings: SiteBlogSettings
  liveBase: string
  siteName: string
  onSaved: (settings: SiteBlogSettings) => void
}) {
  const [d, setD] = React.useState(settings)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [saved, setSaved] = React.useState(false)
  const id = React.useId()
  const set = (patch: Partial<SiteBlogSettings>) => {
    setSaved(false)
    setD((x) => ({ ...x, ...patch }))
  }
  const changed = JSON.stringify(d) !== JSON.stringify(settings)
  const handleOk = isBlogHandle(d.handle)
  const perPageOk = Number.isInteger(d.postsPerPage) && d.postsPerPage >= 1 && d.postsPerPage <= 48
  const display = liveBase.replace(/^https?:\/\//, "")

  async function save() {
    if (!handleOk) return setError(tt("Use lower case letters, numbers and hyphens for the address."))
    if (!perPageOk) return setError(tt("Show between 1 and 48 posts a page."))
    setBusy(true)
    setError(null)
    try {
      const next = await saveBlogSettings(installId, {
        handle: d.handle,
        title: d.title.trim(),
        description: d.description.trim(),
        postsPerPage: d.postsPerPage,
        seoTitle: d.seoTitle.trim(),
        seoDescription: d.seoDescription.trim(),
        ogImageUrl: d.ogImageUrl,
      })
      setD(next)
      setSaved(true)
      onSaved(next)
    } catch (e) {
      setError(e instanceof Error ? e.message : tt("Something went wrong. Try again."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      data-blog-options=""
      className="space-y-4 px-4 py-4 md:px-6"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <label className="block" htmlFor={`${id}-handle`}>
        <span className="text-[14px] font-medium text-white">{tt("Address")}</span>
        <span className="mt-1.5 flex min-w-0 items-center overflow-hidden rounded-lg border border-white/12 bg-[#171717] focus-within:border-white/35">
          <span className="shrink-0 select-none pl-3.5 text-[16px] text-white/40 md:text-[14.5px]">{blogPath("")}</span>
          <input
            id={`${id}-handle`}
            value={d.handle}
            maxLength={63}
            onChange={(e) => set({ handle: cleanSlugInput(e.target.value).slice(0, 63) })}
            aria-invalid={!handleOk}
            className="h-11 min-w-0 flex-1 bg-transparent pr-3.5 text-[16px] text-white outline-none md:h-10 md:text-[14.5px]"
          />
        </span>
        <span className="mt-1 block truncate text-[12.5px] text-white/50">
          {display}
          {blogPath(d.handle || "…")}
        </span>
        {d.handle !== settings.handle && settings.handle && <span className="mt-1 block text-[12.5px] text-amber-200">{tt("The old address will keep working and send visitors to the new one.")}</span>}
      </label>

      <div className="grid gap-4 md:grid-cols-[1fr_160px]">
        <label className="block" htmlFor={`${id}-title`}>
          <span className="text-[14px] font-medium text-white">{tt("Blog name")}</span>
          <input id={`${id}-title`} value={d.title} maxLength={120} onChange={(e) => set({ title: e.target.value })} placeholder={tt("Blog")} className={cn(inputClass, "mt-1.5 md:w-full")} />
        </label>
        <label className="block" htmlFor={`${id}-pp`}>
          <span className="text-[14px] font-medium text-white">{tt("Posts a page")}</span>
          <input
            id={`${id}-pp`}
            type="number"
            inputMode="numeric"
            min={1}
            max={48}
            value={Number.isFinite(d.postsPerPage) ? d.postsPerPage : ""}
            onChange={(e) => set({ postsPerPage: Math.round(Number(e.target.value)) })}
            aria-invalid={!perPageOk}
            className={cn(inputClass, "mt-1.5 md:w-full")}
          />
        </label>
      </div>

      <label className="block" htmlFor={`${id}-desc`}>
        <span className="text-[14px] font-medium text-white">{tt("Description")}</span>
        <textarea id={`${id}-desc`} value={d.description} rows={2} maxLength={1000} onChange={(e) => set({ description: e.target.value })} placeholder={tt("What readers find here, shown at the top of the blog when the theme shows it.")} className={cn(textAreaClass, "mt-1.5")} />
      </label>

      <div className="space-y-4 rounded-xl border border-white/[0.07] p-4">
        <p className="text-[14px] font-semibold text-white">{tt("Search and social")}</p>
        <SearchResultPreview
          compact
          address={`${display}${blogPath(d.handle || "news")}`}
          title={d.seoTitle.trim() || `${d.title.trim() || tt("Blog")} | ${siteName}`}
          description={d.seoDescription.trim() || d.description.trim() || tt("The latest posts from {name}.", { name: siteName })}
        />
        <label className="block" htmlFor={`${id}-st`}>
          <span className="flex items-baseline justify-between gap-3 text-[14px] font-medium text-white">
            {tt("Search title")}
            <Counter value={d.seoTitle} max={60} />
          </span>
          <input id={`${id}-st`} value={d.seoTitle} maxLength={120} onChange={(e) => set({ seoTitle: e.target.value })} className={cn(inputClass, "mt-1.5 md:w-full")} />
        </label>
        <label className="block" htmlFor={`${id}-sd`}>
          <span className="flex items-baseline justify-between gap-3 text-[14px] font-medium text-white">
            {tt("Search description")}
            <Counter value={d.seoDescription} max={160} />
          </span>
          <textarea id={`${id}-sd`} value={d.seoDescription} rows={3} maxLength={320} onChange={(e) => set({ seoDescription: e.target.value })} className={cn(textAreaClass, "mt-1.5 leading-snug")} />
        </label>
        <div>
          <p className="text-[14px] font-medium text-white">{tt("Social image")}</p>
          <p className="mt-0.5 text-[13px] leading-snug text-white/50">{tt("Shown when a link to the blog is shared. Leave it empty to use the site's.")}</p>
          <DarkScope className="mt-2 max-w-[420px]">
            <WbImagePicker value={d.ogImageUrl || undefined} onChange={(url) => set({ ogImageUrl: url ?? "" })} layout="row" folder="blog" />
          </DarkScope>
        </div>
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={busy || !changed} className={primaryButtonClass + " px-4"}>
          {busy ? tt("Saving") : tt("Save")}
        </button>
        {changed && (
          <button type="button" disabled={busy} onClick={() => setD(settings)} className={buttonClass}>
            {tt("Discard")}
          </button>
        )}
        <span role="status" className="text-[13px] text-white/55">
          {saved && !changed ? tt("Saved. The live blog shows it now.") : changed ? tt("Changes go live when you save.") : ""}
        </span>
      </div>
    </form>
  )
}
