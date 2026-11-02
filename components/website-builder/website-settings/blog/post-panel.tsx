"use client"

/**
 * Everything about a post that is not its words: the excerpt, the featured
 * image and its alt text, category, tags, author, featured, its address and
 * date, and the whole of what it says to search engines and on a shared
 * link, each drawn as it will look (the Google result, the share card). All
 * of it is saved with the draft, as the words are, and goes live on Publish
 * or Update.
 */
import * as React from "react"
import { ImageIcon, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { appTimeZone } from "@/lib/i18n/format"
import { isPostSlug } from "@/lib/site-blog/slug"
import { postPath } from "@/lib/site-blog/urls"
import type { AdminPost, SitePostMeta } from "@/lib/site-blog/types"
import { WbImagePicker } from "@/components/website-builder/editor/image-picker"
import { Counter, DarkScope, SearchResultPreview, Toggle, inputClass, textAreaClass } from "../parts"
import type { BlogOverview } from "./api"
import { cleanSlugInput, instantFromInputs, zonedInputs } from "./model"
import { SelectField } from "./ui"

export const SEO_TITLE_FITS = 60
export const SEO_DESCRIPTION_FITS = 160
export const EXCERPT_FITS = 300
const TAGS_MAX = 20

const field = cn(inputClass, "md:w-full")

function Section({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="space-y-4 border-b border-white/[0.07] px-5 py-5 last:border-b-0">
      <h3 className="text-[12px] font-semibold uppercase tracking-wider text-white/50">{title}</h3>
      {children}
    </section>
  )
}

function Field({ label, htmlFor, aside, hint, children }: { label: string; htmlFor?: string; aside?: React.ReactNode; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="flex items-baseline justify-between gap-3 text-[14px] font-medium text-white">
        {label}
        {aside}
      </label>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1.5 text-[12.5px] leading-snug text-white/50">{hint}</p>}
    </div>
  )
}

/** A tag as the post keeps it: its words, single spaced, at most 40 characters. */
export function tidyTag(raw: string): string {
  return raw.replace(/[,#]/g, " ").replace(/\s+/g, " ").trim().slice(0, 40)
}

export function addTags(tags: readonly string[], raw: string): string[] {
  const out = [...tags]
  for (const part of raw.split(",")) {
    const t = tidyTag(part)
    if (t && !out.some((x) => x.toLowerCase() === t.toLowerCase()) && out.length < TAGS_MAX) out.push(t)
  }
  return out
}

function TagsField({ id, value, suggestions, onChange }: { id: string; value: string[]; suggestions: string[]; onChange: (tags: string[]) => void }) {
  const [text, setText] = React.useState("")
  const listId = `${id}-list`
  const commit = () => {
    if (!text.trim()) return
    onChange(addTags(value, text))
    setText("")
  }
  return (
    <div className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-lg border border-white/12 bg-[#171717] px-2 py-1.5 focus-within:border-white/35 md:min-h-10">
      {value.map((t) => (
        <span key={t} className="inline-flex h-7 items-center gap-1 rounded-md bg-white/[0.08] pl-2 pr-1 text-[13px] text-white/85">
          {t}
          <button type="button" onClick={() => onChange(value.filter((x) => x !== t))} aria-label={tt("Remove tag {tag}", { tag: t })} className="grid h-5 w-5 place-items-center rounded text-white/50 hover:bg-white/[0.1] hover:text-white">
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        id={id}
        value={text}
        list={listId}
        onChange={(e) => {
          if (e.target.value.endsWith(",")) {
            onChange(addTags(value, e.target.value))
            setText("")
          } else setText(e.target.value)
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            commit()
          } else if (e.key === "Backspace" && !text && value.length) onChange(value.slice(0, -1))
        }}
        onBlur={commit}
        placeholder={value.length ? "" : tt("Add a tag and press Enter")}
        disabled={value.length >= TAGS_MAX}
        className="h-7 min-w-[120px] flex-1 bg-transparent px-1 text-[16px] text-white outline-none placeholder:text-white/30 md:text-[14px]"
      />
      <datalist id={listId}>
        {suggestions
          .filter((s) => !value.some((v) => v.toLowerCase() === s.toLowerCase()))
          .slice(0, 50)
          .map((s) => (
            <option key={s} value={s} />
          ))}
      </datalist>
    </div>
  )
}

/** A link to the post as a social app draws it: the picture, the site, the title and a line. */
export function ShareCard({ image, domain, title, description }: { image: string; domain: string; title: string; description: string }) {
  const [broken, setBroken] = React.useState<string | null>(null)
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-[#171717]" data-share-card="" aria-label={tt("Shared link preview")}>
      {image && broken !== image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" onError={() => setBroken(image)} className="aspect-[1.91/1] w-full bg-black/40 object-cover" />
      ) : (
        <div className="grid aspect-[1.91/1] w-full place-items-center bg-white/[0.04]">
          <ImageIcon aria-hidden className="h-6 w-6 text-white/25" />
        </div>
      )}
      <div className="border-t border-white/[0.07] px-3.5 py-2.5">
        <p className="truncate text-[11.5px] uppercase tracking-wide text-white/45">{domain}</p>
        <p className="mt-0.5 truncate text-[14.5px] font-semibold text-white">{title}</p>
        {description && <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-white/55">{description}</p>}
      </div>
    </div>
  )
}

export const PostPanel = React.memo(function PostPanel({
  meta,
  set,
  post,
  overview,
  siteName,
  words,
  minutes,
  onSlugTouched,
}: {
  meta: SitePostMeta
  set: (patch: Partial<SitePostMeta>) => void
  post: AdminPost
  overview: BlogOverview
  siteName: string
  words: number
  minutes: number
  onSlugTouched: () => void
}) {
  const id = React.useId()
  const domain = overview.liveBase.replace(/^https?:\/\//, "").replace(/\/$/, "")
  const handle = overview.settings.handle
  const slugOk = isPostSlug(meta.slug)
  const address = `${domain}${postPath(handle, meta.slug || "…")}`
  const searchTitle = meta.seoTitle.trim() || `${meta.title.trim() || tt("Untitled")} | ${siteName}`
  const searchDescription = meta.seoDescription.trim() || meta.excerpt.trim() || tt("A post on {name}'s blog.", { name: siteName })
  const shareImage = meta.ogImageUrl || meta.coverImageUrl || overview.settings.ogImageUrl
  const zone = appTimeZone()
  const date = meta.publishedAt ? zonedInputs(meta.publishedAt, zone) : { date: "", time: "" }
  const slugMoves = Boolean(post.liveSlug) && meta.slug !== post.liveSlug && slugOk

  return (
    <div data-post-panel="">
      <Section title={tt("Post")}>
        <Field label={tt("Excerpt")} htmlFor={`${id}-ex`} aside={<Counter value={meta.excerpt} max={EXCERPT_FITS} />} hint={tt("A line or two under the title on the blog page. Left empty, the post's first words are used.")}>
          <textarea id={`${id}-ex`} value={meta.excerpt} rows={3} maxLength={500} onChange={(e) => set({ excerpt: e.target.value })} className={cn(textAreaClass, "leading-snug")} />
        </Field>
        <div>
          <p className="text-[14px] font-medium text-white">{tt("Featured image")}</p>
          <DarkScope className="mt-1.5">
            <WbImagePicker value={meta.coverImageUrl || undefined} onChange={(url) => set({ coverImageUrl: url ?? "", ...(url ? {} : { coverAlt: "" }) })} folder="blog" aspectRatio="video" />
          </DarkScope>
        </div>
        {meta.coverImageUrl && (
          <Field label={tt("Image alt text")} htmlFor={`${id}-alt`} hint={!meta.coverAlt.trim() ? <span className="text-amber-200">{tt("Describe the picture for screen readers and image search.")}</span> : undefined}>
            <input id={`${id}-alt`} value={meta.coverAlt} maxLength={200} onChange={(e) => set({ coverAlt: e.target.value })} placeholder={tt("What the picture shows")} className={field} />
          </Field>
        )}
        <Field label={tt("Category")} htmlFor={`${id}-cat`}>
          <SelectField id={`${id}-cat`} label={tt("Category")} value={meta.categoryId ?? ""} onChange={(v) => set({ categoryId: v || null })} className="w-full">
            <option value="">{tt("No category")}</option>
            {overview.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectField>
        </Field>
        <Field label={tt("Tags")} htmlFor={`${id}-tags`}>
          <TagsField id={`${id}-tags`} value={meta.tags} suggestions={overview.tags} onChange={(tags) => set({ tags })} />
        </Field>
        <Field label={tt("Author")} htmlFor={`${id}-au`} hint={overview.authors.length ? undefined : tt("Add authors in Blog settings, under Authors.")}>
          <SelectField id={`${id}-au`} label={tt("Author")} value={meta.authorId ?? ""} onChange={(v) => set({ authorId: v || null })} className="w-full">
            <option value="">{tt("No author")}</option>
            {overview.authors.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </SelectField>
        </Field>
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[14px] font-medium text-white">{tt("Featured")}</p>
            <p className="mt-0.5 text-[12.5px] leading-snug text-white/50">{tt("Shown first wherever the blog shows featured posts.")}</p>
          </div>
          <Toggle checked={meta.featured} onChange={(featured) => set({ featured })} label={tt("Featured")} />
        </div>
      </Section>

      <Section title={tt("Address and date")}>
        <Field
          label={tt("Address")}
          htmlFor={`${id}-slug`}
          hint={
            !slugOk ? (
              <span className="text-amber-200">{meta.slug ? tt("This address is taken by the blog itself. Choose another.") : tt("Give the post an address.")}</span>
            ) : slugMoves ? (
              <span className="text-amber-200">{tt("After you update, the old address sends visitors here.")}</span>
            ) : (
              <span className="break-all">{address}</span>
            )
          }
        >
          <input
            id={`${id}-slug`}
            value={meta.slug}
            maxLength={120}
            onChange={(e) => {
              onSlugTouched()
              set({ slug: cleanSlugInput(e.target.value) })
            }}
            onBlur={() => set({ slug: meta.slug.replace(/-+$/g, "") })}
            aria-invalid={!slugOk}
            spellCheck={false}
            className={field}
            data-blog-slug=""
          />
        </Field>
        {(post.status === "published" || post.firstPublishedAt) && post.status !== "scheduled" && (
          <Field label={tt("Publish date")} hint={tt("The date shown on the post, in {zone}. Change it to backdate a post.", { zone: zone.replace(/_/g, " ") })}>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <input
                type="date"
                aria-label={tt("Publish date")}
                value={date.date}
                onChange={(e) => {
                  const at = instantFromInputs(e.target.value, date.time || "09:00", zone)
                  if (at) set({ publishedAt: at.toISOString() })
                }}
                className={cn(field, "[color-scheme:dark]")}
              />
              <input
                type="time"
                aria-label={tt("Publish time")}
                value={date.time}
                onChange={(e) => {
                  const at = instantFromInputs(date.date, e.target.value, zone)
                  if (at) set({ publishedAt: at.toISOString() })
                }}
                className={cn(inputClass, "w-[116px] md:w-[116px] [color-scheme:dark]")}
              />
            </div>
          </Field>
        )}
        <p className="text-[12.5px] text-white/45">{tt("{words, plural, one {# word} other {# words}} · {minutes} min read", { words, minutes })}</p>
      </Section>

      <Section title={tt("Search engines")} id="post-seo">
        <SearchResultPreview compact address={address} title={searchTitle} description={searchDescription} />
        <Field label={tt("Search title")} htmlFor={`${id}-st`} aside={<Counter value={meta.seoTitle} max={SEO_TITLE_FITS} />}>
          <input id={`${id}-st`} value={meta.seoTitle} maxLength={120} onChange={(e) => set({ seoTitle: e.target.value })} placeholder={searchTitle} className={field} />
        </Field>
        <Field label={tt("Search description")} htmlFor={`${id}-sd`} aside={<Counter value={meta.seoDescription} max={SEO_DESCRIPTION_FITS} />}>
          <textarea id={`${id}-sd`} value={meta.seoDescription} rows={3} maxLength={320} onChange={(e) => set({ seoDescription: e.target.value })} placeholder={meta.excerpt.trim() || undefined} className={cn(textAreaClass, "leading-snug")} />
        </Field>
        <Field label={tt("Canonical address")} htmlFor={`${id}-can`} hint={tt("Only when this post first appeared on another website. Left empty, it is this post's own address.")}>
          <input id={`${id}-can`} type="url" inputMode="url" value={meta.canonicalUrl} maxLength={500} onChange={(e) => set({ canonicalUrl: e.target.value.trim() })} placeholder="https://" className={field} />
        </Field>
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[14px] font-medium text-white">{tt("Show in search engines")}</p>
            <p className="mt-0.5 text-[12.5px] leading-snug text-white/50">{tt("Off keeps this post out of Google and out of your sitemap.")}</p>
          </div>
          <Toggle checked={!meta.noindex} onChange={(on) => set({ noindex: !on })} label={tt("Show in search engines")} />
        </div>
      </Section>

      <Section title={tt("Social sharing")}>
        <ShareCard image={shareImage} domain={domain} title={meta.ogTitle.trim() || meta.seoTitle.trim() || meta.title.trim() || tt("Untitled")} description={meta.ogDescription.trim() || searchDescription} />
        <Field label={tt("Social title")} htmlFor={`${id}-ot`}>
          <input id={`${id}-ot`} value={meta.ogTitle} maxLength={120} onChange={(e) => set({ ogTitle: e.target.value })} placeholder={meta.seoTitle.trim() || meta.title.trim() || undefined} className={field} />
        </Field>
        <Field label={tt("Social description")} htmlFor={`${id}-od`}>
          <textarea id={`${id}-od`} value={meta.ogDescription} rows={2} maxLength={320} onChange={(e) => set({ ogDescription: e.target.value })} placeholder={searchDescription} className={cn(textAreaClass, "leading-snug")} />
        </Field>
        <div>
          <p className="text-[14px] font-medium text-white">{tt("Social image")}</p>
          <p className="mt-0.5 text-[12.5px] leading-snug text-white/50">{tt("Left empty, the featured image is used.")}</p>
          <DarkScope className="mt-2">
            <WbImagePicker value={meta.ogImageUrl || undefined} onChange={(url) => set({ ogImageUrl: url ?? "" })} layout="row" folder="blog" />
          </DarkScope>
        </div>
      </Section>
    </div>
  )
})
