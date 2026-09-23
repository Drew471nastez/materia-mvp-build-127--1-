"use client"

import { WbImagePicker } from "@/components/website-builder/editor/image-picker"
import { Card, Counter, GOES_LIVE, PageTitle, Row, Toggle, inputClass } from "./parts"
import type { SettingsContext } from "./types"

const str = (v: unknown) => (typeof v === "string" ? v : "")

/**
 * The same fallbacks the published site uses (app/(site)/w/[username]/
 * render-site.tsx, siteMetadata), so the preview is what a search result
 * will actually say rather than what the fields happen to hold.
 */
function previewOf(ctx: SettingsContext) {
  const handle = ctx.websiteUrlDisplay.split(".")[0] || "Storelib"
  const brand = str(ctx.settings.brand_name).trim() || handle
  return {
    title: str(ctx.settings.seo_title).trim() || `${handle} | Storelib`,
    description: str(ctx.settings.seo_description).trim() || `Visit ${brand}'s website on Storelib`,
  }
}

/** Indexing is on unless it was switched off, the way theme-metadata reads it. */
function indexable(v: unknown): boolean {
  if (v === false) return false
  if (typeof v === "string") return !/noindex/i.test(v)
  return true
}

export function SeoSettings({ ctx }: { ctx: SettingsContext }) {
  const title = str(ctx.settings.seo_title)
  const description = str(ctx.settings.seo_description)
  const image = str(ctx.settings.seo_og_image) || undefined
  const card = str(ctx.settings.seo_twitter_card) || "summary_large_image"
  const listed = indexable(ctx.settings.seo_robots)
  const preview = previewOf(ctx)

  return (
    <>
      <PageTitle>SEO & Social</PageTitle>

      {/* What a search result looks like, drawn from the same fallbacks the
          live page uses. Light, because a search results page is. */}
      <div className="mt-6 rounded-2xl bg-white p-5 text-left md:p-6" aria-label="Search result preview">
        <p className="truncate text-[13px] text-[#4d5156]">{ctx.websiteUrlDisplay || "yourname.storelib.com"}</p>
        <p className="mt-1 truncate text-[19px] leading-snug text-[#1a0dab]">{preview.title}</p>
        <p className="mt-1 line-clamp-2 text-[13.5px] leading-snug text-[#4d5156]">{preview.description}</p>
      </div>

      <Card footer={GOES_LIVE}>
        <Row label="Site title" hint="The first line of a search result and the browser tab on your home page." stack htmlFor="wb-seo-title">
          <div className="flex flex-col gap-1.5">
            <input
              id="wb-seo-title"
              value={title}
              maxLength={120}
              placeholder={preview.title}
              onChange={(e) => ctx.onSettingChange("seo_title", e.target.value)}
              className={inputClass + " md:w-full"}
            />
            <Counter value={title} max={60} />
          </div>
        </Row>
        <Row label="Meta description" hint="The line under the title. One or two sentences about what you sell." stack htmlFor="wb-seo-description">
          <div className="flex flex-col gap-1.5">
            <textarea
              id="wb-seo-description"
              value={description}
              maxLength={320}
              rows={3}
              placeholder={preview.description}
              onChange={(e) => ctx.onSettingChange("seo_description", e.target.value)}
              className="w-full resize-none rounded-lg border border-white/12 bg-[#171717] px-3.5 py-2.5 text-[14.5px] leading-relaxed text-white outline-none transition-colors duration-150 placeholder:text-white/30 focus:border-white/35"
            />
            <Counter value={description} max={160} />
          </div>
        </Row>
        <Row label="Social image" hint="Shown when a link to your website is shared. 1200 × 630 works everywhere." stack>
          <div className="dark max-w-[360px]">
            <WbImagePicker value={image} onChange={(url) => ctx.onSettingChange("seo_og_image", url ?? "")} aspectRatio="video" folder="logos" />
          </div>
        </Row>
        <Row label="Share card" htmlFor="wb-seo-card">
          <select
            id="wb-seo-card"
            value={card}
            onChange={(e) => ctx.onSettingChange("seo_twitter_card", e.target.value)}
            className={inputClass}
          >
            <option value="summary_large_image">Large image</option>
            <option value="summary">Small image</option>
          </select>
        </Row>
        <Row
          label="Search engines"
          hint={listed ? "Google and others may list this website." : "Search engines are asked not to list this website."}
        >
          <Toggle checked={listed} onChange={(on) => ctx.onSettingChange("seo_robots", on)} label="Let search engines list this website" />
        </Row>
      </Card>
    </>
  )
}
