"use client"

import { useState } from "react"
import { WbImagePicker } from "@/components/website-builder/editor/image-picker"
import { Card, Counter, GOES_LIVE, PageTitle, Row, Toggle, inputClass, textAreaClass } from "./parts"
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
  const listed = indexable(ctx.settings.seo_robots)
  const preview = previewOf(ctx)

  return (
    <>
      <PageTitle>SEO & Social</PageTitle>

      {/* What a search result looks like, drawn from the same fallbacks the
          live page uses. Light, because a search results page is. */}
      <div className="mt-5 rounded-2xl bg-white p-4 text-left md:mt-6 md:p-6" aria-label="Search result preview">
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
              className={textAreaClass}
            />
            <Counter value={description} max={160} />
          </div>
        </Row>
        {/*
          WHAT A SHARED LINK LOOKS LIKE. The picture on top, then the address,
          title and description, the way Messages, WhatsApp and X draw a
          link. "Share card" (large or small picture) is gone: every network
          that matters draws the large one, and a choice nobody can judge
          from here is a choice to remove. A value saved before still reads
          (theme-metadata.ts).
        */}
        <Row label="Social image" hint="Shown when a link to your website is shared. 1200 × 630 works everywhere." stack>
          <div className="flex max-w-[420px] flex-col gap-3">
            <SharePreview image={image} title={preview.title} description={preview.description} address={ctx.websiteUrlDisplay} />
            <div className="dark">
              <WbImagePicker value={image} onChange={(url) => ctx.onSettingChange("seo_og_image", url ?? "")} layout="row" folder="logos" />
            </div>
          </div>
        </Row>
        <Row
          label="Search engines"
          hint={listed ? "Google and others may list this website." : "Search engines are asked not to list this website."}
          inline
        >
          <Toggle checked={listed} onChange={(on) => ctx.onSettingChange("seo_robots", on)} label="Let search engines list this website" />
        </Row>
      </Card>
    </>
  )
}

/**
 * A link as a messaging app draws it. Without a picture of its own the live
 * site sends the logo, a hero picture or the creator's avatar
 * (render-site.tsx), so the empty box says that rather than looking broken.
 */
function SharePreview({ image, title, description, address }: { image?: string; title: string; description: string; address: string }) {
  const [failed, setFailed] = useState<string | null>(null)
  const shown = image && failed !== image ? image : null
  return (
    <div className="overflow-hidden rounded-2xl bg-white text-left" aria-label="Shared link preview">
      <div className="relative aspect-[1200/630] w-full bg-[#f1f2f4]">
        {shown ? (
          <img src={shown} alt="" className="absolute inset-0 h-full w-full object-cover" onError={() => setFailed(shown)} />
        ) : (
          <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-[12.5px] text-[#6b7280]">
            No picture yet. Your logo or first hero picture is used instead.
          </p>
        )}
      </div>
      <div className="border-t border-black/[0.06] px-4 py-3">
        <p className="truncate text-[11.5px] uppercase tracking-wide text-[#6b7280]">{address || "yourname.storelib.com"}</p>
        <p className="mt-0.5 truncate text-[14px] font-semibold text-[#1a1a2e]">{title}</p>
        <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-[#6b7280]">{description}</p>
      </div>
    </div>
  )
}
